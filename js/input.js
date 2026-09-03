/* Input layer */
(function () {
  const Input = {
    game: null, dragging: false, lastX: 0, lastY: 0,
    init(game) {
      this.game = game;
      const c = Renderer.canvas;
      c.addEventListener('pointerdown', e => this.down(e));
      window.addEventListener('pointermove', e => this.move(e));
      window.addEventListener('pointerup', e => this.up(e));
      document.getElementById('rotateLeft').addEventListener('click', () => game.rotate(-1));
      document.getElementById('rotateRight').addEventListener('click', () => game.rotate(1));
      document.getElementById('drop').addEventListener('click', () => game.drop());
    },
    point(e) { const r = Renderer.canvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top+Renderer.cameraY }; },
    down(e) {
      const g=this.game, p=g.current; if(!p || p.falling || g.gameEnded) return;
      const q=this.point(e); const b=p.body;
      if (q.x >= b.bounds.min.x && q.x <= b.bounds.max.x && q.y >= b.bounds.min.y && q.y <= b.bounds.max.y) {
        this.dragging=true; this.lastX=q.x; this.lastY=q.y; e.preventDefault();
      }
    },
    move(e) {
      if(!this.dragging) return; const g=this.game, p=g.current; if(!p || p.falling) return;
      const q=this.point(e), dx=q.x-this.lastX, dy=q.y-this.lastY;
      Matter.Body.translate(p.body,{x:dx,y:dy}); Matter.Body.setVelocity(p.body,{x:0,y:0}); Matter.Body.setAngularVelocity(p.body,0);
      this.lastX=q.x; this.lastY=q.y; e.preventDefault();
    },
    up(){ if(this.dragging){this.dragging=false;} }
  };
  window.Input = Input;
})();
