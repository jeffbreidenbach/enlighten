// The guided tour. Each step changes one thing and says what to notice,
// building from a single slit toward the ideas behind holographic
// stereograms. A step lists only what it changes; the tour carries the
// rest forward from the steps before it.

export const TOUR = [
  {
    set: {},
    text:
      "Light is a wave. Here it spreads from a point and meets a wall with one narrow slit, " +
      "then fans out from the slit as if it were a new source. This is diffraction.",
  },
  {
    set: { aperture: "double" },
    text:
      "Two slits make two sources. Where crests meet, the light adds up; where a crest meets a " +
      "trough, it cancels. The bands on the screen are interference fringes.",
  },
  {
    set: { wavelength: 450 },
    text:
      "Shorter, bluer waves: the crests crowd closer together, and so do the fringes on the " +
      "screen. Each color makes its own fringe spacing.",
  },
  {
    set: { wavelength: 650 },
    text:
      "Longer, redder waves spread the fringes wider. Holograms bend each color by its own " +
      "amount, which is why one lit by white light shimmers like a rainbow.",
  },
  {
    set: { angle: 45 },
    text:
      "Now move the source up. The fringes slide down: they record where the light came from. " +
      "Recording that information is the whole idea of a hologram.",
  },
  {
    set: { wavelength: 550 },
    text:
      "Back to green. The fringes close up again, but stay shifted: color and direction are " +
      "recorded together.",
  },
  {
    set: { view: "full" },
    text:
      "Step back to see the whole setup: the raised source, the plate with the slits, and the " +
      "screen. Film placed at the screen would record those fringes.",
  },
  {
    set: { angle: 0 },
    text: "Bring the source back to the middle, and the fringes slide back with it.",
  },
  {
    set: { distance: 100 },
    text:
      "Now move the source farther and farther away. Its waves arrive at the plate flatter and " +
      "flatter, and the beam narrows from a wedge to a straight band.",
  },
  {
    set: { view: "cross" },
    text:
      "Infinitely far away, the wavefronts are flat: a plane wave, like a laser beam. Holograms " +
      "are recorded and replayed with light like this, the reference beam.",
  },
  {
    set: { aperture: "grating" },
    text:
      "A sine grating's transparency rises and falls smoothly in stripes: what two plane waves " +
      "record on film, the simplest hologram. It splits the beam into a few orders.",
  },
  {
    set: { angle: 45 },
    text:
      "Tilt the beam to 45 degrees. Some light carries on at 45 degrees, but the grating bends " +
      "the rest straight ahead, away from the leftover light: off-axis holography.",
  },
  {
    set: { aperture: "point" },
    text:
      "Curve the fringes as a point's light records them, and bleach it clear: a hologram of a " +
      "point. The light it bends straight ahead converges to a spot on the screen.",
  },
  {
    set: { view: "full" },
    text:
      "From the side: the light bends level and converges to a spot on the screen, while the " +
      "leftover light heads off at 45 degrees.",
  },
  {
    set: { aperture: "point2" },
    text:
      "Record two points on one plate, and it focuses light to both. Add enough points and you " +
      "have an image.",
  },
  {
    set: { plate: 112 },
    text:
      "A bigger plate makes smaller spots: the bigger the hologram, the sharper its image.",
  },
  {
    set: { aperture: "square" },
    text:
      "Now a whole shape: the outline of a square. Every point of it meets the reference beam " +
      "on the film at once; lit again, the film rebuilds the square on the screen.",
  },
  {
    set: { aperture: "circle" },
    text:
      "A circle, the same size, recorded the same way. A hologram can show any shape.",
  },
  {
    set: { aperture: "stackCircle" },
    text:
      "Now two plates, stacked: the square above, the circle below, both landing in the same " +
      "place on the screen. Light only the bottom one, and the circle appears.",
  },
  {
    set: { aperture: "stackSquare" },
    text:
      "Light only the top plate, and the square takes its place. The light picks the picture: a " +
      "holographic stereogram is many strips, each holding one view.",
  },
  {
    set: { reversed: true },
    text:
      "Reverse the beam. The light now spreads back as if from the square on the screen. In " +
      "fading white: where it seems to come from. The square is a virtual image.",
  },
  {
    set: { aperture: "stackCircle" },
    text:
      "Light the bottom plate instead, and the virtual image becomes the circle, in the same " +
      "place.",
  },
  {
    set: { aperture: "stack", eyeHalf: -1 },
    text:
      "One wide beam lights both plates. Each sends its light its own way; the eye, looking " +
      "through the bottom plate, sees only the circle.",
  },
  {
    set: { eyeHalf: 1 },
    text:
      "Through the top plate, the eye sees only the square. A stereogram shows each eye " +
      "position its own view.",
  },
];
