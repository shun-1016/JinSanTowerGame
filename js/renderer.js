/* v21.0 - Canvas renderer with shorter base */
const Renderer = (() => {
  const canvas=document.getElementById('gameCanvas');
  const ctx=canvas.getContext('2d');
  let width=0,height=0,dpr=1;
  const DEBUG_SHAPE=new URLSearchParams(location.search).get("debug")==="on";
  const debugEl=document.getElementById('shapeDebug');

  function resize(){
    const r=canvas.getBoundingClientRect(); width=r.width;height=r.height;
    dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);return {width,height};
  }
  function clear(){ctx.clearRect(0,0,width,height);}

  function getCollisionParts(body){return body.parts&&body.parts.length>1?body.parts.slice(1):body.parts||[];}
  function drawLocalContour(body,contours,cameraY){
    const off=(body.plugin&&body.plugin.imageVisualOffset)||{x:0,y:0};
    ctx.save();ctx.translate(body.position.x,body.position.y-cameraY);ctx.rotate(body.angle);ctx.translate(off.x,off.y);
    ctx.strokeStyle='rgba(0,90,255,.95)';ctx.lineWidth=1.5;
    for(const poly of contours){if(poly.length<3)continue;ctx.beginPath();ctx.moveTo(poly[0].x,poly[0].y);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i].x,poly[i].y);ctx.closePath();ctx.stroke();}
    ctx.restore();
  }
  function drawActualPhysics(body,cameraY){
    const parts=getCollisionParts(body);ctx.save();ctx.strokeStyle='rgba(255,0,0,.95)';ctx.fillStyle='rgba(255,0,0,.08)';ctx.lineWidth=1.25;
    for(const part of parts){const vs=part.vertices;if(!vs||vs.length<3)continue;ctx.beginPath();ctx.moveTo(vs[0].x,vs[0].y-cameraY);for(let i=1;i<vs.length;i++)ctx.lineTo(vs[i].x,vs[i].y-cameraY);ctx.closePath();ctx.fill();ctx.stroke();}
    ctx.restore();
  }
  function drawDebugShape(p,cameraY){
    if(!DEBUG_SHAPE)return;const b=p.body,plugin=b.plugin||{},contours=plugin.debugContours||[];
    if(contours.length)drawLocalContour(b,contours,cameraY);drawActualPhysics(b,cameraY);
  }
  function updateDebugPanel(p){
    if(!debugEl||!p||!p.body)return;const b=p.body,pl=b.plugin||{},idx=String((p.index||0)+1).padStart(2,'0');
    const parts=getCollisionParts(b),actualVerts=parts.reduce((s,x)=>s+(x.vertices?x.vertices.length:0),0),td=pl.debugTriangulation||{};
    debugEl.innerHTML=`輪郭解析: ${idx}.png　輪郭頂点: ${pl.debugContourVertexCount||0}<br>`+
      `DEBUG: ON　${pl.debugFixedPiece?'固定':'通常順番(01→21)'}<br>`+
      `簡略化後: ${td.cleanCount??'-'}　面積: ${Number(td.area??0).toFixed(2)}　自己交差: ${td.selfIntersection?'YES':'NO'}<br>`+
      `三角形化: ${td.failed?'FAIL':'OK'}　理由: ${td.failReason||'-'}　元三角形: ${pl.debugTriangulatedCount||0}<br>`+
      `物理凸ポリゴン: ${pl.debugConvexPartCount||actualVerts}　物理頂点: ${actualVerts}　Fallback: ${pl.debugFallback?'YES':'NO'}`;
  }
  function drawPiece(p,cameraY){
    const b=p.body;ctx.save();ctx.translate(b.position.x,b.position.y-cameraY);ctx.rotate(b.angle);
    const off=(b.plugin&&b.plugin.imageVisualOffset)||{x:0,y:0};ctx.drawImage(p.im,off.x-p.w/2,off.y-p.h/2,p.w,p.h);ctx.restore();drawDebugShape(p,cameraY);
  }
  function drawGround(y,cameraY,baseWidth){
    const bw=baseWidth||width*.82,left=(width-bw)/2,right=left+bw,yy=y-cameraY;
    ctx.save();ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.strokeStyle='#777';ctx.lineWidth=3;ctx.lineCap='round';ctx.stroke();ctx.restore();
  }
  function renderDebugTarget(current,pieces){if(!DEBUG_SHAPE)return;const target=current||((pieces&&pieces.length)?pieces[pieces.length-1]:null);if(target)updateDebugPanel(target);else if(debugEl)debugEl.textContent='輪郭解析: 待機中';}
  return {canvas,resize,clear,drawPiece,drawGround,renderDebugTarget,get width(){return width},get height(){return height}};
})();
