/* Matter.js physics layer - v17.1 */
(function () {
  const { Engine, World, Bodies, Body } = Matter;

  const Physics = {
    engine: null, world: null, ground: null, width: 0, height: 0,

    init(width, height) {
      this.width = width; this.height = height;
      this.engine = Engine.create({ enableSleeping: true });
      this.world = this.engine.world;
      this.engine.gravity.x = 0;
      this.engine.gravity.y = 1;
      this.engine.positionIterations = 10;
      this.engine.velocityIterations = 8;
      this.engine.constraintIterations = 2;
      this.createGround(width, height);
    },

    createGround(width, height) {
      if (this.ground) World.remove(this.world, this.ground);
      this.ground = Bodies.rectangle(width / 2, height + 18, width * 2, 36, {
        isStatic: true, friction: 0.9, restitution: 0, label: 'ground'
      });
      World.add(this.world, this.ground);
    },

    resize(width, height) {
      this.width = width; this.height = height;
      if (!this.ground) return;
      Body.setPosition(this.ground, { x: width / 2, y: height + 18 });
    },

    add(body) { World.add(this.world, body); },
    remove(body) { World.remove(this.world, body); },

    update(ms) {
      if (this.engine) Engine.update(this.engine, Math.max(0, ms));
    },

    makeCollider(image, x, y, maxSize) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = w; canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0, w, h);

      const data = ctx.getImageData(0, 0, w, h).data;
      const alpha = 55, bandH = 4, rects = [];

      for (let y0 = 0; y0 < h; y0 += bandH) {
        const bh = Math.min(bandH, h - y0);
        let start = -1;
        for (let x0 = 0; x0 <= w; x0++) {
          let solid = false;
          if (x0 < w) {
            for (let yy = y0; yy < y0 + bh; yy++) {
              if (data[(yy * w + x0) * 4 + 3] >= alpha) { solid = true; break; }
            }
          }
          if (solid && start < 0) start = x0;
          if (!solid && start >= 0) {
            if (x0 - start >= 2) rects.push({
              x: (start + x0) / 2 - w / 2,
              y: y0 + bh / 2 - h / 2,
              w: x0 - start, h: bh
            });
            start = -1;
          }
        }
      }

      // Keep the most useful silhouette bands. Unlike the old implementation,
      // never replace the compound body with disconnected random rectangles.
      let parts = rects;
      if (!parts.length) parts = [{ x: 0, y: 0, w, h }];
      if (parts.length > 60) {
        // Merge neighboring rectangles with nearly identical x/width.
        const merged = [];
        for (const r of parts) {
          const prev = merged[merged.length - 1];
          if (prev && Math.abs(prev.x - r.x) <= 2 && Math.abs(prev.w - r.w) <= 2) {
            const bottom = Math.max(prev.y + prev.h / 2, r.y + r.h / 2);
            prev.h = bottom - (prev.y - prev.h / 2);
            prev.y = (prev.y - prev.h / 2 + bottom) / 2;
          } else merged.push({ ...r });
        }
        parts = merged;
      }
      if (parts.length > 80) parts = parts.filter((_, i) => i % Math.ceil(parts.length / 80) === 0);

      const opts = {
        friction: 0.82,
        frictionStatic: 0.9,
        restitution: 0.01,
        density: 0.0015,
        label: 'piece-part',
        chamfer: { radius: 0 }
      };

      // IMPORTANT: create a real parent body first, then attach the silhouette
      // parts with Body.setParts. This keeps the compound body's position and
      // wake/static state reliable when switching from preview to falling.
      const body = Bodies.rectangle(x, y, w, h, opts);
      const childParts = parts.map(r => Bodies.rectangle(x + r.x, y + r.y, r.w, r.h, opts));
      Body.setParts(body, [body, ...childParts], true);
      Body.setPosition(body, { x, y });
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      body.friction = 0.82;
      body.frictionStatic = 0.9;
      body.restitution = 0.01;
      body.label = 'piece';
      body.plugin = body.plugin || {};
      body.plugin.imageWidth = w;
      body.plugin.imageHeight = h;
      return { body, width: w, height: h, canvas };
    }
  };

  window.Physics = Physics;
})();
