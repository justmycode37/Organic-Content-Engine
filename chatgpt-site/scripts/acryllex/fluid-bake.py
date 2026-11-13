#!/usr/bin/env python3
"""Bake actual Blender Mantaflow liquid and export ACF1 changing-topology caches.

Run with Blender 4.5 LTS, not system Python:
  Blender --background --threads 2 --python fluid-bake.py -- \
    --recipe recipe.json --output /absolute/output --stage all

All recipe positions, dimensions, velocities and exported meshes use Y-up metres.
The solver uses Blender's Z-up coordinates internally. No rendered image, source
footage, analytic animated surface or procedural foam is an export input.

Stages: setup saves an editable recipe.blend; bake opens it and runs modular
data/mesh/secondary-particle baking; export opens the baked scene and writes the
actual evaluated liquid meshes. ACF1 is documented in export_cache below.
This workflow is a real liquid solver, not a guarantee of realistic results:
initial/boundary conditions, resolution and physical scale still need validation.
The input check covers edge incidence and orientation, not self-intersections.
Authors must provide geometrically valid, non-overlapping closed solids; a mesh
can have two faces per edge and still contain invalid crossing/reversed caps.
"""

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import random
import shutil
import struct
import sys
import time

MAGIC = 0x31464341
DOMAIN_NAME = "ACX_LIQUID_DOMAIN"
PROVENANCE = [
    "https://docs.blender.org/api/4.5/bpy.types.FluidDomainSettings.html",
    "https://docs.blender.org/api/4.5/bpy.types.FluidFlowSettings.html",
    "https://docs.blender.org/api/4.5/bpy.ops.fluid.html",
    "https://docs.blender.org/manual/en/4.5/physics/fluid/type/domain/settings.html",
]
_DISTURBANCE_CACHE = {}
_WORKFLOW_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def example_recipe(preset="dam-break"):
    recipe = {
        "name": "Small real liquid dam-break smoke bake",
        "coordinates": "Y-up metres",
        "fps": 25, "frameStart": 1, "frameEnd": 20,
        "gravity": [0, -9.81, 0],
        "domain": {
            "center": [0, 1.5, 0], "size": [4, 3, 2],
            "resolution": 48, "method": "FLIP", "meshScale": 1,
            "flipRatio": 0.95, "timeScale": 1,
            "closedBorders": ["bottom", "left", "right", "front", "back"],
            "settings": {"timesteps_min": 1, "timesteps_max": 4,
                         "cfl_condition": 2, "use_fractions": True},
        },
        "flows": [{"name": "Initial reservoir", "shape": "box",
                   "center": [-1.1, 1.1, 0], "size": [1.35, 1.9, 1.6],
                   "behavior": "GEOMETRY", "velocity": [0, 0, 0]}],
        "colliders": [{"name": "Impact block", "shape": "box",
                       "center": [0.55, 0.28, 0], "size": [0.35, 0.56, 1.2]}],
        "secondary": {"foam": True, "spray": True, "bubbles": False,
                      "radius": 0.015, "settings": {}},
        "provenance": "Original editable dam-break setup; no source pixels or footage.",
    }
    if preset == "jet":
        recipe.update(name="Real APIC jet into a shallow pool", frameEnd=36)
        recipe["domain"].update(center=[0, 1.5, 0], size=[4, 3, 2.5],
                                resolution=64, method="APIC", meshScale=2)
        recipe["flows"] = [
            {"name": "Initial shallow pool", "shape": "box", "behavior": "GEOMETRY",
             "center": [0, 0.22, 0], "size": [3.65, 0.32, 2.15]},
            {"name": "Oblique nozzle", "shape": "sphere", "behavior": "INFLOW",
             "center": [-1.25, 1.75, 0], "radius": 0.17,
             "velocity": [2.8, 0.7, 0], "startFrame": 1, "endFrame": 25},
        ]
        recipe["colliders"] = []
    return recipe


def write_json(path, value):
    pending = path.with_name(path.name + ".tmp")
    pending.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")
    pending.replace(path)


def vec3(value, label):
    if len(value) != 3 or not all(math.isfinite(float(x)) for x in value):
        raise ValueError(f"{label} must contain three finite numbers")
    return tuple(float(x) for x in value)


def y_to_z(value):
    x, y, z = value
    return x, -z, y


def z_to_y(value):
    x, y, z = value
    return x, z, -y


def requested_time_scale(domain):
    # Advanced RNA settings have always applied after the public controls.
    # Use that same effective clock for initial mesh velocity sampling.
    return float(domain.get("settings", {}).get("time_scale", domain.get("timeScale", 1)))


