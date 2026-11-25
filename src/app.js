/* ===== 편집기 본체 (문서 모드 + 디자인 모드 연결) ===== */
(() => {
  const $ = (id) => document.getElementById(id);
  const ed = $('page');
  const appEl = $('app');
  const MMPX = 96 / 25.4;
  const PAPERS = { A4: [210, 297], A3: [297, 420], B5: [182, 257], B4: [257, 364], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
  const DEFAULT_PAGE = { paper: 'A4', w: 210, h: 297, landscape: false, mt: 20, mb: 15, ml: 30, mr: 30, hd: 15, ft: 15 };
  const FONTS = ['함초롬바탕', '함초롬돋움', '맑은 고딕', '바탕', '돋움', '굴림', '궁서', '나눔고딕', '나눔명조', 'Noto Sans KR', 'Noto Serif KR', 'HY헤드라인M', '휴먼명조', 'Black Han Sans', 'Do Hyeon', 'Jua', 'Gowun Dodum', 'Gowun Batang', 'Nanum Pen Script', 'Arial', 'Times New Roman'];
  const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 60, 72];
  const LHS = [100, 115, 130, 150, 160, 180, 200, 250, 300];
  const COLORS = ['#000000', '#434343', '#7f7f7f', '#bfbfbf', '#ffffff', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#1f4fbf', '#8e44ad', '#7b3f00', '#d35400', '#2c3e50'];
  const HILITES = ['#ffe14d', '#fff3a3', '#c7f0c2', '#b9e6f5', '#d9d2f5', '#ffd1dc', '#ffd8b0', '#e3e7ee'];
  const FILLS = ['#ffffff', '#f2f2f2', '#d9d9d9', '#fde9d9', '#fff2cc', '#e2efda', '#ddebf7', '#e4dfec', '#fbe5d6', '#f8cbad', '#c6e0b4', '#bdd7ee', '#ffe699', '#f4b183', '#9bc2e6', '#a9d08e'];
  const SPECIAL = '※○●◎□■△▲▽▼◇◆☆★→←↑↓↔⇒▶◀▷◁「」『』【】〈〉《》·…‘’“”㈜℃㎜㎝㎞㎡㎏㎖①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤ✓✔☎♥♣♠♦¶§±×÷≠≤≥∞₩'.split('');
  const PNUM_POS = { none: '넣지 않음', 'top-left': '위 왼쪽', 'top-center': '위 가운데', 'top-right': '위 오른쪽', 'bottom-left': '아래 왼쪽', 'bottom-center': '아래 가운데', 'bottom-right': '아래 오른쪽' };
  const PNUM_FMT = { n: '1', dash: '- 1 -', total: '1 / 전체', jjok: '1쪽' };

  const state = {
    page: Object.assign({}, DEFAULT_PAGE),
    hf: null,          // {header:{text,align}, footer:{text,align}, pnum:{pos,fmt}}
    source: null,      // {name, ext, bytes} 원본
    fmt: '새 문서', dirty: false, zoom: 1, savedRange: null, pendingSize: null,
    textColor: '#c0392b', hilite: '#ffe14d', selObj: null, painter: null, mode: 'doc',
  };

  /* ---------- 공통 UI ---------- */
  let toastTimer;
  function toast(msg, opts = {}) {
    if (typeof opts === 'boolean') opts = { err: opts };
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div'); t.className = 'toast' + (opts.err ? ' err' : '');
    t.setAttribute('role', 'status');
    const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
    if (opts.action) { const b = document.createElement('button'); b.textContent = opts.action.label; b.onclick = () => { t.remove(); opts.action.run(); }; t.appendChild(b); }
    (document.fullscreenElement || document.body).appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), opts.ms || (opts.err ? 7000 : 3200));
  }
  let busyEl = null;
  function busy(msg) {
    if (msg === false) { if (busyEl) busyEl.remove(); busyEl = null; return; }
    if (!busyEl) { busyEl = document.createElement('div'); busyEl.className = 'busy'; busyEl.innerHTML = '<div class="busy-box"><div class="spinner"></div><span></span></div>'; document.body.appendChild(busyEl); }
    busyEl.querySelector('span').textContent = msg;
  }
  function modal(title, bodyEl, buttons, opts = {}) {
    return new Promise((resolve) => {
      const back = document.createElement('div'); back.className = 'modal-back';
      const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      if (opts.wide) m.style.width = `min(${opts.w || 560}px, 100%)`;
      const h = document.createElement('h2'); h.textContent = title; m.appendChild(h);
      if (typeof bodyEl === 'string') { const p = document.createElement('p'); p.textContent = bodyEl; m.appendChild(p); } else if (bodyEl) m.appendChild(bodyEl);
      const act = document.createElement('div'); act.className = 'actions';
      const done = (v) => { back.remove(); resolve(v); };
      buttons.forEach((b) => {
        const el = document.createElement('button'); el.className = 'btn' + (b.primary ? ' primary' : ''); el.textContent = b.label;
        if (b.danger) el.style.color = 'var(--danger)';
        el.onclick = () => done(b.value);
        act.appendChild(el);
      });
      if (buttons.length) m.appendChild(act);
      back.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { const p = buttons.find((b) => b.primary); if (p) { e.preventDefault(); done(p.value); } }
      });
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(null); });
      m._done = done;
      (document.fullscreenElement || document.body).appendChild(back);
      back.appendChild(m);
      const f = m.querySelector('input:not([type=hidden]), select, textarea, .choice button') || act.querySelector('.primary') || act.querySelector('button');
      if (f) f.focus();
    });
  }
  // 고르기 대화상자: [{value,title,desc}]
  function choice(title, items, intro) {
    const box = document.createElement('div'); box.style.display = 'grid'; box.style.gap = '10px';
    if (intro) { const p = document.createElement('p'); p.textContent = intro; box.appendChild(p); }
    const c = document.createElement('div'); c.className = 'choice'; box.appendChild(c);
    const pr = modal(title, box, [{ label: '취소', value: null }]);
    items.forEach((it) => {
      const b = document.createElement('button'); b.type = 'button';
      const t = document.createElement('b'); t.textContent = it.title; b.appendChild(t);
      if (it.desc) { const d = document.createElement('span'); d.textContent = it.desc; b.appendChild(d); }
      b.onclick = () => box.closest('.modal')._done(it.value);
      c.appendChild(b);
    });
    setTimeout(() => { const f = c.querySelector('button'); if (f) f.focus(); }, 0);
    return pr;
  }
  const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function openPop(anchor, build) {
    closePop();
    const p = document.createElement('div'); p.className = 'pop'; build(p);
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - p.offsetWidth - 8);
    let top = r.bottom + 6;
    if (top + p.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - p.offsetHeight - 6);
    p.style.left = Math.max(8, left) + 'px'; p.style.top = top + 'px';
    popEl = p;
    const first = p.querySelector('button, input'); if (first && anchor.id !== 'btnTable') first.focus({ preventScroll: true });
    return p;
  }
  document.addEventListener('mousedown', (e) => { if (popEl && !popEl.contains(e.target) && !e.target.closest('[aria-haspopup], .tb, .ctxbar .btn, .dbar .btn')) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  function menu(anchor, items) {
    openPop(anchor, (p) => {
      p.setAttribute('role', 'menu');
      items.forEach((it) => {
        if (it === '-') { const s = document.createElement('div'); s.className = 'menu-sep'; p.appendChild(s); return; }
        const b = document.createElement('button'); b.className = 'menu-item'; b.setAttribute('role', 'menuitem');
        const t = document.createElement('span'); t.textContent = it[0];
        if (it[2]) { const sm = document.createElement('small'); sm.textContent = it[2]; t.appendChild(sm); }
        b.appendChild(t);
        b.onmousedown = (e) => e.preventDefault();
        b.onclick = () => { closePop(); it[1](); };
        p.appendChild(b);
      });
    });
  }
  // 디자인 모드에서 쓰는 공용 UI
  window.HwpUI = {
    menu,
    async askSize(w, h) {
      const f = document.createElement('div'); f.className = 'form-grid';
      f.innerHTML = '<label class="field">너비(px)<input id="szW" type="number" min="100" max="8000"></label><label class="field">높이(px)<input id="szH" type="number" min="100" max="8000"></label><p class="field full">1cm ≈ 38px (96dpi). 쪽 안의 레이어는 비율에 맞춰 함께 바뀝니다.</p>';
      f.querySelector('#szW').value = w; f.querySelector('#szH').value = h;
      const ok = await modal('쪽 크기 직접 정하기', f, [{ label: '취소', value: false }, { label: '바꾸기', value: true, primary: true }]);
      if (!ok) return null;
      const nw = Math.max(100, Math.min(8000, +f.querySelector('#szW').value || w)), nh = Math.max(100, Math.min(8000, +f.querySelector('#szH').value || h));
      return { w: Math.round(nw), h: Math.round(nh) };
    },
  };

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
    const s = getSelection();
    if (state.savedRange && inEditor(state.savedRange.startContainer)) {
      const host = state.savedRange.startContainer.nodeType === 1 ? state.savedRange.startContainer : state.savedRange.startContainer.parentElement;
      const tb = host && host.closest('.tbox');
      (tb || ed).focus({ preventScroll: true });
      s.removeAllRanges(); s.addRange(state.savedRange);
    } else {
      ed.focus({ preventScroll: true });
      if (!s.rangeCount || !inEditor(s.anchorNode)) { const r = document.createRange(); r.selectNodeContents(ed.lastElementChild || ed); r.collapse(false); s.removeAllRanges(); s.addRange(r); }
    }
  }
  function exec(cmd, val = null) {
    restoreSel();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, val);
    markDirty(); updateToolbar();
  }
  // 고른 글자에 CSS를 입힌다 (표식 글꼴로 범위를 잡은 뒤 span으로 바꿈)
  function styleSelection(css) {
    restoreSel();
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) { toast('먼저 글자를 고르세요.'); return false; }
    const MARK = 'hwpmark' + Date.now();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontName', false, MARK);
    const marks = [...ed.querySelectorAll(`font[face="${MARK}"]`), ...Array.from(ed.querySelectorAll('span[style]')).filter((n) => n.style.fontFamily.replace(/["']/g, '') === MARK)];
    let first = null, last = null;
    marks.forEach((f) => {
      const sp = document.createElement('span');
      if (f.tagName === 'SPAN') { sp.setAttribute('style', f.getAttribute('style')); sp.style.removeProperty('font-family'); }
      for (const k in css) { if (css[k] === null || css[k] === '') sp.style.removeProperty(k); else sp.style.setProperty(k, css[k]); }
      sp.append(...f.childNodes); f.replaceWith(sp);
      sp.querySelectorAll('span').forEach((inner) => { for (const k in css) inner.style.removeProperty(k); if (!inner.getAttribute('style')) inner.replaceWith(...inner.childNodes); });
      if (!first) first = sp; last = sp;
    });
    document.execCommand('styleWithCSS', false, true);
    if (first) { const r = document.createRange(); r.setStartBefore(first); r.setEndAfter(last); s.removeAllRanges(); s.addRange(r); state.savedRange = r.cloneRange(); }
    markDirty(); updateToolbar();
    return true;
  }

  /* ---------- 문서 내용 넣기(정리) ---------- */
  const ALLOWED_TAGS = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUP', 'SUB', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'IMG', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'FONT', 'BLOCKQUOTE', 'HR', 'PRE', 'CODE', 'A', 'CENTER', 'MARK', 'SMALL', 'BIG', 'CAPTION']);
  const ALLOWED_CSS = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'font-size', 'font-family', 'text-align', 'vertical-align', 'width', 'height', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'text-indent', 'line-height', 'border-style', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'letter-spacing', 'text-shadow', '-webkit-text-stroke', 'float'];
  const SVG_TAGS = new Set(['svg', 'line', 'path', 'rect', 'ellipse', 'circle', 'polygon', 'polyline', 'g', 'defs', 'marker']);
  const SVG_ATTRS = new Set(['width', 'height', 'viewBox', 'preserveAspectRatio', 'x1', 'y1', 'x2', 'y2', 'd', 'x', 'y', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'marker-end', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits', 'id']);
  const DATA_ATTRS = ['data-wrap', 'data-align', 'data-pos', 'data-kind', 'data-arrow', 'data-note'];
  const CLASSES = ['pagebreak', 'tab', 'textbox', 'eq', 'ph', 'hwp-table', 'noborder', 'pb-before', 'fobj', 'tbox', 'fn'];
  const safeCss = (txt) => String(txt || '').split(';').filter((d) => d.trim() && !/url\(|expression|javascript:|position\s*:|behavior/i.test(d)).join(';');
  function sanitize(html, keepClasses) {
    const tpl = document.createElement('template'); tpl.innerHTML = html;
    const walk = (node) => {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 8) { ch.remove(); continue; }
        if (ch.nodeType !== 1) continue;
        const tag = ch.tagName;
        if (ch.namespaceURI === 'http://www.w3.org/2000/svg') {
          if (!SVG_TAGS.has(ch.localName)) { ch.remove(); continue; }
          for (const a of Array.from(ch.attributes)) if (!SVG_ATTRS.has(a.name) || /javascript:|url\((?!#)/i.test(a.value)) ch.removeAttribute(a.name);
          walk(ch); continue;
        }
        if (['SCRIPT', 'STYLE', 'META', 'LINK', 'IFRAME', 'OBJECT', 'EMBED', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM'].includes(tag)) { ch.remove(); continue; }
        if (!ALLOWED_TAGS.has(tag)) { walk(ch); ch.replaceWith(...ch.childNodes); continue; }
        const keep = {};
        if (tag === 'IMG') { const src = ch.getAttribute('src') || ''; if (/^(data:image\/|blob:|https?:)/i.test(src)) keep.src = src; else { ch.remove(); continue; } ['width', 'height', 'alt'].forEach((a) => { if (ch.hasAttribute(a)) keep[a] = ch.getAttribute(a); }); }
        if (tag === 'TD' || tag === 'TH') ['colspan', 'rowspan'].forEach((a) => { if (ch.hasAttribute(a)) keep[a] = ch.getAttribute(a); });
        if (tag === 'COL') ['span'].forEach((a) => { if (ch.hasAttribute(a)) keep[a] = ch.getAttribute(a); });
        if (tag === 'A') { const h = (ch.getAttribute('href') || '').trim(); if (/^(https?:|mailto:)/i.test(h)) keep.href = h; }
        if (tag === 'FONT') { if (ch.getAttribute('color')) ch.style.color = ch.getAttribute('color'); if (ch.getAttribute('face')) ch.style.fontFamily = ch.getAttribute('face'); }
        if (tag === 'OL' && ch.hasAttribute('start')) keep.start = ch.getAttribute('start');
        if (keepClasses) DATA_ATTRS.forEach((a) => { if (ch.hasAttribute(a)) keep[a] = ch.getAttribute(a); });
        const cls = keepClasses ? (ch.getAttribute('class') || '').split(/\s+/).filter((c) => CLASSES.includes(c)).join(' ') : '';
        const isObj = /\b(fobj|tbox)\b/.test(cls);
        let style;
        if (isObj) style = safeCss(ch.getAttribute('style'));
        else { const css = []; for (const prop of ALLOWED_CSS) { const v = ch.style.getPropertyValue(prop); if (v && !/expression|url\(/i.test(v)) css.push(prop + ':' + v); } style = css.join(';'); }
        for (const a of Array.from(ch.attributes)) ch.removeAttribute(a.name);
        for (const k in keep) ch.setAttribute(k, keep[k]);
        if (style) ch.setAttribute('style', style);
        if (cls) ch.setAttribute('class', cls);
        if (tag === 'A' && !keep.href) { walk(ch); ch.replaceWith(...ch.childNodes); continue; }
        if (tag === 'FONT') { const sp = document.createElement('span'); if (style) sp.setAttribute('style', style); walk(ch); sp.append(...ch.childNodes); ch.replaceWith(sp); continue; }
        walk(ch);
      }
    };
    walk(tpl.content);
    return tpl.content;
  }

  function normalize(root) {
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
    root.querySelectorAll('.fobj').forEach((f) => { f.contentEditable = 'false'; const host = f.parentElement; if (host && host.tagName === 'P') pToDiv(host); });
    root.querySelectorAll('.tbox').forEach((t) => { t.contentEditable = 'true'; if (!t.firstChild) t.innerHTML = '<p><br></p>'; });
    root.querySelectorAll('.fn').forEach((f) => { f.contentEditable = 'false'; f.textContent = ''; });
    let run = null;
    for (const ch of Array.from(root.childNodes)) {
      const inline = ch.nodeType === 3 ? ch.nodeValue.trim() !== '' : (ch.nodeType === 1 && !/^(P|DIV|H[1-6]|TABLE|UL|OL|BLOCKQUOTE|PRE|HR)$/.test(ch.tagName));
      if (ch.nodeType === 3 && !inline) { if (!run) ch.remove(); else run.appendChild(ch); continue; }
      if (inline) { if (!run) { run = document.createElement('p'); ch.before(run); } run.appendChild(ch); }
      else run = null;
    }
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
    root.querySelectorAll('td, th').forEach((td) => { if (!td.firstChild) td.innerHTML = '<p><br></p>'; });
    root.querySelectorAll('p, h1, h2, h3, li').forEach((p) => { if (!p.firstChild) p.innerHTML = '<br>'; });
    const last = root.lastElementChild;
    if (!last || last.tagName === 'TABLE' || last.classList.contains('pagebreak')) root.insertAdjacentHTML('beforeend', '<p><br></p>');
  }

  // <p> 안에는 블록(글상자 속 문단)을 둘 수 없어 HTML로 저장·복원할 때 깨진다 → 개체를 품는 문단은 <div>
  function pToDiv(p) {
    if (!p || p.tagName !== 'P') return p;
    const d = document.createElement('div');
    for (const a of Array.from(p.attributes)) d.setAttribute(a.name, a.value);
    while (p.firstChild) d.appendChild(p.firstChild);
    p.replaceWith(d); return d;
  }
  // 한글 파일에서 읽은 떠 있는 개체 위치(종이·쪽·문단 기준)를 화면의 문단 기준 좌표로 바꿈
  function anchorFloats() {
    const fs = Array.from(ed.querySelectorAll('.fobj[data-pos]')); if (!fs.length) return;
    const P = Pager.layout(ed, state.page);
    const W = state.page.w * MMPX, H = state.page.h * MMPX, ml = state.page.ml * MMPX;
    const cw = (state.page.w - state.page.ml - state.page.mr) * MMPX;
    fs.forEach((fo) => {
      const [vrel, hrel, valign, halign, vo, ho] = fo.dataset.pos.split(',');
      fo.removeAttribute('data-pos');
      const wrap = fo.dataset.wrap;
      if (wrap === 'square' || wrap === 'block') return;
      const anchor = fo.offsetParent && ed.contains(fo.offsetParent) ? fo.offsetParent : fo.parentElement;
      const ar = anchor.getBoundingClientRect();
      const ax = (ar.left - P.er.left) / P.z, ay = (ar.top - P.er.top) / P.z;
      const k = P.pageOf(ay); const paperAy = ay - P.starts[k] + P.top;
      const w = fo.offsetWidth, h = fo.offsetHeight;
      const baseX = hrel === 'PAPER' ? 0 : hrel === 'PARA' ? ax : ml, spanW = hrel === 'PAPER' ? W : hrel === 'PARA' ? ar.width / P.z : cw;
      const x = halign === 'CENTER' ? baseX + (spanW - w) / 2 + +ho : halign === 'RIGHT' ? baseX + spanW - w - +ho : baseX + +ho;
      let y;
      if (vrel === 'PARA') y = paperAy + +vo;
      else {
        const baseY = vrel === 'PAPER' ? 0 : P.top, spanH = vrel === 'PAPER' ? H : P.contentH;
        y = valign === 'CENTER' ? baseY + (spanH - h) / 2 + +vo : valign === 'BOTTOM' ? baseY + spanH - h - +vo : baseY + +vo;
      }
      fo.style.left = Math.round(x - ax) + 'px'; fo.style.top = Math.round(y - paperAy) + 'px';
    });
  }

  // 모든 표에 칸 너비(colgroup)를 고정 → 글을 쳐도 칸 너비가 멋대로 바뀌지 않음
  function fixTables() {
    ed.querySelectorAll('table').forEach((tbl) => {
      const cg = tbl.querySelector(':scope > colgroup'); const n = TableKit.read(tbl)[0].length;
      if (cg && cg.children.length === n && Array.from(cg.children).every((c) => parseFloat(c.style.width) > 0)) return;
      const E = TableKit.edit(tbl); if (!tbl.style.width && !cg) E.fit(textW()); E.commit();
    });
  }
  function setContent(html, opts = {}) {
    ed.innerHTML = '';
    ed.appendChild(sanitize(html, true));
    normalize(ed);
    selectObj(null);
    if (!opts.keepDirty) setDirty(false);
    layout(); fixTables(); anchorFloats(); layout(); updateStats(); renderFnList();
    ed.scrollTop = 0; $('workspace').scrollTop = 0;
  }

  /* ---------- 상태 표시 ---------- */
  function setDirty(v) { state.dirty = v; appEl.classList.toggle('dirty', v); }
  let statsTimer, autosaveTimer;
  function markDirty() {
    setDirty(true);
    clearTimeout(statsTimer); statsTimer = setTimeout(() => { layout(); updateStats(); renderFnList(); drawObjBox(); }, 250);
    clearTimeout(autosaveTimer); autosaveTimer = setTimeout(autosave, 1500);
  }
  function updateStats() {
    const t = ed.innerText || '';
    $('stChars').textContent = t.replace(/\n/g, '').length.toLocaleString('ko-KR');
    $('stCharsNs').textContent = t.replace(/\s/g, '').length.toLocaleString('ko-KR');
  }
  function setFormat(label, info) { state.fmt = label; $('fmtChip').textContent = label; $('stInfo').textContent = info || ''; }

  /* ---------- 용지·쪽 표시 ---------- */
  function applyPage() {
    const p = state.page;
    ed.style.width = p.w + 'mm';
    ed.style.padding = `${p.mt + p.hd}mm ${p.mr}mm ${p.mb + p.ft}mm ${p.ml}mm`;
    $('fnList').style.width = (p.w - p.ml - p.mr) + 'mm';
    $('pageStyle').textContent = `@page { size: ${p.w}mm ${p.h}mm; margin: 0; } @media print { .page { width: ${p.w}mm !important; } }`;
    $('stMargin').textContent = `여백 위 ${+p.mt.toFixed(1)} · 아래 ${+p.mb.toFixed(1)} · 왼 ${+p.ml.toFixed(1)} · 오른 ${+p.mr.toFixed(1)} mm`;
    $('pageLabel').textContent = (p.paper && p.paper !== '사용자' ? p.paper : `${Math.round(p.w)}×${Math.round(p.h)}`) + (p.landscape ? ' 가로' : '');
    layout();
  }
  function pnumText(n, N) { const f = state.hf && state.hf.pnum ? state.hf.pnum.fmt : 'n'; return ({ dash: `- ${n} -`, total: `${n} / ${N}`, jjok: `${n}쪽` })[f] || String(n); }
  function layout() {
    if (state.mode !== 'doc') return;
    const p = state.page;
    const R = Pager.paginate(ed, p);
    const pages = R.pages, D = R.D;
    // 쪽마다 떨어진 종이(한글처럼)
    const sh = $('sheets');
    sh.style.left = ed.offsetLeft + 'px'; sh.style.top = ed.offsetTop + 'px'; sh.style.width = ed.offsetWidth + 'px';
    while (sh.children.length < pages) { const d = document.createElement('div'); d.className = 'sheetpg'; d.appendChild(document.createElement('span')); sh.appendChild(d); }
    while (sh.children.length > pages) sh.lastElementChild.remove();
    Array.from(sh.children).forEach((d, k) => { d.style.top = (k * D.pitch) + 'px'; d.style.height = D.H + 'px'; d.firstChild.textContent = `${k + 1} / ${pages}`; });
    state.pages = pages;
    // 머리말·꼬리말·쪽 번호: 쪽마다
    const mk = $('markers'); mk.innerHTML = '';
    const hf = state.hf || {};
    const zone = (text, align, y) => {
      const z = document.createElement('div'); z.className = 'hfz'; z.textContent = text;
      z.style.left = (p.ml * MMPX + ed.offsetLeft) + 'px'; z.style.width = ((p.w - p.ml - p.mr) * MMPX) + 'px'; z.style.textAlign = align || 'center'; z.style.top = y + 'px';
      mk.appendChild(z);
    };
    if ((hf.header && hf.header.text) || (hf.footer && hf.footer.text) || (hf.pnum && hf.pnum.pos && hf.pnum.pos !== 'none')) {
      for (let k = 0; k < pages; k++) {
        const base = ed.offsetTop + k * D.pitch;
        const topY = base + p.mt * MMPX, botY = base + D.H - (p.mb + p.ft) * MMPX + 4;
        if (hf.header && hf.header.text) zone(hf.header.text, hf.header.align, topY);
        if (hf.footer && hf.footer.text) zone(hf.footer.text, hf.footer.align, botY);
        if (hf.pnum && hf.pnum.pos && hf.pnum.pos !== 'none') {
          const [v, a] = hf.pnum.pos.split('-');
          if (v === 'top') zone(pnumText(k + 1, pages), a, topY + (hf.header && hf.header.text ? 16 : 0));
          else zone(pnumText(k + 1, pages), a, botY + (hf.footer && hf.footer.text ? 16 : 0));
        }
      }
    }
    updatePageNo();
    if (state.blk) paintBlock();
    if (state.zoomMode === 'fit') fitZoom();
  }
  // 상태 막대: 커서가 있는 쪽 / 전체 쪽
  function updatePageNo() {
    const pages = state.pages || 1; let cur = 1;
    const s = getSelection();
    if (s.rangeCount && ed.contains(s.anchorNode)) {
      const r = s.getRangeAt(0); let rc = r.getBoundingClientRect();
      if (!rc.height) { const el = caretEl(); if (el) rc = el.getBoundingClientRect(); }
      const er = ed.getBoundingClientRect(); const z = ed.offsetWidth ? er.width / ed.offsetWidth : 1;
      if (rc && rc.height) cur = Pager.layout(ed, state.page).pageOf((rc.top - er.top) / z) + 1;
    }
    $('stPages').textContent = pages > 1 ? `${cur} / ${pages}` : '1';
  }
  function zoomRatio() { const s = $('sheet'); return s.offsetWidth ? s.getBoundingClientRect().width / s.offsetWidth : 1; }
  function setZoom(z) { state.zoom = z; $('zoomWrap').style.zoom = z; drawObjBox(); }
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
  window.addEventListener('resize', () => { if (state.mode === 'doc') { if (state.zoomMode === 'fit') fitZoom(); drawObjBox(); } });

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
    while (n && n !== ed) { if (n.nodeType === 1 && /^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName) && !n.classList.contains('pagebreak') && !n.classList.contains('textbox') && !n.classList.contains('tbox')) return n; n = n.parentElement; }
    return null;
  }
  function updateToolbar() {
    document.querySelectorAll('#ribbon .tb[data-cmd]').forEach((b) => {
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
      $('lhSel').value = LHS.reduce((a, b) => Math.abs(b - lh) < Math.abs(a - lh) ? b : a, 160);
      const tag = blk.tagName.toLowerCase();
      $('styleSel').value = ['h1', 'h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p';
    }
  }
  document.querySelectorAll('#ribbon .tb[data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => exec(b.dataset.cmd));
  });
  document.querySelectorAll('#ribbon .tb:not([data-cmd]), #ribbon .tb.wide').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
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
    ed.querySelectorAll('[style*="xxx-large"], font[size="7"]').forEach((el) => { el.removeAttribute('size'); el.style.fontSize = state.pendingSize + 'pt'; });
  }
  $('sizeSel').addEventListener('change', (e) => setFontSize(parseFloat(e.target.value)));
  const stepSize = (dir) => {
    const cur = parseFloat($('sizeSel').value) || 10;
    const next = dir > 0 ? SIZES.find((s) => s > cur) : [...SIZES].reverse().find((s) => s < cur);
    if (next) setFontSize(next);
  };
  $('sizeUp').addEventListener('click', () => stepSize(1));
  $('sizeDown').addEventListener('click', () => stepSize(-1));

  function selectedBlocks() {
    restoreSel();
    const s = getSelection(); if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    const all = Array.from(ed.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div:not(.pagebreak):not(.textbox):not(.tbox)'))
      .filter((b) => !b.querySelector('p, h1, h2, h3, h4, h5, h6, li, div:not(.pagebreak):not(.tbox)'));
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
  $('btnColor').addEventListener('click', (e) => swatchPop(e.currentTarget, COLORS, (c) => { state.textColor = c; $('colorSw').style.background = c; exec('foreColor', c); }, { value: state.textColor }));
  $('btnHilite').addEventListener('click', (e) => swatchPop(e.currentTarget, HILITES, (c) => {
    if (c) { state.hilite = c; $('hiliteSw').style.background = c; exec('hiliteColor', c); } else exec('hiliteColor', 'transparent');
  }, { value: state.hilite, none: true }));

  $('btnChars').addEventListener('click', (e) => openPop(e.currentTarget, (p) => {
    const g = document.createElement('div'); g.className = 'chars';
    SPECIAL.forEach((c) => { const b = document.createElement('button'); b.textContent = c; b.onmousedown = (ev) => ev.preventDefault(); b.onclick = () => exec('insertText', c); g.appendChild(b); });
    p.appendChild(g);
  }));
  $('btnDate').addEventListener('click', () => {
    const d = new Date();
    menu($('btnDate'), [
      [`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`, () => exec('insertText', `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`)],
      [`${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`, () => exec('insertText', `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`)],
      [d.toISOString().slice(0, 10), () => exec('insertText', d.toISOString().slice(0, 10))],
      [d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }), () => exec('insertText', d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }))],
    ]);
  });
  $('btnSpell').addEventListener('click', () => {
    ed.spellcheck = !ed.spellcheck; $('btnSpell').classList.toggle('on', ed.spellcheck);
    toast(ed.spellcheck ? '맞춤법 밑줄을 켰습니다 (브라우저 사전 기준).' : '맞춤법 밑줄을 껐습니다.');
  });

  function insertPageBreak() {
    restoreSel();
    const blk = blockOf(caretEl());
    const pb = document.createElement('div'); pb.className = 'pagebreak'; pb.contentEditable = 'false';
    const np = document.createElement('p'); np.innerHTML = '<br>';
    if (blk && blk.parentElement === ed) { blk.after(pb); pb.after(np); } else { ed.appendChild(pb); ed.appendChild(np); }
    const r = document.createRange(); r.setStart(np, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    markDirty();
  }
  $('btnPageBreak').addEventListener('click', insertPageBreak);

  /* ---------- 글자 모양·문단 모양·모양 복사 ---------- */
  async function charShapeDialog() {
    restoreSel();
    const el = caretEl() || ed; const cs = getComputedStyle(el);
    const f = document.createElement('div'); f.className = 'form-grid';
    const fontOpts = FONTS.map((x) => `<option value="${x}">${x}</option>`).join('');
    f.innerHTML = `
      <label class="field">글꼴<select id="csFont">${fontOpts}</select></label>
      <label class="field">크기(pt)<input id="csSize" type="number" min="4" max="300" step="0.5"></label>
      <label class="field">글자 색<input id="csColor" type="color"></label>
      <label class="field">자간(%)<input id="csLs" type="number" min="-50" max="100" step="1"></label>
      <div class="field full"><div class="checks">
        <label><input type="checkbox" id="csB">진하게</label><label><input type="checkbox" id="csI">기울임</label>
        <label><input type="checkbox" id="csU">밑줄</label><label><input type="checkbox" id="csS">취소선</label>
        <label><input type="checkbox" id="csSup">위 첨자</label><label><input type="checkbox" id="csSub">아래 첨자</label>
        <label><input type="checkbox" id="csSh">그림자</label><label><input type="checkbox" id="csOl">외곽선</label>
      </div></div>
      <div class="field full">미리 보기<div class="preview-box" id="csPrev">가나다라 ABC 123</div></div>`;
    const q = (id) => f.querySelector('#' + id);
    const fam = Fonts.first(cs.fontFamily); if (fam && !FONTS.includes(fam)) q('csFont').insertAdjacentHTML('afterbegin', `<option>${escHtml(fam)}</option>`);
    q('csFont').value = fam || '함초롬바탕';
    q('csSize').value = Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2;
    q('csColor').value = DocModel.rgbToHex(cs.color) || '#000000';
    q('csLs').value = Math.round((parseFloat(cs.letterSpacing) || 0) / parseFloat(cs.fontSize) * 100);
    q('csB').checked = parseInt(cs.fontWeight, 10) >= 600; q('csI').checked = cs.fontStyle === 'italic';
    let deco = ''; for (let n = el; n && n !== ed; n = n.parentElement) deco += ' ' + getComputedStyle(n).textDecorationLine;
    q('csU').checked = deco.includes('underline'); q('csS').checked = deco.includes('line-through');
    q('csSup').checked = cs.verticalAlign === 'super'; q('csSub').checked = cs.verticalAlign === 'sub';
    q('csSh').checked = cs.textShadow && cs.textShadow !== 'none'; q('csOl').checked = parseFloat(cs.webkitTextStrokeWidth) > 0;
    const css = () => ({
      'font-family': Fonts.css(q('csFont').value), 'font-size': q('csSize').value + 'pt', color: q('csColor').value,
      'font-weight': q('csB').checked ? 'bold' : 'normal', 'font-style': q('csI').checked ? 'italic' : 'normal',
      'text-decoration': [q('csU').checked ? 'underline' : '', q('csS').checked ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
      'letter-spacing': (+q('csLs').value || 0) ? (+q('csLs').value / 100) + 'em' : '',
      'vertical-align': q('csSup').checked ? 'super' : q('csSub').checked ? 'sub' : '',
      'text-shadow': q('csSh').checked ? '1px 1px 2px rgba(0,0,0,.35)' : '',
      '-webkit-text-stroke': q('csOl').checked ? '0.6px currentColor' : '',
    });
    const prev = () => { const p = q('csPrev'); p.removeAttribute('style'); const c = css(); for (const k in c) if (c[k]) p.style.setProperty(k, c[k]); if (q('csOl').checked) p.style.color = '#fff', p.style.webkitTextStroke = `0.8px ${q('csColor').value}`; };
    f.addEventListener('input', prev); f.addEventListener('change', prev); prev();
    q('csSup').addEventListener('change', () => { if (q('csSup').checked) q('csSub').checked = false; });
    q('csSub').addEventListener('change', () => { if (q('csSub').checked) q('csSup').checked = false; });
    const ok = await modal('글자 모양', f, [{ label: '취소', value: false }, { label: '설정', value: true, primary: true }]);
    if (!ok) return;
    const c = css(); if (q('csOl').checked) c.color = '#ffffff', c['-webkit-text-stroke'] = `0.6px ${q('csColor').value}`;
    styleSelection(c);
  }
  $('btnCharShape').addEventListener('click', charShapeDialog);
  async function paraShapeDialog() {
    const blocks = selectedBlocks(); if (!blocks.length) return toast('문단 안에 커서를 두세요.');
    const b = blocks[0]; const cs = getComputedStyle(b);
    const pxmm = (v) => Math.round((parseFloat(v) || 0) / MMPX * 10) / 10;
    const ti = parseFloat(cs.textIndent) || 0; const mlpx = parseFloat(cs.marginLeft) || 0;
    const f = document.createElement('div'); f.className = 'form-grid';
    f.innerHTML = `
      <label class="field">정렬<select id="psAlign"><option value="justify">양쪽</option><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
      <label class="field">줄 간격(%)<input id="psLh" type="number" min="50" max="500" step="5"></label>
      <label class="field">왼쪽 여백(mm)<input id="psL" type="number" min="0" max="200" step="0.5"></label>
      <label class="field">오른쪽 여백(mm)<input id="psR" type="number" min="0" max="200" step="0.5"></label>
      <label class="field">첫 줄<select id="psFirst"><option value="none">보통</option><option value="indent">들여쓰기</option><option value="hang">내어쓰기</option></select></label>
      <label class="field">첫 줄 너비(mm)<input id="psFv" type="number" min="0" max="100" step="0.5"></label>
      <label class="field">문단 위(pt)<input id="psT" type="number" min="0" max="200" step="1"></label>
      <label class="field">문단 아래(pt)<input id="psB" type="number" min="0" max="200" step="1"></label>`;
    const q = (id) => f.querySelector('#' + id);
    let al = cs.textAlign; al = ({ start: 'left', end: 'right' })[al] || al; q('psAlign').value = ['left', 'center', 'right', 'justify'].includes(al) ? al : 'justify';
    q('psLh').value = cs.lineHeight === 'normal' ? 160 : Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 100);
    q('psL').value = pxmm(ti < 0 ? mlpx + ti : mlpx); q('psR').value = pxmm(cs.marginRight);
    q('psFirst').value = ti > 0 ? 'indent' : ti < 0 ? 'hang' : 'none'; q('psFv').value = pxmm(Math.abs(ti));
    q('psT').value = Math.round((parseFloat(cs.marginTop) || 0) * 0.75); q('psB').value = Math.round((parseFloat(cs.marginBottom) || 0) * 0.75);
    const ok = await modal(`문단 모양 (${blocks.length}개 문단)`, f, [{ label: '취소', value: false }, { label: '설정', value: true, primary: true }]);
    if (!ok) return;
    const L = (+q('psL').value || 0) * MMPX, R = (+q('psR').value || 0) * MMPX, F = (+q('psFv').value || 0) * MMPX, kind = q('psFirst').value;
    blocks.forEach((x) => {
      x.style.textAlign = q('psAlign').value;
      x.style.lineHeight = ((+q('psLh').value || 160) / 100).toFixed(2);
      x.style.marginLeft = (L + (kind === 'hang' ? F : 0)) ? (L + (kind === 'hang' ? F : 0)).toFixed(1) + 'px' : '';
      x.style.marginRight = R ? R.toFixed(1) + 'px' : '';
      x.style.textIndent = kind === 'indent' ? F.toFixed(1) + 'px' : kind === 'hang' ? (-F).toFixed(1) + 'px' : '';
      x.style.marginTop = +q('psT').value ? q('psT').value + 'pt' : '';
      x.style.marginBottom = +q('psB').value ? q('psB').value + 'pt' : '';
    });
    markDirty();
  }
  $('btnParaShape').addEventListener('click', paraShapeDialog);
  function painterToggle() {
    if (state.painter) { state.painter = null; ed.classList.remove('painting'); $('btnPainter').classList.remove('on'); return; }
    restoreSel();
    const el = caretEl(); if (!el) return toast('본보기 글자에 커서를 두세요.');
    const cs = getComputedStyle(el); const blk = blockOf(el); const bcs = blk ? getComputedStyle(blk) : null;
    let deco = ''; let bg = ''; for (let n = el; n && n !== ed; n = n.parentElement) { const s = getComputedStyle(n); deco += ' ' + s.textDecorationLine; if (!bg) { const b = DocModel.rgbToHex(s.backgroundColor); if (b && b !== '#FFFFFF') bg = b; } }
    state.painter = {
      css: { 'font-family': cs.fontFamily, 'font-size': (Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2) + 'pt', color: cs.color, 'font-weight': cs.fontWeight, 'font-style': cs.fontStyle,
        'text-decoration': deco.includes('underline') || deco.includes('line-through') ? [deco.includes('underline') ? 'underline' : '', deco.includes('line-through') ? 'line-through' : ''].join(' ').trim() : 'none',
        'background-color': bg || '', 'letter-spacing': cs.letterSpacing === 'normal' ? '' : cs.letterSpacing },
      para: bcs ? { textAlign: bcs.textAlign, lineHeight: (parseFloat(bcs.lineHeight) / parseFloat(bcs.fontSize)).toFixed(2) } : null,
    };
    ed.classList.add('painting'); $('btnPainter').classList.add('on');
    toast('모양을 복사했습니다. 칠할 글자를 끌어서 고르세요. (Esc: 취소)');
  }
  $('btnPainter').addEventListener('click', painterToggle);
  ed.addEventListener('mouseup', () => {
    if (!state.painter) return;
    setTimeout(() => {
      const s = getSelection(); if (!s.rangeCount || s.isCollapsed || !inEditor(s.anchorNode)) return;
      const pt = state.painter; state.savedRange = s.getRangeAt(0).cloneRange();
      if (pt.para) selectedBlocks().forEach((b) => { b.style.textAlign = pt.para.textAlign; b.style.lineHeight = pt.para.lineHeight; });
      styleSelection(pt.css);
      state.painter = null; ed.classList.remove('painting'); $('btnPainter').classList.remove('on');
      toast('모양을 칠했습니다.');
    }, 0);
  });

  /* ---------- 표 ---------- */
  $('btnTable').addEventListener('click', (e) => openPop(e.currentTarget, (p) => {
    const lab = document.createElement('div'); lab.className = 'tgrid-label'; lab.textContent = '줄 × 칸 고르기';
    const g = document.createElement('div'); g.className = 'tgrid';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) { const i = document.createElement('i'); i.dataset.r = r; i.dataset.c = c; g.appendChild(i); }
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
    if (blk && blk.parentElement === ed && !blk.textContent.trim() && !blk.querySelector('img, .fobj')) blk.replaceWith(tpl.content);
    else if (blk && blk.parentElement === ed) blk.after(tpl.content);
    else { const td = caretEl() && caretEl().closest('td'); if (td) { exec('insertHTML', h); return; } ed.appendChild(tpl.content); }
    placeCaret(tbl.rows[0].cells[0]);
    markDirty();
  }
  function placeCaret(el, end) {
    const r = document.createRange(); const target = el.querySelector('p') || el;
    r.selectNodeContents(target); r.collapse(!end);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); state.savedRange = r.cloneRange();
  }
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
    const cols = Math.max(0, ...g.map((r) => r.length));
    return { g, pos, cols, rows: tbl.rows.length };
  }
  function newCell() { const td = document.createElement('td'); td.innerHTML = '<p><br></p>'; return td; }
  /* ---------- 표 편집 (TableKit 격자 엔진 사용) ---------- */
  try { document.execCommand('enableInlineTableEditing', false, 'false'); document.execCommand('enableObjectResizing', false, 'false'); } catch (e) { /* 지원 안 함 */ }
  const TK = TableKit;
  const cellOf = (el) => (el && el.closest ? el.closest('td, th') : null);
  const curCell = () => { const c = cellOf(caretEl()); return c && ed.contains(c) ? c : null; };
  const textW = () => (state.page.w - state.page.ml - state.page.mr) * MMPX - 2;
  const mm = (px) => Math.round(px / MMPX * 10) / 10;
  state.blk = null; // 셀 블록 {tbl, a, b}
  state.line = { type: 'SOLID', w: 0.12, color: '#000000' };
  function blockRect() {
    const b = state.blk; if (!b || !b.tbl.isConnected || !b.a.isConnected || !b.b.isConnected) { state.blk = null; return null; }
    const m = TK.read(b.tbl); return { m, R: TK.spanRect(m, b.a, b.b) };
  }
  function paintBlock() {
    ed.querySelectorAll('.cell-sel, .cell-blk').forEach((x) => x.classList.remove('cell-sel', 'cell-blk'));
    const b = blockRect();
    ed.classList.toggle('blocksel', !!b);
    if (b) TK.cellsIn(b.m, b.R).forEach((td) => td.classList.add('cell-blk'));
    else { const td = curCell(); if (td) td.classList.add('cell-sel'); }
    const h = $('tblHint');
    if (b) h.textContent = `셀 블록 ${b.R.r1 - b.R.r0 + 1}줄×${b.R.c1 - b.R.c0 + 1}칸 · M 합치기 · S 나누기 · P 속성 · L 테두리 · Del 내용 지우기`;
    else h.textContent = curCell() ? '셀을 끌어서 여러 칸 고르기 · F5 셀 블록' : '';
  }
  function setBlock(tbl, a, b) { state.blk = tbl ? { tbl, a, b: b || a } : null; paintBlock(); }
  function clearBlock() { if (state.blk) { state.blk = null; paintBlock(); } }
  // 작업 대상: 셀 블록 → 그 범위 / 글 선택이 여러 셀에 걸치면 그 셀들 / 아니면 커서가 있는 셀
  function target() {
    const b = blockRect();
    if (b) return { tbl: state.blk.tbl, m: b.m, R: b.R, cells: TK.cellsIn(b.m, b.R), td: state.blk.a, block: true };
    const td = curCell(); if (!td) return null;
    const tbl = td.closest('table'); const m = TK.read(tbl);
    let cells = [td];
    const s = getSelection();
    if (s.rangeCount && !s.isCollapsed) {
      const r = s.getRangeAt(0);
      const cs = Array.from(tbl.querySelectorAll('td, th')).filter((c) => c.closest('table') === tbl && r.intersectsNode(c));
      if (cs.length > 1) cells = cs;
    }
    let R = TK.rectOf(m, cells[0]);
    cells.forEach((c) => { const X = TK.rectOf(m, c); R = { r0: Math.min(R.r0, X.r0), c0: Math.min(R.c0, X.c0), r1: Math.max(R.r1, X.r1), c1: Math.max(R.c1, X.c1) }; });
    return { tbl, m, R, cells, td, block: false };
  }
  function tableChanged(focusCell) {
    if (focusCell && focusCell.isConnected) placeCaret(focusCell);
    markDirty(); paintBlock(); updateContext();
    clearTimeout(statsTimer); statsTimer = setTimeout(() => { layout(); updateStats(); drawObjBox(); }, 30);
  }
  const blockParas = (td) => Array.from(td.children).filter((x) => /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE)$/.test(x.tagName) && !x.classList.contains('fobj'));
  function clearCells(cells) {
    cells.forEach((td) => { const p0 = td.querySelector('p'); const al = p0 && p0.style.textAlign; td.innerHTML = al ? `<p style="text-align:${al}"><br></p>` : '<p><br></p>'; });
  }

  const T = {
    insRow(below, n = 1) {
      const t = target(); const E = TK.edit(t.tbl); const at = below ? t.R.r1 + 1 : t.R.r0;
      E.insertRows(at, n, below ? t.R.r1 : t.R.r0).commit(); clearBlock(); tableChanged(E.m[at][t.R.c0]);
    },
    insCol(right, n = 1) {
      const t = target(); const E = TK.edit(t.tbl); const at = right ? t.R.c1 + 1 : t.R.c0;
      E.insertCols(at, n, right ? t.R.c1 : t.R.c0).commit(); clearBlock(); tableChanged(E.m[t.R.r0][at]);
    },
    delRows() {
      const t = target(); const E = TK.edit(t.tbl);
      if (t.R.r0 === 0 && t.R.r1 === E.rows - 1) return T.delTable();
      E.deleteRows(t.R.r0, t.R.r1).commit(); clearBlock(); tableChanged(E.m[Math.min(t.R.r0, E.rows - 1)][0]);
    },
    delCols() {
      const t = target(); const E = TK.edit(t.tbl);
      if (t.R.c0 === 0 && t.R.c1 === E.cols - 1) return T.delTable();
      E.deleteCols(t.R.c0, t.R.c1).commit(); clearBlock(); tableChanged(E.m[t.R.r0][Math.min(t.R.c0, E.cols - 1)]);
    },
    clear() { const t = target(); clearCells(t.cells); tableChanged(); toast(`셀 ${t.cells.length}개의 내용을 지웠습니다.`); },
    merge() {
      const t = target();
      if (t.cells.length < 2) return toast('합칠 셀들을 먼저 고르세요. 셀을 끌어서 고르거나, F5를 누르고 Shift+방향키로 넓히면 됩니다.');
      const E = TK.edit(t.tbl); const cell = E.merge(t.R); E.commit(); clearBlock(); tableChanged(cell);
    },
    async split() {
      const t = target(); const one = t.cells.length === 1;
      const X = TK.rectOf(t.m, t.cells[0]); const merged = one && (X.r1 > X.r0 || X.c1 > X.c0);
      const f = document.createElement('div'); f.className = 'form-grid';
      f.innerHTML = `<label class="field">줄 수<input id="spR" type="number" min="1" max="50" step="1"></label>
        <label class="field">칸 수<input id="spC" type="number" min="1" max="50" step="1"></label>
        <p class="field full">${one ? (merged ? '합쳐진 셀입니다. 처음 합치기 전처럼 나누려면 그대로 [나누기]를 누르세요.' : '이 셀을 원하는 줄·칸으로 나눕니다. 다른 줄의 셀은 모양이 그대로 유지됩니다.') : `고른 셀 ${t.cells.length}개를 각각 나눕니다.`}</p>`;
      f.querySelector('#spR').value = merged ? X.r1 - X.r0 + 1 : 1;
      f.querySelector('#spC').value = merged ? X.c1 - X.c0 + 1 : 2;
      const ok = await modal('셀 나누기', f, [{ label: '취소', value: false }, { label: '나누기', value: true, primary: true }]);
      if (!ok) return;
      const nr = Math.max(1, Math.min(50, +f.querySelector('#spR').value || 1)), nc = Math.max(1, Math.min(50, +f.querySelector('#spC').value || 1));
      if (nr === 1 && nc === 1) return;
      let first = null;
      for (const td of t.cells) { const E = TK.edit(t.tbl); const made = E.split(td, nr, nc); E.commit(); if (!first) first = made[0]; }
      clearBlock(); tableChanged(first);
    },
    equalW() { const t = target(); if (t.R.c1 === t.R.c0) { const E0 = TK.edit(t.tbl); t.R.c0 = 0; t.R.c1 = E0.cols - 1; } const E = TK.edit(t.tbl); E.equalWidths(t.R.c0, t.R.c1).commit(); tableChanged(); },
    equalH() {
      const t = target(); const r0 = t.R.r1 === t.R.r0 ? 0 : t.R.r0, r1 = t.R.r1 === t.R.r0 ? t.tbl.rows.length - 1 : t.R.r1;
      const z = zoomRatio(); const hs = []; for (let r = r0; r <= r1; r++) hs.push(t.tbl.rows[r].getBoundingClientRect().height / z);
      const avg = hs.reduce((a, b) => a + b, 0) / hs.length;
      for (let r = r0; r <= r1; r++) setRowHeight(t.tbl, r, avg);
      tableChanged();
    },
    fit() { const t = target(); const E = TK.edit(t.tbl); E.fit(textW()).commit(); tableChanged(); },
    autoH() { const t = target(); for (let r = t.R.r0; r <= t.R.r1; r++) Array.from(t.tbl.rows[r].cells).forEach((c) => c.style.removeProperty('height')); Array.from(t.tbl.rows).slice(t.R.r0, t.R.r1 + 1).forEach((tr) => tr.style.removeProperty('height')); tableChanged(); },
    hL: () => T.hAlign('left'), hC: () => T.hAlign('center'), hR: () => T.hAlign('right'),
    hAlign(a) { const t = target(); t.cells.forEach((td) => blockParas(td).forEach((p) => { p.style.textAlign = a; })); tableChanged(); },
    vT: () => T.vAlign('top'), vM: () => T.vAlign('middle'), vB: () => T.vAlign('bottom'),
    vAlign(a) { const t = target(); t.cells.forEach((td) => { td.style.verticalAlign = a; }); tableChanged(); },
    cellBg(anchor) { const t = target(); swatchPop(anchor, FILLS, (c) => { t.cells.forEach((x) => { if (c && c !== '#ffffff') x.style.backgroundColor = c; else x.style.removeProperty('background-color'); }); tableChanged(); }, { none: true }); },
    border(where, line) { const t = target(); TK.applyBorder(t.tbl, t.R, where, line || state.line); t.tbl.classList.remove('noborder'); tableChanged(); },
    delTable() { const t = target(); const tbl = t.tbl; const p = document.createElement('p'); p.innerHTML = '<br>'; tbl.replaceWith(p); state.blk = null; placeCaret(p); $('tableBar').hidden = true; markDirty(); layout(); },
    calc(kind) {
      const t = target(); const { m, R } = t;
      const num = (td) => { const s = td.innerText.replace(/[,\s원%]/g, ''); return /^[-+]?\d*\.?\d+$/.test(s) ? parseFloat(s) : null; };
      const lastEmpty = R.r1 > R.r0 && TK.cellsIn(m, { r0: R.r1, c0: R.c0, r1: R.r1, c1: R.c1 }).every((td) => !td.innerText.trim());
      let outRow = lastEmpty ? R.r1 : R.r1 + 1; const srcR1 = lastEmpty ? R.r1 - 1 : R.r1;
      let E = null;
      if (outRow >= m.length) { E = TK.edit(t.tbl); E.insertRows(outRow, 1, R.r1).commit(); }
      const M = E ? E.m : m; let n = 0;
      for (let c = R.c0; c <= R.c1; c++) {
        const vals = []; for (let r = R.r0; r <= srcR1; r++) { if (c > R.c0 && M[r][c] === M[r][c - 1]) continue; if (r > R.r0 && M[r][c] === M[r - 1][c]) continue; const v = num(M[r][c]); if (v !== null) vals.push(v); }
        if (!vals.length) continue;
        const v = kind === 'sum' ? vals.reduce((a, b) => a + b, 0) : kind === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a * b, 1);
        const cell = M[outRow][c]; if (c > R.c0 && cell === M[outRow][c - 1]) continue;
        const p0 = cell.querySelector('p'); const al = (p0 && p0.style.textAlign) || 'right';
        cell.innerHTML = `<p style="text-align:${al}">${(Math.round(v * 100) / 100).toLocaleString('ko-KR')}</p>`; n++;
      }
      clearBlock(); tableChanged();
      toast(n ? `${({ sum: '합계', avg: '평균', prod: '곱' })[kind]}를 ${n}칸에 넣었습니다.` : '숫자가 든 셀이 없습니다.');
    },
  };
  function setRowHeight(tbl, r, h) {
    const tr = tbl.rows[r]; if (!tr) return;
    tr.style.removeProperty('height');
    Array.from(tr.cells).forEach((c) => { if ((c.rowSpan || 1) === 1) c.style.height = Math.max(8, Math.round(h)) + 'px'; });
  }

  // 표/셀 속성: 안 여백·바깥 여백·크기·정렬·배경·테두리
  async function tablePropsDialog() {
    const t = target(); if (!t) return toast('표 안에 커서를 두세요.');
    const tbl = t.tbl; const td = t.cells[0]; const cs = getComputedStyle(td); const ts = getComputedStyle(tbl);
    const E0 = TK.edit(tbl);
    const f = document.createElement('div'); f.className = 'form-grid';
    const tw = mm(E0.w.reduce((a, b) => a + b, 0));
    const align = tbl.style.marginLeft === 'auto' && tbl.style.marginRight === 'auto' ? 'center' : tbl.style.marginLeft === 'auto' ? 'right' : 'left';
    const colW = mm(E0.w.slice(t.R.c0, t.R.c1 + 1).reduce((a, b) => a + b, 0) / (t.R.c1 - t.R.c0 + 1));
    const hasH = td.style.height;
    f.innerHTML = `
      <fieldset><legend>표</legend>
        <label class="field w2">표 너비(mm)<input id="tpW" type="number" step="0.5" min="10"></label>
        <label class="field w2">표 정렬<select id="tpAl"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
        <div class="field w4"><button type="button" class="btn" id="tpFit">본문 폭(${mm(textW())}mm)에 맞추기</button></div>
        <label class="field">바깥 위(mm)<input id="tpOt" type="number" step="0.5" min="0"></label>
        <label class="field">바깥 아래(mm)<input id="tpOb" type="number" step="0.5" min="0"></label>
        <label class="field">바깥 왼쪽(mm)<input id="tpOl" type="number" step="0.5" min="0"></label>
        <label class="field">바깥 오른쪽(mm)<input id="tpOr" type="number" step="0.5" min="0"></label>
      </fieldset>
      <fieldset><legend>셀 — <span id="tpScopeLab"></span></legend>
        <div class="field w4"><div class="seg"><label><input type="radio" name="tpScope" value="sel" checked><span>고른 셀</span></label><label><input type="radio" name="tpScope" value="all"><span>표 전체</span></label></div></div>
        <label class="field">안 여백 위(mm)<input id="tpPt" type="number" step="0.1" min="0"></label>
        <label class="field">안 여백 아래(mm)<input id="tpPb" type="number" step="0.1" min="0"></label>
        <label class="field">안 여백 왼쪽(mm)<input id="tpPl" type="number" step="0.1" min="0"></label>
        <label class="field">안 여백 오른쪽(mm)<input id="tpPr" type="number" step="0.1" min="0"></label>
        <label class="field">칸 너비(mm)<input id="tpCw" type="number" step="0.5" min="2"></label>
        <label class="field">셀 높이(mm)<input id="tpCh" type="number" step="0.5" min="0" placeholder="자동"></label>
        <label class="field">세로 정렬<select id="tpVa"><option value="top">위</option><option value="middle">가운데</option><option value="bottom">아래</option></select></label>
        <div class="field">배경색<span class="bgf"><input id="tpBg" type="color" aria-label="배경색"><label><input type="checkbox" id="tpBgN">없음</label></span></div>
      </fieldset>
      <fieldset><legend>테두리</legend>
        <label class="field">선 종류<select id="tpLt"><option value="SOLID">실선</option><option value="DASH">파선</option><option value="DOT">점선</option><option value="DOUBLE_SLIM">이중선</option><option value="NONE">없음</option></select></label>
        <label class="field">굵기(mm)<select id="tpLw">${[0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2].map((v) => `<option value="${v}">${v}</option>`).join('')}</select></label>
        <label class="field">색<input id="tpLc" type="color"></label>
        <label class="field">적용 위치<select id="tpLwhere"><option value="">바꾸지 않음</option><option value="all">모두</option><option value="outer">바깥쪽</option><option value="inner">안쪽</option><option value="innerH">가로 안쪽</option><option value="innerV">세로 안쪽</option><option value="top">위</option><option value="bottom">아래</option><option value="left">왼쪽</option><option value="right">오른쪽</option></select></label>
      </fieldset>`;
    const q = (id) => f.querySelector('#' + id);
    q('tpW').value = tw; q('tpAl').value = align;
    q('tpOt').value = mm(parseFloat(ts.marginTop) || 0); q('tpOb').value = mm(parseFloat(ts.marginBottom) || 0);
    q('tpOl').value = align === 'left' ? mm(parseFloat(ts.marginLeft) || 0) : 0; q('tpOr').value = align === 'right' ? mm(parseFloat(ts.marginRight) || 0) : 0;
    q('tpPt').value = mm(parseFloat(cs.paddingTop)); q('tpPb').value = mm(parseFloat(cs.paddingBottom)); q('tpPl').value = mm(parseFloat(cs.paddingLeft)); q('tpPr').value = mm(parseFloat(cs.paddingRight));
    q('tpCw').value = colW; q('tpCh').value = hasH ? mm(parseFloat(hasH)) : '';
    q('tpVa').value = ['top', 'bottom'].includes(cs.verticalAlign) ? cs.verticalAlign : 'middle';
    const bg = DocModel.rgbToHex(cs.backgroundColor); q('tpBg').value = bg && bg !== '#FFFFFF' ? bg.toLowerCase() : '#ffffff'; q('tpBgN').checked = !bg || bg === '#FFFFFF';
    q('tpBg').addEventListener('input', () => { q('tpBgN').checked = false; });
    q('tpLt').value = state.line.type; q('tpLw').value = String(state.line.w); q('tpLc').value = state.line.color;
    const scopeLab = () => { q('tpScopeLab').textContent = f.querySelector('input[name=tpScope]:checked').value === 'all' ? '표 전체 셀' : `고른 셀 ${t.cells.length}개`; };
    f.querySelectorAll('input[name=tpScope]').forEach((r) => r.addEventListener('change', scopeLab)); scopeLab();
    q('tpFit').onclick = () => { q('tpW').value = mm(textW()); };
    const snap = JSON.stringify(['tpPt', 'tpPb', 'tpPl', 'tpPr', 'tpCw', 'tpCh', 'tpVa', 'tpBg', 'tpBgN', 'tpW'].map((id) => q(id).type === 'checkbox' ? q(id).checked : q(id).value));
    const ok = await modal('표/셀 속성', f, [{ label: '취소', value: false }, { label: '설정', value: true, primary: true }], { wide: true, w: 640 });
    if (!ok) return;
    const all = f.querySelector('input[name=tpScope]:checked').value === 'all';
    const cells = all ? Array.from(tbl.querySelectorAll('td, th')).filter((c) => c.closest('table') === tbl) : t.cells;
    const R = all ? { r0: 0, c0: 0, r1: E0.rows - 1, c1: E0.cols - 1 } : t.R;
    const v = (id) => Math.max(0, +q(id).value || 0);
    // 셀 안 여백
    cells.forEach((c) => { c.style.padding = `${v('tpPt')}mm ${v('tpPr')}mm ${v('tpPb')}mm ${v('tpPl')}mm`; c.style.verticalAlign = q('tpVa').value; });
    const now = ['tpPt', 'tpPb', 'tpPl', 'tpPr', 'tpCw', 'tpCh', 'tpVa', 'tpBg', 'tpBgN', 'tpW'].map((id) => q(id).type === 'checkbox' ? q(id).checked : q(id).value); const was = JSON.parse(snap);
    if (now[7] !== was[7] || now[8] !== was[8]) cells.forEach((c) => { if (q('tpBgN').checked) c.style.removeProperty('background-color'); else c.style.backgroundColor = q('tpBg').value; });
    // 셀 높이
    if (now[5] !== was[5]) { for (let r = R.r0; r <= R.r1; r++) { if (q('tpCh').value === '') Array.from(tbl.rows[r].cells).forEach((c) => c.style.removeProperty('height')); else setRowHeight(tbl, r, v('tpCh') * MMPX); } }
    // 칸 너비 → 표 너비
    const E = TK.edit(tbl);
    if (now[4] !== was[4] && v('tpCw') > 0) { for (let c = R.c0; c <= R.c1; c++) E.w[c] = v('tpCw') * MMPX; }
    else if (now[9] !== was[9] && v('tpW') > 0) E.fit(v('tpW') * MMPX);
    E.commit();
    // 표 정렬·바깥 여백
    const al = q('tpAl').value;
    tbl.style.marginTop = v('tpOt') + 'mm'; tbl.style.marginBottom = v('tpOb') + 'mm';
    tbl.style.marginLeft = al === 'left' ? v('tpOl') + 'mm' : 'auto';
    tbl.style.marginRight = al === 'right' ? v('tpOr') + 'mm' : al === 'center' ? 'auto' : '0mm';
    if (al === 'left' && !v('tpOl')) tbl.style.removeProperty('margin-left');
    // 테두리
    const where = q('tpLwhere').value;
    state.line = { type: q('tpLt').value, w: +q('tpLw').value, color: q('tpLc').value };
    if (where) { TK.applyBorder(tbl, R, where, state.line); tbl.classList.remove('noborder'); }
    tableChanged(t.td);
  }

  // 테두리 고르기 창
  const BORDER_ICONS = {
    all: '<rect x="3" y="3" width="18" height="18"/><path d="M12 3v18M3 12h18"/>', outer: '<rect x="3" y="3" width="18" height="18"/><path d="M12 3v18M3 12h18" stroke-dasharray="1.5 2" opacity=".45"/>',
    inner: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M12 3v18M3 12h18"/>', innerH: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M3 12h18"/>',
    innerV: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M12 3v18"/>', top: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M3 3h18"/>',
    bottom: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M3 21h18"/>', left: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M3 3v18"/>',
    right: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M21 3v18"/>', none: '<rect x="3" y="3" width="18" height="18" stroke-dasharray="1.5 2" opacity=".45"/><path d="M6 6l12 12" stroke="#c0392b"/>',
  };
  const BORDER_NAMES = { all: '모두', outer: '바깥쪽', inner: '안쪽', innerH: '가로 안쪽', innerV: '세로 안쪽', top: '위', bottom: '아래', left: '왼쪽', right: '오른쪽', none: '없음' };
  function borderPop(anchor) {
    openPop(anchor, (p) => {
      p.classList.add('tblpop');
      p.innerHTML = `<h4>선 모양</h4><div class="row">
        <label>종류 <select class="sel" id="bpT"><option value="SOLID">실선</option><option value="DASH">파선</option><option value="DOT">점선</option><option value="DOUBLE_SLIM">이중선</option></select></label>
        <label>굵기 <select class="sel" id="bpW">${[0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2].map((v) => `<option value="${v}">${v}mm</option>`).join('')}</select></label>
        <label>색 <input type="color" id="bpC"></label></div>
        <h4>어디에 그을까요 (고른 셀 기준)</h4><div class="bgrid"></div>`;
      const q = (id) => p.querySelector('#' + id);
      q('bpT').value = state.line.type; q('bpW').value = String(state.line.w); q('bpC').value = state.line.color;
      const g = p.querySelector('.bgrid');
      Object.keys(BORDER_ICONS).forEach((k) => {
        const b = document.createElement('button'); b.type = 'button'; b.title = BORDER_NAMES[k] + ' 테두리';
        b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${BORDER_ICONS[k]}</svg><span>${BORDER_NAMES[k]}</span>`;
        b.onmousedown = (e) => e.preventDefault();
        b.onclick = () => {
          state.line = { type: q('bpT').value, w: +q('bpW').value, color: q('bpC').value };
          closePop();
          if (k === 'none') T.border('all', { type: 'NONE', w: 0.1, color: '#000000' }); else T.border(k);
        };
        g.appendChild(b);
      });
    });
  }

  document.querySelectorAll('#tableBar [data-t]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      if (!target()) return toast('표 안에 커서를 두세요.');
      const k = b.dataset.t; const a = e.currentTarget;
      if (k === 'insMenu') return menu(a, [['위에 줄 넣기', () => T.insRow(false)], ['아래에 줄 넣기', () => T.insRow(true), 'Ctrl+Enter'], ['위·아래에 여러 줄…', () => multiInsert('row')], '-', ['왼쪽에 칸 넣기', () => T.insCol(false)], ['오른쪽에 칸 넣기', () => T.insCol(true)], ['왼쪽·오른쪽에 여러 칸…', () => multiInsert('col')]]);
      if (k === 'delMenu') return menu(a, [['줄 지우기', T.delRows, '고른 줄 모두'], ['칸 지우기', T.delCols, '고른 칸 모두'], ['셀 내용만 지우기', T.clear, 'Delete'], '-', ['표 지우기', T.delTable]]);
      if (k === 'sizeMenu') return menu(a, [['칸 너비를 같게', T.equalW, '고른 칸(없으면 전체)'], ['줄 높이를 같게', T.equalH, '고른 줄(없으면 전체)'], ['줄 높이 자동', T.autoH, '글 양에 맞춤'], ['표를 본문 폭에 맞추기', T.fit], '-', ['너비 조절 안내', () => toast('칸 경계선을 끌면 너비, 줄 아래 경계선을 끌면 높이가 바뀝니다. Alt+방향키로 1mm씩 조절할 수도 있습니다.')]]);
      if (k === 'calcMenu') return menu(a, [['블록 합계', () => T.calc('sum'), '칸마다 아래에'], ['블록 평균', () => T.calc('avg'), '칸마다 아래에'], ['블록 곱', () => T.calc('prod'), '칸마다 아래에']]);
      if (k === 'borderMenu') return borderPop(a);
      if (k === 'cellBg') return T.cellBg(a);
      if (k === 'props') return tablePropsDialog();
      T[k]();
    });
  });
  async function multiInsert(kind) {
    const f = document.createElement('div'); f.className = 'form-grid';
    f.innerHTML = `<label class="field">${kind === 'row' ? '줄' : '칸'} 수<input id="miN" type="number" min="1" max="50" value="1"></label>
      <label class="field">위치<select id="miP">${kind === 'row' ? '<option value="1">아래쪽</option><option value="0">위쪽</option>' : '<option value="1">오른쪽</option><option value="0">왼쪽</option>'}</select></label>`;
    const ok = await modal(kind === 'row' ? '줄 넣기' : '칸 넣기', f, [{ label: '취소', value: false }, { label: '넣기', value: true, primary: true }]);
    if (!ok) return;
    const n = Math.max(1, Math.min(50, +f.querySelector('#miN').value || 1)); const after = f.querySelector('#miP').value === '1';
    if (kind === 'row') T.insRow(after, n); else T.insCol(after, n);
  }

  /* 셀 블록: 끌어서 고르기, F5, Shift+클릭, Shift+방향키 */
  let cellDrag = null;
  ed.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const td = cellOf(e.target);
    if (e.shiftKey && td && state.blk && td.closest('table') === state.blk.tbl) { e.preventDefault(); state.blk.b = td; paintBlock(); return; }
    if (e.shiftKey && td) { const c0 = curCell(); if (c0 && c0 !== td && c0.closest('table') === td.closest('table')) { e.preventDefault(); setBlock(td.closest('table'), c0, td); return; } }
    if (state.blk) clearBlock();
    cellDrag = td && ed.contains(td) ? { start: td, tbl: td.closest('table'), on: false } : null;
  });
  document.addEventListener('mousemove', (e) => {
    if (!cellDrag || !(e.buttons & 1)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const td = cellOf(el);
    if (!td || td.closest('table') !== cellDrag.tbl) return;
    if (td !== cellDrag.start || cellDrag.on) {
      cellDrag.on = true;
      state.blk = { tbl: cellDrag.tbl, a: cellDrag.start, b: td }; paintBlock();
    }
  });
  document.addEventListener('mouseup', () => {
    if (cellDrag && cellDrag.on && state.blk) {
      // 셀 블록일 때는 글 선택을 첫 셀 안 커서로 접어 둔다(입력·삭제 때 표 모양이 깨지지 않게)
      const td = state.blk.a; const r = document.createRange(); const tg = td.querySelector('p') || td; r.selectNodeContents(tg); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      updateContext(); paintBlock();
    }
    cellDrag = null;
  });
  function blockKeys(e) {
    // 반환 true면 처리함
    const td = curCell();
    if (e.key === 'F5' && td && state.mode === 'doc') {
      e.preventDefault(); e.stopPropagation();
      if (!state.blk) setBlock(td.closest('table'), td);
      else { // F5 두 번: 표 전체
        const tbl = state.blk.tbl; const m = TK.read(tbl); setBlock(tbl, m[0][0], m[m.length - 1][m[0].length - 1]);
      }
      return true;
    }
    if (!state.blk) return false;
    const mod = e.ctrlKey || e.metaKey; const k = e.key;
    if (k === 'Escape') { e.preventDefault(); clearBlock(); return true; }
    if (k.startsWith('Arrow') && (e.shiftKey || !mod) && !e.altKey) {
      e.preventDefault();
      const b = blockRect(); if (!b) return true;
      const X = TK.rectOf(b.m, state.blk.b);
      let r = k === 'ArrowUp' ? X.r0 - 1 : k === 'ArrowDown' ? X.r1 + 1 : X.r0, c = k === 'ArrowLeft' ? X.c0 - 1 : k === 'ArrowRight' ? X.c1 + 1 : X.c0;
      r = Math.max(0, Math.min(b.m.length - 1, r)); c = Math.max(0, Math.min(b.m[0].length - 1, c));
      if (e.shiftKey) state.blk.b = b.m[r][c]; else { state.blk.a = state.blk.b = b.m[r][c]; placeCaret(b.m[r][c]); }
      paintBlock(); return true;
    }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); T.clear(); return true; }
    if (mod && (k === 'c' || k === 'x' || k === 'C' || k === 'X')) {
      e.preventDefault(); copyBlock(); if (k.toLowerCase() === 'x') T.clear(); return true;
    }
    if (!mod && !e.altKey && k.length === 1) {
      const K = k.toLowerCase();
      if (K === 'm') { e.preventDefault(); T.merge(); return true; }
      if (K === 's') { e.preventDefault(); T.split(); return true; }
      if (K === 'p') { e.preventDefault(); tablePropsDialog(); return true; }
      if (K === 'l') { e.preventDefault(); borderPop($('tableBar').querySelector('[data-t=borderMenu]')); return true; }
      if (K === 'w') { e.preventDefault(); T.equalW(); return true; }
      if (K === 'h') { e.preventDefault(); T.equalH(); return true; }
      // 그 밖의 글자: 블록을 풀고 첫 셀에 입력
      const a = state.blk.a; clearBlock(); placeCaret(a, true); return false;
    }
    return false;
  }
  function copyBlock() {
    const b = blockRect(); if (!b) return;
    const rows = []; let html = '<table>';
    for (let r = b.R.r0; r <= b.R.r1; r++) {
      const cells = []; html += '<tr>';
      for (let c = b.R.c0; c <= b.R.c1; c++) { const td = b.m[r][c]; if ((c > b.R.c0 && b.m[r][c - 1] === td) || (r > b.R.r0 && b.m[r - 1][c] === td)) { cells.push(''); continue; } cells.push(td.innerText.replace(/\n+$/, '').replace(/\t/g, ' ')); html += `<td>${td.innerHTML}</td>`; }
      rows.push(cells.join('\t')); html += '</tr>';
    }
    html += '</table>';
    const text = rows.join('\n');
    const onCopy = (ev) => { ev.clipboardData.setData('text/plain', text); ev.clipboardData.setData('text/html', html); ev.preventDefault(); };
    document.addEventListener('copy', onCopy, { once: true, capture: true });
    document.execCommand('copy');
    toast(`셀 ${b.R.r1 - b.R.r0 + 1}줄×${b.R.c1 - b.R.c0 + 1}칸을 복사했습니다.`);
  }
  // 엑셀·표를 셀에 붙여넣으면 커서 셀부터 칸칸이 채움(모자라면 줄·칸을 늘림)
  function pasteGridIntoTable(grid) {
    const t = target(); if (!t) return false;
    const r0 = t.R.r0, c0 = t.R.c0;
    let E = TK.edit(t.tbl);
    const needR = r0 + grid.length - E.rows, needC = c0 + Math.max(...grid.map((r) => r.length)) - E.cols;
    if (needR > 0) E.insertRows(E.rows, needR, E.rows - 1);
    if (needC > 0) E.insertCols(E.cols, needC, E.cols - 1);
    E.commit(); E = TK.edit(t.tbl);
    grid.forEach((row, i) => row.forEach((val, j) => {
      const td = E.m[r0 + i] && E.m[r0 + i][c0 + j]; if (!td) return;
      const X = TK.rectOf(E.m, td); if (X.r0 !== r0 + i || X.c0 !== c0 + j) return;
      const p0 = td.querySelector('p'); const al = p0 && p0.style.textAlign;
      td.innerHTML = String(val).split('\n').map((l) => `<p${al ? ` style="text-align:${al}"` : ''}>${escHtml(l) || '<br>'}</p>`).join('');
    }));
    state.blk = { tbl: t.tbl, a: E.m[r0][c0], b: E.m[Math.min(E.rows - 1, r0 + grid.length - 1)][Math.min(E.cols - 1, c0 + Math.max(...grid.map((r) => r.length)) - 1)] };
    tableChanged(); toast(`${grid.length}줄×${Math.max(...grid.map((r) => r.length))}칸을 셀에 붙여 넣었습니다.`);
    return true;
  }

  // 표 모양을 지키는 입력 가드: 여러 셀에 걸친 글 선택에서 지우기·입력하면 브라우저가 셀을 부수므로 막는다
  ed.addEventListener('beforeinput', (e) => {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    const sc = cellOf(r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
    const ec = cellOf(r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement);
    const crossesTable = !s.isCollapsed && (sc !== ec || (!sc && Array.from(ed.querySelectorAll('table')).some((tb) => r.intersectsNode(tb))));
    if (state.blk && /^(insert|delete)/.test(e.inputType)) {
      if (/^delete/.test(e.inputType)) { e.preventDefault(); T.clear(); return; }
      const a = state.blk.a; clearBlock(); placeCaret(a, true);
    }
    if (!crossesTable) {
      // 셀 끝에서 Delete, 셀 처음에서 Backspace: 이웃 셀·문단과 합쳐지는 것 막기
      if (s.isCollapsed && sc && (e.inputType === 'deleteContentForward' || e.inputType === 'deleteContentBackward')) {
        const pre = document.createRange(); pre.selectNodeContents(sc);
        if (e.inputType === 'deleteContentBackward') { pre.setEnd(r.startContainer, r.startOffset); if (!pre.toString() && !pre.cloneContents().querySelector('img,br ~ *')) { const first = blockParas(sc)[0]; const blk = blockOf(caretEl()); if (!blk || blk === first || blk === sc) e.preventDefault(); } }
        else { pre.setStart(r.endContainer, r.endOffset); if (!pre.toString().replace(/​/g, '') && !pre.cloneContents().querySelector('img')) { const ps = blockParas(sc); const blk = blockOf(caretEl()); if (!blk || blk === ps[ps.length - 1] || blk === sc) e.preventDefault(); } }
      }
      // 표 바로 뒤 문단 처음에서 Backspace → 문단이 표 안으로 빨려 들어가는 것 막기
      if (s.isCollapsed && !sc && e.inputType === 'deleteContentBackward') {
        const blk = blockOf(caretEl());
        if (blk && blk.previousElementSibling && blk.previousElementSibling.tagName === 'TABLE') {
          const pre = document.createRange(); pre.selectNodeContents(blk); pre.setEnd(r.startContainer, r.startOffset);
          if (!pre.toString()) { e.preventDefault(); if (!blk.textContent.trim() && !blk.querySelector('img, .fobj') && blk.nextElementSibling) { blk.remove(); markDirty(); } else placeCaret(lastCellOf(blk.previousElementSibling), true); }
        }
      }
      // 표 바로 앞 문단 끝에서 Delete → 표 첫 셀과 합쳐지는 것 막기
      if (s.isCollapsed && !sc && e.inputType === 'deleteContentForward') {
        const blk = blockOf(caretEl());
        if (blk && blk.nextElementSibling && blk.nextElementSibling.tagName === 'TABLE') {
          const post = document.createRange(); post.selectNodeContents(blk); post.setStart(r.endContainer, r.endOffset);
          if (!post.toString()) { e.preventDefault(); if (!blk.textContent.trim() && !blk.querySelector('img, .fobj')) { const tb = blk.nextElementSibling; blk.remove(); placeCaret(tb.rows[0].cells[0]); markDirty(); } }
        }
      }
      return;
    }
    // 여러 셀/표에 걸친 선택
    if (/^delete/.test(e.inputType) || /^insert/.test(e.inputType)) {
      e.preventDefault();
      const cells = Array.from(ed.querySelectorAll('td, th')).filter((c) => r.intersectsNode(c) && !c.querySelector('td, th'));
      if (sc && sc === ec) return;
      if (cells.length && /^delete/.test(e.inputType)) {
        // 셀 안 부분은 내용만 비우고, 표 밖 부분은 따로 지운다
        const fullyInTables = !Array.from(ed.children).some((k) => k.tagName !== 'TABLE' && r.intersectsNode(k) && k.textContent.trim());
        if (fullyInTables) { clearCells(cells); placeCaret(cells[0]); tableChanged(); return; }
        toast('표와 글이 함께 선택되어 있습니다. 표가 깨지지 않도록 셀 내용만 지웠습니다. 표 밖 글은 따로 지워 주세요.');
        clearCells(cells); placeCaret(cells[0]); tableChanged(); return;
      }
      if (/^insert/.test(e.inputType)) { const c = sc || ec || cells[0]; if (c) { placeCaret(c, true); if (e.data) document.execCommand('insertText', false, e.data); } }
    }
  });
  function lastCellOf(tbl) { const tr = tbl.rows[tbl.rows.length - 1]; return tr.cells[tr.cells.length - 1]; }

  // 칸 너비(세로 경계선)·줄 높이(가로 경계선) 끌어서 바꾸기
  const grip = document.createElement('div'); grip.className = 'colgrip'; grip.hidden = true; $('sheet').appendChild(grip);
  const rgrip = document.createElement('div'); rgrip.className = 'rowgrip'; rgrip.hidden = true; $('sheet').appendChild(rgrip);
  let gripInfo = null, colDrag = null, rgripInfo = null, rowDrag = null;
  ed.addEventListener('mousemove', (e) => {
    if (colDrag || rowDrag || state.mode !== 'doc' || (e.buttons & 1)) return;
    const td = e.target.closest && e.target.closest('td, th');
    if (!td || !ed.contains(td)) { grip.hidden = true; rgrip.hidden = true; return; }
    const r = td.getBoundingClientRect(); const tbl = td.closest('table'); const tr = tbl.getBoundingClientRect(); const sr = $('sheet').getBoundingClientRect(); const z = zoomRatio();
    if (Math.abs(e.clientX - r.right) <= 5) {
      grip.style.left = ((r.right - sr.left) / z - 3) + 'px'; grip.style.top = ((tr.top - sr.top) / z) + 'px'; grip.style.height = (tr.height / z) + 'px';
      grip.hidden = false; gripInfo = { td, tbl }; rgrip.hidden = true; return;
    }
    grip.hidden = true;
    if (Math.abs(e.clientY - r.bottom) <= 4) {
      rgrip.style.left = ((tr.left - sr.left) / z) + 'px'; rgrip.style.width = (tr.width / z) + 'px'; rgrip.style.top = ((r.bottom - sr.top) / z - 3) + 'px';
      rgrip.hidden = false; rgripInfo = { td, tbl }; return;
    }
    rgrip.hidden = true;
  });
  grip.addEventListener('pointerdown', (e) => {
    if (!gripInfo) return; e.preventDefault();
    const { td, tbl } = gripInfo; const E = TK.edit(tbl); const X = E.rect(td); E.commit();
    colDrag = { tbl, E, c: X.c1, x: e.clientX, w: E.w[X.c1], w2: X.c1 + 1 < E.cols ? E.w[X.c1 + 1] : null, left: parseFloat(grip.style.left) };
    grip.classList.add('on'); grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', (e) => {
    if (!colDrag) return; const z = zoomRatio(); let d = (e.clientX - colDrag.x) / z;
    // Shift를 누르고 끌면 오른쪽 칸을 줄이지 않고 표 전체가 늘어남(한글과 같음)
    const keep = colDrag.w2 !== null && !e.shiftKey;
    if (keep) d = Math.max(-colDrag.w + 12, Math.min(colDrag.w2 - 12, d)); else d = Math.max(-colDrag.w + 12, d);
    const E = colDrag.E; E.w[colDrag.c] = colDrag.w + d; if (colDrag.w2 !== null) E.w[colDrag.c + 1] = keep ? colDrag.w2 - d : colDrag.w2;
    const cg = colDrag.tbl.querySelector(':scope > colgroup');
    E.w.forEach((w, i) => { cg.children[i].style.width = Math.round(w) + 'px'; });
    colDrag.tbl.style.width = Math.round(E.w.reduce((a, b) => a + Math.round(b), 0)) + 'px';
    grip.style.left = (colDrag.left + d) + 'px';
  });
  grip.addEventListener('pointerup', () => { if (!colDrag) return; colDrag = null; grip.classList.remove('on'); grip.hidden = true; tableChanged(); });
  rgrip.addEventListener('pointerdown', (e) => {
    if (!rgripInfo) return; e.preventDefault();
    const { td, tbl } = rgripInfo; const m = TK.read(tbl); const X = TK.rectOf(m, td); const z = zoomRatio();
    const tr = tbl.rows[X.r1];
    rowDrag = { tbl, r: X.r1, y: e.clientY, h: tr.getBoundingClientRect().height / z, top: parseFloat(rgrip.style.top) };
    rgrip.classList.add('on'); rgrip.setPointerCapture(e.pointerId);
  });
  rgrip.addEventListener('pointermove', (e) => {
    if (!rowDrag) return; const z = zoomRatio(); const d = (e.clientY - rowDrag.y) / z;
    setRowHeight(rowDrag.tbl, rowDrag.r, Math.max(8, rowDrag.h + d));
    const nh = rowDrag.tbl.rows[rowDrag.r].getBoundingClientRect().height / z;
    rgrip.style.top = (rowDrag.top + nh - rowDrag.h) + 'px';
  });
  rgrip.addEventListener('pointerup', () => { if (!rowDrag) return; rowDrag = null; rgrip.classList.remove('on'); rgrip.hidden = true; tableChanged(); });
  // Alt+방향키: 칸 너비·줄 높이 1mm씩 (Alt+Shift: 표 전체 너비 함께)
  function cellResizeKey(e) {
    if (!e.altKey || !e.key.startsWith('Arrow')) return false;
    const t = target(); if (!t) return false;
    e.preventDefault();
    const step = MMPX;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const d = e.key === 'ArrowRight' ? step : -step; const E = TK.edit(t.tbl); const c = t.R.c1;
      if (!e.shiftKey && c + 1 < E.cols) { const dd = Math.max(-E.w[c] + 12, Math.min(E.w[c + 1] - 12, d)); E.w[c] += dd; E.w[c + 1] -= dd; }
      else E.w[c] = Math.max(12, E.w[c] + d);
      E.commit();
    } else {
      const z = zoomRatio(); const d = e.key === 'ArrowDown' ? step : -step;
      for (let r = t.R.r0; r <= t.R.r1; r++) setRowHeight(t.tbl, r, t.tbl.rows[r].getBoundingClientRect().height / z + d);
    }
    tableChanged(); return true;
  }

  /* ---------- 그림·글상자·선 (개체) ---------- */
  $('btnImage').addEventListener('click', () => $('imgInput').click());
  $('imgInput').addEventListener('change', async (e) => { const fs = Array.from(e.target.files); e.target.value = ''; for (const f of fs) await insertImageFile(f); });
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
  const objOf = (el) => (el && el.closest ? el.closest('.fobj') || (el.tagName === 'IMG' && !el.closest('.fobj') ? el : null) : null);
  const objKind = (o) => (!o ? null : o.tagName === 'IMG' ? 'img' : o.querySelector(':scope > img') ? 'fimg' : o.dataset.kind === 'line' ? 'line' : 'box');
  function selectObj(o) {
    ed.querySelectorAll('img.img-sel').forEach((x) => x.classList.remove('img-sel'));
    state.selObj = o && ed.contains(o) ? o : null;
    updateObjBar(); drawObjBox();
  }
  function wrapValue(o) {
    const k = objKind(o);
    if (k === 'img') { const w = o.dataset.wrap; if (w === 'square') return o.style.float === 'right' ? 'square-right' : 'square-left'; if (w === 'block') return 'block-' + (o.dataset.align || 'center'); return 'inline'; }
    const w = o.dataset.wrap || 'front';
    if (w === 'square') return 'square-' + (o.dataset.align === 'right' ? 'right' : 'left');
    if (w === 'block') return 'block-' + (o.dataset.align || 'left');
    return w;
  }
  function updateObjBar() {
    const o = state.selObj; const bar = $('imageBar');
    bar.hidden = !o; if (!o) return;
    const k = objKind(o);
    $('objLabel').textContent = k === 'box' ? '글상자' : k === 'line' ? '선' : '그림';
    bar.querySelector('.img-only').style.display = k === 'img' || k === 'fimg' ? 'contents' : 'none';
    bar.querySelector('.box-only').style.display = k === 'box' || k === 'line' ? 'contents' : 'none';
    const sel = $('objWrap'); sel.querySelector('option[value="inline"]').disabled = !(k === 'img' || k === 'fimg');
    sel.value = wrapValue(o);
    const z = zoomRatio();
    const r = o.getBoundingClientRect();
    $('imgW').value = Math.round(o.tagName === 'IMG' ? o.width : r.width / z); $('imgH').value = Math.round(o.tagName === 'IMG' ? o.height : r.height / z);
    bar.querySelectorAll('[data-i="front2"],[data-i="back2"]').forEach((b) => { b.style.display = k === 'img' ? 'none' : ''; });
  }
  function drawObjBox() {
    const box = $('objBox'); const o = state.selObj;
    if (!o || !ed.contains(o) || state.mode !== 'doc') { box.hidden = true; return; }
    const z = zoomRatio(); const sr = $('sheet').getBoundingClientRect(); const r = o.getBoundingClientRect();
    box.hidden = false;
    box.style.left = ((r.left - sr.left) / z) + 'px'; box.style.top = ((r.top - sr.top) / z) + 'px';
    box.style.width = (r.width / z) + 'px'; box.style.height = (r.height / z) + 'px';
    const free = o.classList.contains('fobj') && (o.dataset.wrap === 'front' || o.dataset.wrap === 'behind');
    box.querySelector('.omove').style.display = free ? '' : 'none';
    box.querySelector('.osize').textContent = `${Math.round(r.width / z)} × ${Math.round(r.height / z)}`;
    if (o.tagName === 'IMG') o.classList.add('img-sel');
  }
  // 그림을 떠 있는 개체로 바꿈 (지금 자리 그대로)
  function toFloat(img, wrap) {
    const anchor = pToDiv(blockOf(img) || img.parentElement);
    const z = zoomRatio(); const r = img.getBoundingClientRect(); const ar = anchor.getBoundingClientRect();
    const fo = document.createElement('span'); fo.className = 'fobj'; fo.contentEditable = 'false'; fo.dataset.wrap = wrap;
    fo.style.left = Math.round((r.left - ar.left) / z) + 'px'; fo.style.top = Math.round((r.top - ar.top) / z) + 'px';
    fo.style.width = Math.round(r.width / z) + 'px'; fo.style.height = Math.round(r.height / z) + 'px';
    img.before(fo); fo.appendChild(img);
    ['width', 'height', 'data-wrap', 'data-align', 'class'].forEach((a) => img.removeAttribute(a)); img.style.cssText = '';
    return fo;
  }
  function setWrap(o, value) {
    const [wrap, align] = value.split('-');
    const k = objKind(o);
    if (k === 'img') {
      img0: {
        o.style.float = ''; o.style.display = ''; delete o.dataset.align;
        if (wrap === 'inline') { delete o.dataset.wrap; break img0; }
        if (wrap === 'square') { o.dataset.wrap = 'square'; o.style.float = align; break img0; }
        if (wrap === 'block') { o.dataset.wrap = 'block'; o.dataset.align = align; break img0; }
        return selectObj(toFloat(o, wrap));
      }
      return selectObj(o);
    }
    if (wrap === 'inline' && k === 'fimg') {
      const img = o.querySelector('img'); const z = zoomRatio(); const r = o.getBoundingClientRect();
      img.width = Math.round(r.width / z); img.height = Math.round(r.height / z); img.style.cssText = '';
      o.replaceWith(img); return selectObj(img);
    }
    if (wrap === 'front' || wrap === 'behind') {
      if (o.dataset.wrap === 'square' || o.dataset.wrap === 'block') {
        const z = zoomRatio(); const r = o.getBoundingClientRect(); const op = o.offsetParent || o.parentElement; const pr = op.getBoundingClientRect();
        o.dataset.wrap = wrap; delete o.dataset.align;
        o.style.left = Math.round((r.left - pr.left) / z) + 'px'; o.style.top = Math.round((r.top - pr.top) / z) + 'px';
      } else o.dataset.wrap = wrap;
    } else { o.dataset.wrap = wrap; o.dataset.align = align; }
    selectObj(o);
  }
  $('objWrap').addEventListener('change', (e) => { if (state.selObj) { setWrap(state.selObj, e.target.value); markDirty(); } });
  function resizeObj(w, h, keep) {
    const o = state.selObj; if (!o) return;
    const z = zoomRatio(); const r = o.getBoundingClientRect();
    const cw = o.tagName === 'IMG' ? o.width : r.width / z, ch = o.tagName === 'IMG' ? o.height : r.height / z;
    if (keep && w && !h) h = w * ch / cw; if (keep && h && !w) w = h * cw / ch;
    w = Math.max(8, Math.round(w || cw)); h = Math.max(4, Math.round(h || ch));
    if (o.tagName === 'IMG') { o.width = w; o.height = h; } else { o.style.width = w + 'px'; o.style.height = h + 'px'; }
    updateObjBar(); drawObjBox(); markDirty();
  }
  $('imgW').addEventListener('change', (e) => resizeObj(+e.target.value, 0, objKind(state.selObj) !== 'box' && objKind(state.selObj) !== 'line'));
  $('imgH').addEventListener('change', (e) => resizeObj(0, +e.target.value, objKind(state.selObj) !== 'box' && objKind(state.selObj) !== 'line'));
  function zOrder(o, front) {
    const all = Array.from(ed.querySelectorAll('.fobj')).map((f) => parseInt(f.style.zIndex, 10) || 3);
    o.style.zIndex = front ? Math.max(3, ...all) + 1 : Math.max(1, Math.min(...all) - 1);
  }
  function lineMenu(anchor, o) {
    const isLine = objKind(o) === 'line';
    const tb = o.querySelector('.tbox'); const ln = o.querySelector('line');
    const set = (w, style) => {
      if (isLine) { ln.setAttribute('stroke-width', w || 1); if (style === 'dashed') ln.setAttribute('stroke-dasharray', `${w * 3} ${w * 2}`); else ln.removeAttribute('stroke-dasharray'); }
      else if (!w) tb.style.border = 'none'; else tb.style.border = `${w}px ${style} ${DocModel.rgbToHex(getComputedStyle(tb).borderTopColor) && tb.style.borderStyle !== 'none' ? getComputedStyle(tb).borderTopColor : '#000000'}`;
      markDirty(); drawObjBox();
    };
    menu(anchor, [
      ...(isLine ? [] : [['선 없음', () => set(0)]]),
      ['얇은 실선 (1px)', () => set(1, 'solid')], ['보통 실선 (2px)', () => set(2, 'solid')], ['굵은 실선 (4px)', () => set(4, 'solid')], ['점선 (1px)', () => set(1, 'dashed')],
      ...(isLine ? [[o.dataset.arrow === '1' ? '화살표 빼기' : '끝에 화살표', () => { o.dataset.arrow = o.dataset.arrow === '1' ? '' : '1'; drawLineSvg(o); markDirty(); }]] : []),
      '-', ['선 색 바꾸기…', () => swatchPop(anchor, COLORS, (c) => { if (isLine) { ln.setAttribute('stroke', c || '#000000'); drawLineSvg(o); } else { if (!tb.style.borderStyle || tb.style.borderStyle === 'none') tb.style.border = `1px solid ${c}`; else tb.style.borderColor = c; } markDirty(); })],
    ]);
  }
  function drawLineSvg(o) {
    const ln = o.querySelector('line'); const col = ln ? ln.getAttribute('stroke') : '#000000'; const sw = ln ? +ln.getAttribute('stroke-width') : 2; const dash = ln && ln.getAttribute('stroke-dasharray');
    const w = o.offsetWidth || 200, h = o.offsetHeight || 16; const arrow = o.dataset.arrow === '1';
    o.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${h / 2}" x2="${arrow ? w - sw * 3 : w}" y2="${h / 2}" stroke="${col}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>${arrow ? `<polygon points="${w - sw * 4},${h / 2 - sw * 2} ${w},${h / 2} ${w - sw * 4},${h / 2 + sw * 2}" fill="${col}"/>` : ''}</svg>`;
  }
  document.querySelectorAll('#imageBar [data-i]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      const o = state.selObj; if (!o) return;
      const k = b.dataset.i; const textW = (state.page.w - state.page.ml - state.page.mr) * MMPX - 4;
      const img = o.tagName === 'IMG' ? o : o.querySelector('img');
      if (k === '25' || k === '50') resizeObj(textW * (+k) / 100, 0, true);
      else if (k === '100') resizeObj(textW, 0, true);
      else if (k === 'orig' && img) resizeObj(Math.min(img.naturalWidth, textW), 0, true);
      else if (k === 'replace' && img) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; img.src = await fileToDataUrl(f); markDirty(); setTimeout(drawObjBox, 50); }; inp.click(); }
      else if (k === 'del') { o.remove(); selectObj(null); markDirty(); }
      else if (k === 'front2') { zOrder(o, true); markDirty(); }
      else if (k === 'back2') { zOrder(o, false); markDirty(); }
      else if (k === 'boxFill') { const tb = o.querySelector('.tbox'); if (tb) swatchPop(e.currentTarget, FILLS, (c) => { tb.style.backgroundColor = c || ''; markDirty(); }, { none: true }); }
      else if (k === 'boxLine') lineMenu(e.currentTarget, o);
      else if (k === 'boxShape') {
        const tb = o.querySelector('.tbox'); if (!tb) return;
        menu(e.currentTarget, [['사각형', () => { delete o.dataset.kind; tb.style.borderRadius = '0'; markDirty(); }], ['둥근 사각형', () => { delete o.dataset.kind; tb.style.borderRadius = '12px'; markDirty(); }], ['원·타원', () => { o.dataset.kind = 'ellipse'; tb.style.borderRadius = '50%'; tb.style.justifyContent = 'center'; tb.style.textAlign = 'center'; markDirty(); }]]);
      }
    });
  });
  // 글상자·도형 넣기
  function insertObject(kind) {
    restoreSel();
    let anchor = blockOf(caretEl());
    if (!anchor || anchor.closest('.tbox')) anchor = ed.querySelector(':scope > p, :scope > div:not(.pagebreak)') || ed.firstElementChild;
    anchor = pToDiv(anchor);
    const cw = (state.page.w - state.page.ml - state.page.mr) * MMPX;
    const fo = document.createElement('span'); fo.className = 'fobj'; fo.contentEditable = 'false'; fo.dataset.wrap = 'front';
    fo.style.left = Math.round(cw * 0.2) + 'px'; fo.style.top = '0px';
    if (kind === 'line' || kind === 'arrow') {
      fo.dataset.kind = 'line'; if (kind === 'arrow') fo.dataset.arrow = '1';
      fo.style.width = Math.round(cw * 0.5) + 'px'; fo.style.height = '16px';
      fo.innerHTML = '<svg><line stroke="#000000" stroke-width="2"/></svg>';
      anchor.prepend(fo); drawLineSvg(fo);
    } else {
      fo.style.width = Math.round(cw * 0.55) + 'px'; fo.style.height = Math.round(30 * MMPX) + 'px';
      const radius = kind === 'round' ? '12px' : kind === 'ellipse' ? '50%' : '0';
      if (kind === 'ellipse') fo.dataset.kind = 'ellipse';
      const tb = document.createElement('div'); tb.className = 'tbox'; tb.contentEditable = 'true';
      tb.style.cssText = `padding:8px;border:1px solid #000000;border-radius:${radius};${kind === 'ellipse' ? 'justify-content:center;text-align:center;' : ''}`;
      tb.innerHTML = '<p>글상자</p>';
      fo.appendChild(tb); anchor.prepend(fo);
      setTimeout(() => { const r = document.createRange(); r.selectNodeContents(tb.querySelector('p')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); tb.focus(); state.savedRange = r.cloneRange(); }, 0);
    }
    selectObj(fo); markDirty();
  }
  $('btnObj').addEventListener('click', (e) => menu(e.currentTarget, [
    ['글상자', () => insertObject('box'), '글 위에 자유롭게 놓는 상자'], ['둥근 글상자', () => insertObject('round')], ['원 글상자', () => insertObject('ellipse')],
    '-', ['선', () => insertObject('line')], ['화살표', () => insertObject('arrow')],
  ]));
  // 끌어서 옮기기·크기 바꾸기
  let objDrag = null;
  $('objBox').addEventListener('pointerdown', (e) => {
    const h = e.target.closest('[data-h]'); if (!h || !state.selObj) return;
    e.preventDefault(); e.stopPropagation(); startObjDrag(e, h.dataset.h);
  });
  function startObjDrag(e, mode) {
    const o = state.selObj; const z = zoomRatio(); const r = o.getBoundingClientRect();
    objDrag = { mode, o, x: e.clientX, y: e.clientY, z, w: r.width / z, h: r.height / z, l: parseFloat(o.style.left) || 0, t: parseFloat(o.style.top) || 0, moved: false };
    document.addEventListener('pointermove', onObjMove); document.addEventListener('pointerup', onObjUp, { once: true });
  }
  function onObjMove(e) {
    const d = objDrag; if (!d) return;
    const dx = (e.clientX - d.x) / d.z, dy = (e.clientY - d.y) / d.z;
    if (!d.moved && Math.hypot(dx, dy) < 2) return; d.moved = true;
    const o = d.o;
    if (d.mode === 'move') { o.style.left = Math.round(d.l + dx) + 'px'; o.style.top = Math.round(d.t + dy) + 'px'; drawObjBox(); return; }
    const m = d.mode; let w = d.w, h = d.h;
    if (m.includes('e')) w = d.w + dx; if (m.includes('w')) w = d.w - dx;
    if (m.includes('s')) h = d.h + dy; if (m.includes('n')) h = d.h - dy;
    const k = objKind(o);
    if (m.length === 2 && (k === 'img' || k === 'fimg') && !e.shiftKey) { const s = Math.max(w / d.w, h / d.h); w = d.w * s; h = d.h * s; }
    w = Math.max(8, w); h = Math.max(k === 'line' ? 6 : 8, h);
    if (o.tagName === 'IMG') { o.width = Math.round(w); o.height = Math.round(h); }
    else {
      o.style.width = Math.round(w) + 'px'; o.style.height = Math.round(h) + 'px';
      if (o.dataset.wrap === 'front' || o.dataset.wrap === 'behind') { if (m.includes('w')) o.style.left = Math.round(d.l + d.w - w) + 'px'; if (m.includes('n')) o.style.top = Math.round(d.t + d.h - h) + 'px'; }
      if (k === 'line') drawLineSvg(o);
    }
    drawObjBox();
  }
  function onObjUp() { document.removeEventListener('pointermove', onObjMove); const d = objDrag; objDrag = null; if (d && d.moved) { updateObjBar(); markDirty(); } }
  ed.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'doc') return;
    const o = objOf(e.target);
    if (!o) { if (state.selObj && !e.target.closest('.tbox')) selectObj(null); return; }
    const inText = e.target.closest('.tbox');
    if (inText && o.classList.contains('fobj')) { if (state.selObj !== o) selectObj(o); return; }
    selectObj(o);
    if (o.tagName === 'IMG') { const r = document.createRange(); r.selectNode(o); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    if (o.classList.contains('fobj') && (o.dataset.wrap === 'front' || o.dataset.wrap === 'behind')) { e.preventDefault(); startObjDrag(e, 'move'); }
  });
  $('workspace').addEventListener('scroll', () => { /* 같은 좌표계라 다시 그릴 필요 없음 */ });

  /* ---------- 하이퍼링크 ---------- */
  async function linkDialog() {
    restoreSel();
    const s = getSelection(); const cur = caretEl() && caretEl().closest('a[href]');
    const f = document.createElement('div'); f.className = 'form-grid';
    f.innerHTML = '<label class="field full">연결할 주소<input id="lkUrl" type="url" placeholder="https://"></label>' + (s.isCollapsed && !cur ? '<label class="field full">보일 글자<input id="lkText" type="text"></label>' : '');
    if (cur) f.querySelector('#lkUrl').value = cur.getAttribute('href');
    const range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    const btns = [{ label: '취소', value: null }];
    if (cur) btns.push({ label: '링크 지우기', value: 'remove', danger: true });
    btns.push({ label: '넣기', value: 'ok', primary: true });
    const v = await modal('하이퍼링크', f, btns);
    if (!v) return;
    if (v === 'remove') { const r = document.createRange(); r.selectNodeContents(cur); s.removeAllRanges(); s.addRange(r); document.execCommand('unlink'); markDirty(); return; }
    let url = f.querySelector('#lkUrl').value.trim(); if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) url = /@/.test(url) && !/\//.test(url) ? 'mailto:' + url : 'https://' + url;
    ed.focus(); if (range) { s.removeAllRanges(); s.addRange(range); }
    if (cur) { cur.setAttribute('href', url); }
    else if (s.isCollapsed) { const t = (f.querySelector('#lkText') && f.querySelector('#lkText').value.trim()) || url; document.execCommand('insertHTML', false, `<a href="${escHtml(url)}">${escHtml(t)}</a>&nbsp;`); }
    else document.execCommand('createLink', false, url);
    markDirty();
  }
  $('btnLink').addEventListener('click', linkDialog);
  ed.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const x = document.createElement('a'); x.href = a.href; x.target = '_blank'; x.rel = 'noopener'; x.click(); }
  });

  /* ---------- 각주 ---------- */
  async function footnoteDialog(existing) {
    const f = document.createElement('div'); f.className = 'form-grid';
    f.innerHTML = '<label class="field full">각주 내용<textarea id="fnText" rows="3"></textarea></label>';
    if (existing) f.querySelector('#fnText').value = existing.getAttribute('data-note') || '';
    const btns = [{ label: '취소', value: null }];
    if (existing) btns.push({ label: '각주 지우기', value: 'remove', danger: true });
    btns.push({ label: existing ? '고치기' : '넣기', value: 'ok', primary: true });
    const v = await modal(existing ? '각주 고치기' : '각주 넣기', f, btns);
    if (!v) return;
    if (v === 'remove') { existing.remove(); markDirty(); renderFnList(); return; }
    const t = f.querySelector('#fnText').value.trim(); if (!t) return;
    if (existing) existing.setAttribute('data-note', t);
    else { restoreSel(); document.execCommand('insertHTML', false, `<span class="fn" contenteditable="false" data-note="${escHtml(t)}"></span>`); }
    markDirty(); renderFnList();
  }
  $('btnFootnote').addEventListener('click', () => footnoteDialog(null));
  ed.addEventListener('click', (e) => { const fn = e.target.closest('.fn'); if (fn) { e.preventDefault(); footnoteDialog(fn); } });
  function renderFnList() {
    const box = $('fnList'); const fns = Array.from(ed.querySelectorAll('.fn'));
    box.hidden = !fns.length; if (!fns.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="fn-h">각주</div>';
    fns.forEach((fn, i) => { const b = document.createElement('button'); b.textContent = `${i + 1}) ${fn.getAttribute('data-note') || ''}`; b.onclick = () => footnoteDialog(fn); box.appendChild(b); });
  }

  /* ---------- 상황 막대 ---------- */
  function updateContext() {
    const el = caretEl();
    const inTable = !!(el && el.closest('td, th'));
    $('tableBar').hidden = !inTable;
    if (state.blk && (!inTable || el.closest('table') !== state.blk.tbl)) state.blk = null;
    paintBlock();
    if (state.selObj && !ed.contains(state.selObj)) selectObj(null);
    updatePageNo();
  }

  /* ---------- 입력 처리 ---------- */
  ed.addEventListener('input', () => { fixFontSizes(); markDirty(); drawObjBox(); });
  ed.addEventListener('keydown', (e) => {
    if (blockKeys(e)) return;
    if (cellResizeKey(e)) return;
    if (e.key === 'Tab') {
      const td = curCell();
      e.preventDefault();
      if (td) {
        // 한글처럼: Tab 다음 셀, Shift+Tab 앞 셀, 마지막 셀에서 Tab → 아래에 줄 추가
        const tbl = td.closest('table'); const m = TableKit.read(tbl); const order = [];
        m.forEach((row) => row.forEach((c) => { if (!order.includes(c)) order.push(c); }));
        const i = order.indexOf(td); const next = order[i + (e.shiftKey ? -1 : 1)];
        if (next) { placeCaret(next, true); const r = document.createRange(); r.selectNodeContents(next); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); }
        else if (!e.shiftKey) T.insRow(true);
        paintBlock();
      } else if (!e.shiftKey) document.execCommand('insertHTML', false, '<span class="tab">\t</span>&#8203;');
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (curCell()) T.insRow(true); else insertPageBreak(); return; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && state.selObj && !(e.target.closest && e.target.closest('.tbox'))) { e.preventDefault(); state.selObj.remove(); selectObj(null); markDirty(); return; }
    if (state.selObj && state.selObj.classList.contains('fobj') && e.key.startsWith('Arrow') && !(e.target.closest && e.target.closest('.tbox'))) {
      e.preventDefault(); const d = e.shiftKey ? 10 : 1; const o = state.selObj;
      if (e.key === 'ArrowLeft') o.style.left = (parseFloat(o.style.left) || 0) - d + 'px'; if (e.key === 'ArrowRight') o.style.left = (parseFloat(o.style.left) || 0) + d + 'px';
      if (e.key === 'ArrowUp') o.style.top = (parseFloat(o.style.top) || 0) - d + 'px'; if (e.key === 'ArrowDown') o.style.top = (parseFloat(o.style.top) || 0) + d + 'px';
      drawObjBox(); markDirty(); return;
    }
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
    if (curCell() || state.blk) {
      const g = TableKit.parseGrid(html, cd.getData('text/plain'));
      if (g && (g.length > 1 || (g[0] && g[0].length > 1))) { e.preventDefault(); pasteGridIntoTable(g); return; }
    }
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
      const lines = text.replace(/\r\n?/g, '\n').split('\n');
      if (lines.length === 1) document.execCommand('insertText', false, text);
      else document.execCommand('insertHTML', false, lines.map((l) => `<p>${escHtml(l).replace(/\t/g, '<span class="tab">\t</span>') || '<br>'}</p>`).join(''));
      markDirty();
    }
  });

  /* ---------- 찾기·바꾸기 ---------- */
  let finds = [], findIdx = -1;
  function collectMatches(q) {
    finds = []; if (!q) return;
    const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { const t = n.nodeValue; let i = t.indexOf(q); while (i >= 0) { finds.push({ node: n, i }); i = t.indexOf(q, i + q.length); } }
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
    for (let k = finds.length - 1; k >= 0; k--) { const m = finds[k]; m.node.nodeValue = m.node.nodeValue.slice(0, m.i) + rep + m.node.nodeValue.slice(m.i + q.length); }
    finds = []; $('findCount').textContent = n ? `${n}곳 바꿈` : '없음';
    if (n) markDirty();
  });

  /* ---------- 편집 용지·머리말 ---------- */
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
    q('pgPaper').value = PAPERS[p.paper] ? p.paper : '사용자';
    q('pgW').value = +Math.min(p.w, p.h).toFixed(1); q('pgH').value = +Math.max(p.w, p.h).toFixed(1);
    f.querySelector(`input[name=pgO][value=${p.landscape ? 'l' : 'p'}]`).checked = true;
    [['pgMt', 'mt'], ['pgMb', 'mb'], ['pgMl', 'ml'], ['pgMr', 'mr'], ['pgHd', 'hd'], ['pgFt', 'ft']].forEach(([id, k]) => { q(id).value = +p[k].toFixed(1); });
    q('pgPaper').addEventListener('change', () => { const v = PAPERS[q('pgPaper').value]; if (v) { q('pgW').value = v[0]; q('pgH').value = v[1]; } });
    const ok = await modal('편집 용지', f, [{ label: '취소', value: false }, { label: '적용', value: true, primary: true }]);
    if (!ok) return;
    const w = +q('pgW').value || 210, h = +q('pgH').value || 297; const land = f.querySelector('input[name=pgO]:checked').value === 'l';
    Object.assign(state.page, { paper: q('pgPaper').value, landscape: land, w: land ? Math.max(w, h) : Math.min(w, h), h: land ? Math.min(w, h) : Math.max(w, h),
      mt: +q('pgMt').value, mb: +q('pgMb').value, ml: +q('pgMl').value, mr: +q('pgMr').value, hd: +q('pgHd').value, ft: +q('pgFt').value });
    applyPage(); markDirty();
  });
  $('stMargin').addEventListener('click', () => $('btnPage').click());
  $('btnHF').addEventListener('click', async () => {
    const hf = state.hf || {};
    const f = document.createElement('div'); f.className = 'form-grid';
    const al = '<option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option>';
    f.innerHTML = `
      <label class="field full">머리말 (쪽 위쪽에 반복)<input id="hfH" type="text" placeholder="예: 2026년 사업 계획서"></label>
      <label class="field">머리말 정렬<select id="hfHa">${al}</select></label><span></span>
      <label class="field full">꼬리말 (쪽 아래쪽에 반복)<input id="hfF" type="text" placeholder="예: 아르떼조명 고객지원팀"></label>
      <label class="field">꼬리말 정렬<select id="hfFa">${al}</select></label><span></span>
      <label class="field">쪽 번호 위치<select id="hfP">${Object.entries(PNUM_POS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="field">쪽 번호 모양<select id="hfPf">${Object.entries(PNUM_FMT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <p class="field full">편집 화면, 저장한 한글 파일, PDF 모두 쪽마다 들어갑니다.</p>`;
    const q = (id) => f.querySelector('#' + id);
    q('hfH').value = (hf.header && hf.header.text) || ''; q('hfHa').value = (hf.header && hf.header.align) || 'center';
    q('hfF').value = (hf.footer && hf.footer.text) || ''; q('hfFa').value = (hf.footer && hf.footer.align) || 'center';
    q('hfP').value = (hf.pnum && hf.pnum.pos) || 'none'; q('hfPf').value = (hf.pnum && hf.pnum.fmt) || 'n';
    const ok = await modal('머리말·꼬리말·쪽 번호', f, [{ label: '취소', value: false }, { label: '설정', value: true, primary: true }]);
    if (!ok) return;
    state.hf = {
      header: q('hfH').value.trim() ? { text: q('hfH').value.trim(), align: q('hfHa').value } : null,
      footer: q('hfF').value.trim() ? { text: q('hfF').value.trim(), align: q('hfFa').value } : null,
      pnum: q('hfP').value !== 'none' ? { pos: q('hfP').value, fmt: q('hfPf').value } : null,
    };
    if (!state.hf.header && !state.hf.footer && !state.hf.pnum) state.hf = null;
    layout(); markDirty();
  });
  function paperName(w, h) {
    const a = Math.min(w, h), b = Math.max(w, h);
    for (const k in PAPERS) if (Math.abs(PAPERS[k][0] - a) < 1.5 && Math.abs(PAPERS[k][1] - b) < 1.5) return k;
    return '사용자';
  }
  function setPageFrom(pg) {
    if (!pg || !(pg.w > 20 && pg.h > 20)) { Object.assign(state.page, DEFAULT_PAGE); return; }
    const w = Math.min(pg.w, pg.h), h = Math.max(pg.w, pg.h);
    Object.assign(state.page, { paper: paperName(w, h), landscape: !!pg.landscape, w: pg.landscape ? h : w, h: pg.landscape ? w : h, mt: pg.mt, mb: pg.mb, ml: pg.ml, mr: pg.mr, hd: pg.hd, ft: pg.ft });
  }

  /* ---------- 열기 ---------- */
  $('btnOpen').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
  async function confirmDiscard() {
    if (!state.dirty) return true;
    const v = await modal('저장하지 않은 변경 사항이 있습니다', '지금 내용을 저장하지 않고 닫으면 고친 내용이 사라집니다.', [
      { label: '취소', value: null }, { label: '저장하지 않고 계속', value: 'go', danger: true }, { label: 'HWPX로 저장 후 계속', value: 'save', primary: true }]);
    if (v === 'save') { await saveHwpx(); return true; }
    return v === 'go';
  }
  function decodeText(buf) {
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
    if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('euc-kr').decode(u8); }
  }
  async function openDesign(project, name, label) {
    Design.open(project);
    $('docName').value = name; setFormat(label, '디자인으로 열었습니다');
    await switchMode('design', { silent: true });
    setDirty(false); clearDraft();
  }
  async function openFile(file) {
    if (!(await confirmDiscard())) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const name = file.name.replace(/\.[^.]+$/, '');
    busy('여는 중…');
    try {
      const buf = await file.arrayBuffer();
      state.source = { name: file.name, ext, bytes: new Uint8Array(buf) };
      $('stPrecise').hidden = true;
      if (ext === 'pptx') { busy('프레젠테이션을 디자인으로 바꾸는 중…'); const pj = await LayerIO.fromPptx(buf); await openDesign(pj, name, 'PPTX'); toast(`"${file.name}"을(를) 디자인으로 열었습니다. (${pj.pages.length}쪽)`); return; }
      if (ext === 'hpd' || ext === 'json') { const pj = LayerIO.fromHpd(decodeText(buf)); await openDesign(pj, name, '디자인 원본'); toast(`"${file.name}"을(를) 열었습니다.`); return; }
      if (file.type.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext)) {
        const src = await fileToDataUrl(file);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('그림을 읽을 수 없습니다.')); i.src = src; });
        const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
        const W = Math.max(200, Math.round(img.naturalWidth * k)), H = Math.max(200, Math.round(img.naturalHeight * k));
        const pj = Design.newProject(W, H);
        pj.assets.img1 = src; pj.pages[0].layers.push(Design.imageLayer('asset:img1', W, H, { x: 0, y: 0, fit: 'cover', name: '그림' }));
        await openDesign(pj, name, '그림'); toast('그림 위에 글과 도형을 얹어 꾸밀 수 있습니다.'); return;
      }
      let res;
      if (ext === 'hwp') { res = HWPReader.read(buf); setFormat('HWP', '빠른 변환으로 열었습니다'); $('stPrecise').hidden = false; }
      else if (ext === 'hwpx') { res = await HWPXReader.read(buf); setFormat('HWPX', ''); }
      else if (ext === 'docx') { busy('Word 문서 변환 준비 중…'); await Loader.need('mammoth'); const r = await mammoth.convertToHtml({ arrayBuffer: buf }); res = { html: r.value }; setFormat('DOCX', 'Word 문서는 글꼴·색 일부가 빠질 수 있습니다'); }
      else if (ext === 'html' || ext === 'htm') {
        const t = decodeText(buf);
        const pj = LayerIO.fromHtml(t);
        if (pj) { await openDesign(pj, name, 'HTML 슬라이드쇼'); toast('HTML 슬라이드쇼를 다시 편집할 수 있게 열었습니다.'); return; }
        const d = new DOMParser().parseFromString(t, 'text/html'); res = { html: d.body ? d.body.innerHTML : t }; setFormat('HTML', '');
      } else if (ext === 'md' || ext === 'markdown') { res = { html: mdToHtml(decodeText(buf)) }; setFormat('Markdown', ''); }
      else if (ext === 'txt') { res = { html: decodeText(buf).replace(/\r\n?/g, '\n').split('\n').map((l) => `<p>${escHtml(l).replace(/\t/g, '<span class="tab">\t</span>') || '<br>'}</p>`).join('') }; setFormat('TXT', ''); }
      else throw new Error('지원하지 않는 파일 형식입니다 (.' + ext + '). HWP, HWPX, DOCX, PPTX, HTML, TXT, MD, 그림 파일을 열 수 있습니다.');
      setPageFrom(res.page);
      state.hf = res.hf || null;
      $('docName').value = name;
      await switchMode('doc', { silent: true });
      applyPage();
      setContent(res.html);
      clearDraft();
      $('stSaved').textContent = '';
      toast(`"${file.name}"을(를) 열었습니다.`);
    } catch (err) {
      console.error(err);
      if (ext === 'hwp' && !/암호|배포용|97/.test(err.message || '')) toast('빠른 변환에 실패했습니다: ' + (err.message || err), { err: true, action: { label: '정밀 변환으로 열기', run: () => preciseOpen() } });
      else toast(err.message || String(err), { err: true });
    } finally { busy(false); }
  }
  async function preciseOpen() {
    const src = state.source; if (!src || src.ext !== 'hwp') return;
    try {
      const out = await Engine.hwpToHwpx(src.bytes, busy);
      busy('문서 표시 중…');
      const res = await HWPXReader.read(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
      setPageFrom(res.page); state.hf = res.hf || null; applyPage();
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
    const inline = (s) => escHtml(s).replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/`([^`]+)`/g, '<span style="font-family:monospace">$1</span>').replace(/\\([*_`\[\]\\|#])/g, '$1');
    const lines = md.replace(/\r\n?/g, '\n').split('\n'); let out = ''; let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const rows = [l]; i += 2;
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

  /* ---------- 저장·내보내기 ---------- */
  async function withPlainZoom(fn) {
    const z = $('zoomWrap').style.zoom; $('zoomWrap').style.zoom = 1;
    ed.querySelectorAll('.cell-sel, .cell-blk').forEach((x) => x.classList.remove('cell-sel', 'cell-blk')); ed.classList.remove('blocksel');
    const sel = state.selObj; $('objBox').hidden = true; ed.querySelectorAll('img.img-sel').forEach((x) => x.classList.remove('img-sel'));
    try { return await fn(); } finally { $('zoomWrap').style.zoom = z; if (sel) selectObj(sel); updateContext(); }
  }
  const meta = () => ({ title: $('docName').value.trim(), author: '' });
  function docBlocks() {
    const P = Pager.layout(ed, state.page);
    const paperPos = (el) => {
      const r = el.getBoundingClientRect(); const op = el.offsetParent && ed.contains(el.offsetParent) ? el.offsetParent : el.parentElement;
      const ar = op.getBoundingClientRect();
      const x = (r.left - P.er.left) / P.z, y = (r.top - P.er.top) / P.z, ay = (ar.top - P.er.top) / P.z;
      const p = P.toPaper(x, y, ay); return { x: p.x, y: p.y };
    };
    return DocModel.extract(ed, { paperPos });
  }
  async function buildDocHwpx() { return withPlainZoom(async () => HWPXWriter.build(docBlocks(), state.page, meta(), { hf: state.hf })); }
  async function buildHwpx() { return state.mode === 'design' ? LayerIO.toHwpx(Design.project, meta()) : buildDocHwpx(); }
  async function saveHwpx() {
    busy('HWPX 파일 만드는 중…');
    try { download(await buildHwpx(), baseName() + '.hwpx', 'application/hwp+zip'); afterSave('HWPX'); }
    catch (err) { console.error(err); toast('HWPX 저장에 실패했습니다: ' + (err.message || err), { err: true }); }
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
  // 문서 → 디자인 프로젝트 (슬라이드쇼·PPTX용)
  async function docProject(transition) {
    const pj = await withPlainZoom(async () => LayerIO.fromDoc(ed, state.page, state.hf));
    if (transition) pj.pages.forEach((p) => { p.transition = { type: 'fade', dur: 0.5 }; });
    return pj;
  }
  async function designDocBlocks(project) {
    const r = await LayerIO.toDocHtml(project, 'flow');
    const holder = document.createElement('div'); holder.className = 'page'; holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${r.page.w}mm;padding:0 ${r.page.mr}mm 0 ${r.page.ml}mm;`;
    holder.appendChild(sanitize(r.html, true)); document.body.appendChild(holder);
    try { return { blocks: DocModel.extract(holder), page: r.page }; } finally { holder.remove(); }
  }
  async function exportAs(kind) {
    const design = state.mode === 'design';
    try {
      if (kind === 'hwp') return saveHwp();
      if (kind === 'hwpx') return saveHwpx();
      if (kind === 'print') { window.print(); return; }
      const label = { docx: 'Word 문서', pdf: 'PDF', png: '그림', jpg: '그림', html: '웹페이지', md: '마크다운', txt: '텍스트', pptx: 'PowerPoint', show: 'HTML 슬라이드쇼', hpd: '디자인 원본', redesign: '디자인' }[kind];
      busy(label + ' 만드는 중…');
      const bn = baseName();
      if (kind === 'redesign') {
        const pj = await docProject(false);
        Design.open(pj); await switchMode('design', { silent: true }); toast('지금 문서 내용으로 디자인을 다시 만들었습니다.'); return;
      }
      if (design || kind === 'pptx' || kind === 'show') {
        const pj = design ? Design.project : await docProject(true);
        if (kind === 'pptx') download(await LayerIO.toPptx(pj, meta()), bn + '.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        else if (kind === 'show') download(LayerIO.toHtml(pj, $('docName').value), bn + '_슬라이드쇼.html', 'text/html;charset=utf-8');
        else if (kind === 'hpd') download(LayerIO.toHpd(pj), bn + '.hpd', 'application/json');
        else if (kind === 'pdf') download(await LayerIO.toPdf(pj), bn + '.pdf', 'application/pdf');
        else if (kind === 'png' || kind === 'jpg') { const r = await LayerIO.toImages(pj, kind); if (r.single) download(r.single, `${bn}.${kind}`, kind === 'jpg' ? 'image/jpeg' : 'image/png'); else download(r.zip, `${bn}_쪽별그림.zip`, 'application/zip'); }
        else if (kind === 'docx') { const r = await designDocBlocks(pj); download(await DOCXWriter.build(r.blocks, r.page, meta()), bn + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); }
        else if (kind === 'md' || kind === 'txt') { const r = await designDocBlocks(pj); download(kind === 'md' ? TextExport.md(r.blocks) : '﻿' + TextExport.txt(r.blocks), `${bn}.${kind}`, `text/${kind === 'md' ? 'markdown' : 'plain'};charset=utf-8`); }
        else if (kind === 'html') download(LayerIO.toHtml(pj, $('docName').value), bn + '.html', 'text/html;charset=utf-8');
      } else {
        await withPlainZoom(async () => {
          if (kind === 'docx') download(await DOCXWriter.build(docBlocks(), state.page, meta(), { hf: state.hf }), bn + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          else if (kind === 'pdf') download(await PageRender.pdf(ed, state.page, { hf: state.hf, fnList: $('fnList') }), bn + '.pdf', 'application/pdf');
          else if (kind === 'png' || kind === 'jpg') { const r = await PageRender.png(ed, state.page, { hf: state.hf, fnList: $('fnList'), type: kind }); if (r.single) download(r.single, `${bn}.${kind}`, kind === 'jpg' ? 'image/jpeg' : 'image/png'); else download(r.zip, `${bn}_쪽별그림.zip`, 'application/zip'); }
          else if (kind === 'html') download(standaloneHtml(ed, state.page, $('docName').value, state.hf), bn + '.html', 'text/html;charset=utf-8');
          else if (kind === 'md') download(TextExport.md(docBlocks()), bn + '.md', 'text/markdown;charset=utf-8');
          else if (kind === 'txt') download('﻿' + TextExport.txt(docBlocks()), bn + '.txt', 'text/plain;charset=utf-8');
        });
      }
      toast(`${label} 파일을 저장했습니다.`);
    } catch (err) { console.error(err); toast('내보내기에 실패했습니다: ' + (err.message || err), { err: true }); }
    finally { busy(false); }
  }
  $('btnSave').addEventListener('click', saveHwpx);
  $('btnExport').addEventListener('click', (e) => openPop(e.currentTarget, (p) => {
    p.setAttribute('role', 'menu');
    const design = state.mode === 'design';
    const items = [
      ['head', '한글'],
      ['hwpx', 'HWPX 문서', design ? '쪽마다 글상자·그림·도형이 놓인 한글 문서' : '한글 2014 이상 · 권장', '.hwpx'],
      ['hwp', 'HWP 문서', '변환 엔진 사용 · 처음 한 번 내려받기', '.hwp'],
      ['sep'], ['head', '발표·디자인'],
      ['pptx', 'PowerPoint', design ? '전환·등장 효과 포함' : '문서를 쪽마다 슬라이드로', '.pptx'],
      ['show', 'HTML 슬라이드쇼', '모션 포함 · 브라우저에서 재생 · 다시 열어 편집', '.html'],
      ...(design ? [['hpd', '디자인 원본', '레이어·모션 그대로 다시 열기', '.hpd']] : [['redesign', '디자인으로 다시 만들기', '지금 문서 내용으로 레이어 새로 만들기', '']]),
      ['sep'], ['head', '다른 프로그램'],
      ['docx', 'Word 문서', design ? '글과 그림을 순서대로' : 'MS Word · 한글 · 구글 문서', '.docx'],
      ['pdf', 'PDF', '쪽 모양 그대로 · 보내기용', '.pdf'],
      ['png', 'PNG 그림', '쪽마다 한 장', '.png'], ['jpg', 'JPG 그림', '용량 작게', '.jpg'],
      ...(design ? [] : [['html', '웹페이지', '', '.html']]),
      ['md', '마크다운', '노션·깃허브', '.md'], ['txt', '텍스트', '글자만', '.txt'],
      ...(design ? [] : [['sep'], ['print', '인쇄', '인쇄 창에서 PDF로 저장도 가능 (글자 선택되는 PDF)', 'Ctrl+P']]),
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

  /* ---------- 문서 ↔ 디자인 ---------- */
  function setModeUI(m) {
    $('modeDoc').classList.toggle('on', m === 'doc'); $('modeDoc').setAttribute('aria-selected', m === 'doc');
    $('modeDesign').classList.toggle('on', m === 'design'); $('modeDesign').setAttribute('aria-selected', m === 'design');
    $('btnSave').title = m === 'design' ? 'HWPX로 저장 (Ctrl+S) — 쪽마다 글상자·그림·도형이 놓인 한글 문서' : 'HWPX로 저장 (Ctrl+S) — 한글 2014 이상에서 바로 열림';
  }
  async function switchMode(m, opts = {}) {
    if (m === state.mode && !opts.force) return;
    if (m === 'design') {
      if (!Design.hasProject()) {
        const hasDoc = (ed.innerText || '').trim().length > 0 || ed.querySelector('img, table, .fobj');
        let v = hasDoc ? await choice('디자인 편집으로 바꿉니다', [
          { value: 'convert', title: '지금 문서를 디자인으로 바꾸기', desc: '쪽마다 글 묶음·표·그림이 레이어가 됩니다. 문서는 그대로 남습니다.' },
          { value: 'blank', title: '빈 프레젠테이션 만들기 (16:9)', desc: '표지 틀이 들어간 새 디자인에서 시작합니다.' },
        ], '캔바·미리캔버스처럼 글·그림·도형을 자유롭게 놓고, 모션과 슬라이드쇼를 붙입니다.') : 'blank';
        if (!v) return;
        if (v === 'convert') { busy('디자인으로 바꾸는 중…'); try { Design.open(await docProject(false)); } finally { busy(false); } }
        else { const pj = Design.newProject(1280, 720); Design.open(pj); Design.addTemplate('cover'); }
      }
      selectObj(null); closePop();
      $('docMode').hidden = true; $('design').hidden = false; state.mode = 'design'; Design.show();
    } else {
      Design.hide(); $('design').hidden = true; $('docMode').hidden = false; state.mode = 'doc';
      requestAnimationFrame(() => { layout(); drawObjBox(); });
    }
    setModeUI(m); autosaveSoon();
  }
  $('modeDoc').addEventListener('click', () => switchMode('doc'));
  $('modeDesign').addEventListener('click', () => switchMode('design'));
  Design.onExitToDoc = async () => {
    const v = await choice('디자인을 한글 문서로 보내기', [
      { value: 'layout', title: '배치 그대로', desc: '글상자·그림·도형을 같은 자리에 놓은 문서로 바꿉니다. 쪽 하나가 한 쪽이 됩니다.' },
      { value: 'flow', title: '글만 차례대로', desc: '위에서 아래 순서로 글과 그림을 이어 붙인 보통 문서로 바꿉니다.' },
    ], '지금 문서 편집 화면의 내용은 디자인 내용으로 바뀝니다.');
    if (!v) return;
    busy('문서로 바꾸는 중…');
    try {
      const r = await LayerIO.toDocHtml(Design.project, v);
      setPageFrom(r.page); state.hf = null;
      await switchMode('doc', { silent: true });
      applyPage(); setContent(r.html, { keepDirty: true }); setDirty(true);
      setFormat('디자인에서 바꿈', v === 'layout' ? '글상자로 배치된 문서' : '');
      toast('디자인을 문서로 바꿨습니다. HWPX로 저장하면 한글에서 열 수 있습니다.');
    } catch (err) { console.error(err); toast('바꾸지 못했습니다: ' + (err.message || err), { err: true }); }
    finally { busy(false); }
  };
  Design.onChange = () => { setDirty(true); autosaveSoon(); };
  Design.toast = (m, err) => toast(m, { err });
  $('btnDocShow').addEventListener('click', async () => {
    busy('슬라이드쇼 준비 중…');
    let pj; try { pj = await docProject(true); } catch (err) { busy(false); toast('슬라이드쇼를 만들지 못했습니다: ' + err.message, { err: true }); return; }
    busy(false);
    Motion.Slideshow(pj, {}).start(0, true);
  });

  /* ---------- 새 문서 ---------- */
  $('btnNew').addEventListener('click', async () => {
    if (!(await confirmDiscard())) return;
    const v = await choice('무엇을 새로 만들까요?', [
      { value: 'doc', title: '빈 한글 문서 (A4)', desc: '글을 이어 쓰는 문서 편집' },
      { value: 'p169', title: '프레젠테이션 16:9', desc: '디자인 편집 · 슬라이드쇼' },
      { value: 'sq', title: '카드뉴스 1:1', desc: '디자인 편집 · 1080×1080' },
      { value: 'c45', title: '카드뉴스 4:5', desc: '디자인 편집 · 1080×1350' },
      { value: 'a4p', title: 'A4 포스터·전단', desc: '디자인 편집 · 인쇄용' },
    ]);
    if (!v) return;
    state.source = null; $('stPrecise').hidden = true; clearDraft(); $('stSaved').textContent = '';
    if (v === 'doc') {
      Object.assign(state.page, DEFAULT_PAGE); state.hf = null;
      $('docName').value = '새 문서'; setFormat('새 문서', '');
      await switchMode('doc', { silent: true }); applyPage();
      setContent('<p><br></p>'); placeCaret(ed.firstElementChild);
    } else {
      const p = Design.PRESETS.find((x) => x[0] === v);
      const pj = Design.newProject(p[2], p[3]); Design.open(pj);
      if (v === 'p169') Design.addTemplate('cover'); else if (v === 'sq' || v === 'c45') Design.addTemplate('cardnews');
      $('docName').value = '새 디자인'; setFormat('새 디자인', '');
      await switchMode('design', { silent: true }); setDirty(false);
    }
  });
  $('docName').addEventListener('input', () => { setDirty(true); autosaveSoon(); });

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
  document.addEventListener('dragover', (e) => { if (state.mode === 'design' && e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files') && !e.target.closest('#dStage')) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (state.mode !== 'design' || e.target.closest('#dStage')) return;
    const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => !x.type.startsWith('image/'));
    if (f) { e.preventDefault(); openFile(f); }
  });

  /* ---------- 단축키 ---------- */
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.ss-root, .modal-back')) return;
    const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && k === 's') { e.preventDefault(); saveHwpx(); return; }
    if (mod && k === 'o') { e.preventDefault(); $('fileInput').click(); return; }
    if (e.altKey && k === 'n') { e.preventDefault(); $('btnNew').click(); return; }
    if (state.mode !== 'doc') return;
    if (e.key === 'Escape' && state.painter) { painterToggle(); return; }
    if (e.key === 'Escape' && state.selObj) { selectObj(null); return; }
    if (mod && k === 'f') { e.preventDefault(); openFind(false); }
    else if (mod && k === 'h') { e.preventDefault(); openFind(true); }
    else if (mod && k === 'k') { e.preventDefault(); linkDialog(); }
    else if (mod && e.key === ']') { e.preventDefault(); stepSize(1); }
    else if (mod && e.key === '[') { e.preventDefault(); stepSize(-1); }
    else if (e.altKey && k === 'l') { e.preventDefault(); charShapeDialog(); }
    else if (e.altKey && k === 't') { e.preventDefault(); paraShapeDialog(); }
    else if (e.altKey && k === 'c') { e.preventDefault(); painterToggle(); }
    else if (e.key === 'F5') { e.preventDefault(); $('btnDocShow').click(); }
  });
  window.addEventListener('beforeunload', (e) => { if (state.dirty) { autosave(); e.preventDefault(); e.returnValue = ''; } });

  /* ---------- 자동 보관(이 브라우저에만) ---------- */
  const DRAFT_KEY = 'hwp-editor-draft-v2';
  let soonT;
  function autosaveSoon() { clearTimeout(soonT); soonT = setTimeout(autosave, 1500); }
  function autosave() {
    if (!state.dirty) return;
    try {
      const d = { html: ed.innerHTML, page: state.page, hf: state.hf, name: $('docName').value, fmt: state.fmt, mode: state.mode, t: Date.now() };
      let s = JSON.stringify(Object.assign({}, d, { design: Design.hasProject() ? Design.project : null }));
      if (s.length > 4.5e6) s = JSON.stringify(d);
      if (s.length > 4.5e6) return;
      localStorage.setItem(DRAFT_KEY, s);
      $('stSaved').textContent = '자동 보관됨';
    } catch (e) { /* 저장 공간 없음 등 — 무시 */ }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 무시 */ } }
  function checkDraft() {
    let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { d = null; }
    if (!d || (!d.html && !d.design)) return;
    $('restoreName').textContent = '"' + (d.name || '문서') + '"';
    $('restoreTime').textContent = new Date(d.t).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('restoreBanner').hidden = false;
    $('btnRestore').onclick = async () => {
      setPageFrom(d.page || DEFAULT_PAGE); if (d.page && d.page.paper) state.page.paper = d.page.paper; state.hf = d.hf || null;
      $('docName').value = d.name || '문서'; setFormat(d.fmt || '복원한 문서', '자동 보관본에서 복원');
      if (d.design) Design.open(d.design);
      await switchMode(d.mode === 'design' && d.design ? 'design' : 'doc', { silent: true });
      applyPage(); setContent(d.html || '<p><br></p>', { keepDirty: true }); setDirty(true);
      $('restoreBanner').hidden = true;
    };
    $('btnDiscard').onclick = () => { clearDraft(); $('restoreBanner').hidden = true; };
  }

  /* ---------- 시작 ---------- */
  $('motionCss').textContent = Motion.CSS;
  Design.build($('design'));
  document.execCommand('defaultParagraphSeparator', false, 'p');
  applyPage();
  if (window.innerWidth < 900) { $('zoomSel').value = 'fit'; state.zoomMode = 'fit'; }
  setContent(SAMPLE_DOC);
  $('docName').value = '예시 문서 - 사용 안내';
  setFormat('예시', '처음 화면용 예시 문서입니다. 열기로 내 HWP 파일을 불러오세요.');
  if (state.zoomMode === 'fit') fitZoom();
  setModeUI('doc');
  checkDraft();
  window.HwpEditor = { state, layout, T, setContent, buildHwpx, extract: () => docBlocks(), exportAs, openFile, saveHwpx, switchMode, selectObj, setWrap, insertObject, styleSelection, get design() { return Design; } };
})();
