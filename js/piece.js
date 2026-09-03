/* v17.7 - piece model */
const Piece = (() => {
  const MAX_PIECE = 82;
  const paths = Array.from({length:21}, (_,i) => `assets/${String(i+1).padStart(2,"0")}.png`);

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

  async function preload(){
    return Promise.all(paths.map(load));
  }

  function create(index, images, x, y){
    const im=images[index];
    const s=size(im);
    const body=Physics.createPieceBody(x,y,s.w,s.h);
    return {index,im,w:s.w,h:s.h,body,dropped:false};
  }

  return {paths,preload,create,MAX_PIECE};
})();
