  /* ====================== 调度 ====================== */

  /**
   * 一次只启动一个长任务，按优先级：主线推进 > 喂糖 > 买糖 > 换队 > 培育屋。
   * 买糖排在喂糖后面：先用手上的，缺多少再买。
   * Cloud.hold / 云存档冲突时游戏会弹窗，autoIdle 里的 findModal 会让所有任务停下。
   */
  const AUTO_TASKS = [
    ['progress', () => progressTick()],
    ['feed', () => autoFeedTick()],
    ['shop', () => shopTick()],
    ['team', () => autoTeamTick()],
    ['pension', () => pensionTick()],
  ];

  function autoTick() {
    eventTick();
    if (now() - S.bootAt < 60000) return;   // 刚启动时游戏还在读档、弹每日奖励，先别切页面
    for (const [name, fn] of AUTO_TASKS) {
      if (isBusyTask()) return;
      fn().catch((e) => log('warn', `自动化「${name}」异常：${(e && e.message) || e}`));
    }
  }
