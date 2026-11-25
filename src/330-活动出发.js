  /* ====================== 自动化：活动出发 ====================== */

  /** 活动选择界面打开时游戏已经用 autoTeam 配好了队；停留 8 秒玩家没动就替您点出发 */
  function eventTick() {
    if (!S.cfg.autoEvent || !S.cfg.enabled || S.pausedByUser) { S.evtSeenAt = 0; return; }
    const go = $('#evt-go .mp-go') || $('#evt-go');
    if (!go || go.disabled || go.offsetParent === null || go.classList.contains('locked')) { S.evtSeenAt = 0; return; }
    if (userBusy(8000)) { S.evtSeenAt = now(); return; }
    if (!S.evtSeenAt) { S.evtSeenAt = now(); return; }
    if (now() - S.evtSeenAt < 8000) return;
    S.evtSeenAt = 0;
    intent('event');
    fire(go);
    log('event', '活动队伍已就绪，自动出发');
  }
