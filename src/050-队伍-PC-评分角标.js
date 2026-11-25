  /* ====================== 模块：队伍 / PC 评分角标 ====================== */

  let gradeStyleDone = false;
  function ensureGradeStyle() {
    if (gradeStyleDone) return;
    gradeStyleDone = true;
    const st = document.createElement('style');
    st.id = 'pcauto-grade-style';
    st.textContent = `
      .pcauto-grade{position:absolute;top:2px;right:2px;z-index:6;display:flex;align-items:center;gap:2px;
        padding:0 4px;height:14px;border-radius:5px;font:700 10px/14px system-ui,sans-serif;
        color:#12141c;pointer-events:none;letter-spacing:.2px;box-shadow:0 1px 3px rgba(0,0,0,.35)}
      .pcauto-grade b{font-size:10px}
      .pcauto-grade i{font-style:normal;font-weight:600;opacity:.85;font-size:9px}
      .pc-cell:has(> .pcauto-grade),.slot:has(> .pcauto-grade){position:relative}
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  function buildMonMap() {
    const map = new Map();
    const save = S.save;
    if (!save) return map;
    for (const m of (save.mons || [])) {
      if (m && m.uid) map.set(String(m.uid), m);
    }
    for (const p of ((save.pension && save.pension.mons) || [])) {
      if (p && p.mon && p.mon.uid) map.set(String(p.mon.uid), p.mon);
    }
    return map;
  }

  /** 存档引用未变时复用上次的 Map，避免每 4 秒遍历整个宝可梦库 */
  function monMapCached() {
    if (S.monMapCache && S.monMapCache.src === S.save) return S.monMapCache.map;
    const map = buildMonMap();
    S.monMapCache = { src: S.save, map };
    return map;
  }

  function paintBadges(root = document) {
    if (!S.cfg.showGrades) return;
    const nodes = [...root.querySelectorAll('.pc-cell[data-uid], .slot[data-uid]')];
    if (!nodes.length) return;
    const monMap = monMapCached();
    for (const node of nodes) {
      const uid = node.dataset.uid;
      const mon = monMap.get(String(uid));
      if (!mon) continue;
      const info = monStats(mon.id, mon.level || 1);
      if (!info) continue;
      let badge = node.querySelector(':scope > .pcauto-grade');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'pcauto-grade';
        node.appendChild(badge);
      }
      const key = `${info.tier.key}|${info.baseTotal}|${mon.level}`;
      if (badge.dataset.k === key) continue;
      badge.dataset.k = key;
      badge.style.background = info.tier.bg;
      badge.style.color = '#12141c';
      badge.innerHTML = `<b>${info.tier.key}</b><i>${info.baseTotal}</i>`;
      badge.title = `种族值合计 ${info.baseTotal}（HP${info.parts.hp}/攻${info.parts.atk}/防${info.parts.def}/特攻${info.parts.spa}/特防${info.parts.spd}/速${info.parts.spe}）\n`
          + `Lv.${mon.level} 估算总属性 ${info.realTotal}${mon.shiny ? '\n✨ 闪光' : ''}`;
    }
  }

  function startGradeWatcher() {
    ensureGradeStyle();
    paintBadges();
    let timer = 0;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { paintBadges(); } catch { /* 忽略 */ } }, 250);
    });
    const seen = new WeakSet();
    const attach = () => {
      let added = false;
      for (const sel of ['#pc-grid', '#team-slots', '#pen-grid', '#screen-team', '#screen-pension']) {
        const el = document.querySelector(sel);
        if (el && !seen.has(el)) { seen.add(el); obs.observe(el, { childList: true, subtree: true }); added = true; }
      }
      if (added) { try { paintBadges(); } catch { /* 忽略 */ } }
    };
    attach();
    // 只补挂后出现（或被游戏整块重建）的容器，不再定时重画
    setInterval(attach, 5000);
  }
