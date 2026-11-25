  /* ====================== 对战模拟：按游戏回合流程打一场 1 对 1 车轮战 ====================== */
  /*
   * 道馆、联盟每间房和野生战都是 1 对 1：敌方按顺序出场；我方由游戏「自动换人」挑对当前敌人
   * 打分（btSwitchScore）最高的上场，新敌人出场时会免费换人，HP 不回。
   * 回合：按速度先后行动（麻痹 ×0.25），行动前结算睡眠/冰冻/麻痹/混乱，行动后结算灼伤/中毒；
   * 选招含「一击优先」「30% 改用变化招」，伤害含暴击、0.85~1 随机、命中、多段。
   * 用带种子的随机数：同一种子下比较不同阵容更稳定。
   */

  function btRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function btSw(a, f) {
    let m = a._sw;
    if (!m) m = a._sw = new Map();
    let v = m.get(f);
    if (v === undefined) { v = btSwitchScore(a, f); m.set(f, v); }
    return v;
  }

  function btHits(mv, rnd) {
    const h = mv.hits;
    if (!h || mv.typeless) return null;
    if (Array.isArray(h)) return h;
    if (h === '2-5') {
      let n = 2;
      const odds = BC.MULTI_HIT_ODDS;
      for (let r = rnd(), i = 0; i < odds.length && (r -= odds[i]) > 0; i++) n = i + 3;
      return new Array(n).fill(mv.minP / 2);
    }
    return new Array(h).fill(mv.p / h);
  }

  const btCanGet = (s, e) => (e === 'confusion' ? !s.conf : s.status ? false : !(BT_IMMUNE[e] || []).some((t) => s.u.types.includes(t)));

  /**
   * 打一场。mine / foes 是 btUnit 数组（顺序即队伍顺序 / 敌方出场顺序）。
   * ctx = { kind: 'gym'|'trainer'|'wild', dmgMul: 敌方伤害倍率 }
   * 返回 { win, turns, ko: 打倒几只敌人, foeHp: 敌方剩余血量比例, myHp: 我方剩余血量比例, lostTo: 最后打败我方的敌人下标 }
   */
  function btFight(mine, foes, ctx, rnd) {
    const mk = (u, side) => ({ u, side, hp: u.maxHp, status: null, sleep: 0, bit: 0, conf: 0, sure: false });
    const A = mine.map((u) => mk(u, 0)), F = foes.map((u) => mk(u, 1));
    if (!A.length || !F.length) return { win: !F.length, turns: 0, ko: 0, foeHp: 1, myHp: 0, lostTo: 0 };
    const foeMul = ctx.dmgMul || 1;
    let fi = 0, ally = null, calm = 0, turn = 0;

    const pickAlly = () => {
      const f = F[fi].u;
      let best = null, bs = -Infinity;
      for (const x of A) {
        if (x.hp <= 0) continue;
        const s = btSw(x.u, f) + (x === ally ? 0.001 : 0);
        if (s > bs) { bs = s; best = x; }
      }
      if (ally && best !== ally && ally.hp > 0) ally.conf = 0;
      ally = best;
    };
    const inflict = (s, e) => {
      if (e === 'confusion') { s.conf = 2 + Math.floor(rnd() * 4); return; }
      s.status = e; s.bit = 0;
      if (e === 'sleep') s.sleep = 1 + Math.floor(rnd() * 3);
    };
    const hit = (x, t, mv, eff, power, mul) => {
      const crit = rnd() < BC.CRIT_CHANCE;
      let d = Math.max(1, Math.floor(btBase(x.u, t.u, mv, power, eff, x, t) * (crit ? BC.CRIT_MULT : 1) * (0.85 + rnd() * 0.15)));
      if (mul !== 1) d = Math.max(1, Math.round(d * mul));
      return d;
    };

    const attack = (x, t) => {
      const mul = x.side ? foeMul : 1;
      const ko = btKoMove(x.u, t.u, t.hp, mul, x, t);
      let sm = null;
      if (!ko) {
        for (let i = x.u.smoves.length - 1; i >= 0; i--) {
          const k = x.u.smoves[i], e = BT.st[k];
          if (!btCanGet(t, e[0]) || btEff(TA_TI[e[2]], t.u.types, true) === 0) continue;
          sm = { k, status: e[0], chance: e[1] };
          break;
        }
      }
      const best = ko ? null : btPickMove(x.u, t.u, x, t);
      if (sm && (rnd() < BC.STATUS_MOVE_CHANCE || (best && best.typeless))) {
        if (rnd() * 100 < sm.chance) { inflict(t, sm.status); calm = 0; }
        return;
      }
      const mv = ko || best;
      if (!mv || mv.p <= 0) return;
      if (x.sure) x.sure = false;
      else if (rnd() * 100 > mv.acc) { x.sure = true; return; }
      const eff = mv.typeless ? 1 : btEff(mv.t, t.u.types);
      if (eff === 0) return;
      const hs = btHits(mv, rnd);
      let dmg = 0;
      if (hs) for (const p of hs) dmg += hit(x, t, mv, eff, p, mul);
      else dmg = hit(x, t, mv, eff, mv.p, mul);
      calm = 0;
      const before = t.hp;
      t.hp = Math.max(0, t.hp - dmg);
      const dr = BC.DRAIN[mv.key];
      if (dr && x.hp > 0) x.hp = Math.min(x.u.maxHp, x.hp + Math.max(1, Math.ceil(Math.min(dmg, before) * dr)));
      if (t.hp > 0) {
        if (t.status === 'freeze' && mv.t === TA_TI.fire) t.status = null;
        const e = BT.st[mv.key];
        if (e && rnd() * 100 < e[1]) {
          const s = e[0] === 'tri' ? ['burn', 'paralysis', 'freeze'][Math.floor(rnd() * 3)] : e[0];
          if (btCanGet(t, s)) inflict(t, s);
        }
      }
    };

    const act = (x, t) => {
      let skip = false;
      if (x.status === 'sleep') {
        if (x.sleep > 0) { x.sleep--; skip = true; } else x.status = null;
      } else if (x.status === 'freeze') {
        if (rnd() >= BC.THAW_CHANCE) skip = true; else x.status = null;
      } else if (x.status === 'paralysis') {
        x.bit++;
        if (rnd() < BC.FULL_PARA_CHANCE) skip = true;
      }
      if (!skip && x.conf) {
        if (--x.conf <= 0) x.conf = 0;
        else if (rnd() < BC.CONFUSION_SELF_HIT) {
          const s = x.u.st;
          x.hp = Math.max(0, x.hp - Math.max(1, Math.floor((((2 * x.u.lv) / 5 + 2) * 40 * s.atk) / s.def / 50 + 2)));
          calm = 0;
          skip = true;
        }
      }
      if (!skip) attack(x, t);
      if (x.hp <= 0) return;
      if (x.status === 'paralysis') {
        if (BC.STATUS_FX.PARA_TURNS && x.bit >= BC.STATUS_FX.PARA_TURNS) { x.status = null; x.bit = 0; }
      } else if (x.status === 'burn' || x.status === 'poison') {
        calm = 0;
        x.hp = Math.max(0, x.hp - Math.max(1, Math.floor(x.u.maxHp / 8)));
        x.bit++;
        if (x.bit >= BC.STATUS_FX.DOT_TURNS && x.hp > 0) { x.status = null; x.bit = 0; }
      }
    };

    const result = (win) => {
      let mh = 0, mm = 0, fh = 0, fm = 0;
      for (const x of A) { mh += x.hp; mm += x.u.maxHp; }
      for (const x of F) { fh += x.hp; fm += x.u.maxHp; }
      return { win, turns: turn, ko: F.filter((x) => x.hp <= 0).length, foeHp: fh / fm, myHp: mh / mm, lostTo: win ? -1 : fi };
    };

    pickAlly();
    for (;;) {
      turn++; calm++;
      if (calm > BC.STALL_ROUNDS || turn > BC.MAX_ROUNDS) {
        let ah = 0, am = 0, fh = 0, fm = 0;
        for (const x of A) if (x.hp > 0) { ah += x.hp; am += x.u.maxHp; }
        for (const x of F) { fh += x.hp; fm += x.u.maxHp; }
        return result(am > 0 && ah / am > fh / fm);
      }
      const foe = F[fi];
      const sa = ally.u.st.spe * (ally.status === 'paralysis' ? 0.25 : 1);
      const sf = foe.u.st.spe * (foe.status === 'paralysis' ? 0.25 : 1);
      const order = sa > sf || (sa === sf && rnd() < 0.5) ? [ally, foe] : [foe, ally];
      for (const x of order) {
        if (x.hp <= 0 || (x.side ? x !== F[fi] : x !== ally)) continue;
        act(x, x.side ? ally : F[fi]);
        while (fi < F.length && F[fi].hp <= 0) fi++;
        if (fi >= F.length) return result(true);
        if (!A.some((a) => a.hp > 0)) return result(false);
        pickAlly();
      }
    }
  }

  /**
   * 多次模拟取平均。返回 { win, ko: 平均打倒比例, foeHp, myHp, turns, lostTo: [各敌人终结我方的次数] }
   */
  function btSim(mine, foes, ctx, runs = 100, seed = 1) {
    const rnd = btRng(seed);
    let win = 0, ko = 0, foeHp = 0, myHp = 0, turns = 0;
    const lostTo = new Array(foes.length).fill(0);
    for (let i = 0; i < runs; i++) {
      const r = btFight(mine, foes, ctx, rnd);
      if (r.win) win++; else lostTo[r.lostTo]++;
      ko += r.ko / foes.length; foeHp += r.foeHp; myHp += r.myHp; turns += r.turns;
    }
    return { win: win / runs, ko: ko / runs, foeHp: foeHp / runs, myHp: myHp / runs, turns: turns / runs, lostTo, runs };
  }