def coherent_disturbance(point, settings):
    """Seeded spatial solenoidal Fourier modes; no frame-to-frame jitter.

    Every mode's polarization is perpendicular to its wave vector. Normalized
    positive band weights bound the total speed contribution by amplitude.
    The liquid solver subsequently projects/evolves this initial condition.
    """
    from mathutils import Vector
    amplitude = float(settings.get("amplitude", 0))
    if amplitude < 0 or not math.isfinite(amplitude):
        raise ValueError("disturbance.amplitude must be finite and nonnegative")
    if amplitude == 0:
        return Vector()
    signature = json.dumps(settings, sort_keys=True)
    if signature not in _DISTURBANCE_CACHE:
        wavelengths = settings.get("wavelengths", [5.5, 1.8, 0.65])
        weights = settings.get("weights", [0.55, 0.30, 0.15])
        count = int(settings.get("modesPerScale", 4))
        if len(weights) != len(wavelengths) or not weights or min(weights) < 0 or sum(weights) <= 0 or not 1 <= count <= 32:
            raise ValueError("Invalid disturbance weights/modesPerScale")
        rng = random.Random(int(settings.get("seed", 0)))
        modes = []
        for wavelength, weight in zip(wavelengths, weights):
            if not math.isfinite(float(wavelength)) or wavelength <= 0:
                raise ValueError("disturbance wavelengths must be finite and positive")
            for unused in range(count):
                direction = Vector([rng.gauss(0, 1) for axis in range(3)]).normalized()
                perpendicular = direction.cross(Vector([rng.gauss(0, 1) for axis in range(3)])).normalized()
                modes.append((direction * (2 * math.pi / wavelength), perpendicular,
                              amplitude * weight / sum(weights) / count, rng.uniform(-math.pi, math.pi)))
        _DISTURBANCE_CACHE[signature] = modes
    point = Vector(point) - Vector(settings.get("origin", [0, 0, 0]))
    result = Vector()
    for frequency, polarization, gain, phase in _DISTURBANCE_CACHE[signature]:
        result += polarization * (gain * math.sin(frequency.dot(point) + phase))
    return result


def initial_velocity(point, field):
    """Recipe-defined Y-up m/s: mean + vortex, blended into floor advection.

    This samples initial conditions. Subsequent exported motion is solved by
    Mantaflow; the field does not deform or paint the exported liquid mesh.
    """
    from mathutils import Vector
    p = Vector(point)
    velocity = Vector(vec3(field.get("mean", [0, 0, 0]), "field.mean"))
    vortex = field.get("vortex")
    if vortex:
        axis = Vector(vec3(vortex.get("axis", [0, 0, 1]), "vortex.axis"))
        if axis.length < 1e-9:
            raise ValueError("vortex.axis must be nonzero")
        axis.normalize()
        offset = p - Vector(vec3(vortex.get("center", [0, 0, 0]), "vortex.center"))
        turn = axis.cross(offset) * float(vortex.get("angularSpeed", 0))
        radius = float(vortex.get("falloffRadius", 0))
        if radius > 0:
            radial = offset - axis * offset.dot(axis)
            turn *= math.exp(-radial.length_squared / (radius * radius))
        velocity += turn
    floor = field.get("floor")
    if floor:
        width = float(floor.get("blendHeight", 1))
        if width <= 0:
            raise ValueError("field.floor.blendHeight must be positive")
        weight = min(1, max(0, (p.y - float(floor.get("height", 0))) / width))
        weight = weight * weight * (3 - 2 * weight)
        velocity = Vector(vec3(floor.get("velocity", [0, 0, 0]), "floor.velocity")).lerp(velocity, weight)
    if field.get("disturbance"):
        velocity += coherent_disturbance(point, field["disturbance"])
    if not all(math.isfinite(v) for v in velocity):
        raise ValueError("Non-finite initial velocity field")
    return velocity


def animate_initial_velocity(bpy, obj, field, first, fps, time_scale):
    """Use Blender-supported deformed flow-mesh source velocity.

    GEOMETRY at the first cache frame has no previous mesh sample in Blender.
    A one-frame INFLOW pulse after an empty warm-up supplies the previous sample
    and a measurable inherited velocity. Export can omit that warm-up frame.
    """
    from mathutils import Vector
    obj.shape_key_add(name="Basis")
    key = obj.shape_key_add(name="ACX initial velocity sample")
    key.slider_min = -2
    key.slider_max = 2
    inverse = obj.matrix_world.to_3x3().inverted()
    dt = time_scale / fps
    for vertex, target in zip(obj.data.vertices, key.data):
        world = z_to_y(obj.matrix_world @ vertex.co)
        delta = inverse @ Vector(y_to_z(initial_velocity(world, field)))
        target.co = vertex.co + delta * dt
    for frame, value in [(first - 1, -1), (first, 0), (first + 1, 1)]:
        key.value = value
        key.keyframe_insert("value", frame=frame)
    for curve in obj.data.shape_keys.animation_data.action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    key.value = -1


