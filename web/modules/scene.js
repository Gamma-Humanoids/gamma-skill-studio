import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Set up Three.js scene, renderer, camera, lights, grid.
 * @param {HTMLElement} container
 * @returns {{ scene, camera, renderer, controls, animate }}
 */
export function initScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222222);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(2, 2, 3);
  camera.lookAt(0, 0.8, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.8, 0);
  controls.update();

  // Lights (no shadows for simplicity)
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(3, 6, 4);
  scene.add(dir);

  // Grid at y=0
  const grid = new THREE.GridHelper(10, 10, 0x444444, 0x333333);
  scene.add(grid);

  // Axes helper at origin
  scene.add(new THREE.AxesHelper(0.5));

  // Resize observer
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  ro.observe(container);

  // Trigger once to set initial size
  {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let rafId = null;
  function animate(onFrame) {
    if (rafId !== null) cancelAnimationFrame(rafId);
    function loop() {
      rafId = requestAnimationFrame(loop);
      if (onFrame) onFrame();
      controls.update();
      renderer.render(scene, camera);
    }
    loop();
  }

  return { scene, camera, renderer, controls, animate };
}
