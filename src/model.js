/* ===== 편집기 DOM → 문서 모델(블록·런) =====
 * 모든 저장기(HWPX/DOCX/MD/TXT)가 같은 모델을 사용한다.
 * 블록: {t:'p', align, lh(%), ml, mr, ti, mt, mb(px), pb, tag, list, runs:[...]}
 *       {t:'table', rows:[[cell]], colW:[px], border}
 * 런:   {text, b,i,u,s,sup,sub,color,bg,size(pt),font} | {br} | {tab} | {img:{src,w,h}}
 */
const Fonts = (() => {
  const SERIF = /바탕|명조|궁서|batang|myeongjo|serif|times|georgia|garamond|신명|휴먼명조|한컴바탕/i;
  function css(name) {
    if (!name) return '';
    const n = name.replace(/["']/g, '');
    // 작은따옴표: HTML style="…" 속성 안에 그대로 넣어도 깨지지 않게
    const fb = SERIF.test(n) ? "'Noto Serif KR', 'Nanum Myeongjo', serif" : "'Noto Sans KR', 'Nanum Gothic', sans-serif";
    return `'${n}', ${fb}`;
  }
  function first(family) {
    if (!family) return '';
    const f = family.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (/^(serif|sans-serif|monospace|system-ui|-apple-system|inherit)$/i.test(f)) return '';
    return f;
  }
  return { css, first };
})();

const DocModel = (() => {
  const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'CENTER', 'ADDRESS', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD']);

  function rgbToHex(c) {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return /^#/.test(c) ? c : null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length === 4 && p[3] === 0) return null;
    return '#' + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function runStyle(el, blockEl) {
    const cs = getComputedStyle(el);
    const r = {};
    const fw = parseInt(cs.fontWeight, 10) || (cs.fontWeight === 'bold' ? 700 : 400);
    if (fw >= 600) r.b = 1;
    if (cs.fontStyle === 'italic' || cs.fontStyle === 'oblique') r.i = 1;
    // 밑줄·취소선·위첨자는 상속되지 않으므로 조상까지 확인
    let n = el; let size = parseFloat(cs.fontSize);
    while (n && n !== blockEl && n.nodeType === 1) {
      const s = getComputedStyle(n);
      const d = s.textDecorationLine || s.textDecoration || '';
      if (d.includes('underline')) r.u = 1;
      if (d.includes('line-through')) r.s = 1;
      if (s.verticalAlign === 'super') r.sup = 1;
      if (s.verticalAlign === 'sub') r.sub = 1;
      if (!r.bg) { const bg = rgbToHex(s.backgroundColor); if (bg && bg !== '#FFFFFF') r.bg = bg; }
      n = n.parentElement;
    }
    if ((r.sup || r.sub) && el.parentElement) size = Math.max(size, parseFloat(getComputedStyle(el.parentElement).fontSize) || size);
    if ((r.sup || r.sub) && (el.tagName === 'SUP' || el.tagName === 'SUB')) size = parseFloat(getComputedStyle(el.parentElement).fontSize) || size;
    r.size = Math.round(size * 0.75 * 2) / 2;
    const col = rgbToHex(cs.color); if (col && col !== '#000000') r.color = col;
    const f = Fonts.first(cs.fontFamily); if (f) r.font = f;
    // 자간: CSS letter-spacing(px) → 한글 자간(글자 크기의 %)
    const lsp = parseFloat(cs.letterSpacing);
    if (lsp && size) r.ls = Math.round(lsp / size * 100);
    if (cs.textShadow && cs.textShadow !== 'none') r.shadow = 1;
    if (parseFloat(cs.webkitTextStrokeWidth || cs.getPropertyValue('-webkit-text-stroke-width')) > 0) r.outline = 1;
    const a = el.closest && el.closest('a[href]');
    if (a && (!blockEl || blockEl.contains(a) || a.contains(blockEl))) r.link = a.getAttribute('href');
    return r;
  }

  function paraProps(el, root) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 13.333;
    let lh = 160;
    if (cs.lineHeight && cs.lineHeight !== 'normal') lh = Math.round(parseFloat(cs.lineHeight) / fs * 100);
    let align = cs.textAlign;
    align = ({ start: 'left', end: 'right', '-webkit-left': 'left', '-webkit-center': 'center', '-webkit-right': 'right' })[align] || align;
    if (!['left', 'right', 'center', 'justify'].includes(align)) align = 'left';
    let ml = 0, mr = 0;
    if (root && el !== root) {
      const rr = root.getBoundingClientRect(), er = el.getBoundingClientRect();
      const rcs = getComputedStyle(root);
      ml = Math.max(0, er.left - rr.left - parseFloat(rcs.paddingLeft) - parseFloat(rcs.borderLeftWidth) + parseFloat(cs.paddingLeft));
      mr = Math.max(0, rr.right - er.right - parseFloat(rcs.paddingRight) - parseFloat(rcs.borderRightWidth) + parseFloat(cs.paddingRight));
      const z = zoomOf(root); ml /= z; mr /= z;
    }
    return {
      align, lh: Math.min(Math.max(lh, 50), 500),
      ml: Math.round(ml), mr: Math.round(mr), ti: Math.round(parseFloat(cs.textIndent) || 0),
      mt: Math.round(parseFloat(cs.marginTop) || 0), mb: Math.round(parseFloat(cs.marginBottom) || 0),
      tag: el.tagName,
    };
  }
  // 화면 배율(CSS zoom 등)을 실제 크기 비율로 잰다
  function zoomOf(el) {
    const w = el.offsetWidth; if (!w) return 1;
    const z = el.getBoundingClientRect().width / w;
    return z && isFinite(z) ? z : 1;
  }

  function extract(root, opts = {}) {
    const blocks = [];
    const z0 = zoomOf(root); const rr0 = root.getBoundingClientRect();
    const local = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - rr0.left) / z0, y: (r.top - rr0.top) / z0, w: r.width / z0, h: r.height / z0 }; };
    const paperPos = opts.paperPos || ((el) => local(el));
    let cur = null; let pendingPB = false;
    const listCounters = [];
    function newP(blockEl, prefix) {
      cur = Object.assign({ t: 'p', runs: [] }, paraProps(blockEl, root));
      if (pendingPB) { cur.pb = true; pendingPB = false; }
      if (prefix) cur.runs.push(Object.assign({ text: prefix }, runStyle(blockEl, blockEl)));
    }
    function flush() {
      if (!cur) return;
      // 브라우저가 넣는 끝 <br> 자리표시 제거
      while (cur.runs.length && cur.runs[cur.runs.length - 1].br) {
        cur.runs.pop();
        break;
      }
      blocks.push(cur); cur = null;
    }
    function walk(node, blockEl) {
      for (const ch of Array.from(node.childNodes)) {
        if (ch.nodeType === 3) {
          let t = ch.nodeValue;
          const ws = getComputedStyle(ch.parentElement).whiteSpace;
          if (!/pre/.test(ws)) t = t.replace(/[ \t\n\r]+/g, ' ');
          if (!t) continue;
          if (!cur && !t.trim() ) continue;
          if (!cur) newP(blockEl);
          const st = runStyle(ch.parentElement, blockEl);
          // 탭 분리
          const parts = t.split('\t');
          parts.forEach((part, i) => {
            if (i > 0) cur.runs.push({ tab: 1 });
            if (part) cur.runs.push(Object.assign({ text: part.replace(/ /g, ' ') }, st));
          });
        } else if (ch.nodeType === 1) {
          const tag = ch.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || ch.classList.contains('page-marker')) continue;
          const disp = getComputedStyle(ch).display;
          if (disp === 'none') continue;
          if (tag === 'BR') { if (!cur) newP(blockEl); cur.runs.push({ br: 1 }); }
          else if (ch.classList.contains('fobj')) {
            // 글 앞/뒤에 떠 있는 개체: 종이 기준 좌표로 기록
            if (!cur) newP(blockEl);
            const ob = floatObj(ch); if (ob) cur.runs.push({ obj: ob });
          } else if (ch.classList.contains('fn')) {
            if (!cur) newP(blockEl);
            cur.runs.push({ fn: ch.getAttribute('data-note') || '' });
          } else if (tag === 'IMG') {
            if (!cur) newP(blockEl);
            const w = Math.max(1, Math.round(ch.width || ch.naturalWidth)), h = Math.max(1, Math.round(ch.height || ch.naturalHeight));
            const wrap = ch.getAttribute('data-wrap');
            if (wrap === 'square' || wrap === 'block') {
              const fl = getComputedStyle(ch).float;
              const align = wrap === 'square' ? (fl === 'right' ? 'right' : 'left') : (ch.getAttribute('data-align') || 'center');
              cur.runs.push({ obj: { kind: 'pic', src: ch.currentSrc || ch.src, w, h, wrap, align } });
            } else cur.runs.push({ img: { src: ch.currentSrc || ch.src, w, h } });
          } else if (tag === 'TABLE') { flush(); const tb = table(ch); if (pendingPB) { tb.pb = true; pendingPB = false; } blocks.push(tb); }
          else if (ch.classList.contains('pagebreak')) { flush(); pendingPB = true; }
          else if (tag === 'HR') { flush(); newP(blockEl); cur.runs.push({ text: '─'.repeat(40) }); flush(); }
          else if (tag === 'UL' || tag === 'OL') {
            flush(); listCounters.push({ ol: tag === 'OL', n: parseInt(ch.getAttribute('start') || '1', 10) });
            walk(ch, ch); flush(); listCounters.pop();
          } else if (tag === 'LI') {
            flush();
            const lc = listCounters[listCounters.length - 1];
            const depth = Math.max(0, listCounters.length - 1);
            const prefix = lc ? (lc.ol ? (lc.n++) + '. ' : ['• ', '◦ ', '▪ '][depth % 3]) : '• ';
            newP(ch, prefix); cur.list = 1; walk(ch, ch); flush();
          } else if (BLOCK_TAGS.has(tag) || /^(block|flex|grid|list-item|table-caption)$/.test(disp)) {
            flush(); walk(ch, ch); flush();
          } else walk(ch, blockEl);
        }
      }
    }
    function floatObj(fo) {
      const wrap = fo.getAttribute('data-wrap') === 'behind' ? 'behind' : 'front';
      const p = paperPos(fo); const b = local(fo);
      const base = { wrap, x: Math.round(p.x), y: Math.round(p.y), w: Math.max(1, Math.round(fo.offsetWidth || b.w)), h: Math.max(1, Math.round(fo.offsetHeight || b.h)) };
      const img = fo.querySelector(':scope > img');
      if (img) return Object.assign(base, { kind: 'pic', src: img.currentSrc || img.src });
      const kind = fo.getAttribute('data-kind');
      const st = getComputedStyle(fo);
      if (kind === 'line') {
        const ln = fo.querySelector('line');
        return Object.assign(base, { kind: 'line', stroke: (ln && ln.getAttribute('stroke')) || '#000000', sw: parseFloat((ln && ln.getAttribute('stroke-width')) || 2), arrow: fo.getAttribute('data-arrow') === '1', dash: !!(ln && ln.getAttribute('stroke-dasharray')) });
      }
      const tb = fo.querySelector(':scope > .tbox') || fo;
      const ts = getComputedStyle(tb);
      const bg = rgbToHex(ts.backgroundColor);
      const bw = parseFloat(ts.borderTopWidth) || 0;
      return Object.assign(base, {
        kind: 'box', shape: kind === 'ellipse' ? 'ellipse' : 'rect', fill: bg || '', stroke: bw && ts.borderTopStyle !== 'none' ? rgbToHex(ts.borderTopColor) || '#000000' : '', sw: bw, dash: ts.borderTopStyle === 'dashed',
        radius: parseFloat(ts.borderTopLeftRadius) || 0, pad: parseFloat(ts.paddingLeft) || 0,
        va: ({ center: 'CENTER', 'flex-end': 'BOTTOM' })[ts.justifyContent] || 'TOP',
        blocks: extract(tb),
      });
      void st;
    }
    function table(tb) {
      const rows = [];
      const grid = [];
      Array.from(tb.rows).forEach((tr, ri) => {
        const row = [];
        grid[ri] = grid[ri] || [];
        let c = 0;
        Array.from(tr.cells).forEach((td) => {
          while (grid[ri][c]) c++;
          const cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, Math.min(td.rowSpan || 1, tb.rows.length - ri));
          for (let y = 0; y < rs; y++) for (let x = 0; x < cs; x++) { grid[ri + y] = grid[ri + y] || []; grid[ri + y][c + x] = true; }
          const st = getComputedStyle(td);
          const bg = rgbToHex(st.backgroundColor);
          const inner = extract(td);
          row.push({ r: ri, c, cs, rs, w: td.getBoundingClientRect().width / zoomOf(td), h: td.getBoundingClientRect().height / zoomOf(td),
            bg: bg && bg !== '#FFFFFF' ? bg : null, border: st.borderTopStyle !== 'none' && st.borderTopStyle !== 'dotted' && st.borderTopStyle !== 'hidden',
            bd: cellBorders(td, st), pad: { l: parseFloat(st.paddingLeft) || 0, r: parseFloat(st.paddingRight) || 0, t: parseFloat(st.paddingTop) || 0, b: parseFloat(st.paddingBottom) || 0 },
            fixedH: !!td.style.height,
            va: ({ top: 'TOP', bottom: 'BOTTOM' })[st.verticalAlign] || 'CENTER',
            blocks: inner.length ? inner : [{ t: 'p', align: 'left', lh: 160, ml: 0, mr: 0, ti: 0, mt: 0, mb: 0, runs: [] }] });
          c += cs;
        });
        rows.push(row);
      });
      const cols = Math.max(1, ...grid.map((r) => r ? r.length : 0));
      // 빈 칸(행마다 칸 수가 다른 표)은 빈 셀로 채워 격자를 완성
      for (let ri = 0; ri < grid.length; ri++) {
        grid[ri] = grid[ri] || [];
        if (!rows[ri]) rows[ri] = [];
        for (let c = 0; c < cols; c++) {
          if (grid[ri][c]) continue;
          grid[ri][c] = true;
          rows[ri].push({ r: ri, c, cs: 1, rs: 1, w: 0, h: 0, bg: null, border: rows[ri][0] ? rows[ri][0].border : true, va: 'CENTER',
            blocks: [{ t: 'p', align: 'left', lh: 160, ml: 0, mr: 0, ti: 0, mt: 0, mb: 0, runs: [] }] });
        }
        rows[ri].sort((a, b) => a.c - b.c);
      }
      const colW = new Array(cols).fill(0);
      rows.flat().forEach((cell) => { if (cell.cs === 1) colW[cell.c] = Math.max(colW[cell.c], cell.w); });
      // 단일 칸 너비가 없는 열은 병합 셀에서 나눠서 추정
      rows.flat().forEach((cell) => {
        if (cell.cs > 1) {
          const known = colW.slice(cell.c, cell.c + cell.cs).reduce((a, b) => a + b, 0);
          const empty = colW.slice(cell.c, cell.c + cell.cs).filter((x) => !x).length;
          if (empty) for (let k = cell.c; k < cell.c + cell.cs; k++) if (!colW[k]) colW[k] = Math.max(20, (cell.w - known) / empty);
        }
      });
      for (let k = 0; k < cols; k++) if (!colW[k]) colW[k] = 60;
      const rowH = grid.map((r, ri) => {
        const tr = tb.rows[ri]; return tr ? tr.getBoundingClientRect().height / zoomOf(tb) : 24;
      });
      const anyBorder = rows.flat().some((c) => c.border);
      const ts = getComputedStyle(tb);
      const om = { t: parseFloat(ts.marginTop) || 0, b: parseFloat(ts.marginBottom) || 0, l: tb.style.marginLeft === 'auto' ? 0 : parseFloat(ts.marginLeft) || 0, r: tb.style.marginRight === 'auto' ? 0 : parseFloat(ts.marginRight) || 0 };
      const align = tb.style.marginLeft === 'auto' && tb.style.marginRight === 'auto' ? 'center' : tb.style.marginLeft === 'auto' ? 'right' : 'left';
      return { t: 'table', rows, cols, nrows: grid.length, colW, rowH, border: anyBorder, align, om };
    }
    // 셀 네 변의 선: {t,b,l,r: {type, w(mm), color}}. 따로 정하지 않은 변은 기본선(실선 0.12mm)
    function cellBorders(td, st) {
      const out = {}; const noborder = td.closest('table') && td.closest('table').classList.contains('noborder');
      for (const [k, side] of [['t', 'Top'], ['b', 'Bottom'], ['l', 'Left'], ['r', 'Right']]) {
        const inl = td.style['border' + side + 'Style'];
        const sty = st['border' + side + 'Style'];
        const guide = sty === 'dotted' && /#?(c6cdd9|d6dae3)|rgb\(198, 205, 217\)|rgb\(214, 218, 227\)/i.test(st['border' + side + 'Color']);
        if (noborder || guide || sty === 'none' || sty === 'hidden') { out[k] = { type: 'NONE', w: 0.1, color: '#000000' }; continue; }
        if (!inl) { out[k] = { type: 'SOLID', w: 0.12, color: '#000000' }; continue; }
        const iw = td.style['border' + side + 'Width'];
        let w = /mm$/.test(iw) ? parseFloat(iw) : (parseFloat(st['border' + side + 'Width']) || 1) / (96 / 25.4);
        out[k] = { type: ({ solid: 'SOLID', dotted: 'DOT', dashed: 'DASH', double: 'DOUBLE_SLIM' })[sty] || 'SOLID', w: Math.round(w * 100) / 100, color: rgbToHex(st['border' + side + 'Color']) || '#000000' };
      }
      return out;
    }
    walk(root, root); flush();
    return blocks;
  }

  function plainText(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.t === 'p') {
        out.push(b.runs.map((r) => r.text || (r.br ? '\n' : r.tab ? '\t' : r.img ? '[그림]' : r.fn !== undefined ? '' : '')).join(''));
        b.runs.forEach((r) => { if (r.obj && r.obj.blocks) out.push(plainText(r.obj.blocks)); });
      }
      else if (b.t === 'table') for (const row of b.rows) out.push(row.map((c) => plainText(c.blocks).replace(/\n/g, ' ')).join('\t'));
    }
    return out.join('\n');
  }

  return { extract, plainText, rgbToHex };
})();

