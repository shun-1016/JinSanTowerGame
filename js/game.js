/* v17.10 - solo game / stable standby input */
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
      // iOS Safari may fire resize while the browser chrome changes during a
      // touch. Never reset the standby piece's Y position here. That caused
      // the piece to jump vertically on the first tap. Only clamp X if the
      // viewport became narrower.
      const x=Math.max(current.w/2,Math.min(stageW-current.w/2,current.body.position.x));
      if(Math.abs(x-current.body.position.x)>0.01){
        Physics.move(current.body,x,current.body.position.y);
      }
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

  function moveCurrentTo(clientX, pointerStartX, pieceStartX, pieceStartY){
    if(!current || current.dropped || !ready) return;
    const r=Renderer.canvas.getBoundingClientRect();
    const currentPointerX=clientX-r.left;
    const startPointerX=pointerStartX-r.left;
    // Move only by the finger's horizontal delta. This preserves the exact
    // initial X grab offset and prevents a first-touch jump.
    const x=Math.max(current.w/2,Math.min(stageW-current.w/2,
      pieceStartX+(currentPointerX-startPointerX)));
    // Y is intentionally locked to the pointerdown position.
    Physics.move(current.body,x,pieceStartY);
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
  // The canvas uses screenY = worldY - cameraY. Therefore, when the tower
  // grows upward (towerTop gets smaller), cameraY must become NEGATIVE so
  // the whole world, including the ground, moves DOWN on screen.
  //
  // Keep the camera fixed until the settled tower top reaches 45% of the
  // viewport. After that, keep the tower top around the same 45% line while
  // allowing cameraY to go negative. This makes the base move downward and
  // eventually disappear instead of creating a gap below it.
  const CAMERA_TRIGGER=0.45;
  const CAMERA_TARGET=0.45;
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

    // IMPORTANT: cameraY is allowed to become negative. With
    // screenY = worldY - cameraY, a negative cameraY moves the world DOWN.
    // That is the required direction for this game: as the tower grows,
    // the base should move below the viewport rather than leaving a gap
    // underneath it.
    const targetCamera=towerTop-stageH*CAMERA_TARGET;
    if(targetCamera>=cameraY) return;

    cameraY += (targetCamera-cameraY)*Math.min(1,1-Math.exp(-CAMERA_SMOOTH/60));
    if(Math.abs(targetCamera-cameraY)<0.2) cameraY=targetCamera;
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
