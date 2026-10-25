// Shared geometry, physics constants, colors and control panel used by
// both the Canvas 2D and the WebGL versions, so they show the same scene.

export const BASE_W = 480;
export const BASE_H = 300;

// (wave speed * dt / dx)^2. The scheme is stable only below 0.5.
export const C2 = 0.25;
// Weight of each new step in the screen's running intensity average.
export const AVG = 0.004;
// Simulation steps per drawn frame at 1x resolution.
const SPEED = 3;
// Fixed slit layout, in cells of the 1x grid.
const SLIT_SEPARATION = 60;
const SLIT_WIDTH = 8;
// Grid cells per nanometre of wavelength at 1x, so 550 nm is 16 cells.
const CELLS_PER_NM = 16 / 550;
// How strongly wave values map to brightness.
export const GAIN = 8;

export const BG = [6, 8, 14];
export const WALL = [120, 124, 136];

// Changing any of these rebuilds the grid and restarts the wave.
export const RESET_KEYS = new Set(["resolution", "reset"]);

// Sizes are set for the 1x grid; higher resolutions scale everything
// up so the scene looks the same, just with finer cells.
export function geometry(params) {
  const r = params.resolution;
  const W = BASE_W * r;
  const H = BASE_H * r;
  const sponge = 24 * r;
  return {
    r,
    W,
    H,
    sponge,
    wallSponge: 16 * r,
    stripW: 20 * r,
    srcX: Math.round(W * 0.12),
    srcY: Math.floor(H / 2),
    srcRadius: 1.5 * r,
    barrierX: Math.round(W * 0.4),
    barrierHalf: r,
    centerY: Math.floor(H / 2),
    slitHalfSep: (SLIT_SEPARATION * r) / 2,
    slitHalfWidth: (SLIT_WIDTH * r) / 2,
    screenX: W - sponge - 2,
  };
}

function inSlit(g, y) {
  return Math.abs(Math.abs(y - g.centerY) - g.slitHalfSep) <= g.slitHalfWidth;
}

export function isWall(g, x, y) {
  return Math.abs(x - g.barrierX) <= g.barrierHalf && !inSlit(g, y);
}

// Damping that ramps up toward the grid edges and toward the source side
// of the wall, so waves fade out there instead of reflecting.
export function spongeAt(g, x, y) {
  const d = Math.min(x, y, g.W - 1 - x, g.H - 1 - y);
  let k = Math.max(g.sponge - d, 0) / g.sponge;
  const front = g.barrierX - g.barrierHalf - x;
  if (front >= 0 && front < g.wallSponge && !inSlit(g, y)) {
    k = Math.max(k, 1 - front / g.wallSponge);
  }
  return 0.25 * k * k;
}

export function makeSource() {
  return { t: 0, phase: 0 };
}

// Advances the source one step and returns its value. The phase is
// accumulated so changing the wavelength mid-run doesn't cause a jump.
export function advanceSource(source, params, g) {
  const lambda = params.wavelength * CELLS_PER_NM * g.r;
  source.t += 1;
  source.phase += (2 * Math.PI * Math.sqrt(C2)) / lambda;
  const ramp = 1 - Math.exp(-source.t / (2 * lambda));
  return ramp * Math.sin(source.phase);
}

export function stepsPerFrame(g) {
  return SPEED * g.r;
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

export function createControls(panel, { onChange }) {
  const params = { resolution: 1, wavelength: 550 };
  let paused = false;

  const resRow = row(panel, "Resolution");
  const select = document.createElement("select");
  for (const r of [1, 2, 3, 4]) {
    select.add(new Option(`${r}× (${BASE_W * r}×${BASE_H * r})`, r));
  }
  select.addEventListener("change", () => {
    params.resolution = Number(select.value);
    onChange("resolution");
  });
  resRow.append(select);

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
    onChange("wavelength");
  });
  waveRow.append(input, out);

  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const pause = Object.assign(document.createElement("button"), { textContent: "Pause" });
  pause.addEventListener("click", () => {
    paused = !paused;
    pause.textContent = paused ? "Play" : "Pause";
  });
  const reset = Object.assign(document.createElement("button"), { textContent: "Reset" });
  reset.addEventListener("click", () => onChange("reset"));
  buttons.append(pause, reset);

  const stats = document.createElement("p");
  stats.className = "stats";
  panel.append(buttons, stats);

  let frames = 0;
  let cells = 0;
  let last = performance.now();

  return {
    params,
    get paused() {
      return paused;
    },
    // Call once per drawn frame with the number of cell updates it did.
    frame(cellUpdates) {
      frames += 1;
      cells += cellUpdates;
      const now = performance.now();
      if (now - last >= 500) {
        const secs = (now - last) / 1000;
        stats.textContent =
          `${Math.round(frames / secs)} fps · ` +
          `${(cells / secs / 1e6).toFixed(1)} M cell updates/s`;
        frames = 0;
        cells = 0;
        last = now;
      }
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
