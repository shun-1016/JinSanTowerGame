/* CSV/ZIP export and completion UI. */
(() => {
  'use strict';
  const api={};
  api.create=function(ctx){
    const {state,VERSION,$,pad2,num,validationHeader,validationRows,summaryHeader,contactEventHeader,contactChangeHeader,contactLoopHeader,frameHeader,selectCompactFrames,setupPhysics,clearDynamicBodies,Piece,setStatus}=ctx;
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

    return {finishRun};
  };
  window.JinSanMeasurementExport=api;
})();
