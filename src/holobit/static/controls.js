// The control panel. Changing the aperture, wavelength or source height
// calls onChange,
// which recomputes the light; the view button switches between the flat
// slice and the oblique view of the planes.

import { APERTURES } from "./optics.js";

export function createControls(panel, { onChange }) {
  const params = { aperture: "double", wavelength: 550, sourceHeight: 0, view: "slice" };
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

  const slider = (label, key, { min, max, step, format }) => {
    const input = Object.assign(document.createElement("input"), {
      type: "range",
      min,
      max,
      step,
      value: params[key],
    });
    const out = Object.assign(document.createElement("output"), { value: format(params[key]) });
    input.addEventListener("input", () => {
      params[key] = Number(input.value);
      out.value = format(params[key]);
      onChange();
    });
    row(panel, label).append(input, out);
  };

  slider("Wavelength", "wavelength", { min: 400, max: 700, step: 10, format: (v) => `${v} nm` });
  // In grid cells above the axis; the planes are 300 cells tall.
  slider("Source height", "sourceHeight", {
    min: -100,
    max: 100,
    step: 5,
    format: (v) => (v > 0 ? `+${v}` : `${v}`),
  });

  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const view = Object.assign(document.createElement("button"), { textContent: "Show planes" });
  view.addEventListener("click", () => {
    params.view = params.view === "slice" ? "planes" : "slice";
    view.textContent = params.view === "slice" ? "Show planes" : "Show slice";
  });
  const pause = Object.assign(document.createElement("button"), { textContent: "Pause" });
  pause.addEventListener("click", () => {
    paused = !paused;
    pause.textContent = paused ? "Play" : "Pause";
  });
  buttons.append(view, pause);

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
    // Call when the light has finished computing.
    computed(ms) {
      computeText = ` · light computed in ${Math.round(ms)} ms`;
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
