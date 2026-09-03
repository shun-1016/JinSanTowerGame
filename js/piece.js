/* v17.4 piece model */
const Piece = (() => {
  const MAX_PIECE = 82;
  const assets = Array.from({length:21}, (_,i) => `assets/${String(i+1).padStart(2,"0")}.png`);

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
  }

  function fitSize(im) {
    const scale = Math.min(1, MAX_PIECE / Math.max(im.naturalWidth, im.naturalHeight));
    return {w: Math.max(12, im.naturalWidth * scale), h: Math.max(12, im.naturalHeight * scale)};
  }

  async function create(index, x, y) {
    const im = await loadImage(assets[index]);
    const size = fitSize(im);
    const body = Physics.makeBody(x, y, size.w, size.h, null);
    const p = {index, im, w:size.w, h:size.h, body, dropped:false};
    Physics.hold(body, x, y);
    return p;
  }
  return {assets,create,MAX_PIECE};
})();
