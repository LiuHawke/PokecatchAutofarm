  /* ====================== 禁招建议：按对战模拟逐只搜索要禁用的招式 ====================== */
  /*
   * 游戏自己的出招已经会按期望伤害挑攻击招、能一击就一击；禁招真正影响的是：
   *   变化招（每回合有固定概率改用变化招）、自动换人打分（只看种族值的 bestMoveAgainst）、方块首领（只用一个招）。
   * 固定规则（全禁变化招、只留前几个攻击招、照搬 loadoutFor）离线实测都不稳定，所以这里对每只宝可梦列几种候选禁法，
   * 其余队员不动、逐只换成模拟得分最高的那种（坐标上升，两轮），再用另一批种子复核，提升够大才给建议。
   * 候选里始终至少留一个攻击招（游戏禁到没有攻击招会恢复全部）。
   * 只依赖战斗模型（060–066）和 070 的 loadoutFor，不碰 DOM，tools/ban-check.js 离线加载。
   */

  const BAN_TRAIN_SEEDS = [11, 29];
  const BAN_CONFIRM_SEED = 977;
  const BAN_RUNS = 40;
  const BAN_MIN_GAIN = 0.02;
  const BAN_CTRL = new Set(['sleep', 'paralysis', 'freeze', 'confusion']);

  /** 已学会的招：攻击招对象和变化招 key */
  function banMoves(m) {
    const d = BT_DEX[m.id];
    if (!d) return null;
    const seen = new Set(), atk = [], status = [];
    for (const [lv, key] of d.learn) {
      if (lv > (m.level || 1) || seen.has(key)) continue;
      seen.add(key);
      if (BT_MV[key] && BT_MV[key].p > 0) atk.push(BT_MV[key]);
      else if (BT.st[key]) status.push(key);
    }
    return { d, atk, status };
  }

  /**
   * 一只宝可梦的候选禁法（mon.ban 格式：排好序的招式 key 数组，去重）。
   * foeTypes：目标敌人的属性组列表；boss：是否打首领（持续伤害更值钱）
   */
  function banCands(m, foeTypes, boss) {
    const mv = banMoves(m);
    if (!mv || !mv.atk.length) return [];
    const { d, atk, status } = mv;
    const st = btStats({ id: m.id, level: m.level || 1, rank: m.rank || 0, shiny: !!m.shiny });
    const val = (x, types) => x.p * (x.acc || 100) / 100 * (x.phys ? st.atk : st.spa) * (d.types.includes(x.t) ? 1.5 : 1) * btEff(x.t, types);
    const cover = (list) => foeTypes.reduce((s, types) => s + Math.max(0, ...list.map((x) => val(x, types))), 0);
    // 按覆盖贪心排出攻击招的先后
    const order = [];
    while (order.length < atk.length) {
      let pick = null, g = -1;
      for (const x of atk) {
        if (order.includes(x)) continue;
        const v = cover([...order, x]);
        if (v > g) { g = v; pick = x; }
      }
      order.push(pick);
    }
    const dot = status.filter((k) => LOADOUT_DOT.has(BT.st[k][0]));
    const ctrl = status.filter((k) => BAN_CTRL.has(BT.st[k][0]));
    const sets = [];
    const add = (banList) => {
      const s = [...new Set(banList)].sort();
      if (s.length && atk.every((x) => s.includes(x.key))) return;
      const k = s.join(',');
      if (!sets.some((x) => x.join(',') === k)) sets.push(s);
    };
    const keepAtk = (n) => order.slice(n).map((x) => x.key);
    add((m.ban || []).slice());
    add([]);
    const lo = loadoutFor(m, foeTypes, boss);
    if (lo) add(lo.ban);
    add(status);
    add(status.filter((k) => !dot.includes(k)));
    add(status.filter((k) => !ctrl.includes(k)));
    for (let n = 1; n <= Math.min(3, atk.length - 1); n++) {
      add([...keepAtk(n), ...status]);
      add([...keepAtk(n), ...status.filter((k) => !dot.includes(k))]);
    }
    return sets;
  }

  /** 模拟得分：各间加权胜率（每间满血开打，近似模型） */
  function banScore(mons, rooms, seed, runs = BAN_RUNS) {
    const units = mons.map((m) => btUnit(m)).filter(Boolean);
    if (!units.length) return 0;
    let s = 0, w = 0;
    for (const r of rooms) {
      const res = btSim(units, r.foes, { kind: r.kind, dmgMul: r.dmgMul }, runs, seed);
      s += (r.w || 1) * (res.win + 0.15 * (res.ko || 0));
      w += r.w || 1;
    }
    return w ? s / w : 0;
  }
  const banTrain = (mons, rooms, runs) => BAN_TRAIN_SEEDS.reduce((s, seed) => s + banScore(mons, rooms, seed, runs), 0) / BAN_TRAIN_SEEDS.length;
  const banClear = (mons, rooms, seed, runs) => {
    const units = mons.map((m) => btUnit(m)).filter(Boolean);
    let c = 1;
    for (const r of rooms) c *= btSim(units, r.foes, { kind: r.kind, dmgMul: r.dmgMul }, runs, seed).win;
    return c;
  };

  /**
   * 搜索整队的禁招。mons：存档里的宝可梦（不改动）；rooms：teamTarget 的 rooms（含 foes / ids / kind / dmgMul / w）。
   * opts.boss（默认 true）、opts.yield（每只之后 await 一下，页面里传 idle）、opts.runs。
   * 返回 { sug: [{ uid, m, ban, keep, add, enable }], before, after }（复核种子上的通关率），没有值得改的返回 null。
   */
  async function banAdvise(mons, rooms, opts = {}) {
    const boss = opts.boss !== false, runs = opts.runs || BAN_RUNS, y = opts.yield || null;
    const foeTypes = [];
    for (const r of rooms) for (const [id] of r.ids || []) if (BT_DEX[id]) foeTypes.push(BT_DEX[id].types);
    if (!foeTypes.length || !mons.length) return null;
    const cands = mons.map((m) => banCands(m, foeTypes, boss));
    const cur = mons.map((m) => ({ ...m, ban: (m.ban || []).slice() }));
    let best = banTrain(cur, rooms, runs);
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (let i = 0; i < cur.length; i++) {
        const curKey = (cur[i].ban || []).slice().sort().join(',');
        for (const ban of cands[i]) {
          if (ban.join(',') === curKey) continue;
          const trial = cur.slice();
          trial[i] = { ...cur[i], ban };
          const s = banTrain(trial, rooms, runs);
          if (s > best + 0.005) { best = s; cur[i] = trial[i]; moved = true; }
        }
        if (y) await y();
      }
      if (!moved) break;
    }
    const sug = [];
    mons.forEach((m, i) => {
      const was = (m.ban || []).slice().sort(), now0 = (cur[i].ban || []).slice().sort();
      if (was.join(',') === now0.join(',')) return;
      const mv = banMoves(m);
      sug.push({
        uid: String(m.uid), m, ban: now0,
        keep: mv.atk.map((x) => x.key).filter((k) => !now0.includes(k)),
        add: now0.filter((k) => !was.includes(k)), enable: was.filter((k) => !now0.includes(k)),
      });
    });
    if (!sug.length) return null;
    const before = banClear(mons, rooms, BAN_CONFIRM_SEED, runs * 2);
    const after = banClear(cur, rooms, BAN_CONFIRM_SEED, runs * 2);
    if (after < before + BAN_MIN_GAIN) return null;
    return { sug, before, after };
  }
