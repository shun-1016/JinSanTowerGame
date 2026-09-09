/* v1.33.8 - ground-contact change-point diagnostics / compact logging */
const Physics = (() => {
  const {Engine,World,Bodies,Body,Sleeping}=Matter;
  const SUB_STEPS=4;
  const engine=Engine.create({enableSleeping:true,positionIterations:12,velocityIterations:8,constraintIterations:2});
  let physicsSubstepCounter=0;
  engine.gravity.x=0;engine.gravity.y=1;engine.gravity.scale=0.001;
  const world=engine.world; let ground=null,sideWalls=[];

  function setup(width,groundY,baseWidth=width,isEndless=false){
    physicsSubstepCounter=0;
    if(ground) World.remove(world,ground);
    if(sideWalls.length){World.remove(world,sideWalls);sideWalls=[];}
    const bw=Math.max(100,baseWidth),left=(width-bw)/2,right=left+bw;
    ground=Bodies.rectangle((left+right)/2,groundY+14,bw,28,{isStatic:true,label:'ground',friction:0.85,frictionStatic:1,restitution:0});
    World.add(world,ground);
    if(isEndless){const wallH=2000;sideWalls=[Bodies.rectangle(left-14,groundY-wallH/2,28,wallH,{isStatic:true,label:'side-wall',friction:0.8,frictionStatic:1,restitution:0}),Bodies.rectangle(right+14,groundY-wallH/2,28,wallH,{isStatic:true,label:'side-wall',friction:0.8,frictionStatic:1,restitution:0})];World.add(world,sideWalls);}
  }
  function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
  function area(poly){let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p.x*q.y-q.x*p.y;}return a/2;}
  function pointInTriangle(p,a,b,c){const c1=cross(a,b,p),c2=cross(b,c,p),c3=cross(c,a,p),eps=1e-8;return !((c1<-eps||c2<-eps||c3<-eps)&&(c1>eps||c2>eps||c3>eps));}
  function samePoint(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<1e-6;}
  function segmentsIntersect(a,b,c,d){const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b),eps=1e-9;const on=(p,q,r)=>Math.abs(cross(p,q,r))<=eps&&p.x>=Math.min(q.x,r.x)-eps&&p.x<=Math.max(q.x,r.x)+eps&&p.y>=Math.min(q.y,r.y)-eps&&p.y<=Math.max(q.y,r.y)+eps;if((ab1>eps&&ab2<-eps||ab1<-eps&&ab2>eps)&&(cd1>eps&&cd2<-eps||cd1<-eps&&cd2>eps))return true;return on(c,a,b)||on(d,a,b)||on(a,c,d)||on(b,c,d);}
  function hasSelfIntersection(poly){for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];for(let j=i+1;j<poly.length;j++){if(j===i||(j+1)%poly.length===i||(i+1)%poly.length===j)continue;if(segmentsIntersect(a,b,poly[j],poly[(j+1)%poly.length]))return {yes:true,edgeA:i,edgeB:j};}}return {yes:false,edgeA:-1,edgeB:-1};}
  function triangulateDetailed(input){
    const diag={inputCount:input?input.length:0,cleanCount:0,area:0,winding:'-',selfIntersection:false,selfIntersectionEdges:null,triangles:0,failed:false,failReason:'NONE',failIteration:-1,remainingVertices:0};
    if(!input||input.length<3){diag.failed=true;diag.failReason='TOO_FEW_POINTS';return {triangles:[],diag};}
    const poly=[];for(const p of input){if(!poly.length||!samePoint(poly[poly.length-1],p))poly.push({x:p.x,y:p.y});}if(poly.length>=2&&samePoint(poly[0],poly[poly.length-1]))poly.pop();
    diag.cleanCount=poly.length;if(poly.length<3){diag.failed=true;diag.failReason='TOO_FEW_CLEAN_POINTS';return {triangles:[],diag};}
    diag.area=area(poly);diag.winding=diag.area>0?'CCW':diag.area<0?'CW':'ZERO';const si=hasSelfIntersection(poly);diag.selfIntersection=si.yes;diag.selfIntersectionEdges=si.yes?`${si.edgeA}/${si.edgeB}`:null;
    if(Math.abs(diag.area)<0.05){diag.failed=true;diag.failReason='ZERO_AREA';return {triangles:[],diag};}if(diag.area<0){poly.reverse();diag.area=-diag.area;diag.winding='CCW';}
    const indices=poly.map((_,i)=>i),triangles=[];let guard=0;while(indices.length>3){if(guard++>poly.length*poly.length*4){diag.failed=true;diag.failReason='GUARD_LIMIT';diag.failIteration=guard;diag.remainingVertices=indices.length;return {triangles:[],diag};}let earFound=false;for(let i=0;i<indices.length;i++){const ia=indices[(i-1+indices.length)%indices.length],ib=indices[i],ic=indices[(i+1)%indices.length],a=poly[ia],b=poly[ib],c=poly[ic];if(cross(a,b,c)<=1e-7)continue;let contains=false;for(const id of indices){if(id===ia||id===ib||id===ic)continue;if(pointInTriangle(poly[id],a,b,c)){contains=true;break;}}if(contains)continue;triangles.push([a,b,c]);indices.splice(i,1);earFound=true;break;}if(!earFound){diag.failed=true;diag.failReason='NO_EAR_FOUND';diag.failIteration=guard;diag.remainingVertices=indices.length;return {triangles:[],diag};}}
    if(indices.length===3)triangles.push([poly[indices[0]],poly[indices[1]],poly[indices[2]]]);const valid=triangles.filter(t=>Math.abs(area(t))>0.05);diag.triangles=valid.length;if(valid.length!==triangles.length){diag.failed=true;diag.failReason='DEGENERATE_TRIANGLE';diag.remainingVertices=indices.length;return {triangles:[],diag};}return {triangles:valid,diag};
  }
  function samePointExact(a,b){return Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6;}
  function simplifyPolygonCollinear(poly){if(poly.length<4)return poly.slice();const out=[];for(let i=0;i<poly.length;i++){const a=poly[(i-1+poly.length)%poly.length],b=poly[i],c=poly[(i+1)%poly.length];if(Math.abs(cross(a,b,c))>1e-7)out.push(b);}return out;}
  function isConvex(poly){let sign=0;for(let i=0;i<poly.length;i++){const cr=cross(poly[i],poly[(i+1)%poly.length],poly[(i+2)%poly.length]);if(Math.abs(cr)<=1e-7)continue;const s=cr>0?1:-1;if(!sign)sign=s;else if(s!==sign)return false;}return sign!==0;}
  function mergeTwoConvexPolys(a,b){
    const edges=[];const addEdge=(p,q)=>{for(let i=0;i<edges.length;i++){if(samePointExact(edges[i][0],q)&&samePointExact(edges[i][1],p)){edges.splice(i,1);return;}}edges.push([p,q]);};
    for(let i=0;i<a.length;i++)addEdge(a[i],a[(i+1)%a.length]);for(let i=0;i<b.length;i++)addEdge(b[i],b[(i+1)%b.length]);if(edges.length<3)return null;
    const outgoing=new Map(),key=p=>`${p.x},${p.y}`;for(const e of edges){const k=key(e[0]);if(!outgoing.has(k))outgoing.set(k,[]);outgoing.get(k).push(e);}const start=edges[0][0],poly=[start];let cur=edges[0][1];edges.splice(0,1);let guard=0;
    while(!samePointExact(cur,start)&&guard++<edges.length+5){poly.push(cur);const list=outgoing.get(key(cur))||[];const e=list.find(e=>edges.includes(e));if(!e)return null;edges.splice(edges.indexOf(e),1);cur=e[1];}
    if(!samePointExact(cur,start)||poly.length<3||edges.length)return null;const clean=simplifyPolygonCollinear(poly);if(clean.length<3)return null;if(area(clean)<0)clean.reverse();if(Math.abs(area(clean))<0.05||!isConvex(clean))return null;return clean;
  }

  // v1.30.0: preserve exact opaque coverage, but choose convex merges globally
  // rather than relying on the previous first-match greedy merge order.
  // Only unions that remain convex are accepted, so no transparent pixels are filled.
  function convexDecomposeOptimized(triangles){
    let polys=triangles.map(t=>t.map(p=>({x:p.x,y:p.y}))),changed=true;
    while(changed){
      changed=false;let best=null;
      for(let i=0;i<polys.length;i++)for(let j=i+1;j<polys.length;j++){
        const a=polys[i],b=polys[j];let shared=false;
        for(let ai=0;ai<a.length&&!shared;ai++){const a1=a[ai],a2=a[(ai+1)%a.length];for(let bj=0;bj<b.length;bj++){if(samePointExact(a1,b[(bj+1)%b.length])&&samePointExact(a2,b[bj])){shared=true;break;}}}
        if(!shared)continue;
        const merged=mergeTwoConvexPolys(a,b);if(!merged)continue;
        const perimeter=merged.reduce((sum,p,i)=>sum+Math.hypot(p.x-merged[(i+1)%merged.length].x,p.y-merged[(i+1)%merged.length].y),0);
        const score=merged.length*100000 + perimeter;
        if(!best||score<best.score)best={i,j,merged,score};
      }
      if(best){polys[best.i]=best.merged;polys.splice(best.j,1);changed=true;}
    }
    return polys;
  }

  function mergeRegionPolys(regions){
    let polys=regions.map(r=>r.map(p=>({x:p.x,y:p.y}))),changed=true;while(changed){changed=false;outer:for(let i=0;i<polys.length;i++)for(let j=i+1;j<polys.length;j++){const a=polys[i],b=polys[j];let shared=false;for(let ai=0;ai<a.length&&!shared;ai++){const a1=a[ai],a2=a[(ai+1)%a.length];for(let bj=0;bj<b.length;bj++){if(samePointExact(a1,b[(bj+1)%b.length])&&samePointExact(a2,b[bj])){shared=true;break;}}}if(!shared)continue;const merged=mergeTwoConvexPolys(a,b);if(!merged)continue;polys[i]=merged;polys.splice(j,1);changed=true;break outer;}}return polys;
  }
  function createPieceBody(x,y,w,h,shape){
    const options={label:'piece',friction:0.35,frictionStatic:0.45,frictionAir:0.015,restitution:0,density:0.002,sleepThreshold:60,slop:0.10};
    const rawRegions=shape&&Array.isArray(shape.regions)?shape.regions:[],regions=rawRegions.length?mergeRegionPolys(rawRegions):[],allTriangles=[];let failed=false,failReason='NONE',failIteration=-1,remainingVertices=0;
    for(const region of regions){const result=triangulateDetailed(region);if(result.diag.failed){failed=true;if(failReason==='NONE')failReason=result.diag.failReason||'REGION_TRIANGULATION_FAILED';failIteration=result.diag.failIteration;remainingVertices=result.diag.remainingVertices;continue;}allTriangles.push(...result.triangles);}
    if(!regions.length&&shape&&shape.contour&&shape.contour.length>=3){const result=triangulateDetailed(shape.contour);if(result.diag.failed){failed=true;failReason=result.diag.failReason||'CONTOUR_TRIANGULATION_FAILED';failIteration=result.diag.failIteration;remainingVertices=result.diag.remainingVertices;}else allTriangles.push(...result.triangles);}
    const convexPolys=allTriangles.length?convexDecomposeOptimized(allTriangles):[];let body=null,fallback=false;
    if(convexPolys.length){const parts=convexPolys.map(poly=>{const cx=poly.reduce((s,p)=>s+p.x,0)/poly.length,cy=poly.reduce((s,p)=>s+p.y,0)/poly.length;return Bodies.fromVertices(cx,cy,[poly],{...options,label:'piece-part'},false,0.001,0.001,0.001);});if(parts.length){body=Body.create({...options,parts:parts.slice()});const comLocal={x:body.position.x,y:body.position.y};body.plugin=body.plugin||{};body.plugin.imageVisualOffset={x:-comLocal.x,y:-comLocal.y};body.plugin.debugCompoundCOMLocal=comLocal;Body.setPosition(body,{x,y});}}
    if(!body){body=Bodies.rectangle(x,y,Math.max(10,w),Math.max(10,h),options);fallback=true;body.plugin=body.plugin||{};body.plugin.imageVisualOffset={x:0,y:0};}
    const areaTotal=allTriangles.reduce((s,t)=>s+Math.abs(area(t)),0),diag={inputCount:regions.reduce((s,r)=>s+r.length,0),cleanCount:regions.reduce((s,r)=>s+r.length,0),area:areaTotal,winding:'CCW',selfIntersection:false,selfIntersectionEdges:null,triangles:allTriangles.length,failed,failReason:failed?failReason:'NONE',failIteration,remainingVertices};
    body.plugin=body.plugin||{};body.plugin.imageWidth=w;body.plugin.imageHeight=h;body.plugin.debugContours=shape&&shape.debugContours?shape.debugContours:[];body.plugin.debugContourVertexCount=shape&&shape.pointCount||0;body.plugin.debugTriangulatedCount=allTriangles.length;body.plugin.debugConvexPartCount=convexPolys.length;body.plugin.debugTriangulation=diag;body.plugin.debugFallback=fallback;body.plugin.debugShapeReady=!fallback&&allTriangles.length>0;body.plugin.debugBodyCreated=true;body.plugin.debugHoleCount=shape&&shape.holeCount||0;body.plugin.debugRegionCount=regions.length;body.plugin.debugRawRegionCount=rawRegions.length;body.plugin.debugPartCentroids=convexPolys.map(poly=>({x:poly.reduce((s,p)=>s+p.x,0)/poly.length,y:poly.reduce((s,p)=>s+p.y,0)/poly.length}));
    const comOffset=body.plugin.imageVisualOffset||{x:0,y:0},allVerts=(body.parts||[]).slice(1).flatMap(part=>part.vertices||[]);let footprintWidth=0;if(allVerts.length){const maxY=Math.max(...allVerts.map(p=>p.y)),bottom=allVerts.filter(p=>p.y>=maxY-1);if(bottom.length)footprintWidth=Math.max(...bottom.map(p=>p.x))-Math.min(...bottom.map(p=>p.x));}
    body.plugin.debugPartCount=body.parts&&body.parts.length>1?body.parts.length-1:body.parts.length;body.plugin.debugMass=body.mass;body.plugin.debugInertia=body.inertia;body.plugin.debugComOffsetX=comOffset.x;body.plugin.debugComOffsetY=comOffset.y;body.plugin.debugComOffset=Math.hypot(comOffset.x,comOffset.y);body.plugin.debugFootprintWidth=footprintWidth;body.plugin.debugAspectRatio=Math.max(w,h)/Math.max(1,Math.min(w,h));return body;
  }
  function add(body){World.add(world,body);}
  function hold(body,x,y,angle=0){Body.setStatic(body,true);Body.setPosition(body,{x,y});Body.setAngle(body,angle);Body.setVelocity(body,{x:0,y:0});Body.setAngularVelocity(body,0);Sleeping.set(body,true);}
  function release(body){Body.setStatic(body,false);Sleeping.set(body,false);body.plugin=body.plugin||{};body.plugin.settleFrames=0;body.plugin.releaseFrames=0;Body.setVelocity(body,{x:0,y:0});Body.setAngularVelocity(body,0);}
  function move(body,x,y){Body.setPosition(body,{x,y});Body.setVelocity(body,{x:0,y:0});Body.setAngularVelocity(body,0);body.plugin=body.plugin||{};body.plugin.settleFrames=0;body.plugin.releaseFrames=0;Sleeping.set(body,true);}
  function rotate(body,delta){Body.rotate(body,delta);Body.setVelocity(body,{x:0,y:0});Body.setAngularVelocity(body,0);body.plugin=body.plugin||{};body.plugin.settleFrames=0;body.plugin.releaseFrames=0;Sleeping.set(body,true);}
  // v1.33.1 experiment:
  // Use the actual colliding Part geometry to estimate the ground support span.
  // collision.supports are retained only as a fallback for point contacts; they
  // are not treated as the support width of a broad edge.
  // When a piece lands on an extremely narrow geometric support while the support
  // center is far from the COM, suppress only the collision-generated angular
  // velocity. No piece-ID or asset-count dependency is introduced.
  const NARROW_CONTACT_THRESHOLD_PX=8;
  const CONTACT_OFFSET_THRESHOLD_PX=5;
  const GROUND_EDGE_TOLERANCE_PX=2.5;
  const MAX_LANDING_ANGULAR_CORRECTION=0.70;
  const MIN_COLLISION_DELTA_ANGULAR=0.02;

  function clamp01(v){return Math.max(0,Math.min(1,v));}
  function getBodyRoot(part){return part&&part.parent?part.parent:part;}

  function getGroundContactInfo(body){
    if(!ground||!body||body.isStatic)return null;
    const root=getBodyRoot(body);
    const contactParts=[];
    const supports=[];
    const pairs=engine.pairs&&engine.pairs.list?engine.pairs.list:[];

    for(const pair of pairs){
      if(!pair||!pair.isActive)continue;
      let moving=null;
      if(pair.bodyA===ground&&getBodyRoot(pair.bodyB)===root)moving=pair.bodyB;
      else if(pair.bodyB===ground&&getBodyRoot(pair.bodyA)===root)moving=pair.bodyA;
      if(!moving)continue;
      if(!contactParts.includes(moving))contactParts.push(moving);
      const pairSupports=pair.collision&&pair.collision.supports?pair.collision.supports:[];
      for(const v of pairSupports){
        if(v&&Number.isFinite(v.x)&&Number.isFinite(v.y))supports.push(v);
      }
    }
    if(!contactParts.length&&!supports.length)return null;

    // Prefer the actual vertices of the Part that is colliding with the ground.
    // An edge is considered a ground-support edge when both endpoints are close
    // to the top surface of the ground. Its projected X span is the geometric
    // support width, independent of how many Matter collision support points exist.
    const groundTop=ground.bounds.min.y;
    const edgeSegments=[];
    for(const part of contactParts){
      const vertices=part&&part.vertices?part.vertices:[];
      if(vertices.length<2)continue;
      for(let i=0;i<vertices.length;i++){
        const a=vertices[i],b=vertices[(i+1)%vertices.length];
        if(!a||!b)continue;
        if(Math.abs(a.y-groundTop)<=GROUND_EDGE_TOLERANCE_PX&&Math.abs(b.y-groundTop)<=GROUND_EDGE_TOLERANCE_PX){
          edgeSegments.push({a,b});
        }
      }
    }

    if(edgeSegments.length){
      const xs=edgeSegments.flatMap(e=>[e.a.x,e.b.x]);
      const minX=Math.min(...xs),maxX=Math.max(...xs);
      const span=Math.max(0,maxX-minX);
      const center=(minX+maxX)/2;
      const offset=Math.abs(center-body.position.x);
      return {span,offset,points:supports,source:'geometry-edge',edgeSegments,partIds:contactParts.map(p=>p.id).filter(v=>v!==undefined)};
    }

    // Genuine point/corner contact has no ground-aligned edge. In that case a
    // support point is an appropriate zero-width fallback.
    if(supports.length){
      const minX=Math.min(...supports.map(p=>p.x)),maxX=Math.max(...supports.map(p=>p.x));
      const span=Math.max(0,maxX-minX);
      const center=(minX+maxX)/2;
      const offset=Math.abs(center-body.position.x);
      return {span,offset,points:supports,source:'collision-support-fallback',edgeSegments:[],partIds:contactParts.map(p=>p.id).filter(v=>v!==undefined)};
    }
    return null;
  }

  function getGroundCollisionResponse(body,deltaVx,deltaVy,deltaAngular){
    if(!ground||!body||body.isStatic)return null;
    const root=getBodyRoot(body);
    const pairs=engine.pairs&&engine.pairs.list?engine.pairs.list:[];
    let pairCount=0,contactCount=0,supportCount=0,depthSum=0,separationSum=0,frictionSum=0,frictionStaticSum=0;
    let nxSum=0,nySum=0,weightSum=0;
    let bestDepth=-Infinity,bestSeparation=Infinity,bestPair=null;
    for(const pair of pairs){
      if(!pair||!pair.isActive)continue;
      const a=pair.bodyA,b=pair.bodyB;
      const aRoot=getBodyRoot(a),bRoot=getBodyRoot(b);
      const isGroundPair=(a===ground&&bRoot===root)||(b===ground&&aRoot===root);
      if(!isGroundPair)continue;
      pairCount++;
      const contacts=pair.contacts||[];
      contactCount+=Number(pair.contactCount||contacts.length||0);
      const supports=pair.collision&&pair.collision.supports?pair.collision.supports:[];
      supportCount+=supports.length;
      const c=pair.collision||{};
      const nx=Number(c.normal&&c.normal.x),ny=Number(c.normal&&c.normal.y);
      const w=Math.max(1,Number(pair.contactCount||contacts.length||supports.length||1));
      if(Number.isFinite(nx)&&Number.isFinite(ny)){nxSum+=nx*w;nySum+=ny*w;weightSum+=w;}
      const depth=Number(c.depth);
      const separation=Number(c.separation);
      if(Number.isFinite(depth)){depthSum+=depth*w;if(depth>bestDepth){bestDepth=depth;bestPair=pair;}}
      if(Number.isFinite(separation)){separationSum+=separation*w;if(separation<bestSeparation)bestSeparation=separation;}
      const friction=Number(pair.friction),frictionStatic=Number(pair.frictionStatic);
      if(Number.isFinite(friction))frictionSum+=friction*w;
      if(Number.isFinite(frictionStatic))frictionStaticSum+=frictionStatic*w;
    }
    if(!pairCount)return null;
    let nx=nxSum,ny=nySum;
    if(weightSum){const len=Math.hypot(nx,ny)||1;nx/=len;ny/=len;}else{nx=0;ny=1;}
    const tx=-ny,ty=nx;
    const deltaVn=deltaVx*nx+deltaVy*ny;
    const deltaVt=deltaVx*tx+deltaVy*ty;
    const mass=Number(body.mass);
    const inertia=Number(body.inertia);
    return {
      pairCount,contactCount,supportCount,
      normalX:nx,normalY:ny,normalAngle:Math.atan2(ny,nx),
      tangentX:tx,tangentY:ty,
      depth:bestDepth>-Infinity?bestDepth:NaN,
      meanDepth:weightSum?depthSum/weightSum:NaN,
      minSeparation:bestSeparation<Infinity?bestSeparation:NaN,
      meanSeparation:weightSum?separationSum/weightSum:NaN,
      friction:weightSum?frictionSum/weightSum:NaN,
      frictionStatic:weightSum?frictionStaticSum/weightSum:NaN,
      deltaVn,deltaVt,
      linearImpulseNormalProxy:Number.isFinite(mass)?mass*deltaVn:NaN,
      linearImpulseTangentProxy:Number.isFinite(mass)?mass*deltaVt:NaN,
      angularImpulseProxy:Number.isFinite(inertia)?inertia*deltaAngular:NaN,
      sourcePairId:bestPair&&bestPair.id!==undefined?bestPair.id:''
    };
  }

  function suppressNarrowLandingTorque(body,beforeAngularVelocity){
    body.plugin=body.plugin||{};
    const info=getGroundContactInfo(body);
    // Record every evaluation, not only cases where a correction is applied.
    // This makes v1.33.2 an observation-only extension of v1.33.1: physics
    // parameters and the correction formula itself are unchanged.
    body.plugin.narrowLandingEvaluated=!!info;
    body.plugin.narrowLandingContactSpan=info?info.span:NaN;
    body.plugin.narrowLandingContactSource=info?info.source:'';
    body.plugin.narrowLandingContactOffset=info?info.offset:NaN;
    body.plugin.narrowLandingAngularBefore=beforeAngularVelocity;
    body.plugin.narrowLandingAngularAfter=body.angularVelocity;
    body.plugin.narrowLandingAngularDelta=info?body.angularVelocity-beforeAngularVelocity:NaN;
    body.plugin.narrowLandingCondition=!!info && info.span<NARROW_CONTACT_THRESHOLD_PX;
    body.plugin.narrowLandingOffsetCondition=!!info && info.offset>CONTACT_OFFSET_THRESHOLD_PX;
    body.plugin.narrowLandingDeltaCondition=!!info && Math.abs(body.angularVelocity-beforeAngularVelocity)>=MIN_COLLISION_DELTA_ANGULAR;
    body.plugin.narrowLandingCorrection=0;
    body.plugin.narrowLandingCorrectionApplied=false;
    if(!info)return;
    if(info.span>=NARROW_CONTACT_THRESHOLD_PX)return;
    if(info.offset<=CONTACT_OFFSET_THRESHOLD_PX)return;
    const delta=body.angularVelocity-beforeAngularVelocity;
    if(Math.abs(delta)<MIN_COLLISION_DELTA_ANGULAR)return;

    const narrowFactor=clamp01((NARROW_CONTACT_THRESHOLD_PX-info.span)/NARROW_CONTACT_THRESHOLD_PX);
    const offsetFactor=clamp01((info.offset-CONTACT_OFFSET_THRESHOLD_PX)/12);
    const correction=Math.min(MAX_LANDING_ANGULAR_CORRECTION,narrowFactor*offsetFactor);
    if(correction<=0)return;

    const after=beforeAngularVelocity+delta*(1-correction);
    Body.setAngularVelocity(body,after);
    body.plugin.narrowLandingAngularAfter=after;
    body.plugin.narrowLandingCorrection=correction;
    body.plugin.narrowLandingCorrectionApplied=true;

    // Latch the first actual correction event so later substeps cannot overwrite
    // the evidence before measurement captures the landing frame.
    if(!body.plugin.narrowLandingCorrectionAppliedLatched){
      body.plugin.narrowLandingCorrectionAppliedLatched=true;
      body.plugin.narrowLandingCorrectionLatched=correction;
      body.plugin.narrowLandingContactSpanLatched=info.span;
      body.plugin.narrowLandingContactSourceLatched=info.source;
      body.plugin.narrowLandingContactOffsetLatched=info.offset;
      body.plugin.narrowLandingAngularBeforeLatched=beforeAngularVelocity;
      body.plugin.narrowLandingAngularDeltaLatched=delta;
      body.plugin.narrowLandingAngularAfterLatched=after;
      body.plugin.narrowLandingWidthConditionLatched=true;
      body.plugin.narrowLandingOffsetConditionLatched=true;
      body.plugin.narrowLandingDeltaConditionLatched=true;
    }

    // Keep the legacy v1.33.1 diagnostic names for compatibility.
    body.plugin.lastNarrowLandingContactSpan=info.span;
    body.plugin.lastNarrowLandingContactSource=info.source;
    body.plugin.lastNarrowLandingContactOffset=info.offset;
    body.plugin.lastNarrowLandingAngularCorrection=correction;
  }

  function finalizeGroundContactHistory(body, endSubstep=null){
    const plugin=body&&body.plugin?body.plugin:null;
    if(!plugin||!plugin.groundContactEventActive)return;
    const ev=plugin.groundContactEventActive;
    ev.endSubstep=endSubstep===null?physicsSubstepCounter:endSubstep;
    ev.durationSubsteps=Math.max(1,ev.endSubstep-ev.startSubstep+1);
    // end* is already the last state observed while contact was active. Do not
    // replace it with the following non-contact substep.
    ev.deltaX=ev.endX-ev.startX; ev.deltaY=ev.endY-ev.startY;
    ev.deltaAngle=ev.endAngle-ev.startAngle; ev.deltaVx=ev.endVx-ev.startVx;
    ev.deltaVy=ev.endVy-ev.startVy; ev.deltaOmega=ev.endOmega-ev.startOmega;
    ev.partIds=Array.from(ev.partIds||[]);
    plugin.groundContactEvents=plugin.groundContactEvents||[];
    plugin.groundContactEvents.push(ev);
    plugin.groundContactEventActive=null;
  }

  function step(dt){
    const totalMs=Math.max(1,Math.min(33,dt*1000)),subDt=totalMs/SUB_STEPS;
    for(let i=0;i<SUB_STEPS;i++){
      const dynamicBodies=world.bodies.filter(b=>!b.isStatic&&b.label==='piece');
      const before=dynamicBodies.map(body=>({
        body,
        omega:body.angularVelocity,
        vx:body.velocity.x,
        vy:body.velocity.y,
        x:body.position.x,
        y:body.position.y
      }));
      Engine.update(engine,subDt);
      physicsSubstepCounter++;
      for(const item of before){
        suppressNarrowLandingTorque(item.body,item.omega);
        const info=getGroundContactInfo(item.body);
        const plugin=item.body.plugin=item.body.plugin||{};
        if(info){
          const deltaVx=item.body.velocity.x-item.vx;
          const deltaVy=item.body.velocity.y-item.vy;
          const deltaOmega=item.body.angularVelocity-item.omega;
          const response=getGroundCollisionResponse(item.body,deltaVx,deltaVy,deltaOmega);
          const event={
            substep:physicsSubstepCounter,
            vxBefore:item.vx,vxAfter:item.body.velocity.x,deltaVx,
            vyBefore:item.vy,vyAfter:item.body.velocity.y,deltaVy,
            angularBefore:item.omega,angularAfter:item.body.angularVelocity,deltaAngular:deltaOmega,
            xBefore:item.x,xAfter:item.body.position.x,deltaX:item.body.position.x-item.x,
            yBefore:item.y,yAfter:item.body.position.y,deltaY:item.body.position.y-item.y,
            contactWidth:info.span,contactOffset:info.offset,contactSource:info.source,
            partIds:info.partIds||[],response:response||null
          };
          if(!plugin.firstGroundContactEventLatched){
            plugin.firstGroundContactEventLatched=true;
            plugin.firstGroundContactEvent=event;
          }
          if(!plugin.maxGroundDeltaVxEventLatched || Math.abs(deltaVx)>Math.abs(plugin.maxGroundDeltaVxEventLatched.deltaVx)){
            plugin.maxGroundDeltaVxEventLatched=event;
          }

          if(!plugin.groundContactEventActive){
            plugin.groundContactEventActive={
              startSubstep:physicsSubstepCounter,endSubstep:physicsSubstepCounter,durationSubsteps:1,
              startX:item.body.position.x,startY:item.body.position.y,startAngle:item.body.angle,
              startVx:item.body.velocity.x,startVy:item.body.velocity.y,startOmega:item.body.angularVelocity,
              endX:item.body.position.x,endY:item.body.position.y,endAngle:item.body.angle,
              endVx:item.body.velocity.x,endVy:item.body.velocity.y,endOmega:item.body.angularVelocity,
              deltaX:0,deltaY:0,deltaAngle:0,deltaVx:0,deltaVy:0,deltaOmega:0,
              minWidth:info.span,maxWidth:info.span,maxOffset:info.offset,maxAbsDvx:Math.abs(deltaVx),
              maxDvx:deltaVx,maxDvxSubstep:physicsSubstepCounter,maxDvxWidth:info.span,maxDvxOffset:info.offset,
              maxDvxVn:response?response.deltaVn:NaN,maxDvxVt:response?response.deltaVt:NaN,
              maxAbsDomega:Math.abs(deltaOmega),maxDomega:deltaOmega,maxDomegaSubstep:physicsSubstepCounter,
              maxAbsDvt:response?Math.abs(response.deltaVt):0,totalAbsDvx:Math.abs(deltaVx),
              partIds:new Set(info.partIds||[]),
              lastPartKey:(info.partIds||[]).slice().sort((a,b)=>a-b).join(';'),
              lastWidth:info.span,lastOffset:info.offset,
              changePoints:[{
                substep:physicsSubstepCounter,reason:'START',
                partIds:(info.partIds||[]).slice().sort((a,b)=>a-b),
                contactWidth:info.span,contactOffset:info.offset,
                vxBefore:item.vx,vxAfter:item.body.velocity.x,deltaVx,
                vyBefore:item.vy,vyAfter:item.body.velocity.y,deltaVy,
                angularBefore:item.omega,angularAfter:item.body.angularVelocity,deltaAngular:deltaOmega,
                deltaVn:response?response.deltaVn:NaN,deltaVt:response?response.deltaVt:NaN,
                x:item.body.position.x,angle:item.body.angle,cumulativeDeltaX:0,cumulativeDeltaAngle:0,
                contactPoints:response?response.contactCount:0,supportCount:response?response.supportCount:0
              }]
            };
          }else{
            const ev=plugin.groundContactEventActive;
            ev.endSubstep=physicsSubstepCounter; ev.durationSubsteps++;
            ev.endX=item.body.position.x; ev.endY=item.body.position.y; ev.endAngle=item.body.angle;
            ev.endVx=item.body.velocity.x; ev.endVy=item.body.velocity.y; ev.endOmega=item.body.angularVelocity;
            ev.minWidth=Math.min(ev.minWidth,info.span); ev.maxWidth=Math.max(ev.maxWidth,info.span);
            ev.maxOffset=Math.max(ev.maxOffset,info.offset); ev.maxAbsDvx=Math.max(ev.maxAbsDvx,Math.abs(deltaVx));
            ev.totalAbsDvx+=Math.abs(deltaVx);
            const dvt=response?response.deltaVt:NaN; if(Number.isFinite(dvt)){ev.maxAbsDvt=Math.max(ev.maxAbsDvt,Math.abs(dvt));}
            if(Math.abs(deltaVx)>Math.abs(ev.maxDvx)){
              ev.maxDvx=deltaVx;ev.maxDvxSubstep=physicsSubstepCounter;ev.maxDvxWidth=info.span;ev.maxDvxOffset=info.offset;
              ev.maxDvxVn=response?response.deltaVn:NaN;ev.maxDvxVt=dvt;
            }
            if(Math.abs(deltaOmega)>Math.abs(ev.maxAbsDomega)){ev.maxAbsDomega=Math.abs(deltaOmega);ev.maxDomega=deltaOmega;ev.maxDomegaSubstep=physicsSubstepCounter;}
            for(const id of (info.partIds||[]))ev.partIds.add(id);

            const partKey=(info.partIds||[]).slice().sort((a,b)=>a-b).join(';');
            const partChanged=partKey!==ev.lastPartKey;
            const widthChanged=Math.abs(info.span-ev.lastWidth)>=1.0;
            const offsetChanged=Math.abs(info.offset-ev.lastOffset)>=2.0;
            const responseNotable=Math.abs(deltaVx)>=0.15 || Math.abs(deltaOmega)>=0.05 || (response&&Math.abs(response.deltaVt)>=0.15);
            if(partChanged||widthChanged||offsetChanged||responseNotable){
              const reason=[];
              if(partChanged)reason.push('PART_CHANGE');
              if(widthChanged)reason.push('WIDTH_CHANGE');
              if(offsetChanged)reason.push('OFFSET_CHANGE');
              if(responseNotable)reason.push('RESPONSE');
              ev.changePoints.push({
                substep:physicsSubstepCounter,reason:reason.join('+'),
                partIds:(info.partIds||[]).slice().sort((a,b)=>a-b),
                contactWidth:info.span,contactOffset:info.offset,
                vxBefore:item.vx,vxAfter:item.body.velocity.x,deltaVx,
                vyBefore:item.vy,vyAfter:item.body.velocity.y,deltaVy,
                angularBefore:item.omega,angularAfter:item.body.angularVelocity,deltaAngular:deltaOmega,
                deltaVn:response?response.deltaVn:NaN,deltaVt:response?response.deltaVt:NaN,
                x:item.body.position.x,angle:item.body.angle,
                cumulativeDeltaX:item.body.position.x-ev.startX,
                cumulativeDeltaAngle:item.body.angle-ev.startAngle,
                contactPoints:response?response.contactCount:0,supportCount:response?response.supportCount:0
              });
            }
            ev.lastPartKey=partKey;ev.lastWidth=info.span;ev.lastOffset=info.offset;
          }
        }else if(plugin.groundContactEventActive){
          finalizeGroundContactHistory(item.body,physicsSubstepCounter-1);
        }
      }
    }
  }
  return {engine,world,setup,createPieceBody,add,hold,release,move,rotate,step,finalizeGroundContactHistory};
})();
