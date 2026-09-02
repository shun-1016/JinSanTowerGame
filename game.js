(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const p1El = document.getElementById("p1");
const p2El = document.getElementById("p2");
const overlay = document.getElementById("gameover");
const resultEl = document.getElementById("result");
const resultDetail = document.getElementById("resultDetail");
const restartBtn = document.getElementById("restart");
const resetBtn = document.getElementById("reset");
const rotateLeftBtn = document.getElementById("rotateLeft");
const rotateRightBtn = document.getElementById("rotateRight");

const ASSETS = Array.from({length:21},(_,i) =>
  `assets/${String(i+1).padStart(2,"0")}${[7,10,11,12,16,18,19,20,21].includes(i+1) ? ".jpeg" : ".png"}`
);

const MAX_PIECE = 150;
const GRAVITY = 1250;
const AIR = 0.996;
const BOUNCE = 0.025;
const LINEAR_FRICTION = 0.80;
const ANGULAR_DAMPING = 0.985;
const REST_VEL = 18;
const REST_ANGULAR = 0.10;
const SETTLE_TIME = 0.38;
const TURN_DELAY = 450;
const ROTATE_STEP = Math.PI / 12;
const MAX_PUSH = 10;
const TORQUE_DAMPING = 0.90;

let W=0,H=0,dpr=1,groundY=0,groundWorldY=0,cameraY=0;
let pieces=[], queue=[], current=null, player=0;
let scores=[0,0], gameEnded=false, acceptingInput=false;
let pointerId=null, dragging=false;
let last=performance.now(), turnLockedUntil=0;
let images=[];

function loadImages(){
  return Promise.all(ASSETS.map(src => new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  }))).then(v => images=v);
}

function resize(){
  const r=canvas.getBoundingClientRect();
  dpr=Math.min(devicePixelRatio||1,2);
  W=r.width; H=r.height;
  canvas.width=Math.round(W*dpr);
  canvas.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  groundWorldY=H-18;
  groundY=groundWorldY-cameraY;
}
addEventListener("resize",resize);

function shuffle(){
  queue=images.map((_,i)=>i).filter(i=>images[i]);
  for(let i=queue.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [queue[i],queue[j]]=[queue[j],queue[i]];
  }
}

function dimensions(im){
  const scale=MAX_PIECE/Math.max(im.naturalWidth,im.naturalHeight);
  return {w:im.naturalWidth*scale,h:im.naturalHeight*scale};
}

// JPEG等の白背景を透明化し、同じアルファマスクから衝突用の輪郭を作る。
// 「描画は透明だが当たり判定は矩形」というv8までのズレをなくす。
function makeTransparent(im){
  const d=dimensions(im);
  const c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(d.w));
  c.height=Math.max(1,Math.round(d.h));
  const x=c.getContext("2d",{willReadFrequently:true});
  x.drawImage(im,0,0,c.width,c.height);
  const data=x.getImageData(0,0,c.width,c.height);
  const pts=[];
  const step=Math.max(1,Math.floor(Math.max(c.width,c.height)/90));
  for(let y=0;y<c.height;y++){
    for(let xx=0;xx<c.width;xx++){
      const i=(y*c.width+xx)*4;
      const r=data.data[i],g=data.data[i+1],b=data.data[i+2];
      const min=Math.min(r,g,b),max=Math.max(r,g,b);
      if(min>238 && max-min<12){
        data.data[i+3]=0;
      }else if(min>225 && max-min<14){
        data.data[i+3]=Math.round((238-min)/13*255);
      }
      if(data.data[i+3]>40 && xx%step===0 && y%step===0){pts.push({x:xx,y});}
    }
  }
  x.putImageData(data,0,0);

  // 外周の透明マージンを削ったアルファ輪郭。
  let minX=c.width,minY=c.height,maxX=-1,maxY=-1;
  const alpha=[];
  for(let y=0;y<c.height;y+=step){
    for(let xx=0;xx<c.width;xx+=step){
      const a=data.data[(y*c.width+xx)*4+3];
      if(a>40){alpha.push({x:xx,y});minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    }
  }
  if(maxX<0){
    alpha.push({x:0,y:0},{x:c.width,y:0},{x:c.width,y:c.height},{x:0,y:c.height});
    minX=0;minY=0;maxX=c.width;maxY=c.height;
  }

  // サンプル点の凸包。凹形状は凸包になるが、矩形よりはるかに実画像に近い。
  const hull=convexHull(alpha);
  const sx=d.w/c.width, sy=d.h/c.height;
  const localHull=hull.map(p=>({x:(p.x-c.width/2)*sx,y:(p.y-c.height/2)*sy}));
  return {im:c,w:d.w,h:d.h,hull:localHull,bounds:{minX:minX*sx-c.width*sx/2,maxX:maxX*sx-c.width*sx/2,minY:minY*sy-c.height*sy/2,maxY:maxY*sy-c.height*sy/2}};
}

