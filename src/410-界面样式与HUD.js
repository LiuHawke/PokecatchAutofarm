  /* ====================== 界面：样式 + 精简 HUD ====================== */

  const UI_CSS = `
  #pcauto-hud,#pcauto-panel{font:12px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#e8ecf4}
  #pcauto-hud{position:fixed;z-index:2147483000;top:64px;right:14px;width:244px;background:rgba(18,20,28,.94);
    border:1px solid rgba(255,203,5,.32);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.45);backdrop-filter:blur(8px);overflow:hidden;user-select:none}
  #pcauto-hud .h-head{display:flex;align-items:center;gap:6px;padding:7px 9px;cursor:move;background:linear-gradient(90deg,rgba(255,203,5,.18),transparent);border-bottom:1px solid rgba(255,255,255,.06)}
  #pcauto-hud .h-dot{width:8px;height:8px;border-radius:50%;flex:none}
  #pcauto-hud .h-ib{all:unset;cursor:pointer;padding:0 4px;color:#9aa4b8}
  #pcauto-hud .h-body{padding:7px 10px 9px}
  .pa-row{display:flex;justify-content:space-between;gap:8px}
  .pa-row>span:first-child{color:#8b93a7}
  .pa-row>b{font-weight:600;text-align:right}
  .pa-note{margin:5px 0;padding:5px 7px;border-radius:7px;font-size:11px;line-height:1.45}
  .pa-note.ok{background:rgba(74,222,128,.10);color:#a7f3c0}
  .pa-note.info{background:rgba(96,165,250,.12);color:#bfdbfe}
  .pa-note.warn{background:rgba(245,158,11,.15);color:#fbbf24}
  .pa-note.bad{background:rgba(239,68,68,.15);color:#f87171}
  .pa-logs{max-height:58px;overflow:hidden;color:#9aa4b8;font-size:11px;line-height:1.55;margin-top:5px}
  .pa-btn{padding:5px 8px;border-radius:7px;border:1px solid #2c3346;background:transparent;color:#c7d0e0;cursor:pointer;font-size:11.5px}
  .pa-btn:hover{border-color:#4b5470}
  .pa-btn.pri{border:0;background:#ffcb05;color:#12141c;font-weight:700}
  .pa-btn.acc{border-color:rgba(255,203,5,.35);background:rgba(255,203,5,.1);color:#ffcb05}
  .pa-chip{display:inline-block;font-size:10.5px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.07);color:#c7d0e0;margin:1px 2px 1px 0}
  #pcauto-panel{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);z-index:2147483001;display:flex}
  #pcauto-panel .p-box{flex:1;display:flex;flex-direction:column;background:rgba(18,20,28,.98);border-left:1px solid rgba(255,203,5,.28);box-shadow:-18px 0 50px rgba(0,0,0,.55);overflow:hidden}
  #pcauto-panel .tm-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  #pcauto-panel .tm-mon{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:7px;border:1px solid transparent}
  #pcauto-panel .tm-mon.new{border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.06)}
  #pcauto-panel .tm-mon.out{opacity:.55}
  #pcauto-panel .tm-mon img{width:30px;height:30px;image-rendering:pixelated;flex:none}
  #pcauto-panel .tm-mon .nm{flex:1;min-width:0;line-height:1.3}
  #pcauto-panel .tm-ic{all:unset;cursor:pointer;font-size:12px;padding:1px 3px;border-radius:5px;opacity:.35}
  #pcauto-panel .tm-ic.on{opacity:1;background:rgba(255,203,5,.16)}
  #pcauto-panel .tm-seg{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
  #pcauto-panel table.tm-mx{table-layout:fixed}
  #pcauto-panel table.tm-mx td,#pcauto-panel table.tm-mx th{padding:2px 1px;text-align:center;font-size:10.5px}
  #pcauto-panel table.tm-mx td:first-child,#pcauto-panel table.tm-mx th:first-child{text-align:left;width:74px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #pcauto-panel table.tm-mx td.sent{outline:2px solid #ffcb05;outline-offset:-2px;font-weight:700}
  #pcauto-panel table.tm-mx img{width:24px;height:24px;image-rendering:pixelated}
  #pcauto-panel .p-top{display:flex;align-items:center;gap:8px;padding:12px 16px 0}
  #pcauto-panel .p-tabs{display:flex;gap:2px;padding:10px 12px 0;border-bottom:1px solid #232a3b}
  #pcauto-panel .p-tab{all:unset;cursor:pointer;padding:7px 12px;border-radius:8px 8px 0 0;color:#8b93a7;font-size:12.5px}
  #pcauto-panel .p-tab.on{background:#1b2030;color:#ffcb05;font-weight:700}
  #pcauto-panel .p-body{flex:1;overflow:auto;padding:12px 16px 16px;font-size:12.5px}
  #pcauto-panel h4{margin:14px 0 6px;font-size:11.5px;color:#8b93a7;font-weight:600;letter-spacing:.5px}
  #pcauto-panel h4:first-child{margin-top:2px}
  #pcauto-panel table{width:100%;border-collapse:collapse;font-size:12px}
  #pcauto-panel td,#pcauto-panel th{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.05);text-align:left}
  #pcauto-panel th{color:#6b7488;font-weight:500}
  #pcauto-panel .p-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  #pcauto-panel label.p-chk{display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer}
  #pcauto-panel label.p-num{display:flex;align-items:center;gap:8px;padding:5px 0;justify-content:space-between}
  #pcauto-panel input[type=number],#pcauto-panel select{width:96px;background:#1b2030!important;color:#e8ecf4!important;border:1px solid #2c3346;border-radius:6px;padding:3px 6px;font-size:12px}
  #pcauto-panel input[type=checkbox]{accent-color:#ffcb05;width:15px;height:15px}
  #pcauto-panel details{border:1px solid #232a3b;border-radius:9px;padding:4px 10px;margin-top:8px}
  #pcauto-panel summary{cursor:pointer;padding:4px 0;color:#c7d0e0}
  #pcauto-panel .p-sub{color:#6b7488;font-size:11px;line-height:1.5}
  `;
  function ensureCss() {
    if ($('#pcauto-style')) return;
    const st = document.createElement('style');
    st.id = 'pcauto-style';
    st.textContent = UI_CSS;
    document.documentElement.appendChild(st);
  }

  let hud, hudBody, hudStats, hudLogs, hudPauseBtn, hudDot, hudTitle;

  /** 把保存的坐标夹回当前视口内 */
  function applyHudPos() {
    if (!hud || S.cfg.hudX == null) return;
    const x = clamp(S.cfg.hudX, 0, Math.max(0, innerWidth - 140));
    const y = clamp(S.cfg.hudY == null ? 64 : S.cfg.hudY, 0, Math.max(0, innerHeight - 60));
    hud.style.left = x + 'px';
    hud.style.top = y + 'px';
    hud.style.right = 'auto';
  }

  /** HUD 刷新节流：日志和采样都会触发 */
  let hudTimer = 0, hudRenderAt = 0;
  function scheduleHud() {
    if (!hud || hudTimer) return;
    const ms = Math.max(0, 900 - (now() - hudRenderAt));
    hudTimer = setTimeout(() => {
      hudTimer = 0;
      hudRenderAt = now();
      try { renderHud(); } catch { /* 忽略 */ }
      try { if ($('#pcauto-panel')) renderPanel(false); } catch { /* 忽略 */ }
    }, ms);
  }

  function buildHud() {
    ensureCss();
    hud = document.createElement('div');
    hud.id = 'pcauto-hud';
    hud.innerHTML = `
      <div class="h-head" id="pcauto-head">
        <span class="h-dot" id="pcauto-dot"></span>
        <b id="pcauto-title" style="font-size:12px">挂机助手</b>
        <span style="flex:1"></span>
        <button class="h-ib" id="pcauto-bsbtn" title="实战统计悬浮窗">📊</button>
        <button class="h-ib" id="pcauto-toggle" title="折叠 / 展开">–</button>
        <button class="h-ib" id="pcauto-gear" title="打开主面板">☰</button>
      </div>
      <div class="h-body" id="pcauto-body">
        <div id="pcauto-stats"></div>
        <div class="pa-logs" id="pcauto-logs"></div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="pa-btn pri" id="pcauto-oneclick" style="flex:2">一键挂机</button>
          <button class="pa-btn" id="pcauto-pause" style="flex:1">暂停</button>
        </div>
      </div>`;
    document.documentElement.appendChild(hud);

    hudBody = hud.querySelector('#pcauto-body');
    hudStats = hud.querySelector('#pcauto-stats');
    hudLogs = hud.querySelector('#pcauto-logs');
    hudPauseBtn = hud.querySelector('#pcauto-pause');
    hudDot = hud.querySelector('#pcauto-dot');
    hudTitle = hud.querySelector('#pcauto-title');

    applyHudPos();
    if (S.cfg.hudCollapsed) hudBody.style.display = 'none';

    hud.querySelector('#pcauto-toggle').onclick = () => {
      S.cfg.hudCollapsed = !S.cfg.hudCollapsed;
      hudBody.style.display = S.cfg.hudCollapsed ? 'none' : 'block';
      writeCfg(S.cfg);
    };
    hud.querySelector('#pcauto-gear').onclick = () => openPanel();
    hud.querySelector('#pcauto-bsbtn').onclick = () => bswToggle();
    hudPauseBtn.onclick = () => { S.pausedByUser = !S.pausedByUser; renderHud(); };
    hud.querySelector('#pcauto-oneclick').onclick = openPresetPicker;

    const head = hud.querySelector('#pcauto-head');
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const r = hud.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture?.(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      hud.style.left = clamp(e.clientX - drag.dx, 0, innerWidth - 140) + 'px';
      hud.style.top = clamp(e.clientY - drag.dy, 0, innerHeight - 60) + 'px';
      hud.style.right = 'auto';
    });
    // pointercancel 也要收尾，否则 drag 卡在非 null，之后鼠标一碰标题栏面板就跟着跑
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      const r = hud.getBoundingClientRect();
      S.cfg.hudX = Math.round(r.left);
      S.cfg.hudY = Math.round(r.top);
      writeCfg(S.cfg);
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);
    addEventListener('resize', applyHudPos);
  }

  const uiRow = (k, v, color) => `<div class="pa-row"><span>${k}</span><b${color ? ` style="color:${color}"` : ''}>${v}</b></div>`;
  /** 主线结论的提示级别 */
  function planTone(p) {
    if (!p) return 'info';
    return { stuck: 'bad', travel: 'warn', counter: 'warn', clearLoops: 'warn', hold: 'info', off: 'info', go: 'ok', farm: 'ok' }[p.key] || 'info';
  }

  /** 顶部的警示：后台停摆、卡弹窗、战力告警，HUD 和面板共用 */
  function alertsHtml() {
    const out = [];
    if (isRealHidden()) {
      const m = S.hiddenSince ? Math.round((now() - S.hiddenSince) / 60000) : 0;
      out.push(S.keepAliveOn
        ? `<div class="pa-note warn">标签页在后台（保活中）。看下方「实际倍率」确认游戏仍在跑</div>`
        : `<div class="pa-note bad">标签页在后台${m ? ` ${m} 分钟` : ''}，游戏已停摆；回到窗口才按离线规则结算</div>`);
    }
    if (S.unknownModal) out.push(`<div class="pa-note warn">需要您点一下：${esc(S.unknownModal.slice(0, 60))}</div>`);
    if (S.powerWarn) out.push(`<div class="pa-note warn">⚔ ${esc(S.powerWarn)}</div>`);
    const tp = (S.teamPlans || {}).auto;
    if (tp && !tp.error && !tp.keep && tp.best && tp.best.clear >= tp.cur.clear + 0.1) {
      out.push(`<div class="pa-note info">配队：推荐队对${esc(tp.label)}通关率 ${Math.round(tp.best.clear * 100)}%（现队 ${Math.round(tp.cur.clear * 100)}%），在面板「配队」页一键换上</div>`);
    }
    return out.join('');
  }

  function renderHud() {
    if (!hud) return;
    hudRenderAt = now();
    hud.style.display = S.cfg.hud ? '' : 'none';
    if (!S.cfg.hud) return;

    const idle = getIdleSec();
    const paused = !S.cfg.enabled || S.pausedByUser;
    const running = !paused && idle < S.cfg.stallSec;
    const color = paused ? '#64748b' : running ? '#4ade80' : '#f59e0b';
    hudDot.style.background = color;
    hudDot.style.boxShadow = `0 0 6px ${color}`;
    hudTitle.textContent = paused ? '已暂停' : running ? '挂机中' : '疑似停滞';
    hudPauseBtn.textContent = S.pausedByUser ? '继续' : '暂停';
    const p = PRESETS[detectPreset(S.cfg)];
    hud.querySelector('#pcauto-oneclick').textContent = p ? `一键挂机 · ${p.label}` : '一键挂机 · 自定义';

    const f = facts();
    const plan = S.plan || (f ? planProgress(f, progState(), S.cfg) : null);
    const speedLabel = esc(($('#speed-btns .on') || {}).textContent || '—');
    hudStats.innerHTML = `
      ${alertsHtml()}
      ${f ? uiRow(`${esc(f.regionZh)} 第 ${f.ch + 1} 章`, `上限 Lv.${f.cap} · 最低 Lv.${f.teamMin}`, f.atCap ? '#ffcb05' : undefined) : ''}
      ${plan ? `<div class="pa-note ${planTone(plan)}">${esc(plan.why)}</div>` : ''}
      ${uiRow('捕获 · 金钱 /时', `${fmt(S.rate.catch)} · ₽${fmt(S.rate.money)}`)}
      ${uiRow('速度', `${speedLabel}${S.speedRatio != null ? ` · 实际 ${S.speedRatio.toFixed(1)}x` : ''}`, S.speedRatio != null && S.speedRatio < speedFloor() ? '#f59e0b' : undefined)}
      ${(() => {
      const list = Object.values(buffState(S.save || {}));
      if (!list.length) return '';
      const icons = { shiny: '🌟', dex: '📖', rare: '✨', capture: '🎯', xp: '⭐', money: '💰' };
      return `<div style="margin-top:3px">${list.map((b) => `<span class="pa-chip" title="${esc(b.key)}">${icons[(BERRY_BUFFS[b.key] || {}).family] || '•'}${b.leftMin}m</span>`).join('')}</div>`;
    })()}`;

    if (S.logDirty) {
      S.logDirty = false;
      hudLogs.innerHTML = S.events.slice(0, 3).map((e) => `<div><span style="color:#5b6478">${e.t}</span> ${esc(e.msg)}</div>`).join('') || '<div>等待事件…</div>';
    }
  }

  function dumpDiag() {
    copyText(JSON.stringify(diagInfo(), null, 2), '诊断信息');
  }

  function copyText(text, what) {
    const fallback = () => log('info', `${what}：` + text.replace(/\s+/g, ' ').slice(0, 120));
    try {
      // writeText 返回 Promise，光靠 try/catch 接不住被拒绝的情况（无权限 / 非安全上下文）
      const p = navigator.clipboard?.writeText(text);
      if (p && typeof p.then === 'function') p.then(() => log('info', `${what}已复制到剪贴板`)).catch(fallback);
      else fallback();
    } catch {
      fallback();
    }
  }

  function diagInfo() {
    const save = S.save || {};
    const adv = save.adv || {};
    const ph = phaseInfo();
    const node = adv.nodes && adv.nodes[adv.node];
    const f = facts(save);
    return {
      version: VERSION,
      href: location.href,
      perf: perfText(),
      phase: `${ph.icon} ${ph.name}（剩 ${ph.left}）`,
      scene: node ? `${node.name} · bg=${node.bg} · ${nodeIndoor(node) ? '室内（昼夜无效）' : '室外（昼夜生效）'}` : '未知',
      hidden: isRealHidden(),
      hiddenTotalMin: Math.round(S.hiddenTotalMs / 60000),
      keepAlive: !!S.keepAliveOn,
      speedBtn: ($('#speed-btns .on') || {}).textContent,
      chapter: adv.chapter, unlocked: adv.unlocked, loops: adv.loops, node: adv.node, pending: adv.pending && adv.pending.type,
      cap: f && f.cap, atCap: f && f.atCap, gymCh: f && f.gymCh, xpDemand: f && f.xpDemand,
      plan: S.plan, prog: progState(), teamPrefs: teamPrefs(),
      teamPlan: (() => { const t = (S.teamPlans || {}).auto; return t ? { label: t.label, verdict: t.verdict, error: t.error, cur: t.cur && t.cur.clear, best: t.best && t.best.clear, needLv: t.needLv } : null; })(),
      badges: (adv.badges || []).length,
      dex: Object.keys(save.dex || {}).length,
      mons: (save.mons || []).length,
      modal: S.unknownModal || null,
      rates: S.rate,
      idleSec: getIdleSec(),
      automation: Object.fromEntries(['progress', 'counterSwap', 'autoFeed', 'autoShop', 'autoTeam', 'autoHatch', 'autoDeposit', 'autoEvent'].map((k) => [k, !!S.cfg[k]])),
      busyTask: S.busyTask || null,
      taskFails: S.taskFails,
      teamUndo: S.teamUndo ? S.teamUndo.length : 0,
      catchup: S.catchup,
      unknownModalClasses: Object.keys(S.modalClsSeen),
      preset: detectPreset(S.cfg),
      uptimeMin: Math.round((now() - S.bootAt) / 60000),
      nextHealthReloadMin: S.cfg.healthReload ? Math.max(0, Math.round((S.bootAt + (S.cfg.healthHours || 6) * 3600000 - now()) / 60000)) : null,
      healthReloads: S.healthReloads || 0,
      today: (safeParse(lsGet(DAILY_KEY), null) || {}).t || null,
    };
  }
