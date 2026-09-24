/* v1.39.8 - direct Physics.step substep diagnostic collector. Physics behavior is unchanged. */
(() => {
  'use strict';

  const PRE_CONTEXT = 12;
  const POST_CONTEXT = 12;
  const state = {
    active:false,
    piece:0,
    rows:[],
    buffer:[],
    tail:0,
    contactCaptured:false,
    installed:false
  };

  const num=(v,d=6)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'';
  const csv=v=>String(v??'').replace(/[,"\r\n]/g,s=>s===','?'\\,':s==='"'?'\\"':' ');
  const header=[
    'piece','substep','stage',
    'x_before','y_before','angle_before','vx_before','vy_before','angular_velocity_before',
    'x_after_solver','y_after_solver','angle_after_solver','vx_after_solver','vy_after_solver','angular_velocity_after_solver',
    'x_after','y_after','angle_after','vx_after','vy_after','angular_velocity_after',
    'delta_x','delta_y','delta_vx','delta_vy','delta_angular_velocity',
    'solver_delta_angular_velocity','correction_delta_angular_velocity',
    'ground_pair_count','ground_contact_count','ground_support_count','ground_contact_part_count',
    'contact_part_ids','contact_width_px','contact_center_offset_px',
    'collision_normal_x','collision_normal_y','collision_depth','collision_separation'
  ];

  function makeRow(ctx){
    const b=ctx.before||{},s=ctx.afterSolver||{},a=ctx.after||{},info=ctx.info||{},r=ctx.response||{};
    return [
      state.piece,ctx.substep,'post_solver',
      num(b.x),num(b.y),num(b.angle),num(b.vx),num(b.vy),num(b.omega),
      num(s.x),num(s.y),num(s.angle),num(s.vx),num(s.vy),num(s.omega),
      num(a.x),num(a.y),num(a.angle),num(a.vx),num(a.vy),num(a.omega),
      num(a.x-b.x),num(a.y-b.y),num(a.vx-b.vx),num(a.vy-b.vy),num(a.omega-b.omega),
      num(ctx.deltaSolver?.omega),num(ctx.deltaCorrection?.omega),
      Number(r.pairCount||0),Number(r.contactCount||0),Number(r.supportCount||0),
      Array.isArray(info.partIds)?info.partIds.length:0,
      Array.isArray(info.partIds)?info.partIds.slice().sort((x,y)=>x-y).join(';'):'',
      num(info.span),num(info.offset),
      num(r.normalX),num(r.normalY),num(r.depth),num(r.minSeparation)
    ];
  }

  function beginPiece(){
    if(!state.active)return;
    state.piece++;
    state.buffer=[];
    state.tail=0;
    state.contactCaptured=false;
  }

  function start(){
    state.active=true;
    state.piece=0;
    state.rows=[];
    state.buffer=[];
    state.tail=0;
    state.contactCaptured=false;
  }

  function stop(){state.active=false;}

  function onSubstep(ctx){
    if(!state.active)return;
    const row=makeRow(ctx);
    const hadContact=!!ctx.info;

    if(!state.contactCaptured){
      if(hadContact){
        for(const buffered of state.buffer)state.rows.push(buffered);
        state.buffer=[];
        state.rows.push(row);
        state.contactCaptured=true;
        state.tail=POST_CONTEXT;
      }else{
        state.buffer.push(row);
        if(state.buffer.length>PRE_CONTEXT)state.buffer.shift();
      }
    }else if(state.tail>0){
      state.rows.push(row);
      state.tail--;
    }
  }

  function install(){
    if(state.installed||!window.Physics||typeof Physics.setSubstepDiagnosticHook!=='function')return;
    state.installed=true;

    const originalSetup=Physics.setup;
    Physics.setup=function(...args){
      const result=originalSetup.apply(this,args);
      if(state.active)beginPiece();
      return result;
    };

    Physics.setSubstepDiagnosticHook(onSubstep);

    document.addEventListener('click',event=>{
      const target=event.target?.closest?.('#measurementButton');
      if(target)start();
    },{capture:true});
  }

  function rows(){return state.rows.slice();}
  function csvText(){return '\ufeff'+header.join(',')+'\n'+state.rows.map(r=>r.map(csv).join(',')).join('\n')+'\n';}

  window.JinSanMeasurementSubstep={header,start,stop,rows,csvText,getState:()=>({...state,rows:undefined,buffer:undefined})};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
