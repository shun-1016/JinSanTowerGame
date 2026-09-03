/* v17.7 - solo game */
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

  function moveCurrentTo(clientX,clientY){
    if(!current || current.dropped || !ready) return;
    const r=Renderer.canvas.getBoundingClientRect();
    const x=Math.max(current.w/2,Math.min(stageW-current.w/2,clientX-r.left));
    const y=Math.max(cameraY+35,Math.min(cameraY+stageH*0.42,clientY-r.top+cameraY));
    Physics.move(current.body,x,y);
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
  // Only SETTLED pieces are used for camera tracking. A dropped piece is
  // intentionally ignored while it is falling, because it starts near the
  // top of the screen and must never pull the camera toward itself.
  //
  // Until the tower itself becomes tall enough, cameraY stays exactly 0.
  // Once the highest placed piece reaches the trigger height, the camera
  // starts following upward and never moves downward.
  const CAMERA_TRIGGER=0.55; // tower height must exceed 55% of stage height
  const CAMERA_TOP=0.30;     // after triggering, keep tower top around 30%
  const CAMERA_SMOOTH=7;

  function updateCamera(){
    if(!pieces.length) return;

    // Highest point of PLACED pieces in world coordinates. Do not include
    // `current`, because the current piece is the next standby piece.
    let towerTop=Infinity;
    let settledCount=0;
    for(const p of pieces){
      // Matter.js marks bodies as sleeping after they have come to rest.
      // Falling/settling pieces must not influence camera movement.
      if(!p.body.isSleeping) continue;
      towerTop=Math.min(towerTop,p.body.bounds.min.y);
      settledCount++;
    }
    if(!settledCount) return;

    // Ground is fixed in world coordinates. The tower height is therefore
    // independent of the current camera position.
    const groundY=stageH-12;
    const towerHeight=groundY-towerTop;
    const triggerHeight=stageH*CAMERA_TRIGGER;

    if(towerHeight <= triggerHeight) return;

    // Once triggered, place the tower top near CAMERA_TOP of the viewport.
    const target=Math.max(0,towerTop-stageH*CAMERA_TOP);
    if(target>cameraY){
      cameraY += (target-cameraY)*Math.min(1,1-Math.exp(-CAMERA_SMOOTH/60));
    }
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