def validate_recipe(recipe):
    if recipe.get("coordinates", "Y-up metres") != "Y-up metres":
        raise ValueError("Recipe coordinates must be 'Y-up metres'")
    if not 1 <= int(recipe.get("fps", 25)) <= 240:
        raise ValueError("fps must be 1..240")
    start, end = int(recipe.get("frameStart", 1)), int(recipe.get("frameEnd", 20))
    if start < 1 or end < start:
        raise ValueError("Require 1 <= frameStart <= frameEnd")
    if not start <= int(recipe.get("exportStartFrame", start)) <= end:
        raise ValueError("exportStartFrame must lie inside the baked frame range")
    domain = recipe["domain"]
    vec3(domain["center"], "domain.center")
    size = vec3(domain["size"], "domain.size")
    if min(size) <= 0 or not 16 <= int(domain.get("resolution", 48)) <= 1024:
        raise ValueError("Require positive domain size and resolution16..1024")
    if domain.get("method", "FLIP") not in ("FLIP", "APIC"):
        raise ValueError("domain.method must be FLIP or APIC")
    clock_scale = requested_time_scale(domain)
    if not math.isfinite(clock_scale) or not 0.0001 <= clock_scale <= 10:
        raise ValueError("Effective domain timeScale must be finite and in0.0001..10")
    if not recipe.get("flows"):
        raise ValueError("At least one initial volume or inflow is required")
    if not math.isfinite(float(recipe.get("secondary", {}).get("radius", 0.015))) or float(recipe.get("secondary", {}).get("radius", 0.015)) < 0:
        raise ValueError("secondary.radius must be a nonnegative finite metre value")
    for spec in recipe.get("flows", []) + recipe.get("colliders", []):
        if spec.get("shape", "box") not in ("box", "sphere", "mesh", "obj", "prism"):
            raise ValueError(f"Unknown object shape: {spec.get('shape')}")
        vec3(spec.get("center", [0, 0, 0]), "object.center")
        vec3(spec.get("velocity", [0, 0, 0]), "object.velocity")
        if "size" in spec and min(vec3(spec["size"], "object.size")) <= 0:
            raise ValueError("Object dimensions must be positive")


def read_obj(path):
    vertices, faces = [], []
    for line in path.read_text().splitlines():
        fields = line.split()
        if fields and fields[0] == "v":
            vertices.append(vec3(fields[1:4], "OBJ vertex"))
        elif fields and fields[0] == "f":
            face = []
            for token in fields[1:]:
                index = int(token.split("/")[0])
                face.append(index - 1 if index > 0 else len(vertices) + index)
            faces.append(face)
    return vertices, faces


def set_settings(owner, settings, label):
    for key, value in settings.items():
        prop = owner.bl_rna.properties.get(key)
        if prop is None or prop.is_readonly:
            raise ValueError(f"Unsupported/read-only {label} setting {key!r}")
        setattr(owner, key, value)


