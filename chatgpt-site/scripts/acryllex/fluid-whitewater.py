#!/usr/bin/env python3
"""Advect an editable initial whitewater state through a baked liquid velocity field.

This is a secondary-particle model, not another liquid solver. The water mesh is
unchanged. Initial foam is sampled on actual 3D mesh regions, then transported
with the solved velocity, retained on nearby liquid surfaces, or allowed to fall
ballistically after detachment. No image, camera or pixel mask is an input.

Requires NumPy (included in Blender). Run with Python or Blender's Python:
  python fluid-whitewater.py --self-test
  Blender -b --python fluid-whitewater.py -- --cache <manifest.json> \
    --velocity <auxiliary/velocity-grid.json> --recipe <foam.json> --output <dir>

The raw Blender adapter follows Blender 4.5's RNA XYZ interleave, X-fast cell
indexing and staggered MAC locations. fluid_script.h uses a Mantaflow frame
length of .1*25/fps*timeScale, so raw velocities convert to metres/physical
second by cellLength*2.5. Calibration evidence belongs with each bake pipeline;
raw FLIP particle.velocity is not assumed to have these same units.
"""

from collections import OrderedDict
import argparse
import bisect
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import sys
import tempfile

import numpy as np

MAGIC = 0x31464341


def finite_array(value, shape=None, label="value"):
    result = np.asarray(value, dtype=np.float64)
    if not np.isfinite(result).all() or (shape is not None and result.shape != shape):
        raise ValueError(f"Invalid {label}: expected finite {shape or 'array'}")
    return result


class VelocityGrid:
    """Trilinear vector field with explicit units, space and component locations.

    Values are shaped [z,y,x,component]. Public points/vectors are Y-up metres.
    scale converts each stored component to metres per physical second. A
    staggered component lies at its own axis's cell face and other axes' centres.
    Out-of-domain samples return zero, rather than extending boundary velocities.
    """

    def __init__(self, values, resolution, bounds, scale, blender_space=False, staggered=False):
        self.resolution = np.asarray(resolution, dtype=np.int64)
        self.bounds = finite_array(bounds, (6,), "grid bounds")
        self.scale = np.broadcast_to(finite_array(scale, label="velocity scale"), (3,)).copy()
        if self.resolution.shape != (3,) or np.min(self.resolution) < 2 or np.min(self.scale) <= 0:
            raise ValueError("Grid resolution must be >=2 and velocity scale must be positive")
        self.cell = (self.bounds[3:] - self.bounds[:3]) / self.resolution
        if np.min(self.cell) <= 0:
            raise ValueError("Grid bounds must have positive extent")
        nx, ny, nz = self.resolution
        self.values = np.asarray(values, dtype=np.float32).reshape(int(nz), int(ny), int(nx), 3)
        if not np.isfinite(self.values).all():
            raise ValueError("Velocity grid contains a non-finite value")
        self.blender_space, self.staggered = blender_space, staggered

    def sample(self, points):
        public = finite_array(points, label="sample positions")
        single = public.ndim == 1
        p = public.reshape(-1, 3).copy()
        if self.blender_space:
            p = p[:, [0, 2, 1]] * [1, -1, 1]
        inside = np.all((p >= self.bounds[:3]) & (p <= self.bounds[3:]), axis=1)
        result = np.zeros((len(p), 3), dtype=np.float64)
        for component in range(3):
            offset = np.full(3, .5)
            if self.staggered:
                offset[component] = 0
            uv = (p - self.bounds[:3]) / self.cell - offset
            low = np.floor(uv).astype(np.int64)
            fraction = uv - low
            for z in (0, 1):
                for y in (0, 1):
                    for x in (0, 1):
                        bit = np.asarray([x, y, z])
                        index = np.clip(low + bit, 0, self.resolution - 1)
                        weight = np.prod(np.where(bit, fraction, 1 - fraction), axis=1)
                        result[:, component] += self.values[index[:, 2], index[:, 1], index[:, 0], component] * weight
        result *= self.scale
        result[~inside] = 0
        if self.blender_space:
            result = result[:, [0, 2, 1]] * [1, 1, -1]
        return result[0] if single else result


