  /* ====================== 自动化：按需买经验糖 ====================== */

  function shopSpentHour() {
    S.shopSpent = (Array.isArray(S.shopSpent) ? S.shopSpent : []).filter((x) => now() - x.at < 3600000);
    return S.shopSpent.reduce((a, x) => a + x.cost, 0);
  }

  function shopPrice(item) {
    if (item.dataset.price) return +item.dataset.price || 0;
    const txt = (($('.sh-price .unit', item) || $('.sh-price', item) || {}).textContent || '').replace(/[,\s]/g, '');
    const m = txt.match(/(\d+)/);
    return m ? +m[1] : 0;
  }

  /**
   * 纯计算：还缺几颗糖 { key: 数量 }。只买本地区已解锁的最划算那种（越大越便宜），
   * 每只队员按「整颗塞得进剩余经验」算，零头留给战斗经验补，不买贵的小糖去凑。
   */
  function shopWant(save) {
    const f = facts(save);
    if (!f) return {};
    const best = CANDIES.find((c) => f.regionBadges >= c.badges);
    if (!best) return {};
    const xp = candyXp(best, f.region);
    const need = f.team.reduce((a, t) => a + Math.floor(t.toCap / xp), 0);
    const lack = need - ((save.items || {})[best.key] || 0);
    return lack > 0 ? { [best.key]: lack } : {};
  }

  async function shopTick() {
    if (!S.cfg.autoShop || !autoIdle(15000)) return;
    if (now() - S.shopAt < 20 * 60000) return;
    const save = S.save;
    if (!save) return;
    const want = shopWant(save);
    const keys = CANDIES.map((c) => c.key).filter((k) => want[k]);
    if (!keys.length) return;
    const floor = S.cfg.shopFloor || 0;
    const unitMax = S.cfg.shopUnitMax || 100000;
    if ((save.money || 0) - floor < CANDIES.find((c) => c.key === keys[keys.length - 1]).price) return;
    if ((S.cfg.shopBudget || 0) - shopSpentHour() <= 0) return;
    S.shopAt = now();
    const r = await runTask('shop', async () => {
      gotoScreen('shop');
      await wait(900);
      await settleModals();
      let spent = 0;
      const bought = [];
      for (const id of keys) {
        const item = $(`#screen-shop .sh-item[data-id="${id}"]`);
        if (!item || item.classList.contains('locked')) continue;
        const price = shopPrice(item);
        if (!price) continue;
        if (price > unitMax) { tellShop(id, price); continue; }
        for (let n = want[id]; n > 0;) {
          const money = (readSave() || {}).money || 0;
          const left = (S.cfg.shopBudget || 0) - shopSpentHour();
          const afford = Math.min(n, Math.floor(left / price), Math.floor((money - floor) / price));
          if (afford < 1) break;
          const qty = afford >= 10 && price * 10 <= unitMax ? 10 : 1;
          const qBtn = $(`.sh-buy .seg button[data-n="${qty}"]`, item);
          const buy = $('.sh-buy .btn.primary.buy', item) || $('.btn.primary.buy', item);
          if (!buy) return { ok: false, msg: '找不到购买按钮' };
          if (qBtn) { fire(qBtn); await wait(250); } else if (qty !== 1) break;
          intent('shop');
          fire(buy);
          await wait(800);
          await settleModals(2);
          const cost = money - (((readSave() || {}).money) || 0);
          if (cost <= 0) return { ok: false, msg: '点了购买但金钱没变' };
          S.shopSpent.push({ at: now(), cost });
          S.tally.shopSpent += cost;
          spent += cost;
          n -= qty;
          bought.push(`${(CANDIES.find((c) => c.key === id) || {}).zh || id} ×${qty}`);
        }
      }
      if (!bought.length) return { ok: true, skip: true };
      log('item', `按需补糖：${bought.join('、')}，共 ${fmt(spent)} ₽（按离上限的经验算，买完不会喂溢出）`);
      return { ok: true, cost: spent };
    });
    taskResult('autoShop', '按需补糖', r);
  }

  function tellShop(id, price) {
    const k = `shop:${id}`;
    if (S.shopTold === k) return;
    S.shopTold = k;
    log('info', `${id} 单价 ${fmt(price)} ₽ 超过自动购买上限 ${fmt(S.cfg.shopUnitMax)} ₽，需要您自己买`);
  }
