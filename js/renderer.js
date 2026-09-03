/* Canvas renderer */
(function () {
  const Renderer = {
    canvas: null, ctx: null, dpr: 1, cameraY: 0,
    init(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.resize(); window.addEventListener('resize', () => this.resize()); },
    resize() { this.dpr = Math.min(window.devicePixelRatio || 1, 2); const r = this.canvas.getBoundingClientRect(); this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr); this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); },
    get width() { return this.canvas.getBoundingClientRect().width; },
    get height() { return this.canvas.getBoundingClientRect().height; },
    draw(game) {
      const ctx = this.ctx, w = this.width, h = this.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#eef3f7'; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(0, -this.cameraY);
      for (const p of game.pieces) this.drawPiece(p);
      if (game.current) this.drawPiece(game.current);
      ctx.restore();
      if (game.gameEnded) { ctx.fillStyle='rgba(255,255,255,.92)'; ctx.fillRect(0,h/2-45,w,90); ctx.fillStyle='#222'; ctx.textAlign='center'; ctx.font='bold 22px sans-serif'; ctx.fillText('GAME OVER',w/2,h/2-5); ctx.font='16px sans-serif'; ctx.fillText(`Score: ${game.score}`,w/2,h/2+25); }
    },
    drawPiece(p) {
      const body = p.body, img = p.image;
      const pos = body.position, a = body.angle;
      const pw = p.width, ph = p.height;
      this.ctx.save(); this.ctx.translate(pos.x, pos.y); this.ctx.rotate(a);
      this.ctx.drawImage(img, -pw/2, -ph/2, pw, ph);
      this.ctx.restore();
    }
  };
  window.Renderer = Renderer;
})();
