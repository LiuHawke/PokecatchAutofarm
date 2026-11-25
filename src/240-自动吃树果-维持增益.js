  /* ====================== 模块：自动吃树果（维持增益） ====================== */

  function buffState(save) {
    const out = {};
    const now_ = now();
    for (const [family, b] of Object.entries(save.buffs || {})) {
      if (!b || !b.until) continue;
      const left = b.until - now_;
      if (left <= 0) continue;
      out[family] = { key: b.key, left, leftMin: Math.round(left / 60000) };
    }
    return out;
  }

  function useBerry(key) {
    // 背包格子在 #bag-panel 里，事件委托挂在 #bag-panel 上，隐藏状态也能触发
    const cell = document.querySelector(`#bag-panel .bag-cell[data-k="${key}"]`);
    if (!cell) return false;
    intent('berry');
    fire(cell);
    return true;
  }

  /** 树果的「使用」要看存档里数量真的少了才算，避免被替换弹窗「保留」掉的也计进战报 */
  function confirmBerry(save) {
    const p = S.berryPending;
    if (!p || !save) return;
    const have = (save.items || {})[p.key] || 0;
    if (have < p.have) {
      S.tally.berries++;
      S.berryPending = null;
    } else if (now() > p.until) {
      S.berryPending = null;
    }
  }

  function autoBerry() {
    if (!S.cfg.autoBerry) return;
    if (userBusy(2000)) return;
    const openModal = document.querySelector('.modal');
    if (openModal && !/mon-modal|bag-modal/.test(openModal.className || '')) return;
    if (isRealHidden() && !S.keepAliveOn) return;

    const save = S.save;
    if (!save) return;
    const items = save.items || {};
    const buffs = buffState(save);
    const lead = Math.max(5, S.cfg.berryLeadMin) * 60000;
    const reserve = Math.max(0, S.cfg.berryReserve | 0);

    // 优先级：闪光 > 图鉴 > 稀有 > 捕获(高rank优先) > 经验 > 金钱
    const order = Object.keys(BERRY_BUFFS).sort((a, b) => BERRY_BUFFS[b].rank - BERRY_BUFFS[a].rank);
    for (const key of order) {
      const meta = BERRY_BUFFS[key];
      if (!S.cfg.berryFamilies?.[meta.family]) continue;
      const have = items[key] || 0;
      if (have <= reserve) continue;
      if (now() - (S.berryAt[key] || 0) < 60000) continue;      // 每种一分钟一次

      const cur = buffs[meta.family];
      if (cur && cur.left >= lead) continue;                     // 还够用
      // 同族已有更高 rank 的增益：一律不吃低阶（这是「替换你的树果？」弹窗的唯一来源）
      if (cur && cur.key !== key) {
        const curRank = BERRY_BUFFS[cur.key]?.rank || 0;
        if (curRank > meta.rank) continue;
      }
      // 快到叠加上限就别浪费
      if (cur && cur.key === key && cur.left + BUFF_MIN_MS > BUFF_STACK * BUFF_MIN_MS) continue;

      if (useBerry(key)) {
        S.berryAt[key] = now();
        log('item', `使用 ${key} → ${meta.label} ×${meta.mult}（剩 ${cur ? cur.leftMin : 0} 分钟）`);
        S.berryPending = { key, have, until: now() + 20000 };
        return;
      }
    }
  }
