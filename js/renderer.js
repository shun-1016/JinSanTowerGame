/* v17.4 Canvas renderer */
const Renderer = (() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  let dpr = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width*dpr));
    canvas.height = Math.max(1, Math.round(r.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {w:r.width,h:r.height};
  }
  function clear(w,h) {
    ctx.clearRect(0,0,w,h);
  }
  function drawPiece(p, cameraY) {
    if(!p || !p.body) return;
    const b=p.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y-cameraY);
    ctx.rotate(b.angle);
    ctx.drawImage(p.im, -p.w/2, -p.h/2, p.w, p.h);
    ctx.restore();
  }
  function drawGround(y,cameraY,w) {
    ctx.save();
    ctx.strokeStyle="#888";
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(0,y-cameraY);
    ctx.lineTo(w,y-cameraY);
    ctx.stroke();
    ctx.restore();
  }
  return {canvas,ctx,resize,clear,drawPiece,drawGround};
})();
