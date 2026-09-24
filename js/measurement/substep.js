/* v1.39.7 - substep-level diagnostic collector. Physics behavior is unchanged. */
(() => {
  'use strict';

  const PRE_CONTEXT = 12;
  const POST_CONTEXT = 12;
  const state = {
    active: false,
    piece: 0,
    substep: 0,
    rows: [],
    buffer: [],
    tail: 0,
    contactCaptured: false,
    installed: false
  };

  const num = (v, d=6) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '';
  const csv = v => String(v ?? '').replace(/[,\"\r\n]/g, s => s === ',' ? '\\,' : s === '"' ? '\\"' : ' ');

  const header = [
    'piece','substep','stage',
    'x_before','y_before','angle_before','vx_before','vy_before','angular_velocity_before',
    'x_after_solver','y_after_solver','angle_after_solver','vx_after_solver','vy_after_solver','angular_velocity_after_solver',
    'delta_x','delta_y','delta_vx','delta_vy','delta_angular_velocity',
    'ground_pair_count','ground_contact_count','ground_support_count','ground_contact_part_count',
    'contact_part_ids','contact_width_px','contact_center_offset_px',
    'collision_normal_x','collision_normal_y','collision_depth','collision_separation'
  ];

  function bodyOf(engine){
    return (engine.world?.bodies||[]).find(b => !b.isStatic && b.label === 'piece') || null;
  }

  function contactInfo(engine, body){
    const out={pairs:0,contacts:0,supports:0,parts:new Set(),xs:[],normalX:NaN,normalY:NaN,depth:NaN,separation:NaN};
    if(!body) return out;
    for(const pair of engine.pairs?.list||[]){
      if(!pair.isActive) continue;
      const a=pair.bodyA, b=pair.bodyB;
      const ap=a?.parent||a, bp=b?.parent||b;
      const ga=a?.label==='ground', gb=b?.label==='ground';
      if(!((ap===body&&gb)||(bp===body&&ga))) continue;
      out.pairs++;
      const moving=ap===body?a:b;
      if(moving?.id!==undefined) out.parts.add(moving.id);
      const count=Math.min(Number(pair.contactCount||0), (pair.contacts||[]).length);
      out.contacts+=count;
      out.supports+=(pair.collision?.supports||[]).length;
      if(pair.collision?.normal){
        out.normalX=Number(pair.collision.normal.x);
        out.normalY=Number(pair.collision.normal.y);
      }
      if(Number.isFinite(Number(pair.collision?.depth))) out.depth=Number(pair.collision.depth);
      if(Number.isFinite(Number(pair.collision?.separation))) out.separation=Number(pair.collision.separation);
      for(let i=0;i<count;i++){
        const v=pair.contacts[i]?.vertex;
        if(v && Number.isFinite(v.x)) out.xs.push(Number(v.x));
      }
    }
    return out;
  }

  function makeRow(piece, substep, stage, before, after, info){
    const width=info.xs.length ? Math.max(...info.xs)-Math.min(...info.xs) : 0;
    const center=info.xs.length ? ((Math.min(...info.xs)+Math.max(...info.xs))/2-after.x) : 0;
    return [
      piece,substep,stage,
      num(before.x),num(before.y),num(before.angle),num(before.vx),num(before.vy),num(before.omega),
      num(after.x),num(after.y),num(after.angle),num(after.vx),num(after.vy),num(after.omega),
      num(after.x-before.x),num(after.y-before.y),num(after.vx-before.vx),num(after.vy-before.vy),num(after.omega-before.omega),
      info.pairs,info.contacts,info.supports,info.parts.size,
      Array.from(info.parts).sort((a,b)=>a-b).join(';'),num(width),num(center),
      num(info.normalX),num(info.normalY),num(info.depth),num(info.separation)
    ];
  }

  function snapshot(body){
    return body ? {x:body.position.x,y:body.position.y,angle:body.angle,vx:body.velocity.x,vy:body.velocity.y,omega:body.angularVelocity} : null;
  }

  function push(row){
    state.buffer.push(row);
    if(state.buffer.length>PRE_CONTEXT) state.buffer.shift();
    if(state.tail>0){
      state.rows.push(row); state.tail--;
    }
  }

  function beginPiece(){
    if(!state.active) return;
    state.piece++;
    state.substep=0;
    state.buffer=[];
    state.tail=0;
    state.contactCaptured=false;
  }

  function start(){
    state.active=true;
    state.piece=0;
    state.rows=[];
    state.substep=0;
    state.buffer=[];
    state.tail=0;
    state.contactCaptured=false;
  }

  function stop(){ state.active=false; }

  function install(){
    if(state.installed || !window.Matter || !Matter.Engine || !window.Physics) return;
    state.installed=true;

    const originalSetup=Physics.setup;
    Physics.setup=function(...args){
      const result=originalSetup.apply(this,args);
      if(state.active) beginPiece();
      return result;
    };

    const originalUpdate=Matter.Engine.update;
    Matter.Engine.update=function(engine,...args){
      const button=document.getElementById('measurementButton');
      if(state.active && button && !button.disabled) stop();
      if(!state.active || !window.Physics || engine!==Physics.engine){
        return originalUpdate.call(this,engine,...args);
      }

      const body=bodyOf(engine);
      const before=snapshot(body);
      const result=originalUpdate.call(this,engine,...args);
      const after=snapshot(body);
      state.substep++;
      if(!body || !before || !after) return result;

      const info=contactInfo(engine,body);
      const row=makeRow(state.piece,state.substep,'post_solver',before,after,info);
      const hadContact=info.pairs>0;

      if(hadContact && !state.contactCaptured){
        // Keep the immediately preceding context and the contact substep itself.
        for(const buffered of state.buffer) state.rows.push(buffered);
        state.buffer=[];
        state.rows.push(row);
        state.contactCaptured=true;
        state.tail=POST_CONTEXT;
      }else if(!state.contactCaptured){
        push(row);
      }else if(state.tail>0){
        state.rows.push(row);
        state.tail--;
      }
      return result;
    };

    // Use document-level capture because measurement.js replaces the button node
    // during initialization. This listener therefore survives that replacement.
    document.addEventListener('click',event=>{
      const target=event.target?.closest?.('#measurementButton');
      if(target) start();
    },{capture:true});
  }

  function rows(){ return state.rows.slice(); }
  function csvText(){ return '\ufeff'+header.join(',')+'\n'+state.rows.map(r=>r.map(csv).join(',')).join('\n')+'\n'; }

  window.JinSanMeasurementSubstep={
    header,
    start,
    stop,
    rows,
    csvText,
    getState:()=>({...state,rows:undefined,buffer:undefined})
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})();
