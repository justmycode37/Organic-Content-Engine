import mercury from './planet-textures/mercury.jpg';
import venus from './planet-textures/venus_atmosphere.jpg';
import earth from './planet-textures/earth_daymap.jpg';
import mars from './planet-textures/mars.jpg';
import jupiter from './planet-textures/jupiter.jpg';
import saturn from './planet-textures/saturn.jpg';
import uranus from './planet-textures/uranus.jpg';
import neptune from './planet-textures/neptune.jpg';
import moon from './planet-textures/moon.jpg';
import sun from './planet-textures/sun.jpg';
import earthClouds from './planet-textures/earth_clouds.jpg';
import saturnRings from './planet-textures/saturn-rings.png';

const maps = { mercury, venus, earth, mars, jupiter, saturn, uranus, neptune, moon, sun, earthClouds, saturnRings };
type MapName = keyof typeof maps;
export type PlanetName = Exclude<MapName, 'earthClouds' | 'saturnRings'>;
type Vector = readonly [number, number, number];

export interface PlanetView {
  body: PlanetName;
  center: readonly [number, number];
  radius: number;
  /** Central meridian, view latitude and clockwise position angle in radians. */
  longitude?: number;
  latitude?: number;
  roll?: number;
  /** Toward the light in camera coordinates: right, up, toward the viewer. */
  light?: Vector;
  /** Linear light floor, for example reflected light on the night side. */
  ambient?: number;
  rings?: boolean;
}

// Equatorial radius is the drawing unit. Atmosphere colors affect only scattered light.
const appearances: Record<PlanetName, { polar: number; haze: Vector; depth: number; exposure: number }> = {
  mercury: { polar: 1, haze: [0, 0, 0], depth: 0, exposure: 1.25 },
  venus: { polar: 1, haze: [0.62, 0.46, 0.27], depth: 0.025, exposure: 1.07 },
  earth: { polar: 0.997, haze: [0.10, 0.35, 0.88], depth: 0.026, exposure: 1.12 },
  mars: { polar: 0.994, haze: [0.47, 0.28, 0.15], depth: 0.016, exposure: 1.03 },
  jupiter: { polar: 0.935, haze: [0.40, 0.31, 0.23], depth: 0.014, exposure: 1.10 },
  saturn: { polar: 0.902, haze: [0.44, 0.38, 0.28], depth: 0.016, exposure: 1.06 },
  uranus: { polar: 0.977, haze: [0.22, 0.54, 0.56], depth: 0.017, exposure: 1.03 },
  neptune: { polar: 0.983, haze: [0.23, 0.43, 0.65], depth: 0.019, exposure: 1.12 },
  moon: { polar: 1, haze: [0, 0, 0], depth: 0, exposure: 1.23 },
  sun: { polar: 1, haze: [0, 0, 0], depth: 0, exposure: 1.18 },
};

