import * as THREE from 'three';

// Maya/MotionBuilder rotateOrder="xyz" produces matrix R = Rz·Ry·Rx
// (extrinsic XYZ = intrinsic ZYX). Three.js 'XYZ' would be intrinsic XYZ —
// opposite convention — causing visible wobble when yaw ≈ ±90°.
const _euler = new THREE.Euler(0, 0, 0, 'ZYX');

// Track which joint names were not found in URDF (log once)
const _warnedJoints = new Set();

/**
 * Apply a single frame of CSV data to the URDF robot.
 *
 * @param {URDFRobot} robot   - urdf-loader robot object
 * @param {string[]} jointNames - 29 joint names (without _dof suffix)
 * @param {Float32Array} frameData - 35 values: [tx, ty, tz, rx, ry, rz, j0..j28]
 */
export function applyFrame(robot, jointNames, frameData) {
  // Root pose: first 6 values
  // translate in cm → divide by 100 for meters
  // Note: the pivot group already handles Z-up→Y-up, so we apply raw XYZ here.
  robot.position.set(
    frameData[0] / 100,
    frameData[1] / 100,
    frameData[2] / 100
  );

  // Euler ZYX (Maya rotateOrder=xyz), degrees → radians
  _euler.set(
    frameData[3] * Math.PI / 180,
    frameData[4] * Math.PI / 180,
    frameData[5] * Math.PI / 180,
    'ZYX'
  );
  robot.quaternion.setFromEuler(_euler);

  // Joint DOF values: indices 6..34
  for (let i = 0; i < jointNames.length; i++) {
    const name = jointNames[i];
    const valueDeg = frameData[6 + i];
    const valueRad = valueDeg * Math.PI / 180;
    const result = robot.setJointValue(name, valueRad);
    if (result === false && !_warnedJoints.has(name)) {
      console.warn(`Joint not found in URDF, skipping: ${name}`);
      _warnedJoints.add(name);
    }
  }
}
