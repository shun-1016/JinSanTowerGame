/* v23.8 - landing collision diagnostics only. No physics modification. */
(() => {
  'use strict';
  if (typeof Physics === 'undefined' || typeof Matter === 'undefined' || typeof Physics.step !== 'function') return;

  const originalStep = Physics.step;
  const key = 'v238Diagnostics';

  Physics.step = function(dt) {
    const bodies = Physics.world && Physics.world.bodies ? Physics.world.bodies : [];
    const before = new Map();
    for (const body of bodies) {
      if (!body || body.isStatic || body.label !== 'piece') continue;
      before.set(body.id, {
        vx: body.velocity.x, vy: body.velocity.y,
        av: body.angularVelocity,
        x: body.position.x, y: body.position.y, angle: body.angle
      });
    }

    originalStep(dt);

    const pairs = Physics.engine && Physics.engine.pairs ? Physics.engine.pairs.list : [];
    const contacts = new Map();
    for (const pair of pairs) {
      if (!pair || !pair.isActive) continue;
      const a = pair.bodyA && pair.bodyA.parent ? pair.bodyA.parent : pair.bodyA;
      const b = pair.bodyB && pair.bodyB.parent ? pair.bodyB.parent : pair.bodyB;
      let piece = null;
      let ground = null;
      let movingPart = null;
      if (a && a.label === 'piece' && b && b.label === 'ground') { piece = a; ground = b; movingPart = pair.bodyA; }
      if (b && b.label === 'piece' && a && a.label === 'ground') { piece = b; ground = a; movingPart = pair.bodyB; }
      if (!piece || !ground) continue;

      const c = pair.collision || {};
      const n = c.normal || {x:0,y:0};
      const supportList = Array.isArray(c.supports) ? c.supports : [];
      const active = Array.isArray(pair.activeContacts) ? pair.activeContacts : [];
      const separation = Number(pair.separation);
      const depth = Number(c.depth);
      const entry = contacts.get(piece.id) || {
        pairCount:0, contactCount:0, supportCount:0, contactX:[], contactY:[],
        normalX:0, normalY:0, separation:NaN, depth:NaN, partIds:new Set()
      };
      entry.pairCount += 1;
      entry.contactCount += Number(pair.contactCount || active.length || 0);
      entry.supportCount += supportList.length;
      if (Number.isFinite(separation)) entry.separation = separation;
      if (Number.isFinite(depth)) entry.depth = depth;
      entry.normalX = n.x || 0; entry.normalY = n.y || 0;
      if (movingPart && movingPart.id !== undefined) entry.partIds.add(movingPart.id);
      for (const contact of active.length ? active : supportList) {
        const v = contact && (contact.vertex || contact);
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) {
          entry.contactX.push(v.x); entry.contactY.push(v.y);
        }
      }
      contacts.set(piece.id, entry);
    }

    for (const body of bodies) {
      if (!body || body.isStatic || body.label !== 'piece') continue;
      body.plugin = body.plugin || {};
      const p = before.get(body.id);
      const c = contacts.get(body.id);
      body.plugin[key] = {
        beforeVx: p ? p.vx : NaN,
        beforeVy: p ? p.vy : NaN,
        beforeAngularVelocity: p ? p.av : NaN,
        beforeX: p ? p.x : NaN,
        beforeY: p ? p.y : NaN,
        beforeAngle: p ? p.angle : NaN,
        deltaVx: p ? body.velocity.x - p.vx : NaN,
        deltaVy: p ? body.velocity.y - p.vy : NaN,
        deltaAngularVelocity: p ? body.angularVelocity - p.av : NaN,
        deltaX: p ? body.position.x - p.x : NaN,
        deltaY: p ? body.position.y - p.y : NaN,
        deltaAngle: p ? body.angle - p.angle : NaN,
        groundContact: !!c,
        pairCount: c ? c.pairCount : 0,
        contactCount: c ? c.contactCount : 0,
        supportCount: c ? c.supportCount : 0,
        normalX: c ? c.normalX : NaN,
        normalY: c ? c.normalY : NaN,
        separation: c ? c.separation : NaN,
        depth: c ? c.depth : NaN,
        contactMinX: c && c.contactX.length ? Math.min(...c.contactX) : NaN,
        contactMaxX: c && c.contactX.length ? Math.max(...c.contactX) : NaN,
        contactMeanX: c && c.contactX.length ? c.contactX.reduce((s,v)=>s+v,0)/c.contactX.length : NaN,
        contactPartCount: c ? c.partIds.size : 0
      };
    }
  };
})();