function convexHull(points){
  const pts=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  if(pts.length<=1)return pts;
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[];
  for(const p of pts){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  const upper=[];
  for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  lower.pop();upper.pop();return lower.concat(upper);
}

function spawn(){
  if(!queue.length) shuffle();
  const id=queue.shift();
  if(id===undefined){ endGame("使用できる画像がありません"); return; }
  const src=images[id], processed=makeTransparent(src);
  current={
    id, im:src, processed,
    x:W/2, y:cameraY+Math.max(70,processed.h/2+8), w:processed.w, h:processed.h,
    hull:processed.hull,
    a:0, vx:0, vy:0, va:0,
    falling:false, settle:0, supported:false,
    contactKey:null
  };
  acceptingInput=true;
  statusEl.textContent=`プレイヤー${player+1}の番`;
}

function reset(){
  pieces=[]; cameraY=0; groundY=groundWorldY;
  scores=[0,0]; player=0; gameEnded=false;
  overlay.classList.add("hidden");
  p1El.textContent="0"; p2El.textContent="0";
  shuffle(); spawn();
}

function endGame(reason){
  gameEnded=true; acceptingInput=false; current=null;
  const winner=scores[0]===scores[1] ? "引き分け" : scores[0]>scores[1] ? "プレイヤー1" : "プレイヤー2";
  resultEl.textContent=winner;
  resultDetail.textContent=reason||"タワーが崩れました";
  overlay.classList.remove("hidden");
}

function rotateCurrent(amount){
  if(!current || current.falling || !acceptingInput || gameEnded)return;
  current.a+=amount;
}

function worldPoly(p){
  const c=Math.cos(p.a),s=Math.sin(p.a);
  return p.hull.map(v=>({x:p.x+c*v.x-s*v.y,y:p.y+s*v.x+c*v.y}));
}

function axes(poly){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const q=poly[(i+1)%poly.length],p=poly[i];
    const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1;
    out.push({x:-dy/len,y:dx/len});
  }
  return out;
}

function project(poly,ax){
  let mn=Infinity,mx=-Infinity;
  for(const p of poly){const v=p.x*ax.x+p.y*ax.y;mn=Math.min(mn,v);mx=Math.max(mx,v);}
  return [mn,mx];
}

function sat(a,b){
  const pa=worldPoly(a),pb=worldPoly(b),axs=axes(pa).concat(axes(pb));
  let best=null;
  for(const ax0 of axs){
    const [a1,a2]=project(pa,ax0),[b1,b2]=project(pb,ax0);
    const ov=Math.min(a2,b2)-Math.max(a1,b1);
    if(ov<=0)return null;
    if(!best||ov<best.depth)best={depth:ov,ax:{x:ax0.x,y:ax0.y}};
  }
  const dir={x:b.x-a.x,y:b.y-a.y};
  if(dir.x*best.ax.x+dir.y*best.ax.y<0){best.ax.x*=-1;best.ax.y*=-1;}
  return best;
}

