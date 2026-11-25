/* ===== 표 엔진 =====
 * 표를 "격자(행×열) 행렬"로 읽어서 고친 뒤 다시 쓴다.
 * 행렬의 각 칸에는 그 자리를 차지하는 셀(td)이 들어 있고, 합쳐진 셀은 여러 칸에 같은 td가 들어간다.
 * 줄·칸 추가/삭제, 셀 합치기·나누기를 모두 이 행렬에서 하므로 표 격자가 깨지지 않는다.
 */
const TableKit = (() => {
  const MMPX = 96 / 25.4;
  const zoomOf = (el) => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };

  // 새 빈 셀: 기준 셀의 모양(배경·여백·테두리·정렬)을 이어받는다
  function blank(ref) {
    const td = document.createElement(ref && ref.tagName === 'TH' ? 'th' : 'td');
    if (ref) {
      const st = ref.getAttribute('style'); if (st) td.setAttribute('style', st);
      td.style.removeProperty('height');
      const p0 = ref.querySelector('p');
      const al = p0 && p0.style.textAlign;
      td.innerHTML = al ? `<p style="text-align:${al}"><br></p>` : '<p><br></p>';
    } else td.innerHTML = '<p><br></p>';
    return td;
  }

  // 표 → 행렬
  function read(tbl) {
    const m = []; const nr = tbl.rows.length;
    Array.from(tbl.rows).forEach((tr, ri) => {
      m[ri] = m[ri] || []; let c = 0;
      Array.from(tr.cells).forEach((td) => {
        while (m[ri][c]) c++;
        const cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, Math.min(td.rowSpan || 1, nr - ri));
        for (let y = 0; y < rs; y++) for (let x = 0; x < cs; x++) { m[ri + y] = m[ri + y] || []; if (!m[ri + y][c + x]) m[ri + y][c + x] = td; }
        c += cs;
      });
    });
    const cols = Math.max(1, ...m.map((r) => (r ? r.length : 0)));
    for (let r = 0; r < nr; r++) { m[r] = m[r] || []; for (let c = 0; c < cols; c++) if (!m[r][c]) m[r][c] = blank(m[r][c - 1] || null); }
    return m;
  }

  // 열 너비(px): colgroup에 있으면 그것, 없으면 화면에서 잰다
  function widths(tbl, cols) {
    const cg = tbl.querySelector(':scope > colgroup');
    if (cg && cg.children.length === cols) {
      const w = Array.from(cg.children).map((c) => parseFloat(c.style.width) || parseFloat(c.getAttribute('width')) || 0);
      if (w.every((x) => x > 0)) return w;
    }
    const m = read(tbl); const z = zoomOf(tbl) || 1;
    const w = new Array(cols).fill(0);
    for (let r = 0; r < m.length; r++) for (let c = 0; c < cols; c++) {
      const td = m[r][c]; const R = rectOf(m, td);
      if (R.c0 === R.c1 && !w[c] && td.isConnected) w[c] = td.getBoundingClientRect().width / z;
    }
    const tw = (tbl.isConnected ? tbl.getBoundingClientRect().width / z : 0) || cols * 80;
    const known = w.reduce((a, b) => a + b, 0); const miss = w.filter((x) => !x).length;
    for (let c = 0; c < cols; c++) if (!w[c]) w[c] = Math.max(16, (tw - known) / Math.max(1, miss));
    return w;
  }

  // 셀이 차지하는 행렬 범위
  function rectOf(m, td) {
    let r0 = -1, c0 = -1, r1 = -1, c1 = -1;
    for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c] === td) {
      if (r0 < 0) { r0 = r; c0 = c; }
      r1 = Math.max(r1, r); c1 = Math.max(c1, c); c0 = Math.min(c0, c);
    }
    return { r0, c0, r1, c1 };
  }
  // 두 셀을 꼭짓점으로 하는 직사각형 (걸쳐 있는 합친 셀을 모두 품도록 넓힘)
  function spanRect(m, a, b) {
    const A = rectOf(m, a), B = b ? rectOf(m, b) : A;
    const R = { r0: Math.min(A.r0, B.r0), c0: Math.min(A.c0, B.c0), r1: Math.max(A.r1, B.r1), c1: Math.max(A.c1, B.c1) };
    return expand(m, R);
  }
  function expand(m, R) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) {
        const X = rectOf(m, m[r][c]);
        if (X.r0 < R.r0 || X.c0 < R.c0 || X.r1 > R.r1 || X.c1 > R.c1) {
          R.r0 = Math.min(R.r0, X.r0); R.c0 = Math.min(R.c0, X.c0); R.r1 = Math.max(R.r1, X.r1); R.c1 = Math.max(R.c1, X.c1); changed = true;
        }
      }
    }
    return R;
  }
  function cellsIn(m, R) {
    const out = [];
    for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) { const td = m[r][c]; if (!out.includes(td)) out.push(td); }
    return out;
  }

  // 행렬 → 표 (셀 객체는 그대로 다시 붙여서 내용·모양이 유지됨)
  function write(tbl, m, w) {
    const rows = m.length, cols = m[0].length;
    const trs = Array.from(tbl.rows);
    trs.forEach((tr) => { while (tr.firstChild) tr.removeChild(tr.firstChild); });
    let body = tbl.tBodies[0];
    if (!body) { body = document.createElement('tbody'); tbl.appendChild(body); }
    for (let r = 0; r < rows; r++) {
      const tr = trs[r] || document.createElement('tr');
      body.appendChild(tr);
      for (let c = 0; c < cols; c++) {
        const td = m[r][c];
        if ((r > 0 && m[r - 1][c] === td) || (c > 0 && m[r][c - 1] === td)) continue;
        let cs = 1; while (c + cs < cols && m[r][c + cs] === td) cs++;
        let rs = 1; while (r + rs < rows && m[r + rs][c] === td) rs++;
        if (cs > 1) td.colSpan = cs; else td.removeAttribute('colspan');
        if (rs > 1) td.rowSpan = rs; else td.removeAttribute('rowspan');
        tr.appendChild(td);
      }
    }
    trs.slice(rows).forEach((tr) => tr.remove());
    Array.from(tbl.querySelectorAll(':scope > thead, :scope > tfoot, :scope > tbody')).forEach((s) => { if (s !== body && !s.rows.length) s.remove(); });
    if (w) {
      let cg = tbl.querySelector(':scope > colgroup');
      if (!cg) { cg = document.createElement('colgroup'); tbl.insertBefore(cg, tbl.firstChild); }
      cg.innerHTML = w.map((x) => `<col style="width:${Math.max(8, Math.round(x))}px">`).join('');
      tbl.style.width = Math.round(w.reduce((a, b) => a + Math.max(8, Math.round(b)), 0)) + 'px';
    }
  }

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const scaleTo = (w, total) => { const s = sum(w) || 1; return w.map((x) => x * total / s); };

  // 하나의 표를 고치는 작업 묶음
  function edit(tbl) {
    const m = read(tbl); const w = widths(tbl, m[0].length);
    const T = {
      m, w, tbl,
      get rows() { return m.length; }, get cols() { return m[0].length; },
      rect: (td) => rectOf(m, td), span: (a, b) => spanRect(m, a, b), cells: (R) => cellsIn(m, R),
      commit() { write(tbl, m, w); return T; },
    };
    // 줄 넣기: at 위치에 count줄. 기준 줄(ref)의 셀 구조·모양을 그대로 따른다
    T.insertRows = (at, count, ref) => {
      for (let n = 0; n < count; n++) {
        const refRow = m[Math.max(0, Math.min(m.length - 1, ref))];
        const row = []; const made = new Map();
        for (let c = 0; c < T.cols; c++) {
          const up = at > 0 ? m[at - 1][c] : null, dn = at < m.length ? m[at][c] : null;
          if (up && up === dn) { row[c] = up; continue; } // 세로로 합친 셀 사이 → 그 셀이 늘어남
          const rc = refRow[c];
          if (made.has(rc) && row[c - 1] === made.get(rc)) row[c] = made.get(rc);
          else { const td = blank(rc); made.set(rc, td); row[c] = td; }
        }
        m.splice(at, 0, row);
        if (ref >= at) ref++;
      }
      return T;
    };
    // 칸 넣기: 표 전체 너비는 그대로, 새 칸은 기준 칸 너비만큼 받고 나머지는 비율대로 줄어듦
    T.insertCols = (at, count, ref) => {
      const total = sum(w);
      for (let n = 0; n < count; n++) {
        const rc0 = Math.max(0, Math.min(T.cols - 1, ref));
        const made = new Map();
        for (let r = 0; r < m.length; r++) {
          const lf = at > 0 ? m[r][at - 1] : null, rt = at < T.cols ? m[r][at] : null;
          if (lf && lf === rt) { m[r].splice(at, 0, lf); continue; }
          const rc = m[r][rc0];
          if (made.has(rc) && r > 0 && m[r - 1][at] === made.get(rc)) m[r].splice(at, 0, made.get(rc));
          else { const td = blank(rc); made.set(rc, td); m[r].splice(at, 0, td); }
        }
        w.splice(at, 0, w[rc0]);
        if (ref >= at) ref++;
      }
      const s = scaleTo(w, total); w.splice(0, w.length, ...s);
      return T;
    };
    T.deleteRows = (r0, r1) => { m.splice(r0, r1 - r0 + 1); return T; };
    T.deleteCols = (c0, c1) => {
      const total = sum(w);
      m.forEach((row) => row.splice(c0, c1 - c0 + 1)); w.splice(c0, c1 - c0 + 1);
      if (w.length) { const s = scaleTo(w, total); w.splice(0, w.length, ...s); }
      return T;
    };
    // 셀 합치기: 범위 안의 글은 차례대로 모아서 첫 셀에
    T.merge = (R) => {
      R = expand(m, Object.assign({}, R));
      const list = cellsIn(m, R); const target = list[0];
      const has = (x) => x.textContent.trim() || x.querySelector('img, table, .fobj');
      if (!has(target)) { const firstFull = list.find(has); if (firstFull && firstFull !== target) { target.innerHTML = ''; while (firstFull.firstChild) target.appendChild(firstFull.firstChild); } }
      list.forEach((td) => { if (td !== target && has(td)) while (td.firstChild) target.appendChild(td.firstChild); });
      if (!target.firstChild) target.innerHTML = '<p><br></p>';
      for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) m[r][c] = target;
      return target;
    };
    // 셀 나누기: nr줄 × nc칸. 칸이 모자라면 격자 칸을 늘려서(다른 줄은 합친 셀처럼 이어짐) 나눈다
    T.split = (td, nr, nc) => {
      const R = rectOf(m, td);
      while (R.c1 - R.c0 + 1 < nc) {
        let k = R.c0; for (let c = R.c0; c <= R.c1; c++) if (w[c] > w[k]) k = c;
        for (let r = 0; r < m.length; r++) m[r].splice(k + 1, 0, m[r][k]);
        const half = w[k] / 2; w.splice(k, 1, half, half); R.c1++;
      }
      while (R.r1 - R.r0 + 1 < nr) { m.splice(R.r1 + 1, 0, m[R.r1].slice()); R.r1++; }
      // 열 묶기: 너비가 고르게 되도록
      const colGroups = groupBy(w.slice(R.c0, R.c1 + 1), nc).map((g) => g.map((i) => i + R.c0));
      const rowGroups = groupBy(new Array(R.r1 - R.r0 + 1).fill(1), nr).map((g) => g.map((i) => i + R.r0));
      const made = [];
      rowGroups.forEach((rg, i) => colGroups.forEach((cg, j) => {
        const cell = i === 0 && j === 0 ? td : blank(td);
        made.push(cell);
        rg.forEach((r) => cg.forEach((c) => { m[r][c] = cell; }));
      }));
      td.style.removeProperty('height');
      return made;
    };
    T.equalWidths = (c0, c1) => { const a = sum(w.slice(c0, c1 + 1)) / (c1 - c0 + 1); for (let c = c0; c <= c1; c++) w[c] = a; return T; };
    T.fit = (total) => { const s = scaleTo(w, total); w.splice(0, w.length, ...s); return T; };
    return T;
  }
  // 값 목록(너비)을 n묶음으로: 누적 너비가 고르게 나뉘는 지점에서 자름
  function groupBy(vals, n) {
    const total = sum(vals); const out = []; let acc = 0, cur = [];
    vals.forEach((v, i) => {
      cur.push(i); acc += v;
      const left = vals.length - i - 1, need = n - out.length - 1;
      if (out.length < n - 1 && (acc >= total * (out.length + 1) / n - 0.5 || left === need)) { out.push(cur); cur = []; }
    });
    if (cur.length) out.push(cur);
    while (out.length < n) out.push([out[out.length - 1].pop()]);
    return out;
  }

  // 테두리: 범위 R 안 셀들의 변에 선을 긋는다. where: all|outer|inner|innerH|innerV|top|bottom|left|right
  const CSS_TYPE = { SOLID: 'solid', DOT: 'dotted', DASH: 'dashed', DOUBLE_SLIM: 'double', NONE: 'none' };
  function applyBorder(tbl, R, where, line) {
    const m = read(tbl);
    const css = line.type === 'NONE' ? 'none' : `${line.w}mm ${CSS_TYPE[line.type] || 'solid'} ${line.color}`;
    const set = (td, side) => { if (css === 'none') td.style.setProperty('border-' + side, '0.1mm none #000000'); else td.style.setProperty('border-' + side, css); };
    for (const td of cellsIn(m, R)) {
      const X = rectOf(m, td);
      const onT = X.r0 === R.r0, onB = X.r1 === R.r1, onL = X.c0 === R.c0, onR = X.c1 === R.c1;
      const want = {
        top: where === 'all' || (where === 'outer' && onT) || (where === 'top' && onT) || ((where === 'inner' || where === 'innerH') && !onT),
        bottom: where === 'all' || (where === 'outer' && onB) || (where === 'bottom' && onB) || ((where === 'inner' || where === 'innerH') && !onB),
        left: where === 'all' || (where === 'outer' && onL) || (where === 'left' && onL) || ((where === 'inner' || where === 'innerV') && !onL),
        right: where === 'all' || (where === 'outer' && onR) || (where === 'right' && onR) || ((where === 'inner' || where === 'innerV') && !onR),
      };
      for (const side in want) {
        if (!want[side]) continue;
        set(td, side);
        // 맞닿은 셀의 반대쪽 변도 같게 (선이 겹치는 표에서 한쪽만 바뀌는 일이 없도록)
        if (side === 'top' && X.r0 > 0) for (let c = X.c0; c <= X.c1; c++) set(m[X.r0 - 1][c], 'bottom');
        if (side === 'bottom' && X.r1 < m.length - 1) for (let c = X.c0; c <= X.c1; c++) set(m[X.r1 + 1][c], 'top');
        if (side === 'left' && X.c0 > 0) for (let r = X.r0; r <= X.r1; r++) set(m[r][X.c0 - 1], 'right');
        if (side === 'right' && X.c1 < m[0].length - 1) for (let r = X.r0; r <= X.r1; r++) set(m[r][X.c1 + 1], 'left');
      }
    }
  }

  // 붙여넣은 표(HTML)나 탭으로 나뉜 글(엑셀) → 2차원 배열
  function parseGrid(html, text) {
    if (html && /<table/i.test(html)) {
      const d = document.createElement('div'); d.innerHTML = html;
      const t = d.querySelector('table'); if (t) return Array.from(t.rows).map((tr) => Array.from(tr.cells).map((c) => c.innerText.replace(/\r/g, '').replace(/\n+$/, '')));
    }
    if (text && text.includes('\t')) {
      const rows = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
      return rows.map((r) => r.split('\t'));
    }
    return null;
  }

  return { MMPX, read, write, widths, rectOf, spanRect, cellsIn, edit, blank, applyBorder, parseGrid, CSS_TYPE };
})();
