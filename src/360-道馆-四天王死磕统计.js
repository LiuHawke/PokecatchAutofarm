  /* ====================== 模块：道馆 / 四天王死磕统计 ====================== */

  function deathWatch(save) {
    const deaths = (save.adv && save.adv.deaths) || {};
    const total = Object.values(deaths).reduce((a, b) => a + (b || 0), 0);
    if (S.deaths == null) { S.deaths = total; return; }
    if (total > S.deaths) {
      const d = total - S.deaths;
      S.deaths = total;
      S.deathStreak = (S.deathStreak || 0) + d;
      S.lastDeathAt = now();
      S.tally.deaths += d;
      log('warn', `挑战失败 ×${d}（累计 ${total} 次），已自动退回继续`);
      if (S.cfg.grindMode) {
        // 死磕模式：失败后确保继续跑（游戏本身会自动重走路线），这里只按「您配置的」速度重设一次。
        // 原先取 #speed-btns 的最后一个按钮，会把手动设的 ×1 强行拉到最快。
        ensureSpeed(true);
      }
    } else if (total < S.deaths) {
      S.deaths = total;
    }
    // 连续失败过多 → 战力告警
    if (S.deathStreak >= 3 && now() - (S.deathWarnAt || 0) > 15 * 60000) {
      S.deathWarnAt = now();
      log('warn', `已连续失败 ${S.deathStreak} 次${S.plan && S.plan.why ? `｜主线：${S.plan.why}` : ''}`);
    }
    // 按「距上次失败」清零：原先用 deathWarnAt，还没提醒过时它是 0，计数每次都当场被清掉
    if (S.deathStreak && now() - (S.lastDeathAt || 0) > 30 * 60000) S.deathStreak = 0;
  }
