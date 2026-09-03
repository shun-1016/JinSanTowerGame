/* v17.4 solo game */
const Game = (() => {
  const W0=390;
  let pieces=[];
  let current=null;
  let nextIndex=0;
  let score=0;
  let cameraY=0;
  let stageW=390, stageH=500;
  const GROUND_MARGIN=12;

  function layout() {
    const r=Renderer.canvas.getBoundingClientRect();
    stageW=r.width; stageH=r.height;
    const groundY=stageH-GROUND_MARGIN;
    Physics.resetGround(stageW/2, groundY+20, Math.max(900,stageW*3));
    if(current && !current.dropped) {
      const x=Math.max(25,Math.min(stageW-25,current.body.position.x));
      Physics.hold(current.body,x,Math.max(55,current.h/2+28));
    }
  }

  async function spawn() {
    if(nextIndex>=21) nextIndex=0;
    const x=stageW/2, y=Math.max(55, current ? current.h/2+28 : 70);
    try {
      const p=await Piece.create(nextIndex++,x,y);
      current=p;
      Physics.add(p.body);
      Physics.hold(p.body,x,y);
      render();
    } catch(e) {
      console.error("piece load failed",e);
    }
  }

  function moveCurrentTo(clientX,clientY) {
    if(!current || current.dropped) return;
    const rect=Renderer.canvas.getBoundingClientRect();
    const x=Math.max(15,Math.min(stageW-15,clientX-rect.left));
    const y=Math.max(35,Math.min(stageH*0.45,clientY-rect.top+cameraY));
    Matter.Body.setPosition(current.body,{x,y});
  }

  function rotate(a) {
    if(!current || current.dropped) return;
    Physics.rotate(current.body,a);
  }

  function drop() {
    if(!current || current.dropped) return;
    current.dropped=true;
    Physics.wake(current.body);
    current.body.position.y += 1;
    current.body.velocity.y = 0;
    score++;
    document.getElementById("score").textContent=`Score: ${score}`;
    spawn();
  }

  function update(dt) {
    // Do not let a newly spawned piece fall: it is static until drop().
    Physics.step(dt);
    // Basic camera follow after the stack rises.
    if(pieces.length) {
      let minY=Infinity;
      for(const p of pieces) minY=Math.min(minY,p.body.position.y-p.h/2);
      cameraY=Math.max(0,minY-stageH*0.28);
    }
    // Move dropped current into settled collection once it sleeps.
    for(const p of pieces) {}
    if(current && current.dropped && current.body.isSleeping) {
      pieces.push(current);
      current=null;
      spawn();
    }
  }

  function render() {
    const {w,h}=Renderer.resize();
    stageW=w; stageH=h;
    Renderer.clear(w,h);
    for(const p of pieces) Renderer.drawPiece(p,cameraY);
    if(current) Renderer.drawPiece(current,cameraY);
    Renderer.drawGround(h-GROUND_MARGIN,cameraY,w);
  }

  async function init() {
    layout();
    // Load first image before starting animation, so the initial piece is visible.
    await spawn();
    window.addEventListener("resize",()=>{layout();render();});
  }

  return {init,update,render,moveCurrentTo,rotate,drop,get current(){return current;}};
})();
