/* v22.1 - debug overlay for 37 pieces and opaque-region collision geometry */
const Renderer = (() => {
  const canvas=document.getElementById('gameCanvas');
  const ctx=canvas.getContext('2d');
  let width=0,height=0,dpr=1;
  const DEBUG_SHAPE=new URLSearchParams(location.search).get('debug')==='on';
  const debugEl=document.getElementById('shapeDebug');
  const effects=[];

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
  function drawActualPhysics(body,cameraY){const parts=getCollisionParts(body);ctx.save();ctx.strokeStyle='rgba(255,0,0,.95)';ctx.fillStyle='rgba(255,0,0,.08)';ctx.lineWidth=1.25;for(const part of parts){const vs=part.vertices;if(!vs||vs.length<3)continue;ctx.beginPath();ctx.moveTo(vs[0].x,vs[0].y-cameraY);for(let i=1;i<vs.length;i++)ctx.lineTo(vs[i].x,vs[i].y-cameraY);ctx.closePath();ctx.fill();ctx.stroke();}ctx.restore();}
  function drawDebugShape(p,cameraY){if(!DEBUG_SHAPE)return;const b=p.body,plugin=b.plugin||{},contours=plugin.debugContours||[];if(contours.length)drawLocalContour(b,contours,cameraY);drawActualPhysics(b,cameraY);}
  function updateDebugPanel(p){
    if(!debugEl||!p||!p.body)return;const b=p.body,pl=b.plugin||{},idx=String((p.index||0)+1).padStart(2,'0');
    const parts=getCollisionParts(b),actualVerts=parts.reduce((s,x)=>s+(x.vertices?x.vertices.length:0),0),td=pl.debugTriangulation||{};
    debugEl.innerHTML=`輪郭解析: ${idx}.png　輪郭頂点: ${pl.debugContourVertexCount||0}<br>`+
      `DEBUG: ON　${pl.debugFixedPiece?'固定':'通常順番(01→37)'}<br>`+
      `簡略化後: ${td.cleanCount??'-'}　面積: ${Number(td.area??0).toFixed(2)}　自己交差: ${td.selfIntersection?'YES':'NO'}<br>`+
      `三角形化: ${td.failed?'FAIL':'OK'}　理由: ${td.failReason||'-'}　元三角形: ${pl.debugTriangulatedCount||0}<br>`+
      `物理凸ポリゴン: ${pl.debugConvexPartCount||actualVerts}　物理頂点: ${actualVerts}　領域: ${pl.debugRegionCount||0}　穴: ${pl.debugHoleCount||0}　Fallback: ${pl.debugFallback?'YES':'NO'}`;
  }
  function addBurst(x,y,count,kind){for(let i=0;i<count;i++){const angle=Math.random()*Math.PI*2;const speed=(kind==='gameover'?35:kind==='rotate'?12:25)*(0.55+Math.random()*.75);effects.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-(kind==='drop'?12:0),life:0,max:kind==='gameover'?700:420,size:kind==='gameover'?2.4:2,kind});}}
  function emitDrop(x,y){addBurst(x,y,12,'drop');}
  function emitRotate(x,y){addBurst(x,y,4,'rotate');}
  function emitGameOver(x,y){addBurst(x,y,28,'gameover');}
  function updateEffects(dt){const ms=Math.max(0,Math.min(50,dt*1000));for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life+=ms;e.x+=e.vx*dt;e.y+=e.vy*dt;e.vy+=55*dt;e.vx*=Math.pow(.985,ms/16);if(e.life>=e.max)effects.splice(i,1);}}
  function renderEffects(cameraY){ctx.save();for(const e of effects){const alpha=Math.max(0,1-e.life/e.max);ctx.globalAlpha=alpha*.75;ctx.beginPath();ctx.arc(e.x,e.y-cameraY,e.size,0,Math.PI*2);ctx.fillStyle=e.kind==='gameover'?'rgba(255,255,255,.95)':e.kind==='rotate'?'rgba(70,120,255,.9)':'rgba(255,245,190,.95)';ctx.fill();}ctx.restore();}
  function drawPiece(p,cameraY){const b=p.body;ctx.save();ctx.translate(b.position.x,b.position.y-cameraY);ctx.rotate(b.angle);const off=(b.plugin&&b.plugin.imageVisualOffset)||{x:0,y:0};ctx.drawImage(p.im,off.x-p.w/2,off.y-p.h/2,p.w,p.h);ctx.restore();drawDebugShape(p,cameraY);}
  function drawGround(y,cameraY,baseWidth){const bw=baseWidth||width*.82,left=(width-bw)/2,right=left+bw,yy=y-cameraY;ctx.save();ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.strokeStyle='rgba(70,70,70,.78)';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();ctx.beginPath();ctx.moveTo(left+4,yy+3);ctx.lineTo(right-4,yy+3);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1;ctx.stroke();ctx.restore();}
  function renderDebugTarget(current,pieces){if(!DEBUG_SHAPE)return;const target=current||((pieces&&pieces.length)?pieces[pieces.length-1]:null);if(target)updateDebugPanel(target);else if(debugEl)debugEl.textContent='輪郭解析: 待機中';}
  return {canvas,resize,clear,drawPiece,drawGround,renderDebugTarget,emitDrop,emitRotate,emitGameOver,updateEffects,renderEffects,get width(){return width},get height(){return height}};
})();
