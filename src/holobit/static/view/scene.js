// The 3D scene. The cross section is a flat picture; across it stand the
// aperture plate and the screen. In the cross section view the plates are
// squeezed to nothing and the camera looks straight at the picture; for
// the full view the camera swings round while they grow out of their
// lines into plates.

import * as THREE from "three";
import { lensGroove, ROW_OPEN } from "../physics/aperture.js";
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
export function createScene(g, sliceTexture, screenTexture) {
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

  // A square plate `size` grid cells across, standing across the axis at
  // grid column x. Turned to face along the axis, its local x runs out of
  // the cross section, so scaling that squeezes it to a line. It is built
  // one unit across and scaled to its size, so it can be resized.
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
  // plate, of which only the corner the plate's size needs is shown; the
  // screen is as tall as the cross section. There is no plate at the
  // source: the cross section already shows where the light starts, and a
  // plane wave has no single source.
  const M = g.maxApertureSize;
  const apertureCanvas = Object.assign(document.createElement("canvas"), { width: M, height: M });
  const apertureTexture = new THREE.CanvasTexture(apertureCanvas);
  const aperturePlate = makePlate(g.apertureX + 0.5, apertureTexture, g.apertureSize);
  const plates = [aperturePlate, makePlate(g.screenX, screenTexture, g.H)];

  // Paints the aperture plate face on: wall, and either full-width slits
  // (the sine grating's shaded by how much they block) or round lenses
  // shaded by their grooves (averaged where two overlap).
  function drawAperture(ap, g) {
    const A = g.apertureSize;
    aperturePlate.size = A;
    aperturePlate.mesh.scale.y = A;
    // The canvas's top-left corner; textures run bottom up.
    apertureTexture.repeat.set(A / M, A / M);
    apertureTexture.offset.set(0, 1 - A / M);
    const ctx = apertureCanvas.getContext("2d");
    const img = ctx.createImageData(A, A);
    for (let cy = 0; cy < A; cy++) {
      // Canvas rows run top down; the cross section's rows bottom up.
      const row = g.centerY + A / 2 - 1 - cy;
      for (let cx = 0; cx < A; cx++) {
        let color = WALL;
        let alpha = 110;
        if (ap.lens) {
          let shade = 0;
          let covering = 0;
          for (const center of ap.lens.centers) {
            const rho = Math.hypot(cx - A / 2, row - g.centerY - center);
            if (rho > ap.lens.radius) continue;
            shade += 0.45 + 0.55 * lensGroove(g, rho);
            covering += 1;
          }
          if (covering > 0) {
            color = GLASS.map((c) => (c * shade) / covering);
            alpha = 120;
          }
        } else if (ap.kind[row] === ROW_OPEN) {
          alpha *= ap.block[row];
        }
        img.data.set([...color, alpha], (cy * A + cx) * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    apertureTexture.needsUpdate = true;
  }

  // Places the camera and plates part way between the cross section
  // (t = 0) and the full view (t = 1), eased. Returns the eased amount.
  function layout(t) {
    const e = t * t * (3 - 2 * t);
    const aspect = camera.aspect;
    const half = THREE.MathUtils.degToRad(FOV / 2);
    const halfW = (totalW * UNIT) / 2;
    const halfH = (g.H * UNIT) / 2;
    const flatDist = Math.max(halfH, halfW / aspect) / Math.tan(half);
    // In the cross section the picture is pinned to the top-left corner,
    // so any spare room collects at the bottom (where the controls float)
    // or on the right. Shifting the camera the other way moves it there.
    const viewHalfH = flatDist * Math.tan(half);
    const pin = new THREE.Vector3(
      Math.max(0, viewHalfH * aspect - halfW),
      -Math.max(0, viewHalfH - halfH),
      0,
    ).multiplyScalar(1 - e);
    // In the full view, fit the whole scene, plates included.
    const fit = Math.min(half, Math.atan(aspect * Math.tan(half)));
    const obliqueDist = (0.8 * Math.hypot(halfW, halfH, halfH)) / Math.sin(fit);

    const dir = new THREE.Vector3(0, 0, 1).lerp(OBLIQUE_DIR, e).normalize();
    camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(flatDist, obliqueDist, e)));
    camera.position.add(pin);
    camera.lookAt(pin);

    for (const { mesh, edges, size } of plates) {
      mesh.scale.x = Math.max(e, 1e-4) * size;
      mesh.material.opacity = e;
      edges.material.opacity = 0.8 * e;
    }
    return e;
  }

  return { scene, camera, layout, drawAperture };
}
