/* v17.5 - mobile input */
const Input = (() => {
  let dragging=false;
  let pointerId=null;

  function bind(game){
    const canvas=Renderer.canvas;

    canvas.addEventListener("pointerdown",e=>{
      if(!game.current || game.current.dropped || !game.ready) return;
      dragging=true;
      pointerId=e.pointerId;
      canvas.setPointerCapture(pointerId);
      game.moveCurrentTo(e.clientX,e.clientY);
    });

    canvas.addEventListener("pointermove",e=>{
      if(!dragging || e.pointerId!==pointerId) return;
      game.moveCurrentTo(e.clientX,e.clientY);
    });

    const end=e=>{
      if(e.pointerId===pointerId){
        dragging=false;
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
