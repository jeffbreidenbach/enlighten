// The 3D scene. The cross section is a flat picture; across it stand the
// aperture plate and the screen. In the cross section view the plates are
// squeezed to nothing and the camera looks straight at the picture; for
// the full view the camera swings round while they grow out of their
// lines into plates.

import * as THREE from "three";
import { ROW_HOLOGRAM, ROW_OPEN, shade } from "../physics/aperture.js";
import { BG, GLASS, WALL } from "./display.js";

const FOV = 30;
// Direction from the scene to the camera in the full view: in front, off
// to the source side and a little above.
const OBLIQUE_DIR = new THREE.Vector3(-0.62, 0.26, 0.74).normalize();
// World units per grid cell.
const UNIT = 1 / 100;

// Builds the scene around the cross section's picture and the screen's
// face-on picture. Returns the scene and camera, layout(t) to place them
// part way between the views, and drawAperture(ap, g) to repaint the
// aperture plate.
export function createScene(g, sliceTexture, screenTexture, retinaTexture) {
  const totalW = g.W + g.stripW;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(...BG.map((c) => c / 255));
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  // The cross section, centered on the origin, added on top of what is
  // behind it so its black is clear.
  scene.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(totalW * UNIT, g.H * UNIT),
      new THREE.MeshBasicMaterial({
        map: sliceTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
  );

  // A plate `size` grid cells across and as tall (a stacked aperture plate
  // is resized to twice as tall), standing across the axis at grid column
  // x. Turned to face along the axis, its local x runs out of the cross
  // section, so scaling that squeezes it to a line. It is built one unit
  // across and scaled to its size, so it can be resized.
  function makePlate(x, texture, size) {
    const geo = new THREE.PlaneGeometry(UNIT, UNIT);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x8890a4, transparent: true, opacity: 0 }),
    );
    mesh.add(edges);
    mesh.position.x = (x - totalW / 2) * UNIT;
    mesh.rotation.y = Math.PI / 2;
    mesh.scale.y = size;
    scene.add(mesh);
    return { mesh, edges, size };
  }

  // The aperture plate is painted on a canvas big enough for the largest
  // plate, stacked, of which only the corner the plate's size needs is
  // shown; the screen is as tall as the cross section. There is no plate at the
  // source: the cross section already shows where the light starts, and a
  // plane wave has no single source.
  const M = g.maxApertureSize;
  const apertureCanvas = Object.assign(document.createElement("canvas"), { width: M, height: 2 * M });
  const apertureTexture = new THREE.CanvasTexture(apertureCanvas);
  const aperturePlate = makePlate(g.apertureX + 0.5, apertureTexture, g.apertureSize);
  const plates = [aperturePlate, makePlate(g.screenX, screenTexture, g.H)];

  // Paints the aperture plate face on: wall, and either full-width slits
  // (the sine grating's shaded by how much they block), or a bleached
  // hologram, clear, shaded by how much it delays the light (a stacked one
  // in two plates, with a gap between them).
  function drawAperture(ap, g) {
    const A = g.apertureSize;
    const T = ap.height;
    aperturePlate.size = A;
    aperturePlate.mesh.scale.y = T;
    aperturePlate.edges.geometry.dispose();
    aperturePlate.edges.geometry = outline(ap.gap / T);
    // The canvas's top-left corner; textures run bottom up.
    apertureTexture.repeat.set(A / M, T / (2 * M));
    apertureTexture.offset.set(0, 1 - T / (2 * M));
    const ctx = apertureCanvas.getContext("2d");
    const img = ctx.createImageData(A, T);
    for (let cy = 0; cy < T; cy++) {
      // Canvas rows run top down; the cross section's rows bottom up.
      const row = g.centerY + T / 2 - 1 - cy;
      for (let cx = 0; cx < A; cx++) {
        let color = WALL;
        let alpha = 110;
        if (ap.plate && ap.kind[row] !== ROW_HOLOGRAM) {
          // The gap between a stacked plate's halves.
          alpha = 0;
        } else if (ap.plate) {
          const value = shade(ap.plate, cx - A / 2 + 0.5, row - g.centerY);
          color = GLASS.map((c) => c * (0.45 + 0.55 * value));
          alpha = 120;
        } else if (ap.kind[row] === ROW_OPEN) {
          alpha *= ap.block[row];
        }
        img.data.set([...color, alpha], (cy * A + cx) * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    apertureTexture.needsUpdate = true;
  }

  // The outline of the aperture plate, in the plate's own units (one
  // across), split in two around a gap `gap` of its height across the
  // middle: the two plates of a stacked hologram.
  function outline(gap) {
    const [h, m] = [UNIT / 2, (gap * UNIT) / 2];
    const rects = gap > 0 ? [[m, h], [-h, -m]] : [[-h, h]];
    const points = rects.flatMap(([lo, hi]) =>
      [[-h, lo], [h, lo], [h, lo], [h, hi], [h, hi], [-h, hi], [-h, hi], [-h, lo]].map(([x, y]) => [x, y, 0]),
    );
    return new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  }

  // The eye's retina, with the beam reversed: a small plate at the back of
  // the eye drawn in the cross section, facing its lens, showing the image
  // the lens casts there, upside down (turned half around in its own
  // plane) and to scale (see eyePlace in display.js). Black is clear.
  const retina = new THREE.Mesh(
    new THREE.PlaneGeometry(UNIT, UNIT),
    new THREE.MeshBasicMaterial({
      map: retinaTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  retina.rotation.set(0, Math.PI / 2, Math.PI);
  retina.visible = false;
  scene.add(retina);
  let retinaSize = 0;

  // Places the retina for the eye at `eye` (see eyePlace), or hides it.
  function placeRetina(eye) {
    retina.visible = eye !== null;
    if (!eye) return;
    retinaSize = g.H * eye.shrink;
    retina.position.set((eye.retinaX - totalW / 2) * UNIT, eye.y * (1 + eye.shrink) * UNIT, 0);
    retina.scale.y = retinaSize;
  }

  // The corners of what the full view must show: the cross section, and
  // the screen plate (the aperture plate is smaller, and within them).
  const halfW = (totalW * UNIT) / 2;
  const halfH = (g.H * UNIT) / 2;
  const screenX = (g.screenX - totalW / 2) * UNIT;
  const corners = [];
  for (const y of [-halfH, halfH]) {
    for (const x of [-halfW, halfW]) corners.push(new THREE.Vector3(x, y, 0));
    for (const z of [-halfH, halfH]) corners.push(new THREE.Vector3(screenX, y, z));
  }

  // The full view's camera: looking along -OBLIQUE_DIR from as close as
  // fits the whole scene in the window above its bottom `covered` share,
  // where the controls float, with a small margin, and slid sideways and
  // up or down so the scene sits in the middle of that room. Returns the
  // point it looks at, and its distance from it.
  function fitOblique(covered) {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dir = OBLIQUE_DIR;
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right);
    // Each corner across, up, and toward the camera.
    const pts = corners.map((c) => [c.dot(right), c.dot(up), c.dot(dir)]);
    const margin = 0.1;
    const [xHi, yLo, yHi] = [1 - margin, -1 + 2 * covered + margin, 1 - margin];
    // At distance d, the ranges the camera's slide may take across and up
    // so every corner shows; empty if it is too close.
    const ranges = (d) => {
      let [x0, x1, y0, y1] = [-Infinity, Infinity, -Infinity, Infinity];
      for (const [a, b, z] of pts) {
        const h = (d - z) * tan;
        const w = h * camera.aspect;
        [x0, x1] = [Math.max(x0, a - xHi * w), Math.min(x1, a + xHi * w)];
        [y0, y1] = [Math.max(y0, b - yHi * h), Math.min(y1, b - yLo * h)];
      }
      return [x0, x1, y0, y1];
    };
    const fits = (d) => {
      const [x0, x1, y0, y1] = ranges(d);
      return x0 <= x1 && y0 <= y1;
    };
    let [lo, hi] = [halfH, 4 * halfW + 4 * halfH];
    while (!fits(hi)) hi *= 2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    const [x0, x1, y0, y1] = ranges(hi);
    const target = right.multiplyScalar((x0 + x1) / 2).add(up.multiplyScalar((y0 + y1) / 2));
    return { target, dist: hi };
  }

  // Places the camera and plates part way between the cross section
  // (t = 0) and the full view (t = 1), eased, with the controls covering
  // the bottom `covered` share of the window. Returns the eased amount.
  function layout(t, covered) {
    const e = t * t * (3 - 2 * t);
    const aspect = camera.aspect;
    const half = THREE.MathUtils.degToRad(FOV / 2);
    const flatDist = Math.max(halfH, halfW / aspect) / Math.tan(half);
    // In the cross section the picture is pinned to the top-left corner,
    // so any spare room collects at the bottom (where the controls float)
    // or on the right. Shifting the camera the other way moves it there.
    const viewHalfH = flatDist * Math.tan(half);
    const pin = new THREE.Vector3(
      Math.max(0, viewHalfH * aspect - halfW),
      -Math.max(0, viewHalfH - halfH),
      0,
    );
    const oblique = fitOblique(covered);
    const target = pin.lerp(oblique.target, e);

    const dir = new THREE.Vector3(0, 0, 1).lerp(OBLIQUE_DIR, e).normalize();
    camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flatDist, oblique.dist, e)));
    camera.position.add(target);
    camera.lookAt(target);

    for (const { mesh, edges, size } of plates) {
      mesh.scale.x = Math.max(e, 1e-4) * size;
      mesh.material.opacity = e;
      edges.material.opacity = 0.8 * e;
    }
    retina.scale.x = Math.max(e, 1e-4) * retinaSize;
    retina.material.opacity = e;
    return e;
  }

  return { scene, camera, layout, drawAperture, placeRetina };
}
