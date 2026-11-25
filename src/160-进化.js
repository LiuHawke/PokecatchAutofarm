  /* ====================== 模块：进化 ====================== */

  function maybeEvolve() {
    if (!S.cfg.autoEvo || userBusy(4000)) return;
    // 有弹窗时确认框会排在它后面，等轮到时已过了 5 秒的自动确认窗口，挂机就卡在「要让N只进化吗？」
    if (findModal()) return;
    // evoFail 为 0 时基准间隔为 1 倍 evoEverySec，失败后按 1.8^n 指数退避。
    // 上限压到 4 次（约 5 分钟）：游戏不一定即时写盘，5 秒后的核对本身可能误判，
    // 退避到十几分钟会让一次误判就把自动进化沉睡掉。
    const mult = Math.pow(1.8, Math.min(4, S.evoFail || 0));
    const gap = Math.round(S.cfg.evoEverySec * 1000 * mult);
    if (now() - S.lastEvoAt < gap) return;

    const btn = $('#pc-evo-all');
    if (!btn || btn.disabled) return;
    const n = parseInt(((btn.textContent.match(/[（(]\s*(\d+)/) || btn.textContent.match(/(\d+)/) || [])[1]) || '0', 10);
    if (n <= 0) { S.evoFail = 0; return; }
    S.lastEvoAt = now();
    intent('evo');
    S.evoBefore = (S.save && S.save.stats && S.save.stats.evolutions) || 0;
    fire(btn);
    log('evo', `尝试进化 ×${n}`);
    // 5 秒后核对结果，连续失败则指数退避
    setTimeout(() => {
      try {
        const cur = readSave();
        const evo = (cur && cur.stats && cur.stats.evolutions) || 0;
        if (evo > (S.evoBefore || 0)) {
          S.evoFail = 0;
          log('evo', '进化成功');
        } else {
          S.evoFail = Math.min(4, (S.evoFail || 0) + 1);
          if (S.evoFail === 1) log('info', '暂无可进化（该种类已拥有），稍后再试');
        }
      } catch { /* 忽略 */ }
    }, 5000);
  }