function supportFeature(p,dir){
  const poly=worldPoly(p);
  let max=-Infinity;
  for(const v of poly)max=Math.max(max,v.x*dir.x+v.y*dir.y);
  const tol=2.0;
  const pts=poly.filter(v=>max-(v.x*dir.x+v.y*dir.y)<=tol);
  const src=pts.length?pts:poly;
  let x=0,y=0;for(const v of src){x+=v.x;y+=v.y;}return{x:x/src.length,y:y/src.length,count:src.length};
}

function contactPoint(a,b,normal){
  // normalはa(落下中)→b(支持側)。
  const pa=supportFeature(a,normal);
  const pb=supportFeature(b,{x:-normal.x,y:-normal.y});
  return {x:(pa.x+pb.x)/2,y:(pa.y+pb.y)/2,featureCount:pa.count};
}

function applyGravityTorque(p,cp,dt){
  // Canvas座標はYが下向き。支点から重心への腕 r に重力(0,+g)を作用させると、
  // 回転方向は -rx。これにより「支点の反対側へ重心が落ちる」自然な傾きになる。
  const rx=cp.x-p.x;
  const inertia=Math.max(60,(p.w*p.w+p.h*p.h)/12);
  const tau=-rx*GRAVITY;
  p.va += (tau/inertia)*dt;
}

function resolveCollision(p,placed,hit,dt){
  const n=hit.ax;
  const depth=Math.min(hit.depth,MAX_PUSH);
  p.x-=n.x*depth;
  p.y-=n.y*depth;

  const cp=contactPoint(p,placed,n);
  applyGravityTorque(p,cp,dt);

  // 接触面方向の相対速度を摩擦で落とす。
  const t={x:-n.y,y:n.x};
  const vt=p.vx*t.x+p.vy*t.y;
  p.vx-=vt*t.x*Math.min(1,7*dt);
  p.vy-=vt*t.y*Math.min(1,7*dt);

  // 法線方向の速度は、支持側へ食い込む分だけ除去。
  const vn=p.vx*n.x+p.vy*n.y;
  if(vn>0){p.vx-=vn*n.x*(1+BOUNCE);p.vy-=vn*n.y*(1+BOUNCE);}
  p.va*=Math.pow(ANGULAR_DAMPING,dt*60);
  return {normal:n,point:cp};
}

function resolveGround(p,dt){
  const poly=worldPoly(p),maxY=Math.max(...poly.map(v=>v.y));
  if(maxY<=groundWorldY)return null;
  p.y-=maxY-groundWorldY;
  if(p.vy>0)p.vy*=-BOUNCE;
  p.vy*=0.35;
  const cp=supportFeature(p,{x:0,y:1});
  applyGravityTorque(p,cp,dt);
  p.vx*=LINEAR_FRICTION;
  p.va*=Math.pow(ANGULAR_DAMPING,dt*60);
  return {point:cp};
}

function keepCurrentInside(p){
  const poly=worldPoly(p),xs=poly.map(v=>v.x),minX=Math.min(...xs),maxX=Math.max(...xs);
  if(minX<0){p.x-=minX;p.vx*=-0.12;p.va*=0.75;}
  if(maxX>W){p.x-=maxX-W;p.vx*=-0.12;p.va*=0.75;}
}

function updateCamera(){
  if(!pieces.length){groundY=groundWorldY-cameraY;return;}
  const top=Math.min(...pieces.map(p=>Math.min(...worldPoly(p).map(v=>v.y))));
  const targetScreenTop=Math.max(150,H*0.28);
  const desiredCamera=top-targetScreenTop;
  if(desiredCamera<cameraY)cameraY=desiredCamera;
  groundY=groundWorldY-cameraY;
}

