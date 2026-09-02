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
const BOUNCE = 0.08;
const FRICTION = 0.86;
const REST_VEL = 18;
const TURN_DELAY = 450;
const ROTATE_STEP = Math.PI / 12; // 15 degrees

let W=0,H=0,dpr=1,groundY=0;
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
  groundY=H-18;
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

/*
 * JPEGに残っている白背景を透明化する。
 * ほぼ白いピクセルだけを透明にするので、通常の肌色や衣服は残す。
 */
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
    // 白〜薄いグレーの背景だけ透明化
    if(min>238 && max-min<12){
      data.data[i+3]=0;
    }else if(min>225 && max-min<14){
      data.data[i+3]=Math.round((238-min)/13*255);
    }
  }
  x.putImageData(data,0,0);
  const out=new Image();
  out.src=c.toDataURL("image/png");
  return {im:out,w:d.w,h:d.h};
}

function spawn(){
  if(!queue.length) shuffle();
  const id=queue.shift();
  if(id===undefined){ endGame("使用できる画像がありません"); return; }

  const src=images[id];
  const d=dimensions(src);
  current={
    id,
    im:src,
    processed:null,
    x:W/2,
    y:Math.max(70,d.h/2+8),
    w:d.w,
    h:d.h,
    a:0,
    vx:0,
    vy:0,
    va:0,
    falling:false,
    settle:0
  };

  // 表示用画像を事前に透明化
  current.processed=makeTransparent(src);
  acceptingInput=true;
  statusEl.textContent=`プレイヤー${player+1}の番`;
}

function reset(){
  pieces=[];
  scores=[0,0];
  player=0;
  gameEnded=false;
  overlay.classList.add("hidden");
  p1El.textContent="0";
  p2El.textContent="0";
  shuffle();
  spawn();
}

function endGame(reason){
  gameEnded=true;
  acceptingInput=false;
  current=null;
  const winner=scores[0]===scores[1] ? "引き分け" :
    scores[0]>scores[1] ? "プレイヤー1" : "プレイヤー2";
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
  for(const p of poly){
    const v=p.x*ax.x+p.y*ax.y;
    mn=Math.min(mn,v); mx=Math.max(mx,v);
  }
  return [mn,mx];
}

function sat(a,b){
  const pa=rectCorners(a),pb=rectCorners(b);
  const axs=axes(pa).concat(axes(pb));
  let best=null;

  for(const ax of axs){
    const [a1,a2]=project(pa,ax),[b1,b2]=project(pb,ax);
    const ov=Math.min(a2,b2)-Math.max(a1,b1);
    if(ov<=0) return null;
    if(!best || ov<best.depth) best={depth:ov,ax:{x:ax.x,y:ax.y}};
  }

  const dir={x:b.x-a.x,y:b.y-a.y};
  if(dir.x*best.ax.x+dir.y*best.ax.y<0){
    best.ax.x*=-1; best.ax.y*=-1;
  }
  return best;
}

/*
 * 配置済みピースは「土台」として固定する。
 * 以前はb側も押し動かしていたため、2個目以降を落とすと
 * 1個目が沈む問題が発生していた。
 *
 * 今回は落下中のcurrentだけを押し戻す。
 */
function resolveCurrentAgainstPlaced(current,placed){
  const hit=sat(current,placed);
  if(!hit) return false;

  const nx=hit.ax.x, ny=hit.ax.y;
  const depth=hit.depth;

  current.x -= nx*depth;
  current.y -= ny*depth;

  const vn=current.vx*nx+current.vy*ny;
  if(vn>0){
    current.vx -= vn*nx*(1+BOUNCE);
    current.vy -= vn*ny*(1+BOUNCE);
  }

  current.vx*=FRICTION;
  current.vy*=FRICTION;
  current.va*=0.82;
  return true;
}

function keepCurrentInside(current){
  const pts=rectCorners(current);
  const xs=pts.map(p=>p.x);
  const minX=Math.min(...xs),maxX=Math.max(...xs);

  if(minX<0){
    current.x-=minX;
    current.vx*=-0.18;
    current.va*=-0.35;
  }
  if(maxX>W){
    current.x-=maxX-W;
    current.vx*=-0.18;
    current.va*=-0.35;
  }
}