const vertexSource = `#version 300 es
void main() {
  vec2 point = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D surfaceMap, cloudMap, ringMap;
uniform vec3 light, haze;
uniform vec2 dimensions, orientation, meridian;
uniform float meridianLongitude, unitsPerPixel, polar, depth, exposure, ambient;
uniform bool cloudy, ringed, emitting, neptuneColor;
out vec4 color;

const float pi = 3.14159265359;
const float ringStart = 1.11;
const float ringEnd = 2.32;

vec3 bodySpace(vec3 v) {
  vec2 upright = mat2(orientation.x, orientation.y, -orientation.y, orientation.x) * v.xy;
  return vec3(upright.x, upright.y * meridian.y + v.z * meridian.x,
    v.z * meridian.y - upright.y * meridian.x);
}

vec4 ringAt(float radius) {
  return texture(ringMap, vec2((radius - ringStart) / (ringEnd - ringStart), 0.5)) *
    smoothstep(ringStart, ringStart + 0.008, radius) *
    (1.0 - smoothstep(ringEnd - 0.008, ringEnd, radius));
}

// Solve the viewing ray in stretched body coordinates to account for oblateness.
vec2 roots(vec3 origin, vec3 direction, float radius) {
  origin.y /= polar;
  direction.y /= polar;
  float a = dot(direction, direction);
  float b = dot(origin, direction);
  float d = b * b - a * (dot(origin, origin) - radius * radius);
  if (d < 0.0) return vec2(1.0, -1.0);
  float span = sqrt(d);
  return vec2((-b - span) / a, (-b + span) / a);
}

void main() {
  vec2 p = (gl_FragCoord.xy - dimensions * 0.5) * unitsPerPixel;
  vec3 origin = bodySpace(vec3(p, 0.0));
  vec3 eye = bodySpace(vec3(0.0, 0.0, 1.0));
  vec3 sun = normalize(bodySpace(light));
  vec2 surface = roots(origin, eye, 1.0);
  bool hit = surface.x <= surface.y;
  vec3 shade = vec3(0.0);
  float alpha = 0.0;
  if (hit) {
    vec3 point = origin + eye * surface.y;
    vec3 normal = normalize(vec3(point.x, point.y / (polar * polar), point.z));
    vec2 uv = vec2(0.5 + atan(point.x, point.z) / (2.0 * pi) + meridianLongitude,
      0.5 - asin(clamp(point.y / polar, -1.0, 1.0)) / pi);
    vec3 sampleColor = texture(surfaceMap, uv).rgb;
    if (neptuneColor) {
      // Retain cloud detail while correcting the familiar contrast-enhanced Voyager palette.
      float detail = dot(sampleColor, vec3(0.21, 0.72, 0.07));
      sampleColor = vec3(0.52, 0.68, 0.76) + 0.36 * (detail - 0.39);
    }
    vec3 albedo = pow(sampleColor, vec3(2.2));
    if (cloudy) {
      float clouds = smoothstep(0.10, 0.95, texture(cloudMap, uv + vec2(0.0015, 0.0)).r);
      albedo = mix(albedo, vec3(0.84, 0.88, 0.92), clouds);
    }
    float incidence = dot(normal, sun);
    float direct = pow(max(incidence, 0.0), 0.82);
    if (ringed && abs(sun.y) > 0.0001) {
      float distanceToRing = -point.y / sun.y;
      if (distanceToRing > 0.0) {
        float transmission = 1.0 - 0.86 * ringAt(length((point + sun * distanceToRing).xz)).a;
        direct *= transmission;
      }
    }
    float limb = max(dot(normal, eye), 0.0);
    if (emitting) {
      shade = albedo * exposure * (0.38 + 0.62 * pow(limb, 0.68));
    } else {
      float grazing = pow(1.0 - limb, 3.2) * smoothstep(-0.20, 0.78, incidence);
      shade = albedo * exposure * (ambient + direct) + haze * grazing * 0.23;
    }
    alpha = smoothstep(0.0, sqrt(2.0 * unitsPerPixel), surface.y - surface.x);
  } else if (depth > 0.0) {
    vec2 air = roots(origin, eye, 1.0 + depth);
    if (air.y > air.x) {
      vec3 point = origin + eye * (air.y + air.x) * 0.5;
      shade = haze * 0.62;
      float altitude = (length(vec3(point.x, point.y / polar, point.z)) - 1.0) / depth;
      alpha = exp(-4.8 * max(altitude, 0.0)) * (1.0 - smoothstep(0.75, 1.0, altitude)) *
        smoothstep(-0.27, 0.82, dot(normalize(point), sun)) * 0.55;
    }
  }
  if (ringed && abs(eye.y) > 0.0001) {
    float ringZ = -origin.y / eye.y;
    if (!hit || ringZ > surface.y) {
      vec3 point = origin + eye * ringZ;
      vec4 ring = ringAt(length(point.xz));
      if (ring.a > 0.0) {
        vec2 shadow = roots(point, sun, 1.0);
        float sunlit = shadow.y > max(0.0, shadow.x) ? 0.08 : 1.0;
        float scattering = sun.y * eye.y > 0.0 ? 1.0 : 0.42;
        vec3 ringLight = pow(ring.rgb, vec3(2.2)) * (0.15 + 1.42 * scattering * sunlit);
        float coverage = ring.a + alpha * (1.0 - ring.a);
        shade = (ringLight * ring.a + shade * alpha * (1.0 - ring.a)) / coverage;
        alpha = coverage;
      }
    }
  }
  color = vec4(pow(clamp(shade, 0.0, 1.0), vec3(1.0 / 2.2)), alpha);
}`;

