/* v22.0 - hole-aware contour cleanup, stable geometry, 37 piece assets, .png/.PNG support */
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

  function pointInPolygon(p,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if(((a.y>p.y)!=(b.y>p.y)) &&
         p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    return inside;
  }

  function onSegment(p,a,b){
    return Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))<1e-7 &&
      p.x>=Math.min(a.x,b.x)-1e-7 && p.x<=Math.max(a.x,b.x)+1e-7 &&
      p.y>=Math.min(a.y,b.y)-1e-7 && p.y<=Math.max(a.y,b.y)+1e-7;
  }

  function segmentsIntersect(a,b,c,d){
    const c1=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const c2=(b.x-a.x)*(d.y-a.y)-(b.y-a.y)*(d.x-a.x);
    const c3=(d.x-c.x)*(a.y-c.y)-(d.y-c.y)*(a.x-c.x);
    const c4=(d.x-c.x)*(b.y-c.y)-(d.y-c.y)*(b.x-c.x);
    const crossOpp=(c1>1e-7&&c2<-1e-7 || c1<-1e-7&&c2>1e-7) &&
      (c3>1e-7&&c4<-1e-7 || c3<-1e-7&&c4>1e-7);
    if(crossOpp) return true;
    return onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d);
  }

  function bridgeHole(outer,hole,otherHoles){
    // Pick the rightmost hole vertex.  Connecting it to a visible outer
    // vertex converts the polygon-with-hole into a simple polygon that the
    // existing ear-clipping triangulator can handle without filling the hole.
    let hi=0;
    for(let i=1;i<hole.length;i++){
      if(hole[i].x>hole[hi].x || (hole[i].x===hole[hi].x&&hole[i].y<hole[hi].y)) hi=i;
    }
    const h=hole[hi];
    const candidates=outer.map((v,i)=>({v,i,d:(v.x-h.x)*(v.x-h.x)+(v.y-h.y)*(v.y-h.y)}))
      .filter(c=>c.v.x>=h.x-1e-7)
      .sort((a,b)=>a.d-b.d);

    for(const c of candidates){
      const v=c.v;
      const mid={x:(h.x+v.x)/2,y:(h.y+v.y)/2};
      if(!pointInPolygon(mid,outer)) continue;

      let bad=false;
      for(let i=0;i<outer.length;i++){
        const a=outer[i],b=outer[(i+1)%outer.length];
        if(i===c.i || (i+1)%outer.length===c.i) continue;
        if(segmentsIntersect(h,v,a,b)){bad=true;break;}
      }
      if(bad) continue;

      for(const oh of [hole,...otherHoles]){
        for(let i=0;i<oh.length;i++){
          const a=oh[i],b=oh[(i+1)%oh.length];
          if(oh===hole && (i===hi || (i+1)%oh.length===hi)) continue;
          if(segmentsIntersect(h,v,a,b)){bad=true;break;}
        }
        if(bad) break;
      }
      if(bad) continue;

      const merged=[];
      for(let i=0;i<=c.i;i++) merged.push(outer[i]);
      merged.push(h);
      for(let k=1;k<hole.length;k++) merged.push(hole[(hi+k)%hole.length]);
      merged.push(h);
      merged.push(v);
      for(let i=c.i+1;i<outer.length;i++) merged.push(outer[i]);
      return merged;
    }
    return null;
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

    if(!loops.length) return {contour:[],debugContours:[],pointCount:0,holeCount:0};
    loops.sort((a,b)=>Math.abs(b.area)-Math.abs(a.area));

    const outer=loops[0].poly;
    const holes=loops.slice(1).filter(x=>x.area<0 && Math.abs(x.area)>=6).map(x=>x.poly);
    let merged=outer.slice();
    const remaining=holes.slice().sort((a,b)=>{
      const ax=Math.max(...a.map(p=>p.x)),bx=Math.max(...b.map(p=>p.x));
      return bx-ax;
    });
    let bridgeFailed=false;
    while(remaining.length){
      const hole=remaining.shift();
      const bridged=bridgeHole(merged,hole,remaining);
      if(bridged) merged=bridged;
      else bridgeFailed=true;
    }

    return {
      contour:merged,
      debugContours:[outer,...holes],
      pointCount:merged.length,
      holeCount:holes.length,
      bridgeFailed
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
    const result={w,h,contour:extracted.contour,debugContours:extracted.debugContours,pointCount:extracted.pointCount,holeCount:extracted.holeCount,bridgeFailed:extracted.bridgeFailed};
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