function resolveGround(current){
  const pts=rectCorners(current);
  const maxY=Math.max(...pts.map(p=>p.y));
  if(maxY<=groundY) return false;

  current.y-=maxY-groundY;
  if(current.vy>0) current.vy*=-BOUNCE;
  current.vy*=0.65;
  current.va*=0.78;
  return true;
}

function update(dt){
  if(gameEnded) return;
  const now=performance.now();

  if(current && current.falling){
    current.vy+=GRAVITY*dt;
    current.vx*=Math.pow(AIR,dt*60);
    current.vy*=Math.pow(AIR,dt*20);
    current.x+=current.vx*dt;
    current.y+=current.vy*dt;
    current.a+=current.va*dt;

    keepCurrentInside(current);
    resolveGround(current);

    // 複数のピースと接触しても、配置済み側は絶対に動かさない
    let touched=false;
    for(const p of pieces){
      if(resolveCurrentAgainstPlaced(current,p)) touched=true;
    }

    if(touched && Math.abs(current.vy)<REST_VEL && Math.abs(current.va)<0.9){
      current.vy=0;
      current.va=0;
    }

    current.settle=(current.settle||0)+dt;

    // 地面または他ピースに乗っていて、十分静止したら固定
    if(current.settle>0.28 && Math.abs(current.vy)<22){
      pieces.push(current);
      current=null;
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
  ctx.translate(p.x,p.y);
  ctx.rotate(p.a);

  if(p.processed){
    ctx.drawImage(p.processed.im,-p.w/2,-p.h/2,p.w,p.h);
  }else{
    ctx.drawImage(p.im,-p.w/2,-p.h/2,p.w,p.h);
  }

  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,W,H);

  ctx.strokeStyle="rgba(70,60,50,.12)";
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(0,groundY+.5);
  ctx.lineTo(W,groundY+.5);
  ctx.stroke();

  for(const p of pieces) drawPiece(p);
  if(current) drawPiece(current);

  if(current && !current.falling){
    ctx.save();
    ctx.globalAlpha=.22;
    ctx.setLineDash([5,5]);
    ctx.strokeStyle="#554c42";
    ctx.beginPath();
    ctx.moveTo(current.x,0);
    ctx.lineTo(current.x,groundY);
    ctx.stroke();
    ctx.restore();
  }
}

function loop(t){
  const dt=Math.min((t-last)/1000,.025);
  last=t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function pointerPos(e){
  const r=canvas.getBoundingClientRect();
  return {x:e.clientX-r.left,y:e.clientY-r.top};
}

canvas.addEventListener("pointerdown",e=>{
  if(!current || current.falling || !acceptingInput || gameEnded) return;
  pointerId=e.pointerId;
  dragging=true;
  canvas.setPointerCapture(pointerId);
  current.x=Math.max(
    current.w/2,
    Math.min(W-current.w/2,pointerPos(e).x)
  );
});

canvas.addEventListener("pointermove",e=>{
  if(!dragging || e.pointerId!==pointerId || !current) return;
  current.x=Math.max(
    current.w/2,
    Math.min(W-current.w/2,pointerPos(e).x)
  );
});

canvas.addEventListener("pointerup",e=>{
  if(!dragging || e.pointerId!==pointerId || !current) return;
  dragging=false;
  current.falling=true;
  current.vy=20;
  current.va=(Math.random()-.5)*0.6;
});

canvas.addEventListener("pointercancel",()=>{dragging=false});

rotateLeftBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  rotateCurrent(-ROTATE_STEP);
});

rotateRightBtn.addEventListener("pointerdown",e=>{
  e.preventDefault();
  rotateCurrent(ROTATE_STEP);
});

restartBtn.onclick=reset;
resetBtn.onclick=reset;

loadImages().then(()=>{
  resize();
  reset();
  requestAnimationFrame(loop);
});
})();