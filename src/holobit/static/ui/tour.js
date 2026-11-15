// The guided tour. Each step changes one thing and says what to notice,
// building from a single slit toward the ideas behind holographic
// stereograms. A step lists only what it changes; the tour carries the
// rest forward from the steps before it.

export const TOUR = [
  {
    set: {},
    text:
      "Light is a wave. Here it spreads from a point on the left and meets a wall with one narrow " +
      "slit. Instead of passing straight through, it fans out from the slit as if the slit were a " +
      "new source. This is diffraction.",
  },
  {
    set: { aperture: "double" },
    text:
      "Two slits make two sources. Where their crests meet the light adds up; where a crest meets a " +
      "trough it cancels. The bright and dark bands on the screen are interference fringes.",
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
      "Longer, redder waves spread the fringes wider apart. Holograms bend light by color in just " +
      "this way, which is why one lit by white light shimmers like a rainbow.",
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
      "Step back to see the whole setup: the light source, raised above the axis, the plate with " +
      "the slits, and the screen. A piece of film where the screen is would record those fringes.",
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
      "Infinitely far away, the source's wavefronts are flat: a plane wave, all moving one way, " +
      "like a laser beam. Holograms are recorded and replayed with light like this, called the " +
      "reference beam.",
  },
  {
    set: { aperture: "grating" },
    text:
      "A sine grating is a plate whose transparency rises and falls smoothly in stripes. It is " +
      "what two plane waves record on film: the simplest hologram. It splits the beam into a few " +
      "separate beams, called orders.",
  },
  {
    set: { angle: 45 },
    text:
      "Tilt the beam to 45 degrees. Some light carries on at 45 degrees, but the grating bends the " +
      "rest straight ahead. Separating the useful beam from the leftover light this way is the key " +
      "to off-axis holography.",
  },
  {
    set: { aperture: "point" },
    text:
      "Now curve the grating's fringes, the way a point's light records them with this 45-degree " +
      "reference beam: a hologram of a single point, bleached clear so its fringes delay the " +
      "light instead of blocking it. The light it bends straight ahead now also converges, to a " +
      "small, bright spot on the screen; the leftover light carries on at 45 degrees and misses " +
      "the screen. Light the hologram, and it recreates the point.",
  },
  {
    set: { view: "full" },
    text:
      "From the side, the light bends level and converges from the hologram to a bright spot on " +
      "the screen, while the leftover light heads off at 45 degrees. A hologram of a whole " +
      "object records every point of it at once.",
  },
  {
    set: { aperture: "point2" },
    text:
      "Record two points on one plate, and it focuses light to both at once. Add enough points " +
      "and you have an image. A holographic stereogram builds its image from many small " +
      "holograms, each showing the scene from a different viewpoint.",
  },
  {
    set: { plate: 112 },
    text:
      "Make the plate bigger. With more of the hologram lit, the spots shrink: the bigger the " +
      "hologram, the sharper the image it can make.",
  },
  {
    set: { aperture: "square" },
    text:
      "Now a whole shape: a hologram of the outline of a square, worked out from the square " +
      "itself. The light of every point of the outline meets the reference beam on the film, " +
      "and the film records it all at once. Lit again, it rebuilds the square on the screen.",
  },
  {
    set: { aperture: "circle" },
    text:
      "A hologram of a circle, the same size, recorded the same way. Any shape can be recorded: " +
      "a hologram is worked out from the light of whatever it shows.",
  },
  {
    set: { aperture: "stackCircle" },
    text:
      "Now one plate holds two holograms: the square on its top half and the circle on its " +
      "bottom half, both made to land in the same place on the screen. Light only the bottom " +
      "half, and the circle appears.",
  },
  {
    set: { aperture: "stackSquare" },
    text:
      "Light only the top half, and the square takes the circle's place. Each part of the " +
      "plate holds its own picture, and the light picks which one you see. A holographic " +
      "stereogram is built this way: many strips, each holding one view of a scene.",
  },
  {
    set: { reversed: true },
    text:
      "Now reverse the beam: it comes from the screen's side, travelling back the way it went. " +
      "The hologram sends its light back too, heading away from the screen, but spreading as " +
      "if it came from the square on the screen. Drawn in white, fading in and out, is that " +
      "light traced back to where it seems to come from: virtual light, which is not really " +
      "there, and the square it seems to come from, a virtual image.",
  },
  {
    set: { aperture: "stackCircle" },
    text:
      "Light the bottom half instead, and the virtual image becomes the circle, in the same " +
      "place. Each part of the plate shows its own picture, seen where the light seems to " +
      "come from: the idea behind a holographic stereogram.",
  },
  {
    set: { aperture: "stack", eyeHalf: -1 },
    text:
      "Now one wide beam lights both plates. Both send their light back, but each in its own " +
      "direction, and the eye, looking through the bottom plate, catches only the circle's. So " +
      "it sees only the circle.",
  },
  {
    set: { eyeHalf: 1 },
    text:
      "Move the eye to look through the top plate, and it sees only the square. Where the eye " +
      "is decides what it sees: a holographic stereogram shows each eye position its own view " +
      "this way, from many such strips.",
  },
];