function createRenderer() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('Realistic planets require WebGL 2');

  const program = gl.createProgram();
  const attach = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not allocate planet shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Could not compile planet shader');
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  };
  attach(gl.VERTEX_SHADER, vertexSource);
  attach(gl.FRAGMENT_SHADER, fragmentSource);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Could not link planet shader');
  }
  gl.useProgram(program);
  const uniforms = Object.fromEntries(
    ['surfaceMap', 'cloudMap', 'ringMap', 'light', 'haze', 'dimensions', 'orientation', 'meridian',
      'meridianLongitude', 'unitsPerPixel', 'polar', 'depth', 'exposure', 'ambient', 'cloudy', 'ringed', 'emitting', 'neptuneColor']
      .map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  return { canvas, gl, uniforms, textures: new Map<MapName, WebGLTexture>(), loading: new Map<MapName, Promise<void>>() };
}

let renderer: ReturnType<typeof createRenderer> | undefined;

async function loadMap(name: MapName) {
  const { gl, textures, loading } = (renderer ??= createRenderer());
  const pending = loading.get(name);
  if (pending) return pending;
  const task = (async () => {
    const image = new Image();
    image.src = maps[name];
    await image.decode();
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, name === 'saturnRings' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    textures.set(name, texture);
  })();
  loading.set(name, task);
  return task;
}

export async function preparePlanets(names: readonly PlanetName[] = Object.keys(appearances) as PlanetName[]) {
  const required = new Set<MapName>(names);
  if (required.has('earth')) required.add('earthClouds');
  if (required.has('saturn')) required.add('saturnRings');
  await Promise.all([...required].map(loadMap));
}

export function drawPlanet(ctx: CanvasRenderingContext2D, view: PlanetView) {
  const { body, center, radius, longitude = 0, latitude = body === 'saturn' ? 0.44 : 0,
    roll = 0, light = [-0.79, 0.35, 0.51], ambient = 0.026, rings = true } = view;
  if (radius <= 0) return;
  const globe = appearances[body];
  const ringed = body === 'saturn' && rings;
  const cloudy = body === 'earth';
  const surface = renderer?.textures.get(body);
  if (!renderer || !surface) throw new Error(`Call preparePlanets() before drawing ${body}`);

  const { canvas, gl, uniforms, textures } = renderer;
  const halfWidth = ringed ? 2.35 : 1.035;
  // Screenshot resolution follows the actual stage transform, including camera pushes.
  const transform = ctx.getTransform();
  const scale = Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d));
  const pixelsPerRadius = Math.max(16, Math.min(550, radius * scale));
  const width = Math.ceil(2 * halfWidth * pixelsPerRadius);
  // Bound the rotated ring's vertical extent so narrow openings don't shade a square.
  const ringHeight = 2.33 * Math.hypot(Math.sin(roll), Math.cos(roll) * Math.sin(latitude));
  const height = Math.ceil(2 * Math.max(1.035, ringed ? ringHeight : 0) * pixelsPerRadius);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  gl.viewport(0, 0, width, height);
  ([surface, cloudy ? textures.get('earthClouds') : surface, ringed ? textures.get('saturnRings') : surface] as const)
    .forEach((texture, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture ?? null);
    });
  gl.uniform1i(uniforms.surfaceMap, 0);
  gl.uniform1i(uniforms.cloudMap, 1);
  gl.uniform1i(uniforms.ringMap, 2);
  gl.uniform3fv(uniforms.light, light);
  gl.uniform3fv(uniforms.haze, globe.haze);
  gl.uniform2f(uniforms.dimensions, width, height);
  gl.uniform2f(uniforms.orientation, Math.cos(roll), Math.sin(roll));
  gl.uniform2f(uniforms.meridian, Math.sin(latitude), Math.cos(latitude));
  gl.uniform1f(uniforms.meridianLongitude, longitude / (2 * Math.PI));
  gl.uniform1f(uniforms.unitsPerPixel, 1 / pixelsPerRadius);
  gl.uniform1f(uniforms.polar, globe.polar);
  gl.uniform1f(uniforms.depth, globe.depth);
  gl.uniform1f(uniforms.exposure, globe.exposure);
  gl.uniform1f(uniforms.ambient, ambient);
  gl.uniform1i(uniforms.cloudy, Number(cloudy));
  gl.uniform1i(uniforms.ringed, Number(ringed));
  gl.uniform1i(uniforms.emitting, Number(body === 'sun'));
  gl.uniform1i(uniforms.neptuneColor, Number(body === 'neptune'));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const w = width * radius / pixelsPerRadius, h = height * radius / pixelsPerRadius;
  ctx.drawImage(canvas, center[0] - w / 2, center[1] - h / 2, w, h);
}
