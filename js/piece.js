/* v18.0 - automatic PNG alpha-mask shape analysis */
const Piece = (() => {
  const MAX_PIECE = 82;
  const ALPHA_THRESHOLD = 32;
  const BAND_H = 4;
  const MERGE_TOL = 2.5;
  const MAX_PARTS = 48;
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

  function analyzeShape(im,w,h){
    const cached=shapeCache.get(im);
    if(cached && cached.w===w && cached.h===h) return cached.rects;

    const pw=Math.max(1,Math.round(w));
    const ph=Math.max(1,Math.round(h));
    const canvas=document.createElement("canvas");
    canvas.width=pw;
    canvas.height=ph;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.clearRect(0,0,pw,ph);
    ctx.drawImage(im,0,0,pw,ph);
    const alpha=ctx.getImageData(0,0,pw,ph).data;

    // 1) Convert the alpha mask into horizontal runs.
    const bands=[];
    for(let y0=0;y0<ph;y0+=BAND_H){
      const y1=Math.min(ph,y0+BAND_H);
      const runs=[];
      let start=-1;
      for(let x=0;x<pw;x++){
        let solid=false;
        for(let y=y0;y<y1;y++){
          if(alpha[(y*pw+x)*4+3]>=ALPHA_THRESHOLD){
            solid=true;
            break;
          }
        }
        if(solid && start<0) start=x;
        if(!solid && start>=0){
          runs.push({x0:start,x1:x});
          start=-1;
        }
      }
      if(start>=0) runs.push({x0:start,x1:pw});
      bands.push({y0,y1,runs});
    }

    // 2) Merge a run with the closest overlapping run in the previous band.
    //    Unlike a simple array splice, this preserves every disconnected
    //    component of the silhouette.
    let active=[];
    const rects=[];
    for(const band of bands){
      const next=[];
      const used=new Set();
      for(const run of band.runs){
        let best=-1;
        let bestScore=Infinity;
        for(let i=0;i<active.length;i++){
          if(used.has(i)) continue;
          const a=active[i];
          const overlap=Math.min(a.x1,run.x1)-Math.max(a.x0,run.x0);
          if(overlap<=0) continue;
          const edgeDelta=Math.abs(a.x0-run.x0)+Math.abs(a.x1-run.x1);
          if(edgeDelta<=MERGE_TOL*2 && edgeDelta<bestScore){
            best=i;
            bestScore=edgeDelta;
          }
        }
        if(best>=0){
          const a=active[best];
          a.x0=Math.min(a.x0,run.x0);
          a.x1=Math.max(a.x1,run.x1);
          a.y1=band.y1;
          used.add(best);
          next.push(a);
        }else{
          next.push({x0:run.x0,x1:run.x1,y0:band.y0,y1:band.y1});
        }
      }
      for(let i=0;i<active.length;i++){
        if(!used.has(i)) rects.push(active[i]);
      }
      active=next;
    }
    rects.push(...active);

    let shapes=rects
      .filter(r=>r.x1-r.x0>0 && r.y1-r.y0>0)
      .map(r=>({
        x:(r.x0+r.x1)/2-pw/2,
        y:(r.y0+r.y1)/2-ph/2,
        w:Math.max(1,r.x1-r.x0),
        h:Math.max(1,r.y1-r.y0)
      }));

    // 3) Keep the compound body small enough for mobile Safari. Merge the
    //    closest pair by bounding box. This is a fallback only for unusually
    //    fragmented masks; normal pieces remain close to their silhouette.
    while(shapes.length>MAX_PARTS){
      let ai=0,bi=1,best=Infinity;
      for(let i=0;i<shapes.length;i++){
        for(let j=i+1;j<shapes.length;j++){
          const a=shapes[i],b=shapes[j];
          const ax0=a.x-a.w/2, ax1=a.x+a.w/2;
          const ay0=a.y-a.h/2, ay1=a.y+a.h/2;
          const bx0=b.x-b.w/2, bx1=b.x+b.w/2;
          const by0=b.y-b.h/2, by1=b.y+b.h/2;
          const gapX=Math.max(0,bx0-ax1,ax0-bx1);
          const gapY=Math.max(0,by0-ay1,ay0-by1);
          const cost=gapX+gapY;
          if(cost<best){best=cost;ai=i;bi=j;}
        }
      }
      const a=shapes[ai],b=shapes[bi];
      const x0=Math.min(a.x-a.w/2,b.x-b.w/2);
      const x1=Math.max(a.x+a.w/2,b.x+b.w/2);
      const y0=Math.min(a.y-a.h/2,b.y-b.h/2);
      const y1=Math.max(a.y+a.h/2,b.y+b.h/2);
      const merged={x:(x0+x1)/2,y:(y0+y1)/2,w:x1-x0,h:y1-y0};
      shapes.splice(bi,1);
      shapes.splice(ai,1,merged);
    }

    if(!shapes.length) shapes=[{x:0,y:0,w:w,h:h}];
    shapeCache.set(im,{w,h,rects:shapes});
    return shapes;
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
    const rects=analyzeShape(im,s.w,s.h);
    const body=Physics.createPieceBody(x,y,s.w,s.h,rects);
    return {index,im,w:s.w,h:s.h,body,dropped:false};
  }

  return {paths,preload,create,MAX_PIECE};
})();