function update(dt){
  if(gameEnded)return;
  const now=performance.now();
  if(current&&current.falling){
    current.supported=false;
    current.contactKey=null;
    current.vy+=GRAVITY*dt;
    current.vx*=Math.pow(AIR,dt*60);
    current.vy*=Math.pow(AIR,dt*20);
    current.x+=current.vx*dt;
    current.y+=current.vy*dt;
    current.a+=current.va*dt;
    keepCurrentInside(current);

    let support=null;
    for(let pass=0;pass<4;pass++){
      let best=null;
      for(const p of pieces){
        const hit=sat(current,p);
        if(hit&&(!best||hit.depth>best.hit.depth))best={p,hit};
      }
      if(!best)break;
      const r=resolveCollision(current,best.p,best.hit,dt);
      // 下側の支持面のみ「着地」として扱う。
      if(r.normal.y>0.35)support={piece:best.p,point:r.point};
      keepCurrentInside(current);
    }

    const ground=resolveGround(current,dt);
    if(ground&&!support)support={piece:null,point:ground.point};

    if(support){
      current.supported=true;
      current.contactKey=support.piece?support.piece.id:"ground";
      current.vy=0;
      current.vx*=Math.pow(0.45,dt);

      // 重力トルクは接触点から毎フレーム再計算される。人工的な回転付与ではない。
      // ただし接触面の摩擦で、安定姿勢では角速度が収束する。
      current.va*=Math.pow(TORQUE_DAMPING,dt*60);
      if(Math.abs(current.vx)<4)current.vx=0;
      if(Math.abs(current.va)<REST_ANGULAR)current.va*=0.75;

      const stable=Math.abs(current.vx)<6&&Math.abs(current.va)<REST_ANGULAR;
      if(stable)current.settle+=dt;else current.settle=0;
    }else current.settle=0;

    if(current.supported&&current.settle>=SETTLE_TIME&&Math.abs(current.va)<REST_ANGULAR){
      current.vx=0;current.vy=0;current.va=0;
      pieces.push(current);current=null;
      updateCamera();
      scores[player]++;
      p1El.textContent=scores[0];p2El.textContent=scores[1];
      player=1-player;acceptingInput=false;turnLockedUntil=now+TURN_DELAY;
    }
  }else if(!current&&!gameEnded&&now>turnLockedUntil)spawn();
}

function drawPiece(p){
  ctx.save();
  ctx.translate(p.x,p.y-cameraY);
  ctx.rotate(p.a);
  ctx.drawImage(p.processed.im,-p.w/2,-p.h/2,p.w,p.h);
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle="rgba(70,60,50,.12)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,groundY+.5);ctx.lineTo(W,groundY+.5);ctx.stroke();
  for(const p of pieces)drawPiece(p);
  if(current)drawPiece(current);
  if(current&&!current.falling){
    ctx.save();ctx.globalAlpha=.22;ctx.setLineDash([5,5]);ctx.strokeStyle="#554c42";
    ctx.beginPath();ctx.moveTo(current.x,0);ctx.lineTo(current.x,groundY);ctx.stroke();ctx.restore();
  }
}

function loop(t){const dt=Math.min((t-last)/1000,.025);last=t;update(dt);draw();requestAnimationFrame(loop);}
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
canvas.addEventListener("pointerdown",e=>{
  if(!current||current.falling||!acceptingInput||gameEnded)return;
  pointerId=e.pointerId;dragging=true;canvas.setPointerCapture(pointerId);
  current.x=Math.max(current.w/2,Math.min(W-current.w/2,pointerPos(e).x));
});
canvas.addEventListener("pointermove",e=>{
  if(!dragging||e.pointerId!==pointerId||!current)return;
  current.x=Math.max(current.w/2,Math.min(W-current.w/2,pointerPos(e).x));
});
canvas.addEventListener("pointerup",e=>{
  if(!dragging||e.pointerId!==pointerId||!current)return;
  dragging=false;current.falling=true;current.vy=20;current.settle=0;
});
canvas.addEventListener("pointercancel",()=>{dragging=false});
rotateLeftBtn.addEventListener("pointerdown",e=>{e.preventDefault();rotateCurrent(-ROTATE_STEP);});
rotateRightBtn.addEventListener("pointerdown",e=>{e.preventDefault();rotateCurrent(ROTATE_STEP);});
restartBtn.onclick=reset;resetBtn.onclick=reset;
loadImages().then(()=>{resize();reset();requestAnimationFrame(loop);});
})();