def activate(bpy, obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def create_object(bpy, spec, recipe_dir):
    import bmesh
    from mathutils import Matrix, Quaternion, Vector
    shape = spec.get("shape", "box")
    if shape == "box":
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.object
        sx, sy, sz = spec["size"]
        obj.scale = sx, sz, sy
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    elif shape == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16,
                                            radius=float(spec.get("radius", 0.25)))
        obj = bpy.context.object
        sx, sy, sz = spec.get("scale", [1, 1, 1])
        obj.scale = sx, sz, sy
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    else:
        if shape == "obj":
            vertices, faces = read_obj((recipe_dir / spec["file"]).resolve())
        elif shape == "prism":
            section = spec["section"]  # closed XY outline, no duplicate endpoint
            depth = float(spec.get("depth", 1))
            n = len(section)
            vertices = [(x, y, z) for z in [-depth / 2, depth / 2] for x, y in section]
            faces = [list(reversed(range(n))), list(range(n, n * 2))]
            faces += [[i, (i + 1) % n, (i + 1) % n + n, i + n] for i in range(n)]
        else:
            vertices, faces = spec["vertices"], spec["faces"]
        mesh = bpy.data.meshes.new(spec.get("name", "Authored volume"))
        mesh.from_pydata([y_to_z(vec3(v, "mesh vertex")) for v in vertices], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.collection.objects.link(obj)
    obj.name = spec.get("name", shape)
    # Necessary topology checks only. Two faces per edge does NOT certify a
    # non-self-intersecting solid or a correctly triangulated concave cap.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    invalid = sum(not e.is_manifold for e in bm.edges)
    if invalid:
        bm.free()
        raise ValueError(f"{obj.name}: {invalid} non-manifold edges; provide a closed volume")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    authored_volume = bm.calc_volume(signed=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj["acx_input_validation"] = json.dumps({
        "edgeManifold": True, "signedVolumeM3": authored_volume,
        "selfIntersectionChecked": False,
        "note": "Edge incidence/orientation only; author must validate non-overlapping solid and concave cap triangulation."})
    def pose(values):
        rotation = Quaternion((1, 0, 0, 0))
        for axis, degrees in zip(((1, 0, 0), (0, 0, 1), (0, -1, 0)), values.get("rotation", spec.get("rotation", [0, 0, 0]))):
            rotation = Quaternion(axis, math.radians(degrees)) @ rotation
        obj.location = y_to_z(values.get("center", spec.get("center", [0, 0, 0])))
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation
    pose(spec)
    # Animated collision volumes support physical paddles, gates and moving
    # containers; liquid velocities are then solved, not deformed in export.
    for key in spec.get("keyframes", []):
        pose(key)
        obj.keyframe_insert("location", frame=int(key["frame"]))
        obj.keyframe_insert("rotation_quaternion", frame=int(key["frame"]))
    if obj.animation_data and obj.animation_data.action:
        for curve in obj.animation_data.action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
    obj.hide_render = True
    obj.display_type = "WIRE"
    return obj


def setup_scene(bpy, recipe, recipe_dir, output, threads):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start = int(recipe.get("frameStart", 1))
    scene.frame_end = int(recipe.get("frameEnd", 20))
    scene.render.fps = int(recipe.get("fps", 25))
    scene.render.fps_base = 1
    scene.render.threads_mode = "FIXED"
    scene.render.threads = threads
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.gravity = y_to_z(vec3(recipe.get("gravity", [0, -9.81, 0]), "gravity"))
    scene.frame_set(scene.frame_start)
    input_checks = []
    for spec in recipe["flows"]:
        obj = create_object(bpy, spec, recipe_dir)
        input_checks.append({"name": obj.name, "kind": "flow", **json.loads(obj["acx_input_validation"])})
        field = spec.get("initialVelocityField")
        if field:
            if spec.get("keyframes"):
                raise ValueError("Use one initialVelocityField instead of additional source pose keyframes")
            if spec.get("behavior", "GEOMETRY") != "GEOMETRY":
                raise ValueError("initialVelocityField requires a GEOMETRY initial volume")
            first = int(field.get("initializeFrame", scene.frame_start + 1))
            if not scene.frame_start < first <= scene.frame_end:
                raise ValueError("initialVelocityField needs a warm-up before initializeFrame")
            bpy.context.view_layer.update()
            animate_initial_velocity(bpy, obj, field, first, scene.render.fps,
                                     requested_time_scale(recipe["domain"]))
        modifier = obj.modifiers.new("Liquid flow", "FLUID")
        modifier.fluid_type = "FLOW"
        flow = modifier.flow_settings
        flow.flow_type = "LIQUID"
        flow.flow_behavior = "INFLOW" if field else spec.get("behavior", "GEOMETRY")
        flow.surface_distance = float(spec.get("surfaceDistance", 1.5))
        flow.use_plane_init = False
        flow.use_initial_velocity = True
        flow.velocity_coord = (0, 0, 0) if field else y_to_z(spec.get("velocity", [0, 0, 0]))
        flow.velocity_factor = 1
        flow.velocity_normal = float(spec.get("normalVelocity", 0))
        flow.subframes = int(spec.get("subframes", 1))
        set_settings(flow, spec.get("settings", {}), "flow")
        if flow.flow_behavior == "INFLOW":
            first = int(field.get("initializeFrame", scene.frame_start + 1)) if field else int(spec.get("startFrame", scene.frame_start))
            last = first if field else int(spec.get("endFrame", scene.frame_end))
            # Solver frame N samples subframes N-1..N. A field pulse must stop
            # just after N, otherwise subframe emission leaks into frame N+1.
            keys = ([(first - 1, False), (first - 1 + 0.001, True), (first + 0.001, False)]
                    if field else [(first - 1, False), (first, True), (last, True), (last + 1, False)])
            for frame, enabled in keys:
                flow.use_inflow = enabled
                flow.keyframe_insert("use_inflow", frame=frame)
    for spec in recipe.get("colliders", []):
        obj = create_object(bpy, spec, recipe_dir)
        input_checks.append({"name": obj.name, "kind": "collider", **json.loads(obj["acx_input_validation"])})
        modifier = obj.modifiers.new("Liquid collision", "FLUID")
        modifier.fluid_type = "EFFECTOR"
        set_settings(modifier.effector_settings, spec.get("settings", {}), "collider")
    domain = recipe["domain"]
    obj = create_object(bpy, {"name": DOMAIN_NAME, "shape": "box", "center": domain["center"],
                              "size": domain["size"]}, recipe_dir)
    obj.hide_render = False
    modifier = obj.modifiers.new("Mantaflow liquid domain", "FLUID")
    modifier.fluid_type = "DOMAIN"
    ds = modifier.domain_settings
    ds.domain_type = "LIQUID"
    ds.resolution_max = int(domain.get("resolution", 48))
    ds.simulation_method = domain.get("method", "FLIP")
    ds.flip_ratio = float(domain.get("flipRatio", 0.95))
    ds.time_scale = requested_time_scale(domain)
    closed = domain.get("closedBorders", ["bottom", "top", "left", "right", "front", "back"])
    for side in ("bottom", "top", "left", "right", "front", "back"):
        setattr(ds, "use_collision_border_" + side, side in closed)
    ds.cache_type = "MODULAR"
    ds.cache_directory = str((output / "mantaflow").resolve())
    ds.cache_frame_start = scene.frame_start
    ds.cache_frame_end = scene.frame_end
    ds.cache_resumable = True
    ds.cache_data_format = "UNI"
    ds.cache_particle_format = "UNI"
    ds.use_mesh = True
    ds.mesh_scale = int(domain.get("meshScale", 1))
    ds.mesh_particle_radius = float(domain.get("meshRadius", 2))
    ds.mesh_smoothen_pos = int(domain.get("meshSmoothPositive", 1))
    ds.mesh_smoothen_neg = int(domain.get("meshSmoothNegative", 1))
    ds.mesh_generator = "IMPROVED"
    secondary = recipe.get("secondary", {})
    ds.use_spray_particles = bool(secondary.get("spray", False))
    ds.use_foam_particles = bool(secondary.get("foam", False))
    ds.use_bubble_particles = bool(secondary.get("bubbles", False))
    set_settings(ds, domain.get("settings", {}), "domain")
    set_settings(ds, secondary.get("settings", {}), "secondary")
    scene.frame_set(scene.frame_start)
    activate(bpy, obj)
    write_json(output / "input-geometry-report.json", {"objects": input_checks,
               "solidValidityAccepted": False,
               "note": "Topology checks are necessary, not sufficient. Self-intersection and invalid concave-cap regions are not tested here."})
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "recipe.blend"))
    return obj


