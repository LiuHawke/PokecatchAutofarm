  /* ====================== 战斗模型：按游戏规则算能力值、选招、伤害 ====================== */
  /*
   * 对照游戏 Adventure / Game 模块：statsOf/maxHp（能力值）、ln（选招）、Vs（伤害）、vn（一击优先）、
   * on/ms（自动换人打分）、Os/xn（道馆血量与伤害修正）。数据由 tools/gen-data.js 从游戏原代码生成。
   */
  const BT = __DATA__.battle;
  const BC = BT.cfg;

  /** dex[id] = { types: [属性下标], base: [hp,atk,def,spa,spd,spe], learn: [[等级, 招式key]] } */
  const BT_DEX = (() => {
    const out = {};
    for (const [id, row] of Object.entries(BT.dex)) {
      const [t, s, l] = row.split('|');
      out[id] = {
        types: t.split(',').map((x) => TA_TI[x]).filter((x) => x != null),
        base: s.split(',').map(Number),
        learn: l ? l.split(' ').map((x) => { const [a, b] = x.split('.'); return [parseInt(a, 36), BT.keys[parseInt(b, 36)]]; }) : [],
      };
    }
    return out;
  })();

  /** 招式：{ key, t: 属性下标, p: 威力, minP, phys, acc, hits } */
  const BT_MV = (() => {
    const out = {};
    for (const [k, [t, p, minP, c, acc, hits]] of Object.entries(BT.mv)) out[k] = { key: k, t: TA_TI[t], p, minP, phys: c === 'p', acc, hits };
    return out;
  })();
  const BT_STRUGGLE = BT_MV.struggle ? { ...BT_MV.struggle, typeless: true } : { key: 'struggle', t: 0, p: 50, minP: 50, phys: true, acc: 100, hits: 0, typeless: true };
  const BT_IMMUNE = { burn: [TA_TI.fire], poison: [TA_TI.poison, TA_TI.steel], freeze: [TA_TI.ice], paralysis: [], sleep: [], confusion: [] };

  const btKnown = (id) => !!BT_DEX[id];

  /** 属性倍率：守方各属性连乘；clamp 时夹在 [0, 4]（游戏 is） */
  function btEff(atkType, defTypes, raw = false) {
    let m = 1;
    for (const d of defTypes) m *= (TA_CHART[atkType] || [])[d] ?? 1;
    return raw ? m : Math.min(BC.TYPE_EFF_MAX, Math.max(0, m));
  }

  /** 能力值（游戏 statsOf）：闪光 ×1.1、宝石阶 ×1.15^rank、statMult */
  function btStats(m) {
    const d = BT_DEX[m.id];
    if (!d) return null;
    const lv = m.level || 1;
    const rank = Math.min(BT.rankMax, Math.max(0, Math.floor(+m.rank || 0)));
    const mult = (m.shiny ? 1 + BC.SHINY_STAT_BONUS : 1) * (m.statMult || 1) * Math.pow(BT.rankStat, rank);
    const b = d.base;
    const f = (x) => Math.floor((Math.floor((2 * x * lv) / 100) + 5) * mult);
    return {
      hp: Math.floor((Math.floor((2 * b[0] * lv) / 100) + lv + 10) * mult),
      atk: f(b[1]), def: f(b[2]), spa: f(b[3]), spd: f(b[4]), spe: f(b[5]),
    };
  }

  /** 战斗血量（游戏 maxHp）：HP × min(2.5, 1+1.5·Lv/100) × 1.1 × hpMult */
  function btMaxHp(m, st = btStats(m)) {
    if (!st) return 1;
    const lv = m.level || 1;
    return Math.max(1, Math.floor(st.hp * Math.min(BC.HP_LEVEL_MAX, 1 + (BC.HP_LEVEL_SCALE * lv) / 100) * BC.HP_BOOST * (m.hpMult || 1)));
  }

  /**
   * 战斗单位：把一只宝可梦展开成模拟需要的全部静态数据。
   * opts.hpMult：敌方血量倍率（道馆 Os）；opts.foe：敌方
   */
  function btUnit(m, opts = {}) {
    const d = BT_DEX[m.id];
    if (!d) return null;
    const mon = { id: m.id, level: m.level || 1, shiny: !!m.shiny, rank: m.rank || 0, statMult: m.statMult || 1, hpMult: opts.hpMult || m.hpMult || 1 };
    const st = btStats(mon);
    // 招式设置里禁用的招（mon.ban）不会用；禁到一个攻击招都不剩时游戏恢复全部
    const ban = Array.isArray(m.ban) && m.ban.length ? new Set(m.ban) : null;
    const collect = (skip) => {
      const seen = new Set();
      const moves = [], smoves = [];
      for (const [lv, key] of d.learn) {
        if (lv > mon.level || seen.has(key) || (skip && skip.has(key))) continue;
        seen.add(key);
        if (BT_MV[key]) moves.push(BT_MV[key]);
        else if (BT.st[key]) smoves.push(key);
      }
      return { moves, smoves };
    };
    let { moves, smoves } = collect(ban);
    if (ban && !moves.length) ({ moves, smoves } = collect(null));
    return {
      uid: m.uid != null ? String(m.uid) : '', id: m.id, lv: mon.level, foe: !!opts.foe, src: m,
      types: d.types, base: d.base, st, maxHp: btMaxHp(mon, st), moves, smoves,
    };
  }

  const BT_STAT_FX = BC.STATUS_FX.STAT;
  /** 状态对能力的修正（灼伤攻、中毒特攻、睡眠防、冰冻特防 ×0.75） */
  function btFx(s, stat) {
    const fx = s && BT_STAT_FX[s.status];
    return fx && fx[0] === stat ? fx[1] : 1;
  }

  /** 伤害公式里与随机无关的部分：(2L/5+2)·威力·攻/防/50+2，再乘本系、克制、等级差 */
  function btBase(a, d, mv, power, eff, as, ds) {
    const atk = mv.phys ? a.st.atk * btFx(as, 'atk') : a.st.spa * btFx(as, 'spa');
    const def = mv.phys ? d.st.def * btFx(ds, 'def') : d.st.spd * btFx(ds, 'spd');
    const core = ((2 * a.lv) / 5 + 2) * power * atk / def / 50 + 2;
    const stab = mv.typeless ? 1 : a.types.includes(mv.t) ? 1.5 : 1;
    return core * stab * eff * Math.pow(BC.LEVEL_GAP, a.lv - d.lv);
  }

  /** 选招（游戏 ln）：所有已学会的攻击招，按 期望伤害×命中×本系×克制 取最大；全被免疫时用挣扎 */
  function btPickMove(a, d, as, ds) {
    let best = null, bestV = 0;
    for (const mv of a.moves) {
      const atk = mv.phys ? a.st.atk * btFx(as, 'atk') : a.st.spa * btFx(as, 'spa');
      const def = Math.max(1, mv.phys ? d.st.def * btFx(ds, 'def') : d.st.spd * btFx(ds, 'spd'));
      const v = (((2 * a.lv) / 5 + 2) * mv.p * atk / def / 50 + 2) * (mv.acc / 100) * (a.types.includes(mv.t) ? 1.5 : 1) * btEff(mv.t, d.types);
      if (v > bestV) { bestV = v; best = mv; }
    }
    if (best) return best;
    return a.moves.length ? BT_STRUGGLE : null;
  }

  /** 一击优先（游戏 vn）：最低伤害也能打倒对方的招里，取命中最高、其次威力最高的 */
  function btKoMove(a, d, hp, dmgMul, as, ds) {
    let pick = null;
    for (const mv of a.moves) {
      const eff = btEff(mv.t, d.types);
      if (eff === 0) continue;
      let dm = Math.max(1, Math.floor(btBase(a, d, mv, mv.minP, eff, as, ds) * 0.85));
      if (dmgMul !== 1) dm = Math.max(1, Math.round(dm * dmgMul));
      if (dm < hp) continue;
      if (!pick || mv.acc > pick.acc || (mv.acc === pick.acc && mv.p > pick.p)) pick = mv;
    }
    return pick;
  }

  /** 游戏 bestMoveAgainst：只看种族值的攻/特攻，不看对方防御，用于自动换人打分 */
  function btBestVs(a, defTypes) {
    let best = null, bestV = -1;
    for (const mv of a.moves) {
      const v = mv.p * (mv.acc / 100) * (a.types.includes(mv.t) ? 1.5 : 1) * btEff(mv.t, defTypes, true) * (mv.phys ? a.base[1] : a.base[3]);
      if (v > bestV) { bestV = v; best = mv; }
    }
    return best;
  }

  /** 自动换人打分（游戏 on + 0.01·ms）：克制 +3、被抗 −3、免疫 −5；被对方属性克制 −2、抵抗 +2 */
  function btSwitchScore(a, f) {
    const tp = BC.TYPE_POWER;
    const mv = btBestVs(a, f.types);
    const ja = mv && mv.p > 0 ? btEff(mv.t, f.types, true) : 1;
    const back = Math.max(...f.types.map((t) => btEff(t, a.types, true)));
    const on = (ja === 0 ? tp.immune : ja > 1 ? tp.strong : ja < 1 ? tp.weak : 0) + (back > 1 ? tp.exposed : back < 1 ? tp.resists : 0);
    const lg = (x) => Math.log2(Math.max(0.125, x));
    return on + 0.01 * (lg(ja) - lg(back));
  }

  /** 道馆敌方血量倍率（游戏 Os）：1.3·power·max(1, 6/敌人数)^0.7 */
  function btGymHpMul(pw, n) {
    return BC.GYM_HP_MULT * (pw || 1) * Math.pow(Math.max(1, 6 / Math.max(1, n)), BC.GYM_TEAM_EXP);
  }
  /** 敌方造成的伤害倍率（游戏 xn） */
  function btFoeDmgMul(kind, pw) {
    return kind === 'gym' ? BC.GYM_DAMAGE * (pw || 1) : (BC.ENEMY_DAMAGE[kind] ?? 1);
  }
