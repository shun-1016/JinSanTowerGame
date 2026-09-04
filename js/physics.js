/* v22.2 - v20.5 physics + reduced opaque-region compound parts */
const Physics = (() => {
  const {Engine,World,Bodies,Body,Sleeping}=Matter;
  const engine=Engine.create({
    // v20.5: final stability tuning. Keep enough position iterations to
    // resolve stacked contacts cleanly, while damping tiny residual motion.
    enableSleeping:true,
    positionIterations:12,
    velocityIterations:8,
    constraintIterations:2
  });
  engine.gravity.x=0;engine.gravity.y=1;engine.gravity.scale=0.001;
  const world=engine.world;
  let ground=null;

  function setup(width,groundY){
    if(ground) World.remove(world,ground);
    ground=Bodies.rectangle(width/2,groundY+14,Math.max(1000,width*3),28,{
      isStatic:true,label:'ground',friction:0.85,frictionStatic:1,restitution:0
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
  function segmentsIntersect(a,b,c,d){
    const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
    const eps=1e-9;
    const on=(p,q,r)=>Math.abs(cross(p,q,r))<=eps &&
      p.x>=Math.min(q.x,r.x)-eps&&p.x<=Math.max(q.x,r.x)+eps&&
      p.y>=Math.min(q.y,r.y)-eps&&p.y<=Math.max(q.y,r.y)+eps;
    if((ab1>eps&&ab2<-eps || ab1<-eps&&ab2>eps) &&
       (cd1>eps&&cd2<-eps || cd1<-eps&&cd2>eps)) return true;
    return on(c,a,b)||on(d,a,b)||on(a,c,d)||on(b,c,d);
  }

  function hasSelfIntersection(poly){
    const n=poly.length;
    for(let i=0;i<n;i++){
      const a=poly[i],b=poly[(i+1)%n];
      for(let j=i+1;j<n;j++){
        if(j===i || (j+1)%n===i || (i+1)%n===j) continue;
        const c=poly[j],d=poly[(j+1)%n];
        if(segmentsIntersect(a,b,c,d)) return {yes:true,edgeA:i,edgeB:j};
      }
    }
    return {yes:false,edgeA:-1,edgeB:-1};
  }

  function triangulateDetailed(input){
    const diag={
      inputCount:input?input.length:0,
      cleanCount:0,
      area:0,
      winding:'-',
      selfIntersection:false,
      selfIntersectionEdges:null,
      triangles:0,
      failed:false,
      failReason:'NONE',
      failIteration:-1,
      remainingVertices:0
    };
    if(!input||input.length<3){diag.failed=true;diag.failReason='TOO_FEW_POINTS';return {triangles:[],diag};}
    const poly=[];
    for(const p of input){
      if(!poly.length||!samePoint(poly[poly.length-1],p)) poly.push({x:p.x,y:p.y});
    }
    if(poly.length>=2&&samePoint(poly[0],poly[poly.length-1]))poly.pop();
    diag.cleanCount=poly.length;
    if(poly.length<3){diag.failed=true;diag.failReason='TOO_FEW_CLEAN_POINTS';return {triangles:[],diag};}
    diag.area=area(poly);
    diag.winding=diag.area>0?'CCW':(diag.area<0?'CW':'ZERO');
    const si=hasSelfIntersection(poly);
    diag.selfIntersection=si.yes;
    diag.selfIntersectionEdges=si.yes?`${si.edgeA}/${si.edgeB}`:null;
    if(Math.abs(diag.area)<0.05){diag.failed=true;diag.failReason='ZERO_AREA';return {triangles:[],diag};}
    if(diag.area<0){poly.reverse();diag.area=-diag.area;diag.winding='CCW';}

    const indices=poly.map((_,i)=>i),triangles=[];
    let guard=0;
    while(indices.length>3){
      if(guard++>poly.length*poly.length*4){
        diag.failed=true;diag.failReason='GUARD_LIMIT';diag.failIteration=guard;diag.remainingVertices=indices.length;
        return {triangles:[],diag};
      }
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
      if(!earFound){
        diag.failed=true;
        diag.failReason='NO_EAR_FOUND';
        diag.failIteration=guard;
        diag.remainingVertices=indices.length;
        return {triangles:[],diag};
      }
    }
    if(indices.length===3)triangles.push([poly[indices[0]],poly[indices[1]],poly[indices[2]]]);
    const valid=triangles.filter(t=>Math.abs(area(t))>0.05);
    diag.triangles=valid.length;
    if(valid.length!==triangles.length){
      diag.failed=true;diag.failReason='DEGENERATE_TRIANGLE';diag.remainingVertices=indices.length;
      return {triangles:[],diag};
    }
    return {triangles:valid,diag};
  }

  function triangulate(input){
    return triangulateDetailed(input).triangles;
  }

  function makeConvexPart(poly,options){
    const cx=poly.reduce((sum,p)=>sum+p.x,0)/poly.length;
    const cy=poly.reduce((sum,p)=>sum+p.y,0)/poly.length;
    return Bodies.fromVertices(cx,cy,[poly],{
      ...options,
      label:'piece-part'
    },false,0.001,0.001,0.001);
  }

  function samePointExact(a,b){return Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6;}

  // Combine adjacent triangles whenever their union is still a convex polygon.
  // This keeps the outer boundary identical to the triangulation while greatly
  // reducing the number of Matter.js compound parts.
  function mergeTwoConvexPolys(a,b){
    const edges=[];
    const addEdge=(p,q)=>{
      for(let i=0;i<edges.length;i++){
        if(samePointExact(edges[i][0],q)&&samePointExact(edges[i][1],p)){
          edges.splice(i,1); return;
        }
      }
      edges.push([p,q]);
    };
    for(let i=0;i<a.length;i++) addEdge(a[i],a[(i+1)%a.length]);
    for(let i=0;i<b.length;i++) addEdge(b[i],b[(i+1)%b.length]);
    if(edges.length<3) return null;

    const outgoing=new Map();
    const key=p=>`${p.x},${p.y}`;
    for(const e of edges){
      const k=key(e[0]);
      if(!outgoing.has(k)) outgoing.set(k,[]);
      outgoing.get(k).push(e);
    }
    const start=edges[0][0];
    const poly=[start];
    let cur=edges[0][1];
    edges.splice(0,1);
    let guard=0;
    while(!samePointExact(cur,start)&&guard++<edges.length+5){
      poly.push(cur);
      const list=outgoing.get(key(cur))||[];
      const idx=list.findIndex(e=>edges.includes(e));
      if(idx<0) return null;
      const e=list[idx];
      const ei=edges.indexOf(e);
      edges.splice(ei,1);
      cur=e[1];
    }
    if(!samePointExact(cur,start)||poly.length<3||edges.length) return null;

    const clean=simplifyPolygonCollinear(poly);
    if(clean.length<3) return null;
    const ar=area(clean);
    if(ar<0) clean.reverse();
    if(Math.abs(area(clean))<0.05) return null;
    if(!isConvex(clean)) return null;
    return clean;
  }

  function simplifyPolygonCollinear(poly){
    if(poly.length<4) return poly.slice();
    const out=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[(i-1+poly.length)%poly.length],b=poly[i],c=poly[(i+1)%poly.length];
      if(Math.abs(cross(a,b,c))>1e-7) out.push(b);
    }
    return out;
  }

  function isConvex(poly){
    let sign=0;
    for(let i=0;i<poly.length;i++){
      const cr=cross(poly[i],poly[(i+1)%poly.length],poly[(i+2)%poly.length]);
      if(Math.abs(cr)<=1e-7) continue;
      const s=cr>0?1:-1;
      if(!sign) sign=s;
      else if(s!==sign) return false;
    }
    return sign!==0;
  }

  function convexDecompose(triangles){
    // Start with one polygon per triangulation triangle. Repeatedly merge the
    // first pair whose shared edge produces a convex union. For the small
    // ~10-250 triangle counts used here this O(n^2) greedy pass is inexpensive,
    // while avoiding the hundreds of tiny contacts that caused tower jitter.
    let polys=triangles.map(t=>t.map(p=>({x:p.x,y:p.y})));
    let changed=true;
    while(changed){
      changed=false;
      outer:
      for(let i=0;i<polys.length;i++){
        for(let j=i+1;j<polys.length;j++){
          let shared=false;
          for(let ai=0;ai<polys[i].length&&!shared;ai++){
            const a1=polys[i][ai],a2=polys[i][(ai+1)%polys[i].length];
            for(let bj=0;bj<polys[j].length;bj++){
              const b1=polys[j][bj],b2=polys[j][(bj+1)%polys[j].length];
              if(samePointExact(a1,b2)&&samePointExact(a2,b1)){shared=true;break;}
            }
          }
          if(!shared) continue;
          const merged=mergeTwoConvexPolys(polys[i],polys[j]);
          if(merged){
            polys[i]=merged;
            polys.splice(j,1);
            changed=true;
            break outer;
          }
        }
      }
    }
    return polys;
  }

  function mergeRegionPolys(regions){
    // v22.2: reduce compound-body part count before triangulation. The B案
    // regions are axis-aligned opaque rectangles. Merge only regions that
    // share a complete edge and whose union remains convex. This preserves
    // transparent gaps and the visible silhouette, while removing internal
    // seams that otherwise become many tiny Matter.js collision parts.
    let polys=regions.map(r=>r.map(p=>({x:p.x,y:p.y})));
    let changed=true;
    while(changed){
      changed=false;
      outer:
      for(let i=0;i<polys.length;i++){
        for(let j=i+1;j<polys.length;j++){
          const a=polys[i],b=polys[j];
          let shared=false;
          for(let ai=0;ai<a.length&&!shared;ai++){
            const a1=a[ai],a2=a[(ai+1)%a.length];
            for(let bj=0;bj<b.length;bj++){
              const b1=b[bj],b2=b[(bj+1)%b.length];
              if(samePointExact(a1,b2)&&samePointExact(a2,b1)){
                shared=true;
                break;
              }
            }
          }
          if(!shared) continue;
          const merged=mergeTwoConvexPolys(a,b);
          if(!merged) continue;
          polys[i]=merged;
          polys.splice(j,1);
          changed=true;
          break outer;
        }
      }
    }
    return polys;
  }

  function createPieceBody(x,y,w,h,shape){
    const options={
      label:'piece',
      friction:0.82,
      frictionStatic:0.95,
      frictionAir:0.014,
      restitution:0,
      density:0.002,
      sleepThreshold:20
    };

    // v22.1 B案:
    // Build the collision body from multiple opaque regions generated from
    // the alpha mask. This avoids the fragile "outer contour + hole bridge"
    // conversion used by v22.0. Transparent areas are never filled.
    const rawRegions=(shape&&Array.isArray(shape.regions))?shape.regions:[];
    const regions=rawRegions.length?mergeRegionPolys(rawRegions):[];
    const allTriangles=[];
    let failed=false;
    let failReason='NONE';
    let failIteration=-1;
    let remainingVertices=0;

    for(const region of regions){
      const result=triangulateDetailed(region);
      if(result.diag.failed){
        failed=true;
        if(failReason==='NONE') failReason=result.diag.failReason||'REGION_TRIANGULATION_FAILED';
        failIteration=result.diag.failIteration;
        remainingVertices=result.diag.remainingVertices;
        continue;
      }
      allTriangles.push(...result.triangles);
    }

    // Backward-compatible fallback for a shape object that has no regions.
    if(!regions.length && shape&&shape.contour&&shape.contour.length>=3){
      const result=triangulateDetailed(shape.contour);
      if(result.diag.failed){
        failed=true;
        failReason=result.diag.failReason||'CONTOUR_TRIANGULATION_FAILED';
        failIteration=result.diag.failIteration;
        remainingVertices=result.diag.remainingVertices;
      }else{
        allTriangles.push(...result.triangles);
      }
    }

    const convexPolys=allTriangles.length?convexDecompose(allTriangles):[];
    let body=null;
    let fallback=false;

    if(convexPolys.length){
      const parts=convexPolys.map(poly=>makeConvexPart(poly,options));
      if(parts.length){
        body=Body.create({...options,parts:parts.slice()});
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

    const areaTotal=allTriangles.reduce((sum,t)=>sum+Math.abs(area(t)),0);
    const diag={
      inputCount:regions.reduce((sum,r)=>sum+r.length,0),
      cleanCount:regions.reduce((sum,r)=>sum+r.length,0),
      area:areaTotal,
      winding:'CCW',
      selfIntersection:false,
      selfIntersectionEdges:null,
      triangles:allTriangles.length,
      failed:failed,
      failReason:failed?failReason:'NONE',
      failIteration,
      remainingVertices
    };

    body.plugin=body.plugin||{};
    body.plugin.imageWidth=w;
    body.plugin.imageHeight=h;
    body.plugin.debugContours=shape&&shape.debugContours?shape.debugContours:[];
    body.plugin.debugContourVertexCount=shape&&shape.pointCount||0;
    body.plugin.debugTriangulatedCount=allTriangles.length;
    body.plugin.debugConvexPartCount=convexPolys.length;
    body.plugin.debugTriangulation=diag;
    body.plugin.debugFallback=fallback;
    body.plugin.debugShapeReady=!fallback&&allTriangles.length>0;
    body.plugin.debugBodyCreated=true;
    body.plugin.debugHoleCount=shape&&shape.holeCount||0;
    body.plugin.debugRegionCount=regions.length;
    body.plugin.debugRawRegionCount=rawRegions.length;
    body.plugin.debugPartCentroids=convexPolys.map(poly=>({
      x:poly.reduce((sum,p)=>sum+p.x,0)/poly.length,
      y:poly.reduce((sum,p)=>sum+p.y,0)/poly.length
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
    body.plugin=body.plugin||{};
    body.plugin.settleFrames=0;
    // Do not inject an artificial downward velocity. Gravity alone starts
    // the fall, which avoids an extra impulse at the moment of release.
    Body.setVelocity(body,{x:0,y:0});
    Body.setAngularVelocity(body,0);
  }
  function move(body,x,y){
    Body.setPosition(body,{x,y});
    Body.setVelocity(body,{x:0,y:0});
    Body.setAngularVelocity(body,0);
    body.plugin=body.plugin||{};
    body.plugin.settleFrames=0;
    Sleeping.set(body,true);
  }
  function rotate(body,delta){
    Body.rotate(body,delta);
    Body.setVelocity(body,{x:0,y:0});
    Body.setAngularVelocity(body,0);
    body.plugin=body.plugin||{};
    body.plugin.settleFrames=0;
    Sleeping.set(body,true);
  }
  function step(dt){
    Engine.update(engine,Math.max(1,Math.min(33,dt*1000)));

    // Matter.js sleeping is based on near-zero motion, but a compound body
    // can be repeatedly awakened by tiny contact corrections. Once a released
    // piece has remained effectively motionless for a short consecutive
    // period, explicitly zero its velocities and put it to sleep. This keeps
    // the natural settling phase while removing the long tail of visible
    // vibration in a finished stack.
    const bodies=world.bodies;
    for(const body of bodies){
      if(body.isStatic || body.label!=='piece') continue;
      body.plugin=body.plugin||{};
      if(body.isSleeping){
        body.plugin.settleFrames=0;
        continue;
      }
      const speed=body.speed||0;
      const angularSpeed=body.angularSpeed||0;
      if(speed<0.022 && angularSpeed<0.0010){
        body.plugin.settleFrames=(body.plugin.settleFrames||0)+1;
        if(body.plugin.settleFrames>=6){
          Body.setVelocity(body,{x:0,y:0});
          Body.setAngularVelocity(body,0);
          Sleeping.set(body,true);
          body.plugin.settleFrames=0;
        }
      }else{
        body.plugin.settleFrames=0;
      }
    }
  }
  return {engine,world,setup,createPieceBody,add,hold,release,move,rotate,step};
})();
