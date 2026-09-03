/* v17.5 - Canvas renderer */
const Renderer = (() => {
  const canvas=document.getElementById("gameCanvas");
  const ctx=canvas.getContext("2d");
  let width=0,height=0,dpr=1;

  function resize(){
    const r=canvas.getBoundingClientRect();
    width=r.width; height=r.height;
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(width*dpr));
    canvas.height=Math.max(1,Math.round(height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {width,height};
  }

  function clear(){
    ctx.clearRect(0,0,width,height);
  }

  function drawPiece(p,cameraY){
    const b=p.body;
    ctx.save();
    ctx.translate(b.position.x,b.position.y-cameraY);
    ctx.rotate(b.angle);
    const off=(b.plugin&&b.plugin.imageVisualOffset)||{x:0,y:0};
    ctx.drawImage(p.im,off.x-p.w/2,off.y-p.h/2,p.w,p.h);
    ctx.restore();
  }

  function drawGround(y,cameraY){
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0,y-cameraY);
    ctx.lineTo(width,y-cameraY);
    ctx.strokeStyle="#888";
    ctx.lineWidth=2;
    ctx.stroke();
    ctx.restore();
  }

  return {canvas,resize,clear,drawPiece,drawGround,get width(){return width},get height(){return height}};
})();
