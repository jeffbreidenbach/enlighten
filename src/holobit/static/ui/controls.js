// The control panel: the controls on the left, then a short explanation
// of whatever was just changed, then the tour's back and next buttons.
// Changing the aperture, plate size, source distance, wavelength or
// incident angle, or reversing the beam, calls onChange, which recomputes
// the light; the view button switches between the cross section and the
// full view. With both plates of a stacked hologram lit and the beam
// reversed, another button moves the eye between them.

import { APERTURES } from "../physics/aperture.js";
import {
  DEFAULT_PLATE,
  DEFAULT_WAVELENGTH,
  FARTHEST,
  MAX_PLATE,
  microns,
  MIN_PLATE,
  sourceMicrons,
} from "../physics/layout.js";
import { EXPLANATIONS } from "./explanations.js";
import { TOUR } from "./tour.js";

const DEFAULTS = {
  aperture: "single",
  plate: DEFAULT_PLATE,
  distance: 0,
  wavelength: DEFAULT_WAVELENGTH,
  angle: 0,
  view: "cross",
  reversed: false,
  eyeHalf: 1,
};

// When a tour step moves a slider, it sweeps there instead of jumping:
// one step every SWEEP_STEP_MS, of this size for each slider. Across the
// whole spectrum takes about a second and a half; 0 to 45 degrees, about
// a second and a half; the source out to infinity, a second; the plate from its
// default to its largest, half a second.
const SWEEP_STEP_MS = 50;
const SWEEP_SIZES = { wavelength: 10, angle: 1.5, distance: 5, plate: 8 };

// The full settings at each tour step: each step's changes on top of the
// ones before it, so stepping back restores everything.
const TOUR_STATES = TOUR.reduce((states, step) => {
  const before = states.at(-1) ?? DEFAULTS;
  return [...states, { ...before, ...step.set }];
}, []);

