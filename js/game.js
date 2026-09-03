/* Game rules - Matter.js v17.1 */
(function () {
  const { Body } = Matter;
  const Game = {
    pieces: [], current: null, queue: [], score: 0, gameEnded: false, cameraY: 0,

    async init() {
      this.pieces = []; this.queue = []; this.score = 0; this.gameEnded = false; this.cameraY = 0;
      for (let i = 1; i <= 21; i++) this.queue.push(await Piece.load(i));
      this.spawn();
    },

    spawn() {
      if (!this.queue.length) { this.gameEnded = true; return; }
      const data = this.queue.shift();
      const x = Renderer.width / 2;
      const y = this.cameraY + 70;
      this.current = Piece.create(data, x, y);
      Body.setStatic(this.current.body, true);
      Body.setSleeping(this.current.body, false);
      this.current.falling = false;
      Physics.add(this.current.body);
      this.updateCamera();
    },

    rotate(dir) {
      const p = this.current;
      if (!p || p.falling || this.gameEnded) return;
      Body.rotate(p.body, dir * Math.PI / 12);
      Body.setSleeping(p.body, false);
    },

    drop() {
      const p = this.current;
      if (!p || p.falling || this.gameEnded) return;

      // Explicitly wake the body after changing it from static to dynamic.
      // This is the critical fix for v17: a preview body must not remain asleep.
      Body.setStatic(p.body, false);
      Body.setSleeping(p.body, false);
      Body.setVelocity(p.body, { x: 0, y: 2 });
      Body.setAngularVelocity(p.body, 0);
      p.falling = true;
    },

    update() {
      if (this.current && this.current.falling) {
        const b = this.current.body;
        if (b.isSleeping) this.fixCurrent();

        // Horizontal play area. Only clamp when the body actually exceeds it.
        if (this.current) {
          const half = this.current.width / 2;
          if (b.position.x < half) Body.setPosition(b, { x: half, y: b.position.y });
          if (b.position.x > Renderer.width - half) Body.setPosition(b, { x: Renderer.width - half, y: b.position.y });
        }
      }
      this.updateCamera();
    },

    fixCurrent() {
      const p = this.current;
      if (!p) return;
      Body.setSleeping(p.body, true);
      p.fixed = true; p.falling = false;
      this.pieces.push(p); this.current = null; this.score++;
      document.getElementById('score').textContent = `Score: ${this.score}`;
      if (this.queue.length) this.spawn(); else this.gameEnded = true;
    },

    updateCamera() {
      const all = this.pieces.concat(this.current ? [this.current] : []);
      if (!all.length) { this.cameraY = 0; Renderer.cameraY = 0; return; }
      let top = Infinity;
      for (const p of all) top = Math.min(top, p.body.bounds.min.y);
      const target = Math.max(100, Renderer.height * 0.25);
      const desired = Math.max(0, target - top);
      this.cameraY += (desired - this.cameraY) * 0.08;
      Renderer.cameraY = this.cameraY;
    }
  };
  window.Game = Game;
})();
