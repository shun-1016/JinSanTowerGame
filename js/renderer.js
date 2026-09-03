/* v20 - Canvas renderer with optional triangulation diagnostics */
const Renderer = (() => {
  const canvas=document.getElementById('gameCanvas');
  const ctx=canvas.getContext('2d');
  let width=0,height=0,dpr=1;
  const DEBUG_SHAPE=new URLSearchParams(location.search).get("debug")==="on";
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
    // v19: use exactly the same transform order as drawPiece().
    // Image rendering is: Body position -> rotate -> image-local offset.
    // The previous debug contour rendering was: Body position -> offset -> rotate,
    // which made the blue contour drift away from the actual image as the piece rotated.
    const off=(body.plugin&&body.plugin.imageVisualOffset)||{x:0,y:0};
    ctx.save();
    ctx.translate(body.position.x,body.position.y-cameraY);
    ctx.rotate(body.angle);
    ctx.translate(off.x,off.y);
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

      ctx.fillStyle='rgba(0,170,0,1)';
      for(const v of vs){
        ctx.beginPath();
        ctx.arc(v.x,v.y-cameraY,1.8,0,Math.PI*2);
        ctx.fill();
      }
      ctx.fillStyle='rgba(255,0,0,0.08)';
    }

    // Magenta = actual compound Body position / COM.
    ctx.fillStyle='rgba(190,0,190,1)';
    ctx.beginPath();
    ctx.arc(body.position.x,body.position.y-cameraY,3,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function rotateLocal(x,y,angle){
    const c=Math.cos(angle),s=Math.sin(angle);
    return {x:x*c-y*s,y:x*s+y*c};
  }

  function drawPartCentroids(body,cameraY){
    // v19: yellow markers are the ACTUAL Matter.js part.position values,
    // not the originally stored triangle centroids. This lets us verify
    // whether Matter preserved the intended local geometry.
    const parts=getCollisionParts(body);
    if(!parts.length) return;
    ctx.save();
    ctx.fillStyle='rgba(255,190,0,1)';
    ctx.strokeStyle='rgba(90,55,0,1)';
    ctx.lineWidth=1;
    for(const part of parts){
      const dx=part.position.x-body.position.x;
      const dy=part.position.y-body.position.y;
      // part.position is already in world space and therefore rotates with
      // the body. Draw it directly rather than applying the body angle again.
      const x=part.position.x;
      const y=part.position.y-cameraY;
      ctx.beginPath();
      ctx.arc(x,y,3.2,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawImageCenterMarker(body,cameraY){
    // White cross = the actual image centre in world space after applying
    // the same visual offset used by drawImage(). If this separates from the
    // blue contour centre/expected geometry during rotation, the bug is in
    // the image-vs-COM transform rather than the collision geometry.
    const off=(body.plugin&&body.plugin.imageVisualOffset)||{x:0,y:0};
    const r=rotateLocal(off.x,off.y,body.angle);
    const x=body.position.x+r.x;
    const y=body.position.y+r.y-cameraY;
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,0.95)';
    ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,0.9)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }

  function drawExpectedImageCenter(body,cameraY){
    // Cyan square = image centre at the point implied by the contour's
    // coordinate system (0,0). This is intentionally separate from the
    // white marker so the two can be compared during rotation.
    const off=(body.plugin&&body.plugin.imageVisualOffset)||{x:0,y:0};
    const r=rotateLocal(off.x,off.y,body.angle);
    const x=body.position.x+r.x;
    const y=body.position.y+r.y-cameraY;
    ctx.save();
    ctx.strokeStyle='rgba(0,220,220,1)';ctx.lineWidth=1.5;
    ctx.strokeRect(x-5,y-5,10,10);
    ctx.restore();
  }

  function drawDebugShape(p,cameraY){
    if(!DEBUG_SHAPE) return;
    const b=p.body;
    const plugin=b.plugin||{};
    const contours=plugin.debugContours||[];
    if(contours.length) drawLocalContour(b,contours,cameraY);
    drawActualPhysics(b,cameraY);
    drawPartCentroids(b,cameraY);
    drawImageCenterMarker(b,cameraY);
    drawExpectedImageCenter(b,cameraY);
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
    const com=(plugin.debugCompoundCOMLocal||{x:0,y:0});
    const angleDeg=(b.angle*180/Math.PI);
    const partsForDiag=getCollisionParts(b);
    let partDx=0,partDy=0;
    if(partsForDiag.length){
      const first=partsForDiag[0];
      partDx=first.position.x-b.position.x;
      partDy=first.position.y-b.position.y;
    }

    const td=plugin.debugTriangulation||{};
    const si=td.selfIntersection?'YES':'NO';
    const edge=td.selfIntersectionEdges?` (${td.selfIntersectionEdges})`:'';
    debugEl.innerHTML=
      `輪郭解析: ${idx}.png　輪郭頂点: ${contourPts}<br>`+
      `DEBUG: ON　${plugin.debugFixedPiece?"固定":"通常順番(01→21)"}　(通常: ?debug=off)<br>`+
      `簡略化後: ${td.cleanCount??'-'}　面積: ${Number(td.area??0).toFixed(2)}　`+
      `自己交差: ${si}${edge}<br>`+
      `三角形化: ${td.failed?'FAIL':'OK'}　理由: ${td.failReason||'-'}　`+
      `失敗時残頂点: ${td.remainingVertices??'-'}<br>`+
      `物理三角形: ${actualTris}　物理頂点: ${actualVerts}　`+
      `Body: ${bodyOk?'OK':'NG'}　Fallback: ${fallback?'YES':'NO'}<br>`+
      `COM Local: x=${com.x.toFixed(2)}, y=${com.y.toFixed(2)}　`+
      `Image Offset: x=${off.x.toFixed(2)}, y=${off.y.toFixed(2)}<br>`+
      `Body: x=${b.position.x.toFixed(1)}, y=${b.position.y.toFixed(1)}　`+
      `Angle: ${angleDeg.toFixed(1)}°<br>`+
      `First Part Δ: x=${partDx.toFixed(2)}, y=${partDy.toFixed(2)}`;
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
