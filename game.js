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
const BOUNCE = 0.035;
const LINEAR_FRICTION = 0.82;
const ANGULAR_DAMPING = 0.88;
const REST_VEL = 22;
const REST_ANGULAR = 0.22;
const SETTLE_TIME = 0.28;
const TURN_DELAY = 450;
const ROTATE_STEP = Math.PI / 12;
const TORQUE_SCALE = 0.00085;

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

function makeTransparent(im){
  const d=dimensions(im);
  const c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(d.w));
  c.height=Math.max(1,Math.round(d.h));
  const x=c.getContext("2d");
  x.drawImage(im,0,0,c.width,c.height);
  const data=x.getImageData(0,0,c.width,c.height);
  for(let i=0;i<data.data.length;i+=4){
    const r=data.data[i], g=data.data[i+1], b=data.data[i+2];
    const min=Math.min(r,g,b), max=Math.max(r,g,b);
    if(min>238 && max-min<12) data.data[i+3]=0;
    else if(min>225 && max-min<14) data.data[i+3]=Math.round((238-min)/13*255);
  }
  x.putImageData(data,0,0);
  return {im:c,w:d.w,h:d.h};
}

function spawn(){
  if(!queue.length) shuffle();
  const id=queue.shift();
  if(id===undefined){ endGame("使用できる画像がありません"); return; }
  const src=images[id], d=dimensions(src);
  current={
    id, im:src, processed:makeTransparent(src),
    x:W/2, y:cameraY+Math.max(70,d.h/2+8), w:d.w, h:d.h,
    a:0, vx:0, vy:0, va:0,
    falling:false, settle:0, supported:false,
    contactKey:null, contactTime:0
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
  if(!current || current.falling || !acceptingInput || gameEnded) return;
  current.a += amount;
}

function rectCorners(p){
  const c=Math.cos(p.a),s=Math.sin(p.a),hw=p.w/2,hh=p.h/2;
  return [
    {x:p.x+c*hw-s*hh,y:p.y+s*hw+c*hh},
    {x:p.x-c*hw-s*hh,y:p.y-s*hw+c*hh},
    {x:p.x-c*hw+s*hh,y:p.y-s*hw-c*hh},
    {x:p.x+c*hw+s*hh,y:p.y+s*hw-c*hh}
  ];
}

function axes(poly){
  const a=[];
  for(let i=0;i<poly.length;i++){
    const q=poly[(i+1)%poly.length],p=poly[i];
    const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1;
    a.push({x:-dy/len,y:dx/len});
  }
  return a;
}

function project(poly,ax){
  let mn=Infinity,mx=-Infinity;
  for(const p of poly){const v=p.x*ax.x+p.y*ax.y;mn=Math.min(mn,v);mx=Math.max(mx,v);}
  return [mn,mx];
}

function sat(a,b){
  const pa=rectCorners(a),pb=rectCorners(b),axs=axes(pa).concat(axes(pb));
  let best=null;
  for(const ax of axs){
    const [a1,a2]=project(pa,ax),[b1,b2]=project(pb,ax);
    const ov=Math.min(a2,b2)-Math.max(a1,b1);
    if(ov<=0) return null;
    if(!best||ov<best.depth) best={depth:ov,ax:{x:ax.x,y:ax.y}};
  }
  const dir={x:b.x-a.x,y:b.y-a.y};
  if(dir.x*best.ax.x+dir.y*best.ax.y<0){best.ax.x*=-1;best.ax.y*=-1;}
  return best;
}

function supportPoint(p, normal){
  const pts=rectCorners(p);
  let best=-Infinity;
  const vals=pts.map(v=>v.x*normal.x+v.y*normal.y);
  for(const v of vals) best=Math.max(best,v);
  const near=[];
  for(let i=0;i<pts.length;i++) if(best-vals[i]<Math.max(2,p.w*0.035)) near.push(pts[i]);
  if(!near.length) return pts[vals.indexOf(best)];
  return near.reduce((a,b)=>({x:a.x+b.x,y:a.y+b.y}),{x:0,y:0});
}

function addSupportTorque(p, contactPoint, normal, dt){
  // 重力を接触点まわりのトルクとして扱う。
  // 座標系はY下向きなので、contactPoint.x-p.x がそのまま回転方向になる。
  const rx=contactPoint.x-p.x;
  const lever=Math.max(-p.w,Math.min(p.w,rx));
  const inertia=Math.max(1,(p.w*p.w+p.h*p.h)/12);
  const torque=lever*GRAVITY*TORQUE_SCALE;
  p.va += (torque/inertia)*dt;

  // 接触面の摩擦。横滑りが大きいほど角速度も少し抑える。
  const tangent={x:-normal.y,y:normal.x};
  const vt=p.vx*tangent.x+p.vy*tangent.y;
  p.vx -= vt*tangent.x*Math.min(1,5*dt);
  p.vy -= vt*tangent.y*Math.min(1,5*dt);
}

function resolveSupportCollision(p,placed,hit){
  const nx=hit.ax.x,ny=hit.ax.y;
  const depth=Math.min(hit.depth,16);
  p.x-=nx*depth;
  p.y-=ny*depth;

  const vn=p.vx*nx+p.vy*ny;
  if(vn>0){
    p.vx-=vn*nx*(1+BOUNCE);
    p.vy-=vn*ny*(1+BOUNCE);
  }

  const cp=supportPoint(p,{x:nx,y:ny});
  addSupportTorque(p,cp,{x:nx,y:ny},1/60);
  p.vx*=LINEAR_FRICTION;
  p.va*=ANGULAR_DAMPING;
  return {nx,ny,cp};
}

function resolveGround(p){
  const pts=rectCorners(p), maxY=Math.max(...pts.map(v=>v.y));
  if(maxY<=groundWorldY) return null;
  p.y-=maxY-groundWorldY;
  if(p.vy>0) p.vy*=-BOUNCE;
  p.vy*=0.5;

  // 地面の最上面を支持面として扱う。
  const bottom=pts.filter(v=>Math.abs(v.y-maxY)<Math.max(2,p.w*0.035));
  const cp=bottom.reduce((a,b)=>({x:a.x+b.x,y:a.y+b.y}),{x:0,y:0});
  if(bottom.length){cp.x/=bottom.length;cp.y/=bottom.length;}
  addSupportTorque(p,cp,{x:0,y:1},1/60);
  p.vx*=LINEAR_FRICTION;
  p.va*=ANGULAR_DAMPING;
  return {cp};
}

function keepCurrentInside(p){
  const pts=rectCorners(p),xs=pts.map(v=>v.x),minX=Math.min(...xs),maxX=Math.max(...xs);
  if(minX<0){p.x-=minX;p.vx*=-0.15;p.va*=0.75;}
  if(maxX>W){p.x-=maxX-W;p.vx*=-0.15;p.va*=0.75;}
}

function updateCamera(){
  if(!pieces.length){groundY=groundWorldY-cameraY;return;}
  const top=Math.min(...pieces.map(p=>Math.min(...rectCorners(p).map(v=>v.y))));
  const targetScreenTop=Math.max(150,H*0.28);
  const desiredCamera=top-targetScreenTop;
  if(desiredCamera<cameraY) cameraY=desiredCamera;
  groundY=groundWorldY-cameraY;
}

function update(dt){
  if(gameEnded) return;
  const now=performance.now();

  if(current && current.falling){
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
    // 最も深い接触だけを支持点として使う。複数のピースから同時に
    // 回転力を受けて暴れるのを防ぐ。
    for(let pass=0;pass<4;pass++){
      let best=null;
      for(const p of pieces){
        const hit=sat(current,p);
        if(hit && (!best||hit.depth>best.hit.depth)) best={p,hit};
      }
      if(!best) break;
      const r=resolveSupportCollision(current,best.p,best.hit);
      if(r.ny>0.35){
        support={piece:best.p,point:r.cp};
      }
      keepCurrentInside(current);
    }

    const ground=resolveGround(current);
    if(ground && !support) support={piece:null,point:ground.cp};

    if(support){
      current.supported=true;
      current.contactKey=support.piece ? support.piece.id : "ground";
      current.vy=0;
      current.vx*=Math.pow(0.55,dt);

      // 接触後は回転を自然減衰。ただし重心が支点の外側にある場合は
      // 重力トルクだけが残るため、傾き→安定の挙動になる。
      current.va*=Math.pow(0.82,dt*60);
      if(Math.abs(current.vx)<5) current.vx=0;
      if(Math.abs(current.va)<0.055) current.va=0;

      if(Math.abs(current.vy)<REST_VEL && Math.abs(current.va)<REST_ANGULAR){
        current.settle+=dt;
      }else current.settle=0;
    }else{
      current.settle=0;
    }

    // 十分に静止したら固定。固定後に回転処理は一切行わない。
    if(current.supported && current.settle>=SETTLE_TIME &&
       Math.abs(current.vx)<6 && Math.abs(current.va)<REST_ANGULAR){
      current.vx=0; current.vy=0; current.va=0;
      pieces.push(current);
      current=null;
      updateCamera();
      scores[player]++;
      p1El.textContent=scores[0];
      p2El.textContent=scores[1];
      player=1-player;
      acceptingInput=false;
      turnLockedUntil=now+TURN_DELAY;
    }
  }else if(!current && !gameEnded && now>turnLockedUntil){
    spawn();
  }
}

function drawPiece(p){
  ctx.save();
  ctx.translate(p.x,p.y-cameraY);
  ctx.rotate(p.a);
  ctx.drawImage(p.processed ? p.processed.im : p.im,-p.w/2,-p.h/2,p.w,p.h);
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle="rgba(70,60,50,.12)";
  ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,groundY+.5);ctx.lineTo(W,groundY+.5);ctx.stroke();
  for(const p of pieces) drawPiece(p);
  if(current) drawPiece(current);
  if(current && !current.falling){
    ctx.save();ctx.globalAlpha=.22;ctx.setLineDash([5,5]);ctx.strokeStyle="#554c42";
    ctx.beginPath();ctx.moveTo(current.x,0);ctx.lineTo(current.x,groundY);ctx.stroke();ctx.restore();
  }
}

function loop(t){
  const dt=Math.min((t-last)/1000,.025);last=t;update(dt);draw();requestAnimationFrame(loop);
}

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
  dragging=false;current.falling=true;current.vy=20;current.va=0;current.settle=0;
});
canvas.addEventListener("pointercancel",()=>{dragging=false});
rotateLeftBtn.addEventListener("pointerdown",e=>{e.preventDefault();rotateCurrent(-ROTATE_STEP);});
rotateRightBtn.addEventListener("pointerdown",e=>{e.preventDefault();rotateCurrent(ROTATE_STEP);});
restartBtn.onclick=reset;resetBtn.onclick=reset;

loadImages().then(()=>{resize();reset();requestAnimationFrame(loop);});
})();
