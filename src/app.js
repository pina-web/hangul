/* ===== 편집기 본체 ===== */
(() => {
  const $ = (id) => document.getElementById(id);
  const ed = $('page');
  const appEl = $('app');
  const PAPERS = { A4: [210, 297], A3: [297, 420], B5: [182, 257], B4: [257, 364], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
  const DEFAULT_PAGE = { paper: 'A4', w: 210, h: 297, landscape: false, mt: 20, mb: 15, ml: 30, mr: 30, hd: 15, ft: 15 };
  const FONTS = ['함초롬바탕', '함초롬돋움', '맑은 고딕', '바탕', '돋움', '굴림', '궁서', '나눔고딕', '나눔명조', 'Noto Sans KR', 'Noto Serif KR', 'HY헤드라인M', '휴먼명조', 'Arial', 'Times New Roman'];
  const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];
  const LHS = [100, 115, 130, 150, 160, 180, 200, 250, 300];
  const COLORS = ['#000000', '#434343', '#7f7f7f', '#bfbfbf', '#ffffff', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#1f4fbf', '#8e44ad', '#7b3f00', '#d35400', '#2c3e50'];
  const HILITES = ['#ffe14d', '#fff3a3', '#c7f0c2', '#b9e6f5', '#d9d2f5', '#ffd1dc', '#ffd8b0', '#e3e7ee'];
  const SPECIAL = '※○●◎□■△▲▽▼◇◆☆★→←↑↓↔⇒▶◀▷◁「」『』【】〈〉《》·…‘’“”㈜℃㎜㎝㎞㎡㎏㎖①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤ✓✔☎♥♣♠♦¶§±×÷≠≤≥∞₩'.split('');

  const state = {
    page: Object.assign({}, DEFAULT_PAGE),
    source: null,      // {name, ext, bytes} 원본
    fmt: '새 문서',
    dirty: false,
    zoom: 1,
    savedRange: null,
    pendingSize: null,
    textColor: '#c0392b', hilite: '#ffe14d',
    selImg: null,
  };

  /* ---------- 공통 UI ---------- */
  let toastTimer;
  function toast(msg, opts = {}) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div'); t.className = 'toast' + (opts.err ? ' err' : '');
    t.setAttribute('role', 'status');
    const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
    if (opts.action) { const b = document.createElement('button'); b.textContent = opts.action.label; b.onclick = () => { t.remove(); opts.action.run(); }; t.appendChild(b); }
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), opts.ms || (opts.err ? 7000 : 3200));
  }
  let busyEl = null;
  function busy(msg) {
    if (msg === false) { if (busyEl) busyEl.remove(); busyEl = null; return; }
    if (!busyEl) { busyEl = document.createElement('div'); busyEl.className = 'busy'; busyEl.innerHTML = '<div class="busy-box"><div class="spinner"></div><span></span></div>'; document.body.appendChild(busyEl); }
    busyEl.querySelector('span').textContent = msg;
  }
  function modal(title, bodyEl, buttons) {
    return new Promise((resolve) => {
      const back = document.createElement('div'); back.className = 'modal-back';
      const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      const h = document.createElement('h2'); h.textContent = title; m.appendChild(h);
      if (typeof bodyEl === 'string') { const p = document.createElement('p'); p.textContent = bodyEl; m.appendChild(p); } else if (bodyEl) m.appendChild(bodyEl);
      const act = document.createElement('div'); act.className = 'actions';
      buttons.forEach((b) => {
        const el = document.createElement('button'); el.className = 'btn' + (b.primary ? ' primary' : ''); el.textContent = b.label;
        if (b.danger) el.style.color = 'var(--danger)';
        el.onclick = () => { back.remove(); resolve(b.value); };
        act.appendChild(el);
      });
      m.appendChild(act); back.appendChild(m);
      back.addEventListener('keydown', (e) => { if (e.key === 'Escape') { back.remove(); resolve(null); } });
      back.addEventListener('mousedown', (e) => { if (e.target === back) { back.remove(); resolve(null); } });
      document.body.appendChild(back);
      const pr = act.querySelector('.primary') || act.querySelector('button'); pr && pr.focus();
    });
  }

  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function openPop(anchor, build) {
    closePop();
    const p = document.createElement('div'); p.className = 'pop'; build(p);
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();
    let left = Math.min(r.left, window.innerWidth - p.offsetWidth - 8);
    let top = r.bottom + 6;
    if (top + p.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - p.offsetHeight - 6);
    p.style.left = Math.max(8, left) + 'px'; p.style.top = top + 'px';
    popEl = p;
    const first = p.querySelector('button, input'); if (first && anchor.id !== 'btnTable') first.focus({ preventScroll: true });
    return p;
  }
  document.addEventListener('mousedown', (e) => { if (popEl && !popEl.contains(e.target) && !e.target.closest('[aria-haspopup], .tb, .ctxbar .btn')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

  /* ---------- 저장(내려받기) ---------- */
  function download(data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const baseName = () => ($('docName').value.trim() || '문서').replace(/[\\/:*?"<>|]+/g, '_');

  /* ---------- 선택 영역 보존 ---------- */
  function inEditor(node) { return node && (node === ed || ed.contains(node)); }
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && inEditor(s.anchorNode)) { state.savedRange = s.getRangeAt(0).cloneRange(); updateToolbar(); updateContext(); }
  });
  function restoreSel() {
    ed.focus({ preventScroll: true });
    const s = getSelection();
    if (state.savedRange && inEditor(state.savedRange.startContainer)) { s.removeAllRanges(); s.addRange(state.savedRange); }
    else if (!s.rangeCount || !inEditor(s.anchorNode)) {
      const r = document.createRange(); r.selectNodeContents(ed.lastElementChild || ed); r.collapse(false); s.removeAllRanges(); s.addRange(r);
    }
  }
  function exec(cmd, val = null) {
    restoreSel();
    document.execCommand('styleWithCSS', false, cmd !== 'hiliteColor' ? true : true);
    document.execCommand(cmd, false, val);
    markDirty(); updateToolbar();
  }

  /* ---------- 문서 내용 넣기(정리) ---------- */
  const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUP', 'SUB', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'IMG', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FONT', 'BLOCKQUOTE', 'HR', 'PRE', 'CODE', 'A', 'CENTER', 'MARK', 'SMALL', 'BIG', 'CAPTION']);
  const ALLOWED_CSS = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'font-size', 'font-family', 'text-align', 'vertical-align', 'width', 'height', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'text-indent', 'line-height', 'border-style', 'border-color', 'padding-left'];
  function sanitize(html, keepClasses) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const walk = (node) => {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 8) { ch.remove(); continue; }
        if (ch.nodeType !== 1) continue;
        const tag = ch.tagName;
        if (['SCRIPT', 'STYLE', 'META', 'LINK', 'IFRAME', 'OBJECT', 'EMBED', 'TITLE', 'HEAD', 'svg', 'SVG', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM'].includes(tag)) { ch.remove(); continue; }
        if (!ALLOWED_TAGS.has(tag)) { walk(ch); ch.replaceWith(...ch.childNodes); continue; }
        // 속성 정리
        const keep = {};
        if (tag === 'IMG') { const src = ch.getAttribute('src') || ''; if (/^(data:image\/|blob:|https?:)/i.test(src)) keep.src = src; else { ch.remove(); continue; } ['width', 'height', 'alt'].forEach((a) => { if (ch.hasAttribute(a)) keep[a] = ch.getAttribute(a); }); }
        if (tag === 'TD' || tag === 'TH') ['colspan', 'rowspan'].forEach((a) => { if (ch.hasAttribute(a)) keep[a] = ch.getAttribute(a); });
        if (tag === 'COL') ['span'].forEach((a) => { if (ch.hasAttribute(a)) keep[a] = ch.getAttribute(a); });
        if (tag === 'FONT') { if (ch.getAttribute('color')) ch.style.color = ch.getAttribute('color'); if (ch.getAttribute('face')) ch.style.fontFamily = ch.getAttribute('face'); }
        if (tag === 'OL' && ch.hasAttribute('start')) keep.start = ch.getAttribute('start');
        const css = [];
        for (const prop of ALLOWED_CSS) { const v = ch.style.getPropertyValue(prop); if (v && !/expression|url\(/i.test(v)) css.push(prop + ':' + v); }
        const cls = keepClasses ? (ch.getAttribute('class') || '').split(/\s+/).filter((c) => ['pagebreak', 'tab', 'textbox', 'eq', 'ph', 'hwp-table', 'noborder', 'pb-before'].includes(c)).join(' ') : '';
        for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
        for (const k in keep) ch.setAttribute(k, keep[k]);
        if (css.length) ch.setAttribute('style', css.join(';'));
        if (cls) ch.setAttribute('class', cls);
        if (tag === 'A') { walk(ch); const sp = document.createElement('span'); sp.style.cssText = 'color:#1f4fbf;text-decoration:underline'; sp.append(...ch.childNodes); ch.replaceWith(sp); continue; }
        if (tag === 'FONT') { const sp = document.createElement('span'); if (css.length) sp.setAttribute('style', css.join(';')); walk(ch); sp.append(...ch.childNodes); ch.replaceWith(sp); continue; }
        walk(ch);
      }
    };
    walk(tpl.content);
    return tpl.content;
  }

  function normalize(root) {
    // 쪽 나누기 표시 변환
    root.querySelectorAll('.pb-before').forEach((el) => {
      el.classList.remove('pb-before'); if (!el.className) el.removeAttribute('class');
      const pb = document.createElement('div'); pb.className = 'pagebreak'; pb.contentEditable = 'false';
      el.before(pb);
    });
    root.querySelectorAll('.pagebreak').forEach((pb) => { pb.contentEditable = 'false'; pb.innerHTML = ''; });
    root.querySelectorAll('hr').forEach((hr) => {
      const style = (hr.getAttribute('style') || '');
      if (/page-break|break-after/.test(style)) { const pb = document.createElement('div'); pb.className = 'pagebreak'; pb.contentEditable = 'false'; hr.replaceWith(pb); }
    });
    // 최상위의 맨 글자·인라인 요소는 문단으로 감싸기
    let run = null;
    for (const ch of Array.from(root.childNodes)) {
      const inline = ch.nodeType === 3 ? ch.nodeValue.trim() !== '' : (ch.nodeType === 1 && !/^(P|DIV|H[1-6]|TABLE|UL|OL|BLOCKQUOTE|PRE|HR)$/.test(ch.tagName));
      if (ch.nodeType === 3 && !inline) { if (!run) ch.remove(); else run.appendChild(ch); continue; }
      if (inline) { if (!run) { run = document.createElement('p'); ch.before(run); } run.appendChild(ch); }
      else run = null;
    }
    // 칸 수가 모자란 줄은 빈 셀로 채우기(표 편집·저장이 격자를 전제로 함)
    root.querySelectorAll('table').forEach((tbl) => {
      const nr = tbl.rows.length;
      Array.from(tbl.rows).forEach((tr, r) => Array.from(tr.cells).forEach((td) => { if (td.rowSpan > nr - r) td.rowSpan = Math.max(1, nr - r); }));
      const G = grid(tbl);
      for (let r = 0; r < G.rows; r++) {
        for (let c = 0; c < G.cols; c++) {
          if (G.g[r][c]) continue;
          const td = newCell(); const tr = tbl.rows[r];
          const after = Array.from(tr.cells).find((x) => G.pos.get(x) && G.pos.get(x).c > c);
          tr.insertBefore(td, after || null);
          G.g[r][c] = td; G.pos.set(td, { r, c, cs: 1, rs: 1 });
        }
      }
    });
    // 빈 셀·빈 문단 채우기
    root.querySelectorAll('td, th').forEach((td) => { if (!td.firstChild) td.innerHTML = '<p><br></p>'; });
    root.querySelectorAll('p, h1, h2, h3, li').forEach((p) => { if (!p.firstChild) p.innerHTML = '<br>'; });
    // 표 다음에 문단이 없으면 커서 둘 곳 확보
    const last = root.lastElementChild;
    if (!last || last.tagName === 'TABLE' || last.classList.contains('pagebreak')) root.insertAdjacentHTML('beforeend', '<p><br></p>');
  }

  function setContent(html, opts = {}) {
    ed.innerHTML = '';
    ed.appendChild(sanitize(html, true));
    normalize(ed);
    state.selImg = null;
    if (!opts.keepDirty) setDirty(false);
    layout(); updateStats(); ed.scrollTop = 0; $('workspace').scrollTop = 0;
  }

  /* ---------- 상태 표시 ---------- */
  function setDirty(v) { state.dirty = v; appEl.classList.toggle('dirty', v); }
  let statsTimer, autosaveTimer;
  function markDirty() {
    setDirty(true);
    clearTimeout(statsTimer); statsTimer = setTimeout(() => { layout(); updateStats(); }, 250);
    clearTimeout(autosaveTimer); autosaveTimer = setTimeout(autosave, 1500);
  }
  function updateStats() {
    const t = ed.innerText || '';
    $('stChars').textContent = t.replace(/\n/g, '').length.toLocaleString('ko-KR');
    $('stCharsNs').textContent = t.replace(/\s/g, '').length.toLocaleString('ko-KR');
  }
  function setFormat(label, info) { state.fmt = label; $('fmtChip').textContent = label; $('stInfo').textContent = info || ''; }

  /* ---------- 용지·쪽 표시 ---------- */
  const MMPX = 96 / 25.4;
  function applyPage() {
    const p = state.page;
    ed.style.width = p.w + 'mm';
    ed.style.minHeight = p.h + 'mm';
    ed.style.padding = `${p.mt + p.hd}mm ${p.mr}mm ${p.mb + p.ft}mm ${p.ml}mm`;
    $('pageStyle').textContent = `@page { size: ${p.w}mm ${p.h}mm; margin: 0; } @media print { .page { width: ${p.w}mm !important; } }`;
    $('pageLabel').textContent = (p.paper && p.paper !== '사용자' ? p.paper : `${Math.round(p.w)}×${Math.round(p.h)}`) + (p.landscape ? ' 가로' : '');
    layout();
  }
  function layout() {
    const p = state.page;
    const top = (p.mt + p.hd) * MMPX, bottom = (p.mb + p.ft) * MMPX;
    const contentH = (p.h * MMPX) - top - bottom;
    const total = ed.scrollHeight - top - bottom;
    // 쪽 나누기 고려한 대략적 쪽 수
    let pages = 1, used = 0;
    const kids = Array.from(ed.children);
    const marks = [];
    let lastBreakY = top;
    for (const k of kids) {
      if (k.classList.contains('pagebreak')) { pages++; marks.push({ y: k.offsetTop, forced: true, n: pages }); lastBreakY = k.offsetTop; continue; }
      const bottomY = k.offsetTop + k.offsetHeight;
      while (bottomY - lastBreakY > contentH + 1) { lastBreakY += contentH; pages++; marks.push({ y: lastBreakY, n: pages }); }
    }
    $('stPages').textContent = pages;
    const mk = $('markers'); mk.innerHTML = '';
    for (const m of marks) {
      if (m.forced) continue;
      const d = document.createElement('div'); d.className = 'marker'; d.style.top = m.y + 'px';
      const s = document.createElement('span'); s.textContent = m.n + '쪽'; d.appendChild(s); mk.appendChild(d);
    }
    if (state.zoomMode === 'fit') fitZoom();
  }
  function setZoom(z) {
    state.zoom = z; $('zoomWrap').style.zoom = z;
  }
  function fitZoom() {
    const avail = $('workspace').clientWidth - 32;
    const need = state.page.w * MMPX + 2;
    setZoom(Math.max(0.3, Math.min(2, avail / need)));
  }
  $('zoomSel').addEventListener('change', (e) => {
    const v = e.target.value;
    state.zoomMode = v === 'fit' ? 'fit' : null;
    if (v === 'fit') fitZoom(); else setZoom(parseFloat(v));
  });
  window.addEventListener('resize', () => { if (state.zoomMode === 'fit') fitZoom(); });

  /* ---------- 서식 막대 ---------- */
  FONTS.forEach((f) => { const o = document.createElement('option'); o.value = f; o.textContent = f; o.style.fontFamily = Fonts.css(f); $('fontSel').appendChild(o); });
  SIZES.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s; $('sizeSel').appendChild(o); });
  LHS.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s + '%'; $('lhSel').appendChild(o); });
  $('sizeSel').value = 10; $('lhSel').value = 160;

  function caretEl() {
    const s = getSelection(); if (!s.rangeCount) return null;
    let n = s.anchorNode; if (!inEditor(n)) return null;
    if (n.nodeType === 3) n = n.parentElement;
    return n;
  }
  function blockOf(n) {
    while (n && n !== ed) { if (n.nodeType === 1 && /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName) && !n.classList.contains('pagebreak') && !n.classList.contains('textbox')) return n; n = n.parentElement; }
    return null;
  }
  function updateToolbar() {
    document.querySelectorAll('.tb[data-cmd]').forEach((b) => {
      const c = b.dataset.cmd;
      if (['undo', 'redo', 'removeFormat'].includes(c)) return;
      try { b.classList.toggle('on', document.queryCommandState(c)); } catch (e) { /* 무시 */ }
    });
    const el = caretEl(); if (!el) return;
    const cs = getComputedStyle(el);
    const fam = Fonts.first(cs.fontFamily);
    const fs = $('fontSel');
    if (fam && ![...fs.options].some((o) => o.value === fam)) { const o = document.createElement('option'); o.value = fam; o.textContent = fam; fs.appendChild(o); }
    if (fam) fs.value = fam;
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    const ss = $('sizeSel');
    if (![...ss.options].some((o) => +o.value === pt)) { const o = document.createElement('option'); o.value = pt; o.textContent = pt; ss.appendChild(o); [...ss.options].sort((a, b) => a.value - b.value).forEach((x) => ss.appendChild(x)); }
    ss.value = pt;
    const blk = blockOf(el);
    if (blk) {
      const bcs = getComputedStyle(blk);
      const lh = bcs.lineHeight === 'normal' ? 160 : Math.round(parseFloat(bcs.lineHeight) / parseFloat(bcs.fontSize) * 100);
      const nearest = LHS.reduce((a, b) => Math.abs(b - lh) < Math.abs(a - lh) ? b : a, 160);
      $('lhSel').value = nearest;
      const tag = blk.tagName.toLowerCase();
      $('styleSel').value = ['h1', 'h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p';
    }
  }

  document.querySelectorAll('.tb[data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => exec(b.dataset.cmd));
  });
  $('styleSel').addEventListener('change', (e) => { exec('formatBlock', e.target.value === 'p' ? 'P' : e.target.value.toUpperCase()); });
  $('fontSel').addEventListener('change', (e) => { exec('fontName', Fonts.css(e.target.value)); });
  function setFontSize(pt) {
    restoreSel();
    state.pendingSize = pt;
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('fontSize', false, '7');
    fixFontSizes();
    markDirty(); updateToolbar();
  }
  function fixFontSizes() {
    if (!state.pendingSize) return;
    ed.querySelectorAll('[style*="xxx-large"], font[size="7"]').forEach((el) => {
      el.removeAttribute('size'); el.style.fontSize = state.pendingSize + 'pt';
    });
  }
  $('sizeSel').addEventListener('change', (e) => setFontSize(parseFloat(e.target.value)));
  const stepSize = (dir) => {
    const cur = parseFloat($('sizeSel').value) || 10;
    let next = dir > 0 ? SIZES.find((s) => s > cur) : [...SIZES].reverse().find((s) => s < cur);
    if (next) setFontSize(next);
  };
  $('sizeUp').addEventListener('mousedown', (e) => e.preventDefault());
  $('sizeDown').addEventListener('mousedown', (e) => e.preventDefault());
  $('sizeUp').addEventListener('click', () => stepSize(1));
  $('sizeDown').addEventListener('click', () => stepSize(-1));

  function selectedBlocks() {
    restoreSel();
    const s = getSelection(); if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    const all = Array.from(ed.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div:not(.pagebreak):not(.textbox)'))
      .filter((b) => !b.querySelector('p, h1, h2, h3, h4, h5, h6, li, div:not(.pagebreak)'));
    const hit = all.filter((b) => r.intersectsNode(b));
    if (!hit.length) { const b = blockOf(caretEl()); if (b) hit.push(b); }
    return hit;
  }
  $('lhSel').addEventListener('change', (e) => {
    const v = +e.target.value; selectedBlocks().forEach((b) => { b.style.lineHeight = (v / 100).toFixed(2); });
    markDirty();
  });
  function indent(delta) {
    selectedBlocks().forEach((b) => {
      const cur = parseFloat(b.style.marginLeft) || 0;
      const next = Math.max(0, cur + delta);
      b.style.marginLeft = next ? next.toFixed(1) + 'px' : '';
    });
    markDirty();
  }
  ['btnIndent', 'btnOutdent'].forEach((id) => $(id).addEventListener('mousedown', (e) => e.preventDefault()));
  $('btnIndent').addEventListener('click', () => indent(10 * MMPX));
  $('btnOutdent').addEventListener('click', () => indent(-10 * MMPX));

  // 색
  function swatchPop(anchor, colors, onPick, opts = {}) {
    openPop(anchor, (p) => {
      const g = document.createElement('div'); g.className = 'swatches';
      colors.forEach((c) => { const b = document.createElement('button'); b.style.background = c; b.title = c; b.setAttribute('aria-label', c); b.onmousedown = (e) => e.preventDefault(); b.onclick = () => { closePop(); onPick(c); }; g.appendChild(b); });
      p.appendChild(g);
      const row = document.createElement('div'); row.className = 'pop-row';
      const lab = document.createElement('label'); lab.textContent = '직접 고르기 ';
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = opts.value || '#000000';
      inp.onchange = () => { closePop(); onPick(inp.value); };
      lab.appendChild(inp); row.appendChild(lab);
      if (opts.none) { const n = document.createElement('button'); n.className = 'btn'; n.textContent = '없음'; n.style.marginLeft = 'auto'; n.onmousedown = (e) => e.preventDefault(); n.onclick = () => { closePop(); onPick(null); }; row.appendChild(n); }
      p.appendChild(row);
    });
  }
  ['btnColor', 'btnHilite', 'btnTable', 'btnChars'].forEach((id) => $(id).addEventListener('mousedown', (e) => e.preventDefault()));
  $('btnColor').addEventListener('click', (e) => swatchPop(e.currentTarget, COLORS, (c) => { state.textColor = c; $('colorSw').style.background = c; exec('foreColor', c); }, { value: state.textColor }));
  $('btnHilite').addEventListener('click', (e) => swatchPop(e.currentTarget, HILITES, (c) => {
    if (c) { state.hilite = c; $('hiliteSw').style.background = c; exec('hiliteColor', c); }
    else { exec('hiliteColor', 'transparent'); }
  }, { value: state.hilite, none: true }));

  // 문자표
  $('btnChars').addEventListener('click', (e) => openPop(e.currentTarget, (p) => {
    const g = document.createElement('div'); g.className = 'chars';
    SPECIAL.forEach((c) => { const b = document.createElement('button'); b.textContent = c; b.onmousedown = (ev) => ev.preventDefault(); b.onclick = () => { exec('insertText', c); }; g.appendChild(b); });
    p.appendChild(g);
  }));

  // 쪽 나누기
  function insertPageBreak() {
    restoreSel();
    const blk = blockOf(caretEl());
    const pb = document.createElement('div'); pb.className = 'pagebreak'; pb.contentEditable = 'false';
    const np = document.createElement('p'); np.innerHTML = '<br>';
    if (blk && blk.parentElement === ed) { blk.after(pb); pb.after(np); }
    else ed.appendChild(pb), ed.appendChild(np);
    const r = document.createRange(); r.setStart(np, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    markDirty();
  }
  $('btnPageBreak').addEventListener('mousedown', (e) => e.preventDefault());
  $('btnPageBreak').addEventListener('click', insertPageBreak);

  /* ---------- 표 ---------- */
  $('btnTable').addEventListener('click', (e) => openPop(e.currentTarget, (p) => {
    const lab = document.createElement('div'); lab.className = 'tgrid-label'; lab.textContent = '줄 × 칸 고르기';
    const g = document.createElement('div'); g.className = 'tgrid';
    const R = 8, C = 10;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = document.createElement('i'); i.dataset.r = r; i.dataset.c = c; g.appendChild(i);
    }
    g.addEventListener('mouseover', (ev) => {
      const t = ev.target; if (!t.dataset.r) return;
      const rr = +t.dataset.r, cc = +t.dataset.c;
      g.querySelectorAll('i').forEach((x) => x.classList.toggle('on', +x.dataset.r <= rr && +x.dataset.c <= cc));
      lab.textContent = `${rr + 1}줄 × ${cc + 1}칸`;
    });
    g.addEventListener('mousedown', (ev) => ev.preventDefault());
    g.addEventListener('click', (ev) => { const t = ev.target; if (!t.dataset.r) return; closePop(); insertTable(+t.dataset.r + 1, +t.dataset.c + 1); });
    p.appendChild(g); p.appendChild(lab);
  }));
  function insertTable(rows, cols) {
    restoreSel();
    const textW = (state.page.w - state.page.ml - state.page.mr) * MMPX - 2;
    const cw = Math.floor(textW / cols);
    let h = `<table class="hwp-table" style="width:${cw * cols}px"><colgroup>${('<col style="width:' + cw + 'px">').repeat(cols)}</colgroup>`;
    for (let r = 0; r < rows; r++) h += '<tr>' + '<td><p><br></p></td>'.repeat(cols) + '</tr>';
    h += '</table><p><br></p>';
    const blk = blockOf(caretEl());
    const tpl = document.createElement('template'); tpl.innerHTML = h;
    const tbl = tpl.content.querySelector('table');
    if (blk && blk.parentElement === ed && !blk.textContent.trim() && !blk.querySelector('img')) { blk.replaceWith(tpl.content); }
    else if (blk && blk.parentElement === ed) { blk.after(tpl.content); }
    else { const td = caretEl() && caretEl().closest('td'); if (td) { exec('insertHTML', h); return; } ed.appendChild(tpl.content); }
    placeCaret(tbl.rows[0].cells[0]);
    markDirty();
  }
  function placeCaret(el, end) {
    const r = document.createRange(); const target = el.querySelector('p') || el;
    r.selectNodeContents(target); r.collapse(!end ? true : false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); state.savedRange = r.cloneRange();
  }
  // 표 격자 계산
  function grid(tbl) {
    const g = []; const pos = new Map();
    Array.from(tbl.rows).forEach((tr, ri) => {
      g[ri] = g[ri] || []; let c = 0;
      Array.from(tr.cells).forEach((td) => {
        while (g[ri][c]) c++;
        const cs = td.colSpan || 1, rs = td.rowSpan || 1;
        for (let y = 0; y < rs; y++) for (let x = 0; x < cs; x++) { g[ri + y] = g[ri + y] || []; g[ri + y][c + x] = td; }
        pos.set(td, { r: ri, c, cs, rs }); c += cs;
      });
    });
    const cols = Math.max(...g.map((r) => r.length));
    return { g, pos, cols, rows: tbl.rows.length };
  }
  function newCell() { const td = document.createElement('td'); td.innerHTML = '<p><br></p>'; return td; }
  function insertCellAt(tr, rowIdx, col, G, td) {
    // tr의 칸 중 시작 열이 col보다 큰 첫 칸 앞에 넣기
    const after = Array.from(tr.cells).find((x) => G.pos.get(x) && G.pos.get(x).c > col);
    tr.insertBefore(td, after || null);
  }
  function syncColgroup(tbl) {
    const G = grid(tbl);
    let cg = tbl.querySelector('colgroup');
    if (cg) { while (cg.children.length < G.cols) cg.appendChild(document.createElement('col')); while (cg.children.length > G.cols) cg.lastElementChild.remove(); }
  }
  const tableOps = {
    rowAbove: (td) => addRow(td, false), rowBelow: (td) => addRow(td, true),
    colLeft: (td) => addCol(td, false), colRight: (td) => addCol(td, true),
    delRow(td) {
      const tbl = td.closest('table'); const G = grid(tbl); const p = G.pos.get(td); const r = p.r;
      if (G.rows === 1) return tableOps.delTable(td);
      const tr = tbl.rows[r];
      for (let c = 0; c < G.cols; c++) {
        const cell = G.g[r][c]; if (!cell) continue; const cp = G.pos.get(cell); if (cp.c !== c) continue;
        if (cp.r < r) cell.rowSpan = cp.rs - 1;
        else if (cp.rs > 1) { cell.rowSpan = cp.rs - 1; const next = tbl.rows[r + 1]; if (next) insertCellAt(next, r + 1, c, G, cell); }
      }
      tr.remove();
      const nt = tbl.rows[Math.min(r, tbl.rows.length - 1)]; if (nt && nt.cells[0]) placeCaret(nt.cells[0]);
    },
    delCol(td) {
      const tbl = td.closest('table'); const G = grid(tbl); const c = G.pos.get(td).c;
      if (G.cols === 1) return tableOps.delTable(td);
      const seen = new Set();
      for (let r = 0; r < G.rows; r++) {
        const cell = G.g[r][c]; if (!cell || seen.has(cell)) continue; seen.add(cell);
        if ((cell.colSpan || 1) > 1) cell.colSpan -= 1; else cell.remove();
      }
      const cg = tbl.querySelector('colgroup'); if (cg && cg.children[c]) cg.children[c].remove();
      tbl.style.width = '';
      const first = tbl.rows[0] && tbl.rows[0].cells[0]; if (first) placeCaret(first);
    },
    mergeRight(td) {
      const tbl = td.closest('table'); const G = grid(tbl); const p = G.pos.get(td);
      const nb = G.g[p.r][p.c + p.cs]; if (!nb) return toast('오른쪽에 합칠 셀이 없습니다.');
      const np = G.pos.get(nb);
      if (np.r !== p.r || np.rs !== p.rs) return toast('높이가 다른 셀은 합칠 수 없습니다.');
      mergeContent(td, nb); td.colSpan = p.cs + np.cs; nb.remove();
    },
    mergeDown(td) {
      const tbl = td.closest('table'); const G = grid(tbl); const p = G.pos.get(td);
      const row = G.g[p.r + p.rs]; const nb = row && row[p.c]; if (!nb) return toast('아래에 합칠 셀이 없습니다.');
      const np = G.pos.get(nb);
      if (np.c !== p.c || np.cs !== p.cs) return toast('너비가 다른 셀은 합칠 수 없습니다.');
      mergeContent(td, nb); td.rowSpan = p.rs + np.rs; nb.remove();
    },
    split(td) {
      const tbl = td.closest('table'); const G = grid(tbl); const p = G.pos.get(td);
      if (p.cs === 1 && p.rs === 1) return toast('이미 나뉘어 있는 셀입니다. 합쳐진 셀에서 사용하세요.');
      td.colSpan = 1; td.rowSpan = 1;
      for (let y = 0; y < p.rs; y++) {
        const tr = tbl.rows[p.r + y];
        for (let x = 0; x < p.cs; x++) {
          if (y === 0 && x === 0) continue;
          const G2 = grid(tbl);
          insertCellAt(tr, p.r + y, p.c + x - 0.5, G2, newCell());
        }
      }
    },
    cellBg(td, anchor) {
      swatchPop(anchor, ['#ffffff', '#f2f2f2', '#d9d9d9', '#fde9d9', '#fff2cc', '#e2efda', '#ddebf7', '#e4dfec', '#fbe5d6', '#f8cbad', '#c6e0b4', '#bdd7ee', '#ffe699', '#f4b183', '#9bc2e6', '#a9d08e'],
        (c) => { selectedCells(td).forEach((x) => { x.style.backgroundColor = c && c !== '#ffffff' ? c : ''; }); markDirty(); }, { none: true });
    },
    border(td) { const tbl = td.closest('table'); tbl.classList.toggle('noborder'); tbl.querySelectorAll('td').forEach((x) => { x.style.borderStyle = ''; x.style.borderColor = ''; }); },
    delTable(td) {
      const tbl = td.closest('table'); const p = document.createElement('p'); p.innerHTML = '<br>';
      tbl.replaceWith(p); placeCaret(p); $('tableBar').hidden = true;
    },
  };
  function mergeContent(a, b) {
    const hasText = (x) => x.textContent.trim() || x.querySelector('img');
    if (hasText(b)) { if (!hasText(a)) a.innerHTML = ''; while (b.firstChild) a.appendChild(b.firstChild); }
  }
  function selectedCells(td) {
    const s = getSelection(); if (!s.rangeCount) return [td];
    const tbl = td.closest('table'); const r = s.getRangeAt(0);
    const cells = Array.from(tbl.querySelectorAll('td, th')).filter((c) => r.intersectsNode(c) && c.closest('table') === tbl);
    return cells.length ? cells : [td];
  }
  function addRow(td, below) {
    const tbl = td.closest('table'); const G = grid(tbl); const p = G.pos.get(td);
    const at = below ? p.r + p.rs : p.r;
    const tr = document.createElement('tr');
    const ref = tbl.rows[at] || null;
    const done = new Set();
    for (let c = 0; c < G.cols; c++) {
      const cell = at < G.rows ? G.g[at][c] : null; const above = at > 0 ? G.g[at - 1][c] : null;
      if (cell && above && cell === above) { if (!done.has(cell)) { cell.rowSpan = (cell.rowSpan || 1) + 1; done.add(cell); } continue; }
      const n = newCell(); tr.appendChild(n);
    }
    (ref ? ref.parentElement : tbl.tBodies[0] || tbl).insertBefore(tr, ref);
    if (tr.cells[0]) placeCaret(tr.cells[0]);
  }
  function addCol(td, right) {
    const tbl = td.closest('table'); const G = grid(tbl); const p = G.pos.get(td);
    const at = right ? p.c + p.cs : p.c;
    const done = new Set();
    for (let r = 0; r < G.rows; r++) {
      const cell = at < G.cols ? G.g[r][at] : null; const left = at > 0 ? G.g[r][at - 1] : null;
      if (cell && left && cell === left) { if (!done.has(cell)) { cell.colSpan = (cell.colSpan || 1) + 1; done.add(cell); } continue; }
      const n = newCell();
      const tr = tbl.rows[r];
      const after = Array.from(tr.cells).find((x) => G.pos.get(x).c >= at);
      tr.insertBefore(n, after || null);
    }
    const cg = tbl.querySelector('colgroup');
    if (cg) {
      const col = document.createElement('col'); cg.insertBefore(col, cg.children[at] || null);
      // 열 너비 다시 나누기
      const total = parseFloat(tbl.style.width) || tbl.offsetWidth; const n = cg.children.length;
      Array.from(cg.children).forEach((c) => { c.style.width = (total / n).toFixed(0) + 'px'; });
    }
  }
  document.querySelectorAll('#tableBar [data-t]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      const el = caretEl(); const td = el && el.closest('td, th');
      if (!td) return toast('표 안에 커서를 두세요.');
      tableOps[b.dataset.t](td, e.currentTarget);
      if (b.dataset.t !== 'cellBg') { syncColgroup(td.closest('table') || ed); markDirty(); }
    });
  });

  /* ---------- 그림 ---------- */
  $('btnImage').addEventListener('mousedown', (e) => e.preventDefault());
  $('btnImage').addEventListener('click', () => $('imgInput').click());
  $('imgInput').addEventListener('change', async (e) => { for (const f of e.target.files) await insertImageFile(f); e.target.value = ''; });
  function fileToDataUrl(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
  async function insertImageFile(f) {
    const src = await fileToDataUrl(f);
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    if (!img) return toast('그림 파일을 읽을 수 없습니다: ' + f.name, { err: true });
    const maxW = (state.page.w - state.page.ml - state.page.mr) * MMPX - 4;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxW) { h = Math.round(h * maxW / w); w = Math.round(maxW); }
    exec('insertHTML', `<img src="${src}" width="${w}" height="${h}" alt="">`);
  }
  function selectImage(img) {
    ed.querySelectorAll('img.img-sel').forEach((x) => x.classList.remove('img-sel'));
    state.selImg = img;
    if (img) { img.classList.add('img-sel'); $('imgW').value = Math.round(img.width); }
    $('imageBar').hidden = !img;
  }
  ed.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') { selectImage(e.target); const r = document.createRange(); r.selectNode(e.target); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    else selectImage(null);
  });
  function resizeImg(w) {
    const img = state.selImg; if (!img) return;
    const ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width);
    w = Math.max(10, Math.round(w)); img.width = w; img.height = Math.round(w * ratio);
    $('imgW').value = w; markDirty();
  }
  $('imgW').addEventListener('change', (e) => resizeImg(+e.target.value));
  document.querySelectorAll('#imageBar [data-i]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const img = state.selImg; if (!img) return;
      const textW = (state.page.w - state.page.ml - state.page.mr) * MMPX - 4;
      const k = b.dataset.i;
      if (k === '25' || k === '50') resizeImg(textW * (+k) / 100);
      else if (k === '100') resizeImg(textW);
      else if (k === 'orig') resizeImg(Math.min(img.naturalWidth, textW));
      else if (k === 'del') { img.remove(); selectImage(null); markDirty(); }
      else { const blk = blockOf(img); if (blk) { blk.style.textAlign = k; markDirty(); } }
    });
  });

  /* ---------- 상황 막대 ---------- */
  function updateContext() {
    const el = caretEl();
    const inTable = !!(el && el.closest('td, th'));
    $('tableBar').hidden = !inTable;
    ed.querySelectorAll('td.cell-sel').forEach((x) => x.classList.remove('cell-sel'));
    if (inTable) el.closest('td, th').classList.add('cell-sel');
    if (state.selImg && !ed.contains(state.selImg)) selectImage(null);
  }

  /* ---------- 입력 처리 ---------- */
  ed.addEventListener('input', () => { fixFontSizes(); markDirty(); });
  ed.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const el = caretEl(); const td = el && el.closest('td, th');
      e.preventDefault();
      if (td) {
        const cells = Array.from(td.closest('table').querySelectorAll('td, th')).filter((c) => c.closest('table') === td.closest('table'));
        const i = cells.indexOf(td);
        const next = cells[i + (e.shiftKey ? -1 : 1)];
        if (next) placeCaret(next); else if (!e.shiftKey) { addRow(td, true); markDirty(); }
      } else if (!e.shiftKey) {
        document.execCommand('insertHTML', false, '<span class="tab">\t</span>&#8203;');
      }
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); insertPageBreak(); return; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && state.selImg) { e.preventDefault(); state.selImg.remove(); selectImage(null); markDirty(); return; }
    // 빈 문단에서 Backspace 시 앞의 쪽 나누기 지우기
    if (e.key === 'Backspace') {
      const s = getSelection(); const blk = blockOf(caretEl());
      if (s.isCollapsed && blk && blk.previousElementSibling && blk.previousElementSibling.classList.contains('pagebreak')) {
        const r = s.getRangeAt(0); const pre = document.createRange(); pre.selectNodeContents(blk); pre.setEnd(r.startContainer, r.startOffset);
        if (!pre.toString()) { e.preventDefault(); blk.previousElementSibling.remove(); markDirty(); }
      }
    }
  });
  ed.addEventListener('paste', async (e) => {
    const cd = e.clipboardData; if (!cd) return;
    const files = Array.from(cd.files || []).filter((f) => f.type.startsWith('image/'));
    const html = cd.getData('text/html');
    if (files.length && !html) { e.preventDefault(); for (const f of files) await insertImageFile(f); return; }
    if (html) {
      e.preventDefault();
      const frag = sanitize(html.replace(/<!--StartFragment-->|<!--EndFragment-->/g, ''), false);
      const div = document.createElement('div'); div.appendChild(frag);
      div.querySelectorAll('img').forEach((im) => { if (/^file:/i.test(im.src)) im.remove(); });
      document.execCommand('insertHTML', false, div.innerHTML);
      normalize(ed); markDirty();
      return;
    }
    const text = cd.getData('text/plain');
    if (text) {
      e.preventDefault();
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      if (lines.length === 1) document.execCommand('insertText', false, text);
      else document.execCommand('insertHTML', false, lines.map((l) => `<p>${esc(l).replace(/\t/g, '<span class="tab">\t</span>') || '<br>'}</p>`).join(''));
      markDirty();
    }
  });

  /* ---------- 찾기·바꾸기 ---------- */
  let finds = [], findIdx = -1;
  function collectMatches(q) {
    finds = []; if (!q) return;
    const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const t = n.nodeValue; let i = t.indexOf(q);
      while (i >= 0) { finds.push({ node: n, i }); i = t.indexOf(q, i + q.length); }
    }
  }
  function showMatch(dir) {
    const q = $('findText').value;
    collectMatches(q);
    if (!finds.length) { $('findCount').textContent = q ? '없음' : ''; return; }
    findIdx = (findIdx + dir + finds.length) % finds.length;
    const m = finds[findIdx];
    const r = document.createRange(); r.setStart(m.node, m.i); r.setEnd(m.node, m.i + q.length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); state.savedRange = r.cloneRange();
    const rect = r.getBoundingClientRect(); const ws = $('workspace'); const wr = ws.getBoundingClientRect();
    if (rect.top < wr.top + 60 || rect.bottom > wr.bottom - 40) ws.scrollTop += rect.top - wr.top - wr.height / 3;
    $('findCount').textContent = `${findIdx + 1} / ${finds.length}`;
  }
  function openFind(replace) {
    $('findBar').hidden = false;
    const s = getSelection(); const sel = s.rangeCount && inEditor(s.anchorNode) ? s.toString() : '';
    if (sel && sel.length < 80) $('findText').value = sel;
    (replace && $('findText').value ? $('replText') : $('findText')).focus();
    $('findText').select();
  }
  $('btnFind').addEventListener('click', () => openFind(false));
  $('findText').addEventListener('input', () => { findIdx = -1; showMatch(1); });
  $('findText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); showMatch(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') $('findBar').hidden = true; });
  $('findNext').addEventListener('click', () => showMatch(1));
  $('findPrev').addEventListener('click', () => showMatch(-1));
  $('findClose').addEventListener('click', () => { $('findBar').hidden = true; });
  $('replOne').addEventListener('click', () => {
    const q = $('findText').value; if (!q) return;
    const s = getSelection();
    if (s.rangeCount && s.toString() === q && inEditor(s.anchorNode)) { document.execCommand('insertText', false, $('replText').value); markDirty(); findIdx--; }
    showMatch(1);
  });
  $('replAll').addEventListener('click', () => {
    const q = $('findText').value; if (!q) return;
    collectMatches(q);
    const n = finds.length; const rep = $('replText').value;
    // 뒤에서부터 바꿔야 위치가 어긋나지 않음
    for (let k = finds.length - 1; k >= 0; k--) { const m = finds[k]; m.node.nodeValue = m.node.nodeValue.slice(0, m.i) + rep + m.node.nodeValue.slice(m.i + q.length); }
    finds = []; $('findCount').textContent = n ? `${n}곳 바꿈` : '없음';
    if (n) markDirty();
  });

  /* ---------- 편집 용지 ---------- */
  $('btnPage').addEventListener('click', async () => {
    const p = state.page;
    const f = document.createElement('div'); f.className = 'form-grid';
    const paperOpts = Object.keys(PAPERS).map((k) => `<option value="${k}">${k} (${PAPERS[k][0]}×${PAPERS[k][1]}mm)</option>`).join('') + '<option value="사용자">사용자 정의</option>';
    f.innerHTML = `
      <label class="field full">용지 종류<select id="pgPaper">${paperOpts}</select></label>
      <label class="field">폭(mm)<input id="pgW" type="number" step="0.1" min="50" max="1000"></label>
      <label class="field">길이(mm)<input id="pgH" type="number" step="0.1" min="50" max="1500"></label>
      <div class="field full">용지 방향<div class="seg"><label><input type="radio" name="pgO" value="p"><span>세로</span></label><label><input type="radio" name="pgO" value="l"><span>가로</span></label></div></div>
      <label class="field">위쪽(mm)<input id="pgMt" type="number" step="0.5" min="0"></label>
      <label class="field">아래쪽(mm)<input id="pgMb" type="number" step="0.5" min="0"></label>
      <label class="field">왼쪽(mm)<input id="pgMl" type="number" step="0.5" min="0"></label>
      <label class="field">오른쪽(mm)<input id="pgMr" type="number" step="0.5" min="0"></label>
      <label class="field">머리말(mm)<input id="pgHd" type="number" step="0.5" min="0"></label>
      <label class="field">꼬리말(mm)<input id="pgFt" type="number" step="0.5" min="0"></label>`;
    const q = (id) => f.querySelector('#' + id);
    const shown = { w: p.landscape ? Math.max(p.w, p.h) : Math.min(p.w, p.h), h: p.landscape ? Math.min(p.w, p.h) : Math.max(p.w, p.h) };
    q('pgPaper').value = PAPERS[p.paper] ? p.paper : '사용자';
    q('pgW').value = +Math.min(p.w, p.h).toFixed(1); q('pgH').value = +Math.max(p.w, p.h).toFixed(1);
    f.querySelector(`input[name=pgO][value=${p.landscape ? 'l' : 'p'}]`).checked = true;
    [['pgMt', 'mt'], ['pgMb', 'mb'], ['pgMl', 'ml'], ['pgMr', 'mr'], ['pgHd', 'hd'], ['pgFt', 'ft']].forEach(([id, k]) => { q(id).value = +p[k].toFixed(1); });
    q('pgPaper').addEventListener('change', () => { const v = PAPERS[q('pgPaper').value]; if (v) { q('pgW').value = v[0]; q('pgH').value = v[1]; } });
    void shown;
    const ok = await modal('편집 용지', f, [{ label: '취소', value: false }, { label: '적용', value: true, primary: true }]);
    if (!ok) return;
    const w = +q('pgW').value || 210, h = +q('pgH').value || 297; const land = f.querySelector('input[name=pgO]:checked').value === 'l';
    Object.assign(state.page, { paper: q('pgPaper').value, landscape: land, w: land ? Math.max(w, h) : Math.min(w, h), h: land ? Math.min(w, h) : Math.max(w, h),
      mt: +q('pgMt').value, mb: +q('pgMb').value, ml: +q('pgMl').value, mr: +q('pgMr').value, hd: +q('pgHd').value, ft: +q('pgFt').value });
    applyPage(); markDirty();
  });
  function paperName(w, h) {
    const a = Math.min(w, h), b = Math.max(w, h);
    for (const k in PAPERS) if (Math.abs(PAPERS[k][0] - a) < 1.5 && Math.abs(PAPERS[k][1] - b) < 1.5) return k;
    return '사용자';
  }

  /* ---------- 열기 ---------- */
  $('btnOpen').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
  async function confirmDiscard() {
    if (!state.dirty) return true;
    const v = await modal('저장하지 않은 변경 사항이 있습니다', '지금 문서를 저장하지 않고 닫으면 고친 내용이 사라집니다.', [
      { label: '취소', value: null }, { label: '저장하지 않고 계속', value: 'go', danger: true }, { label: 'HWPX로 저장 후 계속', value: 'save', primary: true }]);
    if (v === 'save') { await saveHwpx(); return true; }
    return v === 'go';
  }
  async function openFile(file) {
    if (!(await confirmDiscard())) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const name = file.name.replace(/\.[^.]+$/, '');
    busy('문서를 여는 중…');
    try {
      const buf = await file.arrayBuffer();
      state.source = { name: file.name, ext, bytes: new Uint8Array(buf) };
      let res;
      if (ext === 'hwp') {
        res = HWPReader.read(buf);
        setFormat('HWP', '빠른 변환으로 열었습니다');
        $('stPrecise').hidden = false;
      } else if (ext === 'hwpx') {
        res = await HWPXReader.read(buf); setFormat('HWPX', ''); $('stPrecise').hidden = true;
      } else if (ext === 'docx') {
        busy('Word 문서 변환 준비 중…');
        await Loader.need('mammoth');
        const r = await mammoth.convertToHtml({ arrayBuffer: buf });
        res = { html: r.value }; setFormat('DOCX', 'Word 문서는 글꼴·색 일부가 빠질 수 있습니다'); $('stPrecise').hidden = true;
      } else if (ext === 'html' || ext === 'htm') {
        const t = decodeText(buf); const d = new DOMParser().parseFromString(t, 'text/html');
        res = { html: d.body ? d.body.innerHTML : t }; setFormat('HTML', ''); $('stPrecise').hidden = true;
      } else if (ext === 'md' || ext === 'markdown') {
        res = { html: mdToHtml(decodeText(buf)) }; setFormat('Markdown', ''); $('stPrecise').hidden = true;
      } else if (ext === 'txt') {
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        res = { html: decodeText(buf).replace(/\r\n?/g, '\n').split('\n').map((l) => `<p>${esc(l).replace(/\t/g, '<span class="tab">\t</span>') || '<br>'}</p>`).join('') };
        setFormat('TXT', ''); $('stPrecise').hidden = true;
      } else throw new Error('지원하지 않는 파일 형식입니다 (.' + ext + '). HWP, HWPX, DOCX, HTML, TXT, MD 파일을 열 수 있습니다.');
      if (res.page) {
        const pg = res.page;
        if (pg.w > 20 && pg.h > 20) {
          const w = Math.min(pg.w, pg.h), h = Math.max(pg.w, pg.h);
          Object.assign(state.page, { paper: paperName(w, h), landscape: !!pg.landscape, w: pg.landscape ? h : w, h: pg.landscape ? w : h,
            mt: pg.mt, mb: pg.mb, ml: pg.ml, mr: pg.mr, hd: pg.hd, ft: pg.ft });
        }
      } else Object.assign(state.page, DEFAULT_PAGE);
      $('docName').value = name;
      applyPage();
      setContent(res.html);
      clearDraft();
      $('stSaved').textContent = '';
      toast(`"${file.name}"을(를) 열었습니다.`);
    } catch (err) {
      console.error(err);
      if (ext === 'hwp' && !/암호|배포용|97/.test(err.message || '')) {
        toast('빠른 변환에 실패했습니다: ' + (err.message || err), { err: true, action: { label: '정밀 변환으로 열기', run: () => preciseOpen() } });
      } else toast(err.message || String(err), { err: true });
    } finally { busy(false); }
  }
  function decodeText(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
    if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('euc-kr').decode(u8); }
  }
  async function preciseOpen() {
    const src = state.source; if (!src || src.ext !== 'hwp') return;
    try {
      const out = await Engine.hwpToHwpx(src.bytes, busy);
      busy('문서 표시 중…');
      const res = await HWPXReader.read(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
      if (res.page) { const pg = res.page; const w = Math.min(pg.w, pg.h), h = Math.max(pg.w, pg.h); Object.assign(state.page, { paper: paperName(w, h), landscape: !!pg.landscape, w: pg.landscape ? h : w, h: pg.landscape ? w : h, mt: pg.mt, mb: pg.mb, ml: pg.ml, mr: pg.mr, hd: pg.hd, ft: pg.ft }); applyPage(); }
      setContent(res.html);
      setFormat('HWP', '정밀 변환으로 열었습니다'); $('stPrecise').hidden = true;
      toast('정밀 변환으로 다시 열었습니다.');
    } catch (err) {
      console.error(err);
      toast('정밀 변환 엔진을 쓸 수 없습니다: ' + (err.message || err) + ' — 인터넷 연결을 확인하세요.', { err: true });
    } finally { busy(false); }
  }
  $('stPrecise').addEventListener('click', async () => {
    if (state.dirty) {
      const ok = await modal('정밀 변환으로 다시 열까요?', '지금까지 고친 내용은 사라지고 원본 HWP 파일을 다시 읽습니다. 처음 한 번은 변환 엔진(약 15MB)을 내려받습니다.', [{ label: '취소', value: false }, { label: '다시 열기', value: true, primary: true }]);
      if (!ok) return;
    }
    preciseOpen();
  });

  function mdToHtml(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => esc(s).replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/`([^`]+)`/g, '<span style="font-family:monospace">$1</span>').replace(/\\([*_`\[\]\\|#])/g, '$1');
    const lines = md.replace(/\r\n?/g, '\n').split('\n'); let out = ''; let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const rows = []; rows.push(l); i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
        out += '<table class="hwp-table">' + rows.map((r, ri) => '<tr>' + r.trim().replace(/^\||\|$/g, '').split('|').map((c) => `<td>${ri === 0 ? '<b>' + inline(c.trim()) + '</b>' : inline(c.trim()) || '<br>'}</td>`).join('') + '</tr>').join('') + '</table>';
        continue;
      }
      let m;
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { const n = Math.min(3, m[1].length); out += `<h${n}>${inline(m[2])}</h${n}>`; i++; continue; }
      if (/^\s*[-*+]\s+/.test(l)) { out += '<ul>'; while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*[-*+]\s+/, ''))}</li>`; out += '</ul>'; continue; }
      if (/^\s*\d+[.)]\s+/.test(l)) { out += '<ol>'; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))}</li>`; out += '</ol>'; continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { out += '<p>' + '─'.repeat(40) + '</p>'; i++; continue; }
      if (/^>\s?/.test(l)) { out += `<blockquote><p>${inline(l.replace(/^>\s?/, ''))}</p></blockquote>`; i++; continue; }
      if (!l.trim()) { i++; continue; }
      let para = l; i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|>|\s*\|)/.test(lines[i])) para += (/ {2}$/.test(para) ? '<br>' : ' ') + lines[i++];
      out += `<p>${inline(para).replace(/&lt;br&gt;/g, '<br>')}</p>`;
    }
    return out;
  }

  /* ---------- 저장 ---------- */
  async function withPlainZoom(fn) {
    const z = $('zoomWrap').style.zoom; $('zoomWrap').style.zoom = 1;
    ed.querySelectorAll('td.cell-sel').forEach((x) => x.classList.remove('cell-sel'));
    const sel = state.selImg; if (sel) sel.classList.remove('img-sel');
    try { return await fn(); } finally { $('zoomWrap').style.zoom = z; if (sel) sel.classList.add('img-sel'); updateContext(); }
  }
  const meta = () => ({ title: $('docName').value.trim(), author: '' });
  async function buildHwpx() {
    return withPlainZoom(async () => {
      const blocks = DocModel.extract(ed);
      return HWPXWriter.build(blocks, state.page, meta());
    });
  }
  async function saveHwpx() {
    busy('HWPX 파일 만드는 중…');
    try {
      const data = await buildHwpx();
      download(data, baseName() + '.hwpx', 'application/hwp+zip');
      afterSave('HWPX');
    } catch (err) { console.error(err); toast('HWPX 저장에 실패했습니다: ' + (err.message || err), { err: true }); }
    finally { busy(false); }
  }
  async function saveHwp() {
    try {
      busy('HWPX 문서 준비 중…');
      const hwpx = await buildHwpx();
      const hwp = await Engine.hwpxToHwp(hwpx, busy);
      download(hwp, baseName() + '.hwp', 'application/x-hwp');
      afterSave('HWP');
    } catch (err) {
      console.error(err);
      toast('HWP 저장에 실패했습니다: ' + (err.message || err) + ' — HWPX로 저장하면 한글에서 그대로 열 수 있습니다.', { err: true, action: { label: 'HWPX로 저장', run: saveHwpx } });
    } finally { busy(false); }
  }
  function afterSave(kind) {
    setDirty(false); clearDraft();
    const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    $('stSaved').textContent = `${t} ${kind}로 저장함`;
    toast(`${baseName()}.${kind.toLowerCase()} 파일을 저장했습니다.`);
  }
  async function exportAs(kind) {
    try {
      if (kind === 'hwp') return saveHwp();
      if (kind === 'hwpx') return saveHwpx();
      if (kind === 'print') { window.print(); return; }
      busy(({ docx: 'Word 문서', pdf: 'PDF', png: '그림', html: '웹페이지', md: '마크다운', txt: '텍스트' })[kind] + ' 만드는 중…');
      await withPlainZoom(async () => {
        if (kind === 'docx') download(await DOCXWriter.build(DocModel.extract(ed), state.page, meta()), baseName() + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        else if (kind === 'pdf') download(await PageRender.pdf(ed, state.page), baseName() + '.pdf', 'application/pdf');
        else if (kind === 'png') { const r = await PageRender.png(ed, state.page); if (r.single) download(r.single, baseName() + '.png', 'image/png'); else download(r.zip, baseName() + '_쪽별그림.zip', 'application/zip'); }
        else if (kind === 'html') download(standaloneHtml(ed, state.page, $('docName').value), baseName() + '.html', 'text/html;charset=utf-8');
        else if (kind === 'md') download(TextExport.md(DocModel.extract(ed)), baseName() + '.md', 'text/markdown;charset=utf-8');
        else if (kind === 'txt') download('﻿' + TextExport.txt(DocModel.extract(ed)), baseName() + '.txt', 'text/plain;charset=utf-8');
      });
      toast(`${baseName()}.${kind === 'png' ? 'png' : kind} 파일을 저장했습니다.`);
    } catch (err) { console.error(err); toast('내보내기에 실패했습니다: ' + (err.message || err), { err: true }); }
    finally { busy(false); }
  }
  $('btnSave').addEventListener('click', saveHwpx);
  $('btnExport').addEventListener('click', (e) => openPop(e.currentTarget, (p) => {
    p.setAttribute('role', 'menu');
    const items = [
      ['head', '한글'],
      ['hwpx', 'HWPX 문서', '한글 2014 이상 · 권장', '.hwpx'],
      ['hwp', 'HWP 문서', '변환 엔진 사용 · 처음 한 번 내려받기', '.hwp'],
      ['sep'], ['head', '다른 프로그램'],
      ['docx', 'Word 문서', 'MS Word · 한글 · 구글 문서', '.docx'],
      ['pdf', 'PDF', '쪽 모양 그대로 · 보내기용', '.pdf'],
      ['html', '웹페이지', '', '.html'],
      ['md', '마크다운', '노션·깃허브', '.md'],
      ['txt', '텍스트', '글자만', '.txt'],
      ['png', '그림', '쪽마다 한 장', '.png'],
      ['sep'],
      ['print', '인쇄', '인쇄 창에서 PDF로 저장도 가능 (글자 선택되는 PDF)', 'Ctrl+P'],
    ];
    for (const it of items) {
      if (it[0] === 'sep') { const s = document.createElement('div'); s.className = 'menu-sep'; p.appendChild(s); continue; }
      if (it[0] === 'head') { const h = document.createElement('div'); h.className = 'menu-head'; h.textContent = it[1]; p.appendChild(h); continue; }
      const b = document.createElement('button'); b.className = 'menu-item'; b.setAttribute('role', 'menuitem');
      const tx = document.createElement('span'); tx.textContent = it[1];
      if (it[2]) { const sm = document.createElement('small'); sm.textContent = it[2]; tx.appendChild(sm); }
      const ex = document.createElement('span'); ex.className = 'ext'; ex.textContent = it[3];
      b.append(tx, ex);
      b.onclick = () => { closePop(); exportAs(it[0]); };
      p.appendChild(b);
    }
  }));

  /* ---------- 새 문서 ---------- */
  $('btnNew').addEventListener('click', async () => {
    if (!(await confirmDiscard())) return;
    Object.assign(state.page, DEFAULT_PAGE); applyPage();
    state.source = null; $('docName').value = '새 문서'; setFormat('새 문서', ''); $('stPrecise').hidden = true;
    setContent('<p><br></p>'); clearDraft(); $('stSaved').textContent = '';
    placeCaret(ed.firstElementChild);
  });
  $('docName').addEventListener('input', () => markDirty());

  /* ---------- 끌어다 놓기 ---------- */
  const ws = $('workspace');
  ws.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); ws.classList.add('drop'); } });
  ws.addEventListener('dragleave', (e) => { if (e.target === ws) ws.classList.remove('drop'); });
  ws.addEventListener('drop', async (e) => {
    ws.classList.remove('drop');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (!files.length) return;
    e.preventDefault();
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length === files.length) {
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (r && inEditor(r.startContainer)) state.savedRange = r;
      for (const f of imgs) await insertImageFile(f);
    } else openFile(files.find((f) => !f.type.startsWith('image/')));
  });

  /* ---------- 단축키 ---------- */
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveHwpx(); }
    else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('fileInput').click(); }
    else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(false); }
    else if (mod && e.key.toLowerCase() === 'h') { e.preventDefault(); openFind(true); }
    else if (mod && e.key === ']') { e.preventDefault(); stepSize(1); }
    else if (mod && e.key === '[') { e.preventDefault(); stepSize(-1); }
    else if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); $('btnNew').click(); }
  });
  window.addEventListener('beforeunload', (e) => { if (state.dirty) { autosave(); e.preventDefault(); e.returnValue = ''; } });

  /* ---------- 자동 보관(이 브라우저에만) ---------- */
  const DRAFT_KEY = 'hwp-editor-draft-v1';
  function autosave() {
    if (!state.dirty) return;
    try {
      const html = ed.innerHTML;
      if (html.length > 4.5e6) return; // 브라우저 저장 한도 보호
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ html, page: state.page, name: $('docName').value, fmt: state.fmt, t: Date.now() }));
      $('stSaved').textContent = '자동 보관됨';
    } catch (e) { /* 저장 공간 없음 등 — 무시 */ }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 무시 */ } }
  function checkDraft() {
    let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { d = null; }
    if (!d || !d.html) return;
    $('restoreName').textContent = '"' + (d.name || '문서') + '"';
    $('restoreTime').textContent = new Date(d.t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('restoreBanner').hidden = false;
    $('btnRestore').onclick = () => {
      Object.assign(state.page, d.page || DEFAULT_PAGE); applyPage();
      $('docName').value = d.name || '문서'; setFormat(d.fmt || '복원한 문서', '자동 보관본에서 복원');
      setContent(d.html, { keepDirty: true }); setDirty(true);
      $('restoreBanner').hidden = true;
    };
    $('btnDiscard').onclick = () => { clearDraft(); $('restoreBanner').hidden = true; };
  }

  /* ---------- 시작 ---------- */
  document.execCommand('defaultParagraphSeparator', false, 'p');
  applyPage();
  if (window.innerWidth < 900) { $('zoomSel').value = 'fit'; state.zoomMode = 'fit'; }
  setContent(SAMPLE_DOC);
  $('docName').value = '예시 문서 - 사용 안내';
  setFormat('예시', '처음 화면용 예시 문서입니다. 열기로 내 HWP 파일을 불러오세요.');
  if (state.zoomMode === 'fit') fitZoom();
  checkDraft();
  window.HwpEditor = { state, setContent, buildHwpx, extract: () => DocModel.extract(ed), exportAs, openFile, saveHwpx };
})();
