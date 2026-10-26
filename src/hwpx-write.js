/* ===== 문서 모델 → HWPX 패키지 =====
 * 한컴 OWPML 구조를 따르는 검증된 빈 문서(Skeleton.hwpx)를 바탕으로
 * header.xml에 글자모양·문단모양·테두리를 추가하고 section0.xml 본문을 새로 쓴다.
 * build()        : 한글 문서(문단 흐름 + 떠 있는 개체 + 머리말/꼬리말/쪽 번호/각주/링크)
 * buildDesign()  : 디자인 프로젝트(쪽마다 종이 기준으로 놓인 글상자·그림·도형)
 */
const HWPXWriter = (() => {
  const X = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const HU = 75; // 1px(96dpi) = 75 HWPUNIT
  const MM = 283.465; // 1mm = 283.465 HWPUNIT
  const PXMM = 96 / 25.4;

  function b64ToU8(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

  async function dataUrlToImage(src) {
    // png/jpg/gif/bmp는 그대로, 그 외(webp·svg 등)는 PNG로 바꿈
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

  const IDENT = '<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>';
  const geom = (w, h, oh) => `<hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${oh === undefined ? h : oh}"/><hp:curSz width="${w}" height="${oh === undefined ? h : oh}"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="${w >> 1}" centerY="${h >> 1}" rotateimage="1"/><hp:renderingInfo>${IDENT}</hp:renderingInfo>`;
  const WRAP = { square: 'SQUARE', block: 'TOP_AND_BOTTOM', front: 'IN_FRONT_OF_TEXT', behind: 'BEHIND_TEXT' };
  // 위치: 글자처럼 취급 / 문단 기준 정렬(어울림·자리 차지) / 종이 기준 좌표(글 앞·뒤)
  function posXml(o) {
    if (!o || o.inline) return '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>';
    if (o.wrap === 'front' || o.wrap === 'behind') {
      return `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="1" holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="${Math.max(0, Math.round(o.y * HU))}" horzOffset="${Math.max(0, Math.round(o.x * HU))}"/>`;
    }
    const ha = ({ left: 'LEFT', center: 'CENTER', right: 'RIGHT' })[o.align] || 'LEFT';
    return `<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="${ha}" vertOffset="0" horzOffset="0"/>`;
  }
  const outMargin = (o) => (o && o.wrap === 'square' ? '<hp:outMargin left="567" right="567" top="283" bottom="283"/>' : '<hp:outMargin left="0" right="0" top="0" bottom="0"/>');

  /* ---------- 공용 작업 틀 ---------- */
  async function context(page, meta = {}) {
    const skel = await JSZip.loadAsync(b64ToU8(SKELETON_B64));
    const files = {};
    for (const name of Object.keys(skel.files)) {
      if (skel.files[name].dir) continue;
      files[name] = await skel.file(name).async(name.endsWith('.png') ? 'uint8array' : 'string');
    }
    const C = { files, page, meta, header: files['Contents/header.xml'], sec: files['Contents/section0.xml'] };
    const fontfaceRe = /<hh:fontface lang="([A-Z]+)" fontCnt="(\d+)">([\s\S]*?)<\/hh:fontface>/g;
    const existing = {};
    C.header.replace(fontfaceRe, (m, lang, cnt, body) => { if (lang === 'HANGUL') body.replace(/<hh:font id="(\d+)" face="([^"]*)"/g, (mm, id, face) => { existing[face] = +id; }); return m; });
    const baseFontCount = Object.keys(existing).length;
    const newFonts = []; const fontIds = {};
    C.fontId = (name) => {
      if (!name) return 1; // 함초롬바탕
      if (existing[name] !== undefined) return existing[name];
      if (fontIds[name] !== undefined) return fontIds[name];
      const id = baseFontCount + newFonts.length; newFonts.push(name); fontIds[name] = id; return id;
    };
    const bfList = []; const bfKey = {};
    C.borderFill = (border, fill) => {
      const key = (border ? 'S' : 'N') + (fill || '');
      if (bfKey[key]) return bfKey[key];
      const id = 3 + bfList.length;
      const side = (n) => `<hh:${n} type="${border ? 'SOLID' : 'NONE'}" width="0.12 mm" color="#000000"/>`;
      const fillXml = fill ? `<hc:fillBrush><hc:winBrush faceColor="${fill}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : '';
      bfList.push(`<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>${side('leftBorder')}${side('rightBorder')}${side('topBorder')}${side('bottomBorder')}<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${fillXml}</hh:borderFill>`);
      bfKey[key] = id; return id;
    };
    const charBase = (C.header.match(/<hh:charProperties itemCnt="(\d+)">/) || [0, 7])[1] | 0;
    const charList = []; const charKey = {};
    C.charPr = (r) => {
      const o = { b: !!r.b, i: !!r.i, u: !!r.u, s: !!r.s, sup: !!r.sup, sub: !!r.sub, color: r.color || '#000000', bg: r.bg || '', size: r.size || 10, font: r.font || '',
        ls: Math.max(-50, Math.min(50, Math.round(r.ls || 0))), sh: !!r.shadow, ol: !!r.outline };
      const key = JSON.stringify(o);
      if (charKey[key] !== undefined) return charKey[key];
      const id = charBase + charList.length;
      const f = C.fontId(o.font);
      const seven = (v) => `hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"`;
      let x = `<hh:charPr id="${id}" height="${Math.round(o.size * 100)}" textColor="${o.color}" shadeColor="${o.bg || 'none'}" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2">`;
      x += `<hh:fontRef ${seven(f)}/><hh:ratio ${seven(100)}/><hh:spacing ${seven(o.ls)}/><hh:relSz ${seven(100)}/><hh:offset ${seven(0)}/>`;
      if (o.i) x += '<hh:italic/>';
      if (o.b) x += '<hh:bold/>';
      x += `<hh:underline type="${o.u ? 'BOTTOM' : 'NONE'}" shape="SOLID" color="${o.u ? o.color : '#000000'}"/>`;
      x += `<hh:strikeout shape="${o.s ? 'SOLID' : 'NONE'}" color="#000000"/>`;
      x += `<hh:outline type="${o.ol ? 'SOLID' : 'NONE'}"/>`;
      x += `<hh:shadow type="${o.sh ? 'DROP' : 'NONE'}" color="#B2B2B2" offsetX="10" offsetY="10"/>`;
      if (o.sup) x += '<hh:supscript/>'; else if (o.sub) x += '<hh:subscript/>';
      x += '</hh:charPr>';
      charList.push(x); charKey[key] = id; return id;
    };
    const paraBase = (C.header.match(/<hh:paraProperties itemCnt="(\d+)">/) || [0, 20])[1] | 0;
    const paraList = []; const paraKey = {};
    C.paraPr = (b) => {
      const o = {
        align: ({ left: 'LEFT', right: 'RIGHT', center: 'CENTER', justify: 'JUSTIFY' })[b.align] || 'JUSTIFY',
        lh: b.lh || 160, ml: Math.round(Math.max(0, (b.ml || 0) + Math.min(0, b.ti || 0)) * HU), mr: Math.round((b.mr || 0) * HU), ti: Math.round((b.ti || 0) * HU),
        mt: Math.round((b.mt || 0) * HU), mb: Math.round((b.mb || 0) * HU), kn: !!b.keepNext,
      };
      const key = JSON.stringify(o);
      if (paraKey[key] !== undefined) return paraKey[key];
      const id = paraBase + paraList.length;
      const margin = (k) => `<hh:margin><hc:intent value="${o.ti * k}" unit="HWPUNIT"/><hc:left value="${o.ml * k}" unit="HWPUNIT"/><hc:right value="${o.mr * k}" unit="HWPUNIT"/><hc:prev value="${o.mt * k}" unit="HWPUNIT"/><hc:next value="${o.mb * k}" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="${o.lh}" unit="HWPUNIT"/>`;
      paraList.push(`<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR"><hh:align horizontal="${o.align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="${o.kn ? 1 : 0}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${margin(1)}</hp:case><hp:default>${margin(2)}</hp:default></hp:switch><hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`);
      paraKey[key] = id; return id;
    };
    const bins = [];
    C.bins = bins;
    let objId = 1000000; C.nextId = () => ++objId;
    let paraId = 3000000; C.nextPara = () => ++paraId;
    let z = 0; C.nextZ = () => z++;
    C.textWidth = Math.round((page.w - page.ml - page.mr) * MM);
    C.addBin = async (src) => {
      const im = await dataUrlToImage(src);
      if (!im) return null;
      const id = 'BIN' + String(bins.length + 1).padStart(4, '0');
      bins.push({ id, name: `BinData/${id}.${im.ext}`, bytes: im.bytes, mime: im.mime });
      return id;
    };

    /* ----- 개체 ----- */
    C.picXml = async (src, wPx, hPx, place) => {
      const bin = await C.addBin(src); if (!bin) return '';
      let w = Math.max(1, Math.round(wPx * HU)), h = Math.max(1, Math.round(hPx * HU));
      if (place.inline && w > C.textWidth) { h = Math.round(h * C.textWidth / w); w = C.textWidth; }
      const oid = C.nextId(); const wrap = place.inline ? 'SQUARE' : WRAP[place.wrap] || 'SQUARE';
      return `<hp:pic textWrap="${wrap}" textFlow="BOTH_SIDES" reverse="0" id="${oid}" zOrder="${C.nextZ()}" numberingType="PICTURE" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${oid}">${geom(w, h)}<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect><hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/><hc:img binaryItemIDRef="${bin}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/><hp:sz width="${w}" height="${h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>${posXml(place)}${outMargin(place)}<hp:shapeComment/></hp:pic>`;
    };
    const lineShape = (o) => {
      const has = o.stroke && (o.sw || 0) > 0;
      return `<hp:lineShape color="${has ? o.stroke : '#000000'}" width="${has ? Math.max(1, Math.round(o.sw * HU)) : 0}" style="${has ? (o.dash ? 'DASH' : 'SOLID') : 'NONE'}" endCap="FLAT" headStyle="NORMAL" tailStyle="${o.arrow ? 'ARROW' : 'NORMAL'}" headfill="1" tailfill="1" headSz="MEDIUM_MEDIUM" tailSz="MEDIUM_MEDIUM" outlineStyle="NORMAL" alpha="0"/>`;
    };
    // 글상자·사각형·원 (글이 있으면 drawText)
    C.boxXml = async (o) => {
      const w = Math.max(1, Math.round(o.w * HU)), h = Math.max(1, Math.round(o.h * HU));
      const oid = C.nextId();
      const fill = o.fill ? `<hc:fillBrush><hc:winBrush faceColor="${o.fill}" hatchColor="#FFFFFF" alpha="0"/></hc:fillBrush>` : '';
      let text = '';
      if (o.blocks && o.blocks.length) {
        let paras = '';
        for (const b of o.blocks) paras += await C.blockXml(b);
        const m = Math.round((o.pad || 0) * HU);
        text = `<hp:drawText lastWidth="${w}" name="" editable="0"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${o.va || 'TOP'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${paras}</hp:subList><hp:textMargin left="${m}" right="${m}" top="${m}" bottom="${m}"/></hp:drawText>`;
      }
      const shadow = '<hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/>';
      const head = `id="${oid}" zOrder="${C.nextZ()}" numberingType="NONE" textWrap="${WRAP[o.wrap] || 'IN_FRONT_OF_TEXT'}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${oid}"`;
      const tail = `<hp:sz width="${w}" height="${h}" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>${posXml(o)}${outMargin(o)}`;
      if (o.shape === 'ellipse') {
        const cx = w >> 1, cy = h >> 1;
        return `<hp:ellipse intervalDirty="0" hasArcPr="0" arcType="NORMAL" ${head}>${geom(w, h)}${lineShape(o)}${fill}${text}${shadow}<hc:center x="${cx}" y="${cy}"/><hc:ax1 x="${w}" y="${cy}"/><hc:ax2 x="${cx}" y="${h}"/><hc:start1 x="${w}" y="${cy}"/><hc:end1 x="${w}" y="${cy}"/><hc:start2 x="${w}" y="${cy}"/><hc:end2 x="${w}" y="${cy}"/>${tail}</hp:ellipse>`;
      }
      const ratio = Math.max(0, Math.min(50, Math.round((o.radius || 0) / Math.max(1, Math.min(o.w, o.h)) * 100)));
      return `<hp:rect ratio="${ratio}" ${head}>${geom(w, h)}${lineShape(o)}${fill}${text}${shadow}<hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/>${tail}</hp:rect>`;
    };
    C.lineXml = (o) => {
      const w = Math.max(1, Math.round(o.w * HU)); const oid = C.nextId();
      const y = (o.y || 0) + (o.h || 0) / 2;
      return `<hp:line isReverseHV="0" id="${oid}" zOrder="${C.nextZ()}" numberingType="NONE" textWrap="${WRAP[o.wrap] || 'IN_FRONT_OF_TEXT'}" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${oid}">${geom(w, 0, 1)}${lineShape(Object.assign({}, o, { stroke: o.stroke || '#000000', sw: Math.max(0.5, o.sw || 1) }))}<hp:shadow type="NONE" color="#B2B2B2" offsetX="0" offsetY="0" alpha="0"/><hc:startPt x="0" y="0"/><hc:endPt x="${w}" y="0"/><hp:sz width="${w}" height="0" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>${posXml(Object.assign({}, o, { y }))}${outMargin(o)}</hp:line>`;
    };
    C.objXml = async (ob) => {
      if (ob.kind === 'pic') return C.picXml(ob.src, ob.w, ob.h, ob);
      if (ob.kind === 'line') return C.lineXml(ob);
      return C.boxXml(ob);
    };

    /* ----- 글 ----- */
    const fieldCmd = (url) => url.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/;/g, '\\;') + ';1;0;0;';
    let fnNo = 0;
    C.footnoteCount = () => fnNo;
    C.runsXml = async (runs, fallbackStyle) => {
      let out = ''; let cur = null; let buf = '';
      const close = () => { if (cur !== null) out += `<hp:run charPrIDRef="${cur}"><hp:t>${buf}</hp:t></hp:run>`; cur = null; buf = ''; };
      let lastStyle = fallbackStyle; let link = null;
      const linkOpen = (url) => {
        close(); const bid = C.nextId(), fid = C.nextId(); link = { bid, fid };
        out += `<hp:run charPrIDRef="${C.charPr(lastStyle || {})}"><hp:ctrl><hp:fieldBegin id="${bid}" type="HYPERLINK" name="${X(url)}" editable="0" dirty="0" zorder="-1" fieldid="${fid}"><hp:parameters cnt="6" name=""><hp:integerParam name="Prop">0</hp:integerParam><hp:stringParam name="Command">${X(fieldCmd(url))}</hp:stringParam><hp:stringParam name="Path">${X(url)}</hp:stringParam><hp:stringParam name="Category">HWPHYPERLINK_TYPE_URL</hp:stringParam><hp:stringParam name="TargetType">HWPHYPERLINK_TARGET_BOOKMARK</hp:stringParam><hp:stringParam name="DocOpenType">HWPHYPERLINK_JUMP_CURRENTTAB</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl></hp:run>`;
        link.url = url;
      };
      const linkClose = () => { if (!link) return; close(); out += `<hp:run charPrIDRef="${C.charPr(lastStyle || {})}"><hp:ctrl><hp:fieldEnd beginIDRef="${link.bid}" fieldid="${link.fid}"/></hp:ctrl></hp:run>`; link = null; };
      for (const r of runs) {
        const want = r.text !== undefined ? (r.link || null) : (link ? link.url : null);
        if (link && want !== link.url) linkClose();
        if (!link && want) linkOpen(want);
        if (r.img) { close(); out += `<hp:run charPrIDRef="${C.charPr(lastStyle || {})}">${await C.picXml(r.img.src, r.img.w, r.img.h, { inline: true })}</hp:run>`; continue; }
        if (r.obj) { close(); out += `<hp:run charPrIDRef="${C.charPr(lastStyle || {})}">${await C.objXml(r.obj)}</hp:run>`; continue; }
        if (r.fn) {
          close(); fnNo++;
          const txt = X(r.fn);
          out += `<hp:run charPrIDRef="${C.charPr(lastStyle || {})}"><hp:ctrl><hp:footNote number="${fnNo}" suffixChar="41" instId="${C.nextId()}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p paraPrIDRef="10" styleIDRef="15" pageBreak="0" columnBreak="0" merged="0" id="${C.nextPara()}"><hp:run charPrIDRef="3"><hp:ctrl><hp:autoNum num="${fnNo}" numType="FOOTNOTE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/></hp:autoNum></hp:ctrl><hp:t> ${txt}</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl></hp:run>`;
          continue;
        }
        let id, piece;
        if (r.br) { id = cur !== null ? cur : C.charPr(lastStyle || {}); piece = '<hp:lineBreak/>'; }
        else if (r.tab) { id = cur !== null ? cur : C.charPr(lastStyle || {}); piece = '<hp:tab/>'; }
        else { lastStyle = r; id = C.charPr(r); piece = X(r.text); }
        if (id !== cur) { close(); cur = id; }
        buf += piece;
      }
      close(); linkClose();
      if (!out) out = `<hp:run charPrIDRef="${C.charPr(fallbackStyle || {})}"><hp:t/></hp:run>`;
      return out;
    };
    const styleOf = (b) => (b.runs && b.runs.find((r) => r.text)) || { size: 10 };
    C.tableXml = async (tb) => {
      const total = Math.min(C.textWidth, Math.round(tb.colW.reduce((a, c) => a + c, 0) * HU));
      const sum = tb.colW.reduce((a, c) => a + c, 0) || 1;
      const colHU = tb.colW.map((c) => Math.max(200, Math.round(c / sum * total)));
      const rowHU = (tb.rowH || []).map((h) => Math.max(282, Math.round(h * HU)));
      const tblH = rowHU.reduce((a, b) => a + b, 0) || 282 * tb.rows.length;
      const tbf = C.borderFill(tb.border, null);
      const oid = C.nextId();
      let x = `<hp:tbl id="${oid}" zOrder="${C.nextZ()}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${tb.nrows}" colCnt="${tb.cols}" cellSpacing="0" borderFillIDRef="${tbf}" noAdjust="0">`;
      x += `<hp:sz width="${colHU.reduce((a, b) => a + b, 0)}" widthRelTo="ABSOLUTE" height="${tblH}" heightRelTo="ABSOLUTE" protect="0"/>`;
      x += `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="${tb.align === 'center' ? 'CENTER' : 'LEFT'}" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>`;
      for (let ri = 0; ri < tb.rows.length; ri++) {
        x += '<hp:tr>';
        for (const cell of tb.rows[ri]) {
          const w = colHU.slice(cell.c, cell.c + cell.cs).reduce((a, b) => a + b, 0);
          const h = rowHU.slice(cell.r, cell.r + cell.rs).reduce((a, b) => a + b, 0) || 282;
          const bf = C.borderFill(cell.border, cell.bg);
          let inner = '';
          for (const b of cell.blocks) inner += await C.blockXml(b);
          x += `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${cell.va || 'CENTER'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${inner}</hp:subList><hp:cellAddr colAddr="${cell.c}" rowAddr="${cell.r}"/><hp:cellSpan colSpan="${cell.cs}" rowSpan="${cell.rs}"/><hp:cellSz width="${w}" height="${h}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
        }
        x += '</hp:tr>';
      }
      return x + '</hp:tbl>';
    };
    C.blockXml = async (b, secRun) => {
      const pid = C.nextPara();
      if (b.t === 'table') {
        const pp = C.paraPr({ align: b.align === 'center' ? 'center' : 'left', lh: 160 });
        return `<hp:p id="${pid}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${b.pb ? 1 : 0}" columnBreak="0" merged="0">${secRun || ''}<hp:run charPrIDRef="${C.charPr({ size: 10 })}">${await C.tableXml(b)}</hp:run></hp:p>`;
      }
      const pp = C.paraPr(b);
      const runs = await C.runsXml(b.runs || [], styleOf(b));
      return `<hp:p id="${pid}" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${b.pb ? 1 : 0}" columnBreak="0" merged="0">${secRun || ''}${runs}</hp:p>`;
    };

    /* ----- 구역(용지·머리말·꼬리말) ----- */
    C.secRun = (hf) => {
      const sec = C.sec;
      const i0 = sec.indexOf('<hp:run charPrIDRef="0"><hp:secPr');
      const i1 = sec.indexOf('</hp:run>', sec.indexOf('</hp:ctrl>'));
      let run = sec.slice(i0, i1);
      const pw = Math.round(Math.min(page.w, page.h) * MM), ph = Math.round(Math.max(page.w, page.h) * MM);
      run = run.replace(/<hp:pagePr [^>]*>/, `<hp:pagePr landscape="${page.landscape ? 'NARROWLY' : 'WIDELY'}" width="${pw}" height="${ph}" gutterType="LEFT_ONLY">`)
        .replace(/<hp:margin [^>]*\/>/, `<hp:margin header="${Math.round(page.hd * MM)}" footer="${Math.round(page.ft * MM)}" gutter="0" left="${Math.round(page.ml * MM)}" right="${Math.round(page.mr * MM)}" top="${Math.round(page.mt * MM)}" bottom="${Math.round(page.mb * MM)}"/>`);
      return run + (hf ? C.headerFooterXml(hf) : '') + '</hp:run>';
    };
    C.headerFooterXml = (hf) => {
      const pn = hf.pnum && hf.pnum.pos && hf.pnum.pos !== 'none' ? hf.pnum : null;
      const zone = (which) => {
        const z = hf[which] || {}; const paras = [];
        const st = { size: z.size || 9, color: z.color || '#333333', font: z.font || '' };
        if (z.text) paras.push(`<hp:p paraPrIDRef="${C.paraPr({ align: z.align || 'center', lh: 160 })}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0" id="${C.nextPara()}"><hp:run charPrIDRef="${C.charPr(st)}"><hp:t>${X(z.text)}</hp:t></hp:run></hp:p>`);
        if (pn && pn.pos.startsWith(which === 'header' ? 'top' : 'bottom')) {
          const al = pn.pos.split('-')[1] || 'center'; const cp = C.charPr(st);
          const num = (type) => `<hp:run charPrIDRef="${cp}"><hp:ctrl><hp:autoNum num="1" numType="${type}"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/></hp:autoNum></hp:ctrl></hp:run>`;
          const t = (s) => (s ? `<hp:run charPrIDRef="${cp}"><hp:t>${X(s)}</hp:t></hp:run>` : '');
          const f = pn.fmt || 'n';
          const body = f === 'dash' ? t('- ') + num('PAGE') + t(' -') : f === 'total' ? num('PAGE') + t(' / ') + num('TOTAL_PAGE') : f === 'jjok' ? num('PAGE') + t('쪽') : num('PAGE');
          paras.push(`<hp:p paraPrIDRef="${C.paraPr({ align: al, lh: 160 })}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0" id="${C.nextPara()}">${body}</hp:p>`);
        }
        if (!paras.length) return '';
        const h = Math.round((which === 'header' ? page.hd : page.ft) * MM);
        return `<hp:ctrl><hp:${which} id="${C.nextId()}" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${which === 'header' ? 'TOP' : 'BOTTOM'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="${C.textWidth}" textHeight="${h}" hasTextRef="0" hasNumRef="0">${paras.join('')}</hp:subList></hp:${which}></hp:ctrl>`;
      };
      return zone('header') + zone('footer');
    };

    /* ----- 마무리: header.xml 갱신 + 압축 ----- */
    C.finish = async (bodyXml, plain) => {
      const secHead = C.sec.slice(0, C.sec.indexOf('<hp:p '));
      files['Contents/section0.xml'] = secHead + bodyXml + '</hs:sec>';
      let header = C.header;
      if (newFonts.length) {
        header = header.replace(fontfaceRe, (m, lang, cnt, inner) => {
          const add = newFonts.map((n, k) => `<hh:font id="${+cnt + k}" face="${X(n)}" type="TTF" isEmbedded="0"/>`).join('');
          return `<hh:fontface lang="${lang}" fontCnt="${+cnt + newFonts.length}">${inner}${add}</hh:fontface>`;
        });
      }
      if (bfList.length) header = header.replace(/<hh:borderFills itemCnt="(\d+)">([\s\S]*?)<\/hh:borderFills>/, (m, c, inner) => `<hh:borderFills itemCnt="${+c + bfList.length}">${inner}${bfList.join('')}</hh:borderFills>`);
      header = header.replace(/<hh:charProperties itemCnt="(\d+)">([\s\S]*?)<\/hh:charProperties>/, (m, c, inner) => `<hh:charProperties itemCnt="${+c + charList.length}">${inner}${charList.join('')}</hh:charProperties>`);
      header = header.replace(/<hh:paraProperties itemCnt="(\d+)">([\s\S]*?)<\/hh:paraProperties>/, (m, c, inner) => `<hh:paraProperties itemCnt="${+c + paraList.length}">${inner}${paraList.join('')}</hh:paraProperties>`);
      files['Contents/header.xml'] = header;
      let hpf = files['Contents/content.hpf'];
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      hpf = hpf.replace(/<opf:title\/>|<opf:title>[^<]*<\/opf:title>/, `<opf:title>${X(meta.title || '')}</opf:title>`)
        .replace(/(<opf:meta name="creator" content="text">)[^<]*/, `$1${X(meta.author || '')}`)
        .replace(/(<opf:meta name="lastsaveby" content="text">)[^<]*/, `$1${X(meta.author || '')}`)
        .replace(/(<opf:meta name="CreatedDate" content="text">)[^<]*/, `$1${now}`)
        .replace(/(<opf:meta name="ModifiedDate" content="text">)[^<]*/, `$1${now}`)
        .replace(/(<opf:meta name="date" content="text">)[^<]*/, `$1${X(new Date().toLocaleString('ko-KR'))}`);
      if (bins.length) hpf = hpf.replace('</opf:manifest>', bins.map((b) => `<opf:item id="${b.id}" href="${b.name}" media-type="${b.mime}" isEmbeded="1"/>`).join('') + '</opf:manifest>');
      files['Contents/content.hpf'] = hpf;
      files['Preview/PrvText.txt'] = (plain || '').slice(0, 1024) || ' ';
      const zip = new JSZip();
      zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
      const order = ['version.xml', 'Contents/header.xml', 'Contents/section0.xml', 'Preview/PrvText.txt', 'settings.xml', 'Preview/PrvImage.png', 'META-INF/container.rdf', 'Contents/content.hpf', 'META-INF/container.xml', 'META-INF/manifest.xml'];
      for (const n of order) if (files[n] !== undefined) zip.file(n, files[n], { compression: n === 'version.xml' || n.endsWith('.png') ? 'STORE' : 'DEFLATE' });
      for (const b of bins) zip.file(b.name, b.bytes, { compression: 'STORE' });
      return zip.generateAsync({ type: 'uint8array', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
    };
    return C;
  }

  /* ---------- 한글 문서 ---------- */
  async function build(blocks, page, meta = {}, extras = {}) {
    const C = await context(page, meta);
    const list = blocks.length ? blocks : [{ t: 'p', align: 'justify', lh: 160, runs: [] }];
    let body = '';
    const first = C.secRun(extras.hf);
    for (let k = 0; k < list.length; k++) body += await C.blockXml(list[k], k === 0 ? first : '');
    return C.finish(body, DocModel.plainText(blocks));
  }

  /* ---------- 디자인 프로젝트 ----------
   * objectsPerPage: [[{kind:'pic'|'box'|'line', ...종이 기준 px 좌표}...], ...]
   */
  async function buildDesign(objectsPerPage, size, meta = {}) {
    const page = { w: size.w / PXMM, h: size.h / PXMM, landscape: size.w > size.h, ml: 0, mr: 0, mt: 0, mb: 0, hd: 0, ft: 0 };
    const C = await context(page, meta);
    C.textWidth = Math.round(page.w * MM);
    let body = '';
    for (let k = 0; k < objectsPerPage.length; k++) {
      let runs = '';
      for (const ob of objectsPerPage[k]) runs += `<hp:run charPrIDRef="${C.charPr({ size: 1 })}">${await C.objXml(ob)}</hp:run>`;
      runs += `<hp:run charPrIDRef="${C.charPr({ size: 1 })}"><hp:t/></hp:run>`;
      body += `<hp:p id="${C.nextPara()}" paraPrIDRef="${C.paraPr({ align: 'left', lh: 100 })}" styleIDRef="0" pageBreak="${k > 0 ? 1 : 0}" columnBreak="0" merged="0">${k === 0 ? C.secRun(null) : ''}${runs}</hp:p>`;
    }
    return C.finish(body, meta.plain || '');
  }

  return { build, buildDesign, dataUrlToImage };
})();
