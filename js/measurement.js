/* v1.38.7 - stability-until-rest measurement / latched sleep-after-ground-contact detection */
(() => {
  'use strict';

  const VERSION = 'v1.38.7';
  const ASSET_PREFIX = 'assets/';
  const MAX_DISCOVERY = 999;
  // v1.38.0: measure each piece until it is stably at rest.
  // The physics simulation itself is unchanged; these values affect measurement
  // termination only.
  const MIN_POST_LAND_FRAMES = 30;
  const STABLE_REQUIRED_FRAMES = 20;
  const MAX_POST_LAND_FRAMES = 600;
  // Matter.js sleep can make the active ground-contact pair disappear even though
  // the piece has physically settled. Allow a small substep gap between the last
  // recorded ground-contact event and the observed sleep state.
  const MEASUREMENT_SUBSTEPS = 4;
  const SLEEP_GROUND_CONTACT_MAX_GAP_SUBSTEPS = 4;
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
    'max_post_land_abs_vx','max_post_land_abs_vy','max_post_land_abs_angular_velocity','post_land_x_range','post_land_y_range','post_land_angle_range','max_bounce_height_px','sleep_frame','final_sleeping','final_ground_contact','stable_frame','stable_confirmed','stable_required_frames','stable_confirmation_frames','measurement_end_frame','measurement_end_reason','stable_detection_mode','sleep_ground_contact_end_substep','sleep_ground_contact_gap_substeps','sleep_stable_confirmation_frame',
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

  const validationHeader = ['run','piece','status','raw_row_count','landing_frame','stable_frame','measurement_end_frame','expected_row_count','row_count_ok','landing_present','stable_confirmed','stable_confirmation_frames','measurement_end_reason'];

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
    measurementEndReason: '', postStableStartFrame: null,
    sleepStableConsecutiveFrames: 0, sleepStableFrame: null, sleepStableGroundContactEndSubstep: null,
    sleepStableGroundContactGapSubsteps: null, sleepStableConfirmationFrame: null,
    stableDetectionMode: '', pieceResults: new Map()
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

  function getSleepStableGroundContactInfo(body){
    const events=body?.plugin?.groundContactEvents||[];
    if(!events.length) return null;
    const last=events[events.length-1];
    const endSubstep=Number(last.endSubstep);
    const sleepSubstep=state.frame*MEASUREMENT_SUBSTEPS;
    const gapSubsteps=sleepSubstep-endSubstep;
    if(!Number.isFinite(endSubstep) || !Number.isFinite(gapSubsteps) ||
       Math.abs(gapSubsteps)>SLEEP_GROUND_CONTACT_MAX_GAP_SUBSTEPS){
      return null;
    }
    return {endSubstep,gapSubsteps};
  }

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
    if(Number.isFinite(lf))for(let f=Math.max(0,lf-2);f<=lf+MIN_POST_LAND_FRAMES;f++)keep.add(f);
    // Always retain the actual measurement endpoint. No separate post-stable
    // tail is needed because v1.38.1+ terminates on confirmed stability.
    keep.add(parsed.length-1);
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
    // v1.38.1: persist termination metadata per piece so validation.csv does
    // not depend on the state of the final piece after the whole run completes.
    const pieceNumber=state.index+1;
    state.pieceResults.set(pieceNumber,{
      stableFrame: state.stableFrame,
      stableConfirmed: state.stableConfirmed,
      stableRequiredFrames: STABLE_REQUIRED_FRAMES,
      measurementEndFrame: state.measurementEndFrame,
      measurementEndReason: endReason||state.measurementEndReason||'',
      stableConfirmationFrames: state.stableConfirmed&&state.stableFrame!==null&&state.measurementEndFrame!==null
        ? Math.max(0,state.measurementEndFrame-state.stableFrame+1)
        : 0,
      stableDetectionMode: state.stableDetectionMode||'',
      sleepStableGroundContactEndSubstep: state.sleepStableGroundContactEndSubstep,
      sleepStableGroundContactGapSubsteps: state.sleepStableGroundContactGapSubsteps,
      sleepStableConfirmationFrame: state.sleepStableConfirmationFrame
    });
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
        ? Math.max(0,state.measurementEndFrame-state.stableFrame+1)
        : 0,
      state.measurementEndFrame===null?'':state.measurementEndFrame,
      endReason||state.measurementEndReason||'',
      state.stableDetectionMode||'',
      state.sleepStableGroundContactEndSubstep===null?'':state.sleepStableGroundContactEndSubstep,
      state.sleepStableGroundContactGapSubsteps===null?'':state.sleepStableGroundContactGapSubsteps,
      state.sleepStableConfirmationFrame===null?'':state.sleepStableConfirmationFrame,
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
    state.sleepStableConsecutiveFrames=0; state.sleepStableFrame=null;
    state.sleepStableGroundContactEndSubstep=null; state.sleepStableGroundContactGapSubsteps=null;
    state.sleepStableConfirmationFrame=null; state.stableDetectionMode='';
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

      // v1.38.7: Matter.js may mark a settled body as sleeping. Once sleeping,
      // Detector treats the sleeping body like a static body, so the active
      // ground-contact pair can disappear even though the piece has not moved.
      // Use the recorded ground-contact event immediately before sleep as the
      // physical-contact evidence, but require continuous sleep for the same
      // STABLE_REQUIRED_FRAMES window. Waking resets this path.
      // The substep-gap check is only the entry condition for this path.
      // Once sleep-after-ground-contact is latched, do not re-evaluate the
      // growing gap every frame; otherwise the gap would inevitably exceed
      // the tolerance before STABLE_REQUIRED_FRAMES is reached.
      let sleepStable=false;
      if(postLandFrames>=MIN_POST_LAND_FRAMES && body.isSleeping){
        if(state.sleepStableConsecutiveFrames>0){
          sleepStable=true;
        }else{
          const sleepContactInfo=getSleepStableGroundContactInfo(body);
          if(sleepContactInfo){
            sleepStable=true;
            state.sleepStableGroundContactEndSubstep=sleepContactInfo.endSubstep;
            state.sleepStableGroundContactGapSubsteps=sleepContactInfo.gapSubsteps;
          }
        }
      }

      if(postLandFrames>=MIN_POST_LAND_FRAMES && motionStable){
        if(state.stableConsecutiveFrames===0) state.stableFrame=state.frame;
        state.stableConsecutiveFrames++;
      }else{
        state.stableConsecutiveFrames=0;
        state.stableFrame=null;
        state.postStableStartFrame=null;
      }

      if(sleepStable){
        if(state.sleepStableConsecutiveFrames===0){
          state.sleepStableFrame=state.frame;
        }
        state.sleepStableConsecutiveFrames++;
      }else{
        state.sleepStableConsecutiveFrames=0;
        state.sleepStableFrame=null;
        state.sleepStableGroundContactEndSubstep=null;
        state.sleepStableGroundContactGapSubsteps=null;
      }

      const contactMotionConfirmed=state.stableConsecutiveFrames>=STABLE_REQUIRED_FRAMES;
      const sleepConfirmed=state.sleepStableConsecutiveFrames>=STABLE_REQUIRED_FRAMES;

      if(contactMotionConfirmed || sleepConfirmed){
        state.stableConfirmed=true;
        state.stableDetectionMode=sleepConfirmed && !contactMotionConfirmed
          ? 'SLEEP_AFTER_GROUND_CONTACT'
          : 'CONTACT_MOTION';
        if(sleepConfirmed && !contactMotionConfirmed){
          state.stableFrame=state.sleepStableFrame;
          state.sleepStableConfirmationFrame=state.frame;
        }
        state.postStableStartFrame=state.stableFrame;
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
      const endFrame=parsed.length ? Number(parsed[parsed.length-1][colIndex('frame')]) : '';
      const result=state.pieceResults.get(i)||{};
      const stableFrame=result.stableFrame===null||result.stableFrame===undefined?'':result.stableFrame;
      const stableConfirmed=!!result.stableConfirmed;
      const measurementEndFrame=result.measurementEndFrame===null||result.measurementEndFrame===undefined
        ? endFrame
        : result.measurementEndFrame;
      const endReason=result.measurementEndReason||'';
      const stableConfirmationFrames=Number.isFinite(Number(result.stableConfirmationFrames))
        ? Number(result.stableConfirmationFrames) : 0;
      const expectedRowCount=rs.length?endFrame+1:'';
      const rowCountOk=rs.length>0 && Number.isFinite(Number(expectedRowCount)) && rs.length===Number(expectedRowCount);
      rows.push([
        state.run,i,rs.length?'complete':'missing',rs.length,lf,
        stableFrame,measurementEndFrame,
        expectedRowCount,rowCountOk,rs.length>0,lf!=='',
        stableConfirmed,stableConfirmationFrames,endReason
      ]);
    }
    rows.push([state.run,'RUN_TOTAL',state.images.length===rows.length?'complete':'incomplete',state.allRows.length,'','','','','','','','','','']);
    return rows;
  }

  function crc32(bytes){
    let crc=0xffffffff;
    for(let i=0;i<bytes.length;i++){
      crc^=bytes[i];
      for(let j=0;j<8;j++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    }
    return (crc^0xffffffff)>>>0;
  }

  const zipU16=(view,offset,value)=>view.setUint16(offset,value,true);
  const zipU32=(view,offset,value)=>view.setUint32(offset,value>>>0,true);

  function zip(files){
    const enc=new TextEncoder();
    const localChunks=[];
    const centralChunks=[];
    let offset=0;

    for(const file of files){
      const name=enc.encode(file.name);
      const data=enc.encode(file.content);
      const crc=crc32(data);

      // ZIP local file header + UTF-8 filename + uncompressed data.
      const local=new ArrayBuffer(30+name.length+data.length);
      const lv=new DataView(local);
      zipU32(lv,0,0x04034b50);
      zipU16(lv,4,20);
      zipU16(lv,6,0);
      zipU16(lv,8,0);
      zipU16(lv,10,0);
      zipU16(lv,12,0);
      zipU32(lv,14,crc);
      zipU32(lv,18,data.length);
      zipU32(lv,22,data.length);
      zipU16(lv,26,name.length);
      zipU16(lv,28,0);
      new Uint8Array(local,30,name.length).set(name);
      new Uint8Array(local,30+name.length,data.length).set(data);

      localChunks.push(local);

      // ZIP central-directory entry.
      const central=new ArrayBuffer(46+name.length);
      const cv=new DataView(central);
      zipU32(cv,0,0x02014b50);
      zipU16(cv,4,20);
      zipU16(cv,6,20);
      zipU16(cv,8,0);
      zipU16(cv,10,0);
      zipU16(cv,12,0);
      zipU16(cv,14,0);
      zipU32(cv,16,crc);
      zipU32(cv,20,data.length);
      zipU32(cv,24,data.length);
      zipU16(cv,28,name.length);
      zipU16(cv,30,0);
      zipU16(cv,32,0);
      zipU16(cv,34,0);
      zipU16(cv,36,0);
      zipU32(cv,38,0);
      zipU32(cv,42,offset);
      new Uint8Array(central,46,name.length).set(name);

      centralChunks.push(central);
      offset+=local.byteLength;
    }

    const centralOffset=offset;
    let centralSize=0;
    for(const chunk of centralChunks) centralSize+=chunk.byteLength;

    const end=new ArrayBuffer(22);
    const ev=new DataView(end);
    zipU32(ev,0,0x06054b50);
    zipU16(ev,4,0);
    zipU16(ev,6,0);
    zipU16(ev,8,centralChunks.length);
    zipU16(ev,10,centralChunks.length);
    zipU32(ev,12,centralSize);
    zipU32(ev,16,centralOffset);
    zipU16(ev,20,0);

    return new Blob(
      [...localChunks,...centralChunks,end],
      {type:'application/zip'}
    );
  }


  function finishRun(){
    state.running=false; state.piece=null; state.body=null; clearDynamicBodies();

    // Keep the completion panel independent from export processing so an export
    // failure can be reported directly on the measurement screen.
    let result=$('measurementResult');
    if(!result){
      result=document.createElement('div');
      result.id='measurementResult';
      result.className='measurementResult';
      document.body.appendChild(result);
    }
    result.innerHTML='';
    const title=document.createElement('div');
    title.textContent=`${VERSION} 計測完了。ZIPを準備しています…`;
    title.style.fontWeight='700';
    title.style.marginBottom='8px';
    result.appendChild(title);

    const fileName=`JinSanTowerGame_${VERSION}_run${state.run}_diagnostics.zip`;
    let blob=null, url='';
    let exportStage='初期化';
    let exportStats={
      images:state.images.length,
      allRows:state.allRows.length,
      summaries:state.summaries.length,
      contactEvents:state.contactEvents.length,
      contactChanges:(state.contactChanges||[]).length,
      contactLoops:(state.contactLoops||[]).length,
      files:0,
      csvChars:0
    };
    const setStage=(stage)=>{ exportStage=stage; };
    const addFile=(files,name,header,rows)=>{
      setStage(`${name} のCSV生成`);
      const content=makeCsv(header,rows);
      exportStats.csvChars+=content.length;
      files.push({name,content});
      exportStats.files=files.length;
    };
    const diagnosticText=(error)=>{
      const lines=[
        `${VERSION} export diagnostic`,
        `stage=${exportStage}`,
        `error_name=${error&&error.name?error.name:''}`,
        `error_message=${error&&error.message?error.message:String(error)}`,
        `images=${exportStats.images}`,
        `allRows=${exportStats.allRows}`,
        `summaries=${exportStats.summaries}`,
        `contactEvents=${exportStats.contactEvents}`,
        `contactChanges=${exportStats.contactChanges}`,
        `contactLoops=${exportStats.contactLoops}`,
        `files=${exportStats.files}`,
        `csvChars=${exportStats.csvChars}`
      ];
      if(error&&error.stack) lines.push('',String(error.stack).slice(0,4000));
      return lines.join('\n');
    };

    try{
      setStage('metadata.csv の元データ生成');
      const meta=metadataRows();
      const files=[];
      addFile(files,'metadata.csv',meta.h,meta.rows);
      setStage('validation.csv の元データ生成');
      addFile(files,'validation.csv',validationHeader,validationRows());

      const CHUNK_PIECES=5;
      const summariesByPiece=new Map(), eventsByPiece=new Map(), changesByPiece=new Map(), loopsByPiece=new Map(), rawByPiece=new Map();
      setStage('ピース別データの振り分け');
      for(const row of state.summaries){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!summariesByPiece.has(piece))summariesByPiece.set(piece,[]);summariesByPiece.get(piece).push(row);}}
      for(const row of state.contactEvents){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!eventsByPiece.has(piece))eventsByPiece.set(piece,[]);eventsByPiece.get(piece).push(row);}}
      for(const row of (state.contactChanges||[])){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!changesByPiece.has(piece))changesByPiece.set(piece,[]);changesByPiece.get(piece).push(row);}}
      for(const row of (state.contactLoops||[])){const piece=Number(row[1]);if(Number.isInteger(piece)&&piece>0){if(!loopsByPiece.has(piece))loopsByPiece.set(piece,[]);loopsByPiece.get(piece).push(row);}}
      for(const r of state.allRows){const piece=Number(r.split(',')[0]);if(Number.isInteger(piece)&&piece>0){if(!rawByPiece.has(piece))rawByPiece.set(piece,[]);rawByPiece.get(piece).push(r);}}

      for(let start=1;start<=state.images.length;start+=CHUNK_PIECES){
        const end=Math.min(start+CHUNK_PIECES-1,state.images.length),summaryRows=[],eventRows=[],changeRows=[],loopRows=[],frameRows=[];
        setStage(`ピース ${start}-${end} のCSVデータ抽出`);
        for(let piece=start;piece<=end;piece++){
          summaryRows.push(...(summariesByPiece.get(piece)||[]));
          eventRows.push(...(eventsByPiece.get(piece)||[]));
          changeRows.push(...(changesByPiece.get(piece)||[]));
          loopRows.push(...(loopsByPiece.get(piece)||[]));
          frameRows.push(...selectCompactFrames(rawByPiece.get(piece)||[]));
        }
        const range=`${pad2(start)}-${pad2(end)}`;
        addFile(files,`summary_${range}.csv`,summaryHeader,summaryRows);
        addFile(files,`contact_events_${range}.csv`,contactEventHeader,eventRows);
        addFile(files,`contact_changes_${range}.csv`,contactChangeHeader,changeRows);
        addFile(files,`contact_loops_${range}.csv`,contactLoopHeader,loopRows);
        addFile(files,`frames_${range}.csv`,frameHeader,frameRows);
      }

      setStage('ZIP内ファイル名の確定');
      const runFolder=`run${state.run}`;
      for(const f of files) f.name=`${runFolder}/${f.name}`;

      setStage(`ZIPバイナリ生成（${files.length}ファイル / ${exportStats.csvChars}文字）`);
      if(files.length===0) throw new Error('ZIP対象ファイルが0件です。');
      blob=zip(files);
      if(!blob || !blob.size) throw new Error('ZIP Blobが空です。');
      exportStats.zipBytes=blob.size;

      setStage('ZIP Blob URL生成');
      url=URL.createObjectURL(blob);
      if(!url) throw new Error('ZIP Blob URLの生成に失敗しました。');
    }catch(e){
      const message=e&&e.message?e.message:String(e);
      const diagnostic=diagnosticText(e);
      title.textContent=`${VERSION} 計測は完了しましたが、ZIP生成に失敗しました。`;
      const detail=document.createElement('div');
      detail.style.fontSize='12px';
      detail.style.marginTop='4px';
      detail.style.whiteSpace='pre-wrap';
      detail.textContent=`発生箇所: ${exportStage}\nエラー: ${message}\nファイル数: ${exportStats.files}\nCSV文字数: ${exportStats.csvChars}`;
      result.appendChild(detail);

      // Small text export for the failure case. This is intentionally separate
      // from the ZIP path so the next run can report the exact failing stage.
      try{
        const diagBlob=new Blob([diagnostic],{type:'text/plain;charset=utf-8'});
        const diagUrl=URL.createObjectURL(diagBlob);
        const diag=document.createElement('a');
        diag.href=diagUrl;
        diag.download=`JinSanTowerGame_${VERSION}_run${state.run}_export_error.txt`;
        diag.textContent='ZIP生成エラー診断を保存';
        diag.style.display='block'; diag.style.marginTop='8px';
        result.appendChild(diag);
      }catch(diagError){
        console.error('[measurement] diagnostic export failed',diagError);
      }

      console.error('[measurement] export failed',diagnostic,e);
      const b=$('measurementButton'); if(b){b.disabled=false;b.textContent='全ピース自動計測';}
      setStatus(`${VERSION} 計測完了 / ZIP生成エラー（${exportStage}）`);
      return;
    }

    title.textContent=`${VERSION} 計測完了（${state.images.length}ピース / run ${state.run}）`;
    const a=document.createElement('a');
    a.id='measurementDownload';
    a.href=url;
    a.download=fileName;
    a.textContent=`${VERSION} 計測ZIPを保存`;
    a.style.display='block';
    a.style.textAlign='center';
    a.style.fontWeight='700';
    a.style.textDecoration='none';
    a.style.padding='12px';
    a.style.border='1px solid rgba(0,0,0,.25)';
    a.style.borderRadius='10px';
    a.style.background='#fff';
    a.style.color='inherit';
    result.appendChild(a);

    const share=document.createElement('button');
    share.id='measurementShare'; share.type='button';
    share.textContent='ZIPを共有（iPhone）';
    share.style.display='block'; share.style.width='100%'; share.style.marginTop='8px';
    share.style.minHeight='44px';
    result.appendChild(share);
    share.onclick=async()=>{
      try{
        const file=new File([blob],fileName,{type:'application/zip'});
        if(!navigator.share || !navigator.canShare || !navigator.canShare({files:[file]})){
          alert('このブラウザではZIPの共有に対応していません。「計測ZIPを保存」から保存してください。'); return;
        }
        await navigator.share({title:`${VERSION} Run ${state.run} 計測ログ`,text:fileName,files:[file]});
        const ss=$('measurementStatus'); if(ss) ss.textContent='共有シートを終了しました。ショートカットを選択した場合はGitHubへの保存処理が続きます。';
      }catch(e){ if(e&&e.name!=='AbortError') alert(`ZIP共有に失敗しました: ${e.message||e}`); }
    };

    const b=$('measurementButton');if(b){b.disabled=false;b.textContent='全ピース自動計測';}
    setStatus(`${VERSION} 計測完了（${state.images.length}ピース / run ${state.run}）`);
    const ss=$('measurementStatus');if(ss)ss.textContent=`完了。画面下部の「${VERSION} 計測ZIPを保存」から保存できます。iPhoneでは「ZIPを共有（iPhone）」も利用できます。`;
    const modal=$('modeModal');if(modal)modal.classList.remove('hidden');const normal=$('normalModeButton');if(normal)normal.disabled=false;const endless=$('endlessModeButton');if(endless)endless.disabled=false;
  }

  function start(){
    if(state.running) return;
    const run=prompt(`${VERSION} 自動計測\n今回のRun番号を入力してください（例: 1）`,String(state.run));
    if(run===null) return;
    const n=parseInt(run,10); if(!Number.isInteger(n)||n<1){ alert('Run番号は1以上の整数を入力してください。'); return; }
    state.run=n; state.index=0;state.frame=0;state.rows=[];state.allRows=[];state.summaries=[];state.contactEvents=[];state.contactChanges=[];state.contactLoops=[];state.pieceResults=new Map();
    state.stableFrame=null;state.stableConsecutiveFrames=0;state.stableConfirmed=false;state.measurementEndFrame=null;state.measurementEndReason='';state.postStableStartFrame=null;
    state.sleepStableConsecutiveFrames=0;state.sleepStableFrame=null;state.sleepStableGroundContactEndSubstep=null;state.sleepStableGroundContactGapSubsteps=null;state.sleepStableConfirmationFrame=null;state.stableDetectionMode='';
    state.piece=null;state.body=null;state.running=true;
    const modal=$('modeModal'); if(modal) modal.classList.add('hidden');
    const a=$('measurementDownload'); if(a) a.classList.add('hidden');
    const result=$('measurementResult'); if(result) result.remove();
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
