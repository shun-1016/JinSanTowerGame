/* v18.1 - Canvas renderer with alpha-contour debug overlay */
const Renderer = (() => {
  const canvas=document.getElementById('gameCanvas');
  const ctx=canvas.getContext('2d');
  let width=0,height=0,dpr=1;
  const DEBUG_SHAPE=true;

  function resize(){
    const r=canvas.getBoundingClientRect(); width=r.width; height=r.height;
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(width*dpr));
    canvas.height=Math.max(1,Math.round(height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {width,height};
  }
  function clear(){ctx.clearRect(0,0,width,height);}

  function drawDebugShape(p,cameraY){
    if(!DEBUG_SHAPE) return;
    const b=p.body, contours=b.plugin&&b.plugin.debugContours;
    if(!contours||!contours.length) return;
    const off=(b.plugin&&b.plugin.imageVisualOffset)||{x:0,y:0};
    ctx.save();
    ctx.translate(b.position.x+off.x,b.position.y-cameraY+off.y);
    ctx.rotate(b.angle);
    ctx.strokeStyle='rgba(0,120,255,0.9)';
    ctx.fillStyle='rgba(0,120,255,0.18)';
    ctx.lineWidth=0.8;
    for(const poly of contours){
      if(poly.length<3) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0].x,poly[0].y);
      for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i].x,poly[i].y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      for(const q of poly){ctx.beginPath();ctx.arc(q.x,q.y,0.9,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }

  function drawPiece(p,cameraY){
    const b=p.body;
    ctx.save();
    ctx.translate(b.position.x,b.position.y-cameraY);
    ctx.rotate(b.angle);
    const off=(b.plugin&&b.plugin.imageVisualOffset)||{x:0,y:0};
    ctx.drawImage(p.im,off.x-p.w/2,off.y-p.h/2,p.w,p.h);
    ctx.restore();
    drawDebugShape(p,cameraY);
  }

  function drawGround(y,cameraY){
    ctx.save();ctx.beginPath();ctx.moveTo(0,y-cameraY);ctx.lineTo(width,y-cameraY);
    ctx.strokeStyle='#888';ctx.lineWidth=2;ctx.stroke();ctx.restore();
  }
  return {canvas,resize,clear,drawPiece,drawGround,get width(){return width},get height(){return height}};
})();
