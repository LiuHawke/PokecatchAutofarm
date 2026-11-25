  /* ====================== 自动化：喂糖 ====================== */

  async function autoFeedTick() {
    if (!S.cfg.autoFeed || !autoIdle(15000)) return;
    if (now() - S.autoFeedAt < Math.max(5, S.cfg.autoFeedMin || 15) * 60000) return;
    const save = S.save;
    if (!save) return;
    S.autoFeedAt = now();
    if (!candyPlanFor(save).length) return;
    const msg = await feedAllCandy();
    if (S.lastFed) log('item', `自动喂糖：${msg}`);
    taskResult('autoFeed', '自动喂糖', { ok: true });
  }
