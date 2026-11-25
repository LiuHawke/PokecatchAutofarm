  /* ====================== 模块：夜间守护 ====================== */

  function nightGuard() {
    if (!S.cfg.nightGuard || S.phase !== 2) return;
    if (now() - S.lastCatchAt < 12 * 60000) return;
    if (now() - (S.nightWarnedAt || 0) < 30 * 60000) return;
    S.nightWarnedAt = now();

    const save = S.save;
    const node = save?.adv?.nodes?.[save?.adv?.node];
    const indoor = nodeIndoor(node);
    const msg = indoor
        ? `当前是夜里，但场景「${node?.name || '室内'}」属于室内 —— 昼夜权重无效，夜间限定宝可梦不会出现`
        : '夜间已 12 分钟没有新捕获，检查窗口是否被切到后台或卡在弹窗';
    log('warn', msg);
    beep('warn');
    notify('🌙 夜间挂机检查', msg.slice(0, 110), 'pcauto-night');
  }
