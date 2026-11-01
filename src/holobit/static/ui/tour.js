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
    set: { wavelength: 550, angle: 12 },
    text:
      "Back to green, and now move the source up. The fringes slide down: they record where the " +
      "light came from. Recording that information is the whole idea of a hologram.",
  },
  {
    set: { angle: 0, view: "full" },
    text:
      "Step back to see the whole setup: the light source, the plate with the slits, and the " +
      "screen. A piece of film where the screen is would record those fringes.",
  },
  {
    set: { view: "cross", light: "plane" },
    text:
      "Now the light is a plane wave, with flat wavefronts all moving one way, like a laser beam. " +
      "Holograms are recorded and replayed with light like this, called the reference beam.",
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
    set: { aperture: "lens", light: "point", angle: 0 },
    text:
      "A Fresnel lens is rings of fringes that bend every part of the wave toward one spot. This " +
      "one is off center, so it acts like a grating and a lens at once, steering the light up to a " +
      "spot high on the screen. It is the hologram of a single point: light it, and it recreates " +
      "that point.",
  },
  {
    set: { view: "full" },
    text:
      "From the side, the light bends up and converges from the lens to a bright spot on the " +
      "screen. A hologram of a whole object is the sum of such lenses, one for every point of the " +
      "object.",
  },
  {
    set: { aperture: "lens2" },
    text:
      "Two lenses on one plate focus light to two points at once. Add enough points and you have " +
      "an image. A holographic stereogram builds its image from many small holograms, each showing " +
      "the scene from a different viewpoint.",
  },
];
