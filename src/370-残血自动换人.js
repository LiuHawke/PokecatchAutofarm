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

  /*
   * 战斗中换克制。游戏规则（app.js 的 un / kt / ut）：
   *   每一步按属性打分（只看属性，不看等级和血量）挑场上的宝可梦，换人不会让对手白打；
   *   点头像 = battle.pick 指定它出场，本场战斗一直有效，同时把它排到队首（会写进存档的队伍顺序）。
   * 所以每来一个新对手判断一次：用 1 对 1 模拟（含等级、当前血量）比较场上这只和替补，
   * 明显更好时点替补的头像。只管单打的训练家 / 馆主战，野怪战不动。
   */
  const BC_MIN_GAIN = 0.25;
  const bcDone = new Map();     // 战斗 + 对手 → 已判断

  /** 当前对手和我方每只的胜率；拿不到接口、不是单打训练家战时返回 null */
  function bcPick() {
    if (!nsOk()) return null;
    const G = NS().Game;
    const save = liveSave();
    const b = save && save.adv && save.adv.battle;
    if (!b || (b.slots || 1) !== 1 || !(b.kind === 'trainer' || b.kind === 'gym') || !Array.isArray(b.enemies)) return null;
    const foe = (b.foes || []).map((u) => b.enemies.find((e) => e.uid === u)).find((e) => e && e.hp > 0)
      || b.enemies.find((e) => e.hp > 0);
    const allyUid = (b.allies || [])[0];
    if (!foe || !allyUid) return null;
    const fu = btUnit({ id: foe.id, level: foe.level }, { foe: true, hpMult: foe.hpMult || 1 });
    if (!fu) return null;
    const foeU = { ...fu, startHp: G.curHp(foe) };
    const ctx = { kind: b.kind, dmgMul: btFoeDmgMul(b.kind, b.gym && b.gym.power) };
    const team = G.teamMons().filter((m) => G.curHp(m) > 0);
    const rows = [];
    for (const m of team) {
      const u = btUnit(m);
      if (!u) continue;
      const hp = G.curHp(m), max = G.maxHp(m) || 1;
      const r = btSim([{ ...u, startHp: hp * (u.maxHp / max) }], [foeU], ctx, 24, 7);
      rows.push({ uid: String(m.uid), m, win: r.win, hpFrac: hp / max });
    }
    const cur = rows.find((r) => r.uid === String(allyUid));
    if (!cur) return null;
    const best = rows.filter((r) => r.hpFrac >= 0.4).sort((a, c) => c.win - a.win)[0];
    return { key: `${b.kind}|${b.trainer || ''}|${b.enemies.map((e) => e.uid).join(',')}|${foe.uid}`, foe, cur, best, rows };
  }

  function battleCounterTick() {
    if (!S.cfg.battleCounter || userBusy(3000) || isBusyTask()) return;
    if (now() - (S.bcAt || 0) < 900) return;
    S.bcAt = now();
    let p;
    try { p = bcPick(); } catch (e) { logError('战斗中换克制', e); return; }
    if (!p || bcDone.has(p.key)) return;
    bcDone.set(p.key, now());
    if (bcDone.size > 200) bcDone.delete(bcDone.keys().next().value);
    const { cur, best, foe } = p;
    if (!best || best.uid === cur.uid || best.win - cur.win < BC_MIN_GAIN) return;
    const row = $(`#team-rail .tr-row[data-uid="${CSS.escape(best.uid)}"]`);
    if (!row || row.classList.contains('ko') || row.classList.contains('active')) return;
    fire(row);
    const b = liveSave().adv.battle;
    const pc = (x) => `${Math.round(x * 100)}%`;
    if (!b || String(b.pick) !== best.uid) {
      logOnce('bc-nopick', 'warn', `战斗中换克制：点了 ${taMonName(best.m)} 的头像但游戏没接受（塔里或特殊战斗不让换），这条提示只出现一次`);
      return;
    }
    log('battle', `战斗中换克制：对手 ${TA_NAME[foe.id - 1] || '#' + foe.id} Lv.${foe.level}，${taMonName(cur.m)} 胜率 ${pc(cur.win)} → 换上 ${taMonName(best.m)}（${pc(best.win)}）`);
  }

  function autoSwitch() {
    battleCounterTick();
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
