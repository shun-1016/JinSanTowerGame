/* v17.8 - solo game */
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
  let spawnAt=0;
  const NEXT_PIECE_DELAY=500;

  const status=document.getElementById("status");

  function showStatus(text){
    status.textContent=text;
    status.classList.remove("hidden");
  }
  function hideStatus(){status.classList.add("hidden");}

  function resize(){
    const {width,height}=Renderer.resize();
    stageW=width; stageH=height;
    Physics.setup(stageW,stageH-12);
    if(current && !current.dropped){
      const x=Math.max(20,Math.min(stageW-20,current.body.position.x));
      Physics.hold(current.body,x,Math.max(65,current.h/2+18),current.body.angle);
    }
  }

  function spawn(){
    if(!ready) return;
    const x=stageW/2;
    // Spawn relative to the current camera, so the standby piece remains
    // visible even after the camera has started following a tall tower.
    const y=cameraY+Math.max(60,Math.min(100,stageH*0.18));
    const p=Piece.create(nextIndex,images,x,y);
    nextIndex=(nextIndex+1)%images.length;
    current=p;
    Physics.add(p.body);
    Physics.hold(p.body,x,y,0);
  }

  function moveCurrentTo(clientX){
    if(!current || current.dropped || !ready) return;
    const r=Renderer.canvas.getBoundingClientRect();
    const x=Math.max(current.w/2,Math.min(stageW-current.w/2,clientX-r.left));
    // Keep the standby piece at exactly its existing Y position.
    // Horizontal movement must never introduce a vertical offset.
    Physics.move(current.body,x,current.body.position.y);
  }

  function rotate(delta){
    if(!current || current.dropped || !ready) return;
    Physics.rotate(current.body,delta);
  }

  function drop(){
    if(!current || current.dropped || !ready) return;
    const dropped=current;
    dropped.dropped=true;
    pieces.push(dropped);
    current=null;

    Physics.release(dropped.body);

    score++;
    document.getElementById("score").textContent=`Score: ${score}`;

    // Wait briefly before rendering the next standby piece. This prevents
    // the newly created body from overlapping the still-falling piece.
    spawnAt=performance.now()+NEXT_PIECE_DELAY;
  }

  // Camera behavior:
  // Keep the camera fixed until the settled tower itself reaches the
  // trigger line on screen. Once it crosses that line, move the camera
  // upward so the tower top stays around CAMERA_TOP of the viewport.
  // The calculation is intentionally done in screen coordinates:
  // screenY = worldY - cameraY. This avoids reversing the camera direction.
  const CAMERA_TRIGGER=0.45; // start following when tower top reaches 45%
  const CAMERA_TOP=0.30;     // after triggering, keep tower top around 30%
  const CAMERA_SMOOTH=8;

  function updateCamera(){
    if(!pieces.length) return;

    let towerTop=Infinity;
    let settledCount=0;
    for(const p of pieces){
      // Do not let a currently falling body pull the camera.
      if(!p.body.isSleeping) continue;
      towerTop=Math.min(towerTop,p.body.bounds.min.y);
      settledCount++;
    }
    if(!settledCount) return;

    // Convert the highest settled point into the current viewport position.
    const screenTop=towerTop-cameraY;
    const triggerY=stageH*CAMERA_TRIGGER;
    if(screenTop>=triggerY) return;

    // Because screenY = worldY - cameraY, increasing cameraY moves the
    // tower upward on screen. The desired camera position is therefore:
    // towerTop - desiredScreenY.
    const targetCamera=Math.max(0,towerTop-stageH*CAMERA_TOP);
    if(targetCamera<=cameraY) return;

    cameraY += (targetCamera-cameraY)*Math.min(1,1-Math.exp(-CAMERA_SMOOTH/60));
    if(targetCamera-cameraY<0.2) cameraY=targetCamera;
  }

  function update(dt){
    Physics.step(dt);

    if(!current && spawnAt && performance.now()>=spawnAt){
      spawnAt=0;
      spawn();
    }

    updateCamera();
  }

  function render(){
    Renderer.clear();
    for(const p of pieces) Renderer.drawPiece(p,cameraY);
    if(current) Renderer.drawPiece(current,cameraY);
    Renderer.drawGround(stageH-12,cameraY);
  }

  async function init(){
    try{
      if(typeof Matter==="undefined"){
        throw new Error("Matter.jsが読み込まれていません");
      }
      resize();
      showStatus("画像を読み込み中…");
      images=await Piece.preload();
      ready=true;
      hideStatus();
      spawn();
      render();
    }catch(e){
      console.error(e);
      showStatus("初期化エラー: "+e.message);
      throw e;
    }
  }

  window.addEventListener("resize",()=>{
    resize();
    render();
  });

  return {
    init,update,render,moveCurrentTo,rotate,drop,
    get current(){return current},
    get ready(){return ready}
  };
})();
