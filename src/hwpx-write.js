/* ===== 문서 모델 → HWPX 패키지 =====
 * 한컴 OWPML 구조를 따르는 검증된 빈 문서(Skeleton.hwpx)를 바탕으로
 * header.xml에 글자모양·문단모양·테두리를 추가하고 section0.xml 본문을 새로 쓴다.
 */
const HWPXWriter = (() => {
  const X = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const HU = 75; // 1px(96dpi) = 75 HWPUNIT
  const MM = 283.465;

  function b64ToU8(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

  async function dataUrlToImage(src) {
    // png/jpg/gif/bmp는 그대로, 그 외는 PNG로 변환
    let mime = '', bytes = null;
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src || '');
    if (m) {
      mime = m[1].toLowerCase();
      bytes = m[2] ? b64ToU8(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
    } else {
      try { const r = await fetch(src); const b = await r.blob(); mime = b.type; bytes = new Uint8Array(await b.arrayBuffer()); } catch (e) { return null; }
    }
    const ok = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' }[mime];
    if (ok) return { bytes, ext: ok, mime: mime === 'image/jpg' ? 'image/jpeg' : mime };
    // 변환
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth || 300; cv.height = img.naturalHeight || 150;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const png = await new Promise((res) => cv.toBlob(res, 'image/png'));
      return { bytes: new Uint8Array(await png.arrayBuffer()), ext: 'png', mime: 'image/png' };
    } catch (e) { return null; } finally { URL.revokeObjectURL(url); }
  }

  async function build(blocks, page, meta = {}) {
    const skel = await JSZip.loadAsync(b64ToU8(SKELETON_B64));
    const files = {};
    for (const name of Object.keys(skel.files)) {
      if (skel.files[name].dir) continue;
      files[name] = await skel.file(name).async(name.endsWith('.png') ? 'uint8array' : 'string');
    }
    let header = files['Contents/header.xml'];
    const sec = files['Contents/section0.xml'];

    // --- 글꼴 ---
    const fontIds = {}; // 이름 → id
    const fontfaceRe = /<hh:fontface lang="([A-Z]+)" fontCnt="(\d+)">([\s\S]*?)<\/hh:fontface>/g;
    const existing = {};
    header.replace(fontfaceRe, (m, lang, cnt, body) => {
      if (lang === 'HANGUL') body.replace(/<hh:font id="(\d+)" face="([^"]*)"/g, (mm, id, face) => { existing[face] = +id; });
      return m;
    });
    let baseFontCount = Object.keys(existing).length;
    const newFonts = [];
    function fontId(name) {
      if (!name) return 1; // 함초롬바탕
      if (existing[name] !== undefined) return existing[name];
      if (fontIds[name] !== undefined) return fontIds[name];
      const id = baseFontCount + newFonts.length; newFonts.push(name); fontIds[name] = id; return id;
    }

    // --- 테두리/배경 ---
    const bfList = []; // xml strings; skeleton has 2 (1,2)
    const bfKey = {};
    function borderFill(border, fill) {
      const key = (border ? 'S' : 'N') + (fill || '');
      if (bfKey[key]) return bfKey[key];
      const id = 3 + bfList.length;
      const side = (n) => `<hh:${n} type="${border ? 'SOLID' : 'NONE'}" width="0.12 mm" color="#000000"/>`;
      const fillXml = fill ? `<hc:fillBrush><hc:winBrush faceColor="${fill}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : '';
      bfList.push(`<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>${side('leftBorder')}${side('rightBorder')}${side('topBorder')}${side('bottomBorder')}<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${fillXml}</hh:borderFill>`);
      bfKey[key] = id; return id;
    }

    // --- 글자모양 ---
    const charBase = (header.match(/<hh:charProperties itemCnt="(\d+)">/) || [0, 7])[1] | 0;
    const charList = []; const charKey = {};
    function charPr(r) {
      const o = { b: !!r.b, i: !!r.i, u: !!r.u, s: !!r.s, sup: !!r.sup, sub: !!r.sub, color: r.color || '#000000', bg: r.bg || '', size: r.size || 10, font: r.font || '' };
      const key = JSON.stringify(o);
      if (charKey[key] !== undefined) return charKey[key];
      const id = charBase + charList.length;
      const f = fontId(o.font);
      const seven = (v) => `hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"`;
      let x = `<hh:charPr id="${id}" height="${Math.round(o.size * 100)}" textColor="${o.color}" shadeColor="${o.bg || 'none'}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">`;
      x += `<hh:fontRef ${seven(f)}/><hh:ratio ${seven(100)}/><hh:spacing ${seven(0)}/><hh:relSz ${seven(100)}/><hh:offset ${seven(0)}/>`;
      if (o.i) x += '<hh:italic/>';
      if (o.b) x += '<hh:bold/>';
      x += `<hh:underline type="${o.u ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="#000000"/>`;
      x += `<hh:strikeout shape="${o.s ? 'SOLID' : 'NONE'}" color="#000000"/>`;
      x += '<hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>';
      if (o.sup) x += '<hh:supscript/>'; else if (o.sub) x += '<hh:subscript/>';
      x += '</hh:charPr>';
      charList.push(x); charKey[key] = id; return id;
    }

    // --- 문단모양 ---
    const paraBase = (header.match(/<hh:paraProperties itemCnt="(\d+)">/) || [0, 20])[1] | 0;
    const paraList = []; const paraKey = {};
    function paraPr(b) {
      const o = {
        align: ({ left: 'LEFT', right: 'RIGHT', center: 'CENTER', justify: 'JUSTIFY' })[b.align] || 'JUSTIFY',
        lh: b.lh || 160, ml: Math.round(Math.max(0, (b.ml || 0) + Math.min(0, b.ti || 0)) * HU), mr: Math.round((b.mr || 0) * HU), ti: Math.round((b.ti || 0) * HU),
        mt: Math.round((b.mt || 0) * HU), mb: Math.round((b.mb || 0) * HU),
      };
      const key = JSON.stringify(o);
      if (paraKey[key] !== undefined) return paraKey[key];
      const id = paraBase + paraList.length;
      const margin = (k) => `<hh:margin><hc:intent value="${o.ti * k}" unit="HWPUNIT"/><hc:left value="${o.ml * k}" unit="HWPUNIT"/><hc:right value="${o.mr * k}" unit="HWPUNIT"/><hc:prev value="${o.mt * k}" unit="HWPUNIT"/><hc:next value="${o.mb * k}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${o.lh}" unit="HWPUNIT"/>`;
      const x = `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR"><hh:align horizontal="${o.align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin(1)}</hp:case><hp:default>${margin(2)}</hp:default></hp:switch><hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
      paraList.push(x); paraKey[key] = id; return id;
    }

    // --- 그림 ---
    const bins = []; // {id, name, bytes, mime}
    let objId = 1000000;
    const nextId = () => ++objId;
    let paraId = 3000000;

    const textWidth = Math.round((page.w - page.ml - page.mr) * MM);

    async function runXml(r) {
      if (r.img) {
        const im = await dataUrlToImage(r.img.src);
        if (!im) return '';
        const n = bins.length + 1;
        const id = 'BIN' + String(n).padStart(4, '0');
        bins.push({ id, name: `BinData/${id}.${im.ext}`, bytes: im.bytes, mime: im.mime });
        let w = Math.round(r.img.w * HU), h = Math.round(r.img.h * HU);
        if (w > textWidth) { h = Math.round(h * textWidth / w); w = textWidth; }
        const oid = nextId();
        return `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES" reverse="0" id="${oid}" zOrder="0" numberingType="PICTURE" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${oid}"><hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${w >> 1}" centerY="${h >> 1}" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hc:img binaryItemIDRef="${id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${w}" height="${h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment/></hp:pic>`;
      }
      return '';
    }

    // 연속된 같은 모양 런을 하나의 hp:run으로 합침
    async function runsXml(runs, fallbackStyle) {
      let out = ''; let cur = null; let buf = '';
      const close = () => { if (cur !== null) { out += `<hp:run charPrIDRef="${cur}"><hp:t>${buf}</hp:t></hp:run>`; } cur = null; buf = ''; };
      let lastStyle = fallbackStyle;
      for (const r of runs) {
        if (r.img) {
          close();
          out += `<hp:run charPrIDRef="${charPr(lastStyle || {})}">${await runXml(r)}</hp:run>`;
          continue;
        }
        let id, piece;
        if (r.br) { id = cur !== null ? cur : charPr(lastStyle || {}); piece = '<hp:lineBreak/>'; }
        else if (r.tab) { id = cur !== null ? cur : charPr(lastStyle || {}); piece = '<hp:tab/>'; }
        else { lastStyle = r; id = charPr(r); piece = X(r.text); }
        if (id !== cur) { close(); cur = id; }
        buf += piece;
      }
      close();
      if (!out) out = `<hp:run charPrIDRef="${charPr(fallbackStyle || {})}"><hp:t/></hp:run>`;
      return out;
    }

    function styleOf(b) {
      const t = b.runs && b.runs.find((r) => r.text);
      return t || { size: 10 };
    }

    async function tableXml(tb) {
      const total = Math.min(textWidth, Math.round(tb.colW.reduce((a, c) => a + c, 0) * HU));
      const sum = tb.colW.reduce((a, c) => a + c, 0) || 1;
      const colHU = tb.colW.map((c) => Math.max(200, Math.round(c / sum * total)));
      const rowHU = (tb.rowH || []).map((h) => Math.max(282, Math.round(h * HU)));
      const tblH = rowHU.reduce((a, b) => a + b, 0) || 282 * tb.rows.length;
      const tbf = borderFill(tb.border, null);
      const oid = nextId();
      let x = `<hp:tbl id="${oid}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${tb.nrows}" colCnt="${tb.cols}" cellSpacing="0" borderFillIDRef="${tbf}" noAdjust="0">`;
      x += `<hp:sz width="${colHU.reduce((a, b) => a + b, 0)}" widthRelTo="ABSOLUTE" height="${tblH}" heightRelTo="ABSOLUTE" protect="0"/>`;
      x += `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="${tb.align === 'center' ? 'CENTER' : 'LEFT'}" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>`;
      for (let ri = 0; ri < tb.rows.length; ri++) {
        x += '<hp:tr>';
        for (const cell of tb.rows[ri]) {
          const w = colHU.slice(cell.c, cell.c + cell.cs).reduce((a, b) => a + b, 0);
          const h = rowHU.slice(cell.r, cell.r + cell.rs).reduce((a, b) => a + b, 0) || 282;
          const bf = borderFill(cell.border, cell.bg);
          let inner = '';
          for (const b of cell.blocks) inner += await blockXml(b, false);
          x += `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${cell.va || 'CENTER'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList><hp:cellAddr colAddr="${cell.c}" rowAddr="${cell.r}"/><hp:cellSpan colSpan="${cell.cs}" rowSpan="${cell.rs}"/><hp:cellSz width="${w}" height="${h}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
        }
        x += '</hp:tr>';
      }
      return x + '</hp:tbl>';
    }

    async function blockXml(b, top, secRun) {
      const pid = ++paraId;
      if (b.t === 'table') {
        const pp = paraPr({ align: b.align === 'center' ? 'center' : 'left', lh: 160 });
        return `<hp:p id="${pid}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${b.pb ? 1 : 0}" columnBreak="0" merged="0">${secRun || ''}<hp:run charPrIDRef="${charPr({ size: 10 })}">${await tableXml(b)}</hp:run></hp:p>`;
      }
      const pp = paraPr(b);
      const runs = await runsXml(b.runs, styleOf(b));
      return `<hp:p id="${pid}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${b.pb ? 1 : 0}" columnBreak="0" merged="0">${secRun || ''}${runs}</hp:p>`;
    }

    // --- 구역 설정(용지) ---
    const i0 = sec.indexOf('<hp:run charPrIDRef="0"><hp:secPr');
    const i1 = sec.indexOf('</hp:run>', sec.indexOf('</hp:ctrl>')) + '</hp:run>'.length;
    let secRun = sec.slice(i0, i1);
    const pw = Math.round(Math.min(page.w, page.h) * MM), ph = Math.round(Math.max(page.w, page.h) * MM);
    secRun = secRun.replace(/<hp:pagePr [^>]*>/, `<hp:pagePr landscape="${page.landscape ? 'NARROWLY' : 'WIDELY'}" width="${pw}" height="${ph}" gutterType="LEFT_ONLY">`)
      .replace(/<hp:margin [^>]*\/>/, `<hp:margin header="${Math.round(page.hd * MM)}" footer="${Math.round(page.ft * MM)}" gutter="0" left="${Math.round(page.ml * MM)}" right="${Math.round(page.mr * MM)}" top="${Math.round(page.mt * MM)}" bottom="${Math.round(page.mb * MM)}"/>`);
    const secHead = sec.slice(0, sec.indexOf('<hp:p '));

    let body = '';
    const list = blocks.length ? blocks : [{ t: 'p', align: 'justify', lh: 160, runs: [] }];
    for (let k = 0; k < list.length; k++) body += await blockXml(list[k], true, k === 0 ? secRun : '');
    files['Contents/section0.xml'] = secHead + body + '</hs:sec>';

    // --- header 갱신 ---
    if (newFonts.length) {
      header = header.replace(fontfaceRe, (m, lang, cnt, inner) => {
        const add = newFonts.map((n, k) => `<hh:font id="${+cnt + k}" face="${X(n)}" type="TTF" isEmbedded="0"/>`).join('');
        return `<hh:fontface lang="${lang}" fontCnt="${+cnt + newFonts.length}">${inner}${add}</hh:fontface>`;
      });
    }
    // 모든 언어 글꼴 개수가 같다는 전제(skeleton은 각 언어 동일) — fontRef id가 모든 언어에서 같은 이름을 가리킴
    if (bfList.length) {
      header = header.replace(/<hh:borderFills itemCnt="(\d+)">([\s\S]*?)<\/hh:borderFills>/, (m, c, inner) => `<hh:borderFills itemCnt="${+c + bfList.length}">${inner}${bfList.join('')}</hh:borderFills>`);
    }
    header = header.replace(/<hh:charProperties itemCnt="(\d+)">([\s\S]*?)<\/hh:charProperties>/, (m, c, inner) => `<hh:charProperties itemCnt="${+c + charList.length}">${inner}${charList.join('')}</hh:charProperties>`);
    header = header.replace(/<hh:paraProperties itemCnt="(\d+)">([\s\S]*?)<\/hh:paraProperties>/, (m, c, inner) => `<hh:paraProperties itemCnt="${+c + paraList.length}">${inner}${paraList.join('')}</hh:paraProperties>`);
    files['Contents/header.xml'] = header;

    // --- 목록·메타 ---
    let hpf = files['Contents/content.hpf'];
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    hpf = hpf.replace(/<opf:title\/>|<opf:title>[^<]*<\/opf:title>/, `<opf:title>${X(meta.title || '')}</opf:title>`)
      .replace(/(<opf:meta name="creator" content="text">)[^<]*/, `$1${X(meta.author || '')}`)
      .replace(/(<opf:meta name="lastsaveby" content="text">)[^<]*/, `$1${X(meta.author || '')}`)
      .replace(/(<opf:meta name="CreatedDate" content="text">)[^<]*/, `$1${now}`)
      .replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*/, `$1${now}`)
      .replace(/(<opf:meta name="date" content="text">)[^<]*/, `$1${X(new Date().toLocaleString('ko-KR'))}`);
    if (bins.length) {
      hpf = hpf.replace('</opf:manifest>', bins.map((b) => `<opf:item id="${b.id}" href="${b.name}" media-type="${b.mime}" isEmbeded="1"/>`).join('') + '</opf:manifest>');
    }
    files['Contents/content.hpf'] = hpf;
    files['Preview/PrvText.txt'] = DocModel.plainText(blocks).slice(0, 1024) || ' ';

    // --- 압축(mimetype은 맨 앞, 무압축) ---
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    const order = ['version.xml', 'Contents/header.xml', 'Contents/section0.xml', 'Preview/PrvText.txt', 'settings.xml', 'Preview/PrvImage.png', 'META-INF/container.rdf', 'Contents/content.hpf', 'META-INF/container.xml', 'META-INF/manifest.xml'];
    for (const n of order) if (files[n] !== undefined) zip.file(n, files[n], { compression: n === 'version.xml' || n.endsWith('.png') ? 'STORE' : 'DEFLATE' });
    for (const b of bins) zip.file(b.name, b.bytes, { compression: 'STORE' });
    return zip.generateAsync({ type: 'uint8array', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
  }

  return { build };
})();
