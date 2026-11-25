  /* ====================== 团体战 / 活动选队：自动点一次游戏自带的「优化」 ====================== */
  /*
   * 选队面板 #evt-pick 打开、有「优化」按钮（#evt-opt，游戏用 counterTeam 按首领挑克制队）时，
   * 每个首领每天只替您点一次。只整理这支活动队伍，不点「加入 / 出发」，不重抽、不花任何东西。
   * 点之前记下原来的阵容写进日志，想换回去可以在面板里手动拖。
   */

  function raidPickKey(root) {
    const head = $('#evt-pick-head h2', root);
    return `${parisDay()}|${head ? head.textContent.trim() : '?'}`;
  }
  const raidSlots = (root) => $$('#evt-team .slot[data-uid]', root).map((s) => String(s.dataset.uid));

  /** test = { root, seen }：自检用脱离文档的样例，忽略可见性、不写日志，返回是否点了 */
  function raidOptimizeTick(test = null) {
    if (!S.cfg.raidOptimize && !test) return false;
    const root = test ? test.root : document;
    const pick = $('#evt-pick.open', root);
    const btn = pick && $('#evt-opt', pick);
    if (!btn || btn.disabled || (!test && !btn.offsetParent)) return false;
    if (!test && userBusy(1500)) return false;
    const key = raidPickKey(root);
    const seen = test ? test.seen : (S.raidOpt = S.raidOpt || {});
    if (seen[key]) return false;
    seen[key] = now();
    if (test) { btn.click(); return true; }
    const before = raidSlots(root);
    const names = (uids) => uids.map((u) => monLabel(u)).join('、') || '空';
    fire(btn);
    setTimeout(() => {
      const after = raidSlots();
      const same = before.join(',') === after.join(',');
      const boss = key.split('|')[1];
      log('info', same ? `选队「${boss}」：已点游戏的「优化」，阵容没变`
        : `选队「${boss}」：已点游戏的「优化」（原来：${names(before)} → 现在：${names(after)}）。要不要加入请您自己点`);
    }, 400);
    return true;
  }
