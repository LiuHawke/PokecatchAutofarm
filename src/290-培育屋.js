  /* ====================== 自动化：培育屋 ====================== */

  const DITTO_ID = 132;

  /**
   * 寄放候选（按优先级）：百变怪排第一（有它下蛋更快），其余按种族值、等级从低到高。
   * 游戏里每种宝可梦只有一只（重复捕获会变成家族经验），所以挑的是「最不可能上场」的那些；
   * 队伍、预设队、异色、传说级不碰。
   */
  function depositCandidates(save) {
    if (!save) return [];
    const keep = new Set((save.team || []).map(String));
    for (const set of ((save.teamSets || {}).list || [])) for (const u of (set || [])) keep.add(String(u));
    const inPen = new Set(((save.pension || {}).mons || []).map((p) => String((p && p.mon && p.mon.uid) || (p && p.uid) || '')));
    const bst = (m) => (BASE[m.id] || []).reduce((a, v) => a + v, 0);
    return (save.mons || [])
        .filter((m) => m && m.id && !inPen.has(String(m.uid)) && !keep.has(String(m.uid)) && !monProtected(m) && !m.locked && !m.fav)
        .sort((a, b) => (b.id === DITTO_ID) - (a.id === DITTO_ID) || bst(a) - bst(b) || (a.level || 1) - (b.level || 1))
        .map((m) => String(m.uid));
  }

  async function pensionTick() {
    if (!(S.cfg.autoHatch || S.cfg.autoDeposit) || !autoIdle(15000)) return;
    if (now() - S.pensionAt < 10 * 60000) return;
    const save = S.save;
    const pen = save && save.pension;
    if (!pen) return;
    // 只在真有事可做时才切页面：有蛋到了 hatchAt，或者寄放位有空（位数第一次进培育屋时从页面读到）
    const wantHatch = S.cfg.autoHatch && (pen.eggs || []).some((e) => e && e.hatchAt && e.hatchAt <= now());
    const roomy = S.penSlots == null || (pen.mons || []).length < S.penSlots;
    const dups = S.cfg.autoDeposit && roomy ? depositCandidates(save) : [];
    S.pensionAt = now();
    if (!wantHatch && !dups.length) return;
    const r = await runTask('pension', async () => {
      gotoScreen('pension');
      await wait(900);
      await settleModals();
      const scr = $('#screen-pension');
      if (!scr || !scr.classList.contains('active')) return { ok: false, msg: '打不开培育屋' };
      S.penSlots = $$('#pen-res .pen-res:not(.buy):not(.locked)').length;
      let hatched = 0, deposited = 0;
      for (let guard = 0; wantHatch && guard < 8; guard++) {
        const egg = $('#pen-eggs .pen-egg.ready');
        if (!egg) break;
        fire(egg);
        await wait(1000);
        await settleModals(6);
        hatched++;
      }
      for (const uid of dups) {
        if (!$('#pen-res .pen-res.empty:not(.buy):not(.locked)')) break;   // 待购买 / 未解锁的格子也带 empty
        const cell = $(`#pen-grid .pc-cell[data-uid="${CSS.escape(uid)}"]`);
        if (!cell) continue;
        const n0 = (((readSave() || {}).pension || {}).mons || []).length;
        const label = monLabel(uid);   // 寄放后它就不在 mons 里了，先记下名字
        fire(cell);
        await wait(800);
        await settleModals(3);
        const n1 = (((readSave() || {}).pension || {}).mons || []).length;
        if (n1 > n0) { deposited++; log('info', `培育屋：寄放了 ${label}`); }
      }
      if (hatched) log('info', `培育屋：孵化了 ${hatched} 个蛋`);
      S.tally.hatched += hatched;
      S.tally.deposited += deposited;
      return { ok: true, hatched, deposited };
    });
    taskResult(S.cfg.autoHatch ? 'autoHatch' : 'autoDeposit', '培育屋自动化', r);
  }
