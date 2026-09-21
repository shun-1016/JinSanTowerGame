/* v1.39.0 - per-piece summary and contact aggregation */
(() => {
  'use strict';
  const api={};
  api.create=function(ctx){
    const {state,Physics,Piece,STABLE_REQUIRED_FRAMES,parseRows,colIndex,nums,num,buildContactLoopRows,responseSummary,summaryHeader}=ctx;
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


    return {finishPiece};
  };
  window.JinSanMeasurementSummary=api;
})();
