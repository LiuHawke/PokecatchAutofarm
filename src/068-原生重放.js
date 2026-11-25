  /* ====================== 原生重放：在游戏沙盒里跑真实战斗 ====================== */
  /*
   * 用游戏自己的 Game.sandbox(state, fn)：临时把全局存档换成一份拷贝，期间存档、云同步都被游戏自己关掉。
   * 拷贝里只放要测的阵容，从章节开头走到馆主（路上训练家、野怪、带血进馆都算），捕获关掉。
   * 结束信号：
   *   馆主的宝可梦血量全部 ≤ 0 → 胜（在发奖励、进下一章之前抛出）
   *   战斗被清空且我方全倒 → 败（游戏的战败处理第一步就是清空 battle，在回城和更新检查之前）
   * Math.random 可写时换成固定种子（同一种子结果一样）；游戏冻结了 Math 时用游戏自己的随机数。
   * 每次重放同步跑完，重放之间让出主线程。
   */

  const NR_STEP_MAX = 4000;   // 一章打到馆主实测几百步；超过就当没分出胜负
  const NR_DROP = ['status', 'confused', 'sleep', 'toxic', 'lost', 'missed', 'hp'];
  const nrClone = (x) => (x == null ? x : (PAGE_WIN.structuredClone || structuredClone)(x));

  /** 准备某章的重放底稿；拿不到接口、章节没有馆主时返回 null */
  function nrPlanChapter(ch) {
    if (!nsOk()) return null;
    const ns = NS(), G = ns.Game, save = G.S;
    const chap = ns.STORY.CHAPTERS[ch];
    if (!save || !save.adv || !chap || !chap.steps.some((s) => s.kind === 'gym')) return null;
    // 只带战斗要用的：图鉴、钱等大字段不拷，每次重放少克隆一大块
    const base = nrClone({ ...G.freshState(), ...pick(save, ['trainer', 'link', 'buffs', 'items']) });
    const adv = nrClone(save.adv);
    Object.assign(adv, {
      chapter: ch, unlocked: Math.max(adv.unlocked | 0, ch), nodes: [], node: 0, battle: null, pending: null,
      event: null, zone: null, tower: null, league: null, loops: [], kept: {}, paidLeaders: {},
      capture: { ...(adv.capture || {}), on: false },
    });
    base.adv = adv;
    return { ch, base, save, name: chap.name };
  }
  function pick(o, keys) {
    const r = {};
    for (const k of keys) if (o[k] !== undefined) r[k] = o[k];
    return r;
  }

  /**
   * 跑一次。lineup：存档里的宝可梦对象（可以是改过等级的拷贝）。
   * 返回 { win, arrive（进馆时全队剩余血量比例）, lostTo（输给的宝可梦 id）, lostAt（'road' | 'gym'）, steps }
   */
  function nrRun(plan, lineup, seed = 1) {
    const ns = NS(), G = ns.Game, A = ns.Adventure;
    if (G.inSandbox()) return null;
    const t0 = performance.now();
    try { return nrRunInner(plan, lineup, seed, G, A); } finally { perfAdd(PERF.nr, performance.now() - t0); }
  }
  function nrRunInner(plan, lineup, seed, G, A) {
    const state = nrClone(plan.base);
    state.mons = lineup.map((m) => {
      const c = nrClone(m);
      for (const k of NR_DROP) delete c[k];
      return c;
    });
    const uids = state.mons.map((m) => m.uid);
    state.team = uids.slice();
    state.road = uids.slice();
    state.eventTeams = {};
    const M = PAGE_WIN.Math, rand = M.random;
    const WON = { t: 'won' }, LOST = { t: 'lost' };
    const out = { win: false, arrive: null, lostTo: null, lostAt: null, steps: 0, seeded: nrSeedable() };
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
        A.buildChapter(plan.ch, true);
        let battle = adv.battle, gym = null;
        const armGym = (b) => {
          gym = b;
          out.arrive = hpFrac();
          const foes = b.enemies || [];
          for (const e of foes) {
            let hp = e.hp;
            Object.defineProperty(e, 'hp', {
              enumerable: true, configurable: true, get: () => hp,
              set(v) { hp = v; if (v <= 0 && foes.every((x) => x.hp <= 0)) throw WON; },
            });
          }
        };
        Object.defineProperty(adv, 'battle', {
          enumerable: true, configurable: true, get: () => battle,
          set(v) {
            if (!v && battle && !G.teamMons().some((m) => G.curHp(m) > 0)) {
              const foe = (battle.enemies || []).find((e) => e.hp > 0) || (battle.enemies || [])[0];
              out.lostTo = foe ? foe.id : null;
              out.lostAt = battle === gym ? 'gym' : 'road';
              throw LOST;
            }
            if (!v && battle && battle === gym) throw WON;   // 馆主让路（已击败过）也算过
            battle = v;
            if (v && v.kind === 'gym' && v !== gym) armGym(v);
          },
        });
        let stuck = 0, lastNode = -1;
        for (; out.steps < NR_STEP_MAX; out.steps++) {
          A.step();
          if (adv.pending) {
            if (adv.node === lastNode && ++stuck > 3) { adv.pending = null; adv.node++; stuck = 0; }
          } else stuck = 0;
          lastNode = adv.node;
          if (adv.node >= (adv.nodes || []).length) break;
        }
      });
    } catch (e) {
      if (e === WON) out.win = true;
      else if (e !== LOST) { out.error = String((e && e.message) || e); }
    } finally {
      if (out.seeded) M.random = rand;
    }
    return out;
  }

  /** 新版游戏把 Math 冻结了（防改随机数）：这时不固定种子，按游戏自己的随机数多跑几次取平均，不去绕过 */
  function nrSeedable() {
    const d = Object.getOwnPropertyDescriptor(PAGE_WIN.Math, 'random');
    return !!d && d.writable && !Object.isFrozen(PAGE_WIN.Math);
  }

  /** 让出一帧：页面可见时等下一次绘制；真在后台时没有画面要护，只让出事件循环 */
  const nrFrame = () => new Promise((r) => {
    if (isRealHidden()) { setTimeout(r, 0); return; }
    let done = false;
    const go = () => { if (!done) { done = true; setTimeout(r, 0); } };
    try { PAGE_WIN.requestAnimationFrame(go); } catch { /* 忽略 */ }
    setTimeout(go, 50);
  });
  const nrSleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * 重放之间的节奏。full（配队页，玩家在等）：每次之后让一帧；
   * bg（后台）：休息不少于这次重放的耗时（占用不到一半），玩家正在操作时等他停手。
   */
  async function nrPace(pace, lastMs) {
    if (pace !== 'bg') return nrFrame();
    await nrSleep(Math.max(40, lastMs * 1.2));
    for (let i = 0; i < 60 && userBusy(2000); i++) await nrSleep(500);
  }

  /**
   * 多次重放取平均。opts = { runs, seed, deadline（performance.now 截止）, valid(), pace }
   * 返回 { win, arrive, lostTo: {id: 次数}, roadLoss, runs, errors }；存档变了或超时就提前停。
   */
  async function nrEval(plan, lineup, opts = {}) {
    const runs = opts.runs || 16, seed0 = opts.seed || 7;
    const res = { win: 0, arrive: 0, lostTo: {}, roadLoss: 0, runs: 0, errors: 0, error: null };
    let wins = 0, arr = 0, arrN = 0;
    for (let i = 0; i < runs; i++) {
      if (opts.deadline && performance.now() > opts.deadline && res.runs >= 4) break;
      if (opts.valid && !opts.valid()) { res.error = '存档变了'; break; }
      const t0 = performance.now();
      const r = nrRun(plan, lineup, seed0 + i * 7919);
      const ms = performance.now() - t0;
      if (!r) { res.error = '游戏正处于沙盒中'; break; }
      if (r.error) { res.errors++; res.error = r.error; if (res.errors >= 3) break; await nrPace(opts.pace, ms); continue; }
      res.runs++;
      if (r.win) wins++;
      else if (r.lostTo != null) {
        res.lostTo[r.lostTo] = (res.lostTo[r.lostTo] || 0) + 1;
        if (r.lostAt === 'road') res.roadLoss++;
      }
      if (r.arrive != null) { arr += r.arrive; arrN++; }
      await nrPace(opts.pace, ms);
    }
    res.win = res.runs ? wins / res.runs : 0;
    res.arrive = arrN ? arr / arrN : null;
    return res;
  }

  /** 按 uid 从内存存档里取宝可梦（拿不到接口时用 localStorage 解析的） */
  function nrMons(uids) {
    const save = liveSave() || S.save || {};
    const by = new Map((save.mons || []).map((m) => [String(m.uid), m]));
    return uids.map((u) => by.get(String(u))).filter(Boolean);
  }
