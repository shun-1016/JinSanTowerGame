/* v17.4 mobile input */
const Input = (() => {
  let dragging=false;
  let pointerId=null;

  function bind(game) {
    const c=Renderer.canvas;
    c.addEventListener("pointerdown", e=>{
      if(!game.current || game.current.dropped) return;
      dragging=true; pointerId=e.pointerId; c.setPointerCapture(pointerId);
      game.moveCurrentTo(e.clientX,e.clientY);
    });
    c.addEventListener("pointermove", e=>{
      if(!dragging || e.pointerId!==pointerId) return;
      game.moveCurrentTo(e.clientX,e.clientY);
    });
    const end=e=>{
      if(e.pointerId===pointerId){dragging=false;pointerId=null;}
    };
    c.addEventListener("pointerup",end);
    c.addEventListener("pointercancel",end);
    document.getElementById("drop").addEventListener("click",()=>game.drop());
    document.getElementById("rotateLeft").addEventListener("click",()=>game.rotate(-Math.PI/12));
    document.getElementById("rotateRight").addEventListener("click",()=>game.rotate(Math.PI/12));
  }
  return {bind};
})();
