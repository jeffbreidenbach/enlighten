// The control panel: the controls on the left, and on the right a short
// explanation of whatever was just changed. Changing the aperture, light,
// wavelength, source height or beam angle calls onChange, which
// recomputes the light; the view button switches between the flat slice
// and the oblique view of the planes.

import { EXPLANATIONS } from "./explanations.js";
import { APERTURES, DEFAULT_WAVELENGTH } from "./optics.js";

export function createControls(panel, { onChange }) {
  const params = {
    aperture: "single",
    light: "point",
    wavelength: DEFAULT_WAVELENGTH,
    sourceHeight: 0,
    beamAngle: 45,
    view: "slice",
  };

  const group = document.createElement("div");
  group.className = "controls";
  const text = document.createElement("p");
  text.className = "explain";
  panel.append(group, text);
  const explain = (key) => (text.textContent = EXPLANATIONS[key]);

  const apRow = row(group, "Aperture");
  const apSelect = document.createElement("select");
  for (const [key, label] of Object.entries(APERTURES)) apSelect.add(new Option(label, key));
  apSelect.value = params.aperture;
  apSelect.addEventListener("change", () => {
    params.aperture = apSelect.value;
    explain(params.aperture);
    onChange();
  });
  apRow.append(apSelect);

  // The point source is placed by its height; the plane wave is aimed by
  // its angle. Only the slider for the chosen light shows.
  const lightRow = row(group, "Light");
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
    explain(params.light);
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
      explain(key);
      onChange();
    });
    const r = row(group, label);
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
  const view = Object.assign(document.createElement("button"), { textContent: "Full View" });
  view.addEventListener("click", () => {
    params.view = params.view === "slice" ? "planes" : "slice";
    view.textContent = params.view === "slice" ? "Full View" : "Cross Section";
    explain(params.view === "slice" ? "cross" : "full");
  });
  buttons.append(view);
  group.append(buttons);

  explain(params.aperture);
  return { params };
}

function row(parent, label) {
  const el = document.createElement("label");
  el.className = "row";
  const span = Object.assign(document.createElement("span"), { textContent: label });
  el.append(span);
  parent.append(el);
  return el;
}
