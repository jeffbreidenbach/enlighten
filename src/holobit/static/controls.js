// The control panel. Changing the aperture, light, wavelength, source
// height or beam angle calls onChange, which recomputes the light; the
// view button switches between the flat slice and the oblique view of the
// planes.

import { APERTURES, DEFAULT_WAVELENGTH } from "./optics.js";

export function createControls(panel, { onChange }) {
  const params = {
    aperture: "double",
    light: "point",
    wavelength: DEFAULT_WAVELENGTH,
    sourceHeight: 0,
    beamAngle: 45,
    view: "slice",
  };
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

  // The point source is placed by its height; the plane wave is aimed by
  // its angle. Only the slider for the chosen light shows.
  const lightRow = row(panel, "Light");
  const lightSelect = document.createElement("select");
  lightSelect.add(new Option("Point source", "point"));
  lightSelect.add(new Option("Plane wave", "plane"));
  const showLightSlider = () => {
    heightRow.hidden = params.light !== "point";
    angleRow.hidden = params.light !== "plane";
  };
  lightSelect.addEventListener("change", () => {
    params.light = lightSelect.value;
    showLightSlider();
    onChange();
  });
  lightRow.append(lightSelect);

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
    const r = row(panel, label);
    r.append(input, out);
    return r;
  };

  slider("Wavelength", "wavelength", { min: 400, max: 700, step: 10, format: (v) => `${v} nm` });
  const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
  // In base cells above the axis, up to the aperture plane's edge (it is
  // 80 cells tall).
  const heightRow = slider("Source height", "sourceHeight", {
    min: -40,
    max: 40,
    step: 2,
    format: signed,
  });
  // Degrees from the axis; positive comes from above.
  const angleRow = slider("Beam angle", "beamAngle", {
    min: -60,
    max: 60,
    step: 1,
    format: (v) => `${signed(v)}°`,
  });
  showLightSlider();

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
