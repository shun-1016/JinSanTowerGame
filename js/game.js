/* v17.5 - solo game */
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
    const y=Math.max(60,Math.min(100,stageH*0.18));
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
    const y=Math.max(35,Math.min(stageH*0.42,clientY-r.top+cameraY));
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

    // Generate the next standby piece immediately, independent of the
    // previous piece's sleeping state.
    spawn();
  }

  // Camera behavior:
  // Keep the base/tower in its original position at first.
  // Only start raising the viewpoint after the tower becomes high enough
  // that its top reaches this trigger line. Once triggered, keep following
  // the tower upward without ever moving the camera back down.
  const CAMERA_TRIGGER=0.45; // tower top must reach 45% of the stage height
  const CAMERA_TOP=0.25;     // after following, keep tower top around 25%

  function update(dt){
    Physics.step(dt);

    if(pieces.length){
      let top=Infinity;
      for(const p of pieces){
        top=Math.min(top,p.body.position.y-p.h/2);
      }

      const triggerY=stageH*CAMERA_TRIGGER;
      if(top < triggerY){
        const target=Math.max(0,top-stageH*CAMERA_TOP);
        // Follow upward only. Do not move the camera downward when pieces
        // settle or when the tower top temporarily drops.
        if(target>cameraY){
          cameraY += (target-cameraY)*Math.min(1,dt*5);
        }
      }
    }
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
