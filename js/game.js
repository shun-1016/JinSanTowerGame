/* v21.0 - game rules, game-over result screen, background rotation */
const Game = (() => {
  let images=[];
  let pieces=[];
  let current=null;
  let nextIndex=0;
  let score=0;
  let cameraY=0;
  let stageW=390;
  let stageH=500;
  let ready=false;
  let gameOver=false;
  let spawnAt=0;
  let baseWidth=0;
  let baseLeft=0;
  let baseRight=0;
  const NEXT_PIECE_DELAY=500;
  const BASE_WIDTH_RATIO=0.82;
  const GAME_OVER_KEY='jinSanTowerGameBestScores';

  const params=new URLSearchParams(location.search);
  const DEBUG_MODE=params.get("debug")==="on";
  const debugPieceParam=params.get("piece");
  const DEBUG_PIECE_INDEX=(debugPieceParam && /^\d{1,2}$/.test(debugPieceParam))
    ? Math.max(0,Math.min(20,parseInt(debugPieceParam,10)-1)) : null;
  const DEBUG_SINGLE_PIECE=DEBUG_MODE && DEBUG_PIECE_INDEX!==null;

  const status=document.getElementById("status");
  const resultScreen=document.getElementById("resultScreen");
  const resultScore=document.getElementById("resultScore");
  const bestScores=document.getElementById("bestScores");
  const restartButton=document.getElementById("restartButton");

  function showStatus(text){status.textContent=text;status.classList.remove("hidden");}
  function hideStatus(){status.classList.add("hidden");}

  function getBestScores(){
    try{
      const raw=localStorage.getItem(GAME_OVER_KEY);
      const list=raw?JSON.parse(raw):[];
      return Array.isArray(list)?list.filter(n=>Number.isFinite(n)).map(n=>Math.max(0,Math.floor(n))).sort((a,b)=>b-a).slice(0,3):[];
    }catch(e){return [];}
  }

  function saveScore(value){
    const list=getBestScores();
    list.push(value);
    list.sort((a,b)=>b-a);
    const best=list.slice(0,3);
    try{localStorage.setItem(GAME_OVER_KEY,JSON.stringify(best));}catch(e){}
    return best;
  }

  function renderBestScores(list){
    if(!bestScores) return;
    bestScores.innerHTML='';
    const labels=['1位','2位','3位'];
    for(let i=0;i<3;i++){
      const li=document.createElement('li');
      const value=list[i];
      li.innerHTML=`<span>${labels[i]}</span><strong>${value===undefined?'—':value}</strong>`;
      bestScores.appendChild(li);
    }
  }

  function showResult(){
    const best=saveScore(score);
    if(resultScore) resultScore.textContent=String(score);
    renderBestScores(best);
    if(resultScreen) resultScreen.classList.remove('hidden');
  }

  function hideResult(){if(resultScreen) resultScreen.classList.add('hidden');}

  function setGameOver(){
    if(gameOver) return;
    gameOver=true;
    current=null;
    spawnAt=0;
    ready=false;
    document.getElementById("score").textContent=`Score: ${score}`;
    showResult();
  }

  function resize(){
    const {width,height}=Renderer.resize();
    stageW=width; stageH=height;
    baseWidth=stageW*BASE_WIDTH_RATIO;
    baseLeft=(stageW-baseWidth)/2;
    baseRight=baseLeft+baseWidth;
    Physics.setup(stageW,stageH-12,baseWidth);
    if(current && !current.dropped){
      const x=Math.max(current.w/2,Math.min(stageW-current.w/2,current.body.position.x));
      if(Math.abs(x-current.body.position.x)>0.01) Physics.move(current.body,x,current.body.position.y);
    }
  }

  function chooseBackground(){
    const names=['morning','day','night'];
    const name=names[Math.floor(Math.random()*names.length)];
    document.querySelector('.stage').style.backgroundImage=`url("assets/backgrounds/${name}.svg")`;
  }

  function spawn(){
    if(!ready || gameOver) return;
    const x=stageW/2;
    const y=cameraY+Math.max(60,Math.min(100,stageH*0.18));
    const spawnIndex=DEBUG_SINGLE_PIECE?DEBUG_PIECE_INDEX:nextIndex;
    const p=Piece.create(spawnIndex,images,x,y);
    p.body.plugin=p.body.plugin||{};
    p.body.plugin.debugFixedPiece=DEBUG_SINGLE_PIECE;
    if(!DEBUG_SINGLE_PIECE) nextIndex=(nextIndex+1)%images.length;
    current=p;
    Physics.add(p.body);
    Physics.hold(p.body,x,y,0);
  }

  function moveCurrentTo(clientX,pointerStartX,pieceStartX,pieceStartY){
    if(!current || current.dropped || !ready || gameOver) return;
    const r=Renderer.canvas.getBoundingClientRect();
    const currentPointerX=clientX-r.left;
    const startPointerX=pointerStartX-r.left;
    const x=Math.max(current.w/2,Math.min(stageW-current.w/2,pieceStartX+(currentPointerX-startPointerX)));
    Physics.move(current.body,x,pieceStartY);
  }

  function rotate(delta){if(!current || current.dropped || !ready || gameOver) return;Physics.rotate(current.body,delta);}

  function drop(){
    if(!current || current.dropped || !ready || gameOver) return;
    const dropped=current;
    dropped.dropped=true;
    pieces.push(dropped);
    current=null;
    Physics.release(dropped.body);
    score++;
    document.getElementById("score").textContent=`Score: ${score}`;
    spawnAt=performance.now()+NEXT_PIECE_DELAY;
  }

  function pieceHasFallenOutsideBase(p){
    const b=p.body;
    // A piece is considered to have fallen once its whole body is below the
    // top surface. This avoids ending the game merely because a piece is
    // temporarily overhanging the edge while still supported by the base.
    const groundY=stageH-12;
    const belowSurface=b.bounds.min.y>groundY+8;
    const outside=b.bounds.max.x<baseLeft || b.bounds.min.x>baseRight;
    return belowSurface && outside;
  }

  const CAMERA_TRIGGER=0.45;
  const CAMERA_TARGET=0.45;
  const CAMERA_SMOOTH=8;

  function updateCamera(){
    if(!pieces.length) return;
    let towerTop=Infinity,settledCount=0;
    for(const p of pieces){
      if(!p.body.isSleeping) continue;
      towerTop=Math.min(towerTop,p.body.bounds.min.y);settledCount++;
    }
    if(!settledCount) return;
    const screenTop=towerTop-cameraY;
    const triggerY=stageH*CAMERA_TRIGGER;
    if(screenTop>=triggerY) return;
    const targetCamera=towerTop-stageH*CAMERA_TARGET;
    if(targetCamera>=cameraY) return;
    cameraY+=(targetCamera-cameraY)*Math.min(1,1-Math.exp(-CAMERA_SMOOTH/60));
    if(Math.abs(targetCamera-cameraY)<0.2) cameraY=targetCamera;
  }

  function update(dt){
    Physics.step(dt);
    if(gameOver) return;

    for(const p of pieces){
      if(pieceHasFallenOutsideBase(p)){
        setGameOver();
        return;
      }
    }

    if(!current && spawnAt && performance.now()>=spawnAt){spawnAt=0;spawn();}
    updateCamera();
  }

  function render(){
    Renderer.clear();
    for(const p of pieces) Renderer.drawPiece(p,cameraY);
    if(current) Renderer.drawPiece(current,cameraY);
    Renderer.drawGround(stageH-12,cameraY,baseWidth);
    Renderer.renderDebugTarget(current,pieces);
  }

  function reset(){
    location.reload();
  }

  async function init(){
    try{
      if(typeof Matter==="undefined") throw new Error("Matter.jsが読み込まれていません");
      resize();
      chooseBackground();
      showStatus("画像を読み込み中…");
      images=await Piece.preload();
      ready=true;gameOver=false;score=0;pieces=[];current=null;nextIndex=0;cameraY=0;spawnAt=0;
      hideResult();hideStatus();
      document.getElementById("score").textContent='Score: 0';
      spawn();render();
    }catch(e){console.error(e);showStatus("初期化エラー: "+e.message);throw e;}
  }

  window.addEventListener("resize",()=>{resize();render();});
  if(restartButton) restartButton.addEventListener('click',reset);

  return {init,update,render,moveCurrentTo,rotate,drop,get current(){return current},get ready(){return ready}};
})();
