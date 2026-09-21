/* v1.39.3 - contact diagnostics module (logic unchanged from v1.38.7) */
(() => {
  'use strict';
  const api = {};
  function groundContact(body){
    const pairs=Physics.engine.pairs.list || [];
    for(const pair of pairs){
      if(!pair.isActive) continue;
      const a=pair.bodyA&&pair.bodyA.parent?pair.bodyA.parent:pair.bodyA;
      const b=pair.bodyB&&pair.bodyB.parent?pair.bodyB.parent:pair.bodyB;
      if((a===body&&b&&b.label==='ground')||(b===body&&a&&a.label==='ground')) return true;
    }
    return false;
  }
  function contactGeometry(body, stageH){
    const r={
      bottomWidth1:0,bottomWidth2:0,bottomWidth4:0,bottomWidth8:0,
      contactWidth:0,contactCenterOffset:0,contactPoints:0,contactParts:0,
      contactMinY:NaN,contactMaxY:NaN,contactMeanY:NaN,
      contactLeftOffset:NaN,contactRightOffset:NaN,contactSpanFromCom:NaN,
      contactNormalAngle:NaN,contactTorqueProxy:NaN,contactComDistance:NaN,contactAsymmetry:NaN,
      contactDetails:[]
    };
    const parts=(body.parts||[]).slice(1);
    if(parts.length){
      const verts=parts.flatMap(p=>p.vertices||[]);
      if(verts.length){
        const maxY=Math.max(...verts.map(v=>v.y));
        for(const [key,band] of [['bottomWidth1',1],['bottomWidth2',2],['bottomWidth4',4],['bottomWidth8',8]]){
          const near=verts.filter(v=>v.y>=maxY-band);
          if(near.length) r[key]=Math.max(...near.map(v=>v.x))-Math.min(...near.map(v=>v.x));
        }
      }
    }
    const xs=[]; const ys=[]; const ids=new Set(); const normals=[];
    const groundY=stageH-12;
    for(const pair of Physics.engine.pairs.list||[]){
      if(!pair.isActive) continue;
      const a=pair.bodyA,b=pair.bodyB;
      const ap=a&&a.parent?a.parent:a,bp=b&&b.parent?b.parent:b;
      const ga=a&&a.label==='ground',gb=b&&b.label==='ground';
      if(!((ap===body&&gb)||(bp===body&&ga))) continue;
      const moving=ap===body?a:b; if(moving&&moving.id!==undefined) ids.add(moving.id);
      const contacts=pair.contacts||[]; const count=Math.min(pair.contactCount||0,contacts.length);
      for(let i=0;i<count;i++){
        const c=contacts[i];
        const v=c&&c.vertex;
        if(v&&Math.abs(v.y-groundY)<8){
          xs.push(v.x); ys.push(v.y);
          const rx=v.x-body.position.x, ry=v.y-body.position.y;
          let nx=0, ny=1;
          if(pair.collision&&pair.collision.normal){
            nx=Number(pair.collision.normal.x); ny=Number(pair.collision.normal.y);
            normals.push({x:nx,y:ny});
          }
          r.contactDetails.push({
            partId:moving&&moving.id!==undefined?moving.id:'',
            worldX:v.x,worldY:v.y,relativeX:rx,relativeY:ry,
            torque:rx*ny-ry*nx,normalX:nx,normalY:ny,
            omega:body.angularVelocity,
            omegaCrossRX:-body.angularVelocity*ry,
            omegaCrossRY:body.angularVelocity*rx,
            pointVelocityX:body.velocity.x-body.angularVelocity*ry,
            pointVelocityY:body.velocity.y+body.angularVelocity*rx
          });
        }
      }
    }
    r.contactPoints=xs.length; r.contactParts=ids.size;
    if(xs.length){
      const min=Math.min(...xs),max=Math.max(...xs),mean=xs.reduce((a,b)=>a+b,0)/xs.length;
      r.contactWidth=max-min;
      r.contactCenterOffset=(min+max)/2-body.position.x;
      r.contactLeftOffset=min-body.position.x;
      r.contactRightOffset=max-body.position.x;
      r.contactSpanFromCom=Math.max(Math.abs(r.contactLeftOffset),Math.abs(r.contactRightOffset));
      r.contactAsymmetry=Math.abs(r.contactCenterOffset);
      r.contactComDistance=Math.hypot(r.contactCenterOffset,0);
      if(normals.length){
        const nx=normals.reduce((a,b)=>a+b.x,0)/normals.length;
        const ny=normals.reduce((a,b)=>a+b.y,0)/normals.length;
        r.contactNormalAngle=Math.atan2(ny,nx);
        r.contactTorqueProxy=r.contactCenterOffset*ny;
      }
    }
    if(ys.length){
      r.contactMinY=Math.min(...ys);
      r.contactMaxY=Math.max(...ys);
      r.contactMeanY=ys.reduce((a,b)=>a+b,0)/ys.length;
    }
    return r;
  }
  api.groundContact=groundContact;
  api.contactGeometry=contactGeometry;
  window.JinSanMeasurementContact=api;
})();
