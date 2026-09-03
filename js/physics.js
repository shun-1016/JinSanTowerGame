/* Matter.js physics layer */
(function () {
  const { Engine, World, Bodies, Body, Composite } = Matter;

  const Physics = {
    engine: null,
    world: null,
    ground: null,
    width: 0,
    height: 0,

    init(width, height) {
      this.width = width;
      this.height = height;
      this.engine = Engine.create({ enableSleeping: true });
      this.world = this.engine.world;
      this.engine.gravity.y = 1;
      this.engine.gravity.x = 0;
      this.engine.positionIterations = 8;
      this.engine.velocityIterations = 6;
      this.engine.constraintIterations = 2;
      this.engine.timing.timeScale = 1;
      this.createGround(width, height);
    },

    createGround(width, height) {
      if (this.ground) World.remove(this.world, this.ground);
      this.ground = Bodies.rectangle(width / 2, height + 18, width * 2, 36, {
        isStatic: true,
        friction: 1.0,
        restitution: 0,
        label: 'ground'
      });
      World.add(this.world, this.ground);
    },

    resize(width, height) {
      this.width = width;
      this.height = height;
      if (!this.engine) return;
      Body.setPosition(this.ground, { x: width / 2, y: height + 18 });
      Body.setVertices(this.ground, Bodies.rectangle(width / 2, height + 18, width * 2, 36).vertices);
    },

    add(body) { World.add(this.world, body); },
    remove(body) { World.remove(this.world, body); },
    update(ms) { Engine.update(this.engine, ms); },

    makeCollider(image, x, y, maxSize) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = w; canvas.height = h;
      ctx.drawImage(image, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const alpha = 55;
      const bandH = 4;
      const rects = [];

      for (let y0 = 0; y0 < h; y0 += bandH) {
        const bh = Math.min(bandH, h - y0);
        let runStart = -1;
        for (let x0 = 0; x0 <= w; x0++) {
          let solid = false;
          if (x0 < w) {
            outer: for (let yy = y0; yy < y0 + bh; yy++) {
              if (data[(yy * w + x0) * 4 + 3] >= alpha) { solid = true; break outer; }
            }
          }
          if (solid && runStart < 0) runStart = x0;
          if (!solid && runStart >= 0) {
            if (x0 - runStart >= 2) {
              rects.push({ x: (runStart + x0) / 2 - w / 2, y: y0 + bh / 2 - h / 2, w: x0 - runStart, h: bh });
            }
            runStart = -1;
          }
        }
      }

      // Keep the collider manageable while retaining the silhouette.
      let parts = rects;
      if (parts.length > 48) {
        const step = parts.length / 48;
        const reduced = [];
        for (let i = 0; i < 48; i++) reduced.push(parts[Math.min(parts.length - 1, Math.floor(i * step))]);
        parts = reduced;
      }
      if (!parts.length) parts = [{ x: 0, y: 0, w: w, h: h }];

      const bodies = parts.map(p => Bodies.rectangle(x + p.x, y + p.y, p.w, p.h, {
        friction: 0.85,
        frictionStatic: 0.9,
        restitution: 0.02,
        density: 0.0015,
        chamfer: { radius: 0 }
      }));
      const body = Body.create({
        parts: bodies,
        position: { x, y },
        friction: 0.85,
        frictionStatic: 0.9,
        restitution: 0.02,
        density: 0.0015,
        sleepThreshold: 45,
        label: 'piece'
      });
      return { body, width: w, height: h, canvas };
    }
  };

  window.Physics = Physics;
})();
