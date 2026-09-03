/* v18.0 - automatic PNG alpha-mask shape analysis */
const Piece = (() => {
  const MAX_PIECE = 82;
  const ALPHA_THRESHOLD = 32;
  const BAND_H = 3;
  const MERGE_TOL = 2.5;
  const MAX_PARTS = 72;
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

  // Convert the displayed PNG into a compact set of convex rectangles.
  // Transparent pixels are ignored, so the physics shape follows the actual
  // visible silhouette instead of the full image rectangle.
  function analyzeShape(im, w, h){
    const cached=shapeCache.get(im);
    if(cached && cached.w===w && cached.h===h) return cached.rects;

    const canvas=document.createElement("canvas");
    const ctx=canvas.getContext("2d", {willReadFrequently:true});
    const pw=Math.max(1,Math.ceil(w));
    const ph=Math.max(1,Math.ceil(h));
    canvas.width=pw;
    canvas.height=ph;
    ctx.clearRect(0,0,pw,ph);
    ctx.drawImage(im,0,0,pw,ph);
    const data=ctx.getImageData(0,0,pw,ph).data;

    const rows=[];
    for(let y0=0;y0<ph;y0+=BAND_H){
      const y1=Math.min(ph,y0+BAND_H);
      const runs=[];
      let inRun=false;
      let start=0;
      for(let x=0;x<pw;x++){
        let solid=false;
        // Sample the centre and lower edge of each band. This makes the
        // generated shape robust to anti-aliased alpha boundaries.
        for(let y=y0;y<y1;y++){
          if(data[(y*pw+x)*4+3]>=ALPHA_THRESHOLD){solid=true;break;}
        }
        if(solid && !inRun){inRun=true;start=x;}
        if(!solid && inRun){
          if(x-start>=1) runs.push({x0:start,x1:x});
          inRun=false;
        }
      }
      if(inRun && pw-start>=1) runs.push({x0:start,x1:pw});
      rows.push({y0,y1,runs});
    }

    // Merge vertically adjacent runs whose horizontal boundaries are close.
    let rects=[];
    for(const row of rows){
      const used=new Set();
      const next=[];
      for(const run of row.runs){
        let best=-1;
        let bestScore=Infinity;
        for(let i=0;i<rects.length;i++){
          if(used.has(i)) continue;
          const r=rects[i];
          if(Math.abs(r.y1-row.y0)>0.01) continue;
          const left=Math.max(r.x0,run.x0);
          const right=Math.min(r.x1,run.x1);
          const overlap=Math.max(0,right-left);
          const edgeDelta=Math.abs(r.x0-run.x0)+Math.abs(r.x1-run.x1);
          if(overlap>0 && edgeDelta<=MERGE_TOL*2 && edgeDelta<bestScore){
            best=i; bestScore=edgeDelta;
          }
        }
        if(best>=0){
          const r=rects[best];
          r.x0=Math.min(r.x0,run.x0);
          r.x1=Math.max(r.x1,run.x1);
          r.y1=row.y1;
          used.add(best);
          next.push(r);
        }else{
          next.push({x0:run.x0,x1:run.x1,y0:row.y0,y1:row.y1});
        }
      }
      rects=rects.filter((_,i)=>used.has(i)).concat(next.filter(r=>!rects.includes(r)));
    }

    let shapes=rects.map(r=>({
      x:(r.x0+r.x1)/2-pw/2,
      y:(r.y0+r.y1)/2-ph/2,
      w:Math.max(1,r.x1-r.x0),
      h:Math.max(1,r.y1-r.y0)
    }));

    // If the silhouette is complex, merge neighbouring pieces until the
    // compound remains small enough for mobile Safari.
    while(shapes.length>MAX_PARTS){
      let best=0, bestCost=Infinity;
      for(let i=0;i<shapes.length-1;i++){
        const a=shapes[i], b=shapes[i+1];
        const cost=Math.abs((a.x+a.w/2)-(b.x+b.w/2)) + Math.abs((a.y+a.h/2)-(b.y+b.h/2));
        if(cost<bestCost){bestCost=cost;best=i;}
      }
      const a=shapes[best], b=shapes[best+1];
      const x0=Math.min(a.x-a.w/2,b.x-b.w/2);
      const x1=Math.max(a.x+a.w/2,b.x+b.w/2);
      const y0=Math.min(a.y-a.h/2,b.y-b.h/2);
      const y1=Math.max(a.y+a.h/2,b.y+b.h/2);
      shapes.splice(best,2,{x:(x0+x1)/2,y:(y0+y1)/2,w:x1-x0,h:y1-y0});
    }

    if(!shapes.length){
      shapes=[{x:0,y:0,w:w,h:h}];
    }

    shapeCache.set(im,{w,h,rects:shapes});
    return shapes;
  }

  async function preload(){
    const images=await Promise.all(paths.map(load));
    // Analyze all 21 images once at their actual in-game display size.
    for(const im of images){
      const s=size(im);
      analyzeShape(im,s.w,s.h);
    }
    return images;
  }

  function create(index, images, x, y){
    const im=images[index];
    const s=size(im);
    const rects=analyzeShape(im,s.w,s.h);
    const body=Physics.createPieceBody(x,y,s.w,s.h,rects);
    return {index,im,w:s.w,h:s.h,body,dropped:false};
  }

  return {paths,preload,create,MAX_PIECE};
})();
