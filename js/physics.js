/* v17.4 Matter.js physics layer */
const Physics = (() => {
  const { Engine, World, Bodies, Body, Composite } = Matter;
  const engine = Engine.create({
    enableSleeping: true,
    positionIterations: 10,
    velocityIterations: 8,
    constraintIterations: 4
  });
  engine.gravity.x = 0;
  engine.gravity.y = 1;
  engine.gravity.scale = 0.001;

  const world = engine.world;
  const ground = Bodies.rectangle(195, 1000, 1000, 40, {
    isStatic: true,
    friction: 0.85,
    restitution: 0.02,
    label: "ground"
  });
  World.add(world, ground);

  function resetGround(x, y, w) {
    Body.setPosition(ground, { x, y });
    Body.setVertices(ground, [
      {x:x-w/2,y:y-20},{x:x+w/2,y:y-20},
      {x:x+w/2,y:y+20},{x:x-w/2,y:y+20}
    ]);
  }

  function makeBody(x, y, w, h, parts) {
    // Use simple rectangle fallback if alpha-derived parts are unavailable.
    // This guarantees a valid dynamic Matter body and lets us tune shape later.
    const body = Bodies.rectangle(x, y, Math.max(8,w), Math.max(8,h), {
      label: "piece",
      friction: 0.82,
      frictionStatic: 0.95,
      frictionAir: 0.006,
      restitution: 0.01,
      density: 0.002,
      sleepThreshold: 60,
      slop: 0.01
    });
    return body;
  }

  function add(body) { World.add(world, body); }
  function remove(body) { if(body) World.remove(world, body); }
  function wake(body) {
    if(!body) return;
    Body.setStatic(body, false);
    Matter.Sleeping.set(body, false);
    Body.setVelocity(body, {x: body.velocity.x, y: Math.max(body.velocity.y, 0)});
    Body.setAngularVelocity(body, body.angularVelocity || 0);
  }
  function hold(body, x, y) {
    if(!body) return;
    Body.setStatic(body, true);
    Matter.Sleeping.set(body, true);
    Body.setPosition(body, {x,y});
    Body.setVelocity(body, {x:0,y:0});
    Body.setAngularVelocity(body, 0);
  }
  function rotate(body, angle) {
    if(body) {
      Body.rotate(body, angle);
      Matter.Sleeping.set(body, false);
    }
  }
  function step(dt) {
    Engine.update(engine, dt * 1000);
  }
  return {engine,world,ground,resetGround,makeBody,add,remove,wake,hold,rotate,step};
})();
