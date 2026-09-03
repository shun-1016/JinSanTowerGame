/* v18.3 - Canvas renderer with contour vs actual Matter.js diagnostics */
const Renderer = (() => {
  const canvas=document.getElementById('gameCanvas');
  const ctx=canvas.getContext('2d');
  let width=0,height=0,dpr=1;
  const DEBUG_SHAPE=true;
  const debugEl=document.getElementById('shapeDebug');

  function resize(){
    const r=canvas.getBoundingClientRect(); width=r.width; height=r.height;
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(width*dpr));
    canvas.height=Math.max(1,Math.round(height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {width,height};
  }
  function clear(){ctx.clearRect(0,0,width,height);}

  function drawLocalContour(body,contours,cameraY){
    const off=(body.plugin&&body.plugin.imageVisualOffset)||{x:0,y:0};
    ctx.save();
    ctx.translate(body.position.x+off.x,body.position.y-cameraY+off.y);
    ctx.rotate(body.angle);
    ctx.strokeStyle='rgba(0,90,255,0.95)';
    ctx.lineWidth=1.5;
    for(const poly of contours){
      if(poly.length<3) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0].x,poly[0].y);
      for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i].x,poly[i].y);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function getCollisionParts(body){
    // For a compound body, parts[0] is the parent/hull. Matter.js collision
    // uses the child parts, so only those are the "actual" polygons to debug.
    return body.parts&&body.parts.length>1?body.parts.slice(1):body.parts||[];
  }

  function drawActualPhysics(body,cameraY){
    const parts=getCollisionParts(body);
    ctx.save();
    ctx.strokeStyle='rgba(255,0,0,0.95)';
    ctx.fillStyle='rgba(255,0,0,0.08)';
    ctx.lineWidth=1.25;

    for(const part of parts){
      const vs=part.vertices;
      if(!vs||vs.length<3) continue;

      ctx.beginPath();
      ctx.moveTo(vs[0].x,vs[0].y-cameraY);
      for(let i=1;i<vs.length;i++) ctx.lineTo(vs[i].x,vs[i].y-cameraY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Green = actual Matter.js polygon vertices in world space.
      ctx.fillStyle='rgba(0,170,0,1)';
      for(const v of vs){
        ctx.beginPath();
        ctx.arc(v.x,v.y-cameraY,1.8,0,Math.PI*2);
        ctx.fill();
      }
      ctx.fillStyle='rgba(255,0,0,0.08)';
    }

    // Magenta = Matter.js body position (COM).
    ctx.fillStyle='rgba(190,0,190,1)';
    ctx.beginPath();
    ctx.arc(body.position.x,body.position.y-cameraY,3,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawDebugShape(p,cameraY){
    if(!DEBUG_SHAPE) return;
    const b=p.body;
    const plugin=b.plugin||{};
    const contours=plugin.debugContours||[];
    if(contours.length) drawLocalContour(b,contours,cameraY);
    drawActualPhysics(b,cameraY);
  }

  function updateDebugPanel(p){
    if(!debugEl||!p||!p.body) return;
    const b=p.body, plugin=b.plugin||{};
    const idx=String((p.index||0)+1).padStart(2,'0');
    const contourPts=plugin.debugContourVertexCount||0;
    const parts=getCollisionParts(b);
    const actualVerts=parts.reduce((sum,part)=>sum+(part.vertices?part.vertices.length:0),0);
    const actualTris=plugin.debugFallback?0:parts.length;
    const off=plugin.imageVisualOffset||{x:0,y:0};
    const bodyOk=plugin.debugBodyCreated===true;
    const fallback=plugin.debugFallback===true;

    debugEl.innerHTML=
      `輪郭解析: ${idx}.png　輪郭頂点: ${contourPts}<br>`+
      `物理三角形: ${actualTris}　物理頂点: ${actualVerts}　`+
      `Body: ${bodyOk?'OK':'NG'}　Fallback: ${fallback?'YES':'NO'}<br>`+
      `COM Offset: x=${off.x.toFixed(1)}, y=${off.y.toFixed(1)}　`+
      `Body: x=${b.position.x.toFixed(1)}, y=${b.position.y.toFixed(1)}`;
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

  function renderDebugTarget(current,pieces){
    if(!DEBUG_SHAPE) return;
    const target=current||((pieces&&pieces.length)?pieces[pieces.length-1]:null);
    if(target) updateDebugPanel(target);
    else if(debugEl) debugEl.textContent='輪郭解析: 待機中';
  }

  return {
    canvas,resize,clear,drawPiece,drawGround,
    renderDebugTarget,
    get width(){return width},
    get height(){return height}
  };
})();