/* ===== 쪽 나누기 =====
 * 편집 화면을 한글처럼 쪽마다 떨어진 종이로 보여 준다.
 * 문서 내용(DOM)은 건드리지 않고, 쪽 경계에 걸린 문단·표 줄을 "다음 쪽 첫머리"로 밀어내는 CSS 규칙만 만든다
 * (→ 되돌리기·저장·자동 보관에 아무 영향이 없다).
 * 쪽 번호, 디자인 변환, 떠 있는 개체의 종이 좌표, PDF·그림 내보내기가 모두 이 결과를 쓴다.
 */
const Pager = (() => {
  const MMPX = 96 / 25.4;
  const GAP = 24; // 화면에서 종이와 종이 사이 간격(px)
  function dims(page) {
    const H = page.h * MMPX, top = (page.mt + page.hd) * MMPX, bottom = (page.mb + page.ft) * MMPX;
    return { H, top, bottom, contentH: Math.max(50, H - top - bottom), pitch: H + GAP, GAP };
  }
  function styleEl() {
    let s = document.getElementById('pgGapStyle');
    if (!s) { s = document.createElement('style'); s.id = 'pgGapStyle'; document.head.appendChild(s); }
    return s;
  }
  const idxIn = (el) => Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
  const visibleLine = (cs) => cs.borderTopStyle !== 'none' && cs.borderTopStyle !== 'hidden' && cs.borderTopStyle !== 'dotted' && !/rgba\(.*,\s*0\)|transparent/.test(cs.borderTopColor);

  // 쪽 나누기 계산 + 화면 규칙 적용. 결과: {pages, D, css, holes}
  function paginate(ed, page) {
    const D = dims(page); const st = styleEl();
    st.textContent = '';
    ed.querySelectorAll(':scope > .pagebreak').forEach((b) => { b.style.height = ''; });
    const er = ed.getBoundingClientRect(); const z = ed.offsetWidth ? er.width / ed.offsetWidth : 1;
    const Y = (v) => (v - er.top) / z;
    // 1) 먼저 모두 잰다(읽기만)
    const meas = Array.from(ed.children).map((k, i) => {
      const cs = getComputedStyle(k);
      if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed' || cs.float !== 'none') return null;
      const r = k.getBoundingClientRect();
      const o = { k, nth: i + 1, t: Y(r.top), b: Y(r.bottom), mt: parseFloat(cs.marginTop) || 0, bt: parseFloat(cs.borderTopWidth) || 0, pb: k.classList.contains('pagebreak') };
      if (!o.pb && !r.height) return null;
      if (k.tagName === 'TABLE') {
        o.left = (r.left - er.left) / z; o.w = r.width / z;
        o.rows = Array.from(k.rows).map((tr) => {
          const rr = tr.getBoundingClientRect();
          return { si: idxIn(tr.parentElement), ri: idxIn(tr), t: Y(rr.top), b: Y(rr.bottom),
            cells: Array.from(tr.cells).map((c) => { const c2 = getComputedStyle(c); return { pt: parseFloat(c2.paddingTop) || 0, line: visibleLine(c2) ? { w: Math.max(1, parseFloat(c2.borderTopWidth) || 1), color: c2.borderTopColor } : null }; }) };
        });
      } else if (k.tagName === 'UL' || k.tagName === 'OL') {
        o.items = Array.from(k.children).map((li) => { const rr = li.getBoundingClientRect(); return { n: idxIn(li), t: Y(rr.top), b: Y(rr.bottom), bt: parseFloat(getComputedStyle(li).borderTopWidth) || 0 }; });
      }
      return o;
    });
    // 2) 위에서부터 쪽을 채우며 밀어낼 양 계산
    const startOf = (p) => p * D.pitch + D.top, endOf = (p) => p * D.pitch + D.top + D.contentH;
    const rules = []; const holes = [];
    let S = 0, cur = 0, forced = false, prevMb = 0;
    const sel = (o) => `#${ed.id} > :nth-child(${o.nth})`;
    const pushBlock = (selector, o, need, prevMargin) => {
      if (o.bt === 0) rules.push(`${selector}{border-top:${need.toFixed(2)}px solid transparent !important}`);
      else rules.push(`${selector}{margin-top:${(Math.max(o.mt, prevMargin) + need).toFixed(2)}px !important}`);
    };
    for (const o of meas) {
      if (!o) continue;
      if (o.pb) { forced = true; continue; }
      let t = o.t + S;
      while (t >= startOf(cur + 1) - 0.5) cur++;
      const h = o.b - o.t;
      let need = 0;
      if (forced || t > endOf(cur) + 0.5) { need = startOf(cur + 1) - t; cur++; }
      else if (t + h > endOf(cur) + 0.5) {
        if (o.rows && o.rows.length) {
          // 표: 줄 단위로 쪽을 넘김 (한글처럼 표가 다음 쪽으로 이어짐)
          let local = 0; const tTop = t; const tHoles = [];
          o.rows.forEach((row, j) => {
            const rt = row.t + S + local, rh = row.b - row.t;
            while (rt >= startOf(cur + 1) - 0.5) cur++;
            if (rt + rh > endOf(cur) + 0.5 && rt > startOf(cur) + 0.5 && rh <= D.contentH) {
              const nd = startOf(cur + 1) - rt; cur++;
              const rs = `${sel(o)} > :nth-child(${row.si}) > :nth-child(${row.ri})`;
              row.cells.forEach((c, ci) => {
                let css = `padding-top:${(c.pt + nd).toFixed(2)}px !important`;
                if (c.line) css += `;background-image:linear-gradient(${c.line.color},${c.line.color}) !important;background-size:100% ${c.line.w}px !important;background-position:0 ${(nd - c.line.w).toFixed(2)}px !important;background-repeat:no-repeat !important`;
                rules.push(`${rs} > :nth-child(${ci + 1}){${css}}`);
              });
              const y1 = rt - tTop + (j === 0 ? -3 : Math.max(2, ...row.cells.map((c) => (c.line ? c.line.w : 0))) + 0.5), y2 = rt - tTop + nd - (row.cells.some((c) => c.line) ? 1.5 : 0);
              tHoles.push([y1, y2]); holes.push({ x: o.left, w: o.w, y1: tTop + y1, y2: tTop + y2 });
              local += nd;
            }
            const rb = row.b + S + local; while (rb > endOf(cur) + 0.5 && rb >= startOf(cur + 1)) cur++;
          });
          if (tHoles.length) {
            const d = 'M-4000 -4000 H9000 V400000 H-4000 Z ' + tHoles.map(([a, b]) => `M-4000 ${a.toFixed(2)} H9000 V${b.toFixed(2)} H-4000 Z`).join(' ');
            rules.push(`${sel(o)}{clip-path:path(evenodd,"${d}")}`);
          }
          S += local;
        } else if (o.items && o.items.length && h > D.contentH * 0.25) {
          // 목록: 항목 단위로 넘김
          let local = 0;
          o.items.forEach((it) => {
            const it0 = it.t + S + local, ih = it.b - it.t;
            while (it0 >= startOf(cur + 1) - 0.5) cur++;
            if (it0 + ih > endOf(cur) + 0.5 && it0 > startOf(cur) + 0.5 && ih <= D.contentH) {
              const nd = startOf(cur + 1) - it0; cur++;
              pushBlock(`${sel(o)} > :nth-child(${it.n})`, { bt: it.bt, mt: 0 }, nd, 0);
              local += nd;
            }
          });
          S += local;
        } else if (t > startOf(cur) + 0.5 && h <= D.contentH) { need = startOf(cur + 1) - t; cur++; }
      }
      forced = false;
      if (need > 0.5) { pushBlock(sel(o), o, need, prevMb); S += need; }
      const b = o.b + S;
      while (b > endOf(cur) + 0.5 && b >= startOf(cur + 1)) cur++;
      prevMb = parseFloat(getComputedStyle(o.k).marginBottom) || 0;
    }
    const pages = cur + 1;
    const css = rules.join('\n');
    st.textContent = '@media screen {\n' + css + '\n}';
    ed.style.minHeight = (pages * D.pitch - D.GAP) + 'px';
    ed._pg = { pages, D, css, holes };
    return ed._pg;
  }

  function layout(ed, page) {
    const D = dims(page);
    const pages = (ed._pg && ed._pg.pages) || 1;
    const er = ed.getBoundingClientRect();
    const z = ed.offsetWidth ? er.width / ed.offsetWidth : 1;
    const starts = Array.from({ length: pages }, (_, k) => k * D.pitch + D.top);
    return {
      starts, top: D.top, contentH: D.contentH, pitch: D.pitch, H: D.H, z, er,
      pageOf(y) { return Math.max(0, Math.min(pages - 1, Math.floor(y / D.pitch))); },
      // 편집 화면 좌표 ↔ 종이 좌표
      toPaper(x, y, anchorY) { const k = this.pageOf(anchorY === undefined ? y : anchorY); return { x, y: y - starts[k] + D.top, k }; },
      fromPaper(x, y, k) { return { x, y: (starts[k] !== undefined ? starts[k] : starts[starts.length - 1]) + y - D.top }; },
    };
  }
  return { layout, paginate, dims, MMPX, GAP };
})();
