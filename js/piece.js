/* v1.31.0 - dynamic asset discovery; opaque-region collision geometry */
const Piece = (() => {
  const MAX_PIECE = 82;
  const ALPHA_THRESHOLD = 96;
  const MAX_DISCOVERY = 999;
  const paths = [];
  const shapeCache = new WeakMap();

  function load(src){
    return new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);
      im.onerror=()=>{
        const alt=src.endsWith('.png')?src.slice(0,-4)+'.PNG':src.slice(0,-4)+'.png';
        const retry=new Image();
        retry.onload=()=>resolve(retry);
        retry.onerror=()=>reject(new Error(`画像を読み込めません: ${src} / ${alt}`));
        retry.src=alt;
      };
      im.src=src;
    });
  }
  function loadOptional(number){
    const label=String(number).padStart(2,'0');
    return new Promise(resolve=>{
      const im=new Image();
      im.onload=()=>resolve({im,path:`assets/${label}.png`});
      im.onerror=()=>{
        const retry=new Image();
        retry.onload=()=>resolve({im:retry,path:`assets/${label}.PNG`});
        retry.onerror=()=>resolve(null);
        retry.src=`assets/${label}.PNG`;
      };
      im.src=`assets/${label}.png`;
    });
  }
  function size(im){
    const longest=Math.max(im.naturalWidth,im.naturalHeight);
    const scale=Math.min(1,MAX_PIECE/longest);
    return {w:Math.max(12,im.naturalWidth*scale),h:Math.max(12,im.naturalHeight*scale)};
  }
  function polygonArea(poly){let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p.x*q.y-q.x*p.y;}return a/2;}
  function simplifyCollinear(points){
    if(points.length<4)return points;
    const out=[];
    for(let i=0;i<points.length;i++){
      const a=points[(i-1+points.length)%points.length],b=points[i],c=points[(i+1)%points.length];
      const cr=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cr)>0.001)out.push(b);
    }
    return out;
  }
  function rdpOpen(points,epsilon){
    if(points.length<=2)return points.slice();
    let best=0,idx=-1;const a=points[0],b=points[points.length-1],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    for(let i=1;i<points.length-1;i++){
      const p=points[i];let t=den?((p.x-a.x)*dx+(p.y-a.y)*dy)/den:0;t=Math.max(0,Math.min(1,t));
      const q={x:a.x+t*dx,y:a.y+t*dy},d=Math.hypot(p.x-q.x,p.y-q.y);if(d>best){best=d;idx=i;}
    }
    if(best>epsilon){const l=rdpOpen(points.slice(0,idx+1),epsilon),r=rdpOpen(points.slice(idx),epsilon);return l.slice(0,-1).concat(r);}
    return [a,b];
  }
  function simplifyClosed(points,epsilon){
    if(points.length<=4)return points.slice();
    let start=0;for(let i=1;i<points.length;i++)if(points[i].y<points[start].y||(points[i].y===points[start].y&&points[i].x<points[start].x))start=i;
    const ordered=[];for(let i=0;i<points.length;i++)ordered.push(points[(start+i)%points.length]);ordered.push(ordered[0]);
    const out=rdpOpen(ordered,epsilon).slice(0,-1);return out.length>=3?out:points.slice();
  }
  function buildOpaqueRegions(alpha,pw,ph){
    const solid=new Uint8Array(pw*ph);for(let i=0;i<solid.length;i++)solid[i]=alpha[i*4+3]>=ALPHA_THRESHOLD?1:0;
    const active=new Map(),finished=[];
    const close=k=>{const r=active.get(k);if(r){finished.push(r);active.delete(k);}};
    for(let y=0;y<ph;y++){
      const runs=[];let x=0;
      while(x<pw){while(x<pw&&!solid[y*pw+x])x++;if(x>=pw)break;const x1=x;while(x<pw&&solid[y*pw+x])x++;runs.push({x1,x2:x});}
      const seen=new Set();
      for(const run of runs){const key=`${run.x1},${run.x2}`,prev=active.get(key);if(prev&&prev.y+prev.h===y)prev.h++;else{for(const k of Array.from(active.keys()))if(!seen.has(k))close(k);active.set(key,{x:run.x1,y,h:1,w:run.x2-run.x1});}seen.add(key);}
      for(const k of Array.from(active.keys()))if(!seen.has(k))close(k);
    }
    for(const k of Array.from(active.keys()))close(k);
    finished.sort((a,b)=>a.y-b.y||a.x-b.x||a.h-b.h);
    let changed=true;while(changed){changed=false;outer:for(let i=0;i<finished.length;i++)for(let j=i+1;j<finished.length;j++){const a=finished[i],b=finished[j];if(a.y===b.y&&a.h===b.h&&(a.x+a.w===b.x||b.x+b.w===a.x)){const x1=Math.min(a.x,b.x),x2=Math.max(a.x+a.w,b.x+b.w);finished[i]={x:x1,y:a.y,w:x2-x1,h:a.h};finished.splice(j,1);changed=true;break outer;}}}
    return finished.filter(r=>r.w>0&&r.h>0).map(r=>[{x:r.x-pw/2,y:r.y-ph/2},{x:r.x+r.w-pw/2,y:r.y-ph/2},{x:r.x+r.w-pw/2,y:r.y+r.h-ph/2},{x:r.x-pw/2,y:r.y+r.h-ph/2}]);
  }
  function extractContours(alpha,pw,ph){
    const solid=new Uint8Array(pw*ph);for(let i=0;i<solid.length;i++)solid[i]=alpha[i*4+3]>=ALPHA_THRESHOLD?1:0;
    const outgoing=new Map(),edges=[],key=(x,y)=>`${x},${y}`;
    const add=(x1,y1,x2,y2)=>{const e={a:{x:x1,y:y1},b:{x:x2,y:y2},used:false};edges.push(e);const k=key(x1,y1);if(!outgoing.has(k))outgoing.set(k,[]);outgoing.get(k).push(e);};
    for(let y=0;y<ph;y++)for(let x=0;x<pw;x++)if(solid[y*pw+x]){if(y===0||!solid[(y-1)*pw+x])add(x,y,x+1,y);if(x===pw-1||!solid[y*pw+x+1])add(x+1,y,x+1,y+1);if(y===ph-1||!solid[(y+1)*pw+x])add(x+1,y+1,x,y+1);if(x===0||!solid[y*pw+x-1])add(x,y+1,x,y);}
    function choose(cur,prev){const list=(outgoing.get(key(cur.x,cur.y))||[]).filter(e=>!e.used);if(!list.length)return null;if(!prev)return list[0];const dx=cur.x-prev.x,dy=cur.y-prev.y;let best=null,bs=Infinity;for(const e of list){const ex=e.b.x-cur.x,ey=e.b.y-cur.y;let turn=Math.atan2(ey,ex)-Math.atan2(dy,dx);while(turn<0)turn+=Math.PI*2;turn=(Math.PI*2-turn)%(Math.PI*2);if(turn<bs){bs=turn;best=e;}}return best;}
    const loops=[];
    for(const first of edges){if(first.used)continue;const start={...first.a},loop=[start];let prev=start,cur={...first.b};first.used=true;let closed=false,guard=0;while(guard++<edges.length+10){if(cur.x===start.x&&cur.y===start.y){closed=true;break;}loop.push(cur);const next=choose(cur,prev);if(!next)break;next.used=true;prev=cur;cur={...next.b};}if(closed&&loop.length>=4){let clean=simplifyCollinear(loop);if(clean.length>80)clean=simplifyClosed(clean,.85);if(clean.length>110)clean=simplifyClosed(clean,1.10);if(clean.length>140)clean=simplifyClosed(clean,1.35);if(clean.length>=3){const poly=clean.map(p=>({x:p.x-pw/2,y:p.y-ph/2})),a=polygonArea(poly);if(Math.abs(a)>.05)loops.push({poly,area:a});}}}
    const regions=buildOpaqueRegions(alpha,pw,ph);if(!loops.length)return {contour:[],debugContours:[],pointCount:0,holeCount:0,regions};
    loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));const outer=loops[0].poly,holes=loops.slice(1).filter(x=>x.area<0&&Math.abs(x.area)>=6).map(x=>x.poly);
    return {contour:outer,debugContours:[outer,...holes],pointCount:outer.length,holeCount:holes.length,regions};
  }
  function analyzeShape(im,w,h){
    const cached=shapeCache.get(im);if(cached&&Math.abs(cached.w-w)<.01&&Math.abs(cached.h-h)<.01)return cached;
    const pw=Math.max(1,Math.round(w)),ph=Math.max(1,Math.round(h)),canvas=document.createElement('canvas');canvas.width=pw;canvas.height=ph;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,pw,ph);ctx.drawImage(im,0,0,pw,ph);const extracted=extractContours(ctx.getImageData(0,0,pw,ph).data,pw,ph);
    const result={w,h,contour:extracted.contour,debugContours:extracted.debugContours,pointCount:extracted.pointCount,holeCount:extracted.holeCount,regions:extracted.regions};shapeCache.set(im,result);return result;
  }
  async function preload(){
    paths.length=0;const images=[];
    for(let n=1;n<=MAX_DISCOVERY;n++){
      const found=await loadOptional(n);if(!found)break;
      paths.push(found.path);images.push(found.im);
      const s=size(found.im);analyzeShape(found.im,s.w,s.h);
    }
    return images;
  }
  function create(index,images,x,y){const im=images[index],s=size(im),shape=analyzeShape(im,s.w,s.h);return {index,im,w:s.w,h:s.h,body:Physics.createPieceBody(x,y,s.w,s.h,shape),dropped:false};}
  return {paths,preload,create,MAX_PIECE};
})();