def bake(bpy, obj, output, secondary):
    activate(bpy, obj)
    bpy.context.scene.frame_set(bpy.context.scene.frame_start)
    stages = []
    for name, operator in [("data", bpy.ops.fluid.bake_data),
                           ("mesh", bpy.ops.fluid.bake_mesh)]:
        started = time.monotonic()
        result = operator()
        stages.append({"stage": name, "result": sorted(result), "seconds": time.monotonic() - started})
        if "FINISHED" not in result:
            raise RuntimeError(f"Mantaflow {name} bake failed: {result}")
        print("ACX_BAKE " + json.dumps(stages[-1]), flush=True)
    if any(secondary.get(key) for key in ("foam", "spray", "bubbles")):
        started = time.monotonic()
        result = bpy.ops.fluid.bake_particles()
        stages.append({"stage": "secondary", "result": sorted(result), "seconds": time.monotonic() - started})
        if "FINISHED" not in result:
            raise RuntimeError(f"Mantaflow secondary bake failed: {result}")
        print("ACX_BAKE " + json.dumps(stages[-1]), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "recipe.blend"))
    write_json(output / "bake-report.json", {"stages": stages})


def little_array(typecode, values):
    data = array(typecode, values)
    if sys.byteorder != "little":
        data.byteswap()
    return data.tobytes()


def secondary_particles(evaluated, radius, enabled):
    particles, systems = [], []
    for system in evaluated.particle_systems:
        # Primary FLIP particles define the volume, not secondary whitewater.
        kind = system.settings.type
        requested = (("FOAM" in kind and enabled.get("foam", False)) or
                     ("SPRAY" in kind and enabled.get("spray", False)) or
                     ("BUBBLE" in kind and enabled.get("bubbles", False)))
        if not requested:
            continue
        alive = 0
        for particle in system.particles:
            if particle.alive_state not in ("ALIVE", "DYING"):
                continue
            point = z_to_y(particle.location)
            if not all(math.isfinite(c) for c in point):
                raise ValueError("Non-finite Mantaflow secondary particle")
            particles.extend((*point, radius))
            alive += 1
        systems.append({"name": system.name, "type": kind, "alive": alive})
    return particles, systems


def primary_velocity_report(evaluated, stride=1):
    """Optional evidence from solved FLIP particles, never render geometry."""
    from mathutils import Vector
    particles = [(Vector(z_to_y(p.location)), Vector(z_to_y(p.velocity)))
                 for system in evaluated.particle_systems if system.settings.type == "FLIP"
                 for index, p in enumerate(system.particles)
                 if index % stride == 0 and p.alive_state in ("ALIVE", "DYING")]
    if not particles:
        return {"count": 0}
    center = sum((p for p, v in particles), Vector()) / len(particles)
    mean = sum((v for p, v in particles), Vector()) / len(particles)
    momentum = 0
    inertia = 0
    for point, velocity in particles:
        r = point - center
        v = velocity - mean
        momentum += r.x * v.y - r.y * v.x
        inertia += r.x * r.x + r.y * r.y
    return {"sampleCount": len(particles), "sampleStride": stride, "meanPosition": list(center), "rawMeanVelocity": list(mean),
            "rawAngularVelocityZ": momentum / max(inertia, 1e-12),
            "velocityUnits": "Blender FLIP particle API units; use positions/time to measure metres per second"}


