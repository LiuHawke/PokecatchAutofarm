  /* ====================== 主循环 ====================== */

  let wakeLock = null;
  async function requestWakeLock() {
    if (!S.cfg.wakeLock || isRealHidden()) return;
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        // 系统可能主动释放（息屏、切应用）；置空后由 visibilitychange / 下一次检查重新申请
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* 忽略 */ }
  }

  /** 玩家最近是否在真实操作（合成事件 isTrusted=false，不会误判） */
  function userBusy(ms = 2500) {
    return now() - (S.userAt || 0) < ms;
  }

  /** 游戏有没有在推进：接上挂钩时由 step 事件更新（见 bsTap），否则看战报最后一行（不用 innerText，免得强制重排） */
  function touchActivity() {
    if (now() - (S.tapAt || 0) < 15000) return;
    const el = document.querySelector('#battle-log');
    const last = el && el.lastElementChild;
    const txt = el ? `${el.childElementCount}|${last ? last.textContent : ''}` : '';
    if (txt && txt !== S.lastLogText) {
      S.lastLogText = txt;
      S.lastActivityAt = now();
      S.lastProgressAt = now();
    }
  }

  let tickN = 0;
  function tick() {
    if (!S.cfg.enabled || S.pausedByUser) return;
    if (isBusyTask()) return;   // 正在执行喂糖 / 换队等长任务，别抢
    const t0 = performance.now();
    try {
      tickN++;
      // 高频（350ms）：需要抢时间的。innerText 会强制 reflow，所以这一组要尽量短。
      touchActivity();
      if (ensureStarted()) return;
      handleCutscene();
      handleModals();
      handleItemChoice();
      autoSwitch();
      // 低频（约 2 秒）：本身就带长冷却的模块，没必要每 350ms 查一遍 DOM
      if (tickN % 6 === 0) {
        ensureSpeed();
        casinoAuto();
        autoBerry();
        maybeEvolve();
        maybeSave();
        autoTick();
        raidOptimizeTick();
      }
    } catch { /* 静默 */ }
    perfAdd(PERF.tick, performance.now() - t0);
  }

  /** 页面上已经有一份在跑：这份不启动，提示先停用另一份 */
  function dupWarn() {
    const other = (PAGE_WIN.__pcauto && PAGE_WIN.__pcauto.version) || '?';
    console.warn(`[挂机助手] 已有 v${other} 在运行，v${VERSION} 不启动。请停用另一份后刷新。`);
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2147483647;background:#7f1d1d;color:#fff;padding:8px 14px;border-radius:8px;font:13px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    d.textContent = `挂机助手：检测到另一份（v${other}）也在运行。为避免两份同时操作，v${VERSION} 没有启动。请停用另一份后刷新。`;
    d.onclick = () => d.remove();
    document.body.appendChild(d);
    if (EXT) EXT.status({ version: VERSION, dup: true, other, hasStore: HAS_STORE });
  }

  function start() {
    if (document.getElementById('pcauto-hud') || PAGE_WIN.__pcauto) { if (EXT) dupWarn(); return; }
    progState();
    buildHud();
    renderHud();
    log('info', `挂机助手 v${VERSION} 已启动`);
    if (restoredFrom) {
      // 用章节、图鉴、捕获数核对：游戏启动后会马上再存档（lastTick 变化），不能比较整个字符串
      const cur = saveSummary(readSave());
      const want = restoredFrom.sum;
      const ok = !!want && cur.chapter === want.chapter && cur.dex === want.dex && cur.caught === want.caught;
      log(ok ? 'info' : 'warn', ok ? `存档已恢复到「${restoredFrom.label}」`
          : `存档恢复可能没有生效（${restoredFrom.label}）。如果登录了云存档，游戏可能用云端存档覆盖了本地`);
      if (ok) beep('info');
    }
    if (!HAS_STORE) log('warn', '扩展存储没连上（3 秒内没收到），存档备份不可用；刷新页面试试');
    if (EXT && HAS_STORE) EXT.roundTrip().then((r) => { S_BOOT.extRT = r; if (!r.ok) log('warn', `扩展存储读写不正常：${r.err || '读回的值不一致'}`); });
    if (S_BOOT.cfgFromMirror) log('info', `这个网址（${location.host}）还没有设置，已沿用其他网址保存的设置`);
    else if (HAS_STORE && !storeGet(CFG_KEY, null)) writeCfg(S.cfg);
    setTimeout(() => {
      log(nsOk() ? 'info' : 'warn', nsOk() ? '已接入游戏内部接口：配队用游戏原版战斗重放' : `没接入游戏内部接口（${nsWhy()}），配队改用近似模型`);
      if (EXT) EXT.status({ version: VERSION, ns: nsOk(), why: nsOk() ? '' : nsWhy(), wrapped: PAGE_WIN.__pcautoWrapped | 0, hasStore: HAS_STORE });
    }, 8000);
    if (S.cfg.migratedFrom === 3) {
      delete S.cfg.migratedFrom;
      writeCfg(S.cfg);
      log('info', '已从 3.x 迁移设置：手机推送已移除，「连败回退 / 自动推进」合并为「主线推进」');
    }
    dropLegacyRetreat();
    installBattleStats();
    try {
      new PAGE_WIN.PerformanceObserver((list) => { for (const e of list.getEntries()) perfAdd(PERF.lt, e.duration); })
        .observe({ type: 'longtask', buffered: false });
    } catch { /* 浏览器不支持长任务统计 */ }

    // 战报：刷新后 10 分钟内能接上之前的统计
    loadTally();
    if (restoreState()) log('info', '已恢复刷新前的自动化状态（冷却、预算、撤销记录）');
    S.bootSnap = tallySnap();
    if (!S.awaySnap) { S.awaySnap = tallySnap(); S.awayLastSeen = now(); }

    // 挂到页面的 window 上，控制台里才能访问
    try { PAGE_WIN.__pcauto = { S, version: VERSION, sample, tick, openPanel, openSettings, setKeepAlive, phaseInfo, nodeIndoor, feedAllCandy, backupNow, taEnemyPool,
      applyTeam, undoTeam, chapterGo, clearLoops, runSelfTest, classifyModal, applyPreset, detectPreset, persistState, dailyTick, showDaily,
      facts, planProgress, candyPlanFor, shopWant, modeStatus, levelCap, xpNeed,
      teamTarget, teamEval, teamPlanAsync, teamPrefs, togglePin, setTrainee, btUnit, btSim, btFight,
      nsOk, nsWhy, nrPlanChapter, nrRun, nrEval, statsBattles: () => S.bstats, PERF, perfText }; } catch { /* 忽略 */ }
    ensureRealDescs();   // 先存下原始描述符，之后无论保活开没开，isRealHidden() 都能读到真值
    startGradeWatcher();
    safeInterval('tick', tick, TICK_MS);
    safeInterval('sample', sample, 2000);
    safeInterval('stallCheck', stallCheck, 5000);
    safeInterval('nightGuard', nightGuard, 60000);
    safeInterval('powerGuard', powerGuard, 120000);
    safeInterval('speedGuard', speedGuard, 60000);
    // 唤醒锁可能被系统释放，定期补申请
    safeInterval('wakeLock', requestWakeLock, 60000);
    safeInterval('backup', maybeBackup, 60000);
    safeInterval('tally', () => { saveTally(); persistState(); }, 30000);
    safeInterval('daily', dailyTick, 30000);
    safeInterval('modes', modesTick, 60000);
    safeInterval('health', healthCheck, 60000);
    safeInterval('watchdog', taskWatchdog, 15000);
    // 首次备份等游戏读完档、跑出第一次采样之后再做
    setTimeout(() => { try { maybeBackup(); } catch { /* 忽略 */ } }, 20000);

    requestWakeLock();
    if (S.cfg.keepAlive) setKeepAlive(true).catch(() => {});

    // 注册在 window 的捕获阶段：事件路径是 window(捕获) → document → ...，
    // 挂在 document 上拦不住游戏挂在 window 上的监听。
    PAGE_WIN.addEventListener('visibilitychange', (e) => {
      if (!isRealHidden()) {
        markPresent();
        requestWakeLock();
        S.lastProgressAt = now();
        S.lastTickAt = now();
      } else if (!S.keepAliveOn) {
        log('warn', '标签页切到后台，游戏将暂停');
      }
      if (S.keepAliveOn) {
        e.stopImmediatePropagation();
      }
    }, true);

    // 关闭/刷新标签页前存一次档
    addEventListener('pagehide', () => {
      try { saveTally(); } catch { /* 忽略 */ }
      if (!S.cfg.autoSave || S.restoring) return;   // 恢复存档时绝不能再存一次，会把恢复覆盖掉
      const sb = $('#save-btn');
      if (sb) { try { fire(sb); } catch { /* 忽略 */ } }
    });

    // 玩家真实操作后短暂让路（合成事件 isTrusted=false 不计入）
    const markUser = (e) => {
      if (!e.isTrusted) return;
      S.userAt = now();
      try { markPresent(); } catch { /* 忽略 */ }
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
        addEventListener(ev, markUser, { capture: true, passive: true }));

    // 快捷键：Alt+P 暂停/继续，Alt+H 隐藏面板
    // 用 e.code：macOS 上 Option+P 的 e.key 是「π」，按 e.key 判断永远不会触发
    addEventListener('keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const tgt = e.target;
      if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName || ''))) return;
      if (e.code === 'KeyP') { e.preventDefault(); S.pausedByUser = !S.pausedByUser; renderHud(); }
      else if (e.code === 'KeyH') { e.preventDefault(); S.cfg.hud = !S.cfg.hud; writeCfg(S.cfg); renderHud(); }
    });
  }

  // 等待游戏渲染出战斗界面后再启动
  const waiter = setInterval(() => {
    if (document.getElementById('app') && document.getElementById('speed-btns')) {
      clearInterval(waiter);
      start();
    }
  }, 500);
