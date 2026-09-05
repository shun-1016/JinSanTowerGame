/* v23.2 - contact geometry measurement */
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
  const MEASUREMENT_PIECE_COUNT=37;
  const MEASUREMENT_POST_LAND_FRAMES=60;
  let measurement=null;
  const measurementDebugEl=document.getElementById('measurementDebug');
  const measurementStatusEl=document.getElementById('measurementStatus');
  const measurementButton=document.getElementById('measurementButton');
  const measurementDownload=document.getElementById('measurementDownload');

  const params=new URLSearchParams(location.search);
  const DEBUG_MODE=params.get("debug")==="on";
  if(measurementDebugEl){
    measurementDebugEl.classList.toggle('hidden',!DEBUG_MODE);
    measurementDebugEl.style.display=DEBUG_MODE?'':'none';
  }
  const shapeDebugEl=document.getElementById("shapeDebug");
  if(shapeDebugEl) shapeDebugEl.classList.toggle("hidden",!DEBUG_MODE);
  const debugPieceParam=params.get("piece");
  const DEBUG_PIECE_INDEX=(debugPieceParam && /^\d{1,2}$/.test(debugPieceParam))
    ? Math.max(0,Math.min(36,parseInt(debugPieceParam,10)-1)) : null;
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

  function measurementSetStatus(text){
    if(measurementStatusEl) measurementStatusEl.textContent=text;
  }

  function measurementClearDynamicBodies(){
    if(!Physics.world) return;
    const dynamic=Physics.world.bodies.filter(b=>!b.isStatic);
    if(dynamic.length) Matter.World.remove(Physics.world,dynamic);
  }

  function measurementHasGroundContact(body){
    for(const pair of Physics.engine.pairs.list){
      if(!pair.isActive) continue;
      const a=pair.bodyA&&pair.bodyA.parent?pair.bodyA.parent:pair.bodyA;
      const b=pair.bodyB&&pair.bodyB.parent?pair.bodyB.parent:pair.bodyB;
      if((a===body&&b&&b.label==='ground')||(b===body&&a&&a.label==='ground')) return true;
    }
    return false;
  }

  function measurementCreatePiece(index){
    measurementClearDynamicBodies();
    Physics.setup(stageW,stageH-12,baseWidth,false);
    const x=stageW/2;
    const y=Math.max(80,stageH*0.18);
    const p=Piece.create(index,images,x,y);
    p.body.plugin=p.body.plugin||{};
    p.body.plugin.debugFixedPiece=true;
    Physics.add(p.body);
    Physics.hold(p.body,x,y,0);
    Physics.release(p.body);
    measurement.current=p;
    measurement.phase='falling';
    measurement.frame=0;
    measurement.startedAt=performance.now();
    measurement.landingFrame=null;
    measurement.postLandFrames=0;
    measurement.rows=[];
  }

  function measurementContactGeometry(body){
    const result={
      contactPoints:0,
      contactWidth:0,
      contactCenterOffset:0,
      contactParts:0,
      bottomWidth1:0,
      bottomWidth2:0,
      bottomWidth4:0,
      bottomWidth8:0
    };
    const parts=(body.parts||[]).slice(1);
    const groundY=stageH-12;

    // Geometry-only bottom widths: horizontal span of physical vertices
    // within 1/2/4/8px of the lowest vertex height.
    if(parts.length){
      const verts=parts.flatMap(part=>part.vertices||[]);
      if(verts.length){
        const maxY=Math.max(...verts.map(v=>v.y));
        for(const [key,band] of [['bottomWidth1',1],['bottomWidth2',2],['bottomWidth4',4],['bottomWidth8',8]]){
          const near=verts.filter(v=>v.y>=maxY-band);
          if(near.length) result[key]=Math.max(...near.map(v=>v.x))-Math.min(...near.map(v=>v.x));
        }
      }
    }

    const xs=[];
    const partIds=new Set();
    for(const pair of Physics.engine.pairs.list){
      if(!pair.isActive) continue;
      const a=pair.bodyA, b=pair.bodyB;
      const aParent=a&&a.parent?a.parent:a;
      const bParent=b&&b.parent?b.parent:b;
      const isGroundA=a&&a.label==='ground';
      const isGroundB=b&&b.label==='ground';
      if(!((aParent===body&&isGroundB)||(bParent===body&&isGroundA))) continue;

      const movingPart=aParent===body?a:b;
      if(movingPart&&movingPart.id!==undefined) partIds.add(movingPart.id);
      // Matter.js 0.20.0 stores the active contact points on pair.contacts.
      // collision.supports contains support vectors, but Pair.update() copies
      // the active supports into pair.contacts and exposes contactCount as the
      // authoritative active-contact count.
      const contacts=pair.contacts||[];
      const count=Math.min(pair.contactCount||0,contacts.length);
      for(let i=0;i<count;i++){
        const contact=contacts[i];
        const vertex=contact&&contact.vertex;
        if(!vertex) continue;
        if(Math.abs(vertex.y-groundY)<8) xs.push(vertex.x);
      }
    }
    result.contactPoints=xs.length;
    result.contactParts=partIds.size;
    if(xs.length){
      const minX=Math.min(...xs), maxX=Math.max(...xs);
      result.contactWidth=maxX-minX;
      const center=(minX+maxX)/2;
      result.contactCenterOffset=center-body.position.x;
    }
    return result;
  }

  function measurementRow(p,contact){
    const b=p.body,pl=b.plugin||{};
    const cg=measurementContactGeometry(b);
    const t=Math.max(0,performance.now()-measurement.startedAt);
    const phase=measurement.landingFrame===null?'falling':'post_landing';
    return [
      p.index+1,phase,measurement.frame,t.toFixed(1),measurement.landingFrame===null?'':measurement.landingFrame,
      b.position.x.toFixed(3),b.position.y.toFixed(3),
      (b.velocity.x||0).toFixed(5),(b.velocity.y||0).toFixed(5),
      (b.speed||0).toFixed(5),(b.angularVelocity||0).toFixed(6),
      (b.angle||0).toFixed(6),b.isSleeping?'1':'0',contact?'1':'0',
      Number(pl.debugMass||b.mass||0).toFixed(5),
      Number(pl.debugInertia||b.inertia||0).toFixed(3),
      Number(pl.debugComOffset||0).toFixed(3),
      Number(pl.debugFootprintWidth||0).toFixed(3),
      cg.bottomWidth1.toFixed(3),cg.bottomWidth2.toFixed(3),cg.bottomWidth4.toFixed(3),cg.bottomWidth8.toFixed(3),
      cg.contactWidth.toFixed(3),cg.contactCenterOffset.toFixed(3),cg.contactPoints,cg.contactParts,
      Number(pl.debugAspectRatio||0).toFixed(4),
      Number(pl.debugPartCount||0),
      Number(pl.debugTriangulatedCount||0),
      Number(pl.debugRegionCount||0),
      Number(pl.debugRawRegionCount||0),
      Number(pl.debugContourVertexCount||0)
    ].join(',');
  }

  function measurementStart(){
    if(!DEBUG_MODE||!images.length||measurement) return;
    gameOver=true;ready=false;current=null;pieces=[];score=0;spawnAt=0;cameraY=0;towerHeight=0;gameMode=null;
    if(modeModal) modeModal.classList.add('hidden');
    if(endButton) endButton.disabled=true;
    if(measurementButton) measurementButton.disabled=true;
    if(measurementDownload) measurementDownload.classList.add('hidden');
    measurement={index:0,frame:0,startedAt:0,landingFrame:null,postLandFrames:0,rows:[],current:null,phase:'falling',allRows:[]};
    showStatus('自動計測中…');
    measurementSetStatus('01 / 37 を計測中…');
    measurementCreatePiece(0);
  }

  function measurementFinish(){
    const header='piece,phase,frame,time_ms,landing_frame,x,y,velocity_x,velocity_y,speed,angular_velocity,angle,sleeping,ground_contact,mass,inertia,com_offset_px,footprint_width_px,bottom_width_1px,bottom_width_2px,bottom_width_4px,bottom_width_8px,contact_width_px,contact_center_offset_px,contact_points,contact_parts,aspect_ratio,physics_parts,triangles,regions,raw_regions,contour_vertices';
    const csv='\ufeff'+header+'\n'+measurement.allRows.join('\n')+'\n';
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const d=new Date();
    const stamp=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0'),String(d.getHours()).padStart(2,'0'),String(d.getMinutes()).padStart(2,'0'),String(d.getSeconds()).padStart(2,'0')].join('');
    const filename=`JinSanTowerGame_v23.3_physics_log_${stamp}.csv`;
    if(measurementDownload){
      measurementDownload.href=url;measurementDownload.download=filename;measurementDownload.textContent='CSVを保存';measurementDownload.classList.remove('hidden');
    }
    try{const a=document.createElement('a');a.href=url;a.download=filename;a.click();}catch(e){}
    measurementSetStatus(`計測完了：37 / 37 ピース　${measurement.allRows.length} 行`);
    showStatus('自動計測完了。CSVを保存できます。');
    if(measurementButton){measurementButton.disabled=false;measurementButton.innerHTML='<strong>再計測</strong><span>同じ条件で全37ピースを再計測</span>';}
    measurement=null;
    gameOver=false;
    ready=false;
    gameMode=null;
    if(modeModal) modeModal.classList.remove('hidden');
    if(normalModeButton) normalModeButton.disabled=false;
    if(endlessModeButton) endlessModeButton.disabled=false;
    if(endButton) endButton.disabled=true;
  }

  function measurementUpdate(){
    if(!measurement||!measurement.current) return;
    const p=measurement.current;
    const b=p.body;
    const contact=measurementHasGroundContact(b);
    if(measurement.landingFrame===null&&contact) measurement.landingFrame=measurement.frame;
    measurement.allRows.push(measurementRow(p,contact));
    measurement.frame++;
    if(measurement.landingFrame!==null){
      measurement.postLandFrames=measurement.frame-measurement.landingFrame;
      if(measurement.postLandFrames>=MEASUREMENT_POST_LAND_FRAMES){
        const next=measurement.index+1;
        if(next>=MEASUREMENT_PIECE_COUNT){measurementFinish();return;}
        measurement.index=next;
        measurementSetStatus(`${String(next+1).padStart(2,'0')} / ${MEASUREMENT_PIECE_COUNT} を計測中…`);
        measurementCreatePiece(next);
      }
    }
    if(measurement.frame>600){
      // Safety timeout: avoid blocking the whole debug run on an abnormal body.
      const next=measurement.index+1;
      if(next>=MEASUREMENT_PIECE_COUNT){measurementFinish();return;}
      measurement.index=next;
      measurementSetStatus(`${String(next+1).padStart(2,'0')} / ${MEASUREMENT_PIECE_COUNT} を計測中…（タイムアウト）`);
      measurementCreatePiece(next);
    }
  }

  function showStatus(text){status.textContent=text;status.classList.remove("hidden");}

  function updateHud(){
    const best=getBestScores()[0];
    if(hudScore) hudScore.textContent=String(score);
    if(hudBest) hudBest.textContent=gameMode===MODE_ENDLESS?'—':(best===undefined?'—':String(best));
    if(hudHeight) hudHeight.textContent=String(Math.max(0,Math.round(towerHeight)));
    if(document.getElementById("score")) document.getElementById("score").textContent=`SCORE ${score}`;
  }

  function refillPieceQueue(){
    pieceQueue=images.map((_,i)=>i);
    for(let i=pieceQueue.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [pieceQueue[i],pieceQueue[j]]=[pieceQueue[j],pieceQueue[i]];
    }
  }

  function getNextPieceIndex(){
    if(!pieceQueue.length) refillPieceQueue();
    return pieceQueue.shift();
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
    if(!DEBUG_SINGLE_PIECE) nextIndex=getNextPieceIndex();
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
    // v22.6: judge the visible fall rather than requiring the whole AABB to
    // clear the base. A tilted/long piece can keep one corner inside the base
    // even after it has clearly fallen off the side.
    const groundY=stageH-12;
    const overlap=Math.max(0,Math.min(b.bounds.max.x,baseRight)-Math.max(b.bounds.min.x,baseLeft));
    const bw=Math.max(1,b.bounds.max.x-b.bounds.min.x);
    const overlapRatio=overlap/bw;
    const belowSurface=b.bounds.min.y>groundY+2 || b.position.y>groundY+Math.max(8,p.h*0.20);
    const clearlyOutside=overlapRatio<0.12;
    const fallingOutside=clearlyOutside && belowSurface;
    b.plugin=b.plugin||{};
    b.plugin.gameOverOutsideFrames=fallingOutside?(b.plugin.gameOverOutsideFrames||0)+1:0;
    return b.plugin.gameOverOutsideFrames>=3;
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
    if(measurement){measurementUpdate();return;}
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
    if(measurement&&measurement.current) Renderer.drawPiece(measurement.current,cameraY);
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
    score=0;pieces=[];current=null;pieceQueue=[];nextIndex=0;cameraY=0;spawnAt=0;towerHeight=0;gameOver=false;ready=true;
    if(!DEBUG_SINGLE_PIECE) nextIndex=getNextPieceIndex();
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
      pieceQueue=[];
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
      if(measurementButton) measurementButton.disabled=true;
      showStatus("画像読み込みエラー: "+e.message);
    }
  }

  window.addEventListener("resize",()=>{resize();render();});
  if(restartButton) restartButton.addEventListener('click',reset);
  if(normalModeButton) normalModeButton.addEventListener('click',()=>startGame(MODE_NORMAL));
  if(endlessModeButton) endlessModeButton.addEventListener('click',()=>startGame(MODE_ENDLESS));
  if(endButton) endButton.addEventListener('click',endGame);
  if(measurementButton) measurementButton.addEventListener('click',measurementStart);
  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  document.addEventListener('touchstart',unlockAudio,{passive:true});

  return {init,update,render,moveCurrentTo,rotate,drop,get current(){return current},get ready(){return ready}};
})();
