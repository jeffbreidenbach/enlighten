// Small shared pieces for the shaders, which all run once per pixel of a
// full-screen square.

export const HEAD = `
precision highp float;
precision highp int;
precision highp sampler2D;
`;

export const FULLSCREEN_VERTEX = `${HEAD}
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// A number as a GLSL float literal.
export const float = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

// An [r, g, b] color in 0..255 as a GLSL vec3.
export const vec3 = (c) => `vec3(${c.map((v) => (v / 255).toFixed(4)).join(", ")})`;
