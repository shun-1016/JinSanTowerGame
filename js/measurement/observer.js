/* Per-frame measurement observer. */
(() => {
  'use strict';
  const api={};
  api.create=function(ctx){
    const {state,VERSION,Renderer,Physics,setStatus,groundContact,contactGeometry,rowFor,finishPiece,startPiece,finishRun,MIN_POST_LAND_FRAMES,STABLE_REQUIRED_FRAMES,MAX_POST_LAND_FRAMES,STABLE_VX_THRESHOLD,STABLE_VY_THRESHOLD,STABLE_ANGULAR_VELOCITY_THRESHOLD,MEASUREMENT_SUBSTEPS,SLEEP_GROUND_CONTACT_MAX_GAP_SUBSTEPS,getSleepStableGroundContactInfo,Game}=ctx;
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


    return {installGameLoopHooks};
  };
  window.JinSanMeasurementObserver=api;
})();
