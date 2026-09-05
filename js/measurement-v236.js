/* v23.6.1 - measurement logger / dynamic piece discovery */
(() => {
  'use strict';

  const VERSION = 'v23.6.1';
  const ASSET_PREFIX = 'assets/';
  const MAX_PIECE_DISCOVERY = 999;
  const BASE_WIDTH_RATIO = 0.82;
  const POST_LAND_FRAMES = 60;
  const MAX_FALL_FRAMES = 600;
  const DEFAULT_RUN_NUMBER = 1;

  const state = {
    images: [],
    pieceIndex: 0,
    frame: 0,
    startedAt: 0,
    landingFrame: null,
    postLandFrames: 0,
    rows: [],
    summaries: [],
    current: null,
    running: false,
    runNumber: DEFAULT_RUN_NUMBER,
    stageW: 390,
    stageH: 500,
    baseWidth: 0,
    raf: 0,
  };

  const csvHeader = [
    'piece','phase','frame','time_ms','landing_frame',
    'x','y','velocity_x','velocity_y','speed','angular_velocity','angle',
    'sleeping','ground_contact',
    'mass','inertia','com_offset_px','footprint_width_px',
    'bottom_width_1px','bottom_width_2px','bottom_width_4px','bottom_width_8px',
    'contact_width_px','contact_center_offset_px','contact_points','contact_parts',
    'aspect_ratio','physics_parts','triangles','regions','raw_regions','contour_vertices'
  ];

  const summaryHeader = [
    'run','piece','status','frame_count','landing_frame','post_land_frame_count',
    'mass','inertia','com_offset_px','footprint_width_px',
    'bottom_width_1px','bottom_width_2px','bottom_width_4px','bottom_width_8px',
    'contact_width_px','contact_center_offset_px','contact_points','contact_parts',
    'max_speed','max_angular_velocity','min_angle','max_angle','angle_range',
    'min_x','max_x','x_range','sleep_frame','final_sleeping','final_ground_contact',
    'physics_parts','triangles','regions','raw_regions','contour_vertices'
  ];

  function $(id){ return document.getElementById(id); }

  function pad2(n){ return String(n).padStart(2, '0'); }

  function loadImage(number) {
    const label = pad2(number);
    const tryPath = (ext) => new Promise(resolve => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = `${ASSET_PREFIX}${label}.${ext}`;
    });
    return tryPath('png').then(im => im || tryPath('PNG'));
  }

  async function discoverImages() {
    const images = [];
    for(let number = 1; number <= MAX_PIECE_DISCOVERY; number++){
      const im = await loadImage(number);
      if(!im) break;
      images.push(im);
    }
    return images;
  }

  function clearDynamicBodies() {
    if(!Physics.world) return;
    const dynamic = Physics.world.bodies.filter(body => !body.isStatic);
    if(dynamic.length) Matter.World.remove(Physics.world, dynamic);
  }

  function getStageSize() {
    const size = Renderer.resize();
    state.stageW = size.width;
    state.stageH = size.height;
    state.baseWidth = state.stageW * BASE_WIDTH_RATIO;
  }

  function setupPhysics() {
    clearDynamicBodies();
    Physics.setup(state.stageW, state.stageH - 12, state.baseWidth, false);
  }

  function hasGroundContact(body) {
    for(const pair of Physics.engine.pairs.list){
      if(!pair.isActive) continue;
      const a = pair.bodyA && pair.bodyA.parent ? pair.bodyA.parent : pair.bodyA;
      const b = pair.bodyB && pair.bodyB.parent ? pair.bodyB.parent : pair.bodyB;
      if((a === body && b && b.label === 'ground') ||
         (b === body && a && a.label === 'ground')) return true;
    }
    return false;
  }

  function contactGeometry(body) {
    const result = {
      contactPoints: 0,
      contactWidth: 0,
      contactCenterOffset: 0,
      contactParts: 0,
      bottomWidth1: 0,
      bottomWidth2: 0,
      bottomWidth4: 0,
      bottomWidth8: 0
    };

    const parts = (body.parts || []).slice(1);
    if(parts.length){
      const verts = parts.flatMap(part => part.vertices || []);
      if(verts.length){
        const maxY = Math.max(...verts.map(v => v.y));
        for(const [key, band] of [
          ['bottomWidth1',1], ['bottomWidth2',2],
          ['bottomWidth4',4], ['bottomWidth8',8]
        ]){
          const near = verts.filter(v => v.y >= maxY - band);
          if(near.length){
            result[key] = Math.max(...near.map(v => v.x)) - Math.min(...near.map(v => v.x));
          }
        }
      }
    }

    const xs = [];
    const partIds = new Set();
    const groundY = state.stageH - 12;

    for(const pair of Physics.engine.pairs.list){
      if(!pair.isActive) continue;
      const a = pair.bodyA, b = pair.bodyB;
      const aParent = a && a.parent ? a.parent : a;
      const bParent = b && b.parent ? b.parent : b;
      const groundA = a && a.label === 'ground';
      const groundB = b && b.label === 'ground';
      if(!((aParent === body && groundB) || (bParent === body && groundA))) continue;

      const movingPart = aParent === body ? a : b;
      if(movingPart && movingPart.id !== undefined) partIds.add(movingPart.id);

      const contacts = pair.contacts || [];
      const count = Math.min(pair.contactCount || 0, contacts.length);
      for(let i = 0; i < count; i++){
        const vertex = contacts[i] && contacts[i].vertex;
        if(vertex && Math.abs(vertex.y - groundY) < 8) xs.push(vertex.x);
      }
    }

    result.contactPoints = xs.length;
    result.contactParts = partIds.size;
    if(xs.length){
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      result.contactWidth = maxX - minX;
      result.contactCenterOffset = (minX + maxX) / 2 - body.position.x;
    }
    return result;
  }

  function num(v, digits = 3) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(digits) : '';
  }

  function measurementRow(piece, contact) {
    const b = piece.body;
    const pl = b.plugin || {};
    const cg = contactGeometry(b);
    const t = Math.max(0, performance.now() - state.startedAt);
    const phase = state.landingFrame === null ? 'falling' : 'post_landing';

    return [
      piece.index + 1, phase, state.frame, num(t,1),
      state.landingFrame === null ? '' : state.landingFrame,
      num(b.position.x), num(b.position.y),
      num(b.velocity.x,5), num(b.velocity.y,5),
      num(b.speed,5), num(b.angularVelocity,6), num(b.angle,6),
      b.isSleeping ? 1 : 0, contact ? 1 : 0,
      num(pl.debugMass || b.mass,5), num(pl.debugInertia || b.inertia,3),
      num(pl.debugComOffset,3), num(pl.debugFootprintWidth,3),
      num(cg.bottomWidth1), num(cg.bottomWidth2), num(cg.bottomWidth4), num(cg.bottomWidth8),
      num(cg.contactWidth), num(cg.contactCenterOffset),
      cg.contactPoints, cg.contactParts,
      num(pl.debugAspectRatio,4),
      Number(pl.debugPartCount || 0), Number(pl.debugTriangulatedCount || 0),
      Number(pl.debugRegionCount || 0), Number(pl.debugRawRegionCount || 0),
      Number(pl.debugContourVertexCount || 0)
    ].join(',');
  }

  function startPiece(index) {
    setupPhysics();

    const x = state.stageW / 2;
    const y = Math.max(80, state.stageH * 0.18);
    const piece = Piece.create(index, state.images, x, y);
    piece.body.plugin = piece.body.plugin || {};
    piece.body.plugin.debugFixedPiece = true;

    Physics.add(piece.body);
    Physics.hold(piece.body, x, y, 0);
    Physics.release(piece.body);

    state.pieceIndex = index;
    state.current = piece;
    state.frame = 0;
    state.startedAt = performance.now();
    state.landingFrame = null;
    state.postLandFrames = 0;
    state.rows = [];
  }

  function summarizePiece(status) {
    const rows = state.rows;
    const numeric = (column) => rows
      .map(row => Number(row.split(',')[column]))
      .filter(Number.isFinite);

    const col = {
      x: 5, speed: 9, angular: 10, angle: 11, sleeping: 12,
      mass: 14, inertia: 15, com: 16, footprint: 17,
      bw1: 18, bw2: 19, bw4: 20, bw8: 21,
      cw: 22, cco: 23, cp: 24, cparts: 25,
      parts: 27, triangles: 28, regions: 29, rawRegions: 30, contour: 31
    };

    const xs = numeric(col.x);
    const speeds = numeric(col.speed);
    const angular = numeric(col.angular);
    const angles = numeric(col.angle);

    const first = rows[0] ? rows[0].split(',') : [];
    const last = rows.length ? rows[rows.length - 1].split(',') : [];
    const landingIndex = state.landingFrame === null ? 0 : Math.min(state.landingFrame, Math.max(0, rows.length - 1));
    const landing = rows[landingIndex] ? rows[landingIndex].split(',') : first;

    const firstNum = (index) => Number(first[index]);
    const lastNum = (index) => Number(last[index]);
    const landingNum = (index) => Number(landing[index]);
    const safe = (value) => Number.isFinite(value) ? value : '';

    const sleepValues = numeric(col.sleeping);
    const sleepIndex = sleepValues.findIndex(v => v === 1);
    const sleepFrame = sleepIndex >= 0 ? rows[sleepIndex].split(',')[2] : '';

    return [
      state.runNumber,
      state.pieceIndex + 1,
      status,
      rows.length,
      state.landingFrame === null ? '' : state.landingFrame,
      state.landingFrame === null ? 0 : Math.max(0, rows.length - state.landingFrame - 1),
      safe(firstNum(col.mass)), safe(firstNum(col.inertia)),
      safe(firstNum(col.com)), safe(firstNum(col.footprint)),
      safe(firstNum(col.bw1)), safe(firstNum(col.bw2)),
      safe(firstNum(col.bw4)), safe(firstNum(col.bw8)),
      safe(landingNum(col.cw)), safe(landingNum(col.cco)),
      safe(landingNum(col.cp)), safe(landingNum(col.cparts)),
      safe(speeds.length ? Math.max(...speeds) : NaN),
      safe(angular.length ? Math.max(...angular.map(Math.abs)) : NaN),
      safe(angles.length ? Math.min(...angles) : NaN),
      safe(angles.length ? Math.max(...angles) : NaN),
      safe(angles.length ? Math.max(...angles) - Math.min(...angles) : NaN),
      safe(xs.length ? Math.min(...xs) : NaN),
      safe(xs.length ? Math.max(...xs) : NaN),
      safe(xs.length ? Math.max(...xs) - Math.min(...xs) : NaN),
      sleepFrame,
      lastNum(col.sleeping) === 1 ? 1 : 0,
      lastNum(13) === 1 ? 1 : 0,
      safe(firstNum(col.parts)), safe(firstNum(col.triangles)),
      safe(firstNum(col.regions)), safe(firstNum(col.rawRegions)),
      safe(firstNum(col.contour))
    ].join(',');
  }

  function finishPiece(status) {
    state.summaries.push(summarizePiece(status));
    state.current = null;
    state.rows = [];
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[,"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function makeCsv(header, rows) {
    return '\ufeff' + header.join(',') + '\n' + rows.map(row => row.split(',').map(csvEscape).join(',')).join('\n') + '\n';
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for(let i = 0; i < bytes.length; i++){
      crc ^= bytes[i];
      for(let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(view, offset, value){ view.setUint16(offset, value, true); }
  function u32(view, offset, value){ view.setUint32(offset, value >>> 0, true); }

  function createZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const year = Math.max(1980, now.getFullYear());
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    for(const file of files){
      const nameBytes = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = crc32(data);
      const local = new ArrayBuffer(30 + nameBytes.length + data.length);
      const view = new DataView(local);
      u32(view,0,0x04034b50); u16(view,4,20); u16(view,6,0); u16(view,8,0);
      u16(view,10,dosTime); u16(view,12,dosDate); u32(view,14,crc);
      u32(view,18,data.length); u32(view,22,data.length);
      u16(view,26,nameBytes.length); u16(view,28,0);
      new Uint8Array(local,30,nameBytes.length).set(nameBytes);
      new Uint8Array(local,30+nameBytes.length,data.length).set(data);
      chunks.push(local);
      central.push({nameBytes,crc,size:data.length,offset});
      offset += local.byteLength;
    }

    const centralOffset = offset;
    for(const entry of central){
      const block = new ArrayBuffer(46 + entry.nameBytes.length);
      const view = new DataView(block);
      u32(view,0,0x02014b50); u16(view,4,20); u16(view,6,20); u16(view,8,0);
      u16(view,10,0); u16(view,12,dosTime); u16(view,14,dosDate);
      u32(view,16,entry.crc); u32(view,20,entry.size); u32(view,24,entry.size);
      u16(view,28,entry.nameBytes.length); u16(view,30,0); u16(view,32,0);
      u16(view,34,0); u16(view,36,0); u32(view,38,0); u32(view,42,entry.offset);
      new Uint8Array(block,46,entry.nameBytes.length).set(entry.nameBytes);
      chunks.push(block);
      offset += block.byteLength;
    }

    const end = new ArrayBuffer(22);
    const endView = new DataView(end);
    u32(endView,0,0x06054b50); u16(endView,4,0); u16(endView,6,0);
    u16(endView,8,central.length); u16(endView,10,central.length);
    u32(endView,12,offset-centralOffset); u32(endView,16,centralOffset); u16(endView,20,0);
    chunks.push(end);
    return new Blob(chunks, {type:'application/zip'});
  }

  function metadataRows() {
    return state.images.map((im, index) => {
      const size = Piece.size ? Piece.size(im) : null;
      const p = Piece.create(index, state.images, state.stageW/2, state.stageH*0.18);
      const b = p.body;
      const pl = b.plugin || {};
      const cg = contactGeometry(b);
      const row = [
        index + 1,
        (() => {
          const match = String(im.src || '').match(/\.([^.\/]+)(?:\?.*)?$/);
          return `assets/${pad2(index+1)}.${match ? match[1] : 'png'}`;
        })(),
        im.naturalWidth || im.width || '',
        im.naturalHeight || im.height || '',
        num(b.mass,5), num(b.inertia,3),
        num(pl.debugComOffset,3), num(pl.debugFootprintWidth,3),
        num(pl.debugAspectRatio,4),
        Number(pl.debugPartCount || 0), Number(pl.debugTriangulatedCount || 0),
        Number(pl.debugRegionCount || 0), Number(pl.debugRawRegionCount || 0),
        Number(pl.debugContourVertexCount || 0),
        Number(pl.debugHoleCount || 0),
        pl.debugFallback ? 1 : 0
      ];
      Matter.World.remove(Physics.world, b);
      return row;
    });
  }

  function makeMetadataCsv() {
    const header = [
      'piece','asset_path','natural_width_px','natural_height_px','mass','inertia',
      'com_offset_px','footprint_width_px','aspect_ratio','physics_parts','triangles',
      'regions','raw_regions','contour_vertices','holes','fallback'
    ];
    return '\ufeff' + header.join(',') + '\n' +
      metadataRows().map(row => row.join(',')).join('\n') + '\n';
  }

  function makeValidationCsv() {
    const rows = [];
    let completeCount = 0;
    for(let i = 0; i < state.images.length; i++){
      const raw = state.completedRaw[i] || [];
      const summary = state.summaries[i] ? state.summaries[i].split(',') : [];
      const status = summary[2] || 'missing';
      const landing = Number(summary[4]);
      const expected = Number.isFinite(landing) ? landing + POST_LAND_FRAMES + 1 : '';
      const rowCountOk = status === 'complete' && raw.length === expected;
      const landingPresent = Number.isFinite(landing) && raw.some(row => Number(row.split(',')[2]) === landing);
      const postLand60Ok = rowCountOk && raw.length > 0;
      if(rowCountOk && landingPresent && postLand60Ok) completeCount++;
      rows.push([
        state.runNumber, i + 1, status, raw.length,
        Number.isFinite(landing) ? landing : '',
        expected, rowCountOk ? 1 : 0, landingPresent ? 1 : 0,
        postLand60Ok ? 1 : 0
      ]);
    }

    const header = [
      'run','piece','status','raw_row_count','landing_frame',
      'expected_row_count','row_count_ok','landing_present','post_land_60_ok'
    ];

    const footer = [
      '', '', 'RUN_TOTAL',
      state.images.length, '', state.images.length,
      completeCount === state.images.length ? 1 : 0,
      completeCount, POST_LAND_FRAMES
    ];

    return '\ufeff' + header.join(',') + '\n' +
      rows.map(row => row.join(',')).join('\n') + '\n' +
      footer.join(',') + '\n';
  }

  function downloadRun() {
    const folder = String(state.runNumber);
    const files = [];
    files.push({name:`${folder}/metadata.csv`, content:makeMetadataCsv()});
    files.push({name:`${folder}/summary.csv`, content:'\ufeff' + summaryHeader.join(',') + '\n' + state.summaries.join('\n') + '\n'});
    files.push({name:`${folder}/validation.csv`, content:makeValidationCsv()});

    for(let i = 0; i < state.images.length; i++){
      const rows = state.completedRaw[i] || [];
      files.push({name:`${folder}/${pad2(i+1)}.csv`, content:makeCsv(csvHeader, rows)});
    }

    const zip = createZip(files);
    const url = URL.createObjectURL(zip);
    const stamp = new Date();
    const filename = `JinSanTowerGame_${VERSION}_run${pad2(state.runNumber)}_${stamp.getFullYear()}${pad2(stamp.getMonth()+1)}${pad2(stamp.getDate())}${pad2(stamp.getHours())}${pad2(stamp.getMinutes())}${pad2(stamp.getSeconds())}.zip`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.textContent = '計測ZIPを保存';
    link.className = 'measurementDownload';
    link.style.display = 'block';
    link.style.marginTop = '8px';
    ui.downloadHost.replaceChildren(link);
    link.click();

    ui.status.textContent = `完了：${state.images.length}ピース / ${state.summaries.length}試行。${folder}/metadata.csv・summary.csv・${state.images.length} CSVを出力しました。`;
    ui.button.disabled = false;
    ui.runInput.disabled = false;
    state.running = false;
    updateMeasurementOverlay();
    const modeModal = document.getElementById('modeModal');
    if(modeModal) modeModal.classList.remove('hidden');
    URL.revokeObjectURL(url);
  }

  function step() {
    if(!state.running) return;

    // Physics is advanced by the existing Game.update() loop.
    // This module only observes the current body, records metrics,
    // and renders the measurement scene after the game's render pass.
    const piece = state.current;
    if(!piece){
      state.raf = requestAnimationFrame(step);
      return;
    }

    const contact = hasGroundContact(piece.body);
    if(state.landingFrame === null && contact){
      state.landingFrame = state.frame;
    }

    state.rows.push(measurementRow(piece, contact));
    state.frame++;

    if(state.landingFrame !== null){
      state.postLandFrames = state.frame - state.landingFrame - 1;
      if(state.postLandFrames >= POST_LAND_FRAMES){
        state.completedRaw[state.pieceIndex] = state.rows.slice();
        finishPiece('complete');

        const next = state.pieceIndex + 1;
        if(next >= state.images.length){
          downloadRun();
          return;
        }

        state.uiText = `${next+1}/${state.images.length}`;
        startPiece(next);
      }
    } else if(state.frame >= MAX_FALL_FRAMES){
      state.completedRaw[state.pieceIndex] = state.rows.slice();
      finishPiece('timeout_no_landing');

      const next = state.pieceIndex + 1;
      if(next >= state.images.length){
        downloadRun();
        return;
      }
      state.uiText = `${next+1}/${state.images.length}`;
      startPiece(next);
    }

    updateMeasurementOverlay();
    renderMeasurementFrame();
    if(state.running) state.raf = requestAnimationFrame(step);
  }

  function startRun() {
    if(state.running) return;
    const runNumber = Math.max(1, Math.floor(Number(ui.runInput.value) || DEFAULT_RUN_NUMBER));
    state.runNumber = runNumber;
    state.completedRaw = {};
    state.summaries = [];
    state.current = null;
    state.pieceIndex = 0;
    state.running = true;
    const modeModal = document.getElementById('modeModal');
    if(modeModal) modeModal.classList.add('hidden');
    ui.button.disabled = true;
    ui.runInput.disabled = true;
    ui.status.textContent = `計測中… 1/${state.images.length}`;
    getStageSize();
    startPiece(0);
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(step);
  }

  const ui = {
    panel: null,
    runInput: null,
    button: null,
    status: null,
    downloadHost: null
  };

  function ensureMeasurementOverlay() {
    if(state.overlay) return state.overlay;
    const stage = document.querySelector('.stage');
    if(!stage) return null;
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.top = '10px';
    el.style.transform = 'translateX(-50%)';
    el.style.zIndex = '20';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '10px';
    el.style.background = 'rgba(255,255,255,.88)';
    el.style.border = '1px solid rgba(0,0,0,.16)';
    el.style.fontSize = '12px';
    el.style.fontWeight = '700';
    el.style.pointerEvents = 'none';
    el.style.display = 'none';
    stage.appendChild(el);
    state.overlay = el;
    return el;
  }

  function updateMeasurementOverlay() {
    const el = ensureMeasurementOverlay();
    if(!el) return;
    if(!state.running || !state.current) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const pieceNo = state.pieceIndex + 1;
    const total = state.images.length;
    const phase = state.landingFrame === null
      ? `落下中 frame ${state.frame}`
      : `着地後 ${state.postLandFrames}/${POST_LAND_FRAMES}`;
    el.textContent = `v23.6.1 計測　${pieceNo}/${total}　${phase}`;
  }

  function renderMeasurementFrame() {
    if(!state.running || !state.current) return;
    try {
      Renderer.clear();
      Renderer.drawPiece(state.current, 0);
      Renderer.drawGround(state.stageH - 12, 0, state.baseWidth);
      Renderer.renderEffects(0);
    } catch(error) {
      console.warn(`${VERSION}: render error`, error);
    }
  }

  function buildUI() {
    if(new URLSearchParams(location.search).get('debug') !== 'on') return false;

    const old = document.getElementById('measurementDebug');
    if(old) old.style.display = 'none';

    const card = document.querySelector('.modeCard');
    if(!card) return false;

    const panel = document.createElement('div');
    panel.className = 'measurementDebug';
    panel.style.marginTop = '14px';
    panel.style.paddingTop = '14px';
    panel.style.borderTop = '1px solid rgba(0,0,0,.12)';

    const title = document.createElement('div');
    title.className = 'measurementTitle';
    title.textContent = `${VERSION} 物理挙動デバッグ`;

    const description = document.createElement('div');
    description.className = 'measurementStatus';
    description.textContent = '画像を自動検出 → 全ピースを1個ずつ落下 → 着地＋60フレームを記録。37などの固定値は使用しません。';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';

    const label = document.createElement('label');
    label.textContent = 'Run';
    label.style.fontWeight = '700';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.value = String(DEFAULT_RUN_NUMBER);
    input.style.width = '80px';
    input.style.padding = '8px';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'modeButton measurementButton';
    button.innerHTML = '<strong>全ピース自動計測</strong><span>metadata + summary + ピース別CSVをZIP出力</span>';
    button.disabled = true;

    const status = document.createElement('div');
    status.className = 'measurementStatus';
    status.textContent = 'ピース画像を検出中…';

    const downloadHost = document.createElement('div');

    row.append(label, input);
    panel.append(title, description, row, button, status, downloadHost);
    card.append(panel);

    ui.panel = panel;
    ui.runInput = input;
    ui.button = button;
    ui.status = status;
    ui.downloadHost = downloadHost;
    button.addEventListener('click', startRun);
    return true;
  }

  async function init() {
    if(!buildUI()) return;

    try{
      state.images = await discoverImages();
      if(!state.images.length) throw new Error('assets/01.png または assets/01.PNG が見つかりません。');
    ensureMeasurementOverlay();
      state.completedRaw = {};
      ui.status.textContent = `${state.images.length}ピース検出。Run番号を確認して計測を開始してください。`;
      ui.button.disabled = false;
    }catch(error){
      console.error(`${VERSION}:`, error);
      ui.status.textContent = `画像検出エラー: ${error.message}`;
    }
  }

  window.addEventListener('load', () => {
    setTimeout(init, 0);
  });
})();
