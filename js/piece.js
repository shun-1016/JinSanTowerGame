/* v22.1 - opaque-region collision geometry, stable contour cleanup, 37 piece assets, .png/.PNG support */
const Piece = (() => {
  const MAX_PIECE = 82;
  const ALPHA_THRESHOLD = 96;
  const PIECE_COUNT = 37;
  const paths = Array.from({length:PIECE_COUNT}, (_,i) => `assets/${String(i+1).padStart(2,"0")}.png`);
  const shapeCache = new WeakMap();

  function load(src){
    return new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);
      im.onerror=()=>{
        const alt=src.endsWith(".png")?src.slice(0,-4)+".PNG":src.slice(0,-4)+".png";
        const retry=new Image();
        retry.onload=()=>resolve(retry);
        retry.onerror=()=>reject(new Error(`画像を読み込めません: ${src} / ${alt}`));
        retry.src=alt;
      };
      im.src=src;
    });
  }

  function size(im){
    const longest=Math.max(im.naturalWidth,im.naturalHeight);
    const scale=Math.min(1,MAX_PIECE/longest);
    return {w:Math.max(12,im.naturalWidth*scale),h:Math.max(12,im.naturalHeight*scale)};
  }

  function polygonArea(poly){
    let a=0;
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length];
      a+=p.x*q.y-q.x*p.y;
    }
    return a/2;
  }

  function simplifyCollinear(points){
    if(points.length<4) return points;
    const out=[];
    for(let i=0;i<points.length;i++){
      const a=points[(i-1+points.length)%points.length];
      const b=points[i];
      const c=points[(i+1)%points.length];
      const cr=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cr)>0.001) out.push(b);
    }
    return out;
  }

  function rdpOpen(points,epsilon){
    if(points.length<=2) return points.slice();
    let best=0,idx=-1;
    const a=points[0],b=points[points.length-1];
    const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    for(let i=1;i<points.length-1;i++){
      const p=points[i];
      let t=den?((p.x-a.x)*dx+(p.y-a.y)*dy)/den:0;
      t=Math.max(0,Math.min(1,t));
      const q={x:a.x+t*dx,y:a.y+t*dy};
      const d=Math.hypot(p.x-q.x,p.y-q.y);
      if(d>best){best=d;idx=i;}
    }
    if(best>epsilon){
      const l=rdpOpen(points.slice(0,idx+1),epsilon);
      const r=rdpOpen(points.slice(idx),epsilon);
      return l.slice(0,-1).concat(r);
    }
    return [a,b];
  }

  function simplifyClosed(points,epsilon){
    if(points.length<=4) return points.slice();
    let start=0;
    for(let i=1;i<points.length;i++){
      if(points[i].y<points[start].y || (points[i].y===points[start].y && points[i].x<points[start].x)) start=i;
    }
    const ordered=[];
    for(let i=0;i<points.length;i++) ordered.push(points[(start+i)%points.length]);
    ordered.push(ordered[0]);
    const out=rdpOpen(ordered,epsilon).slice(0,-1);
    return out.length>=3?out:points.slice();
  }

  // Build collision regions directly from the alpha mask.
  // Each opaque run is vertically merged with the identical run above it.
  // Transparent areas therefore remain empty physical space. No hole is
  // bridged into the outer contour.
  function buildOpaqueRegions(alpha,pw,ph){
    const solid=new Uint8Array(pw*ph);
    for(let i=0;i<solid.length;i++) solid[i]=alpha[i*4+3]>=ALPHA_THRESHOLD?1:0;

    const active=new Map();
    const finished=[];

    function closeRect(key){
      const r=active.get(key);
      if(!r) return;
      finished.push(r);
      active.delete(key);
    }

    for(let y=0;y<ph;y++){
      const runs=[];
      let x=0;
      while(x<pw){
        while(x<pw&&!solid[y*pw+x]) x++;
        if(x>=pw) break;
        const x1=x;
        while(x<pw&&solid[y*pw+x]) x++;
        runs.push({x1,x2:x});
      }

      const seen=new Set();
      for(const run of runs){
        const key=`${run.x1},${run.x2}`;
        const prev=active.get(key);
        if(prev && prev.y+prev.h===y){
          prev.h++;
        }else{
          for(const k of Array.from(active.keys())) if(!seen.has(k)) closeRect(k);
          active.set(key,{x:run.x1,y,h:1,w:run.x2-run.x1});
        }
        seen.add(key);
      }
      for(const k of Array.from(active.keys())){
        if(!seen.has(k)) closeRect(k);
      }
    }
    for(const k of Array.from(active.keys())) closeRect(k);

    // Merge touching rectangles with the same vertical span. This reduces
    // Matter.js part count without changing the opaque coverage.
    finished.sort((a,b)=>a.y-b.y||a.x-b.x||a.h-b.h);
    let changed=true;
    while(changed){
      changed=false;
      outer:
      for(let i=0;i<finished.length;i++){
        const a=finished[i];
        for(let j=i+1;j<finished.length;j++){
          const b=finished[j];
          if(a.y===b.y && a.h===b.h &&
             (a.x+a.w===b.x || b.x+b.w===a.x)){
            const x1=Math.min(a.x,b.x),x2=Math.max(a.x+a.w,b.x+b.w);
            finished[i]={x:x1,y:a.y,w:x2-x1,h:a.h};
            finished.splice(j,1);
            changed=true;
            break outer;
          }
        }
      }
    }

    return finished.filter(r=>r.w>0&&r.h>0).map(r=>[
      {x:r.x-pw/2,y:r.y-ph/2},
      {x:r.x+r.w-pw/2,y:r.y-ph/2},
      {x:r.x+r.w-pw/2,y:r.y+r.h-ph/2},
      {x:r.x-pw/2,y:r.y+r.h-ph/2}
    ]);
  }

  function extractContours(alpha,pw,ph){
    const solid=new Uint8Array(pw*ph);
    for(let i=0;i<solid.length;i++) solid[i]=alpha[i*4+3]>=ALPHA_THRESHOLD?1:0;

    const outgoing=new Map();
    const edges=[];
    const key=(x,y)=>`${x},${y}`;
    const add=(x1,y1,x2,y2)=>{
      const e={a:{x:x1,y:y1},b:{x:x2,y:y2},used:false};
      edges.push(e);
      const k=key(x1,y1);
      let list=outgoing.get(k);
      if(!list){list=[];outgoing.set(k,list);}
      list.push(e);
    };
    for(let y=0;y<ph;y++) for(let x=0;x<pw;x++){
      if(!solid[y*pw+x]) continue;
      if(y===0||!solid[(y-1)*pw+x]) add(x,y,x+1,y);
      if(x===pw-1||!solid[y*pw+x+1]) add(x+1,y,x+1,y+1);
      if(y===ph-1||!solid[(y+1)*pw+x]) add(x+1,y+1,x,y+1);
      if(x===0||!solid[y*pw+x-1]) add(x,y+1,x,y);
    }

    function chooseNext(cur,prev){
      const list=outgoing.get(key(cur.x,cur.y))||[];
      const candidates=list.filter(e=>!e.used);
      if(!candidates.length) return null;
      if(!prev) return candidates[0];
      const dx=cur.x-prev.x,dy=cur.y-prev.y;
      let best=null,bestScore=Infinity;
      for(const e of candidates){
        const ex=e.b.x-cur.x,ey=e.b.y-cur.y;
        let turn=Math.atan2(ey,ex)-Math.atan2(dy,dx);
        while(turn<0) turn+=Math.PI*2;
        turn=(Math.PI*2-turn)%(Math.PI*2);
        if(turn<bestScore){bestScore=turn;best=e;}
      }
      return best;
    }

    const loops=[];
    for(const first of edges){
      if(first.used) continue;
      const start={x:first.a.x,y:first.a.y};
      const loop=[start];
      let prev=start,cur={x:first.b.x,y:first.b.y};
      first.used=true;
      let closed=false,guard=0;
      while(guard++<edges.length+10){
        if(cur.x===start.x&&cur.y===start.y){closed=true;break;}
        loop.push(cur);
        const next=chooseNext(cur,prev);
        if(!next) break;
        next.used=true;
        prev=cur;
        cur={x:next.b.x,y:next.b.y};
      }
      if(closed&&loop.length>=4){
        let clean=simplifyCollinear(loop);
        if(clean.length>80) clean=simplifyClosed(clean,0.85);
        if(clean.length>110) clean=simplifyClosed(clean,1.10);
        if(clean.length>140) clean=simplifyClosed(clean,1.35);
        if(clean.length>=3){
          const normalized=clean.map(p=>({x:p.x-pw/2,y:p.y-ph/2}));
          const a=polygonArea(normalized);
          if(Math.abs(a)>0.05) loops.push({poly:normalized,area:a});
        }
      }
    }

    const regions=buildOpaqueRegions(alpha,pw,ph);
    if(!loops.length) return {
      contour:[],
      debugContours:[],
      pointCount:0,
      holeCount:0,
      regions
    };

    loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));
    const outer=loops[0].poly;
    const holes=loops.slice(1)
      .filter(x=>x.area<0 && Math.abs(x.area)>=6)
      .map(x=>x.poly);

    return {
      contour:outer,
      debugContours:[outer,...holes],
      pointCount:outer.length,
      holeCount:holes.length,
      regions
    };
  }

  function analyzeShape(im,w,h){
    const cached=shapeCache.get(im);
    if(cached&&Math.abs(cached.w-w)<0.01&&Math.abs(cached.h-h)<0.01) return cached;
    const pw=Math.max(1,Math.round(w)),ph=Math.max(1,Math.round(h));
    const canvas=document.createElement('canvas');
    canvas.width=pw;canvas.height=ph;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,pw,ph);
    ctx.drawImage(im,0,0,pw,ph);
    const data=ctx.getImageData(0,0,pw,ph).data;
    const extracted=extractContours(data,pw,ph);
    const result={w,h,contour:extracted.contour,debugContours:extracted.debugContours,pointCount:extracted.pointCount,holeCount:extracted.holeCount,regions:extracted.regions};
    shapeCache.set(im,result);
    return result;
  }

  async function preload(){
    const images=await Promise.all(paths.map(load));
    for(const im of images){const s=size(im);analyzeShape(im,s.w,s.h);}
    return images;
  }

  function create(index,images,x,y){
    const im=images[index],s=size(im),shape=analyzeShape(im,s.w,s.h);
    const body=Physics.createPieceBody(x,y,s.w,s.h,shape);
    return {index,im,w:s.w,h:s.h,body,dropped:false};
  }

  return {paths,preload,create,MAX_PIECE};
})();
