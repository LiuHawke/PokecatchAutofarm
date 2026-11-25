  /* ====================== 自动化：换队 ====================== */

  function monByUid(uid, save = S.save) {
    return ((save && save.mons) || []).find((m) => String(m.uid) === String(uid)) || null;
  }
  function monLabel(uid) {
    const m = monByUid(uid);
    return m ? `${taMonName(m)}${m.shiny ? '✨' : ''} Lv.${m.level || 1}` : String(uid);
  }
  /** 异色与传说级（种族值 ≥ 580）：自动化不会把它换下、寄放 */
  function monProtected(m) {
    if (!m) return false;
    if (m.shiny) return true;
    const b = BASE[m.id];
    return !!b && b.reduce((a, v) => a + v, 0) >= 580;
  }

  /** 队伍格子的 uid，空格为 '' */
  function teamUidsDom() {
    return $$('#team-slots .slot').map((s) => (s.classList.contains('filled') && s.dataset.uid ? String(s.dataset.uid) : ''));
  }

  /**
   * 模拟一次拖拽。游戏的拖动只认 pointer 事件并按格子坐标算落点，没有检查 isTrusted；
   * 第一步位移要超过 6px 才会被当作拖动，落点要在视口内（先把目标格滚进来）。
   */
  async function dragTo(src, dst) {
    if (!src || !dst) return false;
    try { dst.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* 忽略 */ }
    await wait(150);
    const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    if (!a.width || !b.width) return false;
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const base = { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: 'mouse', isPrimary: true, button: 0 };
    try {
      src.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, clientX: x0, clientY: y0 }));
      for (let i = 1; i <= 5; i++) {
        const k = i / 5;
        const x = i === 1 ? x0 + 12 : x0 + (x1 - x0) * k;
        const y = i === 1 ? y0 + 12 : y0 + (y1 - y0) * k;
        document.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 1, clientX: x, clientY: y }));
        await wait(30);
      }
      document.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x1, clientY: y1 }));
    } catch { return false; }
    await wait(400);
    return true;
  }

  /**
   * 把队伍换成 target（uid 数组，第一个当首发）。逐只拖进来：优先放空格，其次替掉不在目标里的队员。
   * 每次拖完都读队伍格子核对，没换上的最多重试 2 次。冒险途中的换人要到下一个宝可梦中心才生效。
   */
  async function applyTeam(target, reason = '一键换上') {
    target = [...new Set((target || []).map(String).filter(Boolean))].slice(0, 6);
    if (!target.length) return { ok: false, msg: '没有目标阵容' };
    return runTask('team', async () => {
      // 侧边面板盖在 PC 格子上，拖拽期间先藏起来
      const panel = $('#pcauto-panel');
      if (panel) panel.style.visibility = 'hidden';
      try { return await applyTeamInner(target, reason); } finally { if (panel) panel.style.visibility = ''; }
    });
  }

  async function applyTeamInner(target, reason) {
    {
      gotoScreen('team');
      await wait(800);
      await settleModals();
      let cur = teamUidsDom();
      if (!cur.length) return { ok: false, msg: '找不到队伍格子（#team-slots）' };
      const before = cur.filter(Boolean);
      const want = new Set(target);
      for (const uid of target) {
        for (let tries = 0; tries < 3; tries++) {
          cur = teamUidsDom();
          if (cur.includes(uid)) break;
          let idx = cur.indexOf('');
          if (idx < 0) idx = cur.findIndex((u) => u && !want.has(u));
          if (idx < 0) break;
          const slot = $$('#team-slots .slot')[idx];
          const cell = $(`#pc-grid .pc-cell[data-uid="${CSS.escape(uid)}"]`);
          if (!cell) break;
          await dragTo(cell, slot);
          await settleModals(2);
        }
      }
      cur = teamUidsDom();
      if (cur[0] !== target[0] && cur.includes(target[0])) {
        const slots = $$('#team-slots .slot');
        await dragTo(slots[cur.indexOf(target[0])], slots[0]);
        await settleModals(2);
      }
      const after = teamUidsDom().filter(Boolean);
      const added = after.filter((u) => !before.includes(u));
      const removed = before.filter((u) => !after.includes(u));
      if (added.length || removed.length) {
        S.teamUndo = before;
        S.tally.teamSwaps++;
        log('info', `${reason}：换上 ${added.map(monLabel).join('、') || '—'}；换下 ${removed.map(monLabel).join('、') || '—'}（冒险途中到下一个宝可梦中心生效）`);
      }
      const missing = target.filter((u) => !after.includes(u));
      if (missing.length) return { ok: false, msg: `${missing.length} 只没换上：${missing.map(monLabel).join('、')}`, added, removed };
      return { ok: true, added, removed };
    }
  }

  async function undoTeam() {
    if (!S.teamUndo) return { ok: false, msg: '没有可撤销的换队' };
    const prev = S.teamUndo;
    const r = await applyTeam(prev, '撤销换队');
    if (r.ok) S.teamUndo = null;
    return r;
  }

  /**
   * 自动换队：按「推进目标」（下一道馆 / 整个联盟）模拟，推荐队的得分高出设定值才换。
   * 锁定队员、练级新人、受保护的异色 / 传说都由引擎固定在队里。
   */
  async function autoTeamTick() {
    if (!S.cfg.autoTeam || !autoIdle(15000)) return;
    if (now() - S.autoTeamAt < 30 * 60000) return;
    const save = S.save;
    const adv = (save && save.adv) || {};
    const node = adv.nodes && adv.nodes[adv.node];
    if (node && node.type === 'gym') return;     // 道馆门口别动阵容
    const tp = await teamPlanAsync('auto', false, 'bg');
    if (!tp || tp.error || tp.keep || !tp.best || !tp.best.uids.length) return;
    const curSet = new Set((save.team || []).map(String));
    if (tp.best.uids.every((u) => curSet.has(u))) return;
    const gap = Math.round((tp.best.score - tp.cur.score) * 100);
    if (gap < (S.cfg.autoTeamGap || 15)) return;
    S.autoTeamAt = now();
    const r = await applyTeam(tp.best.uids, `自动换队（${tp.label}：通关率 ${Math.round(tp.cur.clear * 100)}% → ${Math.round(tp.best.clear * 100)}%）`);
    taskResult('autoTeam', '自动换队', r);
  }
