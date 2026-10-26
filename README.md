# holobit

An interactive, browser-based light simulator for teaching the ideas behind holography, from
diffraction at a single slit toward holographic stereograms.

It shows light as a steady wave of one color passing a source, an aperture plate and a screen:

- **Apertures:** single slit, double slit, sine grating, an off-axis Fresnel lens, and two
  overlaid Fresnel lenses.
- **Light:** a point source you can raise or lower, or a plane wave you can tilt.
- **Views:** a cross section through the middle of the setup showing the waves themselves, and a
  full 3D view of the aperture plate and the screen.
- **Tour:** the ◀ ▶ buttons step through a 12-stop guided tour, changing one thing at a time and
  explaining what to notice. Every control also explains itself when changed.

The light is computed by summing Huygens wavelets from the aperture plate in WebGL shaders
(three.js), so it runs in any current browser on an ordinary laptop.

## Run

```bash
uv run holobit
```

Then open http://localhost:8000/holobit/. The server listens on all interfaces (`0.0.0.0`) on
port 8000; set `HOST` (for example `HOST=127.0.0.1` to keep it private) and `PORT` to change that.

## Layout

- `src/holobit/__init__.py`: a small static file server.
- `src/holobit/static/`: the simulator.
  - `physics/`: the core calculation.
    - `layout.js`: where everything sits, and the scale.
    - `aperture.js`: turns each aperture into the wavelets it sends on.
    - `wavefield.js`: the GPU shaders that add those wavelets up at every point.
  - `view/`: how the light is drawn (`display.js`) and the 3D scene (`scene.js`).
  - `ui/`: the toolbar (`controls.js`), its explanations (`explanations.js`) and the guided
    tour (`tour.js`).
  - `main.js`: wires it together and runs the calculation and the animation.
  - `vendor/`: three.js r170 (MIT).
