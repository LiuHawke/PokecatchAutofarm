  /* ====================== 操作：精确喂经验糖（不溢出） ====================== */

  /**
   * 给一只宝可梦挑下一颗糖：离上限还差 need 经验，选「不超过 need 的最大那颗」。
   * 一颗都塞不进去（剩下的比最小的糖还少）就停，超出上限的经验游戏会直接作废。
   */
  function pickCandy(need, items, region) {
    for (const c of CANDIES) {
      if ((items[c.key] || 0) > 0 && candyXp(c, region) <= need) return c;
    }
    return null;
  }

  /** 纯计算：按当前存档给出整队的喂糖方案 [{ uid, name, list: [candyKey...] }]，自检和界面预览都用它 */
  function candyPlanFor(save) {
    const f = facts(save);
    if (!f) return [];
    const items = { ...(save.items || {}) };
    const out = [];
    const trainee = teamPrefs().trainee;
    const order = trainee ? [...f.team].sort((a, b) => (b.uid === trainee) - (a.uid === trainee)) : f.team;
    for (const t of order) {
      let need = t.toCap;
      const list = [];
      for (let guard = 0; guard < 200; guard++) {
        const c = pickCandy(need, items, f.region);
        if (!c) break;
        list.push(c.key);
        items[c.key]--;
        need -= candyXp(c, f.region);
      }
      if (list.length) out.push({ uid: t.uid, name: taMonName(t.m), list, left: need });
    }
    return out;
  }

  async function feedAllCandy() {
    if (isBusyTask()) return '正在执行其他任务';
    S.lastFed = 0;
    const plan = candyPlanFor(S.save || readSave());
    if (!plan.length) return '没有需要喂的：全队已到上限，或剩余经验比最小的糖还少';

    S.feeding = true;
    S.busySince = now();
    log('info', '正在按上限精确喂糖（短暂切换至队伍界面）…');
    const prevKey = activeScreen();
    // 卡片刚弹出时点 ✕ 会被忽略，没关掉的卡会在游戏里排队、挡住后续弹窗：确认关掉再继续
    const closeMonCards = async () => {
      for (let i = 0; i < 12; i++) {
        const card = $('.modal.mon-modal');
        if (!card) return;
        const x = card.querySelector('.dc-x');
        if (x) fire(x);
        await wait(300);
      }
    };
    let fed = 0;
    const done = [];
    try {
      gotoScreen('team');
      await wait(800);
      for (const p of plan) {
        const slot = $(`#team-slots .slot.filled[data-uid="${CSS.escape(p.uid)}"]`);
        if (!slot || !slot.getBoundingClientRect().width) continue;
        // 游戏吃糖后不会马上写 localStorage：先让它存一次档拿到准确经验，之后在本地扣减
        const sb = $('#save-btn');
        if (sb) { fire(sb); await wait(600); }
        const save = readSave() || {};
        const f = facts(save);
        const t = f && f.team.find((x) => x.uid === p.uid);
        if (!t) continue;
        // 留 2% 余量：喂糖这段时间战斗还在给经验
        let need = Math.floor(t.toCap * 0.98);
        fire(slot);
        await wait(650);
        if (!$('.modal.mon-modal')) continue;
        // 吃完一颗卡片会重绘，按钮每次都重新取
        const candyBtn = (c) => { const m = $('.modal.mon-modal'); return m ? m.querySelectorAll('.dc-candy')[c.idx] : null; };
        const qty = (b) => (b ? parseInt((b.querySelector('i') || {}).textContent, 10) || 0 : 0);
        const items = {};
        for (const c of CANDIES) items[c.key] = qty(candyBtn(c));
        let n = 0;
        for (let guard = 0; guard < 80; guard++) {
          const c = pickCandy(need, items, f.region);
          if (!c) break;
          const btn = candyBtn(c);
          if (!btn || btn.disabled) break;
          const before = qty(btn);
          fire(btn);
          await wait(500);
          const after = qty(candyBtn(c));
          if (after >= before) break;   // 没吃掉（到上限或界面变了），换下一只
          items[c.key] = after;
          need -= candyXp(c, f.region) * (before - after);
          n += before - after;
        }
        if (n) { fed += n; done.push(`${p.name} ×${n}`); }
        await closeMonCards();
      }
    } catch { /* 忽略 */ }
    finally {
      await closeMonCards();
      gotoScreen(prevKey);
      S.feeding = false;
      S.lastProgressAt = now();
      S.lastActivityAt = now();
    }
    S.lastFed = fed;
    S.tally.candies += fed;
    return fed ? `共 ${fed} 颗（${done.join('、')}），没有超出上限` : '没有喂进去（糖果按钮不可用）';
  }
