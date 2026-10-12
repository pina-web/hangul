/* ===== 내보내기: DOCX · Markdown · TXT · HTML · PDF · PNG ===== */
const DOCXWriter = (() => {
  const X = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const TW = 15; // 1px = 15 twip
  const EMU = 9525;

  async function build(blocks, page, meta = {}) {
    const media = []; let docPrId = 1;
    const textW = Math.round((page.w - page.ml - page.mr) * 56.693);

    async function imgRun(r) {
      let mime = '', bytes;
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(r.img.src || '');
      if (m) { mime = m[1]; const s = atob(m[2]); bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); }
      else { try { const b = await (await fetch(r.img.src)).blob(); mime = b.type; bytes = new Uint8Array(await b.arrayBuffer()); } catch (e) { return ''; } }
      let ext = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/bmp': 'bmp' }[mime];
      if (!ext) {
        const conv = await HWPXWriterImage(r.img.src); if (!conv) return '';
        bytes = conv; ext = 'png';
      }
      const n = media.length + 1; const rid = 'rIdImg' + n;
      media.push({ name: `image${n}.${ext}`, bytes, rid });
      let cx = Math.round(r.img.w * EMU), cy = Math.round(r.img.h * EMU);
      const maxCx = textW * 635; if (cx > maxCx) { cy = Math.round(cy * maxCx / cx); cx = maxCx; }
      const id = docPrId++;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="그림 ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }

    function rPr(r) {
      let x = '';
      if (r.font) x += `<w:rFonts w:ascii="${X(r.font)}" w:hAnsi="${X(r.font)}" w:eastAsia="${X(r.font)}" w:cs="${X(r.font)}"/>`;
      if (r.b) x += '<w:b/><w:bCs/>';
      if (r.i) x += '<w:i/><w:iCs/>';
      if (r.s) x += '<w:strike/>';
      if (r.color) x += `<w:color w:val="${r.color.replace('#', '')}"/>`;
      if (r.size) x += `<w:sz w:val="${Math.round(r.size * 2)}"/><w:szCs w:val="${Math.round(r.size * 2)}"/>`;
      if (r.u) x += '<w:u w:val="single"/>';
      if (r.bg) x += `<w:shd w:val="clear" w:color="auto" w:fill="${r.bg.replace('#', '')}"/>`;
      if (r.sup) x += '<w:vertAlign w:val="superscript"/>'; else if (r.sub) x += '<w:vertAlign w:val="subscript"/>';
      return x ? `<w:rPr>${x}</w:rPr>` : '';
    }

    async function para(b) {
      let p = '<w:p><w:pPr>';
      if (b.pb) p += '<w:pageBreakBefore/>';
      p += `<w:spacing w:before="${Math.round((b.mt || 0) * TW)}" w:after="${Math.round((b.mb || 0) * TW)}" w:line="${Math.round((b.lh || 160) / 100 * 240 * 0.85)}" w:lineRule="auto"/>`;
      const ti = Math.round((b.ti || 0) * TW);
      if (b.ml || b.mr || ti) p += `<w:ind w:left="${Math.round((b.ml || 0) * TW)}" w:right="${Math.round((b.mr || 0) * TW)}"${ti >= 0 ? ` w:firstLine="${ti}"` : ` w:hanging="${-ti}"`}/>`;
      p += `<w:jc w:val="${({ left: 'left', right: 'right', center: 'center', justify: 'both' })[b.align] || 'both'}"/>`;
      const first = (b.runs || []).find((r) => r.text);
      if (first) p += rPr(first).replace('w:rPr>', 'w:rPr>').replace(/^<w:rPr>/, '<w:rPr>');
      p += '</w:pPr>';
      let last = first || {};
      for (const r of b.runs || []) {
        if (r.img) p += await imgRun(r);
        else if (r.br) p += `<w:r>${rPr(last)}<w:br/></w:r>`;
        else if (r.tab) p += `<w:r>${rPr(last)}<w:tab/></w:r>`;
        else { last = r; p += `<w:r>${rPr(r)}<w:t xml:space="preserve">${X(r.text)}</w:t></w:r>`; }
      }
      return p + '</w:p>';
    }

    async function table(tb) {
      const sum = tb.colW.reduce((a, c) => a + c, 0) || 1;
      const totalTw = Math.min(textW, Math.round(sum * TW));
      const colTw = tb.colW.map((c) => Math.max(100, Math.round(c / sum * totalTw)));
      const bstyle = tb.border ? 'single' : 'nil';
      const brd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="${bstyle}" w:sz="4" w:space="0" w:color="000000"/>`).join('');
      let x = `<w:tbl><w:tblPr><w:tblW w:w="${colTw.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${tb.align === 'center' ? '<w:jc w:val="center"/>' : ''}<w:tblBorders>${brd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${colTw.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
      // 세로 병합 계산
      const covered = {}; // "r,c" -> {cs, owner}
      for (const row of tb.rows) for (const cell of row) for (let y = 1; y < cell.rs; y++) covered[(cell.r + y) + ',' + cell.c] = cell;
      for (let ri = 0; ri < tb.nrows; ri++) {
        const row = tb.rows[ri] || [];
        const h = tb.rowH && tb.rowH[ri] ? Math.round(tb.rowH[ri] * TW) : 0;
        x += '<w:tr>' + (h ? `<w:trPr><w:trHeight w:val="${h}"/></w:trPr>` : '');
        // 행의 칸을 열 순서대로 (원본 칸 + 세로병합 이어짐 칸)
        const items = row.map((c) => ({ c: c.c, cell: c, cont: false }));
        for (const key in covered) { const [r, c] = key.split(',').map(Number); if (r === ri) items.push({ c, cell: covered[key], cont: true }); }
        items.sort((a, b) => a.c - b.c);
        for (const it of items) {
          const cell = it.cell;
          const w = colTw.slice(cell.c, cell.c + cell.cs).reduce((a, b) => a + b, 0);
          let tcPr = `<w:tcW w:w="${w}" w:type="dxa"/>`;
          if (cell.cs > 1) tcPr += `<w:gridSpan w:val="${cell.cs}"/>`;
          if (cell.rs > 1) tcPr += it.cont ? '<w:vMerge/>' : '<w:vMerge w:val="restart"/>';
          if (cell.bg) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${cell.bg.replace('#', '')}"/>`;
          tcPr += `<w:vAlign w:val="${({ TOP: 'top', BOTTOM: 'bottom' })[cell.va] || 'center'}"/>`;
          let inner = '';
          if (!it.cont) for (const b of cell.blocks) inner += await block(b);
          if (!inner.endsWith('</w:p>')) inner += '<w:p/>';
          x += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${inner}</w:tc>`;
        }
        x += '</w:tr>';
      }
      return x + '</w:tbl>';
    }

    async function block(b) {
      if (b.t === 'table') return (b.pb ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '') + await table(b);
      return para(b);
    }

    let body = '';
    for (const b of blocks) body += await block(b);
    if (!body.endsWith('</w:p>')) body += '<w:p/>';
    const pw = Math.round(page.w * 56.693), ph = Math.round(page.h * 56.693);
    const sect = `<w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"${page.landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${Math.round((page.mt + page.hd) * 56.693)}" w:right="${Math.round(page.mr * 56.693)}" w:bottom="${Math.round((page.mb + page.ft) * 56.693)}" w:left="${Math.round(page.ml * 56.693)}" w:header="${Math.round(page.mt * 56.693)}" w:footer="${Math.round(page.mb * 56.693)}" w:gutter="0"/></w:sectPr>`;
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${sect}</w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
    const exts = [...new Set(media.map((m) => m.name.split('.').pop()))];
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${exts.map((e) => `<Default Extension="${e}" ContentType="image/${e}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(meta.title || '')}</dc:title><dc:creator>${X(meta.author || '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', ct); zip.file('_rels/.rels', rels);
    zip.file('word/document.xml', doc); zip.file('word/styles.xml', styles); zip.file('word/_rels/document.xml.rels', docRels);
    zip.file('docProps/core.xml', core);
    for (const m of media) zip.file('word/media/' + m.name, m.bytes);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  async function HWPXWriterImage(src) {
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
      return new Uint8Array(await b.arrayBuffer());
    } catch (e) { return null; }
  }

  return { build };
})();

const TextExport = (() => {
  function md(blocks) {
    const out = [];
    const inline = (runs) => {
      let s = '';
      for (const r of runs) {
        if (r.br) { s += '  \n'; continue; }
        if (r.tab) { s += '\t'; continue; }
        if (r.img) { s += `![그림](${r.img.src})`; continue; }
        let t = r.text.replace(/([*_`\[\]\\|#])/g, '\\$1');
        const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0];
        let core = t.trim();
        if (!core) { s += t; continue; }
        if (r.s) core = `~~${core}~~`;
        if (r.i) core = `*${core}*`;
        if (r.b) core = `**${core}**`;
        s += lead + core + trail;
      }
      return s;
    };
    for (const b of blocks) {
      if (b.t === 'table') {
        const grid = Array.from({ length: b.nrows }, () => new Array(b.cols).fill(''));
        for (const row of b.rows) for (const c of row) grid[c.r][c.c] = c.blocks.map((x) => x.t === 'p' ? inline(x.runs) : '[표]').join('<br>').replace(/\n/g, ' ');
        out.push('');
        grid.forEach((row, i) => {
          out.push('| ' + row.map((v) => v || ' ').join(' | ') + ' |');
          if (i === 0) out.push('|' + row.map(() => ' --- ').join('|') + '|');
        });
        out.push('');
        continue;
      }
      let line = inline(b.runs);
      const tag = b.tag || '';
      if (/^H[1-6]$/.test(tag)) line = '#'.repeat(+tag[1]) + ' ' + line.replace(/^\*\*(.*)\*\*$/, '$1');
      else if (b.align === 'center' && line.trim()) line = line; // 마크다운은 정렬 미지원
      out.push(line);
      out.push('');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }
  return { md, txt: (blocks) => DocModel.plainText(blocks) + '\n' };
})();

const PageRender = (() => {
  // 문서를 용지 크기로 잘라 캔버스 페이지 목록을 만든다 (PDF·PNG 공용)
  async function pages(srcEl, page, scale = 2) {
    await Loader.need('html2canvas');
    const pxPerMm = 96 / 25.4;
    const pw = page.w * pxPerMm, ph = page.h * pxPerMm;
    const top = (page.mt + page.hd) * pxPerMm, bottom = (page.mb + page.ft) * pxPerMm;
    const contentH = ph - top - bottom;
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-100000px;top:0;width:${pw}px;background:#fff;`;
    const clone = srcEl.cloneNode(true);
    clone.removeAttribute('contenteditable');
    clone.id = 'renderClone';
    clone.style.cssText = `width:${pw}px;min-height:0;padding:0 ${page.mr * pxPerMm}px 0 ${page.ml * pxPerMm}px;margin:0;box-shadow:none;border:0;background:#fff;`;
    clone.querySelectorAll('.page-marker').forEach((m) => m.remove());
    holder.appendChild(clone); document.body.appendChild(holder);
    try {
      // 페이지 경계 후보: 블록·표 행·그림의 아래쪽
      const base = clone.getBoundingClientRect().top;
      const cands = new Set();
      const forced = [];
      clone.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,tr,img,div.textbox,pre,blockquote').forEach((el) => {
        const r = el.getBoundingClientRect(); cands.add(Math.round(r.bottom - base));
      });
      clone.querySelectorAll('.pagebreak').forEach((el) => forced.push(Math.round(el.getBoundingClientRect().top - base)));
      const sorted = [...cands].sort((a, b) => a - b);
      const total = clone.scrollHeight;
      const cuts = []; let start = 0;
      while (start < total - 2) {
        let limit = start + contentH;
        const f = forced.find((y) => y > start + 1 && y <= limit);
        let end;
        if (f !== undefined) end = f;
        else if (limit >= total) end = total;
        else {
          const ok = sorted.filter((y) => y > start + 20 && y <= limit);
          end = ok.length ? ok[ok.length - 1] : limit;
        }
        cuts.push([start, end]);
        start = end;
        if (f !== undefined) start = f + 1;
      }
      if (!cuts.length) cuts.push([0, Math.max(1, total)]);
      const canvas = await html2canvas(clone, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: pw + 40 });
      const k = canvas.width / clone.offsetWidth;
      const out = [];
      for (const [a, b] of cuts) {
        const pc = document.createElement('canvas');
        pc.width = Math.round(pw * k); pc.height = Math.round(ph * k);
        const g = pc.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, pc.width, pc.height);
        const h = Math.min(b - a, contentH);
        g.drawImage(canvas, 0, Math.round(a * k), canvas.width, Math.round(h * k), 0, Math.round(top * k), canvas.width, Math.round(h * k));
        out.push(pc);
      }
      return out;
    } finally { holder.remove(); }
  }

  async function pdf(srcEl, page) {
    await Loader.need('jspdf');
    const cvs = await pages(srcEl, page, 2);
    const { jsPDF } = window.jspdf;
    const w = Math.min(page.w, page.h), h = Math.max(page.w, page.h);
    const orient = page.landscape ? 'l' : 'p';
    const doc = new jsPDF({ orientation: orient, unit: 'mm', format: [w, h], compress: true });
    cvs.forEach((c, i) => {
      if (i) doc.addPage([w, h], orient);
      doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, page.w, page.h, undefined, 'FAST');
    });
    return new Uint8Array(doc.output('arraybuffer'));
  }

  async function png(srcEl, page) {
    const cvs = await pages(srcEl, page, 2);
    const blobs = await Promise.all(cvs.map((c) => new Promise((r) => c.toBlob(r, 'image/png'))));
    if (blobs.length === 1) return { single: new Uint8Array(await blobs[0].arrayBuffer()) };
    const zip = new JSZip();
    for (let i = 0; i < blobs.length; i++) zip.file(`${String(i + 1).padStart(2, '0')}쪽.png`, await blobs[i].arrayBuffer());
    return { zip: await zip.generateAsync({ type: 'uint8array' }) };
  }

  return { pdf, png };
})();

function standaloneHtml(editorEl, page, title) {
  const css = `body{margin:0;background:#fff;color:#000}
.doc{box-sizing:border-box;max-width:${page.w}mm;margin:0 auto;padding:${page.mt + page.hd}mm ${page.mr}mm ${page.mb + page.ft}mm ${page.ml}mm;font-family:"함초롬바탕","HCR Batang","Noto Serif KR",serif;font-size:10pt;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere}
.doc p{margin:0}.doc table{border-collapse:collapse;max-width:100%}.doc td,.doc th{border:1px solid #000;padding:1mm 1.8mm;vertical-align:middle}
.doc table.noborder td{border:0}.doc img{max-width:100%;height:auto}.doc .pagebreak{break-after:page;height:0;border:0}
.doc .tab{display:inline-block;min-width:2em;white-space:pre}.doc .textbox{border:1px solid #888;padding:2mm;margin:1mm 0}
@page{size:${page.w}mm ${page.h}mm;margin:0}`;
  const clone = editorEl.cloneNode(true);
  clone.querySelectorAll('.page-marker').forEach((m) => m.remove());
  clone.removeAttribute('contenteditable'); clone.removeAttribute('id'); clone.removeAttribute('style');
  clone.className = 'doc';
  return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${(title || '문서').replace(/</g, '&lt;')}</title><style>${css}</style></head><body>${clone.outerHTML}</body></html>\n`;
}
