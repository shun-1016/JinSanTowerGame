/* v1.39.1 - measurement validation */
(() => {
  'use strict';
  const api={};
  api.create=function(ctx){
    const {state,csvHeader,parseRows,colIndex}=ctx;
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


    return {validationRows};
  };
  window.JinSanMeasurementValidation=api;
})();
