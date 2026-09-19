/* v1.38.0 - stability-until-rest measurement / contact-event angular ledger diagnostics */
(() => {
  'use strict';

  const VERSION = 'v1.38.0';
  const ASSET_PREFIX = 'assets/';
  const MAX_DISCOVERY = 999;
  // v1.38.0: measure each piece until it is stably at rest.
  // The physics simulation itself is unchanged; these values affect measurement
  // termination only.
  const MIN_POST_LAND_FRAMES = 60;
  const STABLE_REQUIRED_FRAMES = 30;
  const POST_STABLE_FRAMES = 30;
  const MAX_POST_LAND_FRAMES = 600;
  const STABLE_VX_THRESHOLD = 0.01;
  const STABLE_VY_THRESHOLD = 0.01;
  const STABLE_ANGULAR_VELOCITY_THRESHOLD = 0.01;
  const BASE_WIDTH_RATIO = 0.82;

  // v1.37.1: contact-loop diagnostics.
  // These thresholds are used only to classify already-recorded contact events.
  // They do not modify Matter.js physics.
  const LOOP_MIN_GAP_SUBSTEPS = 1;
  const LOOP_ANGULAR_CHANGE_THRESHOLD = 0.05;
  const LOOP_LINEAR_CHANGE_THRESHOLD = 0.15;
  const LOOP_MIN_EVENT_COUNT = 2;

  const $ = id => document.getElementById(id);
  const pad2 = n => String(n).padStart(2, '0');
  const num = (v, d=3) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '';

  const csvHeader = [
    'piece','phase','frame','time_ms','landing_frame','x','y','velocity_x','velocity_y','speed','angular_velocity','angle','sleeping','ground_contact',
    'mass','inertia','com_offset_px','footprint_width_px','bottom_width_1px','bottom_width_2px','bottom_width_4px','bottom_width_8px',
    'contact_width_px','contact_center_offset_px','contact_points','contact_parts','aspect_ratio','physics_parts','triangles','regions','raw_regions','contour_vertices',
    'pre_velocity_x','pre_velocity_y','pre_angular_velocity','solver_angular_velocity','solver_delta_angular_velocity','correction_delta_angular_velocity','total_delta_angular_velocity','delta_velocity_x','delta_velocity_y','delta_angular_velocity',
    'collision_normal_x','collision_normal_y','collision_depth','collision_separation','collision_pair_count','collision_contact_count','collision_support_count','collision_contact_part_count',
    'collision_contact_min_x','collision_contact_max_x','collision_contact_mean_x','collision_contact_center_offset_px',
    'contact_min_y','contact_max_y','contact_mean_y',
    'contact_left_offset_px','contact_right_offset_px','contact_span_from_com_px',
    'contact_normal_angle_rad','contact_torque_proxy','contact_com_distance_px','contact_asymmetry_px'
  ];

  // Summary is intentionally compact: derived/redundant contact metrics are omitted,
  // while landing pre-state and per-contact diagnostics are retained for analysis.
  // Summary is the primary analysis file. Keep one row per piece and split
  // exported CSVs into small piece ranges so retrieval does not truncate a
  // large file. Current-state narrow-contact fields are removed because they
  // can be overwritten by later substeps; the latched event is retained.
  const summaryHeader = [
    'run','piece','compound_mode','status','frame_count','landing_frame','post_land_frame_count','mass','inertia','com_offset_px','footprint_width_px','contact_points','contact_parts',
    'landing_angle','landing_pre_vx','landing_pre_vy','landing_pre_angular_velocity','landing_solver_angular_velocity','landing_solver_delta_angular_velocity','landing_correction_delta_angular_velocity','landing_total_delta_angular_velocity','landing_vx','landing_vy','landing_angular_velocity','landing_delta_vx','landing_delta_vy','landing_delta_angular_velocity',
    'max_post_land_abs_vx','max_post_land_abs_vy','max_post_land_abs_angular_velocity','post_land_x_range','post_land_y_range','post_land_angle_range','max_bounce_height_px','sleep_frame','final_sleeping','final_ground_contact','stable_frame','stable_confirmed','stable_required_frames','post_stable_frames','measurement_end_frame','measurement_end_reason',
    'physics_parts','triangles','regions','raw_regions','contour_vertices','landing_contact_left_offset_px','landing_contact_right_offset_px','landing_contact_normal_angle_rad','landing_contact_torque_proxy',
    'landing_contact_parts_detail','landing_contact_offsets_xy_px','landing_contact_torque_proxies','landing_contact_world_xy_px','landing_contact_relative_xy_px','landing_contact_normal_xy','landing_contact_omega_cross_r_px_per_frame','landing_contact_point_velocity_px_per_frame',
    'narrow_landing_correction_latched','narrow_landing_contact_width_latched_px','narrow_landing_contact_source_latched','narrow_landing_contact_offset_latched_px','narrow_landing_angular_before_latched','narrow_landing_angular_delta_latched','narrow_landing_angular_after_latched','narrow_landing_correction_applied_latched',
    'first_ground_contact_substep','first_ground_contact_vx_before','first_ground_contact_vx_after','first_ground_contact_delta_vx','first_ground_contact_vy_before','first_ground_contact_vy_after','first_ground_contact_delta_vy','first_ground_contact_angular_before','first_ground_contact_angular_after','first_ground_contact_delta_angular','first_ground_contact_delta_x','first_ground_contact_delta_y','first_ground_contact_width_px','first_ground_contact_offset_px','first_ground_contact_source',
    'max_ground_delta_vx','max_ground_delta_vx_before','max_ground_delta_vx_after','max_ground_delta_vy','max_ground_delta_angular','max_ground_delta_vx_substep','max_ground_delta_vx_contact_width_px','max_ground_delta_vx_contact_offset_px','max_ground_delta_vx_contact_source',
    'first_ground_response_normal_x','first_ground_response_normal_y','first_ground_response_normal_angle_rad','first_ground_response_tangent_x','first_ground_response_tangent_y','first_ground_response_depth','first_ground_response_separation','first_ground_response_friction','first_ground_response_friction_static','first_ground_response_delta_vn','first_ground_response_delta_vt','first_ground_response_linear_impulse_normal_proxy','first_ground_response_linear_impulse_tangent_proxy','first_ground_response_angular_impulse_proxy','first_ground_response_angular_impulse_solver_proxy','first_ground_response_pair_count','first_ground_response_contact_count','first_ground_response_support_count','first_ground_response_pair_id',
    'max_ground_response_normal_x','max_ground_response_normal_y','max_ground_response_normal_angle_rad','max_ground_response_tangent_x','max_ground_response_tangent_y','max_ground_response_depth','max_ground_response_separation','max_ground_response_friction','max_ground_response_friction_static','max_ground_response_delta_vn','max_ground_response_delta_vt','max_ground_response_linear_impulse_normal_proxy','max_ground_response_linear_impulse_tangent_proxy','max_ground_response_angular_impulse_proxy','max_ground_response_angular_impulse_solver_proxy','max_ground_response_pair_count','max_ground_response_contact_count','max_ground_response_support_count','max_ground_response_pair_id'
  ];

  // Compact motion log. Full-resolution contact behavior is represented by
  // contact_events.csv; this file keeps only landing-adjacent and periodic frames.
  const frameHeader = ['piece','phase','frame','time_ms','landing_frame','x','y','velocity_x','velocity_y','angular_velocity','angle','sleeping','ground_contact','contact_width_px','contact_center_offset_px','contact_points','contact_parts','pre_velocity_x','pre_velocity_y','pre_angular_velocity','delta_velocity_x','delta_velocity_y','delta_angular_velocity','collision_normal_x','collision_normal_y','collision_depth','collision_separation','collision_pair_count','collision_contact_count','collision_support_count','collision_contact_part_count'];

  // One row per continuous ground-contact interval. This is the main v1.33.7
  // diagnostic and is intentionally aggregate rather than one row per substep.
  const contactEventHeader = ['run','piece','event_index','start_substep','end_substep','duration_substeps','part_ids','start_x','end_x','delta_x','start_y','end_y','delta_y','start_angle','end_angle','delta_angle','start_vx','end_vx','delta_vx','start_vy','end_vy','delta_vy','start_angular_velocity','end_angular_velocity','delta_angular_velocity','solver_delta_angular_velocity','correction_delta_angular_velocity','total_delta_angular_velocity','decomposition_residual','decomposition_consistent','observed_delta_angular_velocity','observed_vs_event_residual','observed_vs_total_residual','observed_consistent','start_pre_angular_velocity','start_solver_delta_angular_velocity','start_correction_delta_angular_velocity','start_total_delta_angular_velocity','sum_solver_delta_angular_including_start','sum_correction_delta_angular_including_start','sum_total_delta_angular_including_start','inclusive_decomposition_residual','inclusive_consistent','min_contact_width_px','max_contact_width_px','max_contact_offset_px','max_abs_delta_vx','max_delta_vx_substep','max_delta_vx_width_px','max_delta_vx_offset_px','max_delta_vn','max_delta_vt','max_abs_delta_angular','max_delta_angular_substep','max_abs_delta_vt','sum_abs_delta_vx','change_point_count'];

  // Change-point log: only substeps where contact parts, support geometry, or
  // collision response changes materially. This avoids exporting every substep
  // while preserving the causal sequence inside long contact events.
  const contactChangeHeader = ['run','piece','event_index','change_index','substep','reason','part_ids','contact_width_px','contact_offset_px','vx_before','vx_after','delta_vx','vy_before','vy_after','delta_vy','angular_before','angular_after','delta_angular','solver_delta_angular','correction_delta_angular','total_delta_angular','delta_vn','delta_vt','x','angle','cumulative_delta_x','cumulative_delta_angle','contact_points','support_count'];

  const validationHeader = ['run','piece','status','raw_row_count','landing_frame','stable_frame','measurement_end_frame','expected_row_count','row_count_ok','landing_present','stable_confirmed','post_stable_frames','measurement_end_reason'];

  // One row per re-contact transition. This is intentionally derived from
  // continuous contact events, so it exposes the sequence:
  // contact -> separation -> free flight -> re-contact.
  const contactLoopHeader = [
    'run','piece','transition_index',
    'previous_event_index','next_event_index',
    'previous_end_substep','next_start_substep','gap_substeps',
    'previous_duration_substeps','next_duration_substeps',
    'previous_end_x','next_start_x','delta_x_during_gap',
    'previous_end_y','next_start_y','delta_y_during_gap',
    'previous_end_angle','next_start_angle','delta_angle_during_gap',
    'previous_end_vx','next_start_vx','delta_vx_across_gap',
    'previous_end_vy','next_start_vy','delta_vy_across_gap',
    'previous_end_angular_velocity','next_start_angular_velocity','delta_angular_across_gap',
    'next_start_contact_width_px','next_start_contact_offset_px',
    'previous_max_abs_delta_vx','previous_max_abs_delta_angular',
    'previous_max_delta_vt',
    'loop_class',
    'angular_persistence','linear_persistence'
  ];

  const state = {
    measurementConfig: null,
    images: [], run: 1, index: 0, frame: 0, startedAt: 0, landingFrame: null, rows: [], allRows: [], summaries: [],
    stageW: 390, stageH: 500, baseWidth: 0, piece: null, body: null, running: false,
    landingContactDetail: null, landingOtherDynamicBodyIds: [], contactEvents: [], contactChanges: [], contactLoops: [],
    stableFrame: null, stableConsecutiveFrames: 0, stableConfirmed: false, measurementEndFrame: null,
    measurementEndReason: '', postStableStartFrame: null
  };

  async function loadImage(n){
    const label=pad2(n);
    const load=ext=>new Promise(resolve=>{ const im=new Image(); im.onload=()=>resolve(im); im.onerror=()=>resolve(null); im.src=`${ASSET_PREFIX}${label}.${ext}`; });
    return (await load('png')) || (await load('PNG'));
  }

  async function discoverImages(){
    const out=[];
    for(let n=1;n<=MAX_DISCOVERY;n++){ const im=await loadImage(n); if(!im) break; out.push(im); }
    return out;
  }

  function setStatus(text){
    const el=$('measurementStatus'); if(el) el.textContent=text;
    const status=$('status'); if(status) status.textContent=text;
  }

  function clearDynamicBodies(){
    if(!Physics.world) return;
    const dynamic=Physics.world.bodies.filter(b=>!b.isStatic);
    if(dynamic.length) Matter.World.remove(Physics.world,dynamic);
  }

  function setupPhysics(){
    const size=Renderer.resize();
    state.stageW=size.width; state.stageH=size.height; state.baseWidth=state.stageW*BASE_WIDTH_RATIO;
    clearDynamicBodies();
    Physics.setup(state.stageW,state.stageH-12,state.baseWidth,false);
  }

  function groundContact(body){ return window.JinSanMeasurementContact.groundContact(body); }

  function contactGeometry(body){ return window.JinSanMeasurementContact.contactGeometry(body, state.stageH); }

  function rowFor(body, phase){
    const p=body.plugin||{}; const d=p.v238Diagnostics||{}; const cg=contactGeometry(body);
    const cx=(Number.isFinite(d.contactMinX)&&Number.isFinite(d.contactMaxX)) ? (d.contactMinX+d.contactMaxX)/2 : NaN;
    const centerOffset=Number.isFinite(cx) ? cx-body.position.x : NaN;
    return [
      state.index+1,phase,state.frame,num(performance.now()-state.startedAt,1),state.landingFrame===null?'':state.landingFrame,
      num(body.position.x),num(body.position.y),num(body.velocity.x,5),num(body.velocity.y,5),num(body.speed,5),num(body.angularVelocity,6),num(body.angle,6),
      body.isSleeping?1:0,d.groundContact?1:0,
      num(p.debugMass||body.mass,5),num(p.debugInertia||body.inertia,3),num(p.debugComOffset,3),num(p.debugFootprintWidth,3),
      num(cg.bottomWidth1),num(cg.bottomWidth2),num(cg.bottomWidth4),num(cg.bottomWidth8),num(cg.contactWidth),num(cg.contactCenterOffset),cg.contactPoints,cg.contactParts,
      num(p.debugAspectRatio,4),Number(p.debugPartCount||0),Number(p.debugTriangulatedCount||0),Number(p.debugRegionCount||0),Number(p.debugRawRegionCount||0),Number(p.debugContourVertexCount||0),
      num(d.beforeVx,5),num(d.beforeVy,5),num(d.beforeAngularVelocity,6),num(p.angularVelocityAfterSolver,6),num(p.deltaAngularSolver,6),num(p.deltaAngularCorrection,6),num(p.deltaAngularTotal,6),num(d.deltaVx,5),num(d.deltaVy,5),num(d.deltaAngularVelocity,6),
      num(d.normalX,6),num(d.normalY,6),num(d.depth,6),num(d.separation,6),Number(d.pairCount||0),Number(d.contactCount||0),Number(d.supportCount||0),Number(d.contactPartCount||0),
      num(d.contactMinX),num(d.contactMaxX),num(d.contactMeanX),num(centerOffset),
      num(cg.contactMinY),num(cg.contactMaxY),num(cg.contactMeanY),
      num(cg.contactLeftOffset),num(cg.contactRightOffset),num(cg.contactSpanFromCom),
      num(cg.contactNormalAngle,6),num(cg.contactTorqueProxy,6),num(cg.contactComDistance),num(cg.contactAsymmetry)
    ].join(',');
  }

  function parseRows(rows){ return rows.map(r=>r.split(',')).filter(a=>a.length===csvHeader.length); }
  function colIndex(name){ return csvHeader.indexOf(name); }
  function nums(arr,name){ const i=colIndex(name); return arr.map(a=>Number(a[i])).filter(Number.isFinite); }
  function compactFrameRow(arr){
    const get=n=>arr[colIndex(n)]??'';
    return [get('piece'),get('phase'),get('frame'),get('time_ms'),get('landing_frame'),get('x'),get('y'),get('velocity_x'),get('velocity_y'),get('angular_velocity'),get('angle'),get('sleeping'),get('ground_contact'),get('contact_width_px'),get('contact_center_offset_px'),get('contact_points'),get('contact_parts'),get('pre_velocity_x'),get('pre_velocity_y'),get('pre_angular_velocity'),get('solver_angular_velocity'),get('solver_delta_angular_velocity'),get('correction_delta_angular_velocity'),get('total_delta_angular_velocity'),get('delta_velocity_x'),get('delta_velocity_y'),get('delta_angular_velocity'),get('collision_normal_x'),get('collision_normal_y'),get('collision_depth'),get('collision_separation'),get('collision_pair_count'),get('collision_contact_count'),get('collision_support_count'),get('collision_contact_part_count')];
  }
  function selectCompactFrames(rawRows){
    const parsed=parseRows(rawRows); if(!parsed.length)return []; const fi=colIndex('frame'),gi=colIndex('ground_contact');
    const landing=parsed.find(a=>a[gi]==='1'),lf=landing?Number(landing[fi]):NaN,keep=new Set();
    for(let f=0;f<parsed.length;f+=10)keep.add(f);
    for(let f=0;f<Math.min(10,parsed.length);f++)keep.add(f);
    if(Number.isFinite(lf))for(let f=Math.max(0,lf-2);f<=lf+POST_LAND_FRAMES;f++)keep.add(f);
    keep.add(parsed.length-1);
    const tailStart=Math.max(0,parsed.length-POST_STABLE_FRAMES-5);
    for(let f=tailStart;f<parsed.length;f++)keep.add(f);
    return parsed.filter(a=>keep.has(Number(a[fi]))).map(compactFrameRow);
  }


  function responseSummary(r,prefix){
    if(!r) return Array(19).fill('');
    return [
      num(r.normalX,6),num(r.normalY,6),num(r.normalAngle,6),num(r.tangentX,6),num(r.tangentY,6),
      num(r.depth,6),num(r.minSeparation,6),num(r.friction,6),num(r.frictionStatic,6),
      num(r.deltaVn,6),num(r.deltaVt,6),num(r.linearImpulseNormalProxy,6),num(r.linearImpulseTangentProxy,6),num(r.angularImpulseProxy,6),num(r.angularImpulseSolverProxy,6),
      Number(r.pairCount||0),Number(r.contactCount||0),Number(r.supportCount||0),r.sourcePairId||''
    ];
  }

  function classifyContactLoop(prev,next,gap){
    const angularPersistence=Math.abs(Number(next.startOmega)-Number(prev.endOmega))<=LOOP_ANGULAR_CHANGE_THRESHOLD;
    const linearPersistence=Math.hypot(Number(next.startVx)-Number(prev.endVx),Number(next.startVy)-Number(prev.endVy))<=LOOP_LINEAR_CHANGE_THRESHOLD;
    const prevAngularImpact=Number(prev.maxAbsDomega)>=LOOP_ANGULAR_CHANGE_THRESHOLD;
    const prevLinearImpact=Number(prev.maxAbsDvx)>=LOOP_LINEAR_CHANGE_THRESHOLD;
    if(gap<LOOP_MIN_GAP_SUBSTEPS) return 'ADJACENT_CONTACT_EVENT';
    if(angularPersistence && prevAngularImpact) return 'ANGULAR_RECONTACT_LOOP';
    if(linearPersistence && prevLinearImpact) return 'LINEAR_RECONTACT_LOOP';
    if(prevAngularImpact && prevLinearImpact) return 'MIXED_RECONTACT_LOOP';
    return 'RECONTACT';
  }

  function buildContactLoopRows(events){
    const rows=[];
    for(let i=1;i<events.length;i++){
      const prev=events[i-1],next=events[i];
      const gap=Math.max(0,Number(next.startSubstep)-Number(prev.endSubstep)-1);
      const deltaX=Number(next.startX)-Number(prev.endX);
      const deltaY=Number(next.startY)-Number(prev.endY);
      const deltaAngle=Number(next.startAngle)-Number(prev.endAngle);
      const deltaVx=Number(next.startVx)-Number(prev.endVx);
      const deltaVy=Number(next.startVy)-Number(prev.endVy);
      const deltaOmega=Number(next.startOmega)-Number(prev.endOmega);
      const angularPersistence=Math.abs(deltaOmega)<=LOOP_ANGULAR_CHANGE_THRESHOLD;
      const linearPersistence=Math.hypot(deltaVx,deltaVy)<=LOOP_LINEAR_CHANGE_THRESHOLD;
      rows.push([
        state.run,state.index+1,i,
        i,i+1,
        prev.endSubstep,next.startSubstep,gap,
        prev.durationSubsteps,next.durationSubsteps,
        num(prev.endX),num(next.startX),num(deltaX),
        num(prev.endY),num(next.startY),num(deltaY),
        num(prev.endAngle,6),num(next.startAngle,6),num(deltaAngle,6),
        num(prev.endVx,6),num(next.startVx,6),num(deltaVx,6),
        num(prev.endVy,6),num(next.startVy,6),num(deltaVy,6),
        num(prev.endOmega,6),num(next.startOmega,6),num(deltaOmega,6),
        num(next.changePoints?.[0]?.contactWidth),
        num(next.changePoints?.[0]?.contactOffset),
        num(prev.maxAbsDvx,6),num(prev.maxAbsDomega,6),
        num(prev.maxAbsDvt,6),
        classifyContactLoop(prev,next,gap),
        angularPersistence?1:0,
        linearPersistence?1:0
      ]);
    }
    return rows;
  }

  function finishPiece(status, endReason=''){
    if(state.body && Physics.finalizeGroundContactHistory) Physics.finalizeGroundContactHistory(state.body);
    const p=state.body&&state.body.plugin?state.body.plugin:{};
    const arr=parseRows(state.rows); const first=arr[0]||[]; const land=state.landingFrame===null?arr[0]:arr[Math.min(state.landingFrame,Math.max(0,arr.length-1))]||arr[0];
    const post=state.landingFrame===null?[]:arr.filter(a=>Number(a[colIndex('frame')])>=state.landingFrame);
    const xs=nums(post,'x'),ys=nums(post,'y'),angs=nums(post,'angle'),vxs=nums(post,'velocity_x'),vys=nums(post,'velocity_y'),avs=nums(post,'angular_velocity');
    const minY=ys.length?Math.min(...ys):NaN; const landingY=Number(land?.[colIndex('y')]);
    const sleeping=arr.find(a=>Number(a[colIndex('sleeping')])===1); const sleepFrame=sleeping?Number(sleeping[colIndex('frame')]):'';
    const last=arr[arr.length-1]||[];
    const maxBounce=Number.isFinite(landingY)&&Number.isFinite(minY)?Math.max(0,landingY-minY):NaN;
    const firstDiag=first;
    const events=p.groundContactEvents||[];
    const loopRows=buildContactLoopRows(events);
    if(loopRows.length) state.contactLoops.push(...loopRows);
    for(let ei=0;ei<events.length;ei++){
      const e=events[ei];
      state.contactEvents.push([state.run,state.index+1,ei+1,e.startSubstep,e.endSubstep,e.durationSubsteps,Array.from(e.partIds||[]).join(';'),num(e.startX),num(e.endX),num(e.deltaX),num(e.startY),num(e.endY),num(e.deltaY),num(e.startAngle,6),num(e.endAngle,6),num(e.deltaAngle,6),num(e.startVx,6),num(e.endVx,6),num(e.deltaVx,6),num(e.startVy,6),num(e.endVy,6),num(e.deltaVy,6),num(e.startOmega,6),num(e.endOmega,6),num(e.deltaOmega,6),num(e.sumSolverDeltaAngular,6),num(e.sumCorrectionDeltaAngular,6),num(e.sumTotalDeltaAngular,6),num(e.sumTotalDeltaAngular-e.deltaOmega,6),Math.abs(Number(e.sumTotalDeltaAngular)-Number(e.deltaOmega))<=1e-6?1:0,num(e.observedDeltaAngular,6),num(e.observedDeltaAngular-e.deltaOmega,6),num(e.observedDeltaAngular-e.sumTotalDeltaAngular,6),Math.abs(Number(e.observedDeltaAngular)-Number(e.sumTotalDeltaAngular))<=1e-6?1:0,num(e.startPreOmega,6),num(e.startSolverDeltaAngular,6),num(e.startCorrectionDeltaAngular,6),num(e.startTotalDeltaAngular,6),num(e.sumSolverDeltaAngularIncludingStart,6),num(e.sumCorrectionDeltaAngularIncludingStart,6),num(e.sumTotalDeltaAngularIncludingStart,6),num(e.sumTotalDeltaAngularIncludingStart-(e.endOmega-e.startPreOmega),6),Math.abs(Number(e.sumTotalDeltaAngularIncludingStart)-(Number(e.endOmega)-Number(e.startPreOmega)))<=1e-6?1:0,num(e.minWidth),num(e.maxWidth),num(e.maxOffset),num(e.maxAbsDvx,6),e.maxDvxSubstep,num(e.maxDvxWidth),num(e.maxDvxOffset),num(e.maxDvxVn,6),num(e.maxDvxVt,6),num(e.maxAbsDomega,6),e.maxDomegaSubstep,num(e.maxAbsDvt,6),num(e.totalAbsDvx,6),(e.changePoints||[]).length]);
      const cps=e.changePoints||[];
      for(let ci=0;ci<cps.length;ci++){const c=cps[ci];state.contactChanges=state.contactChanges||[];state.contactChanges.push([state.run,state.index+1,ei+1,ci+1,c.substep,c.reason,Array.from(c.partIds||[]).join(';'),num(c.contactWidth),num(c.contactOffset),num(c.vxBefore,6),num(c.vxAfter,6),num(c.deltaVx,6),num(c.vyBefore,6),num(c.vyAfter,6),num(c.deltaVy,6),num(c.angularBefore,6),num(c.angularAfter,6),num(c.deltaAngular,6),num(c.solverDeltaAngular,6),num(c.correctionDeltaAngular,6),num(c.totalDeltaAngular,6),num(c.deltaVn,6),num(c.deltaVt,6),num(c.x),num(c.angle,6),num(c.cumulativeDeltaX),num(c.cumulativeDeltaAngle,6),Number(c.contactPoints||0),Number(c.supportCount||0)]);}
    }
    state.summaries.push([
      state.run,state.index+1,(state.body&&state.body.plugin&&state.body.plugin.debugCompoundMode)||'',status,arr.length,state.landingFrame===null?'':state.landingFrame,state.landingFrame===null?0:Math.max(0,arr.length-state.landingFrame-1),
      Number(firstDiag[colIndex('mass')]),Number(firstDiag[colIndex('inertia')]),Number(firstDiag[colIndex('com_offset_px')]),Number(firstDiag[colIndex('footprint_width_px')]),
      Number(land?.[colIndex('contact_points')]),Number(land?.[colIndex('contact_parts')]),
      Number(land?.[colIndex('angle')]),Number(land?.[colIndex('pre_velocity_x')]),Number(land?.[colIndex('pre_velocity_y')]),Number(land?.[colIndex('pre_angular_velocity')]),Number(land?.[colIndex('solver_angular_velocity')]),Number(land?.[colIndex('solver_delta_angular_velocity')]),Number(land?.[colIndex('correction_delta_angular_velocity')]),Number(land?.[colIndex('total_delta_angular_velocity')]),
      Number(land?.[colIndex('velocity_x')]),Number(land?.[colIndex('velocity_y')]),Number(land?.[colIndex('angular_velocity')]),Number(land?.[colIndex('delta_velocity_x')]),Number(land?.[colIndex('delta_velocity_y')]),Number(land?.[colIndex('delta_angular_velocity')]),
      vxs.length?Math.max(...vxs.map(Math.abs)):NaN,vys.length?Math.max(...vys.map(Math.abs)):NaN,avs.length?Math.max(...avs.map(Math.abs)):NaN,
      xs.length?Math.max(...xs)-Math.min(...xs):NaN,ys.length?Math.max(...ys)-Math.min(...ys):NaN,angs.length?Math.max(...angs)-Math.min(...angs):NaN,
      maxBounce,sleepFrame,last[colIndex('sleeping')]==='1'?1:0,last[colIndex('ground_contact')]==='1'?1:0,
      state.stableFrame===null?'':state.stableFrame,state.stableConfirmed?1:0,STABLE_REQUIRED_FRAMES,
      state.stableConfirmed&&state.stableFrame!==null&&state.measurementEndFrame!==null
        ? Math.max(0,state.measurementEndFrame-state.stableFrame)
        : 0,
      state.measurementEndFrame===null?'':state.measurementEndFrame,
      endReason||state.measurementEndReason||'',
      Number(firstDiag[colIndex('physics_parts')]),Number(firstDiag[colIndex('triangles')]),Number(firstDiag[colIndex('regions')]),Number(firstDiag[colIndex('raw_regions')]),Number(firstDiag[colIndex('contour_vertices')]),
      Number(land?.[colIndex('contact_left_offset_px')]),Number(land?.[colIndex('contact_right_offset_px')]),Number(land?.[colIndex('contact_normal_angle_rad')]),Number(land?.[colIndex('contact_torque_proxy')]),
      (state.landingContactDetail||[]).map(c=>String(c.partId)).join(';'),
      (state.landingContactDetail||[]).map(c=>`${num(c.x)}:${num(c.y)}`).join(';'),
      (state.landingContactDetail||[]).map(c=>num(c.torque,6)).join(';'),
      (state.landingContactDetail||[]).map(c=>`${num(c.worldX)}:${num(c.worldY)}`).join(';'),
      (state.landingContactDetail||[]).map(c=>`${num(c.relativeX)}:${num(c.relativeY)}`).join(';'),
      (state.landingContactDetail||[]).map(c=>`${num(c.normalX,6)}:${num(c.normalY,6)}`).join(';'),
      (state.landingContactDetail||[]).map(c=>`${num(c.omegaCrossRX,6)}:${num(c.omegaCrossRY,6)}`).join(';'),
      (state.landingContactDetail||[]).map(c=>`${num(c.pointVelocityX,6)}:${num(c.pointVelocityY,6)}`).join(';'),
      num(p.narrowLandingCorrectionLatched,6), num(p.narrowLandingContactSpanLatched), p.narrowLandingContactSourceLatched||'', num(p.narrowLandingContactOffsetLatched), num(p.narrowLandingAngularBeforeLatched,6), num(p.narrowLandingAngularDeltaLatched,6), num(p.narrowLandingAngularAfterLatched,6), p.narrowLandingCorrectionAppliedLatched?1:0,
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? p.firstGroundContactEvent.substep : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.vxBefore,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.vxAfter,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.deltaVx,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.vyBefore,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.vyAfter,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.deltaVy,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.angularBefore,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.angularAfter,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.deltaAngular,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.deltaX,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.deltaY,6) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.contactWidth) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? num(p.firstGroundContactEvent.contactOffset) : '',
      p.firstGroundContactEventLatched&&p.firstGroundContactEvent ? p.firstGroundContactEvent.contactSource : '',
      p.maxGroundDeltaVxEventLatched ? num(p.maxGroundDeltaVxEventLatched.deltaVx,6) : '',
      p.maxGroundDeltaVxEventLatched ? num(p.maxGroundDeltaVxEventLatched.vxBefore,6) : '',
      p.maxGroundDeltaVxEventLatched ? num(p.maxGroundDeltaVxEventLatched.vxAfter,6) : '',
      p.maxGroundDeltaVxEventLatched ? num(p.maxGroundDeltaVxEventLatched.deltaVy,6) : '',
      p.maxGroundDeltaVxEventLatched ? num(p.maxGroundDeltaVxEventLatched.deltaAngular,6) : '',
      p.maxGroundDeltaVxEventLatched ? p.maxGroundDeltaVxEventLatched.substep : '',
      p.maxGroundDeltaVxEventLatched ? num(p.maxGroundDeltaVxEventLatched.contactWidth) : '',
      p.maxGroundDeltaVxEventLatched ? num(p.maxGroundDeltaVxEventLatched.contactOffset) : '',
      p.maxGroundDeltaVxEventLatched ? p.maxGroundDeltaVxEventLatched.contactSource : '',
      ...(p.firstGroundContactEventLatched&&p.firstGroundContactEvent&&p.firstGroundContactEvent.response ? responseSummary(p.firstGroundContactEvent.response,'') : responseSummary(null,'')),
      ...(p.maxGroundDeltaVxEventLatched&&p.maxGroundDeltaVxEventLatched.response ? responseSummary(p.maxGroundDeltaVxEventLatched.response,'') : responseSummary(null,''))
    ]);
    state.allRows.push(...state.rows);
  }

  function startPiece(index){
    setupPhysics();
    const x=state.stageW/2,y=Math.max(80,state.stageH*0.18);
    const p=Piece.create(index,state.images,x,y); p.body.plugin=p.body.plugin||{}; p.body.plugin.debugFixedPiece=true;
    p.body.plugin.narrowLandingCorrectionAppliedLatched=false;
    p.body.plugin.narrowLandingCorrectionLatched=NaN;
    p.body.plugin.narrowLandingContactSpanLatched=NaN;
    p.body.plugin.narrowLandingContactSourceLatched='';
    p.body.plugin.narrowLandingContactOffsetLatched=NaN;
    p.body.plugin.narrowLandingAngularBeforeLatched=NaN;
    p.body.plugin.narrowLandingAngularDeltaLatched=NaN;
    p.body.plugin.narrowLandingAngularAfterLatched=NaN;
    p.body.plugin.narrowLandingWidthConditionLatched=false;
    p.body.plugin.narrowLandingOffsetConditionLatched=false;
    p.body.plugin.narrowLandingDeltaConditionLatched=false;
    p.body.plugin.firstGroundContactEventLatched=false;
    p.body.plugin.firstGroundContactEvent=null;
    p.body.plugin.maxGroundDeltaVxEventLatched=null;
    p.body.plugin.groundContactEventActive=null;
    p.body.plugin.groundContactEvents=[];
    p.body.plugin.groundContactEventChangePoints=[];
    Physics.add(p.body); Physics.hold(p.body,x,y,0); Physics.release(p.body);
    state.index=index; state.frame=0; state.startedAt=performance.now(); state.landingFrame=null;
    state.stableFrame=null; state.stableConsecutiveFrames=0; state.stableConfirmed=false;
    state.measurementEndFrame=null; state.measurementEndReason=''; state.postStableStartFrame=null;
    state.landingContactDetail=null; state.landingOtherDynamicBodyIds=[]; state.rows=[]; state.piece=p; state.body=p.body;
  }

  function observeFrame(){
    if(!state.running || !state.body) return;
    const body=state.body;
    const contact=groundContact(body);
    if(state.landingFrame===null && contact){
      state.landingFrame=state.frame;
      state.landingContactDetail=contactGeometry(body).contactDetails;
      state.landingOtherDynamicBodyIds=(Physics.world?.bodies||[])
        .filter(b=>!b.isStatic && b!==body)
        .map(b=>b.id)
        .filter(v=>v!==undefined);
    }

    const phase=state.landingFrame===null?'falling':'post_landing';
    state.rows.push(rowFor(body,phase));

    if(state.landingFrame!==null){
      const postLandFrames=state.frame-state.landingFrame;
      const motionStable=contact && (
        body.isSleeping ||
        (
          Math.abs(body.velocity.x)<=STABLE_VX_THRESHOLD &&
          Math.abs(body.velocity.y)<=STABLE_VY_THRESHOLD &&
          Math.abs(body.angularVelocity)<=STABLE_ANGULAR_VELOCITY_THRESHOLD
        )
      );

      // A transient low-velocity frame is not enough. The same piece must
      // satisfy the stability condition continuously for STABLE_REQUIRED_FRAMES.
      if(postLandFrames>=MIN_POST_LAND_FRAMES && motionStable){
        if(state.stableConsecutiveFrames===0) state.stableFrame=state.frame;
        state.stableConsecutiveFrames++;
      }else{
        state.stableConsecutiveFrames=0;
        state.stableFrame=null;
      }

      if(state.stableConsecutiveFrames>=STABLE_REQUIRED_FRAMES){
        state.stableConfirmed=true;
        if(state.postStableStartFrame===null) state.postStableStartFrame=state.frame;

        const postStableFrames=state.frame-state.postStableStartFrame;
        if(postStableFrames>=POST_STABLE_FRAMES){
          state.measurementEndFrame=state.frame;
          state.measurementEndReason='stable_confirmed';
          finishPiece('complete','stable_confirmed');
          if(state.index+1<state.images.length){
            setStatus(`${VERSION} 計測中: ${state.index+2}/${state.images.length}`);
            startPiece(state.index+1);
          }else{
            finishRun();
            return;
          }
          return;
        }
      }

      if(postLandFrames>=MAX_POST_LAND_FRAMES){
        state.measurementEndFrame=state.frame;
        state.measurementEndReason=state.stableConfirmed?'max_post_land_after_stable':'max_post_land_timeout';
        finishPiece(state.stableConfirmed?'complete':'timeout',state.measurementEndReason);
        if(state.index+1<state.images.length){
          setStatus(`${VERSION} 計測中: ${state.index+2}/${state.images.length}`);
          startPiece(state.index+1);
        }else{
          finishRun();
          return;
        }
        return;
      }
    }else if(state.frame>=MAX_POST_LAND_FRAMES){
      state.measurementEndFrame=state.frame;
      state.measurementEndReason='fall_timeout';
      finishPiece('timeout','fall_timeout');
      if(state.index+1<state.images.length){
        setStatus(`${VERSION} 計測中: ${state.index+2}/${state.images.length}`);
        startPiece(state.index+1);
      }else{
        finishRun();
        return;
      }
      return;
    }

    state.frame++;
  }

  function installGameLoopHooks(){
    if(typeof Game==='undefined' || !Game || typeof Game.update!=='function' || Game.__measurementV1241Installed) return;
    const originalUpdate=Game.update;
    const originalRender=typeof Game.render==='function' ? Game.render : null;

    Game.update=function(dt){
      originalUpdate(dt);
      // Game.update performs the only Physics.step() for this frame.
      // Measurement only observes the resulting state; it never advances physics itself.
      observeFrame();
    };

    if(originalRender){
      Game.render=function(){
        originalRender();
        if(state.running && state.piece && state.body){
          Renderer.drawPiece(state.piece,0);
        }
      };
    }
    Game.__measurementV1241Installed=true;
  }

  function csvLine(values){ return values.map(v=>{ const s=String(v??''); return /[,\"\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }).join(','); }
  function makeCsv(header,rows){ return '\ufeff'+header.join(',')+'\n'+rows.map(r=>csvLine(r)).join('\n')+'\n'; }

  function metadataRows(){
    const h=['piece','compound_mode','asset','image_width','image_height','mass','inertia','com_offset_px','footprint_width_px','aspect_ratio','physics_parts','triangles','regions','raw_regions','contour_vertices'];
    const rows=state.images.map((im,i)=>{
      // Create a temporary body only if needed for metadata.
      setupPhysics(); const p=Piece.create(i,state.images,state.stageW/2,Math.max(80,state.stageH*0.18)); const b=p.body,pl=b.plugin||{};
      return [i+1,(b.plugin&&b.plugin.debugCompoundMode)||'',`assets/${pad2(i+1)}.${im.src.includes('.PNG')?'PNG':'png'}`,im.naturalWidth||im.width,im.naturalHeight||im.height,num(pl.debugMass||b.mass,5),num(pl.debugInertia||b.inertia,3),num(pl.debugComOffset,3),num(pl.debugFootprintWidth,3),num(pl.debugAspectRatio,4),Number(pl.debugPartCount||0),Number(pl.debugTriangulatedCount||0),Number(pl.debugRegionCount||0),Number(pl.debugRawRegionCount||0),Number(pl.debugContourVertexCount||0)];
    });
    clearDynamicBodies(); return {h,rows};
  }

  function validationRows(){
    const map=new Map();
    for(const row of state.allRows){
      const p=Number(row.split(',')[0]);
      if(!map.has(p)) map.set(p,[]);
      map.get(p).push(row);
    }
    const rows=[];
    for(let i=1;i<=state.images.length;i++){
      const rs=map.get(i)||[];
      const parsed=parseRows(rs);
      const land=parsed.find(a=>a[colIndex('ground_contact')]==='1');
      const lf=land?Number(land[colIndex('frame')]):'';
      const sleep=parsed.find(a=>Number(a[colIndex('sleeping')])===1);
      const stableCandidate=parsed.length && state.index+1===i ? state.stableFrame : '';
      const endFrame=parsed.length ? Number(parsed[parsed.length-1][colIndex('frame')]) : '';
      const stableConfirmed=(state.index+1===i) ? state.stableConfirmed : false;
      const endReason=(state.index+1===i) ? state.measurementEndReason : '';
      const postStableFrames=(stableConfirmed && stableCandidate!==null && stableCandidate!=='')
        ? Math.max(0,endFrame-stableCandidate) : 0;
      rows.push([
        state.run,i,rs.length?'complete':'missing',rs.length,lf,
        stableCandidate===null?'':stableCandidate,endFrame,
        rs.length?endFrame+1:'',
        rs.length>0,lf!=='',stableConfirmed,postStableFrames,endReason
      ]);
    }
    rows.push([state.run,'RUN_TOTAL',state.images.length===rows.length?'complete':'incomplete',state.allRows.length,'','','','','','','','','']);
    return rows;
  }

  function crc32(bytes){ let crc=0xffffffff; for(let i=0;i<bytes.length;i++){ crc^=bytes[i]; for(let j=0;j<8;j++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } return (crc^0xffffffff)>>>0; }
  const u16=(v,o,n)=>v.setUint16(o,n,true), u32=(v,o,n)=>v.setUint32(o,n>>>0,true);
  function zip(files){
    const enc=new TextEncoder(),chunks=[],central=[]; let offset=0; const now=new Date(),year=Math.max(1980,now.getFullYear()),dt=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2),dd=((year-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
    for(const f of files){ const name=enc.encode(f.name),data=enc.encode(f.content),crc=crc32(data),b=new ArrayBuffer(30+name.length+data.length),v=new DataView(b); u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0);u16(v,8,0);u16(v,10,dt);u16(v,12,dd);u32(v,14,crc);u32(v,18,data.length);u32(v,22,data.length);u16(v,26,name.length);u16(v,28,0);new Uint8Array(b,30,name.length).set(name);new Uint8Array(b,30+name.length,data.length).set(data);chunks.push(b);central.push({name,crc,size:data.length,offset});offset+=b.byteLength; }
    const co=offset; for(const e of central){ const b=new ArrayBuffer(46+e.name.length),v=new DataView(b);u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);u16(v,8,0);u16(v,10,0);u16(v,12,dt);u16(v,14,dd);u32(v,16,e.crc);u32(v,20,e.size);u32(v,24,e.size);u16(v,28,e.name.length);u16(v,30,0);u16(v,32,0);u16(v,34,0);u16(v,36,0);u32(v,38,0);u32(v,42,e.offset);new Uint8Array(b,46,e.name.length).set(e.name);chunks.push(b);offset+=b.byteLength; }
    const end=new ArrayBuffer(22),v=new DataView(end);u32(v,0,0x06054b50);u16(v,8,central.length);u16(v,10,central.length);u32(v,12,offset-co);u32(v,16,co);chunks.push(end);return new Blob(chunks,{type:'application/zip'});
  }

  function finishRun(){
    state.running=false; state.piece=null; state.body=null; clearDynamicBodies();
    const meta=metadataRows();
    const files=[{name:'metadata.csv',content:makeCsv(meta.h,meta.rows)},{name:'validation.csv',content:makeCsv(validationHeader,validationRows())}];
    const CHUNK_PIECES=5, summariesByPiece=new Map(), eventsByPiece=new Map(), changesByPiece=new Map(), loopsByPiece=new Map(), rawByPiece=new Map();
    for(const row of state.summaries){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!summariesByPiece.has(piece))summariesByPiece.set(piece,[]);summariesByPiece.get(piece).push(row);}}
    for(const row of state.contactEvents){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!eventsByPiece.has(piece))eventsByPiece.set(piece,[]);eventsByPiece.get(piece).push(row);}}
    for(const row of (state.contactChanges||[])){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!changesByPiece.has(piece))changesByPiece.set(piece,[]);changesByPiece.get(piece).push(row);}}
    for(const row of (state.contactLoops||[])){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!loopsByPiece.has(piece))loopsByPiece.set(piece,[]);loopsByPiece.get(piece).push(row);}}
    for(const r of state.allRows){const piece=Number(r.split(',')[0]);if(Number.isInteger(piece)&&piece>0){if(!rawByPiece.has(piece))rawByPiece.set(piece,[]);rawByPiece.get(piece).push(r);}}
    for(let start=1;start<=state.images.length;start+=CHUNK_PIECES){
      const end=Math.min(start+CHUNK_PIECES-1,state.images.length),summaryRows=[],eventRows=[],changeRows=[],loopRows=[],frameRows=[];
      for(let piece=start;piece<=end;piece++){summaryRows.push(...(summariesByPiece.get(piece)||[]));eventRows.push(...(eventsByPiece.get(piece)||[]));changeRows.push(...(changesByPiece.get(piece)||[]));loopRows.push(...(loopsByPiece.get(piece)||[]));frameRows.push(...selectCompactFrames(rawByPiece.get(piece)||[]));}
      const range=`${pad2(start)}-${pad2(end)}`;
      files.push({name:`summary_${range}.csv`,content:makeCsv(summaryHeader,summaryRows)});
      files.push({name:`contact_events_${range}.csv`,content:makeCsv(contactEventHeader,eventRows)});
      files.push({name:`contact_changes_${range}.csv`,content:makeCsv(contactChangeHeader,changeRows)});
      files.push({name:`contact_loops_${range}.csv`,content:makeCsv(contactLoopHeader,loopRows)});
      files.push({name:`frames_${range}.csv`,content:makeCsv(frameHeader,frameRows)});
    }
    const runFolder=`run${state.run}`; for(const f of files)f.name=`${runFolder}/${f.name}`;
    const blob=zip(files),url=URL.createObjectURL(blob),fileName=`JinSanTowerGame_${VERSION}_run${state.run}_diagnostics.zip`,a=$('measurementDownload');
    if(a){a.href=url;a.download=fileName;a.textContent=`${VERSION} 計測ZIPを保存`;a.classList.remove('hidden');a.style.display='block';try{const auto=document.createElement('a');auto.href=url;auto.download=fileName;auto.style.display='none';document.body.appendChild(auto);auto.click();auto.remove();}catch(e){}}
    // iPhone/iPad: share the generated ZIP directly to the iOS Share Sheet.
    // A Shortcuts share action can then upload the file to GitHub without exposing a token to the game.
    let share=$('measurementShare');
    if(!share){
      share=document.createElement('button'); share.id='measurementShare'; share.type='button';
      share.textContent='ZIPを共有（iPhone）'; share.style.display='block'; share.style.marginTop='8px';
      const parent=a&&a.parentElement ? a.parentElement : $('measurementStatus')?.parentElement;
      if(parent) parent.appendChild(share);
    }
    share.onclick=async()=>{
      try{
        const file=new File([blob],fileName,{type:'application/zip'});
        if(!navigator.share || !navigator.canShare || !navigator.canShare({files:[file]})){
          alert('このブラウザではZIPの共有に対応していません。下の「計測ZIPを保存」からFilesへ保存してください。'); return;
        }
        await navigator.share({title:`${VERSION} Run ${state.run} 計測ログ`,text:`${fileName}`,files:[file]});
        const ss=$('measurementStatus'); if(ss) ss.textContent='共有シートを終了しました。ショートカットを選択した場合はGitHubへの保存処理が続きます。';
      }catch(e){ if(e&&e.name!=='AbortError') alert(`ZIP共有に失敗しました: ${e.message||e}`); }
    };
    const b=$('measurementButton');if(b){b.disabled=false;b.textContent='全ピース自動計測';}
    setStatus(`${VERSION} 計測完了（${state.images.length}ピース / run ${state.run}）`); const ss=$('measurementStatus');if(ss)ss.textContent=`完了。ZIPは自動保存され、iPhoneでは「ZIPを共有（iPhone）」からショートカットへ渡せます。`;
    const modal=$('modeModal');if(modal)modal.classList.remove('hidden');const normal=$('normalModeButton');if(normal)normal.disabled=false;const endless=$('endlessModeButton');if(endless)endless.disabled=false;
  }

  function start(){
    if(state.running) return;
    const run=prompt(`${VERSION} 自動計測\n今回のRun番号を入力してください（例: 1）`,String(state.run));
    if(run===null) return;
    const n=parseInt(run,10); if(!Number.isInteger(n)||n<1){ alert('Run番号は1以上の整数を入力してください。'); return; }
    state.run=n; state.index=0;state.frame=0;state.rows=[];state.allRows=[];state.summaries=[];state.contactEvents=[];state.contactChanges=[];state.contactLoops=[];
    state.stableFrame=null;state.stableConsecutiveFrames=0;state.stableConfirmed=false;state.measurementEndFrame=null;state.measurementEndReason='';state.postStableStartFrame=null;
    state.piece=null;state.body=null;state.running=true;
    const modal=$('modeModal'); if(modal) modal.classList.add('hidden');
    const a=$('measurementDownload'); if(a) a.classList.add('hidden');
    const b=$('measurementButton'); if(b)b.disabled=true;
    setStatus(`${VERSION} 計測開始…`);
    startPiece(0);
  }

  async function init(){
    const params=new URLSearchParams(location.search); if(params.get('debug')!=='on') return;
    const button=$('measurementButton'); if(!button) return;
    try {
      const res = await fetch('js/measurement-config.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('measurement-config.json: HTTP ' + res.status);
      state.measurementConfig = await res.json();
    } catch (e) {
      state.measurementConfig = null;
      console.warn('[measurement] config load failed; using built-in measurement behavior.', e);
    }
    // Remove listeners installed by older measurement scripts by replacing the node.
    const clean=button.cloneNode(true); button.replaceWith(clean);
    clean.addEventListener('click',start);
    installGameLoopHooks();
    state.images=await discoverImages();
    const debug=$('measurementDebug');
    if(debug){
      debug.style.fontFamily='inherit';
      debug.querySelectorAll('*').forEach(el=>{ el.style.fontFamily='inherit'; });
    }
    const title=document.querySelector('.measurementTitle'); if(title) title.textContent=`物理挙動デバッグ ${VERSION}`;
    const status=$('measurementStatus'); if(status) status.textContent=`${state.images.length}ピース検出。着地接触点・Physics Part・残存Body診断を計測できます。`;
    const span=clean.querySelector('span'); if(span) span.textContent='着地前後の衝突データを記録';
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
