/* v19 - preserve triangle positions in a Matter.js compound body */
const Physics = (() => {
  const {Engine,World,Bodies,Body,Sleeping}=Matter;
  const engine=Engine.create({enableSleeping:true,positionIterations:12,velocityIterations:10,constraintIterations:4});
  engine.gravity.x=0;engine.gravity.y=1;engine.gravity.scale=0.001;
  const world=engine.world;
  let ground=null;

  function setup(width,groundY){
    if(ground) World.remove(world,ground);
    ground=Bodies.rectangle(width/2,groundY+14,Math.max(1000,width*3),28,{
      isStatic:true,label:'ground',friction:0.85,frictionStatic:1,restitution:0.01
    });
    World.add(world,ground);
  }

  function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
  function area(poly){
    let a=0;
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length];
      a+=p.x*q.y-q.x*p.y;
    }
    return a/2;
  }
  function pointInTriangle(p,a,b,c){
    const c1=cross(a,b,p),c2=cross(b,c,p),c3=cross(c,a,p);
    const eps=1e-8;
    const hasNeg=c1<-eps||c2<-eps||c3<-eps;
    const hasPos=c1>eps||c2>eps||c3>eps;
    return !(hasNeg&&hasPos);
  }
  function samePoint(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<1e-6;}

  // Complete ear clipping. A partial result is never passed to Matter.js.
  function triangulate(input){
    if(!input||input.length<3)return [];
    const poly=[];
    for(const p of input){
      if(!poly.length||!samePoint(poly[poly.length-1],p)) poly.push({x:p.x,y:p.y});
    }
    if(poly.length>=2&&samePoint(poly[0],poly[poly.length-1]))poly.pop();
    if(poly.length<3)return [];
    if(area(poly)<0)poly.reverse();

    const indices=poly.map((_,i)=>i),triangles=[];
    let guard=0;
    while(indices.length>3){
      if(guard++>poly.length*poly.length*4)return [];
      let earFound=false;
      for(let i=0;i<indices.length;i++){
        const ia=indices[(i-1+indices.length)%indices.length],ib=indices[i],ic=indices[(i+1)%indices.length];
        const a=poly[ia],b=poly[ib],c=poly[ic];
        if(cross(a,b,c)<=1e-7)continue;
        let contains=false;
        for(const id of indices){
          if(id===ia||id===ib||id===ic)continue;
          if(pointInTriangle(poly[id],a,b,c)){contains=true;break;}
        }
        if(contains)continue;
        triangles.push([a,b,c]);
        indices.splice(i,1);
        earFound=true;
        break;
      }
      if(!earFound)return [];
    }
    if(indices.length===3)triangles.push([poly[indices[0]],poly[indices[1]],poly[indices[2]]]);
    return triangles.filter(t=>Math.abs(area(t))>0.05);
  }

  function makeTrianglePart(triangle,options){
    // IMPORTANT: pass the triangle to Matter at its ORIGINAL image-local
    // centroid.  Bodies.fromVertices(x,y,[triangle]) recentres the triangle
    // around its own centroid, then places that centroid at (x,y).  Therefore
    // x/y must be the triangle centroid; using x=0,y=0 would collapse every
    // triangle onto the same point.
    const cx=(triangle[0].x+triangle[1].x+triangle[2].x)/3;
    const cy=(triangle[0].y+triangle[1].y+triangle[2].y)/3;
    return Bodies.fromVertices(cx,cy,[triangle],{
      ...options,
      label:'piece-part'
    },false,0.001,0.001,0.001);
  }

  function createPieceBody(x,y,w,h,shape){
    const options={
      label:'piece',
      friction:0.82,
      frictionStatic:0.95,
      frictionAir:0.004,
      restitution:0.01,
      density:0.002,
      sleepThreshold:40
    };
    const contour=shape&&shape.contour;
    const triangles=triangulate(contour);
    let body=null;
    let fallback=false;

    if(triangles.length){
      // IMPORTANT:
      // Do not pass image-space triangles directly as separate vertexSets to
      // Bodies.fromVertices(). In Matter.js each set is reoriented around its
      // own centre, which destroys the triangles' relative image-space offsets.
      const parts=triangles.map(t=>makeTrianglePart(t,options));

      if(parts.length){
        // Build one rigid compound body.  Each part already has its position
        // in image-local coordinates, so Body.create can preserve the complete
        // spatial arrangement of the triangulation.
        body=Body.create({...options,parts:parts.slice()});

        // We created the geometry around image-local (0,0), so after Body.create
        // the body.position is the compound COM in that local coordinate system.
        // Store the offset needed to render the image centre at local (0,0).
        const comLocal={x:body.position.x,y:body.position.y};
        const visualOffset={x:-comLocal.x,y:-comLocal.y};

        Body.setPosition(body,{x,y});
        body.plugin=body.plugin||{};
        body.plugin.imageVisualOffset=visualOffset;
        body.plugin.debugCompoundCOMLocal=comLocal;
      }
    }

    if(!body){
      body=Bodies.rectangle(x,y,Math.max(10,w),Math.max(10,h),options);
      fallback=true;
      body.plugin=body.plugin||{};
      body.plugin.imageVisualOffset={x:0,y:0};
    }

    body.plugin=body.plugin||{};
    body.plugin.imageWidth=w;
    body.plugin.imageHeight=h;
    body.plugin.debugContours=shape&&shape.debugContours?shape.debugContours:[];
    body.plugin.debugContourVertexCount=shape&&shape.pointCount||0;
    body.plugin.debugTriangulatedCount=triangles.length;
    body.plugin.debugFallback=fallback;
    body.plugin.debugShapeReady=!fallback&&triangles.length>0;
    body.plugin.debugBodyCreated=true;
    body.plugin.debugPartCentroids=triangles.map(t=>({
      x:(t[0].x+t[1].x+t[2].x)/3,
      y:(t[0].y+t[1].y+t[2].y)/3
    }));
    body.plugin.debugPartCount=body.parts&&body.parts.length>1?body.parts.length-1:body.parts.length;
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
  function step(dt){Engine.update(engine,Math.max(1,Math.min(33,dt*1000)));}
  return {engine,world,setup,createPieceBody,add,hold,release,move,rotate,step};
})();
