  /* ====================== 长时间挂机：状态持久化 / 健康刷新 / 看门狗 ====================== */

  const STATE_KEY = 'pcauto.state.v1';
  const STATE_FIELDS = ['teamUndo', 'shopSpent', 'autoTeamAt', 'autoFeedAt', 'pensionAt', 'shopAt', 'taskFails',
    'penSlots', 'deathStreak', 'lastDeathAt', 'progressAt', 'counterFor', 'healthReloads'];

  /** 冷却、预算、撤销记录等存进 localStorage：停滞刷新或健康刷新之后不会重复花钱、马上又换一次队 */
  function persistState() {
    const o = { at: now() };
    for (const k of STATE_FIELDS) o[k] = S[k];
    lsSet(STATE_KEY, JSON.stringify(o));
  }
  function restoreState() {
    const p = safeParse(lsGet(STATE_KEY), null);
    if (!p || now() - (p.at || 0) > 12 * 3600000) return false;
    for (const k of STATE_FIELDS) {
      const v = p[k], cur = S[k];
      if (v === undefined || v === null) continue;
      // 存的东西类型不对（旧版本、手改过）就丢掉，否则后面 .filter / 运算会一直抛异常
      if (cur !== undefined && cur !== null && (Array.isArray(cur) !== Array.isArray(v) || typeof cur !== typeof v)) continue;
      S[k] = v;
    }
    return true;
  }

  /** 统一的「存档后刷新」：先存脚本状态和战报，再点游戏的保存，3 秒后刷新 */
  function safeReload(reason) {
    if (S.reloading) return;
    S.reloading = true;
    log('warn', `${reason}：先保存存档，3 秒后刷新`);
    try { persistState(); saveTally(); dailyTick(); } catch { /* 忽略 */ }
    const sb = $('#save-btn');
    if (sb) fire(sb);
    setTimeout(() => location.reload(), 3000);
  }

  /** 连续运行太久或内存涨太多时，挑一个安全的空档刷新页面 */
  function healthCheck() {
    if (!S.cfg.healthReload || !S.cfg.enabled || S.pausedByUser || S.reloading) return;
    const up = now() - S.bootAt;
    let why = '';
    if (up > clamp(S.cfg.healthHours || 6, 1, 48) * 3600000) why = `已连续运行 ${(up / 3600000).toFixed(1)} 小时`;
    const mem = PAGE_WIN.performance && PAGE_WIN.performance.memory;
    if (mem && mem.usedJSHeapSize) {
      if (!S.memBase && up > 5 * 60000) S.memBase = mem.usedJSHeapSize;
      const mb = Math.round(mem.usedJSHeapSize / 1e6);
      if (S.memBase && mem.usedJSHeapSize > S.memBase * 3 && mb > 500) why = `内存占用涨到 ${mb} MB`;
    }
    if (!why) return;
    // 只在安全的空档刷：没有长任务、没有弹窗、玩家 1 分钟没操作、不在道馆节点
    const adv = (S.save || {}).adv || {};
    const node = adv.nodes && adv.nodes[adv.node];
    if (isBusyTask() || userBusy(60000) || findModal() || (node && node.type === 'gym')) return;
    if (isRealHidden() && !S.keepAliveOn) return;
    S.healthReloads = (S.healthReloads || 0) + 1;
    safeReload(`健康刷新（${why}）`);
  }

  /** 长任务卡住（页面改版、某一步永远等不到）时强制释放，否则主循环会一直让路 */
  function taskWatchdog() {
    if (!isBusyTask()) { S.busySince = 0; return; }
    if (!S.busySince) { S.busySince = now(); return; }
    const limit = S.feeding ? 5 * 60000 : 90000;     // 喂一整队糖可能要几分钟
    if (now() - S.busySince < limit) return;
    const name = S.busyTask || 'feed';
    log('warn', `长任务「${name}」超过 ${Math.round(limit / 1000)} 秒没结束，已强制释放`);
    S.busyTask = '';
    S.feeding = false;
    S.busySince = 0;
    S.taskFails[name] = (S.taskFails[name] || 0) + 1;
    gotoScreen('adventure');
  }
