// Shared scene, physics and control panel used by both the Canvas 2D and
// the WebGL versions, so they show the same thing.
//
// Light is treated as a steady wave of one color. Each pixel holds a
// complex amplitude (strength and phase) worked out once by adding up
// wavelets from every open point of the aperture (Huygens' principle).
// Animating only advances the phase, so the pattern is settled from the
// first frame and nothing ever reflects.

export const BASE_W = 480;
export const BASE_H = 300;

// Grid cells per nanometre of wavelength at 1x, so 550 nm is 16 cells.
const CELLS_PER_NM = 16 / 550;
// How far crests move per drawn frame, in cells of the 1x grid.
const SPEED = 1.5;
// How strongly wave values map to brightness.
export const GAIN = 2.5;

export const BG = [6, 8, 14];
export const WALL = [120, 124, 136];
export const GLASS = [150, 190, 220];

export const APERTURES = {
  single: "Single slit",
  double: "Double slit",
  grating: "Grating",
  lens: "Fresnel lens",
};

// Open parts of the wall as [center offset, half width], in 1x cells.
const OPENINGS = {
  single: [[0, 20]],
  double: [
    [-30, 4],
    [30, 4],
  ],
  grating: [-3, -2, -1, 0, 1, 2, 3].map((n) => [n * 30, 3]),
  lens: [[0, 105]],
};

// Row kinds along the wall.
export const ROW_WALL = 0;
export const ROW_OPEN = 1;
export const ROW_LENS = 2;

// Sizes are set for the 1x grid; higher resolutions scale everything
// up so the scene looks the same, just with finer cells.
export function geometry(params) {
  const r = params.resolution;
  const W = BASE_W * r;
  const H = BASE_H * r;
  return {
    r,
    W,
    H,
    stripW: 20 * r,
    srcX: Math.round(W * 0.12),
    srcY: Math.floor(H / 2),
    barrierX: Math.round(W * 0.4),
    barrierHalf: r,
    centerY: Math.floor(H / 2),
    // Where the lens brings the light to a focus.
    focusX: Math.round(W * 0.75),
    screenX: W - 4 * r,
    k: (2 * Math.PI) / (params.wavelength * CELLS_PER_NM * r),
  };
}

// The wave arriving from the point source, scaled so its strength is 1
// where it reaches the wall. Returns [re, im].
export function incident(g, x, y) {
  const d = Math.max(Math.hypot(x - g.srcX, y - g.srcY), 0.5);
  const a = Math.sqrt((g.barrierX - g.srcX) / d);
  const kr = g.k * d;
  return [a * Math.cos(kr), a * Math.sin(kr)];
}

// Describes each row of the wall: whether it is wall, open or lens, and
// the strength and phase of the wavelet it sends on. For the lens, the
// phase delay is what a perfect lens would add, wrapped every full
// wavelength the way a Fresnel lens's grooves are; `groove` is how far
// through each groove a row sits, used only for drawing.
export function aperture(params, g) {
  const kind = new Uint8Array(g.H);
  const re = new Float32Array(g.H);
  const im = new Float32Array(g.H);
  const groove = new Float32Array(g.H);
  const lens = params.aperture === "lens";
  const toSource = g.barrierX - g.srcX;
  const toFocus = g.focusX - g.barrierX;
  // Huygens-Fresnel factor for 2D wavelets: strength sqrt(k / 2pi), and
  // a 45 degree phase lag.
  const amp = Math.sqrt(g.k / (2 * Math.PI));

  for (let y = 0; y < g.H; y++) {
    const dy = y - g.centerY;
    const open = OPENINGS[params.aperture].some(
      ([center, half]) => Math.abs(dy - center * g.r) <= half * g.r,
    );
    if (!open) continue;

    let phase = -Math.PI / 4;
    if (lens) {
      const delay =
        g.k * (Math.hypot(dy, toSource) - toSource + Math.hypot(dy, toFocus) - toFocus);
      phase -= delay;
      groove[y] = (delay / (2 * Math.PI)) % 1;
    }
    const [ur, ui] = incident(g, g.barrierX, y);
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    kind[y] = lens ? ROW_LENS : ROW_OPEN;
    re[y] = amp * (ur * c - ui * s);
    im[y] = amp * (ur * s + ui * c);
  }
  return { kind, re, im, groove };
}

