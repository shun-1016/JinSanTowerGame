/* Piece model */
(function () {
  const MAX_PIECE = 82;
  const Piece = {
    MAX_PIECE,
    async load(id) {
      const src = `assets/${String(id).padStart(2, '0')}.png`;
      const image = new Image();
      image.src = src;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      return { id, image, src };
    },
    create(data, x, y) {
      const c = Physics.makeCollider(data.image, x, y, MAX_PIECE);
      c.body.plugin = c.body.plugin || {};
      c.body.plugin.pieceId = data.id;
      c.body.plugin.image = data.image;
      c.body.plugin.width = c.width;
      c.body.plugin.height = c.height;
      return { ...data, ...c, falling: false, fixed: false };
    }
  };
  window.Piece = Piece;
})();
