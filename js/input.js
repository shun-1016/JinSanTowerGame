/* v17.8 - mobile input: horizontal-only standby movement */
const Input = (() => {
  let dragging=false;
  let pointerId=null;
  let startX=0;
  let startY=0;
  let draggingHorizontally=false;
  const MOVE_THRESHOLD=8;

  function bind(game){
    const canvas=Renderer.canvas;

    canvas.addEventListener("pointerdown",e=>{
      if(!game.current || game.current.dropped || !game.ready) return;
      dragging=true;
      draggingHorizontally=false;
      pointerId=e.pointerId;
      startX=e.clientX;
      startY=e.clientY;
      canvas.setPointerCapture(pointerId);
      // Do not move the piece on tap. Its initial position remains unchanged.
    });

    canvas.addEventListener("pointermove",e=>{
      if(!dragging || e.pointerId!==pointerId) return;

      const dx=e.clientX-startX;
      const dy=e.clientY-startY;

      // A tap, or a predominantly vertical gesture, must not move the piece.
      // Begin horizontal movement only after a small intentional gesture.
      if(!draggingHorizontally){
        if(Math.abs(dx)<MOVE_THRESHOLD) return;
        if(Math.abs(dx)<=Math.abs(dy)) return;
        draggingHorizontally=true;
      }

      // Only X is passed to Game. Y is deliberately ignored.
      game.moveCurrentTo(e.clientX);
    });

    const end=e=>{
      if(e.pointerId===pointerId){
        dragging=false;
        draggingHorizontally=false;
        pointerId=null;
      }
    };
    canvas.addEventListener("pointerup",end);
    canvas.addEventListener("pointercancel",end);

    document.getElementById("drop").addEventListener("click",()=>game.drop());
    document.getElementById("rotateLeft").addEventListener("click",()=>game.rotate(-Math.PI/12));
    document.getElementById("rotateRight").addEventListener("click",()=>game.rotate(Math.PI/12));
  }

  return {bind};
})();
