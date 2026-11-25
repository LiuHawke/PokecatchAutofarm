  /* ====================== 模块：残血自动换人 ====================== */

  /**
   * 血条百分比。必须确认宽度确实是百分比单位：
   * 若游戏换成 px 宽度（如 "0px"），parseFloat 会得到一个很小的数，
   * 于是每只宝可梦都被当成残血，残血换人会每 4 秒抢一次操作。
   */
  function hpPct(row) {
    const bar = row && row.querySelector('.tr-hp i');
    const w = (bar && bar.style && bar.style.width) || '';
    if (!/%\s*$/.test(w)) return 100;      // 读不到百分比 → 视为健康，宁可不换人
    const v = parseFloat(w);
    return Number.isFinite(v) ? clamp(v, 0, 100) : 100;
  }

  function autoSwitch() {
    if (!S.cfg.autoSwitch) return;
    if (userBusy(3000) || isBusyTask()) return;
    if (now() - (S.switchAt || 0) < 4000) return;
    const rail = document.querySelector('#team-rail');
    if (!rail) return;
    const rows = [...rail.querySelectorAll('.tr-row')];
    if (rows.length < 2) return;
    const acting = rail.querySelector('.tr-row.acting');
    if (!acting) return;
    const curHp = hpPct(acting);
    if (curHp > (S.cfg.switchAtHp || 30)) return;          // 还没到危险线
    // 找一个健康的替补
    const bench = rows
        .filter((r) => r !== acting)
        .map((r) => ({ row: r, hp: hpPct(r) }))
        .filter((x) => x.hp > 55)
        .sort((a, b) => b.hp - a.hp)[0];
    if (!bench) return;
    S.switchAt = now();
    fire(bench.row);
    log('battle', `残血换人（${Math.round(curHp)}% → ${Math.round(bench.hp)}%）`);
  }