def export_velocity_grid(evaluated, recipe, output, frame, index, fps):
    """Raw evaluated liquid grid + calibration samples, outside the ACF1 cache.

    RNA calls this a smoke grid, but evaluated LIQUID domains expose it too.
    Do not assume grid velocity units or interleaving from the property name;
    the whitewater consumer must calibrate against solved particle movement.
    """
    auxiliary = output / "auxiliary"
    auxiliary.mkdir(exist_ok=True)
    domain = evaluated.modifiers[0].domain_settings
    values = domain.velocity_grid[:]
    resolution = list(domain.domain_resolution)
    if len(values) != 3 * math.prod(resolution) or not values:
        raise RuntimeError("Evaluated liquid velocity grid is unavailable/inconsistent")
    filename = f"velocity-grid{index:04d}.f32"
    (auxiliary / filename).write_bytes(little_array("f", values))
    limit = max(0, int(recipe.get("velocityGridPrimarySamples", 512)))
    particles = []
    for system in evaluated.particle_systems:
        if system.settings.type != "FLIP" or not limit:
            continue
        stride = max(1, math.ceil(len(system.particles) / limit))
        for particle_index in range(0, len(system.particles), stride):
            particle = system.particles[particle_index]
            if particle.alive_state in ("ALIVE", "DYING"):
                particles.append({"index": particle_index, "position": z_to_y(particle.location),
                                  "rawVelocity": z_to_y(particle.velocity)})
    sample_file = f"primary-samples{index:04d}.json"
    write_json(auxiliary / sample_file, {"coordinates": "Y-up metres", "particles": particles,
               "note": "Indices may change under FLIP resampling; not persistent particle IDs. Raw velocity units require calibration."})
    # Read the saved, actually baked scene clock, not a recipe edited after bake.
    time_scale = domain.time_scale
    return {"sourceFrame": frame, "exportFrame": index, "timeSeconds": index / fps,
            "physicalTimeSeconds": index * time_scale / fps, "gridFile": filename,
            "timeScale": time_scale,
            "floatCount": len(values), "resolutionBlenderXYZ": resolution,
            "cellSizeBlenderXYZ": list(domain.cell_size), "primarySamplesFile": sample_file}


