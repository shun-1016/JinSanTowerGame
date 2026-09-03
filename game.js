(() => {
"use strict";

const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");
const statusEl=document.getElementById("status");
const scoreEl=document.getElementById("score");
const overlay=document.getElementById("gameover");
const resultEl=document.getElementById("result");
const resultDetail=document.getElementById("resultDetail");
const restartBtn=document.getElementById("restart");
const resetBtn=document.getElementById("reset");
const rotateLeftBtn=document.getElementById("rotateLeft");
const rotateRightBtn=document.getElementById("rotateRight");
const debugEl=document.getElementById("debug");

const ASSETS=Array.from({length:21},(_,i)=>`assets/${String(i+1).padStart(2,"0")}.png`);

const MAX_PIECE=82;
const GRAVITY=1250;
const AIR=0.996;
const BOUNCE=0.02;
const LINEAR_FRICTION=0.82;
const ANGULAR_DAMPING=0.985;
const REST_ANGULAR=0.18;
const SLEEP_ANGULAR=0.24;
const SLEEP_LINEAR=8;
const SETTLE_TIME=0.30;
const TURN_DELAY=450;
const ROTATE_STEP=Math.PI/12;
const MAX_PUSH=12;
const TORQUE_DAMPING=0.90;
const MASK_ALPHA=55;
const BAND_H=4;
const MERGE_TOL=3;
const MAX_PARTS=48;
const MIN_PART_W=1.5;
const MIN_PART_H=1.5;

let W=0,H=0,dpr=1,groundWorldY=0,cameraY=0;
let pieces=[],queue=[],current=null;
let score=0,gameEnded=false,acceptingInput=false;
let pointerId=null,dragging=false,last=performance.now(),turnLockedUntil=0;
let images=[];

function loadImages(){
  return Promise.all(ASSETS.map(src=>new Promise(resolve=>{
    const im=new Image();
    im.onload=()=>resolve(im);
    im.onerror=()=>resolve(null);
    im.src=src;
  }))).then(v=>images=v);
}
function resize(){
  const r=canvas.getBoundingClientRect();
  dpr=Math.min(devicePixelRatio||1,2); W=r.width; H=r.height;
  canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  groundWorldY=H-12;
  if(current&&!current.falling)keepCurrentInside(current);
}
addEventListener("resize",resize);

function shuffle(){
  queue=images.map((_,i)=>i).filter(i=>images[i]);
  for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
}
function dimensions(im){
  const scale=MAX_PIECE/Math.max(im.naturalWidth,im.naturalHeight);
  return {w:im.naturalWidth*scale,h:im.naturalHeight*scale};
}
function buildParts(im,w,h){
  const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(w)); c.height=Math.max(1,Math.round(h));
  const x=c.getContext("2d",{willReadFrequently:true}); x.drawImage(im,0,0,c.width,c.height);
  const data=x.getImageData(0,0,c.width,c.height).data,runs=[];
  for(let y0=0;y0<c.height;y0+=BAND_H){
    const y1=Math.min(c.height,y0+BAND_H),row=[]; let inRun=false,start=0;
    for(let xx=0;xx<c.width;xx++){
      let solid=false;
      for(let yy=y0;yy<y1;yy++){if(data[(yy*c.width+xx)*4+3]>=MASK_ALPHA){solid=true;break;}}
      if(solid&&!inRun){start=xx;inRun=true}
      if(!solid&&inRun){row.push({x1:start,x2:xx,y1:y0,y2:y1});inRun=false}
    }
    if(inRun)row.push({x1:start,x2:c.width,y1:y0,y2:y1});
    runs.push(...row);
  }
  const merged=[];
  for(const r of runs){
    let best=null,bestScore=Infinity;
    for(const m of merged){
      if(Math.abs(m.y2-r.y1)>0.01)continue;
      const overlap=Math.min(m.x2,r.x2)-Math.max(m.x1,r.x1); if(overlap<=0)continue;
      const union=Math.max(m.x2,r.x2)-Math.min(m.x1,r.x1),gap=union-overlap;
      if(gap>MERGE_TOL&&overlap/union<0.72)continue;
      const score=Math.abs((m.x2-m.x1)-(r.x2-r.x1))+gap*1.5;
      if(score<bestScore){best=m;bestScore=score}
    }
    if(best){best.x1=Math.min(best.x1,r.x1);best.x2=Math.max(best.x2,r.x2);best.y2=r.y2}
    else merged.push({...r});
  }
  let parts=merged.filter(r=>(r.x2-r.x1)>=MIN_PART_W&&(r.y2-r.y1)>=MIN_PART_H);
  if(parts.length>MAX_PARTS)parts=parts.sort((a,b)=>(b.x2-b.x1)*(b.y2-b.y1)-(a.x2-a.x1)*(a.y2-a.y1)).slice(0,MAX_PARTS);
  const sx=w/c.width,sy=h/c.height;
  return parts.map(r=>({x:(r.x1+r.x2)*.5*sx-w*.5,y:(r.y1+r.y2)*.5*sy-h*.5,w:Math.max(.8,(r.x2-r.x1)*sx),h:Math.max(.8,(r.y2-r.y1)*sy)}));
}
function processImage(im){
  const d=dimensions(im),c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(d.w));c.height=Math.max(1,Math.round(d.h));
  c.getContext("2d").drawImage(im,0,0,c.width,c.height);
  return {im:c,w:d.w,h:d.h,parts:buildParts(im,d.w,d.h)};
}
function spawn(){
  if(!queue.length)shuffle();
  const id=queue.shift();
  if(id===undefined){endGame("使用できる画像がありません");return}
  const src=images[id],processed=processImage(src);
  current={id,im:src,processed,x:W/2,y:cameraY+Math.max(45,processed.h/2+6),w:processed.w,h:processed.h,parts:processed.parts,a:0,vx:0,vy:0,va:0,falling:false,settle:0,supported:false,contactKey:null,lastSupport:null,sleepReason:""};
  acceptingInput=true; statusEl.textContent="ピースを配置";
}
function reset(){
  pieces=[];cameraY=0;score=0;gameEnded=false;acceptingInput=false;dragging=false;pointerId=null;
  overlay.classList.add("hidden");scoreEl.textContent="0";shuffle();spawn();
}
function endGame(reason){
  gameEnded=true;acceptingInput=false;current=null;dragging=false;
  resultEl.textContent="ゲーム終了";resultDetail.textContent=reason||"タワーが崩れました";overlay.classList.remove("hidden");
}
function rotateCurrent(amount){if(current&&!current.falling&&acceptingInput&&!gameEnded)current.a+=amount}
function localRectPoly(part){
  const x=part.x,y=part.y,w=part.w*.5,h=part.h*.5;
  return [{x:x-w,y:y-h},{x:x+w,y:y-h},{x:x+w,y:y+h},{x:x-w,y:y+h}];
}
function transformPoint(p,v){const c=Math.cos(p.a),s=Math.sin(p.a);return{x:p.x+c*v.x-s*v.y,y:p.y+s*v.x+c*v.y}}
function worldPartPoly(p,part){return localRectPoly(part).map(v=>transformPoint(p,v))}
function pieceAABB(p){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const part of p.parts)for(const v of worldPartPoly(p,part)){minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y)}
  return{minX,minY,maxX,maxY}
}
function axes(poly){
  const out=[];for(let i=0;i<poly.length;i++){const q=poly[(i+1)%poly.length],p=poly[i],dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1;out.push({x:-dy/len,y:dx/len})}return out
}
function project(poly,ax){
  let mn=Infinity,mx=-Infinity;for(const p of poly){const v=p.x*ax.x+p.y*ax.y;mn=Math.min(mn,v);mx=Math.max(mx,v)}return[mn,mx]
}
function rectSat(pa,pb){
  const axs=axes(pa).concat(axes(pb));let best=null;
  for(const ax0 of axs){const[a1,a2]=project(pa,ax0),[b1,b2]=project(pb,ax0),ov=Math.min(a2,b2)-Math.max(a1,b1);if(ov<=0)return null;if(!best||ov<best.depth)best={depth:ov,ax:{x:ax0.x,y:ax0.y}}}return best
}
function satPieces(a,b){
  const aa=pieceAABB(a),bb=pieceAABB(b);
  if(aa.maxX<bb.minX||bb.maxX<aa.minX||aa.maxY<bb.minY||bb.maxY<aa.minY)return null;
  let best=null;
  for(let i=0;i<a.parts.length;i++)for(let j=0;j<b.parts.length;j++){
    const hit=rectSat(worldPartPoly(a,a.parts[i]),worldPartPoly(b,b.parts[j]));if(!hit)continue;
    const dir={x:b.x-a.x,y:b.y-a.y};
    if(dir.x*hit.ax.x+dir.y*hit.ax.y<0){hit.ax.x*=-1;hit.ax.y*=-1}
    if(!best||hit.depth<best.depth)best={...hit,aIndex:i,bIndex:j}
  }
  return best
}
function supportPointForPart(p,part,dir){
  const poly=worldPartPoly(p,part);let best=-Infinity,pts=[];
  for(const v of poly){const d=v.x*dir.x+v.y*dir.y;if(d>best+.5){best=d;pts=[v]}else if(Math.abs(d-best)<=.5)pts.push(v)}
  let x=0,y=0;for(const v of pts){x+=v.x;y+=v.y}return{x:x/pts.length,y:y/pts.length,count:pts.length}
}
function contactPoint(a,b,normal,aIndex,bIndex){
  const pa=supportPointForPart(a,a.parts[aIndex],normal),pb=supportPointForPart(b,b.parts[bIndex],{x:-normal.x,y:-normal.y});
  return{x:(pa.x+pb.x)*.5,y:(pa.y+pb.y)*.5,featureCount:pa.count}
}
function applyGravityTorque(p,cp,dt){
  const rx=cp.x-p.x,size=Math.max(p.w,p.h),inertia=Math.max(55,size*size/10),tau=-rx*GRAVITY;
  p.va+=(tau/inertia)*dt
}
function resolveCollision(p,placed,hit,dt){
  const n=hit.ax,depth=Math.min(hit.depth,MAX_PUSH);p.x-=n.x*depth;p.y-=n.y*depth;
  const cp=contactPoint(p,placed,n,hit.aIndex,hit.bIndex);applyGravityTorque(p,cp,dt);
  const t={x:-n.y,y:n.x},vt=p.vx*t.x+p.vy*t.y,friction=Math.min(1,8*dt);
  p.vx-=vt*t.x*friction;p.vy-=vt*t.y*friction;
  const vn=p.vx*n.x+p.vy*n.y;
  if(vn>0){p.vx-=vn*n.x*(1+BOUNCE);p.vy-=vn*n.y*(1+BOUNCE)}
  p.va*=Math.pow(ANGULAR_DAMPING,dt*60);
  return{normal:n,point:cp,aIndex:hit.aIndex,bIndex:hit.bIndex}
}
function resolveGround(p,dt){
  const down={x:0,y:1};let maxY=-Infinity;
  for(const part of p.parts)for(const v of worldPartPoly(p,part))maxY=Math.max(maxY,v.y);
  if(maxY<=groundWorldY)return null;
  p.y-=maxY-groundWorldY;if(p.vy>0)p.vy*=-BOUNCE;p.vy*=.35;
  let best=-Infinity,points=[];
  for(let i=0;i<p.parts.length;i++){const f=supportPointForPart(p,p.parts[i],down);if(f.y>best+1){best=f.y;points=[f]}else if(Math.abs(f.y-best)<=1)points.push(f)}
  let cp={x:p.x,y:groundWorldY};if(points.length)cp={x:points.reduce((s,v)=>s+v.x,0)/points.length,y:groundWorldY};
  applyGravityTorque(p,cp,dt);p.vx*=LINEAR_FRICTION;p.va*=Math.pow(ANGULAR_DAMPING,dt*60);return{point:cp}
}
function keepCurrentInside(p){
  const box=pieceAABB(p);
  if(box.minX<0){p.x-=box.minX;p.vx*=-.12;p.va*=.75}
  if(box.maxX>W){p.x-=box.maxX-W;p.vx*=-.12;p.va*=.75}
}
function updateCamera(){
  if(!pieces.length)return;
  let top=Infinity;for(const p of pieces)top=Math.min(top,pieceAABB(p).minY);
  const targetScreenTop=Math.max(100,H*.25),desiredCamera=top-targetScreenTop;
  if(desiredCamera<cameraY)cameraY=desiredCamera;
}
function update(dt){
  if(gameEnded)return;
  const now=performance.now();
  if(current&&current.falling){
    current.supported=false;current.contactKey=null;current.lastSupport=null;
    current.vy+=GRAVITY*dt;current.vx*=Math.pow(AIR,dt*60);current.vy*=Math.pow(AIR,dt*20);
    current.x+=current.vx*dt;current.y+=current.vy*dt;current.a+=current.va*dt;keepCurrentInside(current);
    let support=null;
    for(let pass=0;pass<5;pass++){
      let best=null;
      for(const p of pieces){const hit=satPieces(current,p);if(hit&&(!best||hit.depth>best.hit.depth))best={p,hit}}
      if(!best)break;
      const r=resolveCollision(current,best.p,best.hit,dt);
      if(r.normal.y>.35)support={piece:best.p,point:r.point,normal:r.normal};
      current.lastSupport=r;
      keepCurrentInside(current);
    }
    const ground=resolveGround(current,dt);
    if(ground&&!support)support={piece:null,point:ground.point,normal:{x:0,y:1}};
    if(support){
      current.supported=true;current.contactKey=support.piece?"piece":"ground";current.lastSupport=support;
      current.vy=0;current.vx*=Math.pow(.45,dt);current.va*=Math.pow(TORQUE_DAMPING,dt*60);
      if(Math.abs(current.vx)<4)current.vx=0;
      if(Math.abs(current.va)<REST_ANGULAR)current.va*=.45;
      const calm=Math.abs(current.vx)<SLEEP_LINEAR&&Math.abs(current.va)<SLEEP_ANGULAR;
      if(calm)current.settle+=dt;else current.settle=0;
      if(current.settle>=SETTLE_TIME){
        current.vx=0;current.vy=0;current.va=0;current.a=Math.round(current.a/(Math.PI/180))*Math.PI/180;
        current.sleepReason="SLEEP: calm "+SETTLE_TIME.toFixed(2)+"s";
        pieces.push(current);current=null;updateCamera();score++;scoreEl.textContent=String(score);turnLockedUntil=now+TURN_DELAY;
        statusEl.textContent="次のピース";
      }
    }else current.settle=0;
  }else if(!current&&!gameEnded&&now>turnLockedUntil)spawn();
}
function drawPiece(p){
  const screenY=p.y-cameraY;ctx.save();ctx.translate(p.x,screenY);ctx.rotate(p.a);ctx.drawImage(p.processed.im,-p.w/2,-p.h/2,p.w,p.h);ctx.restore()
}
function drawDebug(){
  if(!debugEl)return;
  if(!current){debugEl.textContent=`固定済み: ${pieces.length}個\n次のピースを待機…`;return}
  const c=current,sp=c.lastSupport;
  const deg=(c.a*180/Math.PI).toFixed(1);
  const va=(c.va*180/Math.PI).toFixed(2);
  const point=sp?.point?`${sp.point.x.toFixed(1)}, ${sp.point.y.toFixed(1)}`:"-";
  const n=sp?.normal?`${sp.normal.x.toFixed(2)}, ${sp.normal.y.toFixed(2)}`:"-";
  debugEl.textContent=[
    `状態: ${c.falling?(c.supported?"接地・静止判定中":"落下中"):"操作中"}`,
    `x ${c.x.toFixed(1)}  y ${c.y.toFixed(1)}`,
    `角度 ${deg}°  角速度 ${va}°/s`,
    `vx ${c.vx.toFixed(2)}  vy ${c.vy.toFixed(2)}`,
    `settle ${c.settle.toFixed(2)} / ${SETTLE_TIME.toFixed(2)}s`,
    `支点: ${c.contactKey||"-"}  normal ${n}`,
    `接触点: ${point}`,
    `判定: |vx|<${SLEEP_LINEAR} / |va|<${SLEEP_ANGULAR}`,
    `パーツ数: ${c.parts.length}`
  ].join("\n")
}
function draw(){
  ctx.clearRect(0,0,W,H);
  const grd=ctx.createLinearGradient(0,0,0,H);grd.addColorStop(0,"#fbf8f2");grd.addColorStop(1,"#f1e8dc");ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);
  const sy=groundWorldY-cameraY;ctx.fillStyle="#d8cbbb";ctx.fillRect(0,sy,W,H-sy);ctx.strokeStyle="#c4b4a2";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,sy+.5);ctx.lineTo(W,sy+.5);ctx.stroke();
  for(const p of pieces)drawPiece(p);if(current)drawPiece(current);
  if(current&&current.falling&&current.lastSupport?.point){
    const pt=current.lastSupport.point;
    ctx.save();ctx.fillStyle="#b23a2a";ctx.beginPath();ctx.arc(pt.x,pt.y-cameraY,4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#b23a2a";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(pt.x,pt.y-cameraY);ctx.lineTo(pt.x+(current.lastSupport.normal?.x||0)*28,pt.y-cameraY+(current.lastSupport.normal?.y||0)*28);ctx.stroke();ctx.restore();
  }
  drawDebug();
}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function moveCurrentToScreenX(x){if(!current||current.falling||!acceptingInput)return;current.x=x;keepCurrentInside(current)}
function onPointerDown(e){if(!current||current.falling||!acceptingInput||gameEnded)return;pointerId=e.pointerId;dragging=true;canvas.setPointerCapture?.(pointerId);moveCurrentToScreenX(canvasPoint(e).x);e.preventDefault()}
function onPointerMove(e){if(!dragging||e.pointerId!==pointerId)return;moveCurrentToScreenX(canvasPoint(e).x);e.preventDefault()}
function onPointerUp(e){if(!dragging||e.pointerId!==pointerId)return;dragging=false;pointerId=null;if(current&&!current.falling&&acceptingInput&&!gameEnded){current.falling=true;current.vy=20;current.vx=0;current.settle=0;acceptingInput=false}e.preventDefault()}
canvas.addEventListener("pointerdown",onPointerDown,{passive:false});
canvas.addEventListener("pointermove",onPointerMove,{passive:false});
canvas.addEventListener("pointerup",onPointerUp,{passive:false});
canvas.addEventListener("pointercancel",onPointerUp,{passive:false});
rotateLeftBtn.addEventListener("click",()=>rotateCurrent(-ROTATE_STEP));
rotateRightBtn.addEventListener("click",()=>rotateCurrent(ROTATE_STEP));
restartBtn.addEventListener("click",reset);resetBtn.addEventListener("click",reset);
function loop(t){const dt=Math.min(.033,Math.max(0,(t-last)/1000));last=t;update(dt);draw();requestAnimationFrame(loop)}
async function start(){resize();statusEl.textContent="画像を読み込み中…";await loadImages();if(!images.some(Boolean)){endGame("画像を読み込めませんでした");return}reset();requestAnimationFrame(loop)}
start();
})();
