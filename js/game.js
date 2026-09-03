/* v19 - solo game / optional debug mode / normal piece sequence */
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

  // v19: debug mode is opt-in via ?debug=on.
  // In debug mode the normal 01.png -> 21.png sequence is kept so all pieces
  // can be validated. For a fixed piece, optionally use ?debug=on&piece=04.
  const params=new URLSearchParams(location.search);
  const DEBUG_MODE=params.get("debug")==="on";
  const debugPieceParam=params.get("piece");
  const DEBUG_PIECE_INDEX=(debugPieceParam && /^\d{1,2}$/.test(debugPieceParam))
    ? Math.max(0,Math.min(20,parseInt(debugPieceParam,10)-1))
    : null;
  const DEBUG_SINGLE_PIECE=DEBUG_MODE && DEBUG_PIECE_INDEX!==null;

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
      const x=Math.max(current.w/2,Math.min(stageW-current.w/2,current.body.position.x));
      if(Math.abs(x-current.body.position.x)>0.01){
        Physics.move(current.body,x,current.body.position.y);
      }
    }
  }

  function spawn(){
    if(!ready) return;
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
    if(!current || current.dropped || !ready) return;
    const r=Renderer.canvas.getBoundingClientRect();
    const currentPointerX=clientX-r.left;
    const startPointerX=pointerStartX-r.left;
    const x=Math.max(current.w/2,Math.min(stageW-current.w/2,
      pieceStartX+(currentPointerX-startPointerX)));
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
    spawnAt=performance.now()+NEXT_PIECE_DELAY;
  }

  const CAMERA_TRIGGER=0.45;
  const CAMERA_TARGET=0.45;
  const CAMERA_SMOOTH=8;

  function updateCamera(){
    if(!pieces.length) return;
    let towerTop=Infinity;
    let settledCount=0;
    for(const p of pieces){
      if(!p.body.isSleeping) continue;
      towerTop=Math.min(towerTop,p.body.bounds.min.y);
      settledCount++;
    }
    if(!settledCount) return;

    const screenTop=towerTop-cameraY;
    const triggerY=stageH*CAMERA_TRIGGER;
    if(screenTop>=triggerY) return;

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
    Renderer.renderDebugTarget(current,pieces);
  }

  async function init(){
    try{
      if(typeof Matter==="undefined") throw new Error("Matter.jsが読み込まれていません");
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
