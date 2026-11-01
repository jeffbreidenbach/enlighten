// What the explanation box says after each control changes: a string, or
// a function of the settings when the text depends on them. The texts
// build up, step by step, the ideas a student needs for holographic
// stereograms: diffraction, interference, gratings, a lens as the hologram
// of a point, superposition, reference beams and viewpoints.

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
  // Where the off-center lens sends the light depends on the light.
  lens: (params) =>
    "A Fresnel lens is a flattened lens: rings that delay the light just enough to bend every part " +
    "of the wave toward one point. This one is off center. " +
    (params.light === "point"
      ? "Lit by the point source, it both steers and focuses, sending the light up to a spot high " +
        "on the screen. "
      : "A straight-on plane wave focuses along the lens's own axis, to a spot just above the " +
        "screen's center. ") +
    "A lens like this is the hologram of a single point.",
  lens2:
    "Two lenses overlaid on one plate focus light to two separate points at once. A hologram works " +
    "the same way: it is the sum of the 'lenses' for every point of an object, all on one plate. A " +
    "holographic stereogram goes one step further, stitching together many such views.",

  // Light.
  point:
    "A point source sends out spherical waves, the simplest light anything can give off. Every " +
    "point on a real object scatters light like this, so an object's light is the sum of countless " +
    "point sources.",
  plane:
    "A plane wave has flat wavefronts all travelling one way, like a laser beam. Holograms are " +
    "recorded and replayed with a beam like this, called the reference beam.",

  // Sliders.
  wavelength:
    "Wavelength sets the color. Longer, redder waves bend more at the same slits or grating, so " +
    "their patterns spread wider; shorter, bluer waves spread less. That is why a hologram lit by " +
    "white light shimmers with color.",
  // The same angle for either light; what it shows depends on which.
  angle: (params) =>
    params.light === "point"
      ? "Moving the source moves where its light comes from. The fringes slide, and a lens's spot " +
        "moves to the opposite side: an upside-down image of the source. Every point of an object " +
        "lands in its own place this way."
      : "Tilting the plane wave makes it cross the plate at an angle. This is the key idea of " +
        "off-axis holography: with the reference beam at an angle, the image comes out in a " +
        "different direction from the leftover light. At 45 degrees the grating's first order " +
        "comes straight out.",

  // Views.
  full:
    "The full view shows the whole setup: the light source, the aperture plate and the screen. A " +
    "piece of film placed where the screen is would record exactly the pattern shown on it.",
  cross:
    "The cross section is a slice through the middle of the setup, showing the waves themselves. " +
    "The bar on the right is the screen, seen edge-on.",
};