class BlenderVelocitySequence:
    """Two-frame bounded-memory sampler over the auxiliary evaluated-grid export."""

    def __init__(self, manifest):
        self.path = Path(manifest).resolve()
        self.data = json.loads(self.path.read_text())
        if self.data.get("format") != "blender-evaluated-liquid-velocity-grid-raw-v1":
            raise ValueError("Unsupported Blender velocity manifest")
        self.frames = self.data["frames"]
        self.times = [float(f["physicalTimeSeconds"]) for f in self.frames]
        if not self.times or not all(math.isfinite(t) for t in self.times) or any(b <= a for a, b in zip(self.times, self.times[1:])):
            raise ValueError("Velocity frames must have increasing finite physical times")
        self.loaded = OrderedDict()

    def grid(self, index):
        if index not in self.loaded:
            frame = self.frames[index]
            relative = Path(frame["gridFile"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Velocity grid path must stay inside the manifest directory")
            values = np.fromfile(self.path.parent / relative, dtype="<f4")
            if len(values) != frame["floatCount"]:
                raise ValueError("Truncated velocity grid")
            bounds = self.data["domainBoundsBlenderXYZ"]
            resolution = frame["resolutionBlenderXYZ"]
            # Manta's scale uses the domain's maximum length / maximum resolution.
            cell_length = max(np.asarray(bounds[3:]) - bounds[:3]) / max(resolution)
            self.loaded[index] = VelocityGrid(values, resolution, bounds, cell_length * 2.5, True, True)
        self.loaded.move_to_end(index)
        while len(self.loaded) > 2:
            self.loaded.popitem(last=False)
        return self.loaded[index]

    def sample(self, points, time):
        if not math.isfinite(time):
            raise ValueError("Velocity time must be finite")
        i = min(len(self.times) - 1, max(0, bisect.bisect_right(self.times, time) - 1))
        a = self.grid(i).sample(points)
        if i == len(self.times) - 1 or time <= self.times[i]:
            return a
        k = min(1, (time - self.times[i]) / (self.times[i + 1] - self.times[i]))
        return a * (1 - k) + self.grid(i + 1).sample(points) * k


def region_weight(points, normals, region):
    """Physical ellipsoid or swept-polyline region; independent of camera/UVs."""
    scale = finite_array(region.get("radii", [1, 1, 1]), (3,), "region radii")
    if np.min(scale) <= 0:
        raise ValueError("Region radii must be positive")
    if "path" in region:
        path = finite_array(region["path"], label="region path")
        if path.ndim != 2 or path.shape[1] != 3 or len(path) < 2:
            raise ValueError("Region path needs at least two 3D points")
        p = points / scale
        best = np.full(len(points), np.inf)
        for a, b in zip(path[:-1] / scale, path[1:] / scale):
            segment = b - a
            k = np.clip(np.sum((p - a) * segment, axis=1) / max(1e-15, np.sum(segment * segment)), 0, 1)
            best = np.minimum(best, np.sum((p - a - k[:, None] * segment) ** 2, axis=1))
        distance2 = best
    else:
        center = finite_array(region.get("center", [0, 0, 0]), (3,), "region center")
        distance2 = np.sum(((points - center) / scale) ** 2, axis=1)
    falloff = float(region.get("falloff", .5))
    if not math.isfinite(falloff) or falloff < 0:
        raise ValueError("Region falloff must be finite and nonnegative")
    weight = np.maximum(0, 1 - distance2) ** falloff
    if "normalAxis" in region:
        axis = finite_array(region["normalAxis"], (3,), "normal axis")
        axis /= max(1e-15, np.linalg.norm(axis))
        weight *= (np.sum(normals * axis, axis=1) >= float(region.get("minNormalDot", 0)))
    patchiness = float(region.get("patchiness", .5))
    patch_scale = float(region.get("patchScale", .3))
    if not 0 <= patchiness <= 1 or not math.isfinite(patch_scale) or patch_scale <= 0:
        raise ValueError("Patchiness must be0..1 and patchScale positive")
    phase = float(region.get("patchPhase", 0))
    q = points * (2 * math.pi / patch_scale)
    # Fixed spatial mottling of the initial air/foam state, subsequently advected.
    pattern = .5 + .5 * np.sin(np.sum(q * [1, .31, -.19], axis=1) + phase) * np.sin(np.sum(q * [.17, -.43, .89], axis=1) + phase * 1.73)
    return weight * ((1 - patchiness) + patchiness * pattern ** 2)


class FoamState:
    def __init__(self, positions, radii, ages, lifetimes):
        self.positions = finite_array(positions, label="foam positions").reshape(-1, 3)
        n = len(self.positions)
        self.radii = finite_array(radii, (n,), "foam radii")
        self.ages = finite_array(ages, (n,), "foam ages")
        self.lifetimes = finite_array(lifetimes, (n,), "foam lifetimes")
        if n > 100000 or np.min(self.radii, initial=1) <= 0 or np.min(self.lifetimes, initial=1) <= 0 or np.min(self.ages, initial=0) < 0:
            raise ValueError("Invalid foam capacity/radii/lifetimes/ages")
        self.velocities = np.zeros((n, 3), dtype=np.float64)
        self.spray = np.zeros(n, dtype=bool)

    def visible(self, fade=.25):
        remaining = np.clip((self.lifetimes - self.ages) / max(1e-8, fade), 0, 1)
        mask = remaining > 0
        return np.column_stack((self.positions[mask], self.radii[mask] * remaining[mask]))

    def advance(self, velocity, time, dt, projector=None, surface_distance=.3, normal_offset=.4, buoyancy=0, max_step=.01, gravity=9.81):
        if not all(math.isfinite(v) for v in (time, dt, surface_distance, normal_offset, buoyancy, max_step, gravity)) or dt < 0 or max_step <= 0 or surface_distance < 0:
            raise ValueError("Invalid foam integration parameters")
        if dt == 0:
            return
        steps = max(1, math.ceil(dt / max_step))
        if steps > 1000:
            raise ValueError("Foam integration would exceed1000substeps")
        h = dt / steps
        for step in range(steps):
            t = time + step * h
            alive = self.ages < self.lifetimes
            attached = np.flatnonzero(alive & ~self.spray)
            if len(attached):
                p = self.positions[attached]
                a = finite_array(velocity(p, t), p.shape, "sampled velocity")
                a[:, 1] += buoyancy
                b = finite_array(velocity(p + a * (.5 * h), t + .5 * h), p.shape, "midpoint velocity")
                b[:, 1] += buoyancy
                self.positions[attached] += b * h
                self.velocities[attached] = b
            detached = np.flatnonzero(alive & self.spray)
            if len(detached):
                self.positions[detached] += self.velocities[detached] * h
                self.positions[detached, 1] -= .5 * gravity * h * h
                self.velocities[detached, 1] -= gravity * h
            self.ages[alive] += h
        # The supplied geometry is the next cached mesh, so constrain once at
        # the interval end rather than teleporting to that future surface at
        # every velocity-integration substep.
        if projector is not None:
            ids = np.flatnonzero(alive)
            nearest, normals, distances = projector(self.positions[ids], time + dt)
            nearest = finite_array(nearest, (len(ids), 3), "projected positions")
            normals = finite_array(normals, (len(ids), 3), "projected normals")
            distances = finite_array(distances, (len(ids),), "surface distances")
            keep = distances <= surface_distance
            airborne = self.spray[ids]
            # An airborne droplet only lands when close and travelling into the
            # surface. An outgoing droplet must not snap back onto the next mesh.
            incoming = np.sum(self.velocities[ids] * normals, axis=1) <= 0
            landing = (distances <= np.maximum(.02, self.radii[ids] * 1.5)) & incoming
            keep[airborne] = landing[airborne]
            # Far particles leave the surface with their last solved velocity.
            self.spray[ids[~keep]] = True
            retained = ids[keep]
            self.positions[retained] = nearest[keep] + normals[keep] * (self.radii[retained] * normal_offset)[:, None]
            self.spray[retained] = False


def seed_surface(positions, indices, regions, seed=1701):
    positions = finite_array(positions, label="surface positions").reshape(-1, 3)
    indices = np.asarray(indices, dtype=np.int64).reshape(-1, 3)
    if not len(indices) or np.min(indices) < 0 or np.max(indices) >= len(positions):
        raise ValueError("Surface needs valid triangles")
    triangle = positions[indices]
    cross = np.cross(triangle[:, 1] - triangle[:, 0], triangle[:, 2] - triangle[:, 0])
    length = np.linalg.norm(cross, axis=1)
    normals = cross / np.maximum(1e-15, length[:, None])
    centers = np.mean(triangle, axis=1)
    rng = np.random.default_rng(int(seed))
    all_p, all_r, all_age, all_life, all_velocity, all_spray = [], [], [], [], [], []
    if sum(int(r.get("count", 0)) for r in regions) > 100000:
        raise ValueError("Initial foam capacity exceeds100000")
    for region in regions:
        count = int(region.get("count", 0))
        if count < 0:
            raise ValueError("Foam count must be nonnegative")
        if count == 0:
            continue
        weights = length * region_weight(centers, normals, region)
        total = float(np.sum(weights))
        if total <= 1e-12:
            raise ValueError("A whitewater region does not intersect the actual liquid surface")
        choice = rng.choice(len(indices), size=count, p=weights / total)
        uv = rng.random((count, 2))
        uv[uv.sum(axis=1) > 1] = 1 - uv[uv.sum(axis=1) > 1]
        selected = triangle[choice]
        p = selected[:, 0] + uv[:, 0:1] * (selected[:, 1] - selected[:, 0]) + uv[:, 1:2] * (selected[:, 2] - selected[:, 0])
        radius = region.get("radius", [.015, .035])
        life = region.get("lifetime", [2, 4])
        if len(radius) != 2 or len(life) != 2 or not 0 < radius[0] <= radius[1] or not 0 < life[0] <= life[1]:
            raise ValueError("Initial foam radius/lifetime must be positive ordered pairs")
        r = rng.uniform(*radius, size=count)
        lifetime = rng.uniform(*life, size=count)
        age_fraction = float(region.get("maxInitialAgeFraction", .35))
        if not 0 <= age_fraction < 1:
            raise ValueError("maxInitialAgeFraction must be0..<1")
        age = rng.random(count) * lifetime * age_fraction
        p += normals[choice] * (r * float(region.get("normalOffset", .4)))[:, None]
        mode = region.get("mode", "foam")
        if mode not in ("foam", "spray"):
            raise ValueError("Initial whitewater mode must be foam or spray")
        velocity = np.zeros_like(p)
        if mode == "spray":
            # A legitimate editable initial airborne state, rather than random
            # new positions every frame. launchVelocity is an absolute Y-up m/s
            # initial condition; no undocumented FLIP particle units are used.
            velocity[:] = finite_array(region.get("launchVelocity", [0, 2, 0]), (3,), "spray launch velocity")
            normal_launch = float(region.get("normalLaunch", 0))
            flight_max = float(region.get("maxInitialFlightSeconds", .2))
            gravity = float(region.get("gravity", 9.81))
            if not all(math.isfinite(v) for v in (normal_launch, flight_max, gravity)) or flight_max < 0:
                raise ValueError("Initial spray flight parameters must be finite")
            velocity += normals[choice] * normal_launch
            flight = rng.random(count) * np.minimum(flight_max, lifetime * .8)
            p += velocity * flight[:, None]
            p[:, 1] -= .5 * gravity * flight ** 2
            velocity[:, 1] -= gravity * flight
            age = np.maximum(age, flight)
        all_p.append(p); all_r.append(r); all_age.append(age); all_life.append(lifetime)
        all_velocity.append(velocity); all_spray.append(np.full(count, mode == "spray", dtype=bool))
    if not all_p:
        return FoamState(np.empty((0, 3)), [], [], [])
    state = FoamState(np.concatenate(all_p), np.concatenate(all_r), np.concatenate(all_age), np.concatenate(all_life))
    state.velocities[:] = np.concatenate(all_velocity)
    state.spray[:] = np.concatenate(all_spray)
    return state


def read_acf1(path):
    data = Path(path).read_bytes()
    magic, n, k, f = struct.unpack_from("<4I", data)
    end = 16 + n * 24 + k * 4
    if magic != MAGIC or len(data) != end + f * 16:
        raise ValueError("Invalid ACF1 frame")
    p = np.frombuffer(data, "<f4", n * 3, 16).reshape(-1, 3)
    indices = np.frombuffer(data, "<u4", k, 16 + n * 24).reshape(-1, 3)
    foam = np.frombuffer(data, "<f4", f * 4, end).reshape(-1, 4)
    return data, p, indices, foam, end


def blender_projector(positions, indices):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons(positions.tolist(), indices.tolist(), all_triangles=True)

    def project(points, _time):
        nearest = np.empty_like(points); normals = np.empty_like(points); distances = np.empty(len(points))
        for i, p in enumerate(points):
            hit, normal, _index, distance = tree.find_nearest(Vector(p))
            if hit is None:
                raise ValueError("Unable to project foam onto liquid surface")
            nearest[i] = hit; normals[i] = normal; distances[i] = distance
        return nearest, normals, distances
    return project


def build_whitewater_cache(cache_path, velocity_path, recipe, output):
    cache_path, output = Path(cache_path).resolve(), Path(output).resolve()
    if output == cache_path.parent or output.exists() and any(output.iterdir()):
        raise ValueError("Whitewater output must be a new/empty directory")
    manifest = json.loads(cache_path.read_text())
    sequence = BlenderVelocitySequence(velocity_path)
    if manifest.get("format") != "acryllex-fluid-cache-v1" or len(manifest["frames"]) != len(sequence.frames):
        raise ValueError("Mesh and velocity frame sequences must align")
    if "fps" in sequence.data and not math.isclose(float(manifest["fps"]), float(sequence.data["fps"])):
        raise ValueError("Mesh and velocity playback frame rates differ")
    if "sourceFrameStart" in manifest and "sourceFrame" in sequence.frames[0] and manifest["sourceFrameStart"] != sequence.frames[0]["sourceFrame"]:
        raise ValueError("Mesh and velocity source-frame starts differ")
    output.mkdir(parents=True, exist_ok=True)
    requested_initial = recipe.get("initialFrame")
    if requested_initial is not None and not 0 <= int(requested_initial) < len(manifest["frames"]):
        raise ValueError("initialFrame must lie in the cache")
    # Inflows may legitimately start with an empty mesh. Their initial foam
    # state begins at the first actual surface, unless an explicit frame is set.
    initial_index, state = None, None
    frames, rows = [], []
    overall_lo, overall_hi = np.full(3, np.inf), np.full(3, -np.inf)
    for i, (frame, time) in enumerate(zip(manifest["frames"], sequence.times)):
        data, positions, indices, original, foam_offset = read_acf1(cache_path.parent / frame["file"])
        if state is None and len(indices) and (requested_initial is None or i >= int(requested_initial)):
            state = seed_surface(positions, indices, recipe["regions"], recipe.get("seed", 1701))
            initial_index = i
        if state is not None and i > initial_index:
            projector = blender_projector(positions, indices) if len(indices) and recipe.get("surfaceRetention", True) else None
            if not len(indices):
                state.spray[:] = True
            state.advance(sequence.sample, sequence.times[i - 1], time - sequence.times[i - 1], projector,
                          surface_distance=float(recipe.get("surfaceDistance", .3)),
                          buoyancy=float(recipe.get("buoyancy", 0)), max_step=float(recipe.get("maxStep", .01)),
                          normal_offset=float(recipe.get("normalOffset", .4)), gravity=float(recipe.get("gravity", 9.81)))
        generated = state.visible(float(recipe.get("fadeSeconds", .25))) if state is not None else np.empty((0, 4))
        foam = np.concatenate((original, generated)) if recipe.get("preserveSolverSecondary", True) else generated
        if len(foam) > 500000:
            raise ValueError("Final foam exceeds ACF1 importer particle budget")
        body = bytearray(data[:foam_offset])
        struct.pack_into("<I", body, 12, len(foam))
        body.extend(foam.astype("<f4").tobytes())
        name = f"frame{i:04d}.bin"
        (output / name).write_bytes(body)
        lo = np.min(positions, axis=0) if len(positions) else np.zeros(3)
        hi = np.max(positions, axis=0) if len(positions) else np.zeros(3)
        if len(foam):
            lo = np.minimum(lo, np.min(foam[:, :3] - foam[:, 3:4], axis=0))
            hi = np.maximum(hi, np.max(foam[:, :3] + foam[:, 3:4], axis=0))
        overall_lo = np.minimum(overall_lo, lo); overall_hi = np.maximum(overall_hi, hi)
        frames.append({"file": name, "bounds": np.concatenate((lo, hi)).tolist()})
        rows.append({"frame": i, "physicalTime": time, "initialFoamAlive": len(generated), "solverSecondary": len(original),
                     "spray": int(np.count_nonzero(state.spray & (state.ages < state.lifetimes))) if state is not None else 0,
                     "unchangedMeshSHA256": hashlib.sha256(data[16:foam_offset]).hexdigest(),
                     "trackedFirstPositions": state.positions[:8].tolist() if state is not None else [], "bytes": len(body)})
    updated = dict(manifest, frames=frames, bounds=np.concatenate((overall_lo, overall_hi)).tolist())
    updated["whitewater"] = {"model": "initial-surface-foam/solved-velocity-RK2/ballistic-detachment", "recipe": "whitewater-recipe.json",
                              "source": "Editable physical3D initial foam regions; actual evaluated liquid velocity grids",
                              "notMantaflowSecondaryEmission": True, "visualQualityAccepted": False}
    for name in ["recipe.json"] + [p.name for p in cache_path.parent.glob("input*.obj")]:
        if (cache_path.parent / name).exists():
            shutil.copyfile(cache_path.parent / name, output / name)
    (output / "manifest.json").write_text(json.dumps(updated, indent=2) + "\n")
    (output / "whitewater-recipe.json").write_text(json.dumps(recipe, indent=2) + "\n")
    (output / "whitewater-report.json").write_text(json.dumps({"frames": rows, "initialFrame": initial_index, "visualQualityAccepted": False,
        "workflowSHA256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "velocityManifestSHA256": hashlib.sha256(sequence.path.read_bytes()).hexdigest(),
        "limitations": ["Secondary foam transport model, not a new liquid or air-entrainment solve", "Nearest-surface retention approximates foam buoyancy", "Grid times are physical seconds; cached playback retains source fps", "Source realism must be assessed separately"]}, indent=2) + "\n")
    return updated


def self_test():
    checks = []
    def passed(name):
        checks.append(name)
    res = [9, 7, 8]; bounds = [0, 0, 0, 9, 7, 8]
    z, y, x = np.indices((8, 7, 9), dtype=float)
    values = np.stack((x, y * 2, z * 3), axis=-1)
    grid = VelocityGrid(values, res, bounds, 1, staggered=True)
    np.testing.assert_allclose(grid.sample([3.2, 2.6, 4.4]), [3.2, 5.2, 13.2], atol=1e-6)
    passed("X-fast XYZ-interleaved staggered trilinear affine field")
    np.testing.assert_array_equal(grid.sample([-1, 2, 3]), [0, 0, 0])
    passed("Outside grid does not extend artificial boundary flow")
    constant = np.zeros((8, 7, 9, 3)); constant[:] = [2, -3, 4]
    world = VelocityGrid(constant, res, bounds, .5, blender_space=True, staggered=True)
    np.testing.assert_allclose(world.sample([3, 4, -2]), [1, 2, 1.5])
    passed("Blender Z-up vectors and explicit velocity units convert to Y-up metres")
    foam = FoamState([[.1, .2, .3]], [.02], [0], [10])
    foam.advance(lambda p, t: np.broadcast_to([1, -.5, 2], p.shape).copy(), 0, .6)
    np.testing.assert_allclose(foam.positions, [[.7, -.1, 1.5]], atol=1e-12)
    passed("Constant solved flow gives exact metre/time displacement")
    foam = FoamState([[0, 0, 0]], [.02], [0], [10])
    foam.advance(lambda p, t: np.broadcast_to([2*t, 0, 0], p.shape).copy(), 0, .7, max_step=.07)
    np.testing.assert_allclose(foam.positions, [[.49, 0, 0]], atol=1e-12)
    passed("Time-varying linear acceleration uses physical midpoint time")
    errors = []
    for step in [.1, .025]:
        foam = FoamState([[1, 0, 0]], [.02], [0], [10])
        foam.advance(lambda p, t: np.column_stack((-p[:, 1], p[:, 0], p[:, 2]*0)), 0, 1, max_step=step)
        errors.append(np.linalg.norm(foam.positions[0] - [math.cos(1), math.sin(1), 0]))
    assert errors[1] < errors[0] / 12
    passed("Rotating flow shows second-order integration convergence")
    foam = FoamState([[0, 1, 0]], [.02], [0], [10]); foam.spray[:] = True
    foam.velocities[:] = [1, 2, 0]
    foam.advance(lambda p, t: p*0, 0, .5)
    np.testing.assert_allclose(foam.positions, [[.5, 2 - 9.81*.125, 0]], atol=1e-12)
    passed("Detached spray follows gravity with inherited velocity")
    def plane(points, t):
        p = points.copy(); p[:, 1] = 0
        return p, np.broadcast_to([0, 1, 0], p.shape), np.abs(points[:, 1])
    foam = FoamState([[0, .02, 0]], [.05], [0], [10])
    foam.advance(lambda p, t: np.broadcast_to([1, -.2, 0], p.shape).copy(), 0, .1, plane)
    np.testing.assert_allclose(foam.positions, [[.1, .02, 0]], atol=1e-12)
    passed("Foam remains on the actual surface with a radius-relative offset")
    spray = FoamState([[0, .03, 0]], [.01], [0], [10]); spray.spray[:] = True
    spray.velocities[:] = [0, 1, 0]
    spray.advance(lambda p, t: p*0, 0, .02, plane, gravity=0)
    np.testing.assert_allclose(spray.positions, [[0, .05, 0]], atol=1e-12); assert spray.spray[0]
    spray.velocities[:] = [0, -2, 0]
    spray.advance(lambda p, t: p*0, .02, .02, plane, gravity=0)
    np.testing.assert_allclose(spray.positions, [[0, .004, 0]], atol=1e-12); assert not spray.spray[0]
    passed("Outgoing spray remains airborne; an incoming close droplet lands")
    vertices = np.asarray([[0, 0, 0], [2, 0, 0], [0, 0, 2]], dtype=float)
    region = {"center": [.5, 0, .5], "radii": [2, 1, 2], "count": 50}
    a = seed_surface(vertices, [[0, 2, 1]], [region], 10); b = seed_surface(vertices, [[0, 2, 1]], [region], 10)
    np.testing.assert_array_equal(a.positions, b.positions); assert len(a.positions) == 50
    assert np.all(a.positions[:, 0] >= 0) and np.all(a.positions[:, [0, 2]].sum(axis=1) <= 2 + 1e-10)
    passed("Seeded foam lies on real triangles and is reproducible")
    airborne_region = dict(region, mode="spray", launchVelocity=[0, 3, 0], maxInitialFlightSeconds=.15)
    airborne = seed_surface(vertices, [[0, 2, 1]], [airborne_region], 10)
    assert airborne.spray.all() and np.max(airborne.positions[:, 1]) > .2
    assert np.all(airborne.velocities[:, 1] <= 3) and np.all(airborne.velocities[:, 1] > 3 - 9.81*.15)
    passed("Preexisting spray is a coherent aged ballistic initial state")
    foam = FoamState([[0, 0, 0]], [.1], [.9], [1]); assert 0 < foam.visible()[0, 3] < .1
    foam.advance(lambda p, t: p*0, 0, .2); assert len(foam.visible()) == 0
    passed("Physical foam lifetime shrinks and expires particles without jitter")
    with tempfile.TemporaryDirectory(prefix="acx-whitewater-test-") as temporary:
        folder = Path(temporary)
        def frame_bytes(vertices, indices):
            vertices = np.asarray(vertices, dtype="<f4").reshape(-1, 3)
            indices = np.asarray(indices, dtype="<u4").reshape(-1)
            normals = np.zeros_like(vertices); normals[:, 1] = 1
            return struct.pack("<4I", MAGIC, len(vertices), len(indices), 0) + vertices.tobytes() + normals.tobytes() + indices.tobytes()
        empty = frame_bytes([], [])
        surface = frame_bytes([[0, 0, 0], [1, 0, 0], [0, 0, 1]], [0, 2, 1])
        (folder / "frame0.bin").write_bytes(empty); (folder / "frame1.bin").write_bytes(surface)
        grid_data = np.zeros((4, 4, 4, 3), dtype="<f4"); grid_data.tofile(folder / "velocity.f32")
        (folder / "manifest.json").write_text(json.dumps({"format": "acryllex-fluid-cache-v1", "fps": 25, "frames": [{"file": "frame0.bin"}, {"file": "frame1.bin"}]}))
        (folder / "velocity.json").write_text(json.dumps({"format": "blender-evaluated-liquid-velocity-grid-raw-v1", "domainBoundsBlenderXYZ": [-1,-1,-1,1,1,1], "frames": [
            {"physicalTimeSeconds": t, "gridFile": "velocity.f32", "floatCount": grid_data.size, "resolutionBlenderXYZ": [4,4,4]} for t in [0,.04]]}))
        result = build_whitewater_cache(folder / "manifest.json", folder / "velocity.json", {"regions": [dict(region,count=10)], "surfaceRetention": False}, folder / "out")
        assert read_acf1(folder / "out/frame0000.bin")[3].shape == (0,4)
        output = (folder / "out/frame0001.bin").read_bytes()
        assert output[16:len(surface)] == surface[16:] and struct.unpack_from("<I", output, 12)[0] == 10
        assert len(result["frames"]) == 2
    passed("Empty inflow frames stay empty; first liquid surface seeds foam without changing mesh bytes")
    print(json.dumps({"passed": len(checks), "checks": checks}))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--cache", type=Path); parser.add_argument("--velocity", type=Path)
    parser.add_argument("--recipe", type=Path); parser.add_argument("--output", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else None)
    if args.self_test:
        self_test(); return
    if any(value is None for value in (args.cache, args.velocity, args.recipe, args.output)):
        parser.error("Require --cache, --velocity, --recipe and --output")
    result = build_whitewater_cache(args.cache, args.velocity, json.loads(args.recipe.read_text()), args.output)
    print(json.dumps({"frames": len(result["frames"]), "output": str(args.output), "visualQualityAccepted": False}))


if __name__ == "__main__":
    main()
