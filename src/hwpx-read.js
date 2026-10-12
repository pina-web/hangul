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

    const ctx = { H, imgData, page: null };
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
    return { html, page: ctx.page };
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

  async function renderPara(p, ctx) {
    const { H } = ctx;
    const pp = H.paras[p.getAttribute('paraPrIDRef')];
    const pst = paraStyle(pp);
    const blocks = []; let cur = '';
    const pageBreak = p.getAttribute('pageBreak') === '1' || (pp && pp.breakBefore);
    const flush = (force) => { if (cur || force) blocks.push({ t: 'p', html: cur }); cur = ''; };
    let hadText = false;
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
          if (s) { hadText = true; s = s.replace(/ {2}/g, ' &nbsp;'); cur += st ? `<span style="${st}">${s}</span>` : s; }
        } else if (n === 'secPr') readSecPr(el, ctx);
        else if (n === 'tbl') { flush(false); blocks.push({ t: 'raw', html: await renderTable(el, ctx) }); }
        else if (n === 'pic') {
          const img = desc(el, 'img')[0];
          const sz = kid(el, 'curSz') || kid(el, 'sz');
          const w = sz ? num(sz.getAttribute('width')) / 75 : 0, h = sz ? num(sz.getAttribute('height')) / 75 : 0;
          const src = img ? await ctx.imgData(img.getAttribute('binaryItemIDRef')) : null;
          if (src === 'unsupported') cur += '<span class="ph" title="WMF/EMF 그림은 표시할 수 없습니다">[그림]</span>';
          else if (src) cur += `<img src="${src}"${w && h ? ` width="${Math.round(w)}" height="${Math.round(h)}"` : ''} alt="">`;
        } else if (n === 'equation') {
          const sc = desc(el, 'script')[0];
          if (sc) cur += `<span class="eq" title="수식">${esc(sc.textContent)}</span>`;
        } else if (['rect', 'ellipse', 'polygon', 'container', 'curve', 'arc'].includes(n)) {
          // 글상자 안의 문단만 살림
          const sub = desc(el, 'subList');
          let inner = '';
          for (const sl of sub) for (const ip of kids(sl, 'p')) inner += await renderPara(ip, ctx);
          if (inner.replace(/<[^>]+>|&nbsp;|\s/g, '')) { flush(false); blocks.push({ t: 'raw', html: `<div class="textbox">${inner}</div>` }); }
        }
      }
    }
    flush(!blocks.length);
    let out = ''; let first = true;
    for (const b of blocks) {
      let h = b.t === 'raw' ? b.html : `<p style="${pst}">${b.html || '<br>'}</p>`;
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
