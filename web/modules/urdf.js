import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import URDFLoader from 'urdf-loader';

const stlLoader = new STLLoader();

/**
 * Load the G1 URDF from the backend and add it to the scene.
 * @param {THREE.Scene} scene
 * @param {string} urdfText  - raw URDF XML
 * @returns {Promise<URDFRobot>}
 */
export function loadRobot(scene, urdfText) {
  return new Promise((resolve, reject) => {
    const loader = new URDFLoader();

    loader.loadMeshCb = (path, _manager, done) => {
      // path is already rewritten to /api/meshes/X.STL by the backend
      stlLoader.load(
        path,
        (geometry) => {
          const mat = new THREE.MeshPhongMaterial({ color: 0x888888 });
          const mesh = new THREE.Mesh(geometry, mat);
          done(mesh);
        },
        undefined,
        (err) => {
          console.warn('STL load error:', path, err);
          done(null);
        }
      );
    };

    let robot;
    try {
      robot = loader.parse(urdfText);
    } catch (err) {
      reject(err);
      return;
    }

    if (!robot) {
      reject(new Error('URDFLoader returned null'));
      return;
    }

    // Wrap robot in a pivot group to convert Z-up (URDF) → Y-up (scene)
    const pivot = new THREE.Group();
    pivot.rotation.x = -Math.PI / 2; // URDF is Z-up, scene is Y-up
    pivot.add(robot);
    scene.add(pivot);

    resolve(robot);
  });
}
