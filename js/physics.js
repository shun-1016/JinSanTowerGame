/* v18.1 - Matter.js physics using automatically extracted alpha contours */
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
      isStatic:true,label:'ground',friction:0.85,frictionStatic:1,restitution:0.01
    });
    World.add(world,ground);
  }

  function area(poly){
    let a=0;
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length];
      a+=p.x*q.y-q.x*p.y;
    }
    return a/2;
  }

  function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}

  function pointInTriangle(p,a,b,c){
    const c1=cross(a,b,p),c2=cross(b,c,p),c3=cross(c,a,p);
    const hasNeg=c1<-0.001||c2<-0.001||c3<-0.001;
    const hasPos=c1>0.001||c2>0.001||c3>0.001;
    return !(hasNeg&&hasPos);
  }

  // Ear clipping keeps every generated physics primitive convex (triangles),
  // so this does not depend on the optional poly-decomp library.
  function triangulate(input){
    if(!input||input.length<3) return [];
    let poly=input.map(p=>({x:p.x,y:p.y}));
    if(area(poly)<0) poly.reverse();
    const indices=poly.map((_,i)=>i);
    const triangles=[];
    let guard=0;
    while(indices.length>3 && guard++<poly.length*poly.length*2){
      let earFound=false;
      for(let i=0;i<indices.length;i++){
        const ia=indices[(i-1+indices.length)%indices.length];
        const ib=indices[i];
        const ic=indices[(i+1)%indices.length];
        const a=poly[ia],b=poly[ib],c=poly[ic];
        if(cross(a,b,c)<=0.01) continue;
        let contains=false;
        for(let j=0;j<indices.length;j++){
          const id=indices[j];
          if(id===ia||id===ib||id===ic) continue;
          if(pointInTriangle(poly[id],a,b,c)){contains=true;break;}
        }
        if(contains) continue;
        triangles.push([a,b,c]);
        indices.splice(i,1);
        earFound=true;
        break;
      }
      if(!earFound) break;
    }
    if(indices.length===3){
      triangles.push([poly[indices[0]],poly[indices[1]],poly[indices[2]]]);
    }
    return triangles;
  }

  function createPieceBody(x,y,w,h,shape){
    const options={
      label:'piece',friction:0.82,frictionStatic:0.95,frictionAir:0.004,
      restitution:0.01,density:0.002,sleepThreshold:40
    };
    let body=null;
    const contours=shape&&Array.isArray(shape.contours)?shape.contours:[];
    const vertexSets=[];
    for(const contour of contours){
      for(const tri of triangulate(contour)) vertexSets.push(tri);
    }
    if(vertexSets.length){
      body=Bodies.fromVertices(x,y,vertexSets,options,false,0.01,2,0.01);
    }
    if(!body){
      body=Bodies.rectangle(x,y,Math.max(10,w),Math.max(10,h),options);
    }
    body.plugin=body.plugin||{};
    body.plugin.imageVisualOffset={x:x-body.position.x,y:y-body.position.y};
    body.plugin.imageWidth=w;
    body.plugin.imageHeight=h;
    body.plugin.debugContours=contours;
    body.plugin.debugTriangleCount=vertexSets.length;
    return body;
  }

  function add(body){World.add(world,body);}
  function hold(body,x,y,angle=0){
    Body.setStatic(body,true); Body.setPosition(body,{x,y}); Body.setAngle(body,angle);
    Body.setVelocity(body,{x:0,y:0}); Body.setAngularVelocity(body,0); Sleeping.set(body,true);
  }
  function release(body){
    Body.setStatic(body,false); Sleeping.set(body,false); Body.setVelocity(body,{x:0,y:0.5});
  }
  function move(body,x,y){Body.setPosition(body,{x,y});Body.setVelocity(body,{x:0,y:0});Sleeping.set(body,true);}
  function rotate(body,delta){Body.rotate(body,delta);Sleeping.set(body,true);}
  function step(dt){Engine.update(engine,Math.max(1,Math.min(33,dt*1000)));}

  return {engine,world,setup,createPieceBody,add,hold,release,move,rotate,step};
})();
