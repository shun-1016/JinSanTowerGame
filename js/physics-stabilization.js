/* v1.24.1 - targeted landing stabilization + collision diagnostics */
(() => {
  'use strict';
  if(typeof Physics==='undefined'||typeof Matter==='undefined'||!Physics.step)return;
  const originalStep=Physics.step;
  const key='v238Diagnostics';
  const correctionKey='landingCorrection';

  function snapshot(){
    const map=new Map();
    const bodies=Physics.world&&Physics.world.bodies?Physics.world.bodies:[];
    for(const body of bodies){
      if(!body||body.isStatic||body.label!=='piece')continue;
      map.set(body.id,{vx:body.velocity.x,vy:body.velocity.y,av:body.angularVelocity,x:body.position.x,y:body.position.y,angle:body.angle});
    }
    return map;
  }
  function collectContacts(){
    const out=new Map();
    const pairs=Physics.engine&&Physics.engine.pairs?Physics.engine.pairs.list:[];
    for(const pair of pairs){
      if(!pair||!pair.isActive)continue;
      const a=pair.bodyA&&pair.bodyA.parent?pair.bodyA.parent:pair.bodyA;
      const b=pair.bodyB&&pair.bodyB.parent?pair.bodyB.parent:pair.bodyB;
      let piece=null,moving=null;
      if(a&&a.label==='piece'&&b&&b.label==='ground'){piece=a;moving=pair.bodyA;}
      else if(b&&b.label==='piece'&&a&&a.label==='ground'){piece=b;moving=pair.bodyB;}
      if(!piece)continue;
      const c=pair.collision||{},n=c.normal||{x:0,y:0};
      const e=out.get(piece.id)||{pairCount:0,contactCount:0,supportCount:0,contactX:[],partIds:new Set(),normalX:0,normalY:0,separation:NaN,depth:NaN};
      e.pairCount++;e.contactCount+=Number(pair.contactCount||0);e.supportCount+=Array.isArray(c.supports)?c.supports.length:0;e.normalX=n.x||0;e.normalY=n.y||0;
      if(Number.isFinite(Number(pair.separation)))e.separation=Number(pair.separation);
      if(Number.isFinite(Number(c.depth)))e.depth=Number(c.depth);
      if(moving&&moving.id!==undefined)e.partIds.add(moving.id);
      const contacts=Array.isArray(pair.activeContacts)&&pair.activeContacts.length?pair.activeContacts:(pair.contacts||[]);
      const count=Math.min(Number(pair.contactCount||0),contacts.length);
      for(let i=0;i<count;i++){const v=contacts[i]&&(contacts[i].vertex||contacts[i]);if(v&&Number.isFinite(v.x))e.contactX.push(v.x);}
      out.set(piece.id,e);
    }
    return out;
  }

  Physics.step=function(dt){
    const before=snapshot();
    originalStep(dt);
    const contacts=collectContacts();
    const bodies=Physics.world&&Physics.world.bodies?Physics.world.bodies:[];
    for(const body of bodies){
      if(!body||body.isStatic||body.label!=='piece')continue;
      body.plugin=body.plugin||{};
      const p=before.get(body.id),c=contacts.get(body.id);
      const d={beforeVx:p?p.vx:NaN,beforeVy:p?p.vy:NaN,beforeAngularVelocity:p?p.av:NaN,beforeX:p?p.x:NaN,beforeY:p?p.y:NaN,beforeAngle:p?p.angle:NaN,deltaVx:p?body.velocity.x-p.vx:NaN,deltaVy:p?body.velocity.y-p.vy:NaN,deltaAngularVelocity:p?body.angularVelocity-p.av:NaN,deltaX:p?body.position.x-p.x:NaN,deltaY:p?body.position.y-p.y:NaN,deltaAngle:p?body.angle-p.angle:NaN,groundContact:!!c,pairCount:c?c.pairCount:0,contactCount:c?c.contactCount:0,supportCount:c?c.supportCount:0,normalX:c?c.normalX:NaN,normalY:c?c.normalY:NaN,separation:c?c.separation:NaN,depth:c?c.depth:NaN,contactMinX:c&&c.contactX.length?Math.min(...c.contactX):NaN,contactMaxX:c&&c.contactX.length?Math.max(...c.contactX):NaN,contactMeanX:c&&c.contactX.length?c.contactX.reduce((s,v)=>s+v,0)/c.contactX.length:NaN,contactPartCount:c?c.partIds.size:0};
      body.plugin[key]=d;
      if(!p||!c)continue;
      if(p.vy>1&&Math.abs(p.vx)<.35&&Math.abs(p.av)<.015){
        if(body.velocity.y<0)body.velocity.y=0;
        if(Math.abs(body.velocity.x-p.vx)>.35)body.velocity.x=p.vx;
        if(Math.abs(body.angularVelocity-p.av)>.015)body.angularVelocity=p.av;
      }
      body.plugin[correctionKey]={applied:body.velocity.y===0&&d.deltaVy<0,deltaVx:d.deltaVx,deltaVy:d.deltaVy,deltaAngularVelocity:d.deltaAngularVelocity};
    }
  };
})();
