/* v21.8.3 - higher-fidelity contours, 36 piece assets, .png/.PNG support */
const Piece = (() => {
  const MAX_PIECE = 82;
  const ALPHA_THRESHOLD = 32;
  const PIECE_COUNT = 36;
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

  function extractOuterContour(alpha,pw,ph){
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
        if(clean.length>140) clean=simplifyClosed(clean,0.30);
        if(clean.length>=3){
          const normalized=clean.map(p=>({x:p.x-pw/2,y:p.y-ph/2}));
          if(Math.abs(polygonArea(normalized))>0.05) loops.push(normalized);
        }
      }
    }
    if(!loops.length) return [];
    loops.sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));
    return loops[0];
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
    const contour=extractOuterContour(data,pw,ph);
    const result={w,h,contour,debugContours:contour?[contour]:[],pointCount:contour?contour.length:0};
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
