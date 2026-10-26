/* ===== 디자인 ↔ 문서 변환, 디자인 내보내기·불러오기 ===== */
const LayerIO = (() => {
  const MMPX = 96 / 25.4;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const srcOf = (src, project) => (src && src.startsWith('asset:') ? (project.assets || {})[src.slice(6)] : src);
  const visible = (p) => (p.layers || []).filter((L) => !L.hidden);

  // 화면 밖 작업대 (그리기·측정용)
  function host() {
    let h = document.getElementById('hwpOff');
    if (!h) { h = document.createElement('div'); h.id = 'hwpOff'; h.setAttribute('aria-hidden', 'true'); h.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-1;'; document.body.appendChild(h); }
    return h;
  }
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('그림을 읽을 수 없습니다')); i.src = src; }); }

  /* ================= 문서 → 디자인 ================= */
  function fromDoc(ed, page, hf) {
    const P = Pager.layout(ed, page);
    const W = Math.round(page.w * MMPX), H = Math.round(page.h * MMPX);
    const project = { v: 1, w: W, h: H, assets: {}, pages: [] };
    const addAsset = (src) => { if (!src || !src.startsWith('data:')) return src; for (const k in project.assets) if (project.assets[k] === src) return 'asset:' + k; const id = Design.uid(); project.assets[id] = src; return 'asset:' + id; };
    P.starts.forEach(() => { const p = Design.newPage(); p.transition = { type: 'none', dur: 0.6 }; project.pages.push(p); });
    const er = P.er, z = P.z;
    const rel = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - er.left) / z, y: (r.top - er.top) / z, w: r.width / z, h: r.height / z }; };
    const ecs = getComputedStyle(ed);
    const base = { font: Fonts.first(ecs.fontFamily) || '함초롬바탕', size: parseFloat(ecs.fontSize) || 13.33, color: DocModel.rgbToHex(ecs.color) || '#000000', lh: (parseFloat(ecs.lineHeight) / parseFloat(ecs.fontSize)) || 1.6, align: 'left' };
    const contentX = page.ml * MMPX, contentW = (page.w - page.ml - page.mr) * MMPX;
    let fnNo = 0; const notes = {};
    const cleanClone = (el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('.fobj').forEach((n) => n.remove());
      c.querySelectorAll('.fn').forEach((n) => { fnNo++; (notes[curPage] = notes[curPage] || []).push(`${fnNo}) ${n.getAttribute('data-note') || ''}`); const s = document.createElement('sup'); s.textContent = fnNo + ')'; n.replaceWith(s); });
      c.querySelectorAll('.cell-sel').forEach((n) => n.classList.remove('cell-sel'));
      c.querySelectorAll('img.img-sel').forEach((n) => n.classList.remove('img-sel'));
      const fix = (orig, cl) => { if (/^H[1-6]$/.test(orig.tagName)) { const cs = getComputedStyle(orig); cl.style.fontSize = cs.fontSize; cl.style.fontWeight = cs.fontWeight; cl.style.marginTop = cs.marginTop; cl.style.marginBottom = cs.marginBottom; } };
      fix(el, c); el.querySelectorAll('h1,h2,h3,h4').forEach((o, i) => fix(o, c.querySelectorAll('h1,h2,h3,h4')[i]));
      return c.outerHTML;
    };
    let curPage = 0;
    const push = (k, L) => { (project.pages[k] || project.pages[project.pages.length - 1]).layers.push(L); };
    const textL = (html, x, y, w, extra) => Design.textLayer(html, Object.assign({ x: Math.round(x), y: Math.round(y), w: Math.round(w), font: base.font, size: Math.round(base.size * 100) / 100, color: base.color, lh: Math.round(base.lh * 100) / 100, align: 'left' }, extra));
    let group = null;
    const flush = () => {
      if (!group) return;
      push(group.k, textL(group.html.join(''), contentX, group.y, contentW, {}));
      group = null;
    };
    const isEmpty = (k) => !k.textContent.replace(/[\s ​]/g, '') && !k.querySelector('img, table, .fobj, .fn, svg');
    for (const k of Array.from(ed.children)) {
      if (k.classList.contains('pagebreak')) { flush(); continue; }
      const r = rel(k);
      const kp = P.pageOf(r.y); curPage = kp;
      const paperY = (y) => y - P.starts[kp] + P.top;
      // 떠 있는 개체
      k.querySelectorAll('.fobj').forEach((fo) => {
        const L = fromFobj(fo, rel(fo), paperY, addAsset, base);
        if (L) { if (fo.getAttribute('data-wrap') === 'behind') project.pages[kp].layers.unshift(L); else push(kp, L); }
      });
      if (isEmpty(k)) { flush(); continue; }
      if (k.tagName === 'TABLE') { flush(); push(kp, textL(cleanClone(k), r.x, paperY(r.y), r.w, {})); continue; }
      const imgs = Array.from(k.querySelectorAll('img')).filter((im) => !im.closest('.fobj'));
      const textOnly = k.cloneNode(true); textOnly.querySelectorAll('img, .fobj').forEach((n) => n.remove());
      if (imgs.length && !textOnly.textContent.replace(/[\s ​]/g, '') && !k.querySelector('table')) {
        flush();
        imgs.forEach((im) => { const ir = rel(im); push(kp, Design.imageLayer(addAsset(im.currentSrc || im.src), Math.round(ir.w), Math.round(ir.h), { x: Math.round(ir.x), y: Math.round(paperY(ir.y)), fit: 'fill' })); });
        continue;
      }
      const mt = parseFloat(getComputedStyle(k).marginTop) || 0;
      if (group && group.k === kp) group.html.push(cleanClone(k));
      else { flush(); group = { k: kp, y: paperY(r.y - mt), html: [cleanClone(k)] }; }
    }
    flush();
    // 머리말·꼬리말·쪽 번호·각주
    const small = Math.round(12 * 100) / 100;
    project.pages.forEach((pg, i) => {
      if (hf && hf.header && hf.header.text) pg.layers.push(textL(`<p>${esc(hf.header.text)}</p>`, contentX, page.mt * MMPX, contentW, { size: small, align: hf.header.align || 'center', name: '머리말', color: '#333333' }));
      if (hf && hf.footer && hf.footer.text) pg.layers.push(textL(`<p>${esc(hf.footer.text)}</p>`, contentX, H - (page.mb + page.ft) * MMPX + 4, contentW, { size: small, align: hf.footer.align || 'center', name: '꼬리말', color: '#333333' }));
      if (hf && hf.pnum && hf.pnum.pos && hf.pnum.pos !== 'none') {
        const [v, a] = hf.pnum.pos.split('-'); const n = i + 1, N = project.pages.length;
        const t = ({ dash: `- ${n} -`, total: `${n} / ${N}`, jjok: `${n}쪽` })[hf.pnum.fmt] || String(n);
        pg.layers.push(textL(`<p>${t}</p>`, contentX, v === 'top' ? page.mt * MMPX + 18 : H - page.mb * MMPX - 18, contentW, { size: small, align: a || 'center', name: '쪽 번호', color: '#333333' }));
      }
      if (notes[i]) pg.layers.push(textL(notes[i].map((t) => `<p>${esc(t)}</p>`).join(''), contentX, H - (page.mb + page.ft) * MMPX - 16 * (notes[i].length + 1), contentW, { size: 11, name: '각주', color: '#333333' }));
    });
    return project;
  }
  function fromFobj(fo, r, paperY, addAsset, base) {
    const rot = (/rotate\((-?[\d.]+)deg\)/.exec(fo.style.transform || '') || [0, 0])[1] * 1;
    const x = Math.round(r.x), y = Math.round(paperY(r.y));
    const w = Math.round(fo.offsetWidth || r.w), h = Math.round(fo.offsetHeight || r.h);
    const img = fo.querySelector(':scope > img');
    if (img) return Design.imageLayer(addAsset(img.currentSrc || img.src), w, h, { x, y, rot, fit: 'fill' });
    const kind = fo.getAttribute('data-kind');
    if (kind === 'line') {
      const ln = fo.querySelector('line');
      return Design.shapeLayer('line', { x, y, w, h: Math.max(h, 12), rot, stroke: (ln && ln.getAttribute('stroke')) || '#000000', sw: parseFloat((ln && ln.getAttribute('stroke-width')) || 2), arrowEnd: fo.getAttribute('data-arrow') === '1' });
    }
    const tb = fo.querySelector(':scope > .tbox'); if (!tb) return null;
    const cs = getComputedStyle(tb);
    const bg = DocModel.rgbToHex(cs.backgroundColor) || '';
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const stroke = bw && cs.borderTopStyle !== 'none' ? DocModel.rgbToHex(cs.borderTopColor) : '';
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const common = { x, y, w, h, rot, font: base.font, size: base.size, color: base.color, lh: base.lh, align: 'left', pad: parseFloat(cs.paddingLeft) || 0 };
    if (kind === 'ellipse' || stroke || rad) {
      return Design.shapeLayer(kind === 'ellipse' ? 'ellipse' : rad ? 'roundrect' : 'rect', Object.assign(common, { fill: bg, stroke, sw: bw, radius: rad, html: tb.innerHTML, valign: ({ center: 'middle', 'flex-end': 'bottom' })[cs.justifyContent] || 'top' }));
    }
    return Design.textLayer(tb.innerHTML, Object.assign(common, { bg, autoH: false }));
  }

  /* ================= 레이어 → 그림(PNG) ================= */
  // 회전·투명도·그림자·잘라 맞춤처럼 한글 개체로 그대로 옮길 수 없는 것은 그림으로 굽는다
  async function rasterLayer(L, project, scale = 2) {
    const w = Math.max(1, L.w), h = Math.max(1, L.h);
    let inner;
    if (L.type === 'image') {
      const img = await loadImg(srcOf(L.src, project));
      inner = document.createElement('canvas'); inner.width = Math.round(w * scale); inner.height = Math.round(h * scale);
      const g = inner.getContext('2d');
      const r = (+L.radius || 0) * scale;
      if (r) { g.beginPath(); g.roundRect ? g.roundRect(0, 0, inner.width, inner.height, r) : g.rect(0, 0, inner.width, inner.height); g.clip(); }
      if (L.flipH) { g.translate(inner.width, 0); g.scale(-1, 1); }
      const iw = img.naturalWidth, ih = img.naturalHeight; const fit = L.fit || 'cover';
      if (fit === 'fill') g.drawImage(img, 0, 0, inner.width, inner.height);
      else {
        const k = fit === 'cover' ? Math.max(inner.width / iw, inner.height / ih) : Math.min(inner.width / iw, inner.height / ih);
        const dw = iw * k, dh = ih * k; g.drawImage(img, (inner.width - dw) / 2, (inner.height - dh) / 2, dw, dh);
      }
      if (L.sw && L.stroke) { g.setTransform(1, 0, 0, 1, 0, 0); g.lineWidth = L.sw * scale * 2; g.strokeStyle = L.stroke; g.strokeRect(0, 0, inner.width, inner.height); }
    } else if (L.type === 'shape' && !L.html) {
      const svg = Motion.shapeSvg(Object.assign({}, L, { id: 'r' + L.id })).replace('<svg ', `<svg width="${w}" height="${h}" `).replace(/width="100%" height="100%" /, '');
      const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
      inner = document.createElement('canvas'); inner.width = Math.round(w * scale); inner.height = Math.round(h * scale);
      inner.getContext('2d').drawImage(img, 0, 0, inner.width, inner.height);
    } else {
      await Loader.need('html2canvas');
      const el = Motion.layerEl(Object.assign({}, L, { rot: 0, opacity: 1, shadow: false, x: 0, y: 0 }), { assets: project.assets });
      el.style.position = 'relative';
      const box = document.createElement('div'); box.style.cssText = `position:relative;width:${w}px;height:${h}px;`; box.appendChild(el);
      host().appendChild(box);
      try { inner = await html2canvas(box, { scale, backgroundColor: null, logging: false, useCORS: true }); } finally { box.remove(); }
    }
    const rad = (L.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
    const pad = L.shadow ? 16 : 0;
    const bw = w * c + h * s + pad * 2, bh = w * s + h * c + pad * 2;
    const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(bw * scale)); out.height = Math.max(1, Math.round(bh * scale));
    const g = out.getContext('2d');
    g.translate(out.width / 2, out.height / 2); g.rotate(rad);
    g.globalAlpha = L.opacity === undefined ? 1 : L.opacity;
    if (L.shadow) { g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 14 * scale; g.shadowOffsetY = 6 * scale; }
    g.drawImage(inner, -w * scale / 2, -h * scale / 2, w * scale, h * scale);
    return { src: out.toDataURL('image/png'), x: L.x + L.w / 2 - bw / 2, y: L.y + L.h / 2 - bh / 2, w: bw, h: bh };
  }

  /* ================= 디자인 → 한글(HWPX) ================= */
  async function textBlocks(L, project) {
    const el = Motion.layerEl(Object.assign({}, L, { rot: 0, x: 0, y: 0 }), { assets: project.assets });
    el.style.position = 'relative';
    if (L.type === 'shape') { el.style.height = L.h + 'px'; }
    host().appendChild(el);
    try { const t = el.querySelector('.ly-t'); return t ? DocModel.extract(t) : []; } finally { el.remove(); }
  }
  async function toHwpx(project, meta = {}) {
    const NATIVE = ['rect', 'roundrect', 'ellipse'];
    const pages = [];
    let plain = '';
    for (const pg of project.pages) {
      const objs = [];
      if (pg.bg && !/^#?f{6}$/i.test(pg.bg)) objs.push({ kind: 'box', shape: 'rect', wrap: 'behind', x: 0, y: 0, w: project.w, h: project.h, fill: pg.bg });
      if (pg.bgImage) { const r = await rasterLayer({ type: 'image', src: pg.bgImage, x: 0, y: 0, w: project.w, h: project.h, fit: 'cover' }, project, 1); objs.push({ kind: 'pic', wrap: 'behind', src: r.src, x: 0, y: 0, w: project.w, h: project.h }); }
      for (const L of visible(pg)) {
        const plainLayer = !(L.rot % 360) && (L.opacity === undefined || L.opacity >= 0.99) && !L.shadow;
        if (L.type === 'text') {
          if (!plainLayer) { const r = await rasterLayer(L, project); objs.push({ kind: 'pic', wrap: 'front', src: r.src, x: r.x, y: r.y, w: r.w, h: r.h }); continue; }
          const blocks = await textBlocks(L, project);
          plain += DocModel.plainText(blocks) + '\n';
          objs.push({ kind: 'box', shape: 'rect', wrap: 'front', x: L.x, y: L.y, w: L.w, h: L.h, fill: L.bg || '', pad: L.pad || 0, va: 'TOP', blocks });
        } else if (L.type === 'image') {
          const im = await loadImg(srcOf(L.src, project)).catch(() => null); if (!im) continue;
          const sameRatio = Math.abs(im.naturalWidth / im.naturalHeight - L.w / L.h) < 0.01;
          if (plainLayer && !L.radius && !L.flipH && !L.sw && (L.fit === 'fill' || sameRatio)) objs.push({ kind: 'pic', wrap: 'front', src: srcOf(L.src, project), x: L.x, y: L.y, w: L.w, h: L.h });
          else { const r = await rasterLayer(L, project); objs.push({ kind: 'pic', wrap: 'front', src: r.src, x: r.x, y: r.y, w: r.w, h: r.h }); }
        } else if (L.type === 'shape') {
          if (!plainLayer) { const r = await rasterLayer(L, project); objs.push({ kind: 'pic', wrap: 'front', src: r.src, x: r.x, y: r.y, w: r.w, h: r.h }); continue; }
          if (L.kind === 'line') { objs.push({ kind: 'line', wrap: 'front', x: L.x, y: L.y, w: L.w, h: L.h, stroke: L.stroke || '#000000', sw: L.sw || 2, arrow: !!L.arrowEnd, dash: !!L.dash }); continue; }
          const blocks = L.html ? await textBlocks(L, project) : null;
          if (blocks) plain += DocModel.plainText(blocks) + '\n';
          const va = ({ top: 'TOP', bottom: 'BOTTOM' })[L.valign] || 'CENTER';
          if (NATIVE.includes(L.kind)) {
            objs.push({ kind: 'box', shape: L.kind === 'ellipse' ? 'ellipse' : 'rect', wrap: 'front', x: L.x, y: L.y, w: L.w, h: L.h, fill: L.fill || '', stroke: L.sw ? L.stroke : '', sw: L.sw || 0, dash: !!L.dash, radius: L.kind === 'roundrect' ? L.radius || 0 : 0, blocks, va, pad: Math.min(L.w, L.h) * 0.06 });
          } else {
            const r = await rasterLayer(Object.assign({}, L, { html: '' }), project);
            objs.push({ kind: 'pic', wrap: 'front', src: r.src, x: r.x, y: r.y, w: r.w, h: r.h });
            if (blocks) objs.push({ kind: 'box', shape: 'rect', wrap: 'front', x: L.x, y: L.y, w: L.w, h: L.h, blocks, va, pad: Math.min(L.w, L.h) * 0.06 });
          }
        }
      }
      pages.push(objs);
    }
    return HWPXWriter.buildDesign(pages, { w: project.w, h: project.h }, Object.assign({ plain }, meta));
  }

  /* ================= 디자인 → 문서 화면(HTML) ================= */
  async function toDocHtml(project, mode = 'layout') {
    const page = { w: project.w / MMPX, h: project.h / MMPX, landscape: project.w > project.h, ml: 10, mr: 10, mt: 10, mb: 10, hd: 0, ft: 0 };
    let html = '';
    const ox = page.ml * MMPX, oy = (page.mt + page.hd) * MMPX;
    if (mode === 'flow') {
      const cw = (page.w - page.ml - page.mr) * MMPX;
      project.pages.forEach((pg, i) => {
        let part = '';
        const ls = visible(pg).filter((L) => !(L.type === 'shape' && !L.html) || false).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
        for (const L of ls) {
          if (L.type === 'image') {
            const k = Math.min(1, cw / L.w);
            part += `<p style="text-align:center"><img src="${srcOf(L.src, project)}" width="${Math.round(L.w * k)}" height="${Math.round(L.h * k)}" alt=""></p>`;
          } else if (L.html) {
            part += `<div style="${Motion.textCss(Object.assign({}, L, { bg: '', pad: 0, type: 'text' })).replace(/"/g, "'")};margin-bottom:6px">${L.html}</div>`;
          }
        }
        html += (i ? '<div class="pagebreak"></div>' : '') + (part || '<p><br></p>');
      });
      return { html, page, hf: null };
    }
    for (let i = 0; i < project.pages.length; i++) {
      const pg = project.pages[i];
      let objs = '';
      let z = 1;
      const pos = (x, y, w, h, extra = '') => `left:${(x - ox).toFixed(1)}px;top:${(y - oy).toFixed(1)}px;width:${Math.round(w)}px;height:${Math.round(h)}px;${extra}`;
      if (pg.bg && !/^#?f{6}$/i.test(pg.bg)) objs += `<span class="fobj" contenteditable="false" data-wrap="behind" style="${pos(0, 0, project.w, project.h)}"><div class="tbox" contenteditable="true" style="background-color:${pg.bg}"><p><br></p></div></span>`;
      if (pg.bgImage) { const r = await rasterLayer({ type: 'image', src: pg.bgImage, x: 0, y: 0, w: project.w, h: project.h, fit: 'cover' }, project, 1); objs += `<span class="fobj" contenteditable="false" data-wrap="behind" style="${pos(0, 0, project.w, project.h)}"><img src="${r.src}" alt=""></span>`; }
      for (const L of visible(pg)) {
        const plainLayer = !(L.rot % 360) && (L.opacity === undefined || L.opacity >= 0.99) && !L.shadow;
        const zi = `z-index:${z++}`;
        const raster = async (lay) => { const r = await rasterLayer(lay, project); return `<span class="fobj" contenteditable="false" data-wrap="front" style="${pos(r.x, r.y, r.w, r.h, zi)}"><img src="${r.src}" alt=""></span>`; };
        if (!plainLayer) { objs += await raster(L); continue; }
        if (L.type === 'image') {
          const im = await loadImg(srcOf(L.src, project)).catch(() => null); if (!im) continue;
          const same = Math.abs(im.naturalWidth / im.naturalHeight - L.w / L.h) < 0.01;
          if (L.fit === 'fill' || (same && !L.radius && !L.flipH && !L.sw)) objs += `<span class="fobj" contenteditable="false" data-wrap="front" style="${pos(L.x, L.y, L.w, L.h, zi)}"><img src="${srcOf(L.src, project)}" alt=""></span>`;
          else objs += await raster(L);
        } else if (L.type === 'text') {
          const css = Motion.textCss(Object.assign({}, L, { bg: '', pad: 0 })).replace(/"/g, "'");
          const box = [css, L.bg ? 'background-color:' + L.bg : '', L.pad ? 'padding:' + L.pad + 'px' : ''].filter(Boolean).join(';');
          objs += `<span class="fobj" contenteditable="false" data-wrap="front" style="${pos(L.x, L.y, L.w, L.h, zi)}"><div class="tbox" contenteditable="true" style="${box}">${L.html || '<p><br></p>'}</div></span>`;
        } else if (L.kind === 'line') {
          const sw = L.sw || 2;
          objs += `<span class="fobj" contenteditable="false" data-wrap="front" data-kind="line"${L.arrowEnd ? ' data-arrow="1"' : ''} style="${pos(L.x, L.y, L.w, L.h, zi)}"><svg width="100%" height="100%" viewBox="0 0 ${L.w} ${L.h}" preserveAspectRatio="none"><line x1="0" y1="${L.h / 2}" x2="${L.w}" y2="${L.h / 2}" stroke="${L.stroke || '#000000'}" stroke-width="${sw}"${L.dash ? ` stroke-dasharray="${sw * 3} ${sw * 2}"` : ''}/></svg></span>`;
        } else if (['rect', 'roundrect', 'ellipse'].includes(L.kind)) {
          const css = Motion.textCss(Object.assign({}, L, { bg: '', pad: 0, type: 'shape' })).replace(/"/g, "'");
          const st = [css, L.fill ? 'background-color:' + L.fill : '', L.sw && L.stroke ? `border:${L.sw}px ${L.dash ? 'dashed' : 'solid'} ${L.stroke}` : '',
            `border-radius:${L.kind === 'ellipse' ? '50%' : L.kind === 'roundrect' ? (L.radius || 0) + 'px' : 0}`, `padding:${Math.round(Math.min(L.w, L.h) * 0.06)}px`,
            `justify-content:${({ top: 'flex-start', bottom: 'flex-end' })[L.valign] || 'center'}`].filter(Boolean).join(';');
          objs += `<span class="fobj" contenteditable="false" data-wrap="front"${L.kind === 'ellipse' ? ' data-kind="ellipse"' : ''} style="${pos(L.x, L.y, L.w, L.h, zi)}"><div class="tbox" contenteditable="true" style="${st}">${L.html || '<p><br></p>'}</div></span>`;
        } else {
          objs += await raster(Object.assign({}, L, { html: '' }));
          if (L.html) {
            const css = Motion.textCss(Object.assign({}, L, { bg: '', pad: 0, type: 'shape' })).replace(/"/g, "'");
            objs += `<span class="fobj" contenteditable="false" data-wrap="front" style="${pos(L.x, L.y, L.w, L.h, `z-index:${z++}`)}"><div class="tbox" contenteditable="true" style="${css};padding:${Math.round(Math.min(L.w, L.h) * 0.06)}px;justify-content:${({ top: 'flex-start', bottom: 'flex-end' })[L.valign] || 'center'}">${L.html}</div></span>`;
          }
        }
      }
      html += `<div${i ? ' class="pb-before"' : ''}>${objs}<br></div>`;
    }
    return { html, page, hf: null };
  }

  /* ================= PPTX 내보내기 ================= */
  const PPT_SHAPE = { rect: 'rect', roundrect: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', star: 'star5', heart: 'heart', arrow: 'rightArrow', speech: 'wedgeRoundRectCallout', line: 'line' };
  const hex = (c) => (c || '').replace('#', '').slice(0, 6).toUpperCase();
  function cssColorHex(c) { const h = DocModel.rgbToHex(c); return h ? hex(h) : null; }
  // 글상자 HTML → pptxgenjs 글 조각
  function pptRuns(L) {
    const div = document.createElement('div'); div.style.cssText = Motion.textCss(L) + ';position:fixed;left:-100000px;top:0;width:' + L.w + 'px'; div.innerHTML = L.html || '';
    host().appendChild(div);
    const out = [];
    try {
      const blocks = [];
      const walkBlocks = (n) => {
        for (const c of Array.from(n.childNodes)) {
          if (c.nodeType === 1 && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(c.tagName) && c.querySelector('p,div,h1,h2,h3,li')) walkBlocks(c);
          else if (c.nodeType === 1 && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(c.tagName)) blocks.push(c);
          else if (c.nodeType === 1 && c.tagName === 'TABLE') { /* 표는 따로 */ }
          else if (c.nodeType === 3 && c.nodeValue.trim()) { const p = document.createElement('p'); c.replaceWith(p); p.appendChild(c); blocks.push(p); }
        }
      };
      walkBlocks(div);
      blocks.forEach((b, bi) => {
        const bcs = getComputedStyle(b);
        const align = ({ center: 'center', right: 'right', justify: 'justify' })[bcs.textAlign] || 'left';
        const pieces = [];
        const walk = (n) => {
          for (const c of Array.from(n.childNodes)) {
            if (c.nodeType === 3) { if (c.nodeValue) pieces.push({ t: c.nodeValue.replace(/ /g, ' '), el: c.parentElement }); }
            else if (c.tagName === 'BR') pieces.push({ br: true, el: c.parentElement });
            else if (c.nodeType === 1) walk(c);
          }
        };
        walk(b);
        if (!pieces.length) pieces.push({ t: '', el: b });
        pieces.forEach((p, i) => {
          const cs = getComputedStyle(p.el);
          const o = {
            fontFace: Fonts.first(cs.fontFamily) || L.font, fontSize: Math.round(parseFloat(cs.fontSize) * 0.75 * 10) / 10,
            color: cssColorHex(cs.color) || hex(L.color), bold: parseInt(cs.fontWeight, 10) >= 600, italic: cs.fontStyle === 'italic',
            underline: /underline/.test(cs.textDecorationLine) || !!p.el.closest('u') ? { style: 'sng' } : undefined, align,
          };
          if (/line-through/.test(cs.textDecorationLine)) o.strike = 'sngStrike';
          if (p.br) o.softBreakBefore = true;
          const last = i === pieces.length - 1;
          if (last && bi < blocks.length - 1) o.breakLine = true;
          out.push({ text: p.br ? '' : p.t, options: o });
        });
      });
    } finally { div.remove(); }
    return out.length ? out : [{ text: '', options: {} }];
  }
  function tableRows(L) {
    const div = document.createElement('div'); div.innerHTML = L.html || '';
    const t = div.querySelector('table'); if (!t) return null;
    return Array.from(t.rows).map((tr) => Array.from(tr.cells).map((td) => ({ text: td.innerText.trim(), options: { colspan: td.colSpan > 1 ? td.colSpan : undefined, rowspan: td.rowSpan > 1 ? td.rowSpan : undefined, bold: !!td.querySelector('b,strong') } })));
  }
  async function toPptx(project, meta = {}) {
    await Loader.need('pptxgenjs');
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'HWPE', width: project.w / 96, height: project.h / 96 });
    pptx.layout = 'HWPE';
    pptx.title = meta.title || ''; pptx.author = meta.author || '';
    const shapeMaps = []; // 쪽마다 [레이어(또는 null)] — 도형 순서대로
    for (const pg of project.pages) {
      const s = pptx.addSlide();
      if (pg.bgImage) s.background = { data: srcOf(pg.bgImage, project) };
      else s.background = { color: hex(pg.bg || '#ffffff') };
      const map = [];
      for (const L of visible(pg)) {
        const box = { x: L.x / 96, y: L.y / 96, w: Math.max(0.01, L.w / 96), h: Math.max(0.01, L.h / 96) };
        if (L.rot) box.rotate = L.rot;
        const tr = L.opacity !== undefined && L.opacity < 1 ? Math.round((1 - L.opacity) * 100) : 0;
        const shadow = L.shadow ? { type: 'outer', blur: 8, offset: 4, angle: 90, color: '000000', opacity: 0.3 } : undefined;
        if (L.type === 'image') {
          const src = srcOf(L.src, project);
          const o = Object.assign({ data: src }, box);
          if (L.fit === 'cover' || L.fit === 'contain') o.sizing = { type: L.fit, w: box.w, h: box.h };
          if (L.flipH) o.flipH = true;
          if (tr) o.transparency = tr;
          if (L.radius && L.radius >= Math.min(L.w, L.h) / 2 - 1) o.rounding = true;
          s.addImage(o); map.push(L); continue;
        }
        if (L.type === 'text') {
          const rows = /<table/i.test(L.html || '') ? tableRows(L) : null;
          if (rows) {
            s.addTable(rows, { x: box.x, y: box.y, w: box.w, fontSize: Math.round((L.size || 20) * 0.75), fontFace: L.font, color: hex(L.color), border: { type: 'solid', pt: 0.75, color: '666666' } });
            map.push(L); continue;
          }
          const o = Object.assign({}, box, { valign: 'top', margin: Math.round((L.pad || 0) * 0.75), lineSpacingMultiple: L.lh || 1.2, isTextBox: true, fit: 'none', shadow });
          if (L.bg) o.fill = { color: hex(L.bg), transparency: tr };
          if (L.ls) o.charSpacing = Math.round((L.size || 20) * 0.75 * L.ls / 100 * 10) / 10;
          s.addText(pptRuns(L), o); map.push(L); continue;
        }
        // 도형
        const type = PPT_SHAPE[L.kind] || 'rect';
        if (L.kind === 'line') {
          s.addShape('line', { x: box.x, y: (L.y + L.h / 2) / 96, w: box.w, h: 0, rotate: L.rot || undefined, line: { color: hex(L.stroke || '#222222'), width: Math.max(0.5, (L.sw || 2) * 0.75), dashType: L.dash ? 'dash' : 'solid', endArrowType: L.arrowEnd ? 'triangle' : undefined, transparency: tr } });
          map.push(L); continue;
        }
        const o = Object.assign({}, box, { shape: type, shadow });
        o.fill = L.fill ? { color: hex(L.fill), transparency: tr } : { type: 'none' };
        o.line = L.sw && L.stroke ? { color: hex(L.stroke), width: L.sw * 0.75, dashType: L.dash ? 'dash' : 'solid' } : { type: 'none' };
        if (L.kind === 'roundrect') o.rectRadius = Math.min(0.5, (L.radius || 0) / Math.max(1, Math.min(L.w, L.h)));
        if (L.html) {
          Object.assign(o, { valign: ({ top: 'top', bottom: 'bottom' })[L.valign] || 'middle', align: L.align || 'center', margin: Math.round(Math.min(L.w, L.h) * 0.06 * 0.75), lineSpacingMultiple: L.lh || 1.2 });
          s.addText(pptRuns(L), o);
        } else s.addShape(type, o);
        map.push(L);
      }
      shapeMaps.push(map);
    }
    const buf = await pptx.write({ outputType: 'arraybuffer' });
    return addMotionToPptx(buf, project, shapeMaps);
  }
  // 슬라이드 전환·등장 애니메이션을 PowerPoint 형식(p:transition, p:timing)으로 덧붙임
  async function addMotionToPptx(buf, project, shapeMaps) {
    const zip = await JSZip.loadAsync(buf);
    for (let i = 0; i < project.pages.length; i++) {
      const path = `ppt/slides/slide${i + 1}.xml`; const f = zip.file(path); if (!f) continue;
      let xml = await f.async('string');
      const pg = project.pages[i];
      const ids = [];
      const tree = xml.slice(xml.indexOf('<p:spTree>'), xml.indexOf('</p:spTree>'));
      const re = /<p:(sp|pic|graphicFrame|cxnSp)>\s*<p:nv\w+Pr>\s*<p:cNvPr id="(\d+)"/g; let m;
      while ((m = re.exec(tree))) ids.push(+m[2]);
      const spidOf = new Map(); (shapeMaps[i] || []).forEach((L, k) => { if (ids[k] !== undefined) spidOf.set(L.id, ids[k]); });
      const timing = timingXml(pg, spidOf);
      const tr = transitionXml(pg);
      const ins = tr + timing;
      if (!ins) continue;
      // 순서: cSld → clrMapOvr → transition → timing → extLst
      if (xml.includes('</p:clrMapOvr>')) xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + ins);
      else if (/<p:clrMapOvr\b[^>]*\/>/.test(xml)) xml = xml.replace(/(<p:clrMapOvr\b[^>]*\/>)/, `$1${ins}`);
      else xml = xml.replace('</p:cSld>', '</p:cSld>' + ins);
      zip.file(path, xml);
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  function transitionXml(pg) {
    const t = (pg.transition && pg.transition.type) || 'none';
    const el = ({ fade: '<p:fade/>', slide: '<p:push dir="l"/>', cover: '<p:cover dir="u"/>', zoom: '<p:zoom/>', flip: '<p:fade/>' })[t] || '';
    const adv = +pg.auto > 0 ? ` advTm="${Math.round(pg.auto * 1000 + animSpan(pg))}"` : '';
    if (!el && !adv) return '';
    const spd = (pg.transition && pg.transition.dur || 0.6) < 0.5 ? 'fast' : (pg.transition && pg.transition.dur || 0.6) > 1 ? 'slow' : 'med';
    return `<p:transition spd="${spd}"${adv}>${el}</p:transition>`;
  }
  function animSpan(pg) { const { auto } = Motion.sequence(pg); return auto.reduce((m, L) => Math.max(m, ((L.anim.delay || 0) + (L.anim.dur || 0.6)) * 1000), 0); }
  function timingXml(pg, spidOf) {
    const { auto, clicks } = Motion.sequence(pg);
    const list = (a) => a.filter((L) => L.anim && L.anim.in && L.anim.in !== 'none' && spidOf.has(L.id));
    const A = list(auto), K = list(clicks);
    if (!A.length && !K.length) return '';
    let id = 2;
    const nid = () => ++id;
    const tgt = (sp) => `<p:tgtEl><p:spTgt spid="${sp}"/></p:tgtEl>`;
    const setVis = (sp) => `<p:set><p:cBhvr><p:cTn id="${nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt(sp)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
    const fade = (sp, ms, filter = 'fade') => `<p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${nid()}" dur="${ms}"/>${tgt(sp)}</p:cBhvr></p:animEffect>`;
    const anim = (sp, ms, attr, from, to) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nid()}" dur="${ms}" fill="hold"/>${tgt(sp)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
    const effect = (L, nodeType, delay) => {
      const sp = spidOf.get(L.id); const ms = Math.round((L.anim.dur || 0.6) * 1000); const t = L.anim.in;
      let preset = 10, sub = 0, body;
      const ctn = nid();
      if (['up', 'down', 'left', 'right', 'drop'].includes(t)) {
        preset = 2; sub = ({ up: 4, down: 1, drop: 1, left: 8, right: 2 })[t];
        const from = { up: ['#ppt_x', '1+#ppt_h/2'], down: ['#ppt_x', '0-#ppt_h/2'], drop: ['#ppt_x', '0-#ppt_h/2'], left: ['0-#ppt_w/2', '#ppt_y'], right: ['1+#ppt_w/2', '#ppt_y'] }[t];
        body = setVis(sp) + anim(sp, ms, 'ppt_x', from[0], '#ppt_x') + anim(sp, ms, 'ppt_y', from[1], '#ppt_y');
      } else if (['zoomIn', 'zoomOut', 'pop', 'spin'].includes(t)) {
        preset = 53; sub = 16;
        body = setVis(sp) + anim(sp, ms, 'ppt_w', '0', '#ppt_w') + anim(sp, ms, 'ppt_h', '0', '#ppt_h') + fade(sp, ms);
      } else if (t === 'wipe' || t === 'wipeUp') {
        preset = 22; sub = t === 'wipe' ? 8 : 4;
        body = setVis(sp) + fade(sp, ms, t === 'wipe' ? 'wipe(left)' : 'wipe(down)');
      } else { body = setVis(sp) + fade(sp, ms); }
      return `<p:par><p:cTn id="${ctn}" presetID="${preset}" presetClass="entr" presetSubtype="${sub}" fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${Math.round(delay)}"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`;
    };
    const group = (items, first, auto) => {
      const outer = nid(), inner = nid();
      const cond = auto ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>';
      const effs = items.map((L, k) => effect(L, auto ? (k === 0 ? 'afterEffect' : 'withEffect') : 'clickEffect', ((L.anim.delay || 0)) * 1000)).join('');
      void first;
      return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst>${cond}</p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effs}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
    };
    let groups = '';
    if (A.length) groups += group(A, true, true);
    K.forEach((L) => { groups += group([L], false, false); });
    return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groups}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
  }

  /* ================= PPTX 불러오기 ================= */
  async function fromPptx(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const txt = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
    const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
    const q = (el, name) => el ? Array.from(el.getElementsByTagNameNS('*', name)) : [];
    const kid = (el, name) => el ? Array.from(el.children).find((c) => c.localName === name) || null : null;
    const kids = (el, name) => el ? Array.from(el.children).filter((c) => c.localName === name) : [];
    const E = 9525;
    const pres = parse(await txt('ppt/presentation.xml') || '<x/>');
    const sz = q(pres, 'sldSz')[0];
    const W = sz ? Math.round(+sz.getAttribute('cx') / E) : 1280, H = sz ? Math.round(+sz.getAttribute('cy') / E) : 720;
    const relsOf = async (path) => {
      const dir = path.slice(0, path.lastIndexOf('/')); const name = path.slice(path.lastIndexOf('/') + 1);
      const r = await txt(`${dir}/_rels/${name}.rels`); const map = {};
      if (r) q(parse(r), 'Relationship').forEach((x) => { let t = x.getAttribute('Target'); if (x.getAttribute('TargetMode') === 'External') return; if (t.startsWith('/')) t = t.slice(1); else { const parts = (dir + '/' + t).split('/'); const st = []; parts.forEach((p) => { if (p === '..') st.pop(); else if (p !== '.') st.push(p); }); t = st.join('/'); } map[x.getAttribute('Id')] = t; });
      return map;
    };
    const presRels = await relsOf('ppt/presentation.xml');
    const slidePaths = q(pres, 'sldId').map((s) => presRels[s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id')]).filter(Boolean);
    // 테마 색
    const theme = {};
    const themePath = Object.keys(zip.files).find((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n));
    if (themePath) {
      const t = parse(await txt(themePath)); const cs = q(t, 'clrScheme')[0];
      if (cs) Array.from(cs.children).forEach((c) => { const v = c.firstElementChild; if (!v) return; theme[c.localName] = '#' + (v.getAttribute('val') || v.getAttribute('lastClr') || '000000'); });
    }
    const schemeMap = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
    const colorOf = (el) => {
      if (!el) return null;
      const s = kid(el, 'srgbClr'); if (s) return '#' + s.getAttribute('val');
      const sc = kid(el, 'schemeClr'); if (sc) { const k = sc.getAttribute('val'); return theme[schemeMap[k] || k] || null; }
      const sys = kid(el, 'sysClr'); if (sys) return '#' + (sys.getAttribute('lastClr') || '000000');
      return null;
    };
    const fillOf = (spPr) => { if (!spPr) return undefined; if (kid(spPr, 'noFill')) return ''; const sf = kid(spPr, 'solidFill'); return sf ? colorOf(sf) : undefined; };
    const assets = {}; let aid = 0;
    const media = async (path) => {
      const f = zip.file(path); if (!f) return null;
      const ext = path.split('.').pop().toLowerCase();
      const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' })[ext];
      if (!mime) return null;
      const id = 'm' + (aid++); assets[id] = `data:${mime};base64,` + await f.async('base64'); return 'asset:' + id;
    };
    const xfrmOf = (spPr) => { const x = kid(spPr, 'xfrm'); if (!x) return null; const off = kid(x, 'off'), ext = kid(x, 'ext'); if (!off || !ext) return null; return { x: +off.getAttribute('x') / E, y: +off.getAttribute('y') / E, w: +ext.getAttribute('cx') / E, h: +ext.getAttribute('cy') / E, rot: (+x.getAttribute('rot') || 0) / 60000, flipH: x.getAttribute('flipH') === '1' }; };
    // 레이아웃·마스터의 자리표시자 위치
    const phCache = {};
    async function placeholders(path) {
      if (phCache[path]) return phCache[path];
      const out = {}; const x = await txt(path); if (!x) return (phCache[path] = out);
      const d = parse(x);
      q(d, 'sp').forEach((sp) => { const ph = q(sp, 'ph')[0]; const xf = xfrmOf(kid(sp, 'spPr')); if (ph && xf) { out['t:' + (ph.getAttribute('type') || 'body')] = xf; if (ph.getAttribute('idx')) out['i:' + ph.getAttribute('idx')] = xf; } });
      return (phCache[path] = out);
    }
    const PRST = { rect: 'rect', roundRect: 'roundrect', ellipse: 'ellipse', triangle: 'triangle', diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', star5: 'star', heart: 'heart', rightArrow: 'arrow', wedgeRoundRectCallout: 'speech', wedgeRectCallout: 'speech', line: 'line', straightConnector1: 'line' };
    function textOf(txBody, defaults) {
      if (!txBody) return { html: '', size: 0 };
      const sizes = {}; let html = '';
      const lstSz = q(txBody, 'defRPr')[0];
      kids(txBody, 'p').forEach((p) => {
        const pPr = kid(p, 'pPr'); const algn = pPr && pPr.getAttribute('algn');
        const al = ({ ctr: 'center', r: 'right', just: 'justify', l: 'left' })[algn] || defaults.align;
        let inner = '';
        Array.from(p.children).forEach((r) => {
          if (r.localName === 'br') { inner += '<br>'; return; }
          if (r.localName !== 'r' && r.localName !== 'fld') return;
          const rPr = kid(r, 'rPr'); const t = (kid(r, 't') || {}).textContent || '';
          const st = [];
          const sz = rPr && rPr.getAttribute('sz') ? +rPr.getAttribute('sz') / 100 : (lstSz && lstSz.getAttribute('sz') ? +lstSz.getAttribute('sz') / 100 : defaults.pt);
          const px = Math.round(sz * 96 / 72 * 10) / 10; sizes[px] = (sizes[px] || 0) + t.length; st.push(`font-size:${px}px`);
          if (rPr) {
            if (rPr.getAttribute('b') === '1') st.push('font-weight:700');
            if (rPr.getAttribute('i') === '1') st.push('font-style:italic');
            if (rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none') st.push('text-decoration:underline');
            const c = colorOf(kid(rPr, 'solidFill')); if (c) st.push('color:' + c);
            const lat = kid(rPr, 'ea') || kid(rPr, 'latin'); const tf = lat && lat.getAttribute('typeface');
            if (tf && !tf.startsWith('+')) st.push(`font-family:${Motion.fontCss(tf).replace(/"/g, "'")}`);
          }
          inner += `<span style="${st.join(';')}">${esc(t)}</span>`;
        });
        html += `<p style="text-align:${al}">${inner || '<br>'}</p>`;
      });
      const top = Object.entries(sizes).sort((a, b) => b[1] - a[1])[0];
      return { html, size: top ? +top[0] : defaults.pt * 96 / 72 };
    }
    const project = { v: 1, w: W, h: H, assets, pages: [] };
    for (const sp of slidePaths) {
      const x = await txt(sp); if (!x) continue;
      const d = parse(x); const rels = await relsOf(sp);
      const layoutPath = Object.values(rels).find((t) => /slideLayouts\//.test(t));
      const lph = layoutPath ? await placeholders(layoutPath) : {};
      let mph = {};
      if (layoutPath) { const lr = await relsOf(layoutPath); const mp = Object.values(lr).find((t) => /slideMasters\//.test(t)); if (mp) mph = await placeholders(mp); }
      const page = Design.newPage(); page.transition = { type: 'none', dur: 0.6 };
      const bg = q(d, 'bgPr')[0];
      if (bg) { const c = colorOf(kid(bg, 'solidFill')); if (c) page.bg = c; const blip = q(bg, 'blip')[0]; if (blip) { const p = rels[blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')]; const a = p && await media(p); if (a) page.bgImage = a; } }
      if (q(d, 'transition')[0]) page.transition = { type: q(d, 'push')[0] ? 'slide' : q(d, 'cover')[0] ? 'cover' : q(d, 'zoom')[0] ? 'zoom' : 'fade', dur: 0.6 };
      const spMap = {};
      const walk = async (tree, tx) => {
        for (const el of Array.from(tree.children)) {
          const n = el.localName;
          const before = page.layers.length;
          const cnv = q(el, 'cNvPr')[0]; const spid = cnv ? cnv.getAttribute('id') : null;
          await one(el, n, tx);
          if (spid && page.layers.length > before) spMap[spid] = page.layers[page.layers.length - 1];
        }
      };
      const one = async (el, n, tx) => {
        {
          if (n === 'grpSp') {
            const gx = kid(kid(el, 'grpSpPr'), 'xfrm');
            let t2 = tx;
            if (gx) {
              const off = kid(gx, 'off'), ext = kid(gx, 'ext'), co = kid(gx, 'chOff'), ce = kid(gx, 'chExt');
              if (off && ext && co && ce) {
                const sx = (+ext.getAttribute('cx') || 1) / (+ce.getAttribute('cx') || 1), sy = (+ext.getAttribute('cy') || 1) / (+ce.getAttribute('cy') || 1);
                const ox = +off.getAttribute('x') - +co.getAttribute('x') * sx, oy = +off.getAttribute('y') - +co.getAttribute('y') * sy;
                t2 = { sx: tx.sx * sx, sy: tx.sy * sy, ox: tx.ox + ox / E * tx.sx, oy: tx.oy + oy / E * tx.sy };
              }
            }
            await walk(el, t2); return;
          }
          const apply = (b) => b && { x: tx.ox + b.x * tx.sx, y: tx.oy + b.y * tx.sy, w: b.w * tx.sx, h: b.h * tx.sy, rot: b.rot, flipH: b.flipH };
          if (n === 'sp' || n === 'cxnSp') {
            const spPr = kid(el, 'spPr');
            let b = xfrmOf(spPr);
            const ph = q(el, 'ph')[0];
            if (!b && ph) b = lph['i:' + ph.getAttribute('idx')] || lph['t:' + (ph.getAttribute('type') || 'body')] || mph['t:' + (ph.getAttribute('type') || 'body')];
            b = apply(b); if (!b) return;
            const geom = q(spPr, 'prstGeom')[0]; const prst = geom ? geom.getAttribute('prst') : 'rect';
            const kind = PRST[prst] || 'rect';
            let fill = fillOf(spPr); const ln = kid(spPr, 'ln');
            const stroke = ln && !kid(ln, 'noFill') ? colorOf(kid(ln, 'solidFill')) : '';
            const sw = ln && stroke ? Math.max(1, Math.round((+ln.getAttribute('w') || 12700) / E)) : 0;
            const style = kid(el, 'style');
            if (fill === undefined && style) { const fr = kid(style, 'fillRef'); fill = fr && +fr.getAttribute('idx') > 0 ? colorOf(fr) : ''; }
            const isTitle = ph && /title/i.test(ph.getAttribute('type') || '');
            const txt2 = textOf(kid(el, 'txBody'), { pt: isTitle ? 40 : 18, align: isTitle ? 'left' : 'left' });
            const anchor = q(el, 'bodyPr')[0]; const va = anchor ? ({ ctr: 'middle', b: 'bottom' })[anchor.getAttribute('anchor')] || 'top' : 'top';
            const textColor = theme.dk1 || '#000000';
            if (kind === 'line' || n === 'cxnSp') { page.layers.push(Design.shapeLayer('line', { x: Math.round(b.x), y: Math.round(b.y + b.h / 2 - 8), w: Math.round(Math.max(b.w, 2)), h: 16, rot: b.rot, stroke: stroke || '#222222', sw: sw || 2, arrowEnd: !!(ln && kid(ln, 'tailEnd') && kid(ln, 'tailEnd').getAttribute('type') && kid(ln, 'tailEnd').getAttribute('type') !== 'none') })); return; }
            if (!fill && !stroke && kind === 'rect') {
              if (!txt2.html.replace(/<[^>]+>/g, '').trim()) return;
              page.layers.push(Design.textLayer(txt2.html, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), rot: b.rot, size: txt2.size, color: textColor, font: 'Noto Sans KR', lh: 1.2 }));
            } else {
              page.layers.push(Design.shapeLayer(kind, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), rot: b.rot, fill: fill || '', stroke: stroke || '', sw, radius: kind === 'roundrect' ? Math.round(Math.min(b.w, b.h) * 0.16) : 0, html: txt2.html.replace(/<[^>]+>/g, '').trim() ? txt2.html : '', size: txt2.size || 24, color: textColor, valign: va, align: 'center' }));
            }
          } else if (n === 'pic') {
            const b = apply(xfrmOf(kid(el, 'spPr'))); if (!b) return;
            const blip = q(el, 'blip')[0]; if (!blip) return;
            const p = rels[blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')];
            const a = p && await media(p); if (!a) return;
            page.layers.push(Design.imageLayer(a, Math.round(b.w), Math.round(b.h), { x: Math.round(b.x), y: Math.round(b.y), rot: b.rot, fit: 'fill', flipH: b.flipH }));
          } else if (n === 'graphicFrame') {
            const tbl = q(el, 'tbl')[0]; const xf = kid(el, 'xfrm');
            if (!tbl || !xf) return;
            const off = kid(xf, 'off'), ext = kid(xf, 'ext');
            const b = apply({ x: +off.getAttribute('x') / E, y: +off.getAttribute('y') / E, w: +ext.getAttribute('cx') / E, h: +ext.getAttribute('cy') / E });
            let h = '<table style="width:100%"><tbody>';
            kids(tbl, 'tr').forEach((tr) => { h += '<tr>' + kids(tr, 'tc').filter((tc) => !tc.getAttribute('hMerge') && !tc.getAttribute('vMerge')).map((tc) => `<td${tc.getAttribute('gridSpan') ? ` colspan="${tc.getAttribute('gridSpan')}"` : ''}${tc.getAttribute('rowSpan') ? ` rowspan="${tc.getAttribute('rowSpan')}"` : ''}>${esc(q(tc, 't').map((t) => t.textContent).join('')) || '&nbsp;'}</td>`).join('') + '</tr>'; });
            h += '</tbody></table>';
            page.layers.push(Design.textLayer(h, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), size: 18, color: theme.dk1 || '#000000' }));
          }
        }
      };
      const tree = q(d, 'spTree')[0];
      if (tree) await walk(tree, { sx: 1, sy: 1, ox: 0, oy: 0 });
      // 등장 애니메이션 가져오기
      let order = 0;
      q(d, 'cTn').filter((c) => c.getAttribute('presetClass') === 'entr').forEach((c) => {
        const tg = q(c, 'spTgt')[0]; const L = tg && spMap[tg.getAttribute('spid')]; if (!L) return;
        const id = +c.getAttribute('presetID'), sub = +c.getAttribute('presetSubtype') || 0;
        const type = id === 2 ? ({ 4: 'up', 1: 'down', 8: 'left', 2: 'right' })[sub] || 'up' : id === 10 ? 'fade' : [53, 23, 21, 55].includes(id) ? 'zoomIn' : id === 22 ? (sub === 4 ? 'wipeUp' : 'wipe') : id === 42 ? 'up' : id === 47 ? 'down' : id === 26 ? 'drop' : 'fade';
        const durs = q(c, 'cTn').map((x) => +x.getAttribute('dur')).filter((v) => v > 1);
        const cond = kid(kid(c, 'stCondLst'), 'cond');
        const click = c.getAttribute('nodeType') === 'clickEffect';
        L.anim = { in: type, start: click ? 'click' : 'auto', delay: cond ? Math.max(0, +cond.getAttribute('delay') || 0) / 1000 : 0, dur: durs.length ? Math.max(...durs) / 1000 : 0.6, loop: 'none', order: click ? order++ : 0 };
      });
      const trn = q(d, 'transition')[0]; if (trn && trn.getAttribute('advTm')) page.auto = Math.max(0, +trn.getAttribute('advTm') / 1000);
      project.pages.push(page);
    }
    if (!project.pages.length) project.pages.push(Design.newPage());
    return project;
  }

  /* ================= HTML 슬라이드쇼 ================= */
  function toHtml(project, title) {
    const data = JSON.stringify(project).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
    const fonts = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Noto+Serif+KR:wght@400;700&family=Nanum+Gothic:wght@400;700&family=Nanum+Myeongjo:wght@400;700&family=Black+Han+Sans&family=Do+Hyeon&family=Jua&family=Gowun+Dodum&family=Gowun+Batang&family=Nanum+Pen+Script&family=Gaegu&family=Song+Myung&family=IBM+Plex+Sans+KR:wght@400;600&display=swap';
    const t = esc(title || '슬라이드쇼');
    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="generator" content="HWP 편집실"><title>${t}</title>
<link rel="stylesheet" href="${fonts}">
<style>html,body{margin:0;height:100%;background:#0b0d12;color:#e8ecf3;font-family:"Noto Sans KR",system-ui,sans-serif}
${Motion.CSS}
.start{position:fixed;inset:0;display:grid;place-items:center;text-align:center;gap:14px;padding:24px;box-sizing:border-box}
.start h1{margin:0;font-size:clamp(22px,4vw,40px);font-weight:700;text-wrap:balance}
.start p{margin:0;color:#9aa6ba;font-size:14px}
.start button{font:inherit;font-size:18px;padding:14px 28px;border-radius:999px;border:0;background:#3b82f6;color:#fff;cursor:pointer}
.start button:focus-visible{outline:3px solid #9cc0ff;outline-offset:3px}</style></head>
<body>
<script type="application/json" id="hwpe-project">${data}<\/script>
<div class="start" id="start"><div style="display:grid;gap:14px;justify-items:center"><h1>${t}</h1><p>${project.pages.length}쪽 · 클릭·방향키로 넘기기 · F 전체 화면</p><button id="go" type="button">▶ 시작</button></div></div>
<script>
${HwpMotionLib.toString()}
(function(){var M=HwpMotionLib();var P=JSON.parse(document.getElementById('hwpe-project').textContent);
var s=document.getElementById('start');function run(){s.style.display='none';var ss=M.Slideshow(P,{exitable:true,onExit:function(){s.style.display='';}});ss.start(0,true);}
document.getElementById('go').addEventListener('click',run);document.addEventListener('keydown',function(e){if(s.style.display!=='none'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();run();}});})();
<\/script>
</body></html>
`;
  }
  function fromHtml(text) {
    const m = /<script type="application\/json" id="hwpe-project">([\s\S]*?)<\/script>/.exec(text);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  }

  /* ================= PDF·그림 ================= */
  async function pageCanvases(project, scale) {
    await Loader.need('html2canvas');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const out = [];
    for (const pg of project.pages) {
      const pe = Motion.pageEl(pg, project);
      host().appendChild(pe);
      await new Promise((r) => setTimeout(r, 30));
      try { out.push(await html2canvas(pe, { scale, backgroundColor: pg.bg || '#ffffff', logging: false, useCORS: true, width: project.w, height: project.h })); } finally { pe.remove(); }
    }
    return out;
  }
  const pickScale = (project) => Math.max(1, Math.min(2, 2400 / Math.max(project.w, project.h)));
  async function toPdf(project) {
    await Loader.need('jspdf');
    const cvs = await pageCanvases(project, pickScale(project));
    const { jsPDF } = window.jspdf;
    const w = project.w / MMPX, h = project.h / MMPX;
    const doc = new jsPDF({ orientation: w > h ? 'l' : 'p', unit: 'mm', format: [w, h], compress: true });
    cvs.forEach((c, i) => { if (i) doc.addPage([w, h], w > h ? 'l' : 'p'); doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h, undefined, 'FAST'); });
    return new Uint8Array(doc.output('arraybuffer'));
  }
  async function toImages(project, type = 'png') {
    const cvs = await pageCanvases(project, pickScale(project));
    const mime = type === 'jpg' ? 'image/jpeg' : 'image/png';
    const blobs = await Promise.all(cvs.map((c) => new Promise((r) => c.toBlob(r, mime, 0.92))));
    if (blobs.length === 1) return { single: new Uint8Array(await blobs[0].arrayBuffer()) };
    const zip = new JSZip();
    for (let i = 0; i < blobs.length; i++) zip.file(`${String(i + 1).padStart(2, '0')}쪽.${type}`, await blobs[i].arrayBuffer());
    return { zip: await zip.generateAsync({ type: 'uint8array' }) };
  }

  /* ================= 디자인 원본 파일 ================= */
  const toHpd = (project) => JSON.stringify({ format: 'hwp-editor-design', version: 1, project });
  function fromHpd(text) {
    const o = JSON.parse(text);
    if (!o || o.format !== 'hwp-editor-design' || !o.project || !Array.isArray(o.project.pages)) throw new Error('디자인 원본 파일 형식이 아닙니다.');
    return o.project;
  }

  return { fromDoc, toDocHtml, toHwpx, toPptx, fromPptx, toHtml, fromHtml, toPdf, toImages, toHpd, fromHpd, rasterLayer, pptRuns };
})();
