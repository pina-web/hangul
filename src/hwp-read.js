/* ===== HWP 5.0 (바이너리) 읽기 =====
 * 복합문서(CFB) → DocInfo(글꼴·글자모양·문단모양·그림목록) + BodyText/SectionN 레코드 → 편집용 HTML
 */
const HWPReader = (() => {
  const T = { // HWPTAG_BEGIN = 16
    ID_MAPPINGS: 17, BIN_DATA: 18, FACE_NAME: 19, BORDER_FILL: 20, CHAR_SHAPE: 21, PARA_SHAPE: 25,
    PARA_HEADER: 66, PARA_TEXT: 67, PARA_CHAR_SHAPE: 68, CTRL_HEADER: 71, LIST_HEADER: 72,
    PAGE_DEF: 73, TABLE: 77, SHAPE_COMPONENT: 76, SHAPE_PICTURE: 85, EQEDIT: 88,
  };
  const EXT = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);
  const INLINE = new Set([4, 5, 6, 7, 8, 9, 19, 20]);
  const ctrlId = (s) => (s.charCodeAt(0) << 24 | s.charCodeAt(1) << 16 | s.charCodeAt(2) << 8 | s.charCodeAt(3)) >>> 0;
  const C_TBL = ctrlId('tbl '), C_GSO = ctrlId('gso '), C_EQ = ctrlId('eqed');

  function dv(u8) { return new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }

  function inflate(u8) {
    try { return pako.inflateRaw(u8); } catch (e) {
      try { return pako.inflate(u8); } catch (e2) { return u8; }
    }
  }

  function records(u8) {
    const out = []; const d = dv(u8); let p = 0;
    while (p + 4 <= u8.length) {
      const h = d.getUint32(p, true); p += 4;
      const tag = h & 0x3ff, level = (h >>> 10) & 0x3ff; let size = (h >>> 20) & 0xfff;
      if (size === 0xfff) { if (p + 4 > u8.length) break; size = d.getUint32(p, true); p += 4; }
      if (p + size > u8.length) size = u8.length - p;
      out.push({ tag, level, data: u8.subarray(p, p + size), children: [] });
      p += size;
    }
    return out;
  }

  // 레벨 정보로 트리 구성
  function tree(recs) {
    const root = { tag: -1, level: -1, children: [] }; const stack = [root];
    for (const r of recs) {
      while (stack.length > 1 && stack[stack.length - 1].level >= r.level) stack.pop();
      stack[stack.length - 1].children.push(r); stack.push(r);
    }
    return root.children;
  }

  function wstr(u8, off, len) {
    let s = ''; const d = dv(u8);
    for (let i = 0; i < len && off + i * 2 + 1 < u8.length; i++) s += String.fromCharCode(d.getUint16(off + i * 2, true));
    return s;
  }
  const colorref = (v) => '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('');

  function readDocInfo(u8) {
    const recs = records(u8);
    const info = { faces: [], hangulCount: 0, chars: [], paras: [], bins: [], borderFills: [] };
    for (const r of recs) {
      const d = dv(r.data);
      if (r.tag === T.ID_MAPPINGS && r.data.length >= 8) info.hangulCount = d.getInt32(4, true);
      else if (r.tag === T.FACE_NAME && r.data.length >= 3) {
        const len = d.getUint16(1, true); info.faces.push(wstr(r.data, 3, len));
      } else if (r.tag === T.BIN_DATA && r.data.length >= 2) {
        const prop = d.getUint16(0, true); const type = prop & 0xf; let b = { type, comp: (prop >> 4) & 3 };
        if (type === 1 || type === 2) {
          b.id = d.getUint16(2, true); const el = d.getUint16(4, true); b.ext = wstr(r.data, 6, el).toLowerCase();
        }
        info.bins.push(b);
      } else if (r.tag === T.BORDER_FILL) {
        info.borderFills.push(parseBorderFill(r.data));
      } else if (r.tag === T.CHAR_SHAPE && r.data.length >= 60) {
        const prop = d.getUint32(46, true);
        const shade = d.getUint32(60, true);
        info.chars.push({
          face: d.getUint16(0, true), size: d.getInt32(42, true) / 100,
          italic: !!(prop & 1), bold: !!(prop & 2), underline: ((prop >> 2) & 3) !== 0,
          sup: !!(prop & (1 << 15)), sub: !!(prop & (1 << 16)), strike: ((prop >> 18) & 7) !== 0,
          color: colorref(d.getUint32(52, true)),
          shade: (shade === 0xffffffff || (shade & 0xffffff) === 0xffffff) ? null : colorref(shade),
        });
      } else if (r.tag === T.PARA_SHAPE && r.data.length >= 28) {
        const p1 = d.getUint32(0, true);
        let ls = d.getInt32(24, true), lsType = p1 & 3;
        if (r.data.length >= 54) { lsType = d.getUint32(46, true) & 0x1f; ls = d.getUint32(50, true); }
        info.paras.push({
          align: ['justify', 'left', 'right', 'center', 'justify', 'justify'][(p1 >> 2) & 7] || 'justify',
          left: d.getInt32(4, true), right: d.getInt32(8, true), indent: d.getInt32(12, true),
          prev: d.getInt32(16, true), next: d.getInt32(20, true), lsType, ls,
        });
      }
    }
    return info;
  }

  function parseBorderFill(u8) {
    // 속성(2) + 4방향 선 (종류1,굵기1,색4) ×4 + 대각선(6) + 채우기
    const d = dv(u8); const bf = { borders: [], fill: null };
    try {
      let p = 2;
      for (let i = 0; i < 4; i++) { bf.borders.push(u8[p]); p += 6; }
      p += 6; // diagonal
      const ftype = d.getUint32(p, true); p += 4;
      if (ftype & 1) { const c = d.getUint32(p, true); if (c !== 0xffffffff) bf.fill = colorref(c); }
    } catch (e) { /* 부분 손상 무시 */ }
    return bf;
  }

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function cssFont(name) { return Fonts.css(name); }

  function charStyle(cs, info) {
    if (!cs) return '';
    const st = [];
    const face = info.faces[cs.face];
    if (face) st.push('font-family:' + cssFont(face));
    if (cs.size) st.push('font-size:' + cs.size + 'pt');
    if (cs.bold) st.push('font-weight:bold');
    if (cs.italic) st.push('font-style:italic');
    const dec = []; if (cs.underline) dec.push('underline'); if (cs.strike) dec.push('line-through');
    if (dec.length) st.push('text-decoration:' + dec.join(' '));
    if (cs.color && cs.color !== '#000000') st.push('color:' + cs.color);
    if (cs.shade) st.push('background-color:' + cs.shade);
    if (cs.sup) st.push('vertical-align:super;font-size:' + (cs.size * 0.7).toFixed(1) + 'pt');
    if (cs.sub) st.push('vertical-align:sub;font-size:' + (cs.size * 0.7).toFixed(1) + 'pt');
    return st.join(';');
  }

  // HWP 문단모양 여백 값은 HWPUNIT의 2배 단위로 저장됨 → px = v/2/75
  function paraStyle(ps) {
    if (!ps) return '';
    const st = ['text-align:' + ps.align];
    const px = (v) => (v / 150).toFixed(1) + 'px';
    // 내어쓰기(음수)는 첫 줄만 왼쪽 여백에서 시작하고 나머지 줄을 들여 놓는다
    const left = ps.left + (ps.indent < 0 ? -ps.indent : 0);
    if (left) st.push('margin-left:' + px(left));
    if (ps.right) st.push('margin-right:' + px(ps.right));
    if (ps.indent) st.push('text-indent:' + px(ps.indent));
    if (ps.prev) st.push('margin-top:' + px(ps.prev));
    if (ps.next) st.push('margin-bottom:' + px(ps.next));
    if (ps.lsType === 0 && ps.ls > 0) st.push('line-height:' + (ps.ls / 100).toFixed(2));
    return st.join(';');
  }

  function read(buffer) {
    const cfb = CFB.read(new Uint8Array(buffer), { type: 'array' });
    const get = (path) => { const e = CFB.find(cfb, path); return e && e.content ? new Uint8Array(e.content) : null; };
    const fh = get('/FileHeader');
    if (!fh) throw new Error('HWP 파일 형식이 아닙니다. (FileHeader 없음)');
    const sig = new TextDecoder('ascii').decode(fh.subarray(0, 17));
    if (!sig.startsWith('HWP Document File')) throw new Error('HWP 5.0 형식이 아닙니다. 한글 97 이하 파일은 한글에서 다시 저장해 주세요.');
    const prop = dv(fh).getUint32(36, true);
    if (prop & 2) throw new Error('암호가 걸린 문서입니다. 한글에서 암호를 해제한 뒤 열어 주세요.');
    if (prop & 4) throw new Error('배포용 문서는 편집할 수 없습니다. 한글에서 배포용 설정을 해제한 뒤 열어 주세요.');
    const compressed = !!(prop & 1);
    const unz = (u8) => compressed ? inflate(u8) : u8;
    const info = readDocInfo(unz(get('/DocInfo')));

    // 그림 데이터
    const images = {};
    info.bins.forEach((b, i) => {
      if (b.type !== 1 || !b.ext) return;
      const name = 'BIN' + b.id.toString(16).toUpperCase().padStart(4, '0') + '.' + b.ext;
      let raw = get('/BinData/' + name);
      if (!raw) return;
      if (b.comp === 1 || (b.comp === 0 && compressed)) raw = inflate(raw);
      images[i + 1] = { data: raw, ext: b.ext };
    });

    const page = { };
    let html = '';
    for (let s = 0; ; s++) {
      const sec = get('/BodyText/Section' + s);
      if (!sec) break;
      const nodes = tree(records(unz(sec)));
      html += renderList(nodes, info, images, page, s > 0);
    }
    return { html, page: page.w ? page : null };
  }

  function findPageDef(node, page) {
    for (const c of node.children) {
      if (c.tag === T.PAGE_DEF && c.data.length >= 36 && !page.w) {
        const d = dv(c.data); const u = (i) => d.getUint32(i, true) / 283.465;
        const attr = d.getUint32(36, true);
        Object.assign(page, { w: u(0), h: u(4), ml: u(8), mr: u(12), mt: u(16), mb: u(20), hd: u(24), ft: u(28), landscape: !!(attr & 1) });
      }
      findPageDef(c, page);
    }
  }

  function renderList(nodes, info, images, page, breakFirst) {
    let out = '';
    let first = true;
    for (const n of nodes) {
      if (n.tag !== T.PARA_HEADER) continue;
      out += renderPara(n, info, images, page, first && breakFirst);
      first = false;
    }
    return out;
  }

  function renderPara(p, info, images, page, forceBreak) {
    const d = dv(p.data);
    const psId = p.data.length >= 10 ? d.getUint16(8, true) : 0;
    const brk = p.data.length >= 12 ? p.data[11] : 0; // 단 나누기 종류: 4=쪽
    const pstyle = paraStyle(info.paras[psId]);
    let text = null, shapes = [[0, 0]]; const ctrls = [];
    for (const c of p.children) {
      if (c.tag === T.PARA_TEXT) text = c.data;
      else if (c.tag === T.PARA_CHAR_SHAPE) {
        shapes = []; const cd = dv(c.data);
        for (let i = 0; i + 8 <= c.data.length; i += 8) shapes.push([cd.getUint32(i, true), cd.getUint32(i + 4, true)]);
      } else if (c.tag === T.CTRL_HEADER) {
        const id = c.data.length >= 4 ? dv(c.data).getUint32(0, true) : 0;
        if (id === ctrlId('secd')) findPageDef(c, page);
        ctrls.push({ id, node: c });
      }
    }
    let out = ''; let cur = ''; let curStyle = null; let paraOpen = false; let ci = 0;
    const blocks = [];
    let pendingBreak = forceBreak || (brk & 4) || (brk & 8);
    const openP = () => { if (!paraOpen) { paraOpen = true; cur = ''; } };
    const flushSpan = (buf) => { if (!buf) return ''; return curStyle ? `<span style="${curStyle}">${buf}</span>` : buf; };
    let buf = '';
    const closeP = (force) => {
      cur += flushSpan(buf); buf = '';
      if (paraOpen || force) {
        blocks.push({ t: 'p', html: cur });
      }
      paraOpen = false; cur = '';
    };
    const styleAt = (pos) => {
      let id = shapes[0] ? shapes[0][1] : 0;
      for (const [sp, sid] of shapes) { if (sp <= pos) id = sid; else break; }
      return charStyle(info.chars[id], info);
    };
    if (text) {
      const u16 = new Uint16Array(text.buffer.slice(text.byteOffset, text.byteOffset + (text.byteLength & ~1)));
      let i = 0;
      openP();
      while (i < u16.length) {
        const st = styleAt(i);
        if (st !== curStyle) { cur += flushSpan(buf); buf = ''; curStyle = st; }
        const c = u16[i];
        if (c < 32) {
          if (EXT.has(c)) {
            // 확장 컨트롤 → 대응하는 CTRL_HEADER 순서대로
            const ctrl = ctrls[ci++];
            if (ctrl) {
              if (ctrl.id === C_TBL) { closeP(); blocks.push({ t: 'raw', html: renderTable(ctrl.node, info, images, page) }); openP(); }
              else if (ctrl.id === C_GSO) {
                const r = renderGso(ctrl.node, info, images, page);
                if (r.inline) buf += r.inline;
                if (r.blocks) { closeP(); blocks.push({ t: 'raw', html: r.blocks }); openP(); }
              } else if (ctrl.id === C_EQ) {
                const eq = findTag(ctrl.node, T.EQEDIT);
                if (eq && eq.data.length > 6) { const l = dv(eq.data).getUint16(4, true); buf += `<span class="eq" title="수식">${esc(wstr(eq.data, 6, l))}</span>`; }
              }
            }
            i += 8;
          } else if (INLINE.has(c)) {
            if (c === 9) buf += '\t';
            i += 8;
          } else {
            if (c === 10) buf += '<br>';
            else if (c === 24) buf += '-';
            else if (c === 30 || c === 31) buf += '&nbsp;';
            i += 1;
          }
        } else {
          let s = String.fromCharCode(c);
          buf += s === ' ' ? ' ' : esc(s);
          i += 1;
        }
      }
      closeP();
    } else {
      closeP(true);
    }
    // 빈 문단 처리 + 마지막 빈 조각 정리
    const hasRaw = blocks.some((b) => b.t === 'raw');
    const nonEmpty = blocks.filter((b) => !(hasRaw && b.t === 'p' && !b.html.replace(/<span[^>]*>|<\/span>/g, '').trim()));
    for (const b of nonEmpty) {
      if (b.t === 'raw') { out += b.html; continue; }
      let h = b.html.replace(/\t/g, '<span class="tab">\t</span>');
      h = h.replace(/  /g, ' &nbsp;');
      const cls = pendingBreak ? ' class="pb-before"' : '';
      out += `<p style="${pstyle}"${cls}>${h || '<br>'}</p>`;
      pendingBreak = false;
    }
    if (pendingBreak && out) out = out.replace(/^<(p|table)/, '<$1 class="pb-before"');
    return out;
  }

  function findTag(node, tag) {
    for (const c of node.children) { if (c.tag === tag) return c; const f = findTag(c, tag); if (f) return f; }
    return null;
  }
  function findAll(node, tag, acc = []) {
    for (const c of node.children) { if (c.tag === tag) acc.push(c); findAll(c, tag, acc); }
    return acc;
  }

  function imgTag(binId, w, h, images) {
    const im = images[binId];
    if (!im) return '';
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', wmf: 'image/wmf', emf: 'image/emf' }[im.ext] || 'image/' + im.ext;
    if (im.ext === 'wmf' || im.ext === 'emf') return `<span class="ph" title="WMF/EMF 그림은 표시할 수 없습니다">[그림]</span>`;
    let b64 = ''; const u8 = im.data; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) b64 += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    const wh = (w > 0 && h > 0) ? ` width="${Math.round(w)}" height="${Math.round(h)}"` : '';
    return `<img src="data:${mime};base64,${btoa(b64)}"${wh} alt="">`;
  }

  function renderGso(node, info, images, page) {
    const d = dv(node.data);
    const w = node.data.length >= 24 ? d.getUint32(16, true) / 75 : 0;
    const h = node.data.length >= 24 ? d.getUint32(20, true) / 75 : 0;
    const pics = findAll(node, T.SHAPE_PICTURE);
    let inline = '';
    for (const pr of pics) {
      if (pr.data.length < 73) continue;
      const bid = dv(pr.data).getUint16(71, true);
      inline += imgTag(bid, pics.length === 1 ? w : 0, pics.length === 1 ? h : 0, images);
    }
    // 글상자 등 도형 안의 글
    let blocks = '';
    const lists = findAll(node, T.LIST_HEADER);
    if (lists.length) {
      for (const lh of lists) {
        const parent = findParent(node, lh);
        const sib = parent ? parent.children : [];
        const idx = sib.indexOf(lh);
        let paras = lh.children.filter((c) => c.tag === T.PARA_HEADER);
        if (!paras.length) {
          for (let k = idx + 1; k < sib.length && sib[k].tag === T.PARA_HEADER; k++) paras.push(sib[k]);
        }
        const inner = paras.map((pp) => renderPara(pp, info, images, page, false)).join('');
        if (inner.replace(/<[^>]+>|&nbsp;|\s/g, '')) blocks += `<div class="textbox">${inner}</div>`;
      }
    }
    return { inline, blocks };
  }
  function findParent(root, target) {
    for (const c of root.children) { if (c === target) return root; const f = findParent(c, target); if (f) return f; }
    return null;
  }

  function renderTable(node, info, images, page) {
    const tb = node.children.find((c) => c.tag === T.TABLE);
    let rows = 0, cols = 0;
    if (tb && tb.data.length >= 8) { const d = dv(tb.data); rows = d.getUint16(4, true); cols = d.getUint16(6, true); }
    const cells = [];
    const kids = node.children;
    for (let k = 0; k < kids.length; k++) {
      const lh = kids[k];
      if (lh.tag !== T.LIST_HEADER) continue;
      const d = dv(lh.data);
      const cell = { col: 0, row: cells.length ? null : 0, cs: 1, rs: 1, w: 0, h: 0, bf: 0 };
      if (lh.data.length >= 34) {
        cell.col = d.getUint16(8, true); cell.row = d.getUint16(10, true);
        cell.cs = d.getUint16(12, true) || 1; cell.rs = d.getUint16(14, true) || 1;
        cell.w = d.getUint32(16, true); cell.h = d.getUint32(20, true); cell.bf = d.getUint16(32, true);
      }
      let paras = lh.children.filter((c) => c.tag === T.PARA_HEADER);
      if (!paras.length) for (let j = k + 1; j < kids.length && kids[j].tag === T.PARA_HEADER; j++) paras.push(kids[j]);
      cell.html = paras.map((pp) => renderPara(pp, info, images, page, false)).join('') || '<p><br></p>';
      cells.push(cell);
    }
    if (!rows) rows = Math.max(1, ...cells.map((c) => (c.row || 0) + c.rs));
    // 행별로 정렬
    const byRow = Array.from({ length: rows }, () => []);
    cells.forEach((c) => { const r = Math.min(Math.max(c.row || 0, 0), rows - 1); byRow[r].push(c); });
    byRow.forEach((r) => r.sort((a, b) => a.col - b.col));
    // 열 너비(HWPUNIT) 추정
    const colW = new Array(cols || 1).fill(0);
    cells.forEach((c) => { if (c.cs === 1 && c.col < colW.length && c.w) colW[c.col] = Math.max(colW[c.col], c.w); });
    const total = colW.reduce((a, b) => a + b, 0);
    let html = '<table class="hwp-table"';
    html += total ? ` style="width:${Math.round(total / 75)}px">` : '>';
    if (total && colW.every((x) => x > 0)) html += '<colgroup>' + colW.map((w) => `<col style="width:${Math.round(w / 75)}px">`).join('') + '</colgroup>';
    for (const r of byRow) {
      html += '<tr>';
      for (const c of r) {
        const bf = info.borderFills[c.bf - 1];
        const st = [];
        if (bf && bf.fill && bf.fill !== '#ffffff') st.push('background-color:' + bf.fill);
        if (bf && bf.borders.every((b) => b === 0)) st.push('border-style:dotted;border-color:#d6dae3');
        if (c.h) st.push('height:' + Math.round(c.h / 75) + 'px');
        html += `<td${c.cs > 1 ? ` colspan="${c.cs}"` : ''}${c.rs > 1 ? ` rowspan="${c.rs}"` : ''}${st.length ? ` style="${st.join(';')}"` : ''}>${c.html}</td>`;
      }
      html += '</tr>';
    }
    return html + '</table>';
  }

  return { read };
})();
