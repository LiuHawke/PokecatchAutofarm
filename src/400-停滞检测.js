  /* ====================== 模块：停滞检测 ====================== */

  /**
   * 三路信号取「最近的那一个」（即 idle 取最小值）：
   *  - worldIdle：存档里的 lastTick 变化，取决于游戏多久写一次 localStorage
   *  - actIdle  ：#battle-log 文本变化，纯走路/捕获期间它根本不变
   *  - progIdle ：脚本自己确认的推进（关掉弹窗、点过场、选道具、换节点、抓到怪）
   * 前两路会在「游戏明明在跑」时同时静默，progIdle 是最可靠的一路，必须参与判定，
   * 否则 stallReload 会在一切正常时把页面刷掉。
   */
  function getIdleSec() {
    const t = now();
    const worldIdle = t - (S.lastTickAt || t);
    const actIdle = t - (S.lastActivityAt || t);
    const progIdle = t - (S.lastProgressAt || t);
    return Math.max(0, Math.round(Math.min(worldIdle, actIdle, progIdle) / 1000));
  }

  function stallCheck() {
    // 正在跑一键喂糖这类长任务：不算停滞
    if (isBusyTask()) { S.lastActivityAt = now(); S.lastProgressAt = now(); S.stalled = false; return; }
    // 玩家正在看面板/详情：不算停滞，也不报警
    if (userBusy(5000)) { S.lastActivityAt = now(); S.stalled = false; return; }
    const idle = getIdleSec();
    const limit = S.cfg.stallSec;
    if (idle > limit && !S.stalled) {
      S.stalled = true;
      const realHidden = isRealHidden();
      log('warn', realHidden ? '页面在后台：游戏已暂停，请切回标签页' : `已 ${idle} 秒无进展`);
      beep('warn');
      notify('挂机可能已停止', realHidden ? '标签页在后台，游戏会暂停' : '较长时间没有新进展', 'pcauto-stall');
      S.tally.stalls++;
      if (S.cfg.stallReload && !realHidden) {
        // 刷新前必须先存档：默认 5 分钟才自动保存一次，直接 reload 最坏会吃掉 5 分钟进度
        safeReload('长时间停滞');
      }
    }
    if (idle < 25) S.stalled = false;
  }
