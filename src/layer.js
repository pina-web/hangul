/* ===== 디자인(레이어) 편집기 =====
 * 미리캔버스·캔바처럼 쪽 위에 글·그림·도형을 자유롭게 놓고, 모션과 슬라이드쇼를 붙인다.
 * 프로젝트: {v, w, h, assets:{id:dataURL}, pages:[{id,bg,bgImage,transition,auto,layers:[...]}]}
 */
const Design = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const PRESETS = [
    ['p169', '프레젠테이션 16:9', 1280, 720], ['p43', '프레젠테이션 4:3', 1024, 768],
    ['a4p', 'A4 세로', 794, 1123], ['a4l', 'A4 가로', 1123, 794],
    ['sq', '카드뉴스 1:1', 1080, 1080], ['c45', '카드뉴스 4:5', 1080, 1350], ['story', '세로 영상·스토리 9:16', 1080, 1920],
    ['poster', '포스터 A3', 1123, 1587], ['thumb', '유튜브 썸네일', 1280, 720],
  ];
  const DFONTS = ['Noto Sans KR', 'Noto Serif KR', 'Nanum Gothic', 'Nanum Myeongjo', 'Black Han Sans', 'Do Hyeon', 'Jua', 'Gowun Dodum', 'Gowun Batang', 'Nanum Pen Script', 'Gaegu', 'Song Myung', 'IBM Plex Sans KR', '함초롬바탕', '함초롬돋움', '맑은 고딕', 'Arial', 'Georgia'];
  const PALETTE = ['#1b2333', '#ffffff', '#5b6578', '#c9d1df', '#1f4fbf', '#3b82f6', '#0ea5a4', '#16a34a', '#eab308', '#f97316', '#dc2626', '#db2777', '#7c3aed', '#7b5a3c', '#f4efe6', '#fde68a'];

  const S = {
    project: null, pageIdx: 0, sel: new Set(), zoom: 1, fit: true, editing: null,
    hist: [], hi: -1, clip: null, preview: null, root: null, built: false,
    onChange: () => {}, onExitToDoc: null, toast: (m) => console.log(m),
  };

  /* ---------- 모델 ---------- */
  function newProject(w = 1280, h = 720) {
    return { v: 1, w, h, assets: {}, pages: [newPage()] };
  }
  function newPage() { return { id: uid(), bg: '#ffffff', transition: { type: 'fade', dur: 0.6 }, auto: 0, layers: [] }; }
  function baseLayer(type, extra) {
    return Object.assign({ id: uid(), type, name: '', x: 100, y: 100, w: 300, h: 80, rot: 0, opacity: 1, locked: false, hidden: false,
      anim: { in: 'none', start: 'auto', delay: 0, dur: 0.6, loop: 'none', order: 0 } }, extra);
  }
  function textLayer(html, extra) {
    return baseLayer('text', Object.assign({ html, font: 'Noto Sans KR', size: 32, color: '#1b2333', align: 'left', lh: 1.4, ls: 0, bold: false, italic: false, underline: false, bg: '', pad: 0, autoH: true }, extra));
  }
  function shapeLayer(kind, extra) {
    return baseLayer('shape', Object.assign({ kind, fill: kind === 'line' ? '' : '#3b82f6', stroke: kind === 'line' ? '#1b2333' : '', sw: kind === 'line' ? 4 : 0, radius: 24, dash: false, arrowEnd: false,
      html: '', font: 'Noto Sans KR', size: 28, color: '#ffffff', align: 'center', valign: 'middle', lh: 1.3, ls: 0 }, extra));
  }
  function imageLayer(src, w, h, extra) { return baseLayer('image', Object.assign({ src, w, h, fit: 'cover', radius: 0, sw: 0, stroke: '#ffffff' }, extra)); }
  const page = () => S.project.pages[S.pageIdx];
  const layerById = (id) => page().layers.find((l) => l.id === id);
  const selLayers = () => page().layers.filter((l) => S.sel.has(l.id));
  function addAsset(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
    const a = S.project.assets || (S.project.assets = {});
    for (const k in a) if (a[k].length === dataUrl.length && a[k] === dataUrl) return 'asset:' + k;
    const id = uid(); a[id] = dataUrl; return 'asset:' + id;
  }
  const srcOf = (src) => (src && src.startsWith('asset:') ? (S.project.assets || {})[src.slice(6)] : src);
  function layerName(L) {
    if (L.name) return L.name;
    if (L.type === 'text' || (L.type === 'shape' && L.html)) {
      const t = (L.html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      if (t) return t.slice(0, 24);
    }
    if (L.type === 'image') return '그림';
    if (L.type === 'shape') return Motion.SHAPES[L.kind] || '도형';
    return '글';
  }

  /* ---------- 실행 취소 ---------- */
  function snapshot() { const p = Object.assign({}, S.project); delete p.assets; return JSON.stringify({ p, i: S.pageIdx }); }
  function resetHistory() { S.hist = [snapshot()]; S.hi = 0; }
  let commitT = null;
  function commit(soon) {
    clearTimeout(commitT);
    const go = () => {
      const s = snapshot();
      if (S.hist[S.hi] === s) return;
      S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s);
      if (S.hist.length > 120) S.hist.shift();
      S.hi = S.hist.length - 1;
      S.onChange();
    };
    if (soon) commitT = setTimeout(go, 400); else go();
  }
  function restore(i) {
    const st = JSON.parse(S.hist[i]); const assets = S.project.assets;
    S.project = Object.assign(st.p, { assets }); S.pageIdx = Math.min(st.i, S.project.pages.length - 1);
    S.hi = i; S.sel.clear(); S.editing = null; renderAll(); S.onChange();
  }
  const undo = () => { if (S.editing) endEdit(); if (S.hi > 0) restore(S.hi - 1); };
  const redo = () => { if (S.hi < S.hist.length - 1) restore(S.hi + 1); };

  /* ---------- 화면 만들기 ---------- */
  const ICON = {
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
    shape: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="5"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>',
    table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15M15 4.5v15"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    show: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8M10.5 8v4l3.5-2z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5C18.5 5.5 22 12 22 12a17 17 0 0 1-3.2 3.9M6.2 6.9C3.6 8.6 2 12 2 12s3.5 6.5 10 6.5c1.6 0 3-.4 4.2-1"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  };
  function build(container) {
    S.root = container;
    container.innerHTML = `
      <div class="dbar" role="toolbar" aria-label="디자인 도구">
        <button class="tb" data-d="undo" title="되돌리기 (Ctrl+Z)">${ICON.undo}</button>
        <button class="tb" data-d="redo" title="다시 실행 (Ctrl+Y)">${ICON.redo}</button>
        <span class="dsep"></span>
        <button class="btn" data-d="addTitle" title="제목 글상자 넣기">${ICON.text}<span>텍스트</span></button>
        <button class="btn" data-d="shapes" aria-haspopup="menu">${ICON.shape}<span>도형</span></button>
        <button class="btn" data-d="image">${ICON.image}<span>그림</span></button>
        <button class="btn" data-d="table">${ICON.table}<span>표</span></button>
        <span class="dsep"></span>
        <select class="sel" id="dSize" title="쪽 크기" aria-label="쪽 크기"></select>
        <span class="sp"></span>
        <button class="btn" data-d="preview" title="이 쪽의 모션을 미리 봅니다">${ICON.play}<span>모션 미리보기</span></button>
        <button class="btn primary" data-d="show" title="슬라이드쇼 (F5)">${ICON.show}<span>슬라이드쇼</span></button>
      </div>
      <div class="dmain">
        <aside class="dside">
          <div class="dtabs" role="tablist"><button role="tab" data-tab="pages" class="on">쪽</button><button role="tab" data-tab="elements">요소</button><button role="tab" data-tab="layers">레이어</button></div>
          <div class="dpanel" data-panel="pages"><div class="dpage-tools"><button class="btn" data-d="addPage">${ICON.plus}새 쪽</button><button class="tb" data-d="dupPage" title="쪽 복제">${ICON.copy}</button><button class="tb" data-d="pageUp" title="앞으로">${ICON.up}</button><button class="tb" data-d="pageDown" title="뒤로">${ICON.down}</button><button class="tb" data-d="delPage" title="쪽 지우기">${ICON.trash}</button></div><div class="dthumbs" id="dThumbs"></div></div>
          <div class="dpanel" data-panel="elements" hidden></div>
          <div class="dpanel" data-panel="layers" hidden><p class="dhint">위에 있는 것이 앞에 보입니다. 끌어서 순서를 바꿀 수 있습니다.</p><div class="dlayers" id="dLayers"></div></div>
        </aside>
        <div class="dstage" id="dStage" tabindex="0" aria-label="디자인 작업면">
          <div class="dcanvas" id="dCanvas"><div class="dwrap" id="dWrap"><div class="dsel" id="dSel"></div></div></div>
        </div>
        <aside class="dprops">
          <div class="dtabs" role="tablist"><button role="tab" data-ptab="props" class="on">속성</button><button role="tab" data-ptab="motion">모션</button></div>
          <div class="dpanel" id="dProps"></div>
        </aside>
      </div>
      <div class="dstatus"><span id="dInfo"></span><span class="sp"></span><label for="dZoom">배율</label><select id="dZoom"><option value="fit">화면 맞춤</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></div>
      <input type="file" id="dImgInput" accept="image/*" multiple hidden>
      <input type="file" id="dBgInput" accept="image/*" hidden>`;
    PRESETS.forEach(([k, n, w, h]) => { const o = document.createElement('option'); o.value = k; o.textContent = `${n} (${w}×${h})`; $('#dSize').appendChild(o); });
    const o = document.createElement('option'); o.value = 'custom'; o.textContent = '사용자 지정…'; $('#dSize').appendChild(o);
    buildElements();
    bindUI();
    S.built = true;
  }

  function buildElements() {
    const p = $('[data-panel="elements"]', S.root);
    const shapeBtns = Object.keys(Motion.SHAPES).map((k) => {
      const L = shapeLayer(k, { w: 60, h: k === 'line' ? 20 : 44, fill: '#3b82f6', stroke: k === 'line' ? '#1b2333' : '', sw: k === 'line' ? 3 : 0, radius: 10, id: 'p' + k });
      return `<button class="dshape" data-shape="${k}" title="${Motion.SHAPES[k]}">${Motion.shapeSvg(L)}</button>`;
    }).join('');
    p.innerHTML = `
      <div class="dgroup"><div class="dgh">글</div>
        <button class="dadd dadd-title" data-add="title">제목 넣기</button>
        <button class="dadd dadd-sub" data-add="subtitle">부제목 넣기</button>
        <button class="dadd dadd-body" data-add="body">본문 넣기</button>
      </div>
      <div class="dgroup"><div class="dgh">도형·선</div><div class="dshapes">${shapeBtns}<button class="dshape" data-shape="arrowline" title="화살표 선"><svg viewBox="0 0 60 20" width="100%" height="100%"><line x1="2" y1="10" x2="48" y2="10" stroke="#1b2333" stroke-width="3"/><path d="M46 4 58 10 46 16z" fill="#1b2333"/></svg></button><button class="dshape" data-shape="dashline" title="점선"><svg viewBox="0 0 60 20" width="100%" height="100%"><line x1="2" y1="10" x2="58" y2="10" stroke="#1b2333" stroke-width="3" stroke-dasharray="7 5"/></svg></button></div></div>
      <div class="dgroup"><div class="dgh">그림·표</div><button class="dadd" data-add="image">내 그림 올리기</button><button class="dadd" data-add="table">표 넣기 (3×3)</button></div>
      <div class="dgroup"><div class="dgh">쪽 틀 (이 쪽에 추가)</div><div class="dtpls">
        <button class="dtpl" data-tpl="cover">표지</button><button class="dtpl" data-tpl="titleBody">제목 + 본문</button>
        <button class="dtpl" data-tpl="twoCol">두 단 비교</button><button class="dtpl" data-tpl="quote">인용 강조</button>
        <button class="dtpl" data-tpl="imageLeft">그림 + 설명</button><button class="dtpl" data-tpl="steps">3단계</button>
        <button class="dtpl" data-tpl="cardnews">카드뉴스 표지</button><button class="dtpl" data-tpl="end">마무리 인사</button>
      </div></div>`;
  }

  /* ---------- 그리기 ---------- */
  function renderAll() { renderStage(); renderThumbs(); renderLayers(); renderProps(); updateInfo(); }
  function stageScale() { return S.zoom; }
  function computeFit() {
    const st = $('#dStage'); if (!st || !S.project) return;
    const aw = st.clientWidth - 64, ah = st.clientHeight - 64;
    S.zoom = Math.max(0.05, Math.min(aw / S.project.w, ah / S.project.h, 2));
  }
  function renderStage() {
    if (!S.project) return;
    if (S.fit) computeFit();
    const wrap = $('#dWrap'); const z = stageScale();
    wrap.style.width = S.project.w * z + 'px'; wrap.style.height = S.project.h * z + 'px';
    const old = wrap.querySelector('.lp-page'); if (old) old.remove();
    if (S.preview) { S.preview.cancel(); S.preview = null; }
    const pe = Motion.pageEl(page(), S.project, { showHidden: false });
    pe.style.transform = `scale(${z})`;
    wrap.insertBefore(pe, $('#dSel'));
    // 글상자 높이를 실제 내용 높이로 맞춤
    page().layers.forEach((L) => { if (L.type === 'text' && L.autoH !== false && !L.hidden) { const el = pe.querySelector(`.ly[data-id="${L.id}"]`); if (el) L.h = Math.max(8, Math.round(el.offsetHeight)); } });
    if (S.editing) { const el = layerNode(S.editing); if (el) beginEditDom(el, false); else S.editing = null; }
    drawSel();
  }
  const layerNode = (id) => $('#dWrap .lp-page') && $('#dWrap .lp-page').querySelector(`.ly[data-id="${id}"]`);
  function thumbOf(pg, width) {
    const s = width / S.project.w;
    const box = document.createElement('div'); box.className = 'dthumb-box';
    box.style.width = width + 'px'; box.style.height = Math.round(S.project.h * s) + 'px';
    const pe = Motion.pageEl(pg, S.project); pe.style.transform = `scale(${s})`; pe.style.pointerEvents = 'none';
    box.appendChild(pe); return box;
  }
  function renderThumbs() {
    const box = $('#dThumbs'); if (!box) return; box.innerHTML = '';
    S.project.pages.forEach((pg, i) => {
      const b = document.createElement('button'); b.className = 'dthumb' + (i === S.pageIdx ? ' on' : '');
      b.setAttribute('aria-label', `${i + 1}쪽`);
      const n = document.createElement('span'); n.className = 'dthumb-n'; n.textContent = i + 1;
      b.append(n, thumbOf(pg, 150));
      if (pg.transition && pg.transition.type !== 'none') { const t = document.createElement('span'); t.className = 'dthumb-t'; t.textContent = '전환'; b.appendChild(t); }
      b.onclick = () => gotoPage(i);
      box.appendChild(b);
    });
  }
  let thumbT;
  function refreshThumb() {
    clearTimeout(thumbT);
    thumbT = setTimeout(() => {
      const b = $('#dThumbs') && $('#dThumbs').children[S.pageIdx]; if (!b) return renderThumbs();
      const old = b.querySelector('.dthumb-box'); if (old) old.replaceWith(thumbOf(page(), 150));
    }, 250);
  }
  function gotoPage(i) {
    if (S.editing) endEdit();
    S.pageIdx = Math.max(0, Math.min(i, S.project.pages.length - 1)); S.sel.clear(); renderAll();
    const t = $('#dThumbs') && $('#dThumbs').children[S.pageIdx]; if (t) t.scrollIntoView({ block: 'nearest' });
  }
  function updateInfo() {
    const i = $('#dInfo'); if (!i) return;
    i.textContent = `${S.pageIdx + 1} / ${S.project.pages.length}쪽 · 레이어 ${page().layers.length}개 · ${S.project.w}×${S.project.h}`;
    const k = PRESETS.find((p) => p[2] === S.project.w && p[3] === S.project.h);
    $('#dSize').value = k ? k[0] : 'custom';
  }

  /* ---------- 선택 상자 ---------- */
  function aabb(L) {
    const r = (L.rot || 0) * Math.PI / 180;
    if (!r) return { x: L.x, y: L.y, w: L.w, h: L.h };
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const w = L.w * c + L.h * s, h = L.w * s + L.h * c;
    return { x: L.x + L.w / 2 - w / 2, y: L.y + L.h / 2 - h / 2, w, h };
  }
  function unionBox(ls) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    ls.forEach((L) => { const b = aabb(L); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function drawSel(guides) {
    const box = $('#dSel'); if (!box) return;
    const z = stageScale(); box.innerHTML = '';
    const ls = selLayers().filter((l) => !l.hidden);
    if (guides) guides.forEach((g) => {
      const d = document.createElement('div'); d.className = 'dguide ' + (g.v ? 'v' : 'h');
      if (g.v) { d.style.left = g.p * z + 'px'; } else { d.style.top = g.p * z + 'px'; }
      box.appendChild(d);
    });
    if (!ls.length) return;
    const one = ls.length === 1 ? ls[0] : null;
    const frame = document.createElement('div'); frame.className = 'dframe' + (S.editing ? ' editing' : '') + (one && one.locked ? ' locked' : '');
    let b;
    if (one) { b = { x: one.x, y: one.y, w: one.w, h: one.h }; frame.style.transform = one.rot ? `rotate(${one.rot}deg)` : ''; }
    else { b = unionBox(ls); ls.forEach((L) => { const f = document.createElement('div'); f.className = 'dframe sub'; f.style.cssText = `left:${L.x * z}px;top:${L.y * z}px;width:${L.w * z}px;height:${L.h * z}px;transform:${L.rot ? `rotate(${L.rot}deg)` : 'none'}`; box.appendChild(f); }); }
    frame.style.left = b.x * z + 'px'; frame.style.top = b.y * z + 'px'; frame.style.width = b.w * z + 'px'; frame.style.height = b.h * z + 'px';
    if (!S.editing && !(one && one.locked)) {
      let hs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      if (one && one.type === 'text' && one.autoH !== false) hs = ['nw', 'ne', 'e', 'se', 'sw', 'w'];
      if (one && one.type === 'shape' && one.kind === 'line') hs = ['e', 'w'];
      if (!one) hs = ['nw', 'ne', 'se', 'sw'];
      hs.forEach((h) => { const d = document.createElement('div'); d.className = 'dh dh-' + h; d.dataset.h = h; frame.appendChild(d); });
      if (one) { const r = document.createElement('div'); r.className = 'dh dh-rot'; r.dataset.h = 'rot'; r.title = '돌리기 (Shift: 15°씩)'; frame.appendChild(r); }
    }
    if (one && one.locked) { const lk = document.createElement('div'); lk.className = 'dlock'; lk.innerHTML = ICON.lock; frame.appendChild(lk); }
    box.appendChild(frame);
    if (one && (one.rot || 0) !== 0 && !S.editing) { const t = document.createElement('div'); t.className = 'dtip'; t.textContent = Math.round(one.rot) + '°'; t.style.left = (b.x + b.w / 2) * z + 'px'; t.style.top = (b.y + b.h) * z + 14 + 'px'; box.appendChild(t); }
  }

  /* ---------- 포인터: 이동·크기·회전·영역 선택 ---------- */
  let drag = null;
  function pagePoint(e) { const r = $('#dWrap').getBoundingClientRect(); const z = r.width / S.project.w; return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z, z }; }
  function onDown(e) {
    if (e.button !== 0 || !S.project) return;
    const h = e.target.closest('.dh');
    if (S.editing) {
      const ed = layerNode(S.editing);
      if (ed && ed.contains(e.target)) return; // 글 고치는 중
      endEdit();
    }
    const p = pagePoint(e);
    if (h) {
      e.preventDefault();
      const ls = selLayers();
      drag = { mode: h.dataset.h === 'rot' ? 'rot' : 'resize', h: h.dataset.h, start: p, orig: ls.map(clone), box: unionBox(ls), moved: false };
      $('#dStage').setPointerCapture(e.pointerId); return;
    }
    const node = e.target.closest('.ly');
    if (node && $('#dWrap').contains(node)) {
      const id = node.dataset.id;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); }
      else if (!S.sel.has(id)) { S.sel.clear(); S.sel.add(id); }
      renderLayers(); renderProps(); drawSel();
      const ls = selLayers().filter((l) => !l.locked);
      if (ls.length) { e.preventDefault(); drag = { mode: 'move', start: p, orig: ls.map(clone), box: unionBox(ls), moved: false, alt: e.altKey }; $('#dStage').setPointerCapture(e.pointerId); }
      return;
    }
    if (!e.target.closest('.dcanvas')) return;
    // 빈 곳: 영역 선택
    if (!e.shiftKey) S.sel.clear();
    drag = { mode: 'marquee', start: p, base: new Set(S.sel) };
    $('#dStage').setPointerCapture(e.pointerId);
    renderLayers(); renderProps(); drawSel();
  }
  function snapMove(dx, dy, box, alt) {
    const guides = [];
    if (alt) return { dx, dy, guides };
    const th = 6 / stageScale();
    const others = page().layers.filter((l) => !S.sel.has(l.id) && !l.hidden).map(aabb);
    const xs = [0, S.project.w / 2, S.project.w], ys = [0, S.project.h / 2, S.project.h];
    others.forEach((b) => { xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h); });
    const nb = { x: box.x + dx, y: box.y + dy };
    let best = null;
    [nb.x, nb.x + box.w / 2, nb.x + box.w].forEach((v) => xs.forEach((t) => { const d = t - v; if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }));
    if (best) { dx += best.d; guides.push({ v: true, p: best.t }); }
    best = null;
    [nb.y, nb.y + box.h / 2, nb.y + box.h].forEach((v) => ys.forEach((t) => { const d = t - v; if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }));
    if (best) { dy += best.d; guides.push({ v: false, p: best.t }); }
    return { dx, dy, guides };
  }
  function onMove(e) {
    if (!drag) return;
    const p = pagePoint(e);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * stageScale() < 3) return;
    drag.moved = true;
    if (drag.mode === 'marquee') {
      const x1 = Math.min(p.x, drag.start.x), y1 = Math.min(p.y, drag.start.y), x2 = Math.max(p.x, drag.start.x), y2 = Math.max(p.y, drag.start.y);
      S.sel = new Set(drag.base);
      page().layers.forEach((L) => { if (L.hidden) return; const b = aabb(L); if (b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1) S.sel.add(L.id); });
      drawSel();
      const z = stageScale(); const m = document.createElement('div'); m.className = 'dmarquee';
      m.style.cssText = `left:${x1 * z}px;top:${y1 * z}px;width:${(x2 - x1) * z}px;height:${(y2 - y1) * z}px`;
      $('#dSel').appendChild(m);
      return;
    }
    if (drag.mode === 'move') {
      const s = snapMove(dx, dy, drag.box, e.altKey);
      drag.orig.forEach((o) => { const L = layerById(o.id); L.x = Math.round(o.x + s.dx); L.y = Math.round(o.y + s.dy); const n = layerNode(L.id); if (n) Motion.applyBox(n, L); });
      drawSel(s.guides);
      return;
    }
    if (drag.mode === 'rot') {
      const o = drag.orig[0]; const L = layerById(o.id);
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      else for (const t of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - t) < 4) a = t;
      a = ((a % 360) + 360) % 360; if (a > 180) a -= 360;
      L.rot = Math.round(a * 10) / 10;
      const n = layerNode(L.id); if (n) Motion.applyBox(n, L);
      drawSel(); return;
    }
    if (drag.mode === 'resize') {
      if (drag.orig.length > 1) return resizeMany(p, e);
      const o = drag.orig[0]; const L = layerById(o.id); const h = drag.h;
      const r = (o.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
      const ldx = dx * cos + dy * sin, ldy = -dx * sin + dy * cos;
      let w = o.w, hh = o.h;
      const sx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, sy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
      w = Math.max(8, o.w + sx * ldx); hh = Math.max(8, o.h + sy * ldy);
      const corner = sx && sy;
      // 모서리: 그림은 비율 유지(Shift면 자유), 도형은 자유(Shift면 비율 유지), 글은 글자 크기까지 함께 키움
      const keep = corner && (o.type === 'image' ? !e.shiftKey : o.type === 'shape' ? e.shiftKey : true);
      if (keep) { const k = Math.max(w / o.w, hh / o.h); w = Math.max(8, o.w * k); hh = Math.max(8, o.h * k); }
      if (o.type === 'text' && L.autoH !== false) {
        if (corner) { const k = w / o.w; L.size = Math.max(4, Math.round(o.size * k * 10) / 10); if (o.pad) L.pad = Math.round(o.pad * k); }
        hh = o.h * (corner ? w / o.w : 1);
      }
      const dw = w - o.w, dh = hh - o.h;
      const ox = sx * dw / 2, oy = sy * dh / 2;
      const cx = o.x + o.w / 2 + ox * cos - oy * sin, cy = o.y + o.h / 2 + ox * sin + oy * cos;
      L.w = Math.round(w); L.h = Math.round(hh); L.x = Math.round(cx - w / 2); L.y = Math.round(cy - hh / 2);
      const n = layerNode(L.id);
      if (n) {
        if (o.type === 'text') { const nn = Motion.layerEl(L, { assets: S.project.assets }); nn.style.zIndex = n.style.zIndex; n.replaceWith(nn); L.h = Math.max(8, nn.offsetHeight); }
        else if (o.type === 'shape') { const nn = Motion.layerEl(L, { assets: S.project.assets }); nn.style.zIndex = n.style.zIndex; n.replaceWith(nn); }
        else Motion.applyBox(n, L);
      }
      drawSel();
    }
  }
  function resizeMany(p) {
    const b = drag.box, h = drag.h;
    const ax = h.includes('w') ? b.x + b.w : b.x, ay = h.includes('n') ? b.y + b.h : b.y;
    const k = Math.max(0.05, Math.max(Math.abs(p.x - ax) / b.w, Math.abs(p.y - ay) / b.h));
    drag.orig.forEach((o) => {
      const L = layerById(o.id);
      L.x = Math.round(ax + (o.x - ax) * k); L.y = Math.round(ay + (o.y - ay) * k); L.w = Math.round(o.w * k); L.h = Math.round(o.h * k);
      if (o.size) L.size = Math.round(o.size * k * 10) / 10;
      if (o.sw) L.sw = Math.max(1, Math.round(o.sw * k));
    });
    renderStage();
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    try { $('#dStage').releasePointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
    if (d.mode === 'marquee') { renderLayers(); renderProps(); drawSel(); return; }
    if (d.moved) { renderStage(); renderProps(); refreshThumb(); commit(); }
    else drawSel();
  }

  /* ---------- 글 고치기 ---------- */
  function startEdit(id) {
    const L = layerById(id); if (!L || L.locked) return;
    if (L.type === 'image' || (L.type === 'shape' && L.kind === 'line')) return;
    if (L.type === 'shape' && !L.html) { L.html = '<p><br></p>'; }
    S.sel = new Set([id]); S.editing = id;
    renderStage(); renderProps();
    const el = layerNode(id); if (el) beginEditDom(el, true);
  }
  function beginEditDom(el, selectAll) {
    const t = el.querySelector('.ly-t'); if (!t) return;
    t.contentEditable = 'true'; t.spellcheck = false; el.classList.add('editing');
    t.oninput = () => { const L = layerById(S.editing); if (L && L.type === 'text') { L.h = Math.max(8, el.offsetHeight); drawSel(); } };
    if (selectAll) {
      t.focus({ preventScroll: true });
      const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    drawSel();
  }
  function endEdit() {
    const id = S.editing; if (!id) return;
    const L = layerById(id); const el = layerNode(id);
    S.editing = null;
    if (L && el) {
      const t = el.querySelector('.ly-t');
      if (t) {
        let html = cleanHtml(t.innerHTML);
        const empty = !t.textContent.trim() && !t.querySelector('img');
        if (L.type === 'shape' && empty) html = '';
        if (L.type === 'text' && empty) { page().layers = page().layers.filter((x) => x.id !== id); S.sel.delete(id); }
        else L.html = html;
      }
    }
    renderAll(); commit();
  }
  function cleanHtml(html) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const ok = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUP', 'SUB', 'FONT', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'IMG', 'A']);
    const walk = (n) => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 8) { c.remove(); continue; }
        if (c.nodeType !== 1) continue;
        if (!ok.has(c.tagName)) { walk(c); c.replaceWith(...c.childNodes); continue; }
        for (const a of Array.from(c.attributes)) {
          const keep = a.name === 'style' && !/url\(|expression/i.test(a.value) || ['colspan', 'rowspan', 'href', 'src', 'width', 'height', 'class', 'color', 'face', 'size'].includes(a.name);
          if (!keep || (a.name === 'href' && !/^(https?:|mailto:)/i.test(a.value)) || (a.name === 'src' && !/^(data:image\/|blob:|https?:)/i.test(a.value))) c.removeAttribute(a.name);
        }
        walk(c);
      }
    };
    walk(tpl.content);
    const d = document.createElement('div'); d.appendChild(tpl.content); return d.innerHTML;
  }

  /* ---------- 레이어 추가 ---------- */
  function center(L) { L.x = Math.round((S.project.w - L.w) / 2); L.y = Math.round((S.project.h - L.h) / 2); return L; }
  function scaleBase() { return Math.min(S.project.w, S.project.h) / 720; }
  function add(L, opts = {}) {
    page().layers.push(L);
    S.sel = new Set([L.id]);
    renderAll(); commit();
    if (opts.edit) startEdit(L.id);
    return L;
  }
  function addText(kind) {
    const k = scaleBase();
    const spec = { title: ['제목을 입력하세요', 64, true], subtitle: ['부제목을 입력하세요', 36, false], body: ['본문 내용을 입력하세요. 두 번 눌러 글을 고칠 수 있습니다.', 24, false] }[kind] || ['글을 입력하세요', 32, false];
    const L = textLayer(`<p>${spec[0]}</p>`, { size: Math.round(spec[1] * k), bold: spec[2], w: Math.round(Math.min(S.project.w * 0.8, spec[1] * k * 14)), h: Math.round(spec[1] * k * 1.4) });
    if (kind === 'title') L.font = 'Noto Sans KR';
    center(L); add(L);
  }
  function addShape(kind) {
    const k = scaleBase();
    let L;
    if (kind === 'arrowline') L = shapeLayer('line', { w: Math.round(260 * k), h: Math.round(24 * k), arrowEnd: true, sw: Math.max(2, Math.round(4 * k)) });
    else if (kind === 'dashline') L = shapeLayer('line', { w: Math.round(260 * k), h: Math.round(24 * k), dash: true, sw: Math.max(2, Math.round(4 * k)) });
    else if (kind === 'line') L = shapeLayer('line', { w: Math.round(260 * k), h: Math.round(24 * k), sw: Math.max(2, Math.round(4 * k)) });
    else { const s = Math.round(200 * k); L = shapeLayer(kind, { w: kind === 'arrow' ? s * 1.5 : kind === 'speech' ? s * 1.4 : s, h: s, size: Math.round(28 * k) }); }
    center(L); add(L);
  }
  function addImageSrc(src, at) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const maxW = S.project.w * 0.6, maxH = S.project.h * 0.6;
        const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
        const L = imageLayer(addAsset(src), Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
        if (at) { L.x = Math.round(at.x - L.w / 2); L.y = Math.round(at.y - L.h / 2); } else center(L);
        add(L); res(L);
      };
      img.onerror = () => { S.toast('그림을 읽을 수 없습니다.', true); res(null); };
      img.src = src;
    });
  }
  function readFile(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
  async function addImageFiles(files, at) { for (const f of files) { if (!f.type.startsWith('image/')) continue; await addImageSrc(await readFile(f), at); } }
  function addTable() {
    const k = scaleBase();
    let h = '<table style="width:100%"><tbody>';
    for (let r = 0; r < 3; r++) h += '<tr>' + [0, 1, 2].map((c) => `<td>${r === 0 ? `<b>항목 ${c + 1}</b>` : '&nbsp;'}</td>`).join('') + '</tr>';
    h += '</tbody></table>';
    const L = textLayer(h, { size: Math.round(22 * k), w: Math.round(S.project.w * 0.6), h: 120 }); center(L); add(L);
  }
  function template(name) {
    const W = S.project.w, H = S.project.h, k = scaleBase();
    const T = (html, o) => textLayer(html, Object.assign({ size: Math.round(28 * k) }, o));
    const ls = [];
    const pad = Math.round(W * 0.07);
    switch (name) {
      case 'cover':
        ls.push(shapeLayer('rect', { x: 0, y: 0, w: W, h: H, fill: '#1f4fbf', name: '배경' }));
        ls.push(shapeLayer('ellipse', { x: Math.round(W * 0.68), y: Math.round(-H * 0.2), w: Math.round(H * 0.9), h: Math.round(H * 0.9), fill: '#3b82f6', opacity: 0.55, name: '장식 원' }));
        ls.push(T('<p>발표 제목을 입력하세요</p>', { x: pad, y: Math.round(H * 0.36), w: Math.round(W * 0.7), size: Math.round(72 * k), bold: true, color: '#ffffff', anim: { in: 'up', start: 'auto', delay: 0.1, dur: 0.8, loop: 'none' } }));
        ls.push(T('<p>부제목 · 발표자 · 날짜</p>', { x: pad, y: Math.round(H * 0.58), w: Math.round(W * 0.6), size: Math.round(30 * k), color: '#dbe6ff', anim: { in: 'fade', start: 'auto', delay: 0.6, dur: 0.8, loop: 'none' } }));
        break;
      case 'titleBody':
        ls.push(T('<p>제목</p>', { x: pad, y: Math.round(H * 0.1), w: W - pad * 2, size: Math.round(52 * k), bold: true, anim: { in: 'left', start: 'auto', delay: 0, dur: 0.6, loop: 'none' } }));
        ls.push(shapeLayer('rect', { x: pad, y: Math.round(H * 0.1 + 80 * k), w: Math.round(80 * k), h: Math.max(4, Math.round(6 * k)), fill: '#1f4fbf', name: '강조 막대' }));
        ls.push(T('<p>• 첫 번째 핵심 내용</p><p>• 두 번째 핵심 내용</p><p>• 세 번째 핵심 내용</p>', { x: pad, y: Math.round(H * 0.32), w: W - pad * 2, size: Math.round(30 * k), lh: 1.7, anim: { in: 'up', start: 'click', delay: 0, dur: 0.6, loop: 'none' } }));
        break;
      case 'twoCol': {
        const cw = Math.round((W - pad * 3) / 2);
        ls.push(T('<p>두 가지를 비교합니다</p>', { x: pad, y: Math.round(H * 0.08), w: W - pad * 2, size: Math.round(46 * k), bold: true, align: 'center' }));
        [0, 1].forEach((i) => {
          const x = pad + i * (cw + pad);
          ls.push(shapeLayer('roundrect', { x, y: Math.round(H * 0.28), w: cw, h: Math.round(H * 0.6), fill: i ? '#eef3ff' : '#fff4e6', radius: Math.round(20 * k), name: '카드 ' + (i + 1), anim: { in: i ? 'right' : 'left', start: 'auto', delay: i * 0.3, dur: 0.6, loop: 'none' } }));
          ls.push(T(`<p><b>${i ? '방법 B' : '방법 A'}</b></p><p>장점과 특징을 적어 보세요.</p>`, { x: x + Math.round(30 * k), y: Math.round(H * 0.33), w: cw - Math.round(60 * k), size: Math.round(28 * k), lh: 1.6, anim: { in: 'fade', start: 'auto', delay: 0.4 + i * 0.3, dur: 0.6, loop: 'none' } }));
        });
        break;
      }
      case 'quote':
        ls.push(shapeLayer('rect', { x: 0, y: 0, w: W, h: H, fill: '#f4efe6', name: '배경' }));
        ls.push(T('<p>“</p>', { x: pad, y: Math.round(H * 0.1), w: Math.round(200 * k), size: Math.round(180 * k), color: '#c2410c', font: 'Gowun Batang', lh: 1 }));
        ls.push(T('<p>마음에 남는 한 문장을 크게 보여 주세요.</p>', { x: pad * 2, y: Math.round(H * 0.36), w: W - pad * 4, size: Math.round(54 * k), font: 'Gowun Batang', align: 'center', lh: 1.4, anim: { in: 'blur', start: 'auto', delay: 0.2, dur: 1.2, loop: 'none' } }));
        ls.push(T('<p>— 말한 사람</p>', { x: pad * 2, y: Math.round(H * 0.7), w: W - pad * 4, size: Math.round(26 * k), align: 'center', color: '#5b6578', anim: { in: 'fade', start: 'auto', delay: 1.2, dur: 0.6, loop: 'none' } }));
        break;
      case 'imageLeft':
        ls.push(shapeLayer('roundrect', { x: pad, y: Math.round(H * 0.15), w: Math.round(W * 0.42), h: Math.round(H * 0.7), fill: '#dbe3ef', radius: Math.round(16 * k), html: '<p>그림 자리<br>(그림을 이 위에 올리세요)</p>', color: '#5b6578', size: Math.round(24 * k), name: '그림 자리' }));
        ls.push(T('<p>설명 제목</p>', { x: Math.round(W * 0.54), y: Math.round(H * 0.2), w: Math.round(W * 0.38), size: Math.round(46 * k), bold: true }));
        ls.push(T('<p>그림에 대한 설명을 두세 줄로 적어 보세요. 핵심만 짧게 쓰면 더 잘 읽힙니다.</p>', { x: Math.round(W * 0.54), y: Math.round(H * 0.38), w: Math.round(W * 0.38), size: Math.round(26 * k), lh: 1.6, color: '#3a4458' }));
        break;
      case 'steps': {
        const cw = Math.round((W - pad * 2 - 40 * k * 2) / 3);
        ls.push(T('<p>진행 순서</p>', { x: pad, y: Math.round(H * 0.08), w: W - pad * 2, size: Math.round(46 * k), bold: true }));
        for (let i = 0; i < 3; i++) {
          const x = Math.round(pad + i * (cw + 40 * k));
          ls.push(shapeLayer('ellipse', { x: x + Math.round(cw / 2 - 45 * k), y: Math.round(H * 0.3), w: Math.round(90 * k), h: Math.round(90 * k), fill: '#1f4fbf', html: `<p><b>${i + 1}</b></p>`, size: Math.round(40 * k), anim: { in: 'pop', start: 'click', delay: 0, dur: 0.6, loop: 'none', order: i } }));
          ls.push(T(`<p><b>${i + 1}단계</b></p><p>할 일을 적어 보세요.</p>`, { x, y: Math.round(H * 0.3 + 120 * k), w: cw, size: Math.round(26 * k), align: 'center', lh: 1.5 }));
        }
        break;
      }
      case 'cardnews':
        ls.push(shapeLayer('rect', { x: 0, y: 0, w: W, h: H, fill: '#fde68a', name: '배경' }));
        ls.push(shapeLayer('roundrect', { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2, fill: '#ffffff', radius: Math.round(28 * k), name: '카드' }));
        ls.push(T('<p>오늘의 소식</p>', { x: pad * 2, y: Math.round(H * 0.18), w: W - pad * 4, size: Math.round(30 * k), color: '#c2410c', bold: true }));
        ls.push(T('<p>한눈에 보는<br>핵심 정리 3가지</p>', { x: pad * 2, y: Math.round(H * 0.28), w: W - pad * 4, size: Math.round(76 * k), bold: true, font: 'Black Han Sans', lh: 1.2 }));
        ls.push(T('<p>넘겨서 확인하세요 →</p>', { x: pad * 2, y: Math.round(H * 0.78), w: W - pad * 4, size: Math.round(28 * k), color: '#5b6578', anim: { in: 'none', start: 'auto', delay: 0, dur: 0.6, loop: 'float' } }));
        break;
      case 'end':
        ls.push(shapeLayer('rect', { x: 0, y: 0, w: W, h: H, fill: '#1b2333', name: '배경' }));
        ls.push(T('<p>감사합니다</p>', { x: pad, y: Math.round(H * 0.38), w: W - pad * 2, size: Math.round(84 * k), bold: true, color: '#ffffff', align: 'center', anim: { in: 'zoomIn', start: 'auto', delay: 0.1, dur: 0.9, loop: 'none' } }));
        ls.push(T('<p>질문이 있으면 편하게 말씀해 주세요</p>', { x: pad, y: Math.round(H * 0.58), w: W - pad * 2, size: Math.round(28 * k), color: '#c9d1df', align: 'center', anim: { in: 'fade', start: 'auto', delay: 0.8, dur: 0.8, loop: 'none' } }));
        break;
    }
    ls.forEach((L) => { if (L.x === 100 && L.y === 100 && name !== 'x') { /* 위치 지정됨 */ } page().layers.push(L); });
    S.sel = new Set(ls.filter((l) => l.type === 'text').map((l) => l.id).slice(0, 1));
    renderAll(); commit();
  }

  /* ---------- 정렬·순서 ---------- */
  function arrange(how) {
    const ls = page().layers; const ids = S.sel;
    if (!ids.size) return;
    const picked = ls.filter((l) => ids.has(l.id)), rest = ls.filter((l) => !ids.has(l.id));
    if (how === 'front') page().layers = [...rest, ...picked];
    else if (how === 'back') page().layers = [...picked, ...rest];
    else if (how === 'forward' || how === 'backward') {
      const arr = ls.slice(); const dir = how === 'forward' ? 1 : -1;
      const idxs = arr.map((l, i) => (ids.has(l.id) ? i : -1)).filter((i) => i >= 0);
      (dir > 0 ? idxs.reverse() : idxs).forEach((i) => { const j = i + dir; if (j < 0 || j >= arr.length || ids.has(arr[j].id)) return; [arr[i], arr[j]] = [arr[j], arr[i]]; });
      page().layers = arr;
    }
    renderAll(); commit();
  }
  function alignTo(how) {
    const ls = selLayers(); if (!ls.length) return;
    const ref = ls.length > 1 ? unionBox(ls) : { x: 0, y: 0, w: S.project.w, h: S.project.h };
    ls.forEach((L) => {
      const b = aabb(L);
      if (how === 'left') L.x += ref.x - b.x;
      if (how === 'hcenter') L.x += ref.x + ref.w / 2 - (b.x + b.w / 2);
      if (how === 'right') L.x += ref.x + ref.w - (b.x + b.w);
      if (how === 'top') L.y += ref.y - b.y;
      if (how === 'vcenter') L.y += ref.y + ref.h / 2 - (b.y + b.h / 2);
      if (how === 'bottom') L.y += ref.y + ref.h - (b.y + b.h);
      L.x = Math.round(L.x); L.y = Math.round(L.y);
    });
    if (how === 'hdist' || how === 'vdist') {
      const k = how === 'hdist' ? 'x' : 'y', sz = how === 'hdist' ? 'w' : 'h';
      const arr = ls.slice().sort((a, b) => a[k] - b[k]); if (arr.length < 3) return;
      const total = arr.reduce((s, l) => s + l[sz], 0);
      const span = arr[arr.length - 1][k] + arr[arr.length - 1][sz] - arr[0][k];
      const gap = (span - total) / (arr.length - 1);
      let pos = arr[0][k]; arr.forEach((l) => { l[k] = Math.round(pos); pos += l[sz] + gap; });
    }
    renderAll(); commit();
  }
  function removeSel() { if (!S.sel.size) return; page().layers = page().layers.filter((l) => !S.sel.has(l.id)); S.sel.clear(); renderAll(); commit(); }
  function duplicateSel(offset = 20) {
    const ls = selLayers(); if (!ls.length) return;
    const copies = ls.map((L) => Object.assign(clone(L), { id: uid(), x: L.x + offset, y: L.y + offset }));
    page().layers.push(...copies); S.sel = new Set(copies.map((c) => c.id)); renderAll(); commit();
  }
  function copySel() { const ls = selLayers(); if (ls.length) S.clip = ls.map(clone); }
  function paste() {
    if (!S.clip) return;
    const copies = S.clip.map((L) => Object.assign(clone(L), { id: uid(), x: L.x + 20, y: L.y + 20 }));
    S.clip = copies.map(clone);
    page().layers.push(...copies); S.sel = new Set(copies.map((c) => c.id)); renderAll(); commit();
  }

  /* ---------- 쪽 ---------- */
  function addPage(after = S.pageIdx) { const p = newPage(); const cur = page(); if (cur) { p.bg = cur.bg; p.transition = clone(cur.transition || p.transition); } S.project.pages.splice(after + 1, 0, p); gotoPage(after + 1); commit(); }
  function dupPage() { const p = clone(page()); p.id = uid(); p.layers.forEach((l) => { l.id = uid(); }); S.project.pages.splice(S.pageIdx + 1, 0, p); gotoPage(S.pageIdx + 1); commit(); }
  function delPage() {
    if (S.project.pages.length === 1) { page().layers = []; S.sel.clear(); renderAll(); commit(); return; }
    S.project.pages.splice(S.pageIdx, 1); gotoPage(Math.min(S.pageIdx, S.project.pages.length - 1)); commit();
  }
  function movePage(d) {
    const i = S.pageIdx, j = i + d; const ps = S.project.pages;
    if (j < 0 || j >= ps.length) return; [ps[i], ps[j]] = [ps[j], ps[i]]; gotoPage(j); commit();
  }
  function resize(w, h) {
    const k = Math.min(w / S.project.w, h / S.project.h);
    const ox = (w - S.project.w * k) / 2, oy = (h - S.project.h * k) / 2;
    S.project.pages.forEach((p) => p.layers.forEach((L) => {
      // 쪽 전체를 덮는 배경 도형은 새 크기에 꽉 차게
      if (L.x <= 0 && L.y <= 0 && L.w >= S.project.w && L.h >= S.project.h) { L.x = 0; L.y = 0; L.w = w; L.h = h; return; }
      L.x = Math.round(L.x * k + ox); L.y = Math.round(L.y * k + oy); L.w = Math.round(L.w * k); L.h = Math.round(L.h * k);
      if (L.size) L.size = Math.round(L.size * k * 10) / 10; if (L.sw) L.sw = Math.max(1, Math.round(L.sw * k)); if (L.pad) L.pad = Math.round(L.pad * k); if (L.radius) L.radius = Math.round(L.radius * k);
    }));
    S.project.w = w; S.project.h = h; renderAll(); commit();
  }

  /* ---------- 속성 패널 ---------- */
  let ptab = 'props';
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'on') for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    kids.flat().forEach((c) => c != null && e.append(c));
    return e;
  }
  const sec = (title, ...kids) => el('div', { class: 'psec' }, title ? el('div', { class: 'psh' }, title) : null, ...kids);
  const row = (...kids) => el('div', { class: 'prow' }, ...kids);
  function numField(label, value, onSet, opts = {}) {
    const id = 'ps_' + label.replace(/[^\w가-힣]/g, '') + (opts.key || '');
    const inp = el('input', { type: 'number', id, value: Math.round(value * 100) / 100, step: opts.step || 1, min: opts.min, max: opts.max });
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onSet(v, false); });
    inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onSet(v, true); });
    return el('label', { class: 'pfield', for: id }, el('span', {}, label), inp, opts.unit ? el('em', {}, opts.unit) : null);
  }
  function colorField(label, value, onSet, opts = {}) {
    const wrap = el('div', { class: 'pcolor' }, el('span', { class: 'pl' }, label));
    const sw = el('div', { class: 'pswatches' });
    const cur = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000', title: '직접 고르기', 'aria-label': label + ' 직접 고르기' });
    cur.addEventListener('input', () => onSet(cur.value, false)); cur.addEventListener('change', () => onSet(cur.value, true));
    PALETTE.forEach((c) => sw.appendChild(el('button', { class: 'psw' + ((value || '').toLowerCase() === c ? ' on' : ''), style: `background:${c}`, title: c, 'aria-label': c, on: { click: () => onSet(c, true) } })));
    if (opts.none) sw.appendChild(el('button', { class: 'psw none' + (!value ? ' on' : ''), title: '없음', 'aria-label': '없음', on: { click: () => onSet('', true) } }));
    sw.appendChild(cur);
    wrap.appendChild(sw); return wrap;
  }
  function selectField(label, value, options, onSet) {
    const id = 'ps_' + label.replace(/[^\w가-힣]/g, '');
    const s = el('select', { id, class: 'sel' });
    Object.entries(options).forEach(([k, v]) => s.appendChild(el('option', { value: k }, v)));
    s.value = value; s.addEventListener('change', () => onSet(s.value));
    return el('label', { class: 'pfield wide', for: id }, el('span', {}, label), s);
  }
  function toggles(items) {
    return el('div', { class: 'ptoggles' }, ...items.map(([title, html, on, fn]) => el('button', { class: 'tb' + (on ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': on ? 'true' : 'false', html, on: { mousedown: (e) => e.preventDefault(), click: fn } })));
  }
  function setL(k, v, done) {
    const ls = selLayers(); ls.forEach((L) => { L[k] = v; });
    renderStage(); if (done) { renderLayers(); renderProps(); refreshThumb(); commit(); } else commit(true);
  }
  // 글을 고치는 중에 일부를 골랐다면 그 부분에만, 아니면 글상자 전체에
  function textCmd(cmd, val, prop, propVal) {
    const s = getSelection();
    if (S.editing && s.rangeCount && !s.isCollapsed && layerNode(S.editing) && layerNode(S.editing).contains(s.anchorNode)) {
      document.execCommand('styleWithCSS', false, true);
      if (cmd === 'fontSizePx') {
        document.execCommand('fontSize', false, '7');
        layerNode(S.editing).querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach((n) => { n.removeAttribute('size'); n.style.fontSize = val + 'px'; });
      } else document.execCommand(cmd, false, val);
      const L = layerById(S.editing); if (L) L.html = cleanHtml(layerNode(S.editing).querySelector('.ly-t').innerHTML);
      commit(true); return;
    }
    if (S.editing) endEdit();
    setL(prop, propVal, true);
  }
  function renderProps() {
    const box = $('#dProps'); if (!box || !S.project) return;
    const scrollTop = box.scrollTop;
    box.innerHTML = '';
    S.root.querySelectorAll('[data-ptab]').forEach((b) => b.classList.toggle('on', b.dataset.ptab === ptab));
    const ls = selLayers();
    if (ptab === 'motion') { renderMotion(box, ls); box.scrollTop = scrollTop; return; }
    if (!ls.length) { renderPageProps(box); box.scrollTop = scrollTop; return; }
    const L = ls[0], one = ls.length === 1;
    const kind = one ? (L.type === 'image' ? '그림' : L.type === 'shape' ? (Motion.SHAPES[L.kind] || '도형') : '글상자') : `${ls.length}개 선택`;
    box.appendChild(el('div', { class: 'phead' }, el('b', {}, kind), one ? el('span', {}, layerName(L)) : null));
    // 배치
    const pos = sec('위치와 크기');
    if (one) {
      pos.append(row(numField('X', L.x, (v, d) => setL('x', Math.round(v), d)), numField('Y', L.y, (v, d) => setL('y', Math.round(v), d))));
      const ar = L.w / L.h;
      pos.append(row(
        numField('너비', L.w, (v, d) => { if (L.type === 'image' && L.lockRatio !== false) { L.h = Math.round(v / ar); } setL('w', Math.max(4, Math.round(v)), d); }, { min: 4 }),
        L.type === 'text' && L.autoH !== false ? el('div', { class: 'pfield muted' }, el('span', {}, '높이'), el('b', {}, Math.round(L.h) + ' (자동)')) : numField('높이', L.h, (v, d) => { if (L.type === 'image' && L.lockRatio !== false) { L.w = Math.round(v * ar); } setL('h', Math.max(4, Math.round(v)), d); }, { min: 4 })));
      pos.append(row(numField('회전', L.rot || 0, (v, d) => setL('rot', v, d), { unit: '°', step: 1 }), numField('투명도', Math.round((L.opacity ?? 1) * 100), (v, d) => setL('opacity', Math.max(0, Math.min(100, v)) / 100, d), { unit: '%', min: 0, max: 100 })));
    }
    pos.append(el('div', { class: 'psub' }, ls.length > 1 ? '서로 맞추기' : '쪽에 맞추기'));
    pos.append(toggles([
      ['왼쪽 맞춤', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/></svg>', false, () => alignTo('left')],
      ['가로 가운데', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/></svg>', false, () => alignTo('hcenter')],
      ['오른쪽 맞춤', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/></svg>', false, () => alignTo('right')],
      ['위쪽 맞춤', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h18M7 8v10h4V8zM14 8v6h4V8z"/></svg>', false, () => alignTo('top')],
      ['세로 가운데', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h18M7 6v12h4V6zM14 8v8h4V8z"/></svg>', false, () => alignTo('vcenter')],
      ['아래쪽 맞춤', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20h18M7 6v10h4V6zM14 10v6h4v-6z"/></svg>', false, () => alignTo('bottom')],
      ...(ls.length > 2 ? [['가로 간격 같게', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6v12M21 6v12M9 8h6v8H9z"/></svg>', false, () => alignTo('hdist')], ['세로 간격 같게', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12M6 21h12M8 9h8v6H8z"/></svg>', false, () => alignTo('vdist')]] : []),
    ]));
    pos.append(el('div', { class: 'psub' }, '앞뒤 순서'));
    pos.append(el('div', { class: 'pbtns' },
      el('button', { class: 'btn', on: { click: () => arrange('front') } }, '맨 앞으로'), el('button', { class: 'btn', on: { click: () => arrange('forward') } }, '앞으로'),
      el('button', { class: 'btn', on: { click: () => arrange('backward') } }, '뒤로'), el('button', { class: 'btn', on: { click: () => arrange('back') } }, '맨 뒤로')));
    box.appendChild(pos);

    // 글
    if (ls.every((x) => x.type === 'text' || (x.type === 'shape' && x.kind !== 'line'))) {
      const t = sec(L.type === 'shape' ? '도형 안의 글' : '글');
      const fs = el('select', { class: 'sel', id: 'pFont', 'aria-label': '글꼴' });
      const fonts = DFONTS.includes(L.font) ? DFONTS : [L.font, ...DFONTS];
      fonts.forEach((f) => { const o = el('option', { value: f }, f); o.style.fontFamily = Motion.fontCss(f); fs.appendChild(o); });
      fs.value = L.font; fs.addEventListener('change', () => textCmd('fontName', Motion.fontCss(fs.value), 'font', fs.value));
      t.append(el('label', { class: 'pfield wide', for: 'pFont' }, el('span', {}, '글꼴'), fs));
      t.append(row(numField('크기', L.size || 24, (v, d) => { if (d) textCmd('fontSizePx', v, 'size', v); else setL('size', v, false); }, { min: 4, unit: 'px' }),
        numField('줄 간격', Math.round((L.lh || 1.4) * 100), (v, d) => setL('lh', Math.max(50, v) / 100, d), { unit: '%', step: 5 })));
      t.append(row(numField('자간', L.ls || 0, (v, d) => setL('ls', v, d), { unit: '%', step: 1 }), numField('안쪽 여백', L.pad || 0, (v, d) => setL('pad', Math.max(0, v), d), { unit: 'px' })));
      t.append(toggles([
        ['진하게', '<b>가</b>', L.bold, () => textCmd('bold', null, 'bold', !L.bold)],
        ['기울임', '<i style="font-family:serif">가</i>', L.italic, () => textCmd('italic', null, 'italic', !L.italic)],
        ['밑줄', '<u>가</u>', L.underline, () => textCmd('underline', null, 'underline', !L.underline)],
        ['왼쪽 정렬', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 6h16M4 10h10M4 14h16M4 18h10"/></svg>', L.align === 'left', () => setL('align', 'left', true)],
        ['가운데 정렬', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 6h16M7 10h10M4 14h16M7 18h10"/></svg>', L.align === 'center', () => setL('align', 'center', true)],
        ['오른쪽 정렬', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 6h16M10 10h10M4 14h16M10 18h10"/></svg>', L.align === 'right', () => setL('align', 'right', true)],
        ['양쪽 정렬', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>', L.align === 'justify', () => setL('align', 'justify', true)],
      ]));
      if (L.type === 'shape') t.append(toggles([
        ['위쪽에', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16M8 8h8M8 12h8"/></svg>', L.valign === 'top', () => setL('valign', 'top', true)],
        ['가운데에', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 10h8M8 14h8"/></svg>', !L.valign || L.valign === 'middle', () => setL('valign', 'middle', true)],
        ['아래쪽에', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h16M8 12h8M8 16h8"/></svg>', L.valign === 'bottom', () => setL('valign', 'bottom', true)],
      ]));
      t.append(colorField('글자 색', L.color, (v, d) => (d ? textCmd('foreColor', v, 'color', v) : setL('color', v, false))));
      if (L.type === 'text') t.append(colorField('글상자 배경', L.bg, (v, d) => setL('bg', v, d), { none: true }));
      t.append(el('div', { class: 'pchecks' },
        check('글자 그림자', !!L.tshadow, (v) => setL('tshadow', v, true)),
        L.type === 'text' ? check('글자 테두리', !!(L.sw && L.stroke), (v) => { ls.forEach((x) => { x.stroke = v ? '#ffffff' : ''; x.sw = v ? Math.max(1, Math.round((x.size || 24) / 18)) : 0; }); renderStage(); renderProps(); commit(); }) : null));
      t.append(el('p', { class: 'phint' }, '두 번 눌러 글을 고칩니다. 고치는 중에 일부를 고르면 그 부분에만 서식이 들어갑니다.'));
      box.appendChild(t);
    }
    // 도형
    if (ls.every((x) => x.type === 'shape')) {
      const sh = sec('도형');
      if (one) sh.append(selectField('모양', L.kind, Motion.SHAPES, (v) => setL('kind', v, true)));
      if (L.kind !== 'line') sh.append(colorField('채우기', L.fill, (v, d) => setL('fill', v, d), { none: true }));
      sh.append(colorField(L.kind === 'line' ? '선 색' : '테두리 색', L.stroke, (v, d) => { if (v && !L.sw) ls.forEach((x) => { x.sw = 3; }); setL('stroke', v, d); }, { none: L.kind !== 'line' }));
      sh.append(row(numField('두께', L.sw || 0, (v, d) => setL('sw', Math.max(0, v), d), { unit: 'px', min: 0 }),
        ['roundrect', 'speech'].includes(L.kind) ? numField('모서리', L.radius || 0, (v, d) => setL('radius', Math.max(0, v), d), { unit: 'px', min: 0 }) : el('span')));
      sh.append(el('div', { class: 'pchecks' }, check('점선', !!L.dash, (v) => setL('dash', v, true)), L.kind === 'line' ? check('끝에 화살표', !!L.arrowEnd, (v) => setL('arrowEnd', v, true)) : null, check('그림자', !!L.shadow, (v) => setL('shadow', v, true))));
      box.appendChild(sh);
    }
    // 그림
    if (one && L.type === 'image') {
      const im = sec('그림');
      im.append(selectField('맞춤', L.fit || 'cover', { cover: '꽉 채우기(잘림)', contain: '전체 보이기', fill: '늘리기' }, (v) => setL('fit', v, true)));
      im.append(row(numField('모서리', L.radius || 0, (v, d) => setL('radius', Math.max(0, v), d), { unit: 'px', min: 0 }), numField('테두리', L.sw || 0, (v, d) => setL('sw', Math.max(0, v), d), { unit: 'px', min: 0 })));
      if (L.sw) im.append(colorField('테두리 색', L.stroke, (v, d) => setL('stroke', v, d)));
      im.append(el('div', { class: 'pchecks' }, check('좌우 뒤집기', !!L.flipH, (v) => setL('flipH', v, true)), check('그림자', !!L.shadow, (v) => setL('shadow', v, true))));
      im.append(el('div', { class: 'pbtns' },
        el('button', { class: 'btn', on: { click: () => replaceImage(L) } }, '다른 그림으로 바꾸기'),
        el('button', { class: 'btn', on: { click: () => { const img = new Image(); img.onload = () => { L.h = Math.round(L.w * img.naturalHeight / img.naturalWidth); renderAll(); commit(); }; img.src = srcOf(L.src); } } }, '원래 비율로'),
        el('button', { class: 'btn', on: { click: () => { const p = page(); p.bgImage = L.src; p.layers = p.layers.filter((x) => x.id !== L.id); S.sel.clear(); renderAll(); commit(); } } }, '쪽 배경으로')));
      box.appendChild(im);
    }
    // 공통
    const etc = sec('기타');
    etc.append(el('div', { class: 'pbtns' },
      el('button', { class: 'btn', on: { click: () => { ls.forEach((x) => { x.locked = !L.locked; }); renderAll(); commit(); } } }, L.locked ? '잠금 풀기' : '잠그기'),
      el('button', { class: 'btn', on: { click: () => duplicateSel() } }, '복제 (Ctrl+D)'),
      el('button', { class: 'btn danger', on: { click: removeSel } }, '지우기 (Del)')));
    if (one) {
      const nm = el('input', { type: 'text', id: 'pName', value: L.name || '', placeholder: layerName(L) });
      nm.addEventListener('change', () => { L.name = nm.value.trim(); renderLayers(); commit(); });
      etc.append(el('label', { class: 'pfield wide', for: 'pName' }, el('span', {}, '레이어 이름'), nm));
    }
    box.appendChild(etc);
    box.scrollTop = scrollTop;
  }
  function check(label, on, fn) {
    const id = 'pc_' + label.replace(/\s/g, '');
    const c = el('input', { type: 'checkbox', id }); c.checked = on; c.addEventListener('change', () => fn(c.checked));
    return el('label', { class: 'pcheck', for: id }, c, el('span', {}, label));
  }
  function renderPageProps(box) {
    const p = page();
    box.appendChild(el('div', { class: 'phead' }, el('b', {}, `${S.pageIdx + 1}쪽`), el('span', {}, '고른 레이어가 없을 때는 쪽 설정이 보입니다')));
    const s = sec('쪽 배경');
    s.append(colorField('배경 색', p.bg, (v, d) => { p.bg = v || '#ffffff'; renderStage(); if (d) { refreshThumb(); renderProps(); commit(); } }));
    s.append(el('div', { class: 'pbtns' },
      el('button', { class: 'btn', on: { click: () => $('#dBgInput').click() } }, '배경 그림 고르기'),
      p.bgImage ? el('button', { class: 'btn', on: { click: () => { delete p.bgImage; renderAll(); commit(); } } }, '배경 그림 빼기') : null,
      el('button', { class: 'btn', on: { click: () => { S.project.pages.forEach((q) => { q.bg = p.bg; }); renderThumbs(); commit(); S.toast('모든 쪽에 같은 배경색을 넣었습니다.'); } } }, '모든 쪽에 적용')));
    box.appendChild(s);
    const k = sec('쪽 다루기');
    k.append(el('div', { class: 'pbtns' },
      el('button', { class: 'btn', on: { click: () => { S.sel = new Set(page().layers.filter((l) => !l.locked).map((l) => l.id)); renderAll(); } } }, '모두 고르기 (Ctrl+A)'),
      el('button', { class: 'btn', on: { click: () => S.onExitToDoc && S.onExitToDoc() } }, '한글 문서로 보내기')));
    box.appendChild(k);
    box.appendChild(sec('도움말', el('ul', { class: 'phelp' },
      el('li', {}, '왼쪽 "요소"에서 글·도형·그림·쪽 틀을 넣습니다.'),
      el('li', {}, '끌어서 옮기고, 모서리 점으로 크기, 위쪽 동그라미로 돌립니다.'),
      el('li', {}, 'Shift로 여러 개 고르기, 빈 곳을 끌어 한꺼번에 고르기.'),
      el('li', {}, '방향키로 1px, Shift+방향키로 10px 옮깁니다. Alt를 누르고 끌면 맞춤선이 꺼집니다.'),
      el('li', {}, '"모션" 탭에서 등장 효과와 쪽 전환을 정하고 슬라이드쇼(F5)로 재생합니다.'))));
  }
  function renderMotion(box, ls) {
    const p = page();
    if (ls.length) {
      const L = ls[0]; const an = L.anim || (L.anim = { in: 'none', start: 'auto', delay: 0, dur: 0.6, loop: 'none' });
      const setA = (k, v, done) => { ls.forEach((x) => { x.anim = x.anim || {}; x.anim[k] = v; }); if (done) { renderLayers(); renderProps(); commit(); } else commit(true); };
      box.appendChild(el('div', { class: 'phead' }, el('b', {}, ls.length > 1 ? `${ls.length}개 레이어의 모션` : '레이어 모션'), el('span', {}, ls.length > 1 ? '' : layerName(L))));
      const s = sec('등장 효과');
      s.append(selectField('효과', an.in || 'none', Motion.ENTER, (v) => { setA('in', v, true); if (v !== 'none') previewLayers(ls); }));
      s.append(selectField('시작', an.start || 'auto', { auto: '쪽이 나오면 자동으로', click: '클릭할 때' }, (v) => setA('start', v, true)));
      s.append(row(numField('기다림', an.delay || 0, (v, d) => setA('delay', Math.max(0, v), d), { step: 0.1, unit: '초', min: 0 }), numField('길이', an.dur || 0.6, (v, d) => setA('dur', Math.max(0.1, v), d), { step: 0.1, unit: '초', min: 0.1 })));
      if (an.start === 'click') {
        s.append(numField('클릭 순서', an.order || 0, (v, d) => setA('order', Math.round(v), d), { step: 1, min: 0 }));
      }
      s.append(el('div', { class: 'pbtns' }, el('button', { class: 'btn', on: { click: () => previewLayers(ls) } }, '이 효과 미리보기')));
      box.appendChild(s);
      const s2 = sec('강조(계속 반복)');
      s2.append(selectField('반복', an.loop || 'none', Motion.LOOP, (v) => setA('loop', v, true)));
      box.appendChild(s2);
    } else {
      box.appendChild(el('div', { class: 'phead' }, el('b', {}, `${S.pageIdx + 1}쪽 모션`), el('span', {}, '레이어를 고르면 그 레이어의 등장 효과를 정합니다')));
    }
    const t = p.transition || (p.transition = { type: 'none', dur: 0.6 });
    const s3 = sec('쪽 전환');
    s3.append(selectField('전환 효과', t.type, Motion.TRANS, (v) => { t.type = v; renderThumbs(); commit(); }));
    s3.append(row(numField('전환 길이', t.dur || 0.6, (v, d) => { t.dur = Math.max(0.1, v); if (d) commit(); }, { step: 0.1, unit: '초', min: 0.1 }), numField('자동 넘김', p.auto || 0, (v, d) => { p.auto = Math.max(0, v); if (d) commit(); }, { step: 0.5, unit: '초', min: 0 })));
    s3.append(el('p', { class: 'phint' }, '자동 넘김이 0이면 클릭해야 다음 쪽으로 갑니다.'));
    s3.append(el('div', { class: 'pbtns' }, el('button', { class: 'btn', on: { click: () => { S.project.pages.forEach((q) => { q.transition = clone(t); q.auto = p.auto; }); renderThumbs(); commit(); S.toast('모든 쪽에 같은 전환을 넣었습니다.'); } } }, '모든 쪽에 적용')));
    box.appendChild(s3);
    // 이 쪽의 모션 목록
    const { auto, clicks } = Motion.sequence(p);
    const list = sec('이 쪽의 재생 순서');
    if (!auto.length && !clicks.length) list.append(el('p', { class: 'phint' }, '아직 모션이 없습니다.'));
    const item = (L, label) => el('button', { class: 'pmline' + (S.sel.has(L.id) ? ' on' : ''), on: { click: () => { S.sel = new Set([L.id]); renderAll(); } } },
      el('span', { class: 'pmtag' }, label), el('span', {}, layerName(L)), el('em', {}, Motion.ENTER[L.anim.in] || Motion.LOOP[L.anim.loop] || ''));
    auto.forEach((L) => list.append(item(L, `자동 ${L.anim.delay ? L.anim.delay + '초' : ''}`.trim())));
    clicks.forEach((L, i) => list.append(item(L, `클릭 ${i + 1}`)));
    list.append(el('div', { class: 'pbtns' }, el('button', { class: 'btn', on: { click: preview } }, '이 쪽 미리보기'), el('button', { class: 'btn primary', on: { click: () => slideshow(S.pageIdx) } }, '여기부터 슬라이드쇼')));
    box.appendChild(list);
  }
  function previewLayers(ls) {
    const pe = $('#dWrap .lp-page'); if (!pe) return;
    ls.forEach((L) => { const n = pe.querySelector(`.ly[data-id="${L.id}"]`); if (n && L.anim) { Motion.stopAll(n); Motion.hideForEntry(n, L.anim); Motion.playLayer(n, L.anim); } });
  }
  function preview() {
    if (S.editing) endEdit();
    const pe = $('#dWrap .lp-page'); if (!pe) return;
    S.sel.clear(); drawSel();
    if (S.preview) S.preview.cancel();
    S.preview = Motion.previewPage(pe, page());
  }
  function slideshow(i = 0) {
    if (S.editing) endEdit();
    const ss = Motion.Slideshow(S.project, { onExit: (idx) => { if (idx >= 0) gotoPage(idx); } });
    ss.start(i, true);
  }
  function replaceImage(L) {
    const inp = $('#dImgInput');
    inp.onchange = async () => { const f = inp.files[0]; inp.value = ''; inp.onchange = null; if (!f) return; L.src = addAsset(await readFile(f)); renderAll(); commit(); bindDefaultImgInput(); };
    inp.click();
  }
  function bindDefaultImgInput() { $('#dImgInput').onchange = async (e) => { const fs = Array.from(e.target.files); e.target.value = ''; await addImageFiles(fs); }; }

  /* ---------- 레이어 패널 ---------- */
  function renderLayers() {
    const box = $('#dLayers'); if (!box) return; box.innerHTML = '';
    const ls = page().layers.slice().reverse();
    if (!ls.length) box.appendChild(el('p', { class: 'dhint' }, '이 쪽에는 아직 레이어가 없습니다.'));
    ls.forEach((L) => {
      const item = el('div', { class: 'dlayer' + (S.sel.has(L.id) ? ' on' : '') + (L.hidden ? ' off' : ''), draggable: 'true', 'data-id': L.id });
      const ic = el('span', { class: 'dlic', html: L.type === 'image' ? ICON.image : L.type === 'shape' ? ICON.shape : ICON.text });
      const nm = el('button', { class: 'dlname', on: { click: (e) => { if (e.shiftKey) { S.sel.has(L.id) ? S.sel.delete(L.id) : S.sel.add(L.id); } else S.sel = new Set([L.id]); renderLayers(); renderProps(); drawSel(); }, dblclick: () => startEdit(L.id) } }, layerName(L));
      const an = L.anim && ((L.anim.in && L.anim.in !== 'none') || (L.anim.loop && L.anim.loop !== 'none')) ? el('span', { class: 'dlanim', title: '모션 있음' }, '✦') : null;
      const eye = el('button', { class: 'tb sm', title: L.hidden ? '보이기' : '숨기기', 'aria-label': L.hidden ? '보이기' : '숨기기', html: L.hidden ? ICON.eyeOff : ICON.eye, on: { click: () => { L.hidden = !L.hidden; if (L.hidden) S.sel.delete(L.id); renderAll(); commit(); } } });
      const lock = el('button', { class: 'tb sm', title: L.locked ? '잠금 풀기' : '잠그기', 'aria-label': L.locked ? '잠금 풀기' : '잠그기', html: L.locked ? ICON.lock : ICON.unlock, on: { click: () => { L.locked = !L.locked; renderAll(); commit(); } } });
      item.append(ic, nm, an || '', eye, lock);
      item.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-layer', L.id); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('text/x-layer')) { e.preventDefault(); item.classList.add('dropto'); } });
      item.addEventListener('dragleave', () => item.classList.remove('dropto'));
      item.addEventListener('drop', (e) => {
        e.preventDefault(); item.classList.remove('dropto');
        const from = e.dataTransfer.getData('text/x-layer'); if (!from || from === L.id) return;
        const arr = page().layers; const a = arr.findIndex((x) => x.id === from); const moving = arr.splice(a, 1)[0];
        const b = arr.findIndex((x) => x.id === L.id); arr.splice(b + 1, 0, moving);
        renderAll(); commit();
      });
      box.appendChild(item);
    });
  }

  /* ---------- 이벤트 ---------- */
  function bindUI() {
    const R = S.root;
    R.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      R.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      R.querySelectorAll('.dside [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    }));
    R.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => { ptab = b.dataset.ptab; renderProps(); }));
    R.addEventListener('click', (e) => {
      const b = e.target.closest('[data-d],[data-add],[data-shape],[data-tpl]'); if (!b || !R.contains(b)) return;
      if (b.dataset.shape) return addShape(b.dataset.shape);
      if (b.dataset.tpl) return template(b.dataset.tpl);
      const a = b.dataset.add;
      if (a === 'title' || a === 'subtitle' || a === 'body') return addText(a);
      if (a === 'image') return $('#dImgInput').click();
      if (a === 'table') return addTable();
      const d = b.dataset.d;
      if (d === 'undo') undo(); else if (d === 'redo') redo();
      else if (d === 'addTitle') textMenu(b);
      else if (d === 'shapes') shapeMenu(b);
      else if (d === 'image') $('#dImgInput').click();
      else if (d === 'table') addTable();
      else if (d === 'preview') preview();
      else if (d === 'show') slideshow(0);
      else if (d === 'addPage') addPage(); else if (d === 'dupPage') dupPage(); else if (d === 'delPage') delPage();
      else if (d === 'pageUp') movePage(-1); else if (d === 'pageDown') movePage(1);
    });
    bindDefaultImgInput();
    $('#dBgInput').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; page().bgImage = addAsset(await readFile(f)); renderAll(); commit(); });
    $('#dSize').addEventListener('change', async (e) => {
      const v = e.target.value;
      if (v === 'custom') {
        const r = await (window.HwpUI ? window.HwpUI.askSize(S.project.w, S.project.h) : null);
        if (r) resize(r.w, r.h); else updateInfo(); return;
      }
      const p = PRESETS.find((x) => x[0] === v); if (p) resize(p[2], p[3]);
    });
    $('#dZoom').addEventListener('change', (e) => { const v = e.target.value; S.fit = v === 'fit'; if (!S.fit) S.zoom = parseFloat(v); renderStage(); });
    const st = $('#dStage');
    st.addEventListener('pointerdown', onDown);
    st.addEventListener('pointermove', onMove);
    st.addEventListener('pointerup', onUp);
    st.addEventListener('pointercancel', onUp);
    // 포인터 캡처 때문에 dblclick 대상이 작업면으로 바뀌므로 좌표로 레이어를 찾는다
    st.addEventListener('dblclick', (e) => {
      if (S.editing) return;
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains('ly') && $('#dWrap').contains(x));
      const id = hit ? hit.dataset.id : (S.sel.size === 1 ? [...S.sel][0] : null);
      if (id) startEdit(id);
    });
    st.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); S.fit = false; S.zoom = Math.max(0.1, Math.min(4, S.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
      $('#dZoom').value = ''; renderStage();
    }, { passive: false });
    st.addEventListener('dragover', (e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); e.stopPropagation(); st.classList.add('drop'); } });
    st.addEventListener('dragleave', () => st.classList.remove('drop'));
    st.addEventListener('drop', (e) => {
      st.classList.remove('drop');
      const fs = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
      if (!fs.length) return;
      e.preventDefault(); e.stopPropagation();
      // 그림 자리 도형 위에 놓으면 그 자리를 그림으로 바꿈
      const p = pagePoint(e);
      const target = page().layers.slice().reverse().find((L) => L.type === 'shape' && /그림 자리/.test(L.name || '') && p.x >= L.x && p.x <= L.x + L.w && p.y >= L.y && p.y <= L.y + L.h);
      if (target) { readFile(fs[0]).then((src) => { Object.assign(target, imageLayer(addAsset(src), target.w, target.h, { id: target.id, x: target.x, y: target.y, radius: target.radius || 0, anim: target.anim })); delete target.kind; delete target.html; renderAll(); commit(); }); return; }
      addImageFiles(fs, p);
    });
    window.addEventListener('resize', () => { if (isShown() && S.fit) renderStage(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
  }
  function textMenu(anchor) {
    window.HwpUI && window.HwpUI.menu(anchor, [['제목', () => addText('title')], ['부제목', () => addText('subtitle')], ['본문', () => addText('body')]]);
  }
  function shapeMenu(anchor) {
    window.HwpUI && window.HwpUI.menu(anchor, [...Object.entries(Motion.SHAPES).map(([k, v]) => [v, () => addShape(k)]), ['화살표 선', () => addShape('arrowline')], ['점선', () => addShape('dashline')]]);
  }
  const isShown = () => S.root && !S.root.hidden;
  function typing(e) { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  function onKey(e) {
    if (!isShown() || document.querySelector('.ss-root, .modal-back')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (S.editing) { if (e.key === 'Escape') { e.preventDefault(); endEdit(); } return; }
    if (e.key === 'F5') { e.preventDefault(); slideshow(e.shiftKey ? S.pageIdx : 0); return; }
    if (typing(e)) return;
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); }
    else if (mod && k.toLowerCase() === 'c') { if (S.sel.size) { e.preventDefault(); copySel(); } }
    else if (mod && k.toLowerCase() === 'x') { if (S.sel.size) { e.preventDefault(); copySel(); removeSel(); } }
    else if (mod && k.toLowerCase() === 'v') { if (S.clip) { e.preventDefault(); paste(); } }
    else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); S.sel = new Set(page().layers.filter((l) => !l.locked && !l.hidden).map((l) => l.id)); renderAll(); }
    else if (mod && k === ']') { e.preventDefault(); arrange(e.shiftKey ? 'front' : 'forward'); }
    else if (mod && k === '[') { e.preventDefault(); arrange(e.shiftKey ? 'back' : 'backward'); }
    else if (k === 'Delete' || k === 'Backspace') { if (S.sel.size) { e.preventDefault(); removeSel(); } }
    else if (k === 'Escape') { S.sel.clear(); renderAll(); }
    else if (k === 'Enter' && S.sel.size === 1) { e.preventDefault(); startEdit([...S.sel][0]); }
    else if (k.startsWith('Arrow') && S.sel.size) {
      e.preventDefault(); const d = e.shiftKey ? 10 : 1;
      selLayers().forEach((L) => { if (L.locked) return; if (k === 'ArrowLeft') L.x -= d; if (k === 'ArrowRight') L.x += d; if (k === 'ArrowUp') L.y -= d; if (k === 'ArrowDown') L.y += d; });
      renderStage(); renderProps(); commit(true); refreshThumb();
    } else if (k === 'PageDown') { e.preventDefault(); gotoPage(S.pageIdx + 1); }
    else if (k === 'PageUp') { e.preventDefault(); gotoPage(S.pageIdx - 1); }
  }
  async function onPaste(e) {
    if (!isShown() || S.editing || typing(e)) return;
    const cd = e.clipboardData; if (!cd) return;
    const files = Array.from(cd.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); await addImageFiles(files); return; }
    if (S.clip) return; // 앱 안에서 복사한 레이어는 keydown에서 처리
    const t = cd.getData('text/plain');
    if (t && t.trim()) {
      e.preventDefault();
      const html = t.replace(/\r\n?/g, '\n').split('\n').map((l) => `<p>${Motion.esc(l) || '<br>'}</p>`).join('');
      const k = scaleBase(); const L = textLayer(html, { size: Math.round(26 * k), w: Math.round(S.project.w * 0.6) }); center(L); add(L);
    }
  }

  /* ---------- 바깥에서 쓰는 기능 ---------- */
  return {
    build, newProject, newPage, textLayer, shapeLayer, imageLayer, uid, PRESETS, addAsset,
    open(project, opts = {}) {
      S.project = project; if (!S.project.assets) S.project.assets = {};
      S.pageIdx = Math.min(opts.page || 0, project.pages.length - 1); S.sel.clear(); S.editing = null; S.fit = true;
      const zs = $('#dZoom'); if (zs) zs.value = 'fit';
      resetHistory(); renderAll();
    },
    get project() { if (S.editing) endEdit(); return S.project; },
    hasProject: () => !!S.project,
    isEmpty: () => !S.project || S.project.pages.every((p) => !p.layers.length && !p.bgImage),
    show() { S.root.hidden = false; requestAnimationFrame(() => { renderAll(); }); },
    hide() { if (S.editing) endEdit(); if (S.preview) S.preview.cancel(); S.root.hidden = true; },
    refresh: renderAll,
    slideshow, gotoPage,
    set onChange(fn) { S.onChange = fn; }, set onExitToDoc(fn) { S.onExitToDoc = fn; }, set toast(fn) { S.toast = fn; },
    get pageIndex() { return S.pageIdx; },
    srcOf, addTemplate: template,
  };
})();
