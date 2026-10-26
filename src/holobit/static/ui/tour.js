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
    set: { wavelength: 450 },
    text:
      "Shorter waves are bluer. Notice how the crests crowd closer together. The size of a wave " +
      "compared with the slit decides how it spreads.",
  },
  {
    set: { wavelength: 650 },
    text:
      "Longer waves are redder, and their crests are further apart. Everything that follows " +
      "depends on wavelength, which is why holograms shimmer with color in white light.",
  },
  {
    set: { wavelength: 550, aperture: "double" },
    text:
      "Two slits make two sources. Where their crests meet the light adds up; where a crest meets a " +
      "trough it cancels. The bright and dark bands on the screen are interference fringes.",
  },
  {
    set: { sourceHeight: 20 },
    text:
      "Move the source up and the fringes slide down. The fringes record where the light came " +
      "from. Recording that information is the whole idea of a hologram.",
  },
  {
    set: { sourceHeight: 0, view: "full" },
    text:
      "Step back to see the whole setup: the light source, the plate with the slits, and the " +
      "screen. A piece of film where the screen is would record those fringes.",
  },
  {
    set: { view: "cross", light: "plane", beamAngle: 0 },
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
    set: { beamAngle: 45 },
    text:
      "Tilt the beam to 45 degrees. Some light carries on at 45 degrees, but the grating bends the " +
      "rest straight ahead. Separating the useful beam from the leftover light this way is the key " +
      "to off-axis holography.",
  },
  {
    set: { aperture: "lens", light: "point" },
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