def export_cache(bpy, obj, recipe, output):
    """ACF1: 4LE uint32s then position3f*N, normal3f*N, index1u*I, foam4f*F.

    Header: magic=0x31464341 ('ACF1'), vertexCount, indexCount, foamCount.
    Export is in Y-up metres, right handed. Normals follow the same rotation;
    rotation has determinant+1, so triangle winding is retained. Absolute frames
    are ordered; their cache time is index/fps. Frame files may change topology.
    Foam entries are actual secondary Mantaflow particles, radius in metres.
    """
    ds = obj.modifiers[0].domain_settings
    if not ds.has_cache_baked_mesh:
        raise RuntimeError("No baked liquid mesh; refusing to export a domain box")
    fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
    fps = int(fps) if float(fps).is_integer() else fps
    ratio = float(recipe.get("exportDecimateRatio", 1))
    if not 0 < ratio <= 1:
        raise ValueError("exportDecimateRatio must be in (0,1]")
    if ratio < 1:
        simplifier = obj.modifiers.new("ACX export-only simplification", "DECIMATE")
        simplifier.decimate_type = "COLLAPSE"
        simplifier.ratio = ratio
        simplifier.use_collapse_triangulate = True
    else:
        simplifier = None
    # An interrupted re-export must not leave an apparently complete manifest.
    (output / "manifest.json").unlink(missing_ok=True)
    frames, report, grids = [], [], []
    union_lo, union_hi = [math.inf] * 3, [-math.inf] * 3
    export_start = int(recipe.get("exportStartFrame", bpy.context.scene.frame_start))
    for index, frame in enumerate(range(export_start, bpy.context.scene.frame_end + 1)):
        bpy.context.scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        depsgraph.update()
        transfer = None
        normal_search_degenerates = 0
        if simplifier and recipe.get("exportTransferNormals", True):
            from mathutils.bvhtree import BVHTree
            simplifier.show_viewport = False
            depsgraph.update()
            full = obj.evaluated_get(depsgraph)
            original = full.to_mesh()
            original.calc_loop_triangles()
            full_positions = [v.co.copy() for v in original.vertices]
            full_normals = [v.normal.copy() for v in original.vertices]
            # Mantaflow can retain zero-area triangles at a pinch-off. They
            # contribute no visible surface and have no defined barycentric
            # normal, so exclude them from the normal-transfer search only.
            full_triangles = [tuple(t.vertices) for t in original.loop_triangles
                              if (full_positions[t.vertices[1]] - full_positions[t.vertices[0]]).cross(
                                  full_positions[t.vertices[2]] - full_positions[t.vertices[0]]).length_squared > 1e-20]
            normal_search_degenerates = len(original.loop_triangles) - len(full_triangles)
            transfer = (BVHTree.FromPolygons(full_positions, full_triangles, all_triangles=True),
                        full_positions, full_normals, full_triangles)
            full.to_mesh_clear()
            simplifier.show_viewport = True
            depsgraph.update()
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            positions, normals, triangles = [], [], []
            normal_fallbacks = 0
            normal_matrix = evaluated.matrix_world.to_3x3().inverted().transposed()
            lo, hi = [math.inf] * 3, [-math.inf] * 3
            volume6 = 0.0
            transformed = []
            for vertex in mesh.vertices:
                point = z_to_y(evaluated.matrix_world @ vertex.co)
                source_normal = vertex.normal
                if transfer:
                    from mathutils.geometry import barycentric_transform
                    tree, coordinates, vectors, faces = transfer
                    hit, face_normal, triangle_index, distance = tree.find_nearest(vertex.co)
                    if hit is not None:
                        a, b, c = faces[triangle_index]
                        source_normal = barycentric_transform(hit, coordinates[a], coordinates[b], coordinates[c],
                                                              vectors[a], vectors[b], vectors[c])
                        # Thin coalescing droplets can cancel averaged vertex
                        # normals. Keep the actual outward full-surface face
                        # orientation rather than inventing a lighting vector.
                        if source_normal.length_squared < 1e-14:
                            source_normal = face_normal
                            normal_fallbacks += 1
                        if source_normal.length_squared < 1e-14:
                            source_normal = vertex.normal
                        source_normal = source_normal.normalized()
                normal = z_to_y((normal_matrix @ source_normal).normalized())
                if not all(math.isfinite(v) for v in normal) or sum(x * x for x in normal) < 0.99:
                    # The reduced vertex still has an actual area-weighted
                    # surface normal if a singular closest-face interpolation
                    # was encountered. Preserve that geometric orientation.
                    normal = z_to_y((normal_matrix @ vertex.normal).normalized())
                    normal_fallbacks += 1
                if not all(math.isfinite(v) for v in (*point, *normal)):
                    raise ValueError(f"Non-finite exported frame{frame}")
                if sum(x * x for x in normal) < 0.99:
                    raise ValueError(f"Invalid normal in frame{frame}, vertex{vertex.index}, transfer={bool(transfer)}")
                transformed.append(point)
                positions.extend(point)
                normals.extend(normal)
                for axis in range(3):
                    lo[axis] = min(lo[axis], point[axis]); hi[axis] = max(hi[axis], point[axis])
            for triangle in mesh.loop_triangles:
                a, b, c = triangle.vertices
                triangles.extend((a, b, c))
                va, vb, vc = transformed[a], transformed[b], transformed[c]
                volume6 += va[0] * (vb[1] * vc[2] - vb[2] * vc[1]) + va[1] * (vb[2] * vc[0] - vb[0] * vc[2]) + va[2] * (vb[0] * vc[1] - vb[1] * vc[0])
            foam, systems = secondary_particles(evaluated, float(recipe.get("secondary", {}).get("radius", 0.015)), recipe.get("secondary", {}))
            if not positions:
                lo = hi = [0.0, 0.0, 0.0]
            # Importers cull by the complete visible frame, including whitewater.
            for particle in range(0, len(foam), 4):
                for axis in range(3):
                    lo[axis] = min(lo[axis], foam[particle + axis] - foam[particle + 3])
                    hi[axis] = max(hi[axis], foam[particle + axis] + foam[particle + 3])
            for axis in range(3):
                union_lo[axis] = min(union_lo[axis], lo[axis]); union_hi[axis] = max(union_hi[axis], hi[axis])
            name = f"frame{index:04d}.bin"
            path = output / name
            pending = path.with_name(path.name + ".tmp")
            with pending.open("wb") as stream:
                stream.write(struct.pack("<4I", MAGIC, len(mesh.vertices), len(triangles), len(foam) // 4))
                stream.write(little_array("f", positions)); stream.write(little_array("f", normals))
                stream.write(little_array("I", triangles)); stream.write(little_array("f", foam))
            pending.replace(path)
            frames.append({"file": name, "bounds": lo + hi})
            report.append({"sourceFrame": frame, "vertices": len(mesh.vertices), "triangles": len(triangles) // 3,
                           "foam": len(foam) // 4, "particleSystems": systems, "signedVolumeM3": volume6 / 6,
                           "geometricNormalFallbacks": normal_fallbacks,
                           "normalSearchDegenerateTriangles": normal_search_degenerates,
                           "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
            if recipe.get("reportPrimaryParticles", False):
                report[-1]["solvedPrimaryParticles"] = primary_velocity_report(evaluated, max(1, int(recipe.get("primarySampleStride", 1))))
            if recipe.get("exportVelocityGrid", False):
                grids.append(export_velocity_grid(evaluated, recipe, output, frame, index, fps))
            print(f"ACX_EXPORT frame={frame} vertices={len(mesh.vertices)} triangles={len(triangles)//3} foam={len(foam)//4}", flush=True)
        finally:
            evaluated.to_mesh_clear()
    if not any(row["vertices"] > 8 for row in report):
        raise RuntimeError("No nontrivial actual liquid surface was exported")
    manifest = {"format": "acryllex-fluid-cache-v1", "fps": fps,
                "frames": frames, "bounds": union_lo + union_hi,
                "coordinates": "Y-up metres", "generator": "Blender Mantaflow liquid",
                "blenderVersion": bpy.app.version_string,
                "sourceFrameStart": export_start,
                "recipe": "recipe.json", "provenance": PROVENANCE}
    write_json(output / "manifest.json", manifest)
    if grids:
        center, size = recipe["domain"]["center"], recipe["domain"]["size"]
        lower = [c - s / 2 for c, s in zip(center, size)]
        upper = [c + s / 2 for c, s in zip(center, size)]
        write_json(output / "auxiliary" / "velocity-grid.json", {
            "format": "blender-evaluated-liquid-velocity-grid-raw-v1", "dtype": "little-endian float32",
            "domainBoundsYUp": lower + upper,
            "domainBoundsBlenderXYZ": [lower[0], -upper[2], lower[1], upper[0], -lower[2], upper[1]],
            "fps": fps, "timeScale": grids[0]["timeScale"],
            "layoutAndVelocityUnits": "Raw Blender velocity_grid; calibrate with primary samples before use",
            "source": "evaluated object FluidDomainSettings.velocity_grid[:]", "frames": grids,
            "outsideACF1CacheBudget": True})
    write_json(output / "export-report.json", {"blenderVersion": bpy.app.version_string,
               "buildHash": bpy.app.build_hash.decode(), "frames": report,
               "workflowSHA256": _WORKFLOW_SHA256,
               "recipeSHA256": hashlib.sha256((output / "recipe.json").read_bytes()).hexdigest(),
               "exportDecimateRatio": ratio,
               "transferredFullSurfaceNormals": bool(simplifier and recipe.get("exportTransferNormals", True)),
               "threads": bpy.context.scene.render.threads,
               "actualSolverOutput": True, "visualQualityAccepted": False,
               "note": "Successful simulation/export is not a realism or source-match acceptance."})
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--recipe", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--stage", choices=["setup", "bake", "export", "all"], default="all")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--write-example", type=Path, help="Write an editable recipe without importing Blender")
    parser.add_argument("--preset", choices=["dam-break", "jet"], default="dam-break")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    if args.write_example:
        write_json(args.write_example, example_recipe(args.preset))
        return
    if args.recipe is None or args.output is None:
        parser.error("--recipe and --output are required")
    if not 1 <= args.threads <= 2:
        parser.error("--threads must be1 or2 (bounded local CPU use)")
    recipe_path = args.recipe.resolve()
    recipe = json.loads(recipe_path.read_text())
    validate_recipe(recipe)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    import bpy
    started = time.monotonic()
    if args.stage in ("setup", "all"):
        # Keep authored initial meshes with the exported recipe for reproduction.
        for index, spec in enumerate(recipe["flows"] + recipe.get("colliders", [])):
            if spec.get("shape") == "obj":
                original = (recipe_path.parent / spec["file"]).resolve()
                relative = f"input{index:03d}.obj"
                target = output / relative
                if original != target:
                    shutil.copyfile(original, target)
                spec["file"] = relative
                spec["inputSHA256"] = hashlib.sha256(target.read_bytes()).hexdigest()
        write_json(output / "recipe.json", recipe)
        obj = setup_scene(bpy, recipe, output, output, args.threads)
    else:
        bpy.ops.wm.open_mainfile(filepath=str(output / "recipe.blend"))
        obj = bpy.data.objects[DOMAIN_NAME]
    if args.stage in ("bake", "all"):
        bake(bpy, obj, output, recipe.get("secondary", {}))
    if args.stage in ("export", "all"):
        export_cache(bpy, obj, recipe, output)
    print("ACX_COMPLETE " + json.dumps({"stage": args.stage, "seconds": time.monotonic() - started,
          "version": bpy.app.version_string, "output": str(output)}), flush=True)


if __name__ == "__main__":
    main()
