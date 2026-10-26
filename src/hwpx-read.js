/* ===== HWPX(OWPML) 읽기 → 편집용 HTML ===== */
const HWPXReader = (() => {
  const kids = (el, name) => el ? Array.from(el.children).filter((c) => !name || c.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const desc = (el, name) => el ? Array.from(el.getElementsByTagNameNS('*', name)) : [];
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };

  function parseHeader(doc) {
    const H = { fonts: {}, chars: {}, paras: {}, bfs: {} };
    // 한글 글꼴 목록
    for (const ff of desc(doc, 'fontface')) {
      if ((ff.getAttribute('lang') || '').toUpperCase() !== 'HANGUL') continue;
      for (const f of kids(ff, 'font')) H.fonts[f.getAttribute('id')] = f.getAttribute('face');
    }
    for (const bf of desc(doc, 'borderFill')) {
      const sides = ['leftBorder', 'rightBorder', 'topBorder', 'bottomBorder'].map((n) => kid(bf, n));
      const none = sides.every((s) => !s || (s.getAttribute('type') || 'NONE') === 'NONE');
      const wb = desc(bf, 'winBrush')[0];
      let fill = wb ? wb.getAttribute('faceColor') : null;
      if (!fill || fill === 'none' || /^#?ffffff$/i.test(fill)) fill = null;
      H.bfs[bf.getAttribute('id')] = { none, fill };
    }
    for (const cp of desc(doc, 'charPr')) {
      const fr = kid(cp, 'fontRef');
      const ul = kid(cp, 'underline'), so = kid(cp, 'strikeout');
      const shade = cp.getAttribute('shadeColor');
      H.chars[cp.getAttribute('id')] = {
        size: num(cp.getAttribute('height'), 1000) / 100,
        color: cp.getAttribute('textColor') || '#000000',
        shade: shade && shade !== 'none' && !/^#?ffffff$/i.test(shade) ? shade : null,
        face: fr ? H.fonts[fr.getAttribute('hangul')] : null,
        bold: !!kid(cp, 'bold'), italic: !!kid(cp, 'italic'),
        underline: !!ul && (ul.getAttribute('type') || 'NONE') !== 'NONE',
        strike: !!so && !['NONE', '3D'].includes(so.getAttribute('shape') || 'NONE'),
        sup: !!kid(cp, 'supscript'), sub: !!kid(cp, 'subscript'),
      };
    }
    for (const pp of desc(doc, 'paraPr')) {
      const al = kid(pp, 'align');
      // hp:switch 안의 hp:case(HwpUnitChar) 값 우선, 없으면 일반 값
      const sw = desc(pp, 'case')[0];
      const scope = sw || pp;
      const m = desc(scope, 'margin')[0];
      const ls = desc(scope, 'lineSpacing')[0];
      const mv = (n) => { const e = m ? kid(m, n) : null; return e ? num(e.getAttribute('value')) : 0; };
      H.paras[pp.getAttribute('id')] = {
        align: ({ LEFT: 'left', RIGHT: 'right', CENTER: 'center', JUSTIFY: 'justify', DISTRIBUTE: 'justify', DISTRIBUTE_SPACE: 'justify' })[al ? al.getAttribute('horizontal') : 'JUSTIFY'] || 'justify',
        indent: mv('intent'), left: mv('left'), right: mv('right'), prev: mv('prev'), next: mv('next'),
        lsType: ls ? ls.getAttribute('type') : 'PERCENT', ls: ls ? num(ls.getAttribute('value'), 160) : 160,
        breakBefore: (desc(pp, 'breakSetting')[0] || { getAttribute: () => '0' }).getAttribute('pageBreakBefore') === '1',
      };
    }
    return H;
  }

  function charStyle(c) {
    if (!c) return '';
    const st = [];
    if (c.face) st.push('font-family:' + Fonts.css(c.face));
    st.push('font-size:' + c.size + 'pt');
    if (c.bold) st.push('font-weight:bold');
    if (c.italic) st.push('font-style:italic');
    const dec = []; if (c.underline) dec.push('underline'); if (c.strike) dec.push('line-through');
    if (dec.length) st.push('text-decoration:' + dec.join(' '));
    if (c.color && !/^#?000000$/.test(c.color)) st.push('color:' + c.color);
    if (c.shade) st.push('background-color:' + c.shade);
    if (c.sup) st.push('vertical-align:super');
    if (c.sub) st.push('vertical-align:sub');
    return st.join(';');
  }
  function paraStyle(p) {
    if (!p) return '';
    const px = (v) => (v / 75).toFixed(1) + 'px';
    const st = ['text-align:' + p.align];
    const left = p.left + (p.indent < 0 ? -p.indent : 0);
    if (left) st.push('margin-left:' + px(left));
    if (p.right) st.push('margin-right:' + px(p.right));
    if (p.indent) st.push('text-indent:' + px(p.indent));
    if (p.prev) st.push('margin-top:' + px(p.prev));
    if (p.next) st.push('margin-bottom:' + px(p.next));
    if (p.lsType === 'PERCENT' && p.ls) st.push('line-height:' + (p.ls / 100).toFixed(2));
    return st.join(';');
  }

  async function read(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const txt = async (n) => { const f = zip.file(n); return f ? f.async('string') : null; };
    const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const headerXml = await txt('Contents/header.xml');
    if (!headerXml) throw new Error('HWPX 파일 구조가 올바르지 않습니다. (header.xml 없음)');
    const H = parseHeader(parse(headerXml));
    // 그림 목록(manifest)
    const bin = {};
    const hpf = await txt('Contents/content.hpf');
    let sectionFiles = [];
    if (hpf) {
      const hd = parse(hpf);
      for (const it of desc(hd, 'item')) {
        const href = it.getAttribute('href') || '';
        bin[it.getAttribute('id')] = { href, type: it.getAttribute('media-type') };
      }
      const spine = desc(hd, 'itemref').map((r) => bin[r.getAttribute('idref')]).filter((x) => x && /section\d+\.xml$/i.test(x.href)).map((x) => x.href);
      sectionFiles = spine;
    }
    if (!sectionFiles.length) {
      sectionFiles = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
        .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
    }
    const imgCache = {};
    async function imgData(id) {
      if (imgCache[id] !== undefined) return imgCache[id];
      const m = bin[id]; let path = m ? m.href : null;
      if (!path) { const f = Object.keys(zip.files).find((n) => n.startsWith('BinData/' + id + '.')); path = f; }
      const f = path && (zip.file(path) || zip.file(path.replace(/^\//, '')));
      if (!f) return (imgCache[id] = null);
      const ext = path.split('.').pop().toLowerCase();
      const mime = (m && m.type) || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp' })[ext] || 'image/' + ext;
      if (/wmf|emf/.test(ext)) return (imgCache[id] = 'unsupported');
      return (imgCache[id] = 'data:' + mime + ';base64,' + await f.async('base64'));
    }

    const ctx = { H, imgData, page: null, hf: null };
    let html = '';
    for (let i = 0; i < sectionFiles.length; i++) {
      const s = await txt(sectionFiles[i]);
      if (!s) continue;
      const doc = parse(s);
      if (doc.getElementsByTagName('parsererror').length) throw new Error('본문 XML을 읽을 수 없습니다: ' + sectionFiles[i]);
      const root = doc.documentElement;
      let body = '';
      for (const p of kids(root, 'p')) body += await renderPara(p, ctx);
      if (i > 0) body = body.replace(/^<(p|table|div)/, '<$1 class="pb-before"');
      html += body;
    }
    return { html, page: ctx.page, hf: ctx.hf };
  }

  function readSecPr(sp, ctx) {
    if (ctx.page) return;
    const pp = kid(sp, 'pagePr'); if (!pp) return;
    const m = kid(pp, 'margin');
    const mm = (v) => num(v) / 283.465;
    const g = (n) => m ? mm(m.getAttribute(n)) : 0;
    ctx.page = { w: mm(pp.getAttribute('width')), h: mm(pp.getAttribute('height')), landscape: pp.getAttribute('landscape') === 'NARROWLY',
      ml: g('left'), mr: g('right'), mt: g('top'), mb: g('bottom'), hd: g('header'), ft: g('footer') };
  }

  const u32 = (v) => { let n = num(v); if (n > 2147483647) n -= 4294967296; return n; };
  function placement(el) {
    const pos = kid(el, 'pos');
    const g = (k, d) => (pos && pos.getAttribute(k)) || d;
    return {
      inline: g('treatAsChar', '1') === '1',
      wrap: ({ SQUARE: 'square', TOP_AND_BOTTOM: 'block', IN_FRONT_OF_TEXT: 'front', BEHIND_TEXT: 'behind' })[el.getAttribute('textWrap')] || 'square',
      vrel: g('vertRelTo', 'PARA'), hrel: g('horzRelTo', 'COLUMN'), valign: g('vertAlign', 'TOP'), halign: g('horzAlign', 'LEFT'),
      vo: u32(g('vertOffset', 0)) / 75, ho: u32(g('horzOffset', 0)) / 75,
    };
  }
  const sizeOf = (el) => { const sz = kid(el, 'sz') || kid(el, 'curSz'); return { w: sz ? num(sz.getAttribute('width')) / 75 : 0, h: sz ? num(sz.getAttribute('height')) / 75 : 0 }; };
  // 떠 있는 개체 감싸개. 위치(data-pos)는 화면 배치 뒤 편집기에서 문단 기준 좌표로 바꾼다.
  function fobj(pl, w, h, inner, attrs = '') {
    const wrap = pl.wrap;
    let st = `width:${Math.round(w)}px;height:${Math.round(h)}px`;
    let al = '';
    if (wrap === 'square' || wrap === 'block') { al = ({ RIGHT: 'right', CENTER: 'center' })[pl.halign] || 'left'; }
    return `<span class="fobj" contenteditable="false" data-wrap="${wrap}"${al ? ` data-align="${al}"` : ''} data-pos="${[pl.vrel, pl.hrel, pl.valign, pl.halign, pl.vo.toFixed(1), pl.ho.toFixed(1)].join(',')}" style="${st}"${attrs}>${inner}</span>`;
  }
  async function shapeHtml(el, ctx) {
    const n = el.localName;
    const pl = placement(el); const { w, h } = sizeOf(el);
    const ls = kid(el, 'lineShape');
    const lsty = ls ? ls.getAttribute('style') : 'NONE';
    const stroke = ls && lsty !== 'NONE' && num(ls.getAttribute('width')) > 0 ? ls.getAttribute('color') : '';
    const sw = stroke ? Math.max(1, Math.round(num(ls.getAttribute('width')) / 75 * 10) / 10) : 0;
    const wb = desc(el, 'winBrush').find((b) => b.parentNode && b.parentNode.parentNode === el);
    let fill = wb ? wb.getAttribute('faceColor') : '';
    if (!fill || fill === 'none') fill = '';
    if (n === 'line') {
      const arrow = ls && /ARROW|SPEAR/.test(ls.getAttribute('tailStyle') || '');
      const col = stroke || '#000000'; const lw = sw || 1;
      const svg = `<svg width="100%" height="100%" viewBox="0 0 ${Math.max(1, w)} ${Math.max(lw * 4, 8)}" preserveAspectRatio="none"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="${col}" stroke-width="${lw}"${lsty === 'DASH' ? ` stroke-dasharray="${lw * 3} ${lw * 2}"` : ''}/></svg>`;
      if (pl.inline) return { inline: `<span style="display:inline-block;width:${Math.round(w)}px;height:${Math.max(4, lw * 4)}px">${svg}</span>` };
      return { html: fobj(pl, w, Math.max(lw * 4, 8), svg, ` data-kind="line"${arrow ? ' data-arrow="1"' : ''}`) };
    }
    const dt = kid(el, 'drawText');
    let inner = '', va = 'TOP', pad = 0;
    if (dt) {
      const sl = kid(dt, 'subList'); va = sl ? sl.getAttribute('vertAlign') || 'TOP' : 'TOP';
      const tm = kid(dt, 'textMargin'); pad = tm ? num(tm.getAttribute('left')) / 75 : 0;
      if (sl) for (const ip of kids(sl, 'p')) inner += await renderPara(ip, ctx);
    } else {
      for (const sl of desc(el, 'subList')) for (const ip of kids(sl, 'p')) inner += await renderPara(ip, ctx);
    }
    const hasText = inner.replace(/<[^>]+>|&nbsp;|\s/g, '');
    // 그림으로 채운 도형(로고 등)은 그림 개체로
    const fb = kid(el, 'fillBrush'); const ib = fb && kid(fb, 'imgBrush'); const bimg = ib && desc(ib, 'img')[0];
    if (bimg && !hasText) {
      const src = await ctx.imgData(bimg.getAttribute('binaryItemIDRef'));
      if (src && src !== 'unsupported') {
        if (pl.inline) return { inline: `<img src="${src}" width="${Math.round(w)}" height="${Math.round(h)}" alt="">` };
        return { html: fobj(pl, w, h, `<img src="${src}" alt="">`) };
      }
    }
    if (!['rect', 'ellipse'].includes(n)) return hasText ? { block: `<div class="textbox">${inner}</div>` } : {};
    if (pl.inline) return hasText ? { block: `<div class="textbox">${inner}</div>` } : {};
    const ratio = num(el.getAttribute('ratio'), 0);
    const radius = n === 'ellipse' ? '50%' : ratio ? Math.round(Math.min(w, h) * ratio / 100) + 'px' : '0';
    const bst = [`padding:${Math.round(pad)}px`, `justify-content:${({ CENTER: 'center', BOTTOM: 'flex-end' })[va] || 'flex-start'}`, `border-radius:${radius}`];
    if (fill) bst.push('background-color:' + fill);
    if (stroke) bst.push(`border:${sw}px ${lsty === 'DASH' ? 'dashed' : 'solid'} ${stroke}`);
    return { html: fobj(pl, w, h, `<div class="tbox" contenteditable="true" style="${bst.join(';')}">${hasText ? inner : '<p><br></p>'}</div>`, n === 'ellipse' ? ' data-kind="ellipse"' : '') };
  }

  function plain(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); }
  async function headerFooter(el, ctx, which) {
    const sl = kid(el, 'subList'); if (!sl) return;
    const hf = ctx.hf || (ctx.hf = {});
    const texts = [];
    for (const ip of kids(sl, 'p')) {
      const nums = desc(ip, 'autoNum').filter((a) => /PAGE/.test(a.getAttribute('numType') || ''));
      const pp = ctx.H.paras[ip.getAttribute('paraPrIDRef')];
      const align = pp ? (pp.align === 'justify' ? 'left' : pp.align) : 'center';
      if (nums.length) {
        const t = desc(ip, 't').map((x) => x.textContent).join('');
        const fmt = nums.some((a) => a.getAttribute('numType') === 'TOTAL_PAGE') ? 'total' : /-/.test(t) ? 'dash' : /쪽/.test(t) ? 'jjok' : 'n';
        hf.pnum = { pos: (which === 'header' ? 'top-' : 'bottom-') + align, fmt };
      } else {
        const t = plain(await renderPara(ip, ctx));
        if (t) { texts.push(t); if (!hf[which]) hf[which] = { align }; }
      }
    }
    if (texts.length) hf[which] = Object.assign(hf[which] || {}, { text: texts.join(' ') });
  }

  async function renderPara(p, ctx) {
    const { H } = ctx;
    const pp = H.paras[p.getAttribute('paraPrIDRef')];
    const pst = paraStyle(pp);
    const blocks = []; let cur = ''; let linkOpen = false;
    const pageBreak = p.getAttribute('pageBreak') === '1' || (pp && pp.breakBefore);
    const flush = (force) => { if (linkOpen) { cur += '</a>'; linkOpen = false; } if (cur || force) blocks.push({ t: 'p', html: cur }); cur = ''; };
    for (const run of kids(p, 'run')) {
      const st = charStyle(H.chars[run.getAttribute('charPrIDRef')]);
      for (const el of Array.from(run.children)) {
        const n = el.localName;
        if (n === 't') {
          let s = '';
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === 3) s += esc(node.nodeValue);
            else if (node.nodeType === 1) {
              const ln = node.localName;
              if (ln === 'tab') s += '<span class="tab">\t</span>';
              else if (ln === 'lineBreak') s += '<br>';
              else if (ln === 'nbSpace' || ln === 'fwSpace') s += '&nbsp;';
              else if (ln === 'hyphen') s += '-';
              else if (node.textContent) s += esc(node.textContent);
            }
          }
          if (s) { s = s.replace(/ {2}/g, ' &nbsp;'); cur += st ? `<span style="${st}">${s}</span>` : s; }
        } else if (n === 'secPr') readSecPr(el, ctx);
        else if (n === 'ctrl') {
          for (const c of Array.from(el.children)) {
            const cn = c.localName;
            if (cn === 'header' || cn === 'footer') await headerFooter(c, ctx, cn);
            else if (cn === 'fieldBegin' && c.getAttribute('type') === 'HYPERLINK') {
              const path = desc(c, 'stringParam').find((x) => x.getAttribute('name') === 'Path');
              const url = (path && path.textContent) || c.getAttribute('name') || '';
              if (/^(https?:|mailto:)/i.test(url)) { if (linkOpen) cur += '</a>'; cur += `<a href="${esc(url).replace(/"/g, '&quot;')}">`; linkOpen = true; }
            } else if (cn === 'fieldEnd') { if (linkOpen) { cur += '</a>'; linkOpen = false; } }
            else if (cn === 'footNote' || cn === 'endNote') {
              let t = '';
              for (const sl of desc(c, 'subList')) for (const ip of kids(sl, 'p')) t += ' ' + desc(ip, 't').map((x) => x.textContent).join('');
              cur += `<span class="fn" contenteditable="false" data-note="${esc(t.trim()).replace(/"/g, '&quot;')}"></span>`;
            } else if (cn === 'pageNum') {
              const pos = (c.getAttribute('pos') || 'BOTTOM_CENTER').toLowerCase().replace('_', '-');
              if (!/none/.test(pos)) { ctx.hf = ctx.hf || {}; if (!ctx.hf.pnum) ctx.hf.pnum = { pos, fmt: c.getAttribute('sideChar') ? 'dash' : 'n' }; }
            }
          }
        } else if (n === 'tbl') { flush(false); blocks.push({ t: 'raw', html: await renderTable(el, ctx) }); }
        else if (n === 'pic') {
          const img = desc(el, 'img')[0];
          const sz = kid(el, 'curSz') || kid(el, 'sz');
          const w = sz ? num(sz.getAttribute('width')) / 75 : 0, h = sz ? num(sz.getAttribute('height')) / 75 : 0;
          const src = img ? await ctx.imgData(img.getAttribute('binaryItemIDRef')) : null;
          const pl = placement(el);
          if (src === 'unsupported') cur += '<span class="ph" title="WMF/EMF 그림은 표시할 수 없습니다">[그림]</span>';
          else if (src) {
            const wh = w && h ? ` width="${Math.round(w)}" height="${Math.round(h)}"` : '';
            if (pl.inline) cur += `<img src="${src}"${wh} alt="">`;
            else if (pl.wrap === 'square') cur += `<img src="${src}"${wh} alt="" data-wrap="square" style="float:${pl.halign === 'RIGHT' ? 'right' : 'left'}">`;
            else if (pl.wrap === 'block') cur += `<img src="${src}"${wh} alt="" data-wrap="block" data-align="${({ RIGHT: 'right', CENTER: 'center' })[pl.halign] || 'left'}">`;
            else cur += fobj(pl, w, h, `<img src="${src}" alt="">`);
          }
        } else if (n === 'equation') {
          const sc = desc(el, 'script')[0];
          if (sc) cur += `<span class="eq" title="수식">${esc(sc.textContent)}</span>`;
        } else if (['rect', 'ellipse', 'line', 'polygon', 'container', 'curve', 'arc'].includes(n)) {
          const r = await shapeHtml(el, ctx);
          if (r.inline) cur += r.inline;
          if (r.html) cur += r.html;
          if (r.block) { flush(false); blocks.push({ t: 'raw', html: r.block }); }
        }
      }
    }
    flush(!blocks.length);
    let out = ''; let first = true;
    for (const b of blocks) {
      // 떠 있는 개체(글상자 안에 문단이 있음)를 품은 문단은 <div>로 — <p> 안에는 블록을 넣을 수 없음
      const tag = b.t !== 'raw' && /class="fobj"/.test(b.html) ? 'div' : 'p';
      let h = b.t === 'raw' ? b.html : `<${tag} style="${pst}">${b.html || '<br>'}</${tag}>`;
      if (first && pageBreak) h = h.replace(/^<(p|table|div)/, '<$1 class="pb-before"');
      out += h; first = false;
    }
    return out;
  }

  async function renderTable(tbl, ctx) {
    const { H } = ctx;
    const tblBf = H.bfs[tbl.getAttribute('borderFillIDRef')];
    const rows = kids(tbl, 'tr');
    // 열 너비
    const colCnt = num(tbl.getAttribute('colCnt'), 0);
    const colW = new Array(colCnt).fill(0);
    for (const tr of rows) for (const tc of kids(tr, 'tc')) {
      const a = kid(tc, 'cellAddr'), sp = kid(tc, 'cellSpan'), sz = kid(tc, 'cellSz');
      if (a && sp && sz && num(sp.getAttribute('colSpan'), 1) === 1) {
        const c = num(a.getAttribute('colAddr')); if (c < colCnt) colW[c] = Math.max(colW[c], num(sz.getAttribute('width')));
      }
    }
    const total = colW.reduce((a, b) => a + b, 0);
    let html = `<table class="hwp-table${tblBf && tblBf.none ? ' noborder' : ''}"${total ? ` style="width:${Math.round(total / 75)}px"` : ''}>`;
    if (total && colW.every((x) => x > 0)) html += '<colgroup>' + colW.map((w) => `<col style="width:${Math.round(w / 75)}px">`).join('') + '</colgroup>';
    for (const tr of rows) {
      html += '<tr>';
      for (const tc of kids(tr, 'tc')) {
        const sp = kid(tc, 'cellSpan'), sz = kid(tc, 'cellSz');
        const cs = sp ? num(sp.getAttribute('colSpan'), 1) : 1, rs = sp ? num(sp.getAttribute('rowSpan'), 1) : 1;
        const bf = H.bfs[tc.getAttribute('borderFillIDRef')];
        const st = [];
        if (bf && bf.fill) st.push('background-color:' + bf.fill);
        if (bf && bf.none) st.push('border-style:dotted;border-color:#d6dae3');
        if (sz && num(sz.getAttribute('height'))) st.push('height:' + Math.round(num(sz.getAttribute('height')) / 75) + 'px');
        const sl = kid(tc, 'subList');
        const va = sl ? (sl.getAttribute('vertAlign') || 'CENTER') : 'CENTER';
        st.push('vertical-align:' + ({ TOP: 'top', CENTER: 'middle', BOTTOM: 'bottom' }[va] || 'middle'));
        let inner = '';
        if (sl) for (const ip of kids(sl, 'p')) inner += await renderPara(ip, ctx);
        html += `<td${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''} style="${st.join(';')}">${inner || '<p><br></p>'}</td>`;
      }
      html += '</tr>';
    }
    return html + '</table>';
  }

  return { read };
})();
