/* v18.0 - Matter.js physics with automatic image-shape compound bodies */
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

  // rects are automatically generated from the PNG alpha mask in piece.js.
  // Each rectangle is convex, so Matter.js can combine them into one rigid
  // compound body without requiring the optional poly-decomp package.
  function createPieceBody(x, y, w, h, rects) {
    const options = {
      label: "piece",
      friction: 0.82,
      frictionStatic: 0.95,
      frictionAir: 0.004,
      restitution: 0.01,
      density: 0.002,
      sleepThreshold: 40
    };

    let body;
    if (Array.isArray(rects) && rects.length) {
      const vertexSets = rects.map(r => [
        {x:r.x-r.w/2, y:r.y-r.h/2},
        {x:r.x+r.w/2, y:r.y-r.h/2},
        {x:r.x+r.w/2, y:r.y+r.h/2},
        {x:r.x-r.w/2, y:r.y+r.h/2}
      ]);
      body = Matter.Bodies.fromVertices(x, y, vertexSets, options, false, 0.01, 2, 0.01);
    }

    // Safety fallback. This is only used if alpha analysis produces no shape.
    if (!body) {
      body = Bodies.rectangle(x, y, Math.max(10,w), Math.max(10,h), options);
    }

    // The image is rendered around its pixel centre while Matter rotates
    // around its centre of mass. `fromVertices` normalises the compound to
    // its COM, so derive the image-centre offset from the generated geometry.
    // The body has already been positioned at (x, y), therefore the offset
    // is the negative of the geometry centroid relative to that image centre.
    let cx=0, cy=0, area=0;
    if(body.parts && body.parts.length>1){
      for(let i=1;i<body.parts.length;i++){
        const part=body.parts[i];
        const a=Math.abs(Matter.Vertices.area(part.vertices));
        cx += part.position.x*a;
        cy += part.position.y*a;
        area += a;
      }
    }
    const visualOffset = area>0 ? {
      x: x - body.position.x,
      y: y - body.position.y
    } : {x:0,y:0};
    body.plugin = body.plugin || {};
    body.plugin.imageVisualOffset = visualOffset;
    body.plugin.imageWidth = w;
    body.plugin.imageHeight = h;

    return body;
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
    Body.rotate(body,delta);
    Sleeping.set(body,true);
  }

  function step(dt){
    Engine.update(engine, Math.max(1, Math.min(33, dt*1000)));
  }

  return {engine,world,setup,createPieceBody,add,hold,release,move,rotate,step};
})();
