/* v18.0 - Matter.js physics with automatic image-shape compound bodies */
const Physics = (() => {
  const {Engine,World,Bodies,Body,Sleeping} = Matter;

  const engine=Engine.create({
    enableSleeping:true,
    positionIterations:10,
    velocityIterations:8,
    constraintIterations:4
  });
  engine.gravity.x=0;
  engine.gravity.y=1;
  engine.gravity.scale=0.001;

  const world=engine.world;
  let ground=null;

  function setup(width,groundY){
    if(ground) World.remove(world,ground);
    ground=Bodies.rectangle(width/2,groundY+14,Math.max(1000,width*3),28,{
      isStatic:true,
      label:"ground",
      friction:0.85,
      frictionStatic:1,
      restitution:0.01
    });
    World.add(world,ground);
  }

  function createPieceBody(x,y,w,h,rects){
    const options={
      label:"piece",
      friction:0.82,
      frictionStatic:0.95,
      frictionAir:0.004,
      restitution:0.01,
      density:0.002,
      sleepThreshold:40
    };

    let body=null;
    if(Array.isArray(rects) && rects.length){
      const vertexSets=rects.map(r=>[
        {x:r.x-r.w/2,y:r.y-r.h/2},
        {x:r.x+r.w/2,y:r.y-r.h/2},
        {x:r.x+r.w/2,y:r.y+r.h/2},
        {x:r.x-r.w/2,y:r.y+r.h/2}
      ]);
      body=Matter.Bodies.fromVertices(
        x,y,vertexSets,options,
        false,0.01,2,0.01
      );
    }

    // Safety fallback for an empty/invalid alpha mask.
    if(!body){
      body=Bodies.rectangle(x,y,Math.max(10,w),Math.max(10,h),options);
    }

    // Matter rotates around the physical centre of mass. The image itself is
    // drawn around its pixel centre. Keep the two centres aligned visually by
    // storing the offset from the Matter body position to the original image
    // centre used at creation time.
    body.plugin=body.plugin||{};
    body.plugin.imageVisualOffset={
      x:x-body.position.x,
      y:y-body.position.y
    };
    body.plugin.imageWidth=w;
    body.plugin.imageHeight=h;

    return body;
  }

  function add(body){World.add(world,body);}

  function hold(body,x,y,angle=0){
    Body.setStatic(body,true);
    Body.setPosition(body,{x,y});
    Body.setAngle(body,angle);
    Body.setVelocity(body,{x:0,y:0});
    Body.setAngularVelocity(body,0);
    Sleeping.set(body,true);
  }

  function release(body){
    Body.setStatic(body,false);
    Sleeping.set(body,false);
    Body.setVelocity(body,{x:0,y:0.5});
  }

  function move(body,x,y){
    Body.setPosition(body,{x,y});
    Body.setVelocity(body,{x:0,y:0});
    Sleeping.set(body,true);
  }

  function rotate(body,delta){
    Body.rotate(body,delta);
    Sleeping.set(body,true);
  }

  function step(dt){
    Engine.update(engine,Math.max(1,Math.min(33,dt*1000)));
  }

  return {engine,world,setup,createPieceBody,add,hold,release,move,rotate,step};
})();
