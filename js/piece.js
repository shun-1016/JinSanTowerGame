/* v18.1 - automatic PNG alpha-contour analysis */
const Piece = (() => {
  const MAX_PIECE = 82;
  const ALPHA_THRESHOLD = 32;
  const paths = Array.from({length:21}, (_,i) => `assets/${String(i+1).padStart(2,"0")}.png`);
  const shapeCache = new WeakMap();

  function load(src){
    return new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);
      im.onerror=()=>reject(new Error(`画像を読み込めません: ${src}`));
      im.src=src;
    });
  }

  function size(im){
    const longest=Math.max(im.naturalWidth,im.naturalHeight);
    const scale=Math.min(1,MAX_PIECE/longest);
    return {
      w:Math.max(12,im.naturalWidth*scale),
      h:Math.max(12,im.naturalHeight*scale)
    };
  }

  function simplifyCollinear(points){
    if(points.length<4) return points;
    const out=[];
    for(let i=0;i<points.length;i++){
      const a=points[(i-1+points.length)%points.length];
      const b=points[i];
      const c=points[(i+1)%points.length];
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if(Math.abs(cross)>0.001 || (Math.abs(b.x-a.x)+Math.abs(b.y-a.y))<0.5) out.push(b);
    }
    return out;
  }

  function rdp(points,epsilon){
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
      const l=rdp(points.slice(0,idx+1),epsilon);
      const r=rdp(points.slice(idx),epsilon);
      return l.slice(0,-1).concat(r);
    }
    return [a,b];
  }

  // Build the silhouette directly from the alpha mask. The result is a set
  // of boundary loops in image-local coordinates. Physics uses the same
  // loops after triangulation, so there is no per-image configuration.
  function extractContours(alpha,pw,ph){
    const solid=new Uint8Array(pw*ph);
    for(let i=0;i<solid.length;i++) solid[i]=alpha[i*4+3]>=ALPHA_THRESHOLD?1:0;

    const edges=new Map();
    const key=(x,y)=>`${x},${y}`;
    const add=(x1,y1,x2,y2)=>{
      const k=key(x1,y1);
      if(!edges.has(k)) edges.set(k,[]);
      edges.get(k).push({x:x2,y:y2});
    };
    for(let y=0;y<ph;y++) for(let x=0;x<pw;x++){
      if(!solid[y*pw+x]) continue;
      const top=y===0||!solid[(y-1)*pw+x];
      const right=x===pw-1||!solid[y*pw+x+1];
      const bottom=y===ph-1||!solid[(y+1)*pw+x];
      const left=x===0||!solid[y*pw+x-1];
      if(top) add(x,y,x+1,y);
      if(right) add(x+1,y,x+1,y+1);
      if(bottom) add(x+1,y+1,x,y+1);
      if(left) add(x,y+1,x,y);
    }

    const loops=[];
    const takeNext=(from)=>{
      const list=edges.get(key(from.x,from.y));
      if(!list||!list.length) return null;
      return list.pop();
    };
    for(const [k,list] of Array.from(edges.entries())){
      while(list.length){
        const [sx,sy]=k.split(',').map(Number);
        const start={x:sx,y:sy};
        const loop=[start];
        let cur=start, guard=0;
        while(guard++<pw*ph*4){
          const n=takeNext(cur);
          if(!n) break;
          cur=n;
          if(cur.x===start.x&&cur.y===start.y) break;
          loop.push(cur);
        }
        if(loop.length>=4 && cur.x===start.x&&cur.y===start.y){
          let clean=simplifyCollinear(loop);
          if(clean.length>80){
            const closed=clean.concat([clean[0]]);
            clean=rdp(closed,0.7).slice(0,-1);
          }
          if(clean.length>=3){
            loops.push(clean.map(p=>({x:p.x-pw/2,y:p.y-ph/2})));
          }
        }
      }
    }
    loops.sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));
    return loops;
  }

  function polygonArea(poly){
    let a=0;
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length];
      a+=p.x*q.y-q.x*p.y;
    }
    return a/2;
  }

  function analyzeShape(im,w,h){
    const cached=shapeCache.get(im);
    if(cached && cached.w===w && cached.h===h) return cached;
    const pw=Math.max(1,Math.round(w));
    const ph=Math.max(1,Math.round(h));
    const canvas=document.createElement('canvas');
    canvas.width=pw; canvas.height=ph;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,pw,ph);
    ctx.drawImage(im,0,0,pw,ph);
    const imageData=ctx.getImageData(0,0,pw,ph);
    const contours=extractContours(imageData.data,pw,ph);

    // Keep the largest outer silhouette. Smaller contours are retained as
    // additional components only when they are substantial, avoiding tiny
    // anti-aliasing islands while preserving disconnected visible parts.
    const ranked=contours.map(c=>({c,area:Math.abs(polygonArea(c))})).filter(x=>x.area>=3);
    const largest=ranked.length?ranked[0].area:0;
    const selected=ranked.filter(x=>x.area>=Math.max(3,largest*0.015)).map(x=>x.c);
    const result={w,h,contours:selected,debugContours:selected};
    shapeCache.set(im,result);
    return result;
  }

  async function preload(){
    const images=await Promise.all(paths.map(load));
    // Analyze every image once at its actual in-game display size.
    for(const im of images){
      const s=size(im);
      analyzeShape(im,s.w,s.h);
    }
    return images;
  }

  function create(index,images,x,y){
    const im=images[index];
    const s=size(im);
    const shape=analyzeShape(im,s.w,s.h);
    const body=Physics.createPieceBody(x,y,s.w,s.h,shape);
    return {index,im,w:s.w,h:s.h,body,dropped:false};
  }

  return {paths,preload,create,MAX_PIECE};
})();
