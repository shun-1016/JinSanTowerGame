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

const ASSETS = Array.from({length:21},(_,i) => `assets/${String(i+1).padStart(2,"0")}${[7,10,11,12,16,18,19,20,21].includes(i+1) ? ".jpeg" : ".png"}`);
const MAX_PIECE = 150;
const GRAVITY = 1250;
const AIR = 0.996;
const BOUNCE = 0.12;
const FRICTION = 0.84;
const REST_VEL = 18;
const TURN_DELAY = 650;

let W=0,H=0,dpr=1,groundY=0;
let pieces=[], queue=[], current=null, player=0;
let scores=[0,0], gameEnded=false, acceptingInput=false;
let pointerId=null, dragging=false;
let last=performance.now(), turnLockedUntil=0;
let images=[];

function loadImages(){
  return Promise.all(ASSETS.map((src,i)=>new Promise(resolve=>{
    const im=new Image();
    im.onload=()=>resolve(im);
    im.onerror=()=>resolve(null);
    im.src=src;
  }))).then(v=>images=v);
}

function resize(){
  const r=canvas.getBoundingClientRect();
  dpr=Math.min(devicePixelRatio||1,2);
  W=r.width; H=r.height;
  canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  groundY=H-18;
}
addEventListener("resize",resize);

function shuffle(){
  queue=images.map((_,i)=>i);
  for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]]}
}
function dimensions(im){
  const scale=MAX_PIECE/Math.max(im.naturalWidth,im.naturalHeight);
  return {w:im.naturalWidth*scale,h:im.naturalHeight*scale};
}
function spawn(){
  if(!queue.length){shuffle()}
  const id=queue.shift(), im=images[id];
  if(!im){ return spawn(); }
  const d=dimensions(im);
  current={id,im,x:W/2,y:Math.max(65,d.h/2+8),w:d.w,h:d.h,a:0,vx:0,vy:0,va:0,falling:false};
  acceptingInput=true;
  statusEl.textContent=`プレイヤー${player+1}の番`;
}
function reset(){
  pieces=[];scores=[0,0];player=0;gameEnded=false;overlay.classList.add("hidden");
  p1El.textContent="0";p2El.textContent="0";shuffle();spawn();
}
function endGame(reason){
  gameEnded=true;acceptingInput=false;current=null;
  const winner=scores[0]===scores[1]?"引き分け":scores[0]>scores[1]?"プレイヤー1":"プレイヤー2";
  resultEl.textContent=winner;
  resultDetail.textContent=reason||"タワーが崩れました";
  overlay.classList.remove("hidden");
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
    const q=poly[(i+1)%poly.length],p=poly[i],dx=q.x-p.x,dy=q.y-p.y;
    const len=Math.hypot(dx,dy)||1;a.push({x:-dy/len,y:dx/len});
  }
  return a;
}
function project(poly,ax){
  let mn=Infinity,mx=-Infinity;
  for(const p of poly){const v=p.x*ax.x+p.y*ax.y;mn=Math.min(mn,v);mx=Math.max(mx,v)}
  return [mn,mx];
}
function sat(a,b){
  const pa=rectCorners(a),pb=rectCorners(b),axs=axes(pa).concat(axes(pb));
  let best=null;
  for(const ax of axs){
    const [a1,a2]=project(pa,ax),[b1,b2]=project(pb,ax);
    const ov=Math.min(a2,b2)-Math.max(a1,b1);
    if(ov<=0)return null;
    if(!best||ov<best.depth)best={depth:ov,ax};
  }
  const dir={x:b.x-a.x,y:b.y-a.y};
  if(dir.x*best.ax.x+dir.y*best.ax.y<0){best.ax.x*=-1;best.ax.y*=-1}
  return best;
}
function resolvePair(a,b){
  const hit=sat(a,b);if(!hit)return;
  const nx=hit.ax.x,ny=hit.ax.y,depth=hit.depth;
  const invA=1,invB=b.falling?1:0.35;
  const total=invA+invB;
  a.x-=nx*depth*(invA/total);a.y-=ny*depth*(invA/total);
  b.x+=nx*depth*(invB/total);b.y+=ny*depth*(invB/total);
  const rvx=a.vx-b.vx,rvy=a.vy-b.vy,rel=rvx*nx+rvy*ny;
  if(rel<0){
    const imp=-(1+BOUNCE)*rel/total;
    a.vx+=imp*invA*nx;a.vy+=imp*invA*ny;
    b.vx-=imp*invB*nx;b.vy-=imp*invB*ny;
  }
  a.vx*=FRICTION;a.vy*=FRICTION;
  if(Math.abs(a.vy)<REST_VEL)a.vy=0;
}
function update(dt){
  if(gameEnded)return;
  const now=performance.now();
  if(current && current.falling){
    current.vy+=GRAVITY*dt;
    current.vx*=Math.pow(AIR,dt*60);
    current.vy*=Math.pow(AIR,dt*20);
    current.x+=current.vx*dt;current.y+=current.vy*dt;
    current.a+=current.va*dt;
    // side walls
    const half=Math.max(current.w,current.h)/2;
    if(current.x<half){current.x=half;current.vx*=-0.18;current.va*=-0.35}
    if(current.x>W-half){current.x=W-half;current.vx*=-0.18;current.va*=-0.35}
    // ground
    const pts=rectCorners(current);
    const maxY=Math.max(...pts.map(p=>p.y));
    if(maxY>groundY){
      current.y-=maxY-groundY;
      if(current.vy>0)current.vy*=-0.15;
      current.vy*=0.7;current.va*=0.8;
    }
    for(const p of pieces)resolvePair(current,p);
    // settle current
    if(Math.abs(current.vy)<REST_VEL && Math.abs(current.va)<0.9){
      current.vy*=0.2;current.va*=0.3;
    }
    // if current has been stable for a short period, lock it in
    current.settle=(current.settle||0)+dt;
    if(current.settle>0.28 && Math.abs(current.vy)<22){
      pieces.push(current);
      current=null; scores[player]++; 
      p1El.textContent=scores[0];p2El.textContent=scores[1];
      player=1-player; acceptingInput=false;
      turnLockedUntil=now+TURN_DELAY;
    }
  } else if(!current && !gameEnded && now>turnLockedUntil){
    // Detect catastrophic tower spill: a piece crossing the top/side area
    let bad=pieces.some(p=>p.y-p.h>H+80 || p.x<-180 || p.x>W+180);
    if(bad){endGame("タワーが大きく崩れました");return}
    spawn();
  }
}
function drawPiece(p){
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);
  ctx.drawImage(p.im,-p.w/2,-p.h/2,p.w,p.h);
  ctx.restore();
}
function draw(){
  ctx.clearRect(0,0,W,H);
  // subtle play-area line
  ctx.strokeStyle="rgba(70,60,50,.12)";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,groundY+.5);ctx.lineTo(W,groundY+.5);ctx.stroke();
  for(const p of pieces)drawPiece(p);
  if(current)drawPiece(current);
  if(current && !current.falling){
    ctx.save();ctx.globalAlpha=.22;ctx.setLineDash([5,5]);
    ctx.strokeStyle="#554c42";ctx.beginPath();ctx.moveTo(current.x,0);ctx.lineTo(current.x,groundY);ctx.stroke();
    ctx.restore();
  }
}
function loop(t){
  let dt=Math.min((t-last)/1000,.025);last=t;
  update(dt);draw();requestAnimationFrame(loop);
}
function pointerPos(e){
  const r=canvas.getBoundingClientRect();
  return {x:e.clientX-r.left,y:e.clientY-r.top};
}
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
  dragging=false;current.falling=true;current.vy=20;current.va=(Math.random()-.5)*1.1;
});
canvas.addEventListener("pointercancel",()=>{dragging=false});
restartBtn.onclick=reset;resetBtn.onclick=reset;

loadImages().then(()=>{resize();reset();requestAnimationFrame(loop)});
})();
