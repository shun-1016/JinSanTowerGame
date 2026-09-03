/* v17.7 - Matter.js physics layer */
const Physics = (() => {
  const {Engine, World, Bodies, Body, Sleeping} = Matter;

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
  let ground = null;

  function setup(width, groundY) {
    if (ground) World.remove(world, ground);
    ground = Bodies.rectangle(
      width / 2,
      groundY + 14,
      Math.max(1000, width * 3),
      28,
      {
        isStatic: true,
        label: "ground",
        friction: 0.85,
        frictionStatic: 1,
        restitution: 0.01
      }
    );
    World.add(world, ground);
  }

  function createPieceBody(x, y, w, h) {
    return Bodies.rectangle(x, y, Math.max(10,w), Math.max(10,h), {
      label: "piece",
      friction: 0.82,
      frictionStatic: 0.95,
      frictionAir: 0.004,
      restitution: 0.01,
      density: 0.002,
      sleepThreshold: 40
    });
  }

  function add(body){ World.add(world, body); }

  function hold(body, x, y, angle=0){
    Body.setStatic(body, true);
    Body.setPosition(body, {x,y});
    Body.setAngle(body, angle);
    Body.setVelocity(body, {x:0,y:0});
    Body.setAngularVelocity(body, 0);
    Sleeping.set(body, true);
  }

  function release(body){
    Body.setStatic(body, false);
    Sleeping.set(body, false);
    Body.setVelocity(body, {x:0,y:0.5});
  }

  function move(body,x,y){
    Body.setPosition(body,{x,y});
    Body.setVelocity(body,{x:0,y:0});
    Sleeping.set(body,true);
  }

  function rotate(body, delta){
    Body.rotate(body, delta);
    Sleeping.set(body,true);
  }

  function step(dt){
    Engine.update(engine, Math.max(1, Math.min(33, dt*1000)));
  }

  return {engine,world,setup,createPieceBody,add,hold,release,move,rotate,step};
})();
