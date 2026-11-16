// What the explanation box says after each control changes: a string, or
// a function of the settings when the text depends on them. The texts
// build up, step by step, the ideas a student needs for holographic
// stereograms: diffraction, interference, gratings, the hologram of a
// point, superposition, reference beams and viewpoints.

import { FARTHEST } from "../physics/layout.js";

export const EXPLANATIONS = {
  // Apertures.
  single:
    "A slit about one wavelength wide acts as a brand-new source: light fans out from it in every " +
    "direction. This spreading is diffraction, and it is the starting point for everything that " +
    "follows, holograms included.",
  double:
    "Two slits make two overlapping sets of waves. Where crest meets crest the light adds up into a " +
    "bright fringe; where crest meets trough it cancels. The fringe spacing encodes where the two " +
    "sources are, which is exactly the kind of information a hologram records.",
  grating:
    "A sine grating is a pattern of stripes whose transparency rises and falls smoothly. That is " +
    "exactly what two interfering plane waves record on film, so this is the simplest possible " +
    "hologram. Lit by a plane wave, it splits the light into just a few beams, called orders: " +
    "tilt the beam to 45 degrees and its first order comes straight out.",
  // Where a point hologram sends the light depends on the light.
  point: (params) =>
    "A hologram of a point, bleached clear so its fringes delay the light instead of blocking " +
    "it: a sine grating with curved fringes. Lit by its 45-degree reference beam, it bends " +
    "light straight ahead and focuses it to a spot on the screen." +
    (params.distance !== FARTHEST
      ? " Lit by a nearer source than the plane wave it was recorded with, it focuses beyond " +
        "the screen."
      : params.angle !== 45
        ? " Lit at another angle, the light misses the point, and other waves reach the screen."
        : ""),
  point2:
    "Two points recorded on one plate: their fringes add up, and the hologram focuses light to " +
    "both at once. A hologram of an object records every point of it on one plate. A " +
    "holographic stereogram goes one step further, stitching together many such views.",
  square:
    "A hologram of the outline of a square, worked out from the square itself: the light of " +
    "every point of the outline meets the reference beam on the film, and the film records it " +
    "all at once. Lit again, it rebuilds the whole outline on the screen. Its lines are as " +
    "sharp as the hologram is big.",
  circle:
    "A hologram of the outline of a circle, recorded like the square: worked out from the light " +
    "of every point of it. Lit again, it rebuilds the circle on the screen.",
  stack:
    "Two holograms, stacked: the square on the top plate, the circle on the bottom one, both " +
    "landing in the same place on the screen, and one wide beam lighting both. As real images " +
    "they show at once; as virtual images, an eye sees only the one on the plate it looks " +
    "through.",
  eyeHalf:
    "The eye moves to look through the other plate. Light from each plate heads off in its own " +
    "direction, so the eye sees only the picture on the plate it looks through: move it, and " +
    "the picture changes.",
  stackSquare:
    "Two stacked plates, with only the top one lit: only the square, recorded there, appears. " +
    "Each plate can hold a different picture.",
  stackCircle:
    "Two stacked plates, with only the bottom one lit: only the circle, recorded there, " +
    "appears. A holographic stereogram holds many views this way, one per strip.",

  // Sliders.
  plate:
    "The plate sets how wide the beam is. A wider beam spreads less, so a bigger plate makes " +
    "sharper beams: the grating's orders narrow, and a hologram's spot shrinks. How sharp a " +
    "hologram's image can be depends on how big the hologram is.",
  distance: (params) =>
    params.distance === FARTHEST
      ? "Infinitely far away, the source's wavefronts are flat: a plane wave, all travelling one " +
        "way, like a laser beam. Holograms are recorded and replayed with a beam like this, called " +
        "the reference beam."
      : "A point source sends out spherical waves, like the light from every point of a real " +
        "object. The farther away it is, the flatter its wavefronts when they arrive; at infinity " +
        "they are a plane wave. A hologram, recorded with a plane wave, focuses a nearer source " +
        "beyond the screen, like a camera out of focus.",
  wavelength:
    "Wavelength sets the color. Longer, redder waves bend more at the same slits or grating, so " +
    "their patterns spread wider; shorter, bluer waves spread less. That is why a hologram lit by " +
    "white light shimmers with color.",
  // The same angle however far the source; what it shows depends on that.
  angle: (params) =>
    params.distance !== FARTHEST
      ? "Moving the source moves where its light comes from. The fringes slide, and a hologram's spot " +
        "moves to the opposite side: an upside-down image of the source. Every point of an object " +
        "lands in its own place this way."
      : "Tilting the plane wave makes it cross the plate at an angle. This is the key idea of " +
        "off-axis holography: with the reference beam at an angle, the image comes out in a " +
        "different direction from the leftover light. At 45 degrees the grating's first order " +
        "comes straight out.",

  // Reversing the beam.
  reversed: (params) =>
    params.reversed
      ? "The beam now comes from the screen's side, travelling back the way it went. A hologram " +
        "lit by its reference beam reversed sends its light back too: light that converged on " +
        "a point now spreads back out as if from that point. That virtual light, which only " +
        "seems to be there, is drawn in white."
      : "The beam comes from the source's side again.",

  // Views.
  full:
    "The full view shows the whole setup: the light source, the aperture plate and the screen. A " +
    "piece of film placed where the screen is would record exactly the pattern shown on it.",
  cross:
    "The cross section is a slice through the middle of the setup, showing the waves themselves. " +
    "The bar on the right is the screen, seen edge-on.",
};
