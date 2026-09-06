/* v1.24.1 - game core only; measurement is isolated in measurement.js */
const Game = (() => {
  let images=[];
  let pieces=[];
  let current=null;
  let nextIndex=0;
  let pieceQueue=[];
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
  const MAX_PIECE_DISCOVERY=999;

  const params=new URLSearchParams(location.search);
  const DEBUG_MODE=params.get('debug')==='on';
  const debugPieceParam=params.get('piece');
  const DEBUG_PIECE_INDEX=(debugPieceParam&&/^\d{1,2}$/.test(debugPieceParam))?Math.max(0,Math.min(36,parseInt(debugPieceParam,10)-1)):null;
  const DEBUG_SINGLE_PIECE=DEBUG_MODE&&DEBUG_PIECE_INDEX!==null;

  const measurementDebugEl=document.getElementById('measurementDebug');
  if(measurementDebugEl){measurementDebugEl.classList.toggle('hidden',!DEBUG_MODE);measurementDebugEl.style.display=DEBUG_MODE?'':'none';}
  const shapeDebugEl=document.getElementById('shapeDebug');
  if(shapeDebugEl) shapeDebugEl.classList.toggle('hidden',!DEBUG_MODE);

  const status=document.getElementById('status');
  const resultScreen=document.getElementById('resultScreen');
  const resultScore=document.getElementById('resultScore');
  const bestScores=document.getElementById('bestScores');
  const restartButton=document.getElementById('restartButton');
  const hudScore=document.getElementById('hudScore');
  const hudBest=document.getElementById('hudBest');
  const hudHeight=document.getElementById('hudHeight');
  const nextPieceImage=document.getElementById('nextPieceImage');
  const nextPanel=document.getElementById('nextPanel');
  const newRecord=document.getElementById('newRecord');
  const resultHeight=document.getElementById('resultHeight');
  const resultPieces=document.getElementById('resultPieces');
  const resultTitle=document.querySelector('#resultScreen h2');
  const bestTitle=document.querySelector('.bestTitle');
  const modeModal=document.getElementById('modeModal');
  const normalModeButton=document.getElementById('normalModeButton');
  const endlessModeButton=document.getElementById('endlessModeButton');
  const endButton=document.getElementById('endButton');

  function loadOptionalImage(number){return new Promise(resolve=>{const label=String(number).padStart(2,'0');const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>{const retry=new Image();retry.onload=()=>resolve(retry);retry.onerror=()=>resolve(null);retry.src=`assets/${label}.PNG`;};im.src=`assets/${label}.png`;});}
  async function discoverAdditionalImages(){for(let n=images.length+1;n<=MAX_PIECE_DISCOVERY;n++){const im=await loadOptionalImage(n);if(!im)break;images.push(im);}}
  function showStatus(text){if(status){status.textContent=text;status.classList.remove('hidden');}}
  function hideStatus(){if(status)status.classList.add('hidden');}
  function updateHud(){const best=getBestScores()[0];if(hudScore)hudScore.textContent=String(score);if(hudBest)hudBest.textContent=gameMode===MODE_ENDLESS?'—':(best===undefined?'—':String(best));if(hudHeight)hudHeight.textContent=String(Math.max(0,Math.round(towerHeight)));const scoreEl=document.getElementById('score');if(scoreEl)scoreEl.textContent=`SCORE ${score}`;}
  function refillPieceQueue(){pieceQueue=images.map((_,i)=>i);for(let i=pieceQueue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pieceQueue[i],pieceQueue[j]]=[pieceQueue[j],pieceQueue[i]];}}
  function getNextPieceIndex(){if(!pieceQueue.length)refillPieceQueue();return pieceQueue.shift();}
  function updateNextPreview(){if(!nextPieceImage)return;const idx=DEBUG_SINGLE_PIECE?DEBUG_PIECE_INDEX:nextIndex;const im=images[idx];if(im){nextPieceImage.src=im.src||'';nextPieceImage.alt=`次のピース ${String(idx+1).padStart(2,'0')}`;if(nextPanel){nextPanel.classList.remove('pulse');void nextPanel.offsetWidth;nextPanel.classList.add('pulse');}}}
  function prepareAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audioCtx)audioCtx=new C();return audioCtx;}catch(e){return null;}}
  function unlockAudio(){const c=prepareAudio();if(!c)return;try{if(c.state==='suspended')c.resume();}catch(e){}}
  function scheduleTone(c,type){const now=c.currentTime,o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);if(type==='rotate'){o.type='sine';o.frequency.setValueAtTime(520,now);o.frequency.exponentialRampToValueAtTime(700,now+.055);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.045,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+.07);o.start(now);o.stop(now+.075);}else if(type==='drop'){o.type='triangle';o.frequency.setValueAtTime(180,now);o.frequency.exponentialRampToValueAtTime(95,now+.13);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.12,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+.16);o.start(now);o.stop(now+.17);}else{o.type='sawtooth';o.frequency.setValueAtTime(220,now);o.frequency.exponentialRampToValueAtTime(80,now+.35);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.1,now+.015);g.gain.exponentialRampToValueAtTime(.0001,now+.4);o.start(now);o.stop(now+.41);}}
  function playTone(type){const c=prepareAudio();if(!c)return;try{if(c.state==='suspended'){c.resume().then(()=>{if(c.state==='running')scheduleTone(c,type)}).catch(()=>{});return;}if(c.state==='running')scheduleTone(c,type);}catch(e){}}
  function vibrate(pattern){try{if(navigator.vibrate)navigator.vibrate(pattern);}catch(e){}}
  function getBestScores(){try{const raw=localStorage.getItem(GAME_OVER_KEY),list=raw?JSON.parse(raw):[];return Array.isArray(list)?list.filter(n=>Number.isFinite(n)).map(n=>Math.max(0,Math.floor(n))).sort((a,b)=>b-a).slice(0,3):[];}catch(e){return[];}}
  function saveScore(value){const list=getBestScores();list.push(value);list.sort((a,b)=>b-a);const best=list.slice(0,3);try{localStorage.setItem(GAME_OVER_KEY,JSON.stringify(best));}catch(e){}return best;}
  function renderBestScores(list){if(!bestScores)return;bestScores.innerHTML='';const labels=['1位','2位','3位'];for(let i=0;i<3;i++){const li=document.createElement('li'),value=list[i];li.innerHTML=`<span>${labels[i]}</span><strong>${value===undefined?'—':value}</strong>`;bestScores.appendChild(li);}}
  function showResult(reason='gameover'){const isEndless=gameMode===MODE_ENDLESS,shouldRecord=!isEndless,oldBest=previousBest,best=shouldRecord?saveScore(score):getBestScores();if(resultTitle)resultTitle.textContent=reason==='ended'?'ゲーム終了':'ゲームオーバー';if(resultScore)resultScore.textContent=String(score);if(resultHeight)resultHeight.textContent=String(Math.max(0,Math.round(towerHeight)));if(resultPieces)resultPieces.textContent=String(pieces.length);if(newRecord)newRecord.classList.toggle('hidden',!(shouldRecord&&score>oldBest&&score>0));if(bestTitle)bestTitle.classList.toggle('hidden',isEndless);if(bestScores)bestScores.classList.toggle('hidden',isEndless);if(!isEndless)renderBestScores(best);if(resultScreen)resultScreen.classList.remove('hidden');}
  function hideResult(){if(resultScreen)resultScreen.classList.add('hidden');}
  function setGameOver(){if(gameOver)return;gameOver=true;current=null;spawnAt=0;ready=false;updateHud();if(stageElement)stageElement.classList.add('game-over');Renderer.emitGameOver(stageW/2,stageH*.42+cameraY);showResult('gameover');}
  function resize(){const s=Renderer.resize();stageW=s.width;stageH=s.height;baseWidth=stageW*BASE_WIDTH_RATIO;baseLeft=(stageW-baseWidth)/2;baseRight=baseLeft+baseWidth;Physics.setup(stageW,stageH-12,baseWidth,gameMode===MODE_ENDLESS);if(current&&!current.dropped){const x=Math.max(current.w/2,Math.min(stageW-current.w/2,current.body.position.x));if(Math.abs(x-current.body.position.x)>0.01)Physics.move(current.body,x,current.body.position.y);}}
  function chooseBackground(){const names=['morning','day','night'],name=names[Math.floor(Math.random()*names.length)];stageElement=document.querySelector('.stage');if(stageElement)stageElement.style.backgroundImage=`url("assets/backgrounds/${name}.svg")`;}
  function spawn(){if(!ready||gameOver)return;const x=stageW/2,y=cameraY+Math.max(60,Math.min(100,stageH*.18))+SPAWN_Y_OFFSET,spawnIndex=DEBUG_SINGLE_PIECE?DEBUG_PIECE_INDEX:nextIndex,p=Piece.create(spawnIndex,images,x,y);p.body.plugin=p.body.plugin||{};p.body.plugin.debugFixedPiece=DEBUG_SINGLE_PIECE;if(!DEBUG_SINGLE_PIECE)nextIndex=getNextPieceIndex();current=p;Physics.add(p.body);Physics.hold(p.body,x,y,0);updateNextPreview();}
  function moveCurrentTo(clientX,pointerStartX,pieceStartX,pieceStartY){if(!current||current.dropped||!ready||gameOver)return;const r=Renderer.canvas.getBoundingClientRect(),currentPointerX=clientX-r.left,startPointerX=pointerStartX-r.left,x=Math.max(current.w/2,Math.min(stageW-current.w/2,pieceStartX+(currentPointerX-startPointerX)));Physics.move(current.body,x,pieceStartY);}
  function rotate(delta){if(!current||current.dropped||!ready||gameOver)return;Physics.rotate(current.body,delta);playTone('rotate');vibrate(8);Renderer.emitRotate(current.body.position.x,current.body.position.y);}
  function drop(){if(!current||current.dropped||!ready||gameOver)return;const dropped=current;dropped.dropped=true;pieces.push(dropped);current=null;Physics.release(dropped.body);score++;playTone('drop');vibrate([22]);Renderer.emitDrop(dropped.body.position.x,dropped.body.bounds.max.y);updateHud();spawnAt=performance.now()+NEXT_PIECE_DELAY;}
  function pieceHasFallenOutsideBase(p){const b=p.body,groundY=stageH-12,overlap=Math.max(0,Math.min(b.bounds.max.x,baseRight)-Math.max(b.bounds.min.x,baseLeft)),bw=Math.max(1,b.bounds.max.x-b.bounds.min.x),overlapRatio=overlap/bw,belowSurface=b.bounds.min.y>groundY+2||b.position.y>groundY+Math.max(8,p.h*.20),clearlyOutside=overlapRatio<.12,fallingOutside=clearlyOutside&&belowSurface;b.plugin=b.plugin||{};b.plugin.gameOverOutsideFrames=fallingOutside?(b.plugin.gameOverOutsideFrames||0)+1:0;return b.plugin.gameOverOutsideFrames>=3;}
  const CAMERA_TRIGGER=.52,CAMERA_TARGET=.52,CAMERA_SMOOTH=8;
  function updateCamera(){if(!pieces.length)return;let towerTop=Infinity,settledCount=0;for(const p of pieces){if(!p.body.isSleeping)continue;towerTop=Math.min(towerTop,p.body.bounds.min.y);settledCount++;}if(!settledCount)return;const screenTop=towerTop-cameraY,triggerY=stageH*CAMERA_TRIGGER;if(screenTop>=triggerY)return;const targetCamera=towerTop-stageH*CAMERA_TARGET;if(targetCamera>=cameraY)return;cameraY+=(targetCamera-cameraY)*Math.min(1,1-Math.exp(-CAMERA_SMOOTH/60));if(Math.abs(targetCamera-cameraY)<.2)cameraY=targetCamera;}
  function update(dt){Physics.step(dt);Renderer.updateEffects(dt);if(gameOver)return;for(const p of pieces){if(gameMode!==MODE_ENDLESS&&pieceHasFallenOutsideBase(p)){setGameOver();return;}}if(!current&&spawnAt&&performance.now()>=spawnAt){spawnAt=0;spawn();}updateCamera();let top=Infinity;for(const p of pieces){if(Number.isFinite(p.body.bounds.min.y))top=Math.min(top,p.body.bounds.min.y);}if(top<Infinity)towerHeight=Math.max(0,stageH-12-top);const dim=Math.max(0,Math.min(.22,(towerHeight/stageH)*.16));if(stageElement)stageElement.style.setProperty('--sky-dim',String(dim));updateHud();}
  function render(){Renderer.clear();for(const p of pieces)Renderer.drawPiece(p,cameraY);if(current)Renderer.drawPiece(current,cameraY);Renderer.drawGround(stageH-12,cameraY,baseWidth);Renderer.renderEffects(cameraY);Renderer.renderDebugTarget(current,pieces);}
  function endGame(){if(!ready||gameOver||!gameMode)return;gameOver=true;current=null;spawnAt=0;ready=false;showResult('ended');Renderer.emitGameOver(stageW/2,stageH*.42+cameraY);}
  function startGame(mode){if(mode!==MODE_NORMAL&&mode!==MODE_ENDLESS)return;gameMode=mode;score=0;pieces=[];current=null;pieceQueue=[];nextIndex=0;cameraY=0;spawnAt=0;towerHeight=0;gameOver=false;ready=true;if(!DEBUG_SINGLE_PIECE)nextIndex=getNextPieceIndex();previousBest=getBestScores()[0]||0;if(stageElement)stageElement.classList.remove('game-over');if(modeModal)modeModal.classList.add('hidden');if(endButton)endButton.disabled=false;hideResult();resize();updateHud();updateNextPreview();spawn();render();}
  function reset(){location.reload();}
  async function init(){try{if(typeof Matter==='undefined')throw new Error('Matter.jsが読み込まれていません');resize();chooseBackground();ready=false;gameOver=false;score=0;pieces=[];current=null;nextIndex=0;pieceQueue=[];cameraY=0;spawnAt=0;towerHeight=0;gameMode=null;previousBest=getBestScores()[0]||0;if(stageElement)stageElement.classList.remove('game-over');hideResult();updateHud();if(modeModal)modeModal.classList.remove('hidden');if(normalModeButton)normalModeButton.disabled=true;if(endlessModeButton)endlessModeButton.disabled=true;if(endButton)endButton.disabled=true;showStatus('画像を読み込み中…');await new Promise(resolve=>requestAnimationFrame(resolve));images=await Piece.preload();await discoverAdditionalImages();hideStatus();if(normalModeButton)normalModeButton.disabled=false;if(endlessModeButton)endlessModeButton.disabled=false;}catch(e){console.error(e);if(normalModeButton)normalModeButton.disabled=true;if(endlessModeButton)endlessModeButton.disabled=true;showStatus('画像読み込みエラー: '+e.message);}}
  window.addEventListener('resize',()=>{resize();render();});
  if(restartButton)restartButton.addEventListener('click',reset);
  if(normalModeButton)normalModeButton.addEventListener('click',()=>startGame(MODE_NORMAL));
  if(endlessModeButton)endlessModeButton.addEventListener('click',()=>startGame(MODE_ENDLESS));
  if(endButton)endButton.addEventListener('click',endGame);
  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  document.addEventListener('touchstart',unlockAudio,{passive:true});
  return {init,update,render,moveCurrentTo,rotate,drop,get current(){return current},get ready(){return ready}};
})();
