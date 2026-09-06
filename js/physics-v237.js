/* v23.7 - measured landing stabilization experiment
 *
 * Scope:
 * - Keep v22.5 geometry and global physics parameters unchanged.
 * - Stabilize only the first few frames after a piece first contacts the ground.
 * - Suppress collision-solver upward rebound, excessive lateral impulse, and
 *   excessive angular velocity without changing airborne motion.
 *
 * This file intentionally wraps Physics.step instead of changing the collision
 * geometry or global Matter.js settings, so v23.6 remains a clean baseline.
 */
(() => {
  if (typeof Physics === 'undefined' || typeof Matter === 'undefined' ||
      typeof Physics.step !== 'function') return;

  const originalStep = Physics.step;
  const engine = Physics.engine;
  const stateKey = 'v237LandingStabilization';

  Physics.step = function(dt) {
    originalStep(dt);

    const world = engine && engine.world;
    const pairs = engine && engine.pairs && engine.pairs.list;
    if (!world || !Array.isArray(pairs)) return;

    const groundContacts = new Set();

    for (const pair of pairs) {
      if (!pair || !pair.isActive) continue;

      const bodyA = pair.bodyA && pair.bodyA.parent ? pair.bodyA.parent : pair.bodyA;
      const bodyB = pair.bodyB && pair.bodyB.parent ? pair.bodyB.parent : pair.bodyB;
      if (!bodyA || !bodyB) continue;

      let piece = null;
      let other = null;

      if (bodyA.label === 'piece' && !bodyA.isStatic) {
        piece = bodyA;
        other = bodyB;
      } else if (bodyB.label === 'piece' && !bodyB.isStatic) {
        piece = bodyB;
        other = bodyA;
      }

      if (piece && other && other.label === 'ground') {
        groundContacts.add(piece);
      }
    }

    for (const body of world.bodies) {
      if (!body || body.isStatic || body.label !== 'piece') continue;

      body.plugin = body.plugin || {};
      const state = body.plugin[stateKey] || {
        groundContactFrames: 0
      };
      body.plugin[stateKey] = state;

      if (!groundContacts.has(body)) {
        state.groundContactFrames = 0;
        continue;
      }

      state.groundContactFrames += 1;
      const f = state.groundContactFrames;

      // Only the first landing frames are treated specially. Once the piece
      // has settled onto the ground, normal v22.5 physics takes over.
      if (f > 8) continue;

      const vx = body.velocity.x || 0;
      const vy = body.velocity.y || 0;
      const av = body.angularVelocity || 0;

      // restitution is already 0, but discrete collision resolution can still
      // leave a small upward velocity after a high-speed impact. A true ground
      // contact is the condition under which this upward residual is removed.
      const stabilizedVy = vy < 0 ? 0 : (f <= 2 ? vy * 0.45 : vy * 0.70);

      // Reduce only the landing-induced lateral impulse. Do not touch airborne
      // velocity, and stop applying the stronger damping after the first frames.
      const lateralDamp = f <= 2 ? 0.68 : (f <= 5 ? 0.82 : 0.92);
      const stabilizedVx = Math.abs(vx) < 0.01 ? 0 : vx * lateralDamp;

      // Narrow/off-center footprints can convert the same impact into a large
      // angular impulse. Damp that impulse briefly without imposing a global
      // angular-velocity cap during free fall.
      const angularDamp = f <= 2 ? 0.55 : (f <= 5 ? 0.72 : 0.88);
      const stabilizedAv = Math.abs(av) < 0.0005 ? 0 : av * angularDamp;

      Matter.Body.setVelocity(body, {
        x: stabilizedVx,
        y: Math.abs(stabilizedVy) < 0.01 ? 0 : stabilizedVy
      });
      Matter.Body.setAngularVelocity(body, stabilizedAv);
    }
  };
})();
