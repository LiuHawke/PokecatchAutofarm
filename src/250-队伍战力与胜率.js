  /* ====================== 模块：队伍战力与胜率 ====================== */

  function teamStats(save) {
    const team = (save.team || []).map((u) => (save.mons || []).find((m) => m.uid === u)).filter(Boolean);
    if (!team.length) return null;
    const lv = team.map((m) => m.level || 1);
    const avg = Math.round(lv.reduce((a, b) => a + b, 0) / lv.length);
    const alive = team.filter((m) => (m.hp == null || m.hp > 0)).length;
    const st = save.stats || {};
    const battles = st.battles || 0;
    const wins = st.wins || 0;
    const winRate = battles > 0 ? Math.round((wins / battles) * 100) : null;
    return { avg, min: Math.min(...lv), max: Math.max(...lv), alive, size: team.length, battles, wins, winRate };
  }

  /** teamStats 对每个队员都要 mons.find()，是 O(队伍×库存)；存档引用未变时复用结果 */
  function teamStatsCached() {
    if (S.teamCache && S.teamCache.src === S.save) return S.teamCache.val;
    const val = S.save ? teamStats(S.save) : null;
    S.teamCache = { src: S.save, val };
    return val;
  }

  function chapterBand() {
    const txt = ($('#chapter-btn .ac-lvl') || {}).textContent || '';
    const m = txt.match(/(\d+)\s*[–\-~]\s*(\d+)/);
    return m ? { lo: +m[1], hi: +m[2] } : null;
  }

  /** 按所选档位估算的目标倍率（×3 档实测约 2.5x）；低于目标的 72% 视为偏慢 */
  function speedTarget() {
    return { 1: 1, 2: 2, 4: 2.5 }[S.cfg.speed] || 2.5;
  }
  function speedFloor() { return speedTarget() * 0.72; }

  function speedGuard() {
    if (S.speedRatio == null) return;
    if (S.speedRatio >= speedFloor()) { S.slowWarnAt = 0; return; }
    if (now() - (S.slowWarnAt || 0) < 25 * 60000) return;
    S.slowWarnAt = now();
    const why = isRealHidden() ? '页面在后台' : '设备可能跟不上（战斗渲染卡顿）';
    log('warn', `实际倍率只有 ${S.speedRatio.toFixed(1)}x（目标 ${speedTarget()}x）：${why}`);
  }

  function powerGuard() {
    if (!S.cfg.powerGuard) return;
    const save = S.save;
    if (!save) return;
    const t = teamStatsCached();
    if (!t) return;
    const band = chapterBand();
    const lowHp = t.alive < t.size;
    let problem = '';
    const node = save.adv && save.adv.nodes && save.adv.nodes[save.adv.node];
    const isGym = node && node.type === 'gym';
    if (isGym && t.alive <= Math.ceil(t.size / 2)) problem = `即将开打道馆，但只有 ${t.alive}/${t.size} 只还能战斗`;
    else if (t.winRate != null && t.battles > 30 && t.winRate < 85) problem = `胜率偏低（${t.winRate}%，${t.battles - t.wins} 场翻车）`;
    else if (band && t.avg < band.lo - 1) problem = `队伍均级 ${t.avg} 低于本章建议 ${band.lo}–${band.hi}`;
    else if (lowHp && t.alive <= Math.ceil(t.size / 2)) problem = `队伍 ${t.size} 只里只有 ${t.alive} 只能战斗`;
    if (!problem) { S.powerWarn = ''; return; }
    if (now() - (S.powerWarnAt || 0) < 20 * 60000) return;
    S.powerWarnAt = now();
    S.powerWarn = problem;
    log('warn', '战力提示：' + problem);
    beep('warn');
    notify('对战状态提示', problem + '（可回退章节刷级或补血）', 'pcauto-power');
  }
