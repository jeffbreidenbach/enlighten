// The core calculation: adding up the wavelets at every point.
//
// These shaders run once per pixel on the GPU. Each works out the light at
// its point as a complex amplitude, a 2-vector (re, im): the light from
// the source before the aperture plate, and the sum of the plate's
// wavelets (see aperture.js) after it.
//
// FIELD_SHADER fills the cross section; SCREEN_SHADER fills the face of
// the screen plate. Both take these uniforms:
//   uK             wavenumber, 2 pi / wavelength
//   uPlaneWave     1 for a plane wave travelling along uBeamDir, 0 for
//                  the point source at (uSourceX, uSourceY), which is
//                  uSourceDistance from the plate's center
//   uApertureX, uWallHalf, uApertureHalf, uCenterY
//                  the plate's column, half its thickness, half its
//                  height, and the axis's row
//   uRows          what each row of the aperture line is (aperture.js)
//   uWavelets, uWaveletCount, uMode
//                  the wavelets to sum, and whether they are slit rows or
//                  lens rings

import { float, HEAD } from "../glsl.js";
import { BEAM_FALLOFF, MODE_LENS, ROW_LENS, ROW_OPEN } from "./aperture.js";

// The light at a point x along the axis and p across it, where p.y is the
// height above the axis and p.x the distance out of the cross section.
const WAVEFIELD = `
uniform float uK, uSourceX, uSourceY, uSourceDistance, uApertureX, uWallHalf, uApertureHalf, uCenterY;
uniform int uPlaneWave, uMode, uWaveletCount;
uniform vec2 uBeamDir;
uniform sampler2D uRows, uWavelets;

const float TAU = 6.28318531;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// A unit wave after travelling distance d: phase k d.
vec2 wave(float d) {
  float kd = mod(uK * d, TAU);
  return vec2(cos(kd), sin(kd));
}

// One wavelet, seen from distance r, dx of it along the axis. It fades as
// 1/r, as a spherical wave does, and is weaker sideways (the obliquity
// factor (1 + cos theta) / 2).
vec2 wavelet(float r, float dx) {
  return 0.5 * (1.0 + dx / r) / r * wave(r);
}

// The light arriving from the source. The plane wave has strength 1 and
// phase 0 where it crosses the plate's center. The point source's
// spherical wave fades as 1/distance, scaled to strength 1 at the plate's
// center.
vec2 incident(float x, vec2 p) {
  if (uPlaneWave == 1) return wave(dot(uBeamDir, vec2(x - uApertureX, p.y)));
  float d = length(vec3(x - uSourceX, p.x, p.y - uSourceY));
  return uSourceDistance / max(d, 0.5) * wave(d);
}

// The beam's soft edge (BEAM_FALLOFF in aperture.js), at point q of the
// plate measured from its center.
float beamProfile(vec2 q) {
  return exp(-${float(BEAM_FALLOFF)} * dot(q, q) / (uApertureHalf * uApertureHalf));
}

// A full-width slit row at height rowY, whose light came distance R from
// the point source. Summing its wavelets along the row (in closed form)
// leaves one wavelet whose strength fades as 1/sqrt(r (R + r)) for a
// point source, or 1/sqrt(r) for a plane wave.
vec2 slitRow(vec4 w, float dx, vec2 p) {
  float rowY = w.x;
  float R = w.w;
  float r = length(vec2(dx, p.y - rowY));
  float spread = uPlaneWave == 1 ? sqrt(r) : sqrt(r / (R + r));
  return spread * cmul(w.yz, wavelet(r, dx));
}

// A ring of radius rho of a lens centered at height centerY, summed by
// averaging over points around it. At angle phi a point of the ring sits
// rho cos(phi) out of the cross section and rho sin(phi) above the lens's
// center. pc and sc are the point and the source's height measured from
// that center.
vec2 lensRing(vec4 w, float dx, vec2 p) {
  float rho = w.x;
  float centerY = w.w;
  vec2 pc = p - vec2(0.0, centerY);
  float sc = uSourceY - centerY;
  float toP2 = dx * dx + dot(pc, pc) + rho * rho;
  float toSource2 = pow(uApertureX - uSourceX, 2.0) + sc * sc + rho * rho;
  // The phase swings by about this much around the ring, so that many
  // points, plus a margin, are enough for an accurate average.
  float tilt = uPlaneWave == 1 ? abs(uBeamDir.y) : abs(sc) / sqrt(toSource2);
  float swing = uK * rho * (length(pc) / sqrt(toP2) + tilt);
  int n = min(int(swing) + 8, 256);
  vec2 sum = vec2(0.0);
  for (int j = 0; j < n; j++) {
    float phi = (float(j) + 0.5) * TAU / float(n);
    vec2 q = rho * vec2(cos(phi), sin(phi));
    vec2 onPlate = vec2(q.x, centerY + q.y);
    vec2 arriving = beamProfile(onPlate) * incident(uApertureX, onPlate);
    float r = sqrt(toP2 - 2.0 * dot(pc, q));
    sum += cmul(arriving, wavelet(r, dx));
  }
  return cmul(w.yz, sum / float(n));
}

vec2 lightAt(float x, vec2 p) {
  // Before the plate, and in its openings, the light is the source's.
  bool inWall = abs(x - uApertureX) <= uWallHalf;
  float kind = inWall ? texelFetch(uRows, ivec2(int(p.y + uCenterY), 0), 0).x : 0.0;
  bool open = kind == ${float(ROW_OPEN)} || kind == ${float(ROW_LENS)};
  if (x < uApertureX - uWallHalf || (inWall && open)) return incident(x, p);
  if (inWall) return vec2(0.0);

  // After the plate, it is the sum of the wavelets.
  float dx = x - uApertureX;
  vec2 u = vec2(0.0);
  for (int i = 0; i < uWaveletCount; i++) {
    vec4 w = texelFetch(uWavelets, ivec2(i, 0), 0);
    u += uMode == ${MODE_LENS} ? lensRing(w, dx, p) : slitRow(w, dx, p);
  }
  return u;
}`;

// The cross section: R, G = the light's complex amplitude.
export const FIELD_SHADER = `${HEAD}${WAVEFIELD}
out vec4 outColor;
void main() {
  vec2 c = floor(gl_FragCoord.xy);
  outColor = vec4(lightAt(c.x, vec2(0.0, c.y - uCenterY)), 0.0, 0.0);
}`;

// The screen plate, seen face on: R, G = complex amplitude, B = intensity.
// Full-width slits give the same light all the way across, so only the
// height matters for them.
export const SCREEN_SHADER = `${HEAD}${WAVEFIELD}
uniform float uScreenX;
out vec4 outColor;
void main() {
  vec2 p = floor(gl_FragCoord.xy) - uCenterY;
  vec2 u = lightAt(uScreenX, uMode == ${MODE_LENS} ? p : vec2(0.0, p.y));
  outColor = vec4(u, dot(u, u), 0.0);
}`;