// How much the phase advances per drawn frame.
export function phaseStep(g) {
  return g.k * SPEED * g.r;
}

// Approximate on-screen color of a visible wavelength (Dan Bruton's
// piecewise fit), as [r, g, b] in 0..255.
export function wavelengthColor(nm) {
  let r = 0;
  let gr = 0;
  let b = 0;
  if (nm < 440) [r, b] = [(440 - nm) / 60, 1];
  else if (nm < 490) [gr, b] = [(nm - 440) / 50, 1];
  else if (nm < 510) [gr, b] = [1, (510 - nm) / 20];
  else if (nm < 580) [r, gr] = [(nm - 510) / 70, 1];
  else if (nm < 645) [r, gr] = [1, (645 - nm) / 65];
  else r = 1;
  // Dim toward the ends of the visible range, where the eye is less sensitive.
  const edge = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  return [r, gr, b].map((c) => Math.round(255 * Math.pow(c * edge, 0.8)));
}

// Builds the control panel. Any change calls onChange, which recomputes
// the field.
export function createControls(panel, { onChange }) {
  const params = { aperture: "double", resolution: 1, wavelength: 550 };
  let paused = false;

  const apRow = row(panel, "Aperture");
  const apSelect = document.createElement("select");
  for (const [key, label] of Object.entries(APERTURES)) apSelect.add(new Option(label, key));
  apSelect.value = params.aperture;
  apSelect.addEventListener("change", () => {
    params.aperture = apSelect.value;
    onChange();
  });
  apRow.append(apSelect);

  const resRow = row(panel, "Resolution");
  const resSelect = document.createElement("select");
  for (const r of [1, 2, 3, 4]) {
    resSelect.add(new Option(`${r}× (${BASE_W * r}×${BASE_H * r})`, r));
  }
  resSelect.addEventListener("change", () => {
    params.resolution = Number(resSelect.value);
    onChange();
  });
  resRow.append(resSelect);

  const waveRow = row(panel, "Wavelength");
  const input = Object.assign(document.createElement("input"), {
    type: "range",
    min: 400,
    max: 700,
    step: 10,
    value: params.wavelength,
  });
  const out = Object.assign(document.createElement("output"), { value: `${params.wavelength} nm` });
  input.addEventListener("input", () => {
    params.wavelength = Number(input.value);
    out.value = `${input.value} nm`;
    onChange();
  });
  waveRow.append(input, out);

  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const pause = Object.assign(document.createElement("button"), { textContent: "Pause" });
  pause.addEventListener("click", () => {
    paused = !paused;
    pause.textContent = paused ? "Play" : "Pause";
  });
  buttons.append(pause);

  const stats = document.createElement("p");
  stats.className = "stats";
  panel.append(buttons, stats);

  let frames = 0;
  let last = performance.now();
  let fps = 0;
  let computeText = "";
  const show = () => (stats.textContent = `${fps} fps${computeText}`);

  return {
    params,
    get paused() {
      return paused;
    },
    // Call once per drawn frame.
    frame() {
      frames += 1;
      const now = performance.now();
      if (now - last >= 500) {
        fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        show();
      }
    },
    // Call when the field has finished computing.
    computed(ms) {
      computeText = ` · field computed in ${Math.round(ms)} ms`;
      show();
    },
  };
}

function row(panel, label) {
  const el = document.createElement("label");
  el.className = "row";
  const span = Object.assign(document.createElement("span"), { textContent: label });
  el.append(span);
  panel.append(el);
  return el;
}
