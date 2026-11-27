  /* ====================== 联盟整轮重放：按顺序连打各间（含精英阶级） ====================== */
  /*
   * 联盟是连战：输一间就从头来，间与间之间只有带宝可梦中心的那间会回血。
   * 逐间独立估算（每间前回满）会偏乐观，这里在游戏沙盒里按顺序把各间连起来重放：
   *   每间把冒险节点换成该间的馆主节点、走一步开打，馆主全倒 → 进下一间，战斗被清空 → 本轮输。
   * 有夜间阵容的间，白天 / 夜晚轮流重放。精英阶级的敌人按满级、阶级加成，由游戏自己按 leagueElite 生成。
   * 只读：不发奖励、不写存档（在游戏发奖励之前就抛出结束）。
   */

  const NRL_STEP_MAX = 2400;

  /** 联盟各间的重放底稿；拿不到接口、地区没有联盟时返回 null */
  function nrPlanLeague(region, tier = 0) {
    if (!nsOk()) return null;
    const ns = NS(), G = ns.Game, ST = ns.STORY, C = ns.CONFIG, save = G.S;
    if (!save || !save.adv || typeof ST.chaptersOf !== 'function' || typeof ST.gymTeam !== 'function') return null;
    const power = tier ? ((C.ELITE && C.ELITE.LEAGUE && C.ELITE.LEAGUE.POWER) || {})[tier] ?? 1 : 1;
    const course = [];
    for (const ch of ST.chaptersOf(region)) {
      const chap = ST.CHAPTERS[ch];
      const step = chap && chap.league && chap.steps.find((s) => s.kind === 'gym');
      if (!step || !step.team || !step.team.length) continue;
      const vs = [step, ...(step.atNight && Array.isArray(step.atNight.team) ? [{ ...step, ...step.atNight }] : [])];
      course.push({
        ch, leader: step.leader || chap.name, heal: chap.steps.some((s) => s.kind === 'heal'), night: vs.length > 1,
        variants: vs.map((gym) => {
          const team = tier ? gym.team.map(([id]) => [id, C.MAX_LEVEL]) : ST.gymTeam(ch, gym);
          return {
            foes: team.map(([id, level]) => ({ id, level })),
            node: { ...gym, ch, type: 'gym', gym: tier ? { ...gym, badge: null, keep: false, power: (gym.power || 1) * power } : gym, ...(tier ? { leagueElite: tier, team } : {}) },
          };
        }),
      });
    }
    if (!course.length) return null;
    const first = course[0].ch;
    const base = nrClone({ ...G.freshState(), ...pick(save, ['trainer', 'link', 'buffs', 'items']) });
    const adv = nrClone(save.adv);
    Object.assign(adv, {
      chapter: first, unlocked: Math.max(adv.unlocked | 0, course[course.length - 1].ch), nodes: [], node: 0, battle: null, pending: null,
      event: null, zone: null, tower: null, league: tier ? { reg: region, tier, back: first } : null, loops: [], kept: {}, paidLeaders: {},
      paused: false, capture: { ...(adv.capture || {}), on: false },
    });
    base.adv = adv;
    return { kind: 'league', region, tier, course, base, save, variants: Math.max(...course.map((s) => s.variants.length)) };
  }

  /**
   * 连打一轮。返回 { win, stages: [{ win, progress, arrive }], lostAt（间下标）, lostTo（敌方 id）, error }
   * variant：0 = 白天阵容，1 = 夜间阵容（没有夜间阵容的间都用白天）
   */
  function nrRunLeague(plan, lineup, seed = 1, variant = 0) {
    const ns = NS(), G = ns.Game, A = ns.Adventure;
    if (G.inSandbox()) return null;
    const t0 = performance.now();
    try { return nrRunLeagueInner(plan, lineup, seed, variant, G, A); } finally { perfAdd(PERF.nr, performance.now() - t0); }
  }
  function nrRunLeagueInner(plan, lineup, seed, variant, G, A) {
    const state = nrClone(plan.base);
    state.mons = lineup.map((m) => {
      const c = nrClone(m);
      for (const k of NR_DROP) delete c[k];
      return c;
    });
    state.team = state.mons.map((m) => m.uid);
    state.road = state.team.slice();
    state.eventTeams = {};
    if (state.adv.league) state.adv.league.team = state.team.slice();
    const M = PAGE_WIN.Math, rand = M.random;
    const WON = { t: 'won' }, LOST = { t: 'lost' };
    const out = { win: false, stages: [], lostAt: null, lostTo: null, seeded: nrSeedable() };
    let s = seed >>> 0 || 1;
    if (out.seeded) M.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const hpFrac = () => {
      let cur = 0, max = 0;
      for (const m of G.teamMons()) { cur += Math.max(0, G.curHp(m)); max += G.maxHp(m); }
      return max ? cur / max : 0;
    };
    try {
      G.sandbox(state, () => {
        const adv = state.adv;
        let battle = null;
        Object.defineProperty(adv, 'battle', {
          enumerable: true, configurable: true, get: () => battle,
          set(v) {
            if (!v && battle) {
              const foe = (battle.enemies || []).find((e) => e.hp > 0) || (battle.enemies || [])[0];
              out.lostTo = foe ? foe.id : null;
              throw LOST;
            }
            battle = v;
          },
        });
        for (let i = 0; i < plan.course.length; i++) {
          const stage = plan.course[i];
          const v = stage.variants[variant] || stage.variants[0];
          if (!plan.tier) adv.chapter = v.node.ch;
          adv.nodes = [v.node];
          adv.node = 0;
          adv.pending = null;
          if (stage.heal && typeof G.healTeam === 'function') G.healTeam();
          const arrive = hpFrac();
          let res;
          try {
            const ev = A.step() || [];
            const start = ev.find((e) => e && e.type === 'battleStart');
            const foes = battle && battle.enemies;
            if (!start || start.kind !== 'gym' || !foes || foes.length !== v.foes.length || foes.some((e, j) => e.id !== v.foes[j].id)) {
              throw new Error('游戏的联盟战斗配置和重放入口对不上（游戏可能改版了）');
            }
            const full = foes.reduce((x, e) => x + G.curHp(e), 0);
            let left = foes.filter((e) => G.curHp(e) > 0).length;
            for (const e of foes) {
              let hp = e.hp;
              Object.defineProperty(e, 'hp', {
                enumerable: true, configurable: true, get: () => hp,
                set(val) {
                  if (hp == null || hp > 0) { if (val <= 0) left--; } else if (val > 0) left++;
                  hp = val;
                  if (left <= 0) throw WON;
                },
              });
            }
            for (let k = 0; k < NRL_STEP_MAX; k++) A.step();
            res = { win: false, progress: 1 - foes.reduce((x, e) => x + Math.max(0, G.curHp(e)), 0) / Math.max(1, full), arrive };
          } catch (sig) {
            if (sig === WON) res = { win: true, progress: 1, arrive };
            else if (sig === LOST) {
              const foes = (battle && battle.enemies) || [];
              const full = foes.reduce((x, e) => x + G.maxHp(e), 0);
              res = { win: false, progress: 1 - foes.reduce((x, e) => x + Math.max(0, G.curHp(e)), 0) / Math.max(1, full), arrive };
            } else throw sig;
          }
          battle = null;
          out.stages.push(res);
          if (!res.win) { out.lostAt = i; break; }
        }
        out.win = out.stages.length === plan.course.length && out.stages.every((x) => x.win);
      });
    } catch (e) {
      out.error = String((e && e.message) || e);
    } finally {
      if (out.seeded) M.random = rand;
    }
    return out;
  }

  /**
   * 多轮取平均。返回形状与 nrEval 汇总后的 teamNativeEval 对齐：
   * { clear（整轮通关率）, score, rooms: [{ win（打到这间时的胜率）, reached, arrive, lostTo, roadLoss, runs }], runs, error }
   */
  async function nrEvalLeague(plan, lineup, opts = {}) {
    const runs = opts.runs || 16, seed0 = opts.seed || 7;
    const n = plan.course.length;
    const acc = plan.course.map(() => ({ reach: 0, win: 0, arr: 0, lostTo: {} }));
    let done = 0, wins = 0, prog = 0, errors = 0, error = null;
    for (let i = 0; i < runs; i++) {
      if (opts.deadline && performance.now() > opts.deadline && done >= 4) break;
      if (opts.valid && !opts.valid()) { error = '存档变了'; break; }
      const t0 = performance.now();
      const r = nrRunLeague(plan, lineup, (Math.imul(seed0 + i, 2654435761) >>> 0) || 1, i % plan.variants);
      const ms = performance.now() - t0;
      if (!r) { error = '游戏正处于沙盒中'; break; }
      if (r.error) { errors++; error = r.error; if (errors >= 3) break; await nrPace(opts.pace, ms); continue; }
      done++;
      if (r.win) wins++;
      r.stages.forEach((st, k) => {
        const a = acc[k];
        a.reach++;
        a.arr += st.arrive;
        if (st.win) a.win++;
        prog += st.win ? 1 : st.progress;
      });
      if (r.lostAt != null && r.lostTo != null) acc[r.lostAt].lostTo[r.lostTo] = (acc[r.lostAt].lostTo[r.lostTo] || 0) + 1;
      await nrPace(opts.pace, ms);
    }
    if (!done) return { error: error || '没有跑出结果' };
    const clear = wins / done;
    return {
      clear, score: clear + 0.1 * (prog / (done * n)), runs: done, error,
      rooms: acc.map((a) => ({ win: a.reach ? a.win / a.reach : 0, reached: a.reach / done, arrive: a.reach ? a.arr / a.reach : null, lostTo: a.lostTo, roadLoss: 0, runs: done })),
    };
  }

  /* ---------- 精英联盟选队 ---------- */

  /** 可选的精英阶级：游戏开着精英联盟、这个地区已开放时返回阶级列表 */
  function eliteTiers(region) {
    if (!nsOk()) return [];
    const ns = NS(), C = ns.CONFIG, LZ = ns.LegendZones;
    if (!C.ELITE || !C.ELITE.ON || !C.ELITE.LEAGUE || !Array.isArray(C.ELITE.TIERS)) return [];
    try { if (LZ && typeof LZ.leagueOpen === 'function' && !LZ.leagueOpen(region)) return []; } catch { return []; }
    return C.ELITE.TIERS.slice();
  }

  /**
   * 精英联盟（或普通联盟）整轮选队：按游戏的克制评分贪心拼出几支种子队，整轮重放比较，
   * 再针对输得最多的那间试替补，最后用新种子估一次通关率。约 20 秒。
   * 返回 { tier, team: [mon], cur: 结果 | null, best: 结果, tried, ms } 或 { error }
   */
  async function eliteLeaguePick(region, tier, onProgress) {
    const plan = nrPlanLeague(region, tier);
    if (!plan) return { error: '拿不到游戏接口或本地区没有联盟数据' };
    const ns = NS(), G = ns.Game, A = ns.Adventure, C = ns.CONFIG, save = plan.save;
    const pen = new Set(((save.pension && save.pension.mons) || []).map((m) => (typeof m === 'string' ? m : m && m.uid)));
    const pool = (save.mons || []).filter((m) => m && G.DEX[m.id] && !pen.has(m.uid) && (!m.reg || m.reg === region));
    if (!pool.length) return { error: '没有可上场的宝可梦' };
    const size = C.TEAM_SIZE || 6;
    const kindOf = (m) => (tier ? (G.speciesOf ? G.speciesOf(m) : m.id) : G.beingOf ? G.beingOf(m) : `${m.id}:${!!m.shiny}`);
    const apart = (a, b) => { try { return !!(G.teamApart && G.teamApart(a, b)); } catch { return false; } };
    const foes = plan.course.flatMap((st, si) => st.variants.flatMap((v) => v.foes.map((f) => ({ ...f, si, rank: tier, foe: true }))));
    const mu = (m, f) => {
      try { return Math.log1p(Math.max(0, A.counterParts(m, f, C.MAX_LEVEL).value) / Math.max(1, G.maxHp(f))); } catch { return 0; }
    };
    const rows = pool.map((m) => ({ m, v: foes.map((f) => mu(m, f)) }));
    const lineupFor = (weight, focus = -1, baseTeam = []) => {
      const team = baseTeam.slice(), cov = foes.map(() => 0), seen = new Set(team.map(kindOf));
      for (const m of team) rows.find((r) => r.m === m)?.v.forEach((x, i) => { cov[i] += x; });
      while (team.length < size) {
        let best = null, bs = -Infinity;
        for (const r of rows) {
          if (seen.has(kindOf(r.m)) || team.some((x) => apart(x, r.m))) continue;
          const sc = r.v.reduce((s, x, i) => s + (x * (foes[i].si === focus ? 4 : 1)) / (1 + weight * cov[i]), 0);
          if (sc > bs) { bs = sc; best = r; }
        }
        if (!best) break;
        team.push(best.m);
        seen.add(kindOf(best.m));
        best.v.forEach((x, i) => { cov[i] += x; });
      }
      return team;
    };
    const byUid = new Map(pool.map((m) => [m.uid, m]));
    const assigned = (tier ? save.eventTeams && save.eventTeams['league:' + region] : save.team) || [];
    const curTeam = [];
    for (const u of assigned) {
      const m = byUid.get(u);
      if (m && !curTeam.some((x) => kindOf(x) === kindOf(m) || apart(x, m))) curTeam.push(m);
      if (curTeam.length >= size) break;
    }
    const t0 = performance.now(), deadline = t0 + 22000, searchEnd = deadline - 6000;
    const valid = () => liveSave() === save;
    const key = (t) => t.map((m) => m.uid).sort().join('|');
    const tested = new Map();
    const tryTeam = async (team, runs) => {
      const k = key(team);
      if (!team.length || tested.has(k) || performance.now() > searchEnd) return tested.get(k) || null;
      const r = await nrEvalLeague(plan, team, { runs, seed: 3, deadline: searchEnd, valid, pace: 'full' });
      if (r.error && !r.runs) throw new Error(r.error);
      const c = { team, r };
      tested.set(k, c);
      if (onProgress) onProgress(tested.size);
      return c;
    };
    try {
      const quick = 4 * plan.variants;
      for (const t of [lineupFor(0), lineupFor(2), lineupFor(8), curTeam]) await tryTeam(t, quick);
      const ranked = () => [...tested.values()].sort((a, b) => b.r.score - a.r.score);
      const excluded = new Set();
      for (let round = 0; round < 3 && performance.now() < searchEnd; round++) {
        const top = ranked()[0];
        if (!top || top.r.clear >= 0.95) break;
        const losses = top.r.rooms.map((x) => x.reached * (1 - x.win));
        let focus = -1;
        losses.forEach((x, i) => { if (!excluded.has(i) && x > 0 && (focus < 0 || x > losses[focus])) focus = i; });
        if (focus < 0) break;
        excluded.add(focus);
        await tryTeam(lineupFor(2, focus), quick);
        const stageScore = (r) => r.v.reduce((s, x, i) => s + (foes[i].si === focus ? x : 0), 0);
        const reserves = rows.filter((r) => !top.team.includes(r.m)).sort((a, b) => stageScore(b) - stageScore(a)).slice(0, 4);
        for (const res of reserves) {
          for (let i = 0; i < top.team.length && performance.now() < searchEnd; i++) {
            const trial = top.team.slice();
            trial[i] = res.m;
            if (trial.some((x, j) => j !== i && (kindOf(x) === kindOf(res.m) || apart(x, res.m)))) continue;
            await tryTeam(trial, quick);
          }
        }
        // 换首发：把对这间最好的那只放到第一位
        const lead = top.team.slice().sort((a, b) => stageScore(rows.find((r) => r.m === b)) - stageScore(rows.find((r) => r.m === a)))[0];
        if (lead && lead !== top.team[0]) await tryTeam([lead, ...top.team.filter((m) => m !== lead)], quick);
      }
      const best = ranked()[0];
      if (!best) return { error: '联盟重放用时过长，请重试' };
      const finalOpts = { runs: 32, seed: 9001, deadline, valid, pace: 'full' };
      const bestR = await nrEvalLeague(plan, best.team, finalOpts);
      const curR = curTeam.length && key(curTeam) !== key(best.team) ? await nrEvalLeague(plan, curTeam, finalOpts) : null;
      let ban = null;
      try {
        const rooms = plan.course.map((st) => {
          const v = st.variants[0];
          const hm = btGymHpMul(1, v.foes.length);
          return { ids: v.foes.map((x) => [x.id, x.level]), kind: 'gym', dmgMul: btFoeDmgMul('gym', 1), w: 1,
            foes: v.foes.map((x) => btUnit({ id: x.id, level: x.level }, { foe: true, hpMult: hm })).filter(Boolean) };
        });
        const adv = await banAdvise(best.team, rooms, { yield: idle });
        if (adv) {
          const by = new Map(adv.sug.map((s) => [s.uid, s]));
          const gate = { runs: 24, seed: 4242, deadline: performance.now() + 15000, valid, pace: 'full' };
          const b0 = await nrEvalLeague(plan, best.team, gate);
          const b1 = await nrEvalLeague(plan, best.team.map((m) => (by.has(String(m.uid)) ? { ...m, ban: by.get(String(m.uid)).ban } : m)), gate);
          if (b0.clear != null && b1.clear != null) ban = { sug: adv.sug, before: b0.clear, after: b1.clear, better: b1.clear >= b0.clear + 0.04 };
        }
      } catch { /* 禁招建议失败不影响选队 */ }
      return {
        ban,
        tier, region, team: best.team, best: bestR.error && !bestR.runs ? best.r : bestR, curTeam, cur: curR && !curR.error ? curR : curTeam.length && key(curTeam) === key(best.team) ? bestR : null,
        stages: plan.course.map((s) => ({ leader: s.leader, night: s.night, heal: s.heal })), tried: tested.size, ms: Math.round(performance.now() - t0),
      };
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  }