export function createControls(panel, { onChange }) {
  const params = { ...DEFAULTS };
  // A tour step's slider sweep in progress. Touching any control stops
  // it, so the sweep never fights a hand on a slider.
  let sweep = null;
  panel.addEventListener("input", () => clearInterval(sweep), { capture: true });
  panel.addEventListener("change", () => clearInterval(sweep), { capture: true });

  const group = document.createElement("div");
  group.className = "controls";
  const text = document.createElement("p");
  text.className = "explain";
  panel.append(group, text);
  const explain = (key) => {
    const entry = EXPLANATIONS[key];
    text.textContent = typeof entry === "function" ? entry(params) : entry;
  };

  const apRow = row(group, "Aperture");
  const apSelect = document.createElement("select");
  for (const [key, label] of Object.entries(APERTURES)) apSelect.add(new Option(label, key));
  apSelect.addEventListener("change", () => {
    params.aperture = apSelect.value;
    sync();
    explain(params.aperture);
    onChange();
  });
  apRow.append(apSelect);

  // Each slider and its readout, so sync() can set them.
  const sliders = {};
  const slider = (label, key, { min, max, step, format }) => {
    const input = Object.assign(document.createElement("input"), { type: "range", min, max, step });
    const out = document.createElement("output");
    input.addEventListener("input", () => {
      params[key] = Number(input.value);
      show(out, format(params[key]));
      explain(key);
      onChange();
    });
    const r = row(group, label);
    r.append(input, out);
    sliders[key] = { input, out, format, row: r };
  };

  // How tall (and wide) the aperture plate is, which is also how wide the
  // beam is.
  slider("Plate size", "plate", {
    min: MIN_PLATE,
    max: MAX_PLATE,
    step: 8,
    format: (v) => `${Math.round(microns(v))} µm`,
  });
  // How far away the point source is, from nearest to infinitely far,
  // where it becomes a plane wave.
  slider("Source distance", "distance", {
    min: 0,
    max: FARTHEST,
    step: 1,
    format: (v) => (v === FARTHEST ? "∞" : `${Math.round(sourceMicrons(v))} µm`),
  });
  slider("Wavelength", "wavelength", { min: 400, max: 700, step: 10, format: (v) => `${v} nm` });
  // The direction the light arrives from at the center of the aperture
  // plate, in degrees from the axis, however far the source. Positive comes from
  // above.
  slider("Incident angle", "angle", {
    min: -60,
    max: 60,
    step: 1,
    // Whole degrees, even part way through a tour sweep.
    format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}°`,
  });

  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const view = document.createElement("button");
  view.addEventListener("click", () => {
    params.view = params.view === "cross" ? "full" : "cross";
    sync();
    explain(params.view);
  });
  // Whether the beam comes the usual way, making real images, or reversed,
  // making virtual ones; lit up while virtual.
  const reverse = document.createElement("button");
  reverse.addEventListener("click", () => {
    params.reversed = !params.reversed;
    sync();
    explain("reversed");
    onChange();
  });
  // With both plates of a stacked hologram lit, which one the eye looks
  // through.
  const eye = document.createElement("button");
  eye.addEventListener("click", () => {
    params.eyeHalf = -params.eyeHalf;
    sync();
    explain("eyeHalf");
    onChange();
  });
  buttons.append(view, reverse, eye);
  group.append(buttons);

  // Makes every control show what params holds.
  function sync() {
    apSelect.value = params.aperture;
    for (const [key, s] of Object.entries(sliders)) {
      s.input.value = params[key];
      show(s.out, s.format(params[key]));
    }
    view.textContent = params.view === "cross" ? "Full View" : "Cross Section";
    reverse.textContent = params.reversed ? "Virtual" : "Real";
    reverse.setAttribute("aria-pressed", params.reversed);
    eye.textContent = params.eyeHalf > 0 ? "Eye ▲" : "Eye ▼";
    eye.title = `The eye looks through the ${params.eyeHalf > 0 ? "top" : "bottom"} plate`;
    eye.hidden = !params.reversed || params.aperture !== "stack";
  }

  // The tour: back and next arrows with the step number between them.
  // Changing a control by hand leaves the tour where it was.
  const tour = document.createElement("div");
  tour.className = "tour";
  const back = Object.assign(document.createElement("button"), {
    textContent: "◀",
    title: "Previous step",
  });
  const count = document.createElement("span");
  const next = Object.assign(document.createElement("button"), {
    textContent: "▶",
    title: "Next step",
  });
  tour.append(back, count, next);
  panel.append(tour);

  let step = 0;
  // Shows tour step i. Sliders the step moves sweep through the values in
  // between instead of jumping, so the rainbow or the tilt plays out; a
  // new aperture appears at once, and its sliders sweep from there. The
  // first call, while the page is starting, only sets the controls: the
  // light is computed once everything is ready.
  function goTo(i, { initial = false } = {}) {
    clearInterval(sweep);
    step = i;
    const from = { ...params };
    Object.assign(params, TOUR_STATES[step]);
    const targets = {};
    for (const key of Object.keys(SWEEP_SIZES)) {
      if (initial || params[key] === from[key]) continue;
      targets[key] = params[key];
      params[key] = from[key];
    }
    if (Object.keys(targets).length > 0) {
      sweep = setInterval(() => {
        let done = true;
        for (const [key, to] of Object.entries(targets)) {
          const size = SWEEP_SIZES[key];
          const left = to - params[key];
          params[key] += Math.sign(left) * Math.min(size, Math.abs(left));
          if (params[key] !== to) done = false;
        }
        if (done) clearInterval(sweep);
        sync();
        onChange();
      }, SWEEP_STEP_MS);
    }
    sync();
    text.textContent = TOUR[step].text;
    count.textContent = `${step + 1} / ${TOUR.length}`;
    back.disabled = step === 0;
    next.disabled = step === TOUR.length - 1;
    if (!initial) onChange();
  }
  back.addEventListener("click", () => goTo(step - 1));
  next.addEventListener("click", () => goTo(step + 1));
  goTo(0, { initial: true });

  return { params };
}

// Sets a slider's readout. The infinity sign is set larger, so it reads
// as clearly as the numbers.
function show(out, text) {
  out.value = text;
  out.classList.toggle("infinite", text === "∞");
}

function row(parent, label) {
  const el = document.createElement("label");
  el.className = "row";
  const span = Object.assign(document.createElement("span"), { textContent: label });
  el.append(span);
  parent.append(el);
  return el;
}
