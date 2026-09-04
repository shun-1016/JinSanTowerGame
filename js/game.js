/* v21.3 - preload flow fix / mode modal shown before image loading */
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
  let towerHeight=0;
  let audioCtx=null;
  let previousBest=0;
  let stageElement=null;
  let gameMode=null;
  const NEXT_PIECE_DELAY=500;
  const SPAWN_Y_OFFSET=35;
  const BASE_WIDTH_RATIO=0.82;
  const GAME_OVER_KEY='jinSanTowerGameBestScores';
  const MODE_NORMAL='normal';
  const MODE_ENDLESS='endless';

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
  const hudScore=document.getElementById("hudScore");
  const hudBest=document.getElementById("hudBest");
  const hudHeight=document.getElementById("hudHeight");
  const nextPieceImage=document.getElementById("nextPieceImage");
  const nextPanel=document.getElementById("nextPanel");
  const newRecord=document.getElementById("newRecord");
  const resultHeight=document.getElementById("resultHeight");
  const resultPieces=document.getElementById("resultPieces");
  const resultTitle=document.querySelector("#resultScreen h2");
  const bestTitle=document.querySelector(".bestTitle");
  const modeModal=document.getElementById("modeModal");
  const normalModeButton=document.getElementById("normalModeButton");
  const endlessModeButton=document.getElementById("endlessModeButton");
  const endButton=document.getElementById("endButton");

  function showStatus(text){status.textContent=text;status.classList.remove("hidden");}

  function updateHud(){
    const best=getBestScores()[0];
    if(hudScore) hudScore.textContent=String(score);
    if(hudBest) hudBest.textContent=gameMode===MODE_ENDLESS?'—':(best===undefined?'—':String(best));
    if(hudHeight) hudHeight.textContent=String(Math.max(0,Math.round(towerHeight)));
    if(document.getElementById("score")) document.getElementById("score").textContent=`SCORE ${score}`;
  }

  function updateNextPreview(){
    if(!nextPieceImage) return;
    const idx=DEBUG_SINGLE_PIECE?DEBUG_PIECE_INDEX:nextIndex;
    const im=images[idx];
    if(im){
      nextPieceImage.src=im.src||'';
      nextPieceImage.alt=`次のピース ${String(idx+1).padStart(2,'0')}`;
      if(nextPanel){nextPanel.classList.remove('pulse');void nextPanel.offsetWidth;nextPanel.classList.add('pulse');}
    }
  }

  function prepareAudio(){
    try{
      const C=window.AudioContext||window.webkitAudioContext;
      if(!C) return null;
      if(!audioCtx) audioCtx=new C();
      return audioCtx;
    }catch(e){return null;}
  }

  function unlockAudio(){
    const c=prepareAudio();
    if(!c) return;
    try{if(c.state==='suspended') c.resume();}catch(e){}
  }

  function scheduleTone(c,type){
    const now=c.currentTime;
    const o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination);
    if(type==='rotate'){
      o.type='sine';o.frequency.setValueAtTime(520,now);o.frequency.exponentialRampToValueAtTime(700,now+.055);
      g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.045,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+.07);
      o.start(now);o.stop(now+.075);
    }else if(type==='drop'){
      o.type='triangle';o.frequency.setValueAtTime(180,now);o.frequency.exponentialRampToValueAtTime(95,now+.13);
      g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.12,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+.16);
      o.start(now);o.stop(now+.17);
    }else{
      o.type='sawtooth';o.frequency.setValueAtTime(220,now);o.frequency.exponentialRampToValueAtTime(80,now+.35);
      g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.1,now+.015);g.gain.exponentialRampToValueAtTime(.0001,now+.4);
      o.start(now);o.stop(now+.41);
    }
  }

  function playTone(type){
    const c=prepareAudio();
    if(!c) return;
    try{
      if(c.state==='suspended'){
        c.resume().then(()=>{if(c.state==='running') scheduleTone(c,type)}).catch(()=>{});
        return;
      }
      if(c.state==='running') scheduleTone(c,type);
    }catch(e){}
  }

  function vibrate(pattern){try{if(navigator.vibrate) navigator.vibrate(pattern)}catch(e){}}

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

  function showResult(reason='gameover'){
    const isEndless=gameMode===MODE_ENDLESS;
    const shouldRecord=!isEndless;
    const oldBest=previousBest;
    const best=shouldRecord?saveScore(score):getBestScores();
    if(resultTitle) resultTitle.textContent=reason==='ended'?'ゲーム終了':'ゲームオーバー';
    if(resultScore) resultScore.textContent=String(score);
    if(resultHeight) resultHeight.textContent=String(Math.max(0,Math.round(towerHeight)));
    if(resultPieces) resultPieces.textContent=String(pieces.length);
    if(newRecord){
      const record=shouldRecord && score>oldBest && score>0;
      newRecord.classList.toggle('hidden',!record);
    }
    if(bestTitle) bestTitle.classList.toggle('hidden',isEndless);
    if(bestScores) bestScores.classList.toggle('hidden',isEndless);
    if(!isEndless) renderBestScores(best);
    if(resultScreen) resultScreen.classList.remove('hidden');
  }

  function hideResult(){if(resultScreen) resultScreen.classList.add('hidden');}

  function setGameOver(){
    if(gameOver) return;
    gameOver=true;
    current=null;
    spawnAt=0;
    ready=false;
    updateHud();
    if(stageElement) stageElement.classList.add('game-over');
    Renderer.emitGameOver(stageW/2,stageH*.42+cameraY);
    showResult('gameover');
  }

  function resize(){
    const {width,height}=Renderer.resize();
    stageW=width; stageH=height;
    baseWidth=stageW*BASE_WIDTH_RATIO;
    baseLeft=(stageW-baseWidth)/2;
    baseRight=baseLeft+baseWidth;
    Physics.setup(stageW,stageH-12,baseWidth,gameMode===MODE_ENDLESS);
    if(current && !current.dropped){
      const x=Math.max(current.w/2,Math.min(stageW-current.w/2,current.body.position.x));
      if(Math.abs(x-current.body.position.x)>0.01) Physics.move(current.body,x,current.body.position.y);
    }
  }

  function chooseBackground(){
    const names=['morning','day','night'];
    const name=names[Math.floor(Math.random()*names.length)];
    stageElement=document.querySelector('.stage');
    if(stageElement) stageElement.style.backgroundImage=`url("assets/backgrounds/${name}.svg")`;
  }

  function spawn(){
    if(!ready || gameOver) return;
    const x=stageW/2;
    const y=cameraY+Math.max(60,Math.min(100,stageH*0.18))+SPAWN_Y_OFFSET;
    const spawnIndex=DEBUG_SINGLE_PIECE?DEBUG_PIECE_INDEX:nextIndex;
    const p=Piece.create(spawnIndex,images,x,y);
    p.body.plugin=p.body.plugin||{};
    p.body.plugin.debugFixedPiece=DEBUG_SINGLE_PIECE;
    if(!DEBUG_SINGLE_PIECE) nextIndex=(nextIndex+1)%images.length;
    current=p;
    Physics.add(p.body);
    Physics.hold(p.body,x,y,0);
    updateNextPreview();
  }

  function moveCurrentTo(clientX,pointerStartX,pieceStartX,pieceStartY){
    if(!current || current.dropped || !ready || gameOver) return;
    const r=Renderer.canvas.getBoundingClientRect();
    const currentPointerX=clientX-r.left;
    const startPointerX=pointerStartX-r.left;
    const x=Math.max(current.w/2,Math.min(stageW-current.w/2,pieceStartX+(currentPointerX-startPointerX)));
    Physics.move(current.body,x,pieceStartY);
  }

  function rotate(delta){if(!current || current.dropped || !ready || gameOver) return;Physics.rotate(current.body,delta);playTone('rotate');vibrate(8);Renderer.emitRotate(current.body.position.x,current.body.position.y);}

  function drop(){
    if(!current || current.dropped || !ready || gameOver) return;
    const dropped=current;
    dropped.dropped=true;
    pieces.push(dropped);
    current=null;
    Physics.release(dropped.body);
    score++;
    playTone('drop');
    vibrate([22]);
    Renderer.emitDrop(dropped.body.position.x,dropped.body.bounds.max.y);
    updateHud();
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

  const CAMERA_TRIGGER=0.52;
  const CAMERA_TARGET=0.52;
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
    Renderer.updateEffects(dt);
    if(gameOver) return;

    for(const p of pieces){
      if(gameMode!==MODE_ENDLESS && pieceHasFallenOutsideBase(p)){
        setGameOver();
        return;
      }
    }

    if(!current && spawnAt && performance.now()>=spawnAt){spawnAt=0;spawn();}
    updateCamera();
    let top=Infinity;
    for(const p of pieces){if(Number.isFinite(p.body.bounds.min.y)) top=Math.min(top,p.body.bounds.min.y);}
    if(top<Infinity) towerHeight=Math.max(0,stageH-12-top);
    const dim=Math.max(0,Math.min(.22,(towerHeight/stageH)*.16));
    if(stageElement) stageElement.style.setProperty('--sky-dim',String(dim));
    updateHud();
  }

  function render(){
    Renderer.clear();
    for(const p of pieces) Renderer.drawPiece(p,cameraY);
    if(current) Renderer.drawPiece(current,cameraY);
    Renderer.drawGround(stageH-12,cameraY,baseWidth);
    Renderer.renderEffects(cameraY);
    Renderer.renderDebugTarget(current,pieces);
  }

  function endGame(){
    if(!ready || gameOver || !gameMode) return;
    gameOver=true;
    current=null;
    spawnAt=0;
    ready=false;
    showResult('ended');
    Renderer.emitGameOver(stageW/2,stageH*.42+cameraY);
  }

  function startGame(mode){
    if(mode!==MODE_NORMAL && mode!==MODE_ENDLESS) return;
    gameMode=mode;
    score=0;pieces=[];current=null;nextIndex=0;cameraY=0;spawnAt=0;towerHeight=0;gameOver=false;ready=true;
    previousBest=getBestScores()[0]||0;
    if(stageElement) stageElement.classList.remove('game-over');
    if(modeModal) modeModal.classList.add('hidden');
    if(endButton) endButton.disabled=false;
    hideResult();
    resize();
    updateHud();
    updateNextPreview();
    spawn();
    render();
  }

  function reset(){
    location.reload();
  }

  async function init(){
    try{
      if(typeof Matter==="undefined") throw new Error("Matter.jsが読み込まれていません");

      resize();
      chooseBackground();
      ready=false;
      gameOver=false;
      score=0;
      pieces=[];
      current=null;
      nextIndex=0;
      cameraY=0;
      spawnAt=0;
      towerHeight=0;
      gameMode=null;
      previousBest=getBestScores()[0]||0;

      if(stageElement) stageElement.classList.remove('game-over');
      hideResult();
      updateHud();

      // モード選択は画像の読み込み完了を待たず、先に表示する。
      // iOS等で画像読み込みが遅延・失敗しても、画面が無表示にならないようにする。
      if(modeModal) modeModal.classList.remove('hidden');
      if(normalModeButton) normalModeButton.disabled=true;
      if(endlessModeButton) endlessModeButton.disabled=true;
      if(endButton) endButton.disabled=true;
      showStatus("画像を読み込み中…");

      // DOM更新を一度描画させてから画像読み込みを開始する。
      await new Promise(resolve=>requestAnimationFrame(resolve));
      images=await Piece.preload();

      hideStatus();
      if(normalModeButton) normalModeButton.disabled=false;
      if(endlessModeButton) endlessModeButton.disabled=false;
    }catch(e){
      console.error(e);
      if(normalModeButton) normalModeButton.disabled=true;
      if(endlessModeButton) endlessModeButton.disabled=true;
      showStatus("画像読み込みエラー: "+e.message);
    }
  }

  window.addEventListener("resize",()=>{resize();render();});
  if(restartButton) restartButton.addEventListener('click',reset);
  if(normalModeButton) normalModeButton.addEventListener('click',()=>startGame(MODE_NORMAL));
  if(endlessModeButton) endlessModeButton.addEventListener('click',()=>startGame(MODE_ENDLESS));
  if(endButton) endButton.addEventListener('click',endGame);
  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  document.addEventListener('touchstart',unlockAudio,{passive:true});

  return {init,update,render,moveCurrentTo,rotate,drop,get current(){return current},get ready(){return ready}};
})();
