  /* ====================== 实战统计悬浮窗 ====================== */
  /*
   * 独立于主面板的小窗：左「即时伤害」= 当前段（含进行中的一场），右「上次统计」= 最近归档的一段或下拉选的历史段。
   * 可拖动、拖右下角调大小（双击标题栏恢复默认大小）、调透明度、折叠；位置大小等存在扩展存储。
   */

  const BSWIN_KEY = 'pcauto.bsWin';
  const BSWIN_DEF = { x: null, y: 120, w: 520, h: 340, op: 0.94, collapsed: false, scope: 'all', hist: 0 };
  const BSWIN_CSS = `
  #pcauto-bsw{position:fixed;z-index:2147482990;font:12px/1.45 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#e8ecf4;
    background:rgba(18,20,28,1);border:1px solid rgba(255,203,5,.32);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.45);
    display:flex;flex-direction:column;overflow:hidden;min-width:300px;min-height:38px;user-select:none}
  #pcauto-bsw .w-head{display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:move;background:linear-gradient(90deg,rgba(255,203,5,.18),transparent);border-bottom:1px solid rgba(255,255,255,.06)}
  #pcauto-bsw .w-ib{all:unset;cursor:pointer;padding:0 4px;color:#9aa4b8}
  #pcauto-bsw .w-tool{display:flex;align-items:center;gap:6px;padding:5px 8px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.05)}
  #pcauto-bsw .w-seg{all:unset;cursor:pointer;padding:1px 7px;border-radius:5px;color:#8b93a7;font-size:11px}
  #pcauto-bsw .w-seg.on{background:rgba(255,203,5,.16);color:#ffcb05;font-weight:700}
  #pcauto-bsw select{background:#1b2030;color:#e8ecf4;border:1px solid #2c3346;border-radius:5px;font-size:11px;max-width:220px}
  #pcauto-bsw input[type=range]{width:70px;accent-color:#ffcb05}
  #pcauto-bsw .w-body{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 8px;overflow:auto;user-select:text}
  #pcauto-bsw .w-col{min-width:0}
  #pcauto-bsw .w-col>b{display:block;color:#ffcb05;font-size:11.5px;margin-bottom:2px}
  #pcauto-bsw table{width:100%;border-collapse:collapse;font-size:11px}
  #pcauto-bsw td,#pcauto-bsw th{padding:2px 3px;border-bottom:1px solid rgba(255,255,255,.05);text-align:left;white-space:nowrap}
  #pcauto-bsw th{color:#6b7488;font-weight:500}
  #pcauto-bsw .p-sub{color:#6b7488;font-size:10.5px;line-height:1.45;white-space:normal}
  #pcauto-bsw .w-grip{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;
    background:linear-gradient(135deg,transparent 50%,rgba(255,203,5,.45) 50%)}
  `;

  let bsw = null, bswTimer = 0;
  const bswCfg = () => ({ ...BSWIN_DEF, ...(storeGet(BSWIN_KEY, null) || {}) });
  const bswSave = (c) => storeSet(BSWIN_KEY, c);

  function bswPlace(c) {
    if (!bsw) return;
    const w = clamp(c.w, 300, Math.max(300, innerWidth - 10));
    const h = clamp(c.h, 120, Math.max(120, innerHeight - 10));
    const x = clamp(c.x == null ? innerWidth - w - 280 : c.x, 0, Math.max(0, innerWidth - 120));
    const y = clamp(c.y, 0, Math.max(0, innerHeight - 40));
    Object.assign(bsw.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: c.collapsed ? 'auto' : h + 'px', opacity: String(clamp(c.op, 0.3, 1)) });
    bsw.querySelector('.w-tool').style.display = c.collapsed ? 'none' : '';
    bsw.querySelector('.w-body').style.display = c.collapsed ? 'none' : '';
    bsw.querySelector('.w-grip').style.display = c.collapsed ? 'none' : '';
  }

  function bswRender() {
    if (!bsw) return;
    const c = bswCfg();
    const st = bstatsInit();
    bsw.querySelectorAll('.w-seg').forEach((b) => b.classList.toggle('on', b.dataset.s === c.scope));
    const sel = bsw.querySelector('#pcauto-bsw-hist');
    const opts = st.segs.map((s, i) => `<option value="${i}"${i === c.hist ? ' selected' : ''}>${i === 0 ? '上次 · ' : ''}${bsSegTitle(s)}</option>`).join('');
    if (sel.dataset.sig !== String(st.segs.length) + ':' + (st.segs[0] && st.segs[0].end)) {
      sel.innerHTML = opts || '<option>还没有归档的段</option>';
      sel.dataset.sig = String(st.segs.length) + ':' + (st.segs[0] && st.segs[0].end);
    }
    const body = bsw.querySelector('.w-body');
    if (!nsOk()) {
      body.innerHTML = `<div class="p-sub" style="grid-column:1/3">没接入游戏内部接口（${esc(nsWhy())}），无法统计</div>`;
      return;
    }
    const live = bsLiveScope(c.scope);
    const prev = st.segs[clamp(c.hist, 0, Math.max(0, st.segs.length - 1))];
    const keep = body.scrollTop;
    body.innerHTML = `
      <div class="w-col"><b>即时伤害</b>${live ? `<div class="p-sub">${bsSegTitle(live.seg)}</div>${bsScopeHtml(live.sc, true)}` : '<div class="p-sub">等待下一场战斗…</div>'}</div>
      <div class="w-col"><b>上次统计</b>${prev ? `<div class="p-sub">${bsSegTitle(prev)}</div>${bsScopeHtml(prev.scopes[c.scope], true)}` : '<div class="p-sub">还没有归档的段</div>'}</div>`;
    body.scrollTop = keep;
  }

  function bswOpen() {
    if (bsw) { bswRender(); return; }
    if (!$('#pcauto-bsw-style')) {
      const s = document.createElement('style');
      s.id = 'pcauto-bsw-style';
      s.textContent = BSWIN_CSS;
      document.documentElement.appendChild(s);
    }
    bsw = document.createElement('div');
    bsw.id = 'pcauto-bsw';
    bsw.innerHTML = `
      <div class="w-head"><b style="font-size:12px">实战统计</b><span style="flex:1"></span>
        <button class="w-ib" data-a="fold" title="折叠 / 展开">–</button><button class="w-ib" data-a="close" title="关闭">✕</button></div>
      <div class="w-tool">
        ${BS_SCOPES.map(([k, t]) => `<button class="w-seg" data-s="${k}">${t}</button>`).join('')}
        <select id="pcauto-bsw-hist" title="选择要对比的历史段"></select>
        <span class="p-sub" style="white-space:nowrap">透明</span><input type="range" min="30" max="100" step="5" id="pcauto-bsw-op">
        <button class="w-ib" data-a="finish" title="把当前段归档，从下一场重新计" style="color:#ffcb05">结束本轮</button>
      </div>
      <div class="w-body"></div><div class="w-grip" title="拖动调整大小"></div>`;
    document.documentElement.appendChild(bsw);
    const c0 = bswCfg();
    bsw.querySelector('#pcauto-bsw-op').value = String(Math.round(c0.op * 100));
    bswPlace(c0);

    const upd = (patch) => { const c = { ...bswCfg(), ...patch }; bswSave(c); bswPlace(c); bswRender(); };
    bsw.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]');
      const s = e.target.closest('[data-s]');
      if (s) upd({ scope: s.dataset.s });
      else if (a && a.dataset.a === 'fold') upd({ collapsed: !bswCfg().collapsed });
      else if (a && a.dataset.a === 'close') bswClose();
      else if (a && a.dataset.a === 'finish') { bsFinish(); upd({ hist: 0 }); log('info', '实战统计：本轮已归档'); }
    });
    bsw.querySelector('#pcauto-bsw-hist').addEventListener('change', (e) => upd({ hist: Number(e.target.value) || 0 }));
    bsw.querySelector('#pcauto-bsw-op').addEventListener('input', (e) => upd({ op: Number(e.target.value) / 100 }));

    const head = bsw.querySelector('.w-head');
    head.addEventListener('dblclick', (e) => { if (e.target.tagName !== 'BUTTON') upd({ w: BSWIN_DEF.w, h: BSWIN_DEF.h }); });
    const dragOn = (el, mode) => {
      let d = null;
      el.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        const r = bsw.getBoundingClientRect();
        d = { sx: e.clientX, sy: e.clientY, r };
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      });
      el.addEventListener('pointermove', (e) => {
        if (!d) return;
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (mode === 'move') {
          bsw.style.left = clamp(d.r.left + dx, 0, innerWidth - 120) + 'px';
          bsw.style.top = clamp(d.r.top + dy, 0, innerHeight - 40) + 'px';
        } else {
          bsw.style.width = Math.max(300, d.r.width + dx) + 'px';
          bsw.style.height = Math.max(120, d.r.height + dy) + 'px';
        }
      });
      const end = () => {
        if (!d) return;
        d = null;
        const r = bsw.getBoundingClientRect();
        const c = bswCfg();
        bswSave(mode === 'move' ? { ...c, x: Math.round(r.left), y: Math.round(r.top) } : { ...c, w: Math.round(r.width), h: Math.round(r.height) });
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };
    dragOn(head, 'move');
    dragOn(bsw.querySelector('.w-grip'), 'size');
    addEventListener('resize', bswResize);
    bswRender();
    bswTimer = setInterval(() => { try { if (!bswCfg().collapsed) bswRender(); } catch { /* 忽略 */ } }, 1500);
  }
  function bswResize() { if (bsw) bswPlace(bswCfg()); }
  function bswClose() {
    if (!bsw) return;
    clearInterval(bswTimer);
    bswTimer = 0;
    removeEventListener('resize', bswResize);
    bsw.remove();
    bsw = null;
  }
  const bswToggle = () => (bsw ? bswClose() : bswOpen());
