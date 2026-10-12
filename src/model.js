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
    const fb = SERIF.test(n) ? '"Noto Serif KR", "Nanum Myeongjo", serif' : '"Noto Sans KR", "Nanum Gothic", sans-serif';
    return `"${n}", ${fb}`;
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
  function zoomOf(el) {
    const z = parseFloat(getComputedStyle(document.getElementById('zoomWrap') || document.body).zoom);
    return z && !isNaN(z) ? z : 1;
  }

  function extract(root) {
    const blocks = [];
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
          else if (tag === 'IMG') {
            if (!cur) newP(blockEl);
            const z = 1;
            cur.runs.push({ img: { src: ch.currentSrc || ch.src, w: Math.max(1, Math.round(ch.width || ch.naturalWidth)), h: Math.max(1, Math.round(ch.height || ch.naturalHeight)) } });
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
      return { t: 'table', rows, cols, nrows: grid.length, colW, rowH, border: anyBorder, align: tb.style.marginLeft === 'auto' && tb.style.marginRight === 'auto' ? 'center' : 'left' };
    }
    walk(root, root); flush();
    return blocks;
  }

  function plainText(blocks) {
    const out = [];
    for (const b of blocks) {
      if (b.t === 'p') out.push(b.runs.map((r) => r.text || (r.br ? '\n' : r.tab ? '\t' : r.img ? '[그림]' : '')).join(''));
      else if (b.t === 'table') for (const row of b.rows) out.push(row.map((c) => plainText(c.blocks).replace(/\n/g, ' ')).join('\t'));
    }
    return out.join('\n');
  }

  return { extract, plainText, rgbToHex };
})();
