/* ===== 디자인 레이어 그리기 + 모션 + 슬라이드쇼 =====
 * 이 함수 하나는 자기 완결형이다. 편집기에서도 쓰고, "HTML 슬라이드쇼"로 내보낼 때
 * 함수 소스를 그대로 넣어 같은 모양·같은 움직임으로 재생한다. (바깥 변수 참조 금지)
 */
function HwpMotionLib() {
  const SANS = "'Noto Sans KR', 'Nanum Gothic', 'Malgun Gothic', sans-serif";
  const SERIF = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const SERIF_RE = /바탕|명조|궁서|batang|myeongjo|serif|times|georgia|garamond|song myung|gowun batang|hahmlet/i;
  function fontCss(name) {
    if (!name) return SANS;
    const n = String(name).replace(/["']/g, '');
    return `'${n}', ${SERIF_RE.test(n) ? SERIF : SANS}`;
  }

  /* ---------- 도형 ---------- */
  const SHAPES = {
    rect: '사각형', roundrect: '둥근 사각형', ellipse: '원', triangle: '삼각형', diamond: '마름모',
    pentagon: '오각형', hexagon: '육각형', star: '별', heart: '하트', arrow: '화살표', speech: '말풍선', line: '선',
  };
  function poly(pts) { return pts.map((p) => p.map((v) => +v.toFixed(2)).join(',')).join(' '); }
  function shapeGeom(kind, w, h, r, inset) {
    const i = inset, W = w - i, H = h - i, cx = w / 2, cy = h / 2, rw = (w - 2 * i) / 2, rh = (h - 2 * i) / 2;
    const ngon = (n, rot) => Array.from({ length: n }, (_, k) => { const a = rot + k * 2 * Math.PI / n; return [cx + rw * Math.cos(a), cy + rh * Math.sin(a)]; });
    switch (kind) {
      case 'rect': return `<rect x="${i}" y="${i}" width="${Math.max(0, w - 2 * i)}" height="${Math.max(0, h - 2 * i)}"/>`;
      case 'roundrect': { const rr = Math.min(r || 0, rw, rh); return `<rect x="${i}" y="${i}" width="${Math.max(0, w - 2 * i)}" height="${Math.max(0, h - 2 * i)}" rx="${rr}" ry="${rr}"/>`; }
      case 'ellipse': return `<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(0, rw)}" ry="${Math.max(0, rh)}"/>`;
      case 'triangle': return `<polygon points="${poly([[cx, i], [W, H], [i, H]])}"/>`;
      case 'diamond': return `<polygon points="${poly([[cx, i], [W, cy], [cx, H], [i, cy]])}"/>`;
      case 'pentagon': return `<polygon points="${poly(ngon(5, -Math.PI / 2))}"/>`;
      case 'hexagon': return `<polygon points="${poly(ngon(6, 0))}"/>`;
      case 'star': {
        const pts = [];
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const f = k % 2 ? 0.42 : 1; pts.push([cx + rw * f * Math.cos(a), cy + rh * f * Math.sin(a) + (rh * 0.08)]); }
        return `<polygon points="${poly(pts)}"/>`;
      }
      case 'heart': return `<path d="M${cx} ${H} C ${cx - rw * 1.35} ${cy + rh * 0.15}, ${i + rw * 0.05} ${i - rh * 0.25}, ${cx} ${i + rh * 0.45} C ${W - rw * 0.05} ${i - rh * 0.25}, ${cx + rw * 1.35} ${cy + rh * 0.15}, ${cx} ${H} Z"/>`;
      case 'arrow': { const sh = h * 0.28, hx = w - Math.min(w * 0.42, h * 0.9); return `<polygon points="${poly([[i, cy - sh], [hx, cy - sh], [hx, i], [W, cy], [hx, H], [hx, cy + sh], [i, cy + sh]])}"/>`; }
      case 'speech': { const bh = (h - 2 * i) * 0.78, rr = Math.min(r || 18, rw, bh / 2); return `<path d="M${i + rr} ${i} H${W - rr} Q${W} ${i} ${W} ${i + rr} V${i + bh - rr} Q${W} ${i + bh} ${W - rr} ${i + bh} H${i + w * 0.38} L${i + w * 0.2} ${H} L${i + w * 0.24} ${i + bh} H${i + rr} Q${i} ${i + bh} ${i} ${i + bh - rr} V${i + rr} Q${i} ${i} ${i + rr} ${i} Z"/>`; }
      default: return `<rect x="${i}" y="${i}" width="${w - 2 * i}" height="${h - 2 * i}"/>`;
    }
  }
  function shapeSvg(L) {
    const w = Math.max(1, L.w), h = Math.max(1, L.h);
    const sw = +L.sw || 0; const stroke = sw && L.stroke ? L.stroke : 'none';
    const dash = L.dash ? ` stroke-dasharray="${sw * 3} ${sw * 2}"` : '';
    if (L.kind === 'line') {
      const lw = Math.max(1, sw || 3); const col = L.stroke || L.fill || '#222222';
      const id = 'ah' + (L.id || Math.random().toString(36).slice(2));
      const mk = L.arrowEnd ? `<defs><marker id="${id}" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 Z" fill="${col}"/></marker></defs>` : '';
      const end = L.arrowEnd ? w - lw * 2 : w;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;overflow:visible">${mk}<line x1="0" y1="${h / 2}" x2="${end}" y2="${h / 2}" stroke="${col}" stroke-width="${lw}" stroke-linecap="round"${dash}${L.arrowEnd ? ` marker-end="url(#${id})"` : ''}/></svg>`;
    }
    const fill = L.fill || 'none';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;overflow:visible"><g fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash} stroke-linejoin="round">${shapeGeom(L.kind, w, h, +L.radius || 0, sw / 2)}</g></svg>`;
  }

  /* ---------- 레이어 그리기 ---------- */
  function textCss(L) {
    const st = [
      'font-family:' + fontCss(L.font), 'font-size:' + (L.size || 24) + 'px', 'color:' + (L.color || '#1b2333'),
      'line-height:' + (L.lh || 1.4), 'text-align:' + (L.align || 'left'),
      'letter-spacing:' + ((+L.ls || 0) / 100) + 'em',
    ];
    if (L.bold) st.push('font-weight:700');
    if (L.italic) st.push('font-style:italic');
    if (L.underline) st.push('text-decoration:underline');
    if (L.type === 'text' && L.bg) st.push('background:' + L.bg);
    if (L.pad) st.push('padding:' + L.pad + 'px');
    if (L.tshadow) st.push('text-shadow:0 2px 6px rgba(0,0,0,.35)');
    if (L.stroke && L.type === 'text' && L.sw) st.push(`-webkit-text-stroke:${L.sw}px ${L.stroke}`);
    return st.join(';');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function layerEl(L, opts = {}) {
    const el = document.createElement('div');
    el.className = 'ly ly-' + L.type;
    el.dataset.id = L.id;
    applyBox(el, L);
    const a = document.createElement('div'); a.className = 'ly-a';
    if (L.opacity !== undefined && L.opacity < 1) a.style.opacity = L.opacity;
    if (L.shadow) a.style.filter = 'drop-shadow(0 6px 14px rgba(0,0,0,.28))';
    if (L.type === 'image') {
      const img = document.createElement('img');
      const src = L.src && L.src.startsWith('asset:') && opts.assets ? opts.assets[L.src.slice(6)] : L.src;
      img.src = src || ''; img.alt = ''; img.draggable = false;
      img.style.cssText = `width:100%;height:100%;display:block;object-fit:${L.fit || 'cover'};border-radius:${+L.radius || 0}px;${L.flipH ? 'transform:scaleX(-1);' : ''}${L.sw && L.stroke ? `outline:${L.sw}px solid ${L.stroke};outline-offset:-${L.sw}px;` : ''}`;
      a.appendChild(img);
    } else if (L.type === 'shape') {
      a.innerHTML = shapeSvg(L);
      if (L.html && L.kind !== 'line') {
        const t = document.createElement('div'); t.className = 'ly-t ly-st';
        t.style.cssText = textCss(L) + `;justify-content:${({ top: 'flex-start', bottom: 'flex-end' })[L.valign] || 'center'}`;
        t.innerHTML = L.html; a.appendChild(t);
      }
    } else {
      const t = document.createElement('div'); t.className = 'ly-t';
      t.style.cssText = textCss(L);
      t.innerHTML = L.html || '';
      a.appendChild(t);
    }
    el.appendChild(a);
    if (L.hidden && !opts.showHidden) el.style.display = 'none';
    return el;
  }
  function applyBox(el, L) {
    el.style.left = L.x + 'px'; el.style.top = L.y + 'px';
    el.style.width = Math.max(1, L.w) + 'px';
    el.style.height = L.type === 'text' && L.autoH !== false ? 'auto' : Math.max(1, L.h) + 'px';
    if (L.type === 'text' && L.autoH !== false) el.style.minHeight = '1em';
    el.style.transform = L.rot ? `rotate(${L.rot}deg)` : '';
  }
  function pageEl(page, project, opts = {}) {
    const el = document.createElement('div');
    el.className = 'lp-page';
    el.style.width = project.w + 'px'; el.style.height = project.h + 'px';
    el.style.background = page.bg || '#ffffff';
    const bgi = page.bgImage && page.bgImage.startsWith('asset:') && project.assets ? project.assets[page.bgImage.slice(6)] : page.bgImage;
    if (bgi) { el.style.backgroundImage = `url("${bgi}")`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; }
    const o = Object.assign({ assets: project.assets }, opts);
    (page.layers || []).forEach((L, i) => { const e = layerEl(L, o); e.style.zIndex = i + 1; el.appendChild(e); });
    return el;
  }

  /* ---------- 모션 ---------- */
  const ENTER = {
    none: '없음', fade: '나타나기', up: '아래에서 떠오르기', down: '위에서 내려오기', left: '왼쪽에서 들어오기', right: '오른쪽에서 들어오기',
    zoomIn: '작게에서 커지기', zoomOut: '크게에서 작아지기', pop: '튀어나오기', drop: '떨어지며 튕기기', spin: '돌면서 나타나기',
    blur: '흐림에서 선명하게', wipe: '닦아내기(왼쪽→오른쪽)', wipeUp: '닦아내기(아래→위)',
  };
  const LOOP = { none: '없음', float: '둥실둥실', pulse: '두근두근', blink: '깜빡깜빡', shake: '흔들흔들', spin: '빙글빙글' };
  const TRANS = { none: '없음', fade: '서서히', slide: '밀어내기', cover: '덮기(아래에서)', zoom: '확대', flip: '뒤집기' };
  function enterFrames(type) {
    switch (type) {
      case 'fade': return [{ opacity: 0 }, { opacity: 1 }];
      case 'up': return [{ opacity: 0, transform: 'translateY(48px)' }, { opacity: 1, transform: 'none' }];
      case 'down': return [{ opacity: 0, transform: 'translateY(-48px)' }, { opacity: 1, transform: 'none' }];
      case 'left': return [{ opacity: 0, transform: 'translateX(-80px)' }, { opacity: 1, transform: 'none' }];
      case 'right': return [{ opacity: 0, transform: 'translateX(80px)' }, { opacity: 1, transform: 'none' }];
      case 'zoomIn': return [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'none' }];
      case 'zoomOut': return [{ opacity: 0, transform: 'scale(1.5)' }, { opacity: 1, transform: 'none' }];
      case 'pop': return [{ opacity: 0, transform: 'scale(.3)', offset: 0 }, { opacity: 1, transform: 'scale(1.08)', offset: 0.6 }, { transform: 'scale(.97)', offset: 0.82 }, { opacity: 1, transform: 'none', offset: 1 }];
      case 'drop': return [{ opacity: 0, transform: 'translateY(-160px)', offset: 0 }, { opacity: 1, transform: 'translateY(0)', offset: 0.55 }, { transform: 'translateY(-22px)', offset: 0.72 }, { transform: 'translateY(0)', offset: 0.86 }, { transform: 'translateY(-6px)', offset: 0.93 }, { opacity: 1, transform: 'none', offset: 1 }];
      case 'spin': return [{ opacity: 0, transform: 'rotate(-180deg) scale(.4)' }, { opacity: 1, transform: 'none' }];
      case 'blur': return [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0)' }];
      case 'wipe': return [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }];
      case 'wipeUp': return [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }];
      default: return null;
    }
  }
  function loopFrames(type) {
    switch (type) {
      case 'float': return [[{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }], { duration: 1600, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }];
      case 'pulse': return [[{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }], { duration: 700, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }];
      case 'blink': return [[{ opacity: 1 }, { opacity: 0.25 }], { duration: 600, iterations: Infinity, direction: 'alternate' }];
      case 'shake': return [[{ transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }], { duration: 260, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }];
      case 'spin': return [[{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 4000, iterations: Infinity, easing: 'linear' }];
      default: return null;
    }
  }
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  // 레이어 하나 등장 재생. 끝나면 강조 반복 시작.
  function playLayer(el, anim) {
    const a = el.querySelector(':scope > .ly-a') || el;
    const fr = enterFrames(anim && anim.in);
    const dur = Math.max(100, ((anim && anim.dur) || 0.6) * 1000);
    a.style.visibility = '';
    return new Promise((res) => {
      if (!fr || reduced()) { a.style.visibility = ''; startLoop(a, anim); res(); return; }
      const ani = a.animate(fr, { duration: dur, easing: anim.in === 'drop' || anim.in === 'pop' ? 'linear' : 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
      ani.onfinish = () => { startLoop(a, anim); res(); };
      ani.oncancel = () => res();
    });
  }
  function startLoop(a, anim) {
    const lf = loopFrames(anim && anim.loop);
    if (!lf || reduced()) return;
    // 반복 효과는 안쪽 한 겹 더 감싸서 등장 효과와 겹치지 않게 함
    let inner = a.querySelector(':scope > .ly-loop');
    if (!inner) { inner = document.createElement('div'); inner.className = 'ly-loop'; while (a.firstChild) inner.appendChild(a.firstChild); a.appendChild(inner); }
    inner.getAnimations().forEach((x) => x.cancel());
    inner.animate(lf[0], lf[1]);
  }
  function hideForEntry(el, anim) {
    if (anim && anim.in && anim.in !== 'none' && !reduced()) (el.querySelector(':scope > .ly-a') || el).style.visibility = 'hidden';
  }
  function stopAll(root) {
    root.querySelectorAll('.ly-a, .ly-loop').forEach((n) => { n.getAnimations().forEach((x) => x.cancel()); n.style.visibility = ''; });
  }
  // 한 쪽의 등장 순서: 자동(지연 포함) 묶음 + 클릭 묶음들
  function sequence(page) {
    const auto = [], clicks = [];
    (page.layers || []).forEach((L) => {
      if (L.hidden) return;
      const an = L.anim || {};
      if (!an.in || an.in === 'none') { if (an.loop && an.loop !== 'none') auto.push(L); return; }
      (an.start === 'click' ? clicks : auto).push(L);
    });
    clicks.sort((a, b) => (a.anim.order || 0) - (b.anim.order || 0));
    return { auto, clicks };
  }
  function find(pageNode, L) { return pageNode.querySelector(`.ly[data-id="${L.id}"]`); }
  // 편집기 미리보기: 자동 → 클릭 순으로 이어서 재생
  function previewPage(pageNode, page) {
    stopAll(pageNode);
    const { auto, clicks } = sequence(page);
    const timers = [];
    [...auto, ...clicks].forEach((L) => { const el = find(pageNode, L); if (el) hideForEntry(el, L.anim); });
    let tEnd = 0;
    auto.forEach((L) => {
      const el = find(pageNode, L); if (!el) return;
      const d = (L.anim.delay || 0) * 1000;
      tEnd = Math.max(tEnd, d + (L.anim.dur || 0.6) * 1000);
      timers.push(setTimeout(() => playLayer(el, L.anim), d));
    });
    let t = tEnd + 400;
    clicks.forEach((L) => {
      const el = find(pageNode, L); if (!el) return;
      const d = t + (L.anim.delay || 0) * 1000;
      timers.push(setTimeout(() => playLayer(el, L.anim), d));
      t = d + (L.anim.dur || 0.6) * 1000 + 350;
    });
    return { cancel() { timers.forEach(clearTimeout); stopAll(pageNode); }, duration: t };
  }

  /* ---------- 쪽 전환 ---------- */
  function transition(oldEl, newEl, tr, dir) {
    const type = (tr && tr.type) || 'none';
    const dur = Math.max(150, ((tr && tr.dur) || 0.6) * 1000);
    const back = dir < 0;
    if (type === 'none' || reduced() || !oldEl) { if (oldEl) oldEl.remove(); return Promise.resolve(); }
    const o = { duration: dur, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'both' };
    let a1, a2;
    if (type === 'fade') { a2 = newEl.animate([{ opacity: 0 }, { opacity: 1 }], o); }
    else if (type === 'slide') {
      a1 = oldEl.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${back ? 100 : -100}%)` }], o);
      a2 = newEl.animate([{ transform: `translateX(${back ? -100 : 100}%)` }, { transform: 'translateX(0)' }], o);
    } else if (type === 'cover') { a2 = newEl.animate([{ transform: `translateY(${back ? -100 : 100}%)` }, { transform: 'translateY(0)' }], o); }
    else if (type === 'zoom') { a2 = newEl.animate([{ opacity: 0, transform: 'scale(.82)' }, { opacity: 1, transform: 'scale(1)' }], o); }
    else if (type === 'flip') {
      a1 = oldEl.animate([{ transform: 'perspective(1600px) rotateY(0)' }, { transform: 'perspective(1600px) rotateY(-90deg)' }], { ...o, duration: dur / 2, easing: 'ease-in' });
      a2 = newEl.animate([{ transform: 'perspective(1600px) rotateY(90deg)' }, { transform: 'perspective(1600px) rotateY(0)' }], { ...o, duration: dur / 2, delay: dur / 2, easing: 'ease-out' });
    }
    return new Promise((res) => {
      const done = () => { if (oldEl) oldEl.remove(); if (a2) a2.cancel(); res(); };
      (a2 || a1).onfinish = done;
      setTimeout(done, dur + 400);
    });
  }

  /* ---------- 슬라이드쇼 ---------- */
  function Slideshow(project, opts = {}) {
    const root = document.createElement('div'); root.className = 'ss-root';
    root.tabIndex = -1;
    root.innerHTML = '<div class="ss-stage"></div><div class="ss-bar"><button class="ss-btn" data-a="prev" aria-label="이전">‹</button><span class="ss-count"></span><button class="ss-btn" data-a="next" aria-label="다음">›</button><button class="ss-btn ss-fs" data-a="fs" aria-label="전체 화면">⛶</button>' + (opts.exitable === false ? '' : '<button class="ss-btn ss-x" data-a="exit" aria-label="끝내기">✕</button>') + '</div>';
    const stage = root.querySelector('.ss-stage');
    let idx = -1, cur = null, queue = [], timers = [], autoTimer = null, busy = false;
    function fit(node) {
      const s = Math.min(root.clientWidth / project.w, root.clientHeight / project.h);
      node.style.transform = `translate(-50%,-50%) scale(${s})`;
    }
    function clear() { timers.forEach(clearTimeout); timers = []; clearTimeout(autoTimer); }
    async function go(i, dir, instant) {
      if (busy || i < 0 || i >= project.pages.length) { if (i >= project.pages.length && opts.onEnd) opts.onEnd(); return; }
      busy = true; clear();
      const page = project.pages[i];
      const holder = document.createElement('div'); holder.className = 'ss-page';
      const pn = pageEl(page, project); holder.appendChild(pn);
      stage.appendChild(holder); fit(holder);
      const { auto, clicks } = sequence(page);
      if (!instant) [...auto, ...clicks].forEach((L) => { const el = find(pn, L); if (el) hideForEntry(el, L.anim); });
      const old = cur; cur = holder; idx = i;
      root.querySelector('.ss-count').textContent = `${i + 1} / ${project.pages.length}`;
      await transition(old, holder, page.transition, dir);
      busy = false;
      if (instant) { queue = []; [...auto, ...clicks].forEach((L) => { const el = find(pn, L); if (el) { el.querySelector('.ly-a').style.visibility = ''; startLoop(el.querySelector('.ly-a'), L.anim); } }); return; }
      let tEnd = 0;
      auto.forEach((L) => {
        const el = find(pn, L); if (!el) return;
        const d = (L.anim.delay || 0) * 1000; tEnd = Math.max(tEnd, d + (L.anim.dur || 0.6) * 1000);
        timers.push(setTimeout(() => playLayer(el, L.anim), d));
      });
      queue = clicks.map((L) => ({ L, el: find(pn, L) })).filter((q) => q.el);
      scheduleAuto(tEnd);
    }
    function scheduleAuto(after) {
      const page = project.pages[idx];
      clearTimeout(autoTimer);
      if (page && +page.auto > 0) autoTimer = setTimeout(next, after + page.auto * 1000);
    }
    function next() {
      if (busy) return;
      if (queue.length) {
        const q = queue.shift(); const d = (q.L.anim.delay || 0) * 1000;
        timers.push(setTimeout(() => playLayer(q.el, q.L.anim), d));
        scheduleAuto(d + (q.L.anim.dur || 0.6) * 1000);
        return;
      }
      if (idx + 1 >= project.pages.length) { if (opts.onEnd) opts.onEnd(); else showEnd(); return; }
      go(idx + 1, 1);
    }
    function prev() { if (idx > 0) go(idx - 1, -1, true); }
    function showEnd() {
      if (root.querySelector('.ss-end')) return;
      const e = document.createElement('div'); e.className = 'ss-end'; e.textContent = '슬라이드쇼가 끝났습니다. 클릭하면 닫힙니다.';
      e.onclick = (ev) => { ev.stopPropagation(); exit(); };
      root.appendChild(e);
    }
    function exit() {
      clear(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* 무시 */ }
      root.remove(); if (opts.onExit) opts.onExit(idx);
    }
    function onKey(e) {
      if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].includes(e.key)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === 'Home') go(0, -1, true);
      else if (e.key === 'End') go(project.pages.length - 1, 1, true);
      else if (e.key === 'Escape' && opts.exitable !== false) exit();
      else if (e.key === 'f' || e.key === 'F') fs();
    }
    function onResize() { stage.querySelectorAll('.ss-page').forEach(fit); }
    function fs() { try { if (!document.fullscreenElement) root.requestFullscreen().catch(() => {}); else document.exitFullscreen(); } catch (e) { /* 지원 안 함 */ } }
    let hideT;
    root.addEventListener('mousemove', () => { root.classList.add('ss-ui'); clearTimeout(hideT); hideT = setTimeout(() => root.classList.remove('ss-ui'), 2200); });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b) { e.stopPropagation(); ({ prev, next, fs, exit })[b.dataset.a](); return; }
      next();
    });
    root.addEventListener('contextmenu', (e) => { e.preventDefault(); prev(); });
    let tx = null;
    root.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) { e.preventDefault(); dx < 0 ? next() : prev(); } });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return {
      el: root,
      start(i = 0, wantFs = true) { (opts.mount || document.body).appendChild(root); root.focus(); if (wantFs) fs(); go(i, 1); },
      next, prev, exit, get index() { return idx; },
    };
  }

  const CSS = `
.lp-page{position:relative;overflow:hidden;flex:none;transform-origin:0 0}
.ly{position:absolute;box-sizing:border-box;transform-origin:50% 50%}
.ly-a,.ly-loop{width:100%;height:100%;position:relative;box-sizing:border-box}
.ly-text .ly-a,.ly-text .ly-loop{height:auto}
.ly-t{box-sizing:border-box;width:100%;overflow-wrap:anywhere;word-break:keep-all;white-space:pre-wrap;outline:none}
.ly-t p,.ly-t h1,.ly-t h2,.ly-t h3,.ly-t div{margin:0}
.ly-t table{border-collapse:collapse;max-width:100%}.ly-t td,.ly-t th{border:1px solid currentColor;padding:2px 6px}
.ly-t table.noborder td{border:0}
.ly-t img{max-width:100%}
.ly-st{position:absolute;inset:0;display:flex;flex-direction:column;padding:6%}
.ss-root{position:fixed;inset:0;z-index:2147483000;background:#0b0d12;overflow:hidden;cursor:pointer;outline:none;user-select:none;-webkit-user-select:none}
.ss-stage{position:absolute;inset:0}
.ss-page{position:absolute;left:50%;top:50%;transform-origin:50% 50%;box-shadow:0 0 0 1px rgba(255,255,255,.04)}
.ss-page .lp-page{transform:none}
.ss-bar{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;gap:6px;align-items:center;background:rgba(20,22,28,.78);color:#fff;border-radius:999px;padding:6px 10px;font:13px/1 system-ui,sans-serif;opacity:0;transition:opacity .25s}
.ss-root.ss-ui .ss-bar{opacity:1}
.ss-btn{background:none;border:0;color:#fff;font-size:18px;width:34px;height:30px;border-radius:999px;cursor:pointer}
.ss-btn:hover{background:rgba(255,255,255,.14)}
.ss-count{min-width:56px;text-align:center;font-variant-numeric:tabular-nums}
.ss-end{position:absolute;inset:0;display:grid;place-items:center;color:#cfd6e2;font:16px system-ui,sans-serif;background:#0b0d12}
@media (prefers-reduced-motion:reduce){.ss-bar{transition:none}}
`;
  return { SHAPES, ENTER, LOOP, TRANS, fontCss, shapeSvg, layerEl, applyBox, pageEl, textCss, playLayer, startLoop, hideForEntry, stopAll, previewPage, sequence, transition, Slideshow, CSS, esc };
}
const Motion = HwpMotionLib();
