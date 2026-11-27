  /* ====================== 配队引擎：按目标模拟对战，挑出胜率最高的 6 只 ====================== */
  /*
   * 目标（target）：
   *   gym    下一道馆（本地区下一个有馆主的章节）
   *   league 整个联盟（各间连打，输了从第 1 间重来；冠军权重更高）
   *   zone   当前区域的野怪（读右侧「此处出没」）；只在配队页点「刷级稳定度」时算
   *   auto   推进目标：联盟章节用 league，否则 gym（配队页和后台都用它）
   * 锁定的队员与练级新人永远在队里；其余位置先贪心、再逐个替换改进。
   */

  const TEAM_KEY = 'pcauto.team.v4';
  const EVO = (__DATA__.evo && __DATA__.evo.evo) || {};
  const EVO_ITEMS = (__DATA__.evo && __DATA__.evo.items) || {};
  function taMonName(mon) {
    return TA_NAME[mon.id - 1] || `#${mon.id}`;
  }
  const typesCn = (id) => ((BT_DEX[id] || {}).types || []).map((x) => TA_TYPE_CN[TA_TYPES[x]] || '').join('/');

  /* ---------- 锁定与练级新人 ---------- */

  function teamPrefs() {
    if (!S.teamPrefs) {
      const p = safeParse(lsGet(TEAM_KEY), null) || safeParse(storeGet(TEAM_KEY, null), null) || {};
      S.teamPrefs = { pins: Array.isArray(p.pins) ? p.pins.map(String) : [], trainee: p.trainee != null ? String(p.trainee) : null,
        coreOff: Array.isArray(p.coreOff) ? p.coreOff.map(String) : [] };
    }
    return S.teamPrefs;
  }
  function saveTeamPrefs() {
    lsSet(TEAM_KEY, JSON.stringify(teamPrefs()));
    storeSet(TEAM_KEY, JSON.stringify(teamPrefs()));
    S.teamPlanSig = {};
  }
  function togglePin(uid) {
    const p = teamPrefs();
    uid = String(uid);
    p.pins = p.pins.includes(uid) ? p.pins.filter((u) => u !== uid) : [...p.pins, uid].slice(-5);
    saveTeamPrefs();
  }
  function setTrainee(uid) {
    const p = teamPrefs();
    p.trainee = uid == null || p.trainee === String(uid) ? null : String(uid);
    saveTeamPrefs();
  }

  /** 核心等级位：现队里等级最高的几只自动算核心（玩家可以逐只取消） */
  const TEAM_CORE_TOP = 4;
  /** 推荐和卡关补位最多改动的非核心位置数 */
  const TEAM_MAX_SWAPS = 2;
  /** 新推荐要比旧推荐（或现队）高出这么多分才替换，免得每次重算都变 */
  const TEAM_STICKY = 0.05;

  /**
   * 核心队员（永远不会被自动换下）：锁定 + 练级新人 + 开了保护时的现役异色/传说
   * + 现队等级前 4 名（玩家取消过的除外）。返回 [{ uid, why }]。
   */
  function teamCoreInfo(save, pool) {
    const p = teamPrefs();
    const byUid = new Map(pool.map((m) => [String(m.uid), m]));
    const team = (save.team || []).map(String).filter((u) => byUid.has(u));
    const out = [];
    const add = (u, why) => { if (byUid.has(u) && !out.some((x) => x.uid === u)) out.push({ uid: u, why }); };
    for (const u of p.pins) add(u, '锁定');
    if (p.trainee) add(p.trainee, '练级新人');
    if (S.cfg.autoTeamProtect) for (const u of team) if (monProtected(byUid.get(u))) add(u, byUid.get(u).shiny ? '异色' : '传说级');
    const off = new Set(p.coreOff || []);
    team.filter((u) => !off.has(u)).sort((a, b) => (byUid.get(b).level || 1) - (byUid.get(a).level || 1))
      .slice(0, TEAM_CORE_TOP).forEach((u) => add(u, '主力'));
    return out.slice(0, 6);
  }
  /** 固定在队里的 uid：就是核心队员 */
  function teamFixed(save, pool) {
    return teamCoreInfo(save, pool).map((x) => x.uid);
  }
  /** 取消 / 恢复某只的「主力」核心身份（锁定、新人、异色传说不受影响） */
  function toggleCore(uid) {
    const p = teamPrefs();
    uid = String(uid);
    p.coreOff = (p.coreOff || []).includes(uid) ? p.coreOff.filter((u) => u !== uid) : [...(p.coreOff || []), uid].slice(-12);
    saveTeamPrefs();
  }

  /** 新阵容相对现队换下了几只（现队有空位时，补空位不算） */
  function teamSwapCount(curUids, uids) {
    const now = new Set(uids.map(String));
    return curUids.filter((u) => !now.has(String(u))).length;
  }

  /**
   * 把推荐限制在最多 maxSwaps 处改动：从现队出发，先补空位，再贪心地做收益最大的单个替换。
   * score(list) 越大越好。
   */
  async function teamLimitSwaps(curMons, bestMons, fixed, maxSwaps, score) {
    const curU = curMons.map((m) => String(m.uid));
    if (teamSwapCount(curU, bestMons.map((m) => String(m.uid))) <= maxSwaps) return bestMons;
    const fixedSet = new Set(fixed);
    const ins = bestMons.filter((m) => !curU.includes(String(m.uid)));
    const trial = curMons.slice();
    for (const f of fixed) if (!trial.some((m) => String(m.uid) === f)) {
      const m = bestMons.find((x) => String(x.uid) === f);
      if (!m) continue;
      if (trial.length < 6) { trial.push(m); continue; }
      // 锁定了 PC 里的宝可梦：顶掉等级最低的非核心队员
      const outs = trial.map((x, i) => [x, i]).filter(([x]) => !fixedSet.has(String(x.uid))).sort((a, b) => (a[0].level || 1) - (b[0].level || 1));
      if (outs.length) trial[outs[0][1]] = m;
    }
    while (trial.length < Math.min(6, bestMons.length)) {
      let pick = null, bs = -Infinity;
      for (const m of ins) {
        if (trial.includes(m)) continue;
        const s = score([...trial, m]);
        if (s > bs) { bs = s; pick = m; }
      }
      if (!pick) break;
      trial.push(pick);
      await idle();
    }
    let cur = score(trial);
    for (let n = 0; n < maxSwaps; n++) {
      let bestTry = null, bs = cur + 0.004;
      for (let i = 0; i < trial.length; i++) {
        if (fixedSet.has(String(trial[i].uid)) || !curU.includes(String(trial[i].uid))) continue;
        for (const m of ins) {
          if (trial.includes(m)) continue;
          const t = trial.slice();
          t[i] = m;
          const s = score(t);
          if (s > bs) { bs = s; bestTry = t; }
        }
        await idle();
      }
      if (!bestTry) break;
      trial.splice(0, trial.length, ...bestTry);
      cur = bs;
    }
    return trial;
  }

  /* ---------- 目标 ---------- */

  /** 当前区域敌人池：读右侧「此处出没」格子（图鉴号、等级区间、出现率） */
  function taEnemyPool() {
    const pool = [];
    for (const cell of $$('.zone-cell[data-id]')) {
      const id = +cell.dataset.id;
      if (!id || !btKnown(id)) continue;
      const title = cell.getAttribute('title') || '';
      const lm = title.match(/Lv\.(\d+)\s*[-–]\s*(\d+)/);
      const lv = lm ? Math.round((+lm[1] + +lm[2]) / 2) : 5;
      const pm = (cell.innerText || '').match(/(\d+)%/);
      pool.push({ id, level: lv, w: Math.max(0.02, pm ? +pm[1] / 100 : 0.1) });
    }
    return pool;
  }

  function gymRoom(c) {
    const g = c.g;
    const hm = btGymHpMul(g.pw, g.team.length);
    return {
      ch: c.c, name: c.lg ? `第 ${c.room} 间 · ${g.l}` : `${g.l}（${c.n}）`, short: g.l, champ: !!g.champ,
      ids: g.team, kind: 'gym', dmgMul: btFoeDmgMul('gym', g.pw), w: g.champ ? 1.5 : 1,
      foes: g.team.map(([id, level]) => btUnit({ id, level }, { foe: true, hpMult: hm })).filter(Boolean),
    };
  }

  /** 解析目标 → { key, label, kind, rooms } */
  function teamTarget(key, f) {
    if (!f) return null;
    const leagueChs = CH.filter((c) => c.lg && c.r === f.region && c.g);
    const gymC = f.gymCh >= 0 ? CH[f.gymCh] : null;
    if (key === 'auto') key = (gymC && gymC.lg) || (f.cur && f.cur.lg) ? 'league' : 'gym';
    if (key === 'league') {
      if (!leagueChs.length) return null;
      return { key, label: `${f.regionZh}联盟（${leagueChs.length} 间）`, kind: 'gym', region: f.region, rooms: leagueChs.map(gymRoom) };
    }
    if (key === 'gym') {
      if (!gymC || !gymC.g) return null;
      return { key, label: gymC.lg ? `联盟第 ${gymC.room} 间 · ${gymC.g.l}` : `道馆 · ${gymC.g.l}`, kind: 'gym', rooms: [gymRoom(gymC)] };
    }
    if (key === 'zone') {
      const pool = taEnemyPool();
      if (!pool.length) return null;
      return {
        key, label: '当前区域野怪', kind: 'wild',
        rooms: pool.map((e) => ({ name: `${TA_NAME[e.id - 1] || e.id} Lv.${e.level}`, short: TA_NAME[e.id - 1] || String(e.id), ids: [[e.id, e.level]], kind: 'wild', dmgMul: btFoeDmgMul('wild'), w: e.w, foes: [btUnit({ id: e.id, level: e.level }, { foe: true })] })),
      };
    }
    return null;
  }

  /** 候选池：本地区能上场、图鉴有数据的宝可梦 */
  function teamPool(save, region) {
    return (save.mons || []).filter((m) => m && m.id && btKnown(m.id) && (!m.reg || m.reg === region));
  }

  /* ---------- 评估 ---------- */

  /**
   * 一支队伍对目标的表现。score 用于比较（胜率为主，打倒比例为辅），clear = 通关率。
   * 联盟按各间独立估算：每间前有宝可梦中心回满，道中训练师未计入。
   */
  function teamEval(units, tgt, runs = 40, seed = 11) {
    if (!units.length) return { score: 0, clear: 0, rooms: tgt.rooms.map(() => ({ win: 0, ko: 0, lostTo: [] })) };
    let sum = 0, wsum = 0, clear = 1, wwin = 0;
    const rooms = [];
    for (const r of tgt.rooms) {
      const res = btSim(units, r.foes, { kind: r.kind, dmgMul: r.dmgMul }, runs, seed);
      rooms.push(res);
      const s = tgt.kind === 'wild' ? res.win - 0.5 * (1 - res.myHp) - 0.005 * res.turns : res.win + 0.35 * res.ko;
      sum += r.w * s; wsum += r.w;
      clear *= res.win; wwin += r.w * res.win;
    }
    return { score: sum / (wsum || 1), clear: tgt.kind === 'wild' ? wwin / (wsum || 1) : clear, rooms };
  }

  const idle = () => new Promise((r) => setTimeout(r, 0));
  function unitCache() {
    const map = new Map();
    return (m, lv) => {
      const k = `${m.uid}|${lv || m.level}|${m.id}|${(m.ban || []).join(',')}`;
      let u = map.get(k);
      if (!u) { u = btUnit(lv ? { ...m, level: lv } : m); map.set(k, u); }
      return u;
    };
  }

  /**
   * 搜索最优阵容：固定的先放；其余从预筛后的候选里贪心加入，再逐个位置尝试替换。
   * opts = { fixed, size, runs, levelAt }（levelAt：把候选按某等级评估，用于「升到上限后」）
   */
  async function teamSearch(tgt, pool, opts = {}) {
    const unit = opts.unit || unitCache();
    const lvOf = (m) => (opts.levelAt ? Math.max(m.level || 1, opts.levelAt) : m.level || 1);
    const U = (m) => unit(m, lvOf(m));
    const size = opts.size || 6, runs = opts.runs || 30;
    const byUid = new Map(pool.map((m) => [String(m.uid), m]));
    const fixed = (opts.fixed || []).filter((u) => byUid.has(u));
    // 预筛：单只对目标的表现，同一物种最多留 2 只
    const pre = [];
    for (let i = 0; i < pool.length; i++) {
      const m = pool[i];
      if (fixed.includes(String(m.uid))) continue;
      pre.push({ m, s: teamEval([U(m)], tgt, 8, 5).score });
      if (i % 25 === 24) await idle();
    }
    pre.sort((a, b) => b.s - a.s);
    const perId = {};
    const short = [];
    for (const p of pre) {
      if ((perId[p.m.id] = (perId[p.m.id] || 0) + 1) > 2) continue;
      short.push(p.m);
      if (short.length >= (opts.width || 18)) break;
    }
    const chosen = fixed.map((u) => byUid.get(u));
    const score = (list) => teamEval(list.map(U), tgt, runs, 17).score;
    let cur = chosen.length ? score(chosen) : 0;
    while (chosen.length < size) {
      let best = null, bs = -Infinity;
      for (const m of short) {
        if (chosen.includes(m)) continue;
        const s = score([...chosen, m]);
        if (s > bs) { bs = s; best = m; }
        await idle();
      }
      if (!best) break;
      chosen.push(best);
      cur = bs;
    }
    for (let i = fixed.length; i < chosen.length; i++) {
      for (const m of short.slice(0, 12)) {
        if (chosen.includes(m)) continue;
        const trial = chosen.slice();
        trial[i] = m;
        const s = score(trial);
        if (s > cur + 0.004) { chosen[i] = m; cur = s; }
        await idle();
      }
    }
    return { mons: chosen, pre, short };
  }

  /* ---------- 原生复核：用游戏原版战斗重放挑最终阵容 ---------- */

  /** 道馆目标每间一份重放底稿；联盟目标优先用一份整轮连打的底稿（069）；不支持时返回 null */
  function teamNativePlans(tgt) {
    if (!nsOk() || tgt.kind !== 'gym') return null;
    if (tgt.key === 'league' && tgt.region) {
      const lp = nrPlanLeague(tgt.region, 0);
      if (lp && lp.course.length === tgt.rooms.length && lp.course.every((s, i) => s.ch === tgt.rooms[i].ch)) return [lp];
    }
    const plans = tgt.rooms.map((r) => nrPlanChapter(r.ch));
    return plans.every(Boolean) ? plans : null;
  }

  /** 一支阵容按原版战斗的表现：各间胜率、进馆剩余血量、输给谁 */
  async function teamNativeEval(plans, tgt, mons, runs, deadline, pace = 'full') {
    const live = [];
    for (const m of mons) {
      const lm = nrMons([m.uid])[0];
      if (!lm) return { error: '内存存档里找不到队员' };
      let x = m._lv ? { ...lm, level: Math.max(lm.level || 1, m._lv) } : lm;
      if (m._ban) x = { ...x, ban: m._ban.slice() };
      live.push(x);
    }
    const valid = () => liveSave() === plans[0].save;
    if (plans[0].kind === 'league') {
      const r = await nrEvalLeague(plans[0], live, { runs, seed: 101, deadline, valid, pace });
      return r.error && !r.runs ? { error: r.error } : { clear: r.clear, score: r.score, rooms: r.rooms, runs: r.runs };
    }
    const rooms = [];
    let clear = 1, sum = 0, wsum = 0, n = 0;
    for (let i = 0; i < plans.length; i++) {
      const r = await nrEval(plans[i], live, { runs, seed: 101 + i, deadline, valid, pace });
      if (r.error && !r.runs) return { error: r.error };
      rooms.push(r);
      n = Math.max(n, r.runs);
      clear *= r.win;
      sum += tgt.rooms[i].w * r.win; wsum += tgt.rooms[i].w;
    }
    return { clear, score: sum / (wsum || 1), rooms, runs: n };
  }

  /**
   * 候选阵容：模型推荐、现队、以及把推荐队每个非固定位置换成预筛靠前者的变体。
   * 先每套少量重放粗筛，再把前两名和现队各跑多次定胜负。
   * 后台档：最多 6 套 × 4 次、决赛 16 次，重放之间留出空闲（见 nrEval 的 pace）。
   */
  async function teamNativePick(tgt, curMons, bestMons, search, fixed, tier = 'full', prevMons = null) {
    const plans = teamNativePlans(tgt);
    if (!plans) return null;
    const bg = tier === 'bg';
    const maxCands = bg ? 6 : 10, quick = bg ? 4 : 6, final = bg ? 16 : 32;
    const t0 = performance.now(), deadline = t0 + (bg ? 60000 : 25000);
    const key = (l) => l.map((m) => String(m.uid)).sort().join(',');
    const curU = curMons.map((m) => String(m.uid));
    const cands = [], seen = new Set();
    const add = (l, tag) => {
      const k = key(l);
      if (!l.length || seen.has(k)) return;
      if (tag !== 'cur' && curMons.length >= 6 && teamSwapCount(curU, l.map((m) => String(m.uid))) > TEAM_MAX_SWAPS) return;
      seen.add(k);
      cands.push({ mons: l, tag });
    };
    add(bestMons, 'best');
    add(curMons, 'cur');
    if (prevMons) add(prevMons, 'prev');
    const fixedSet = new Set(fixed);
    for (const alt of search.short.filter((m) => !bestMons.includes(m)).slice(0, 4)) {
      for (let i = 0; i < bestMons.length && cands.length < maxCands; i++) {
        if (fixedSet.has(String(bestMons[i].uid)) || bestMons[i].id === alt.id) continue;
        const trial = bestMons.slice();
        trial[i] = alt;
        add(trial, 'alt');
      }
    }
    for (const c of cands) {
      c.r = await teamNativeEval(plans, tgt, c.mons, quick, deadline, tier);
      if (c.r.error) return { error: c.r.error };
    }
    cands.sort((a, b) => b.r.score - a.r.score);
    const finals = cands.slice(0, 2);
    const curC = cands.find((c) => c.tag === 'cur');
    if (curC && !finals.includes(curC)) finals.push(curC);
    const prevC = cands.find((c) => c.tag === 'prev');
    if (prevC && !finals.includes(prevC)) finals.push(prevC);
    for (const c of finals) {
      c.r = await teamNativeEval(plans, tgt, c.mons, final, deadline + (bg ? 30000 : 10000), tier);
      if (c.r.error) return { error: c.r.error };
    }
    finals.sort((a, b) => b.r.score - a.r.score);
    let top = finals[0];
    if (prevC && top !== prevC && top !== curC && top.r.score < prevC.r.score + TEAM_STICKY) top = prevC;
    return { plans, top, cur: curC || null, tried: cands.length, ms: Math.round(performance.now() - t0) };
  }

  /* ---------- 配招建议 ---------- */

  const LOADOUT_DOT = new Set(['poison', 'toxic', 'burn']);

  /**
   * 针对一组敌人属性给出要禁用的招式（mon.ban 的格式：招式 key 数组）。
   * 规则：留下威力 ≥ 70 的本系招；再按「对每个敌人的最好一击」贪心补最多 3 个攻击招；
   * 其余攻击招禁用；变化招全禁，打首领时持续伤害类（中毒 / 剧毒 / 灼伤）保留。
   * 返回 { ban, keep } 或 null（招式太少、没必要禁）。
   */
  function loadoutFor(m, foeTypes, boss) {
    const d = BT_DEX[m.id];
    if (!d) return null;
    const seen = new Set(), atk = [], status = [];
    for (const [lv, key] of d.learn) {
      if (lv > (m.level || 1) || seen.has(key)) continue;
      seen.add(key);
      if (BT_MV[key] && BT_MV[key].p > 0) atk.push(BT_MV[key]);
      else if (BT.st[key]) status.push(key);
    }
    if (atk.length <= 1) return null;
    const st = btStats({ id: m.id, level: m.level || 1, rank: m.rank || 0, shiny: !!m.shiny });
    const val = (mv, types) => mv.p * (mv.acc || 100) / 100 * (mv.phys ? st.atk : st.spa) * (d.types.includes(mv.t) ? 1.5 : 1) * btEff(mv.t, types);
    const keep = atk.filter((mv) => d.types.includes(mv.t) && mv.p >= 70);
    const bestOf = (list) => foeTypes.reduce((s, types) => s + Math.max(0, ...list.map((mv) => val(mv, types))), 0);
    for (let n = 0; n < 3; n++) {
      let pick = null, gain = 0;
      const base = bestOf(keep);
      for (const mv of atk) {
        if (keep.includes(mv)) continue;
        const g = bestOf([...keep, mv]) - base;
        if (g > gain + 1e-9) { gain = g; pick = mv; }
      }
      if (!pick || (keep.length && gain < base * 0.03)) break;
      keep.push(pick);
    }
    if (!keep.length) return null;
    const keepKeys = new Set(keep.map((mv) => mv.key));
    const ban = [
      ...atk.filter((mv) => !keepKeys.has(mv.key)).map((mv) => mv.key),
      ...status.filter((k) => !(boss && LOADOUT_DOT.has(BT.st[k][0]))),
    ];
    return ban.length ? { ban: [...new Set(ban)].sort(), keep: [...keepKeys] } : null;
  }

  /** 推荐配招对现阵容的影响（原版重放）：只在通关率提升时给出 */
  async function teamNativeLoadout(plans, tgt, mons) {
    const adv = await banAdvise(mons, tgt.rooms, { yield: idle });
    if (!adv) return { none: true, sug: [] };
    const sug = adv.sug;
    const by = new Map(sug.map((s) => [s.uid, s]));
    const deadline = performance.now() + 15000;
    const now0 = await teamNativeEval(plans, tgt, mons, 24, deadline);
    const trial = await teamNativeEval(plans, tgt, mons.map((m) => (by.has(String(m.uid)) ? { ...m, _ban: by.get(String(m.uid)).ban } : m)), 24, deadline);
    if (now0.error || trial.error) return null;
    return { sug, before: now0.clear, after: trial.clear, better: trial.clear >= now0.clear + 0.04, model: { before: adv.before, after: adv.after } };
  }

  /** 原生重放下「差多少」：全队 +5 / +10 级（不超过上限）后的通关率 */
  async function teamNativeWhatIf(plans, tgt, mons, cap) {
    const out = [];
    const deadline = performance.now() + 12000;
    for (const add of [5, 10]) {
      const lv = (m) => Math.min(cap, (m.level || 1) + add);
      if (mons.every((m) => lv(m) === (m.level || 1))) continue;
      const r = await teamNativeEval(plans, tgt, mons.map((m) => ({ ...m, _lv: lv(m) })), 16, deadline);
      if (r.error) break;
      out.push({ add, clear: r.clear, arrive: r.rooms[0] && r.rooms[0].arrive });
    }
    return out;
  }

  /** 每个队员对每个敌人的 1 对 1 胜率，以及游戏会派谁上（自动换人打分最高者） */
  function teamMatrix(units, tgt) {
    return tgt.rooms.map((r) => ({
      name: r.name, short: r.short,
      cols: r.foes.map((f, j) => {
        let sent = -1, bs = -Infinity;
        units.forEach((u, i) => { const s = btSwitchScore(u, f) - i * 1e-6; if (s > bs) { bs = s; sent = i; } });
        return {
          id: r.ids[j][0], lv: r.ids[j][1], sent,
          cells: units.map((u) => btSim([u], [f], { kind: r.kind, dmgMul: r.dmgMul }, 24, 3).win),
        };
      }),
    }));
  }

  /** 全队升到 lv（不低于现有等级）后的表现 */
  function teamAtLevel(mons, tgt, lv, unit, runs = 120) {
    return teamEval(mons.map((m) => unit(m, Math.max(m.level || 1, lv))), tgt, runs, 23);
  }

  /** 至少练到几级，通关率才能达到 goal（二分；升满也不够返回 null） */
  async function teamLevelNeeded(mons, tgt, from, cap, unit, goal = 0.6) {
    if (teamAtLevel(mons, tgt, cap, unit, 80).clear < goal) return null;
    await idle();
    let lo = Math.max(1, from), hi = cap;
    if (teamAtLevel(mons, tgt, lo, unit, 80).clear >= goal) return lo;
    while (hi - lo > 1) {
      await idle();
      const mid = (lo + hi) >> 1;
      if (teamAtLevel(mons, tgt, mid, unit, 80).clear >= goal) hi = mid; else lo = mid;
    }
    return hi;
  }

  /** 道具进化：背包里有道具、进化后图鉴有数据的队员与候选 */
  function evoOptions(mons, items) {
    const out = [];
    for (const m of mons) {
      for (const [to, item] of EVO[m.id] || []) {
        if ((items[item] || 0) <= 0 || !btKnown(to)) continue;
        out.push({ uid: String(m.uid), m, to, item, itemZh: EVO_ITEMS[item] || item, have: items[item] });
      }
    }
    return out;
  }

  /* ---------- 方案（缓存 + 后台计算） ---------- */

  /**
   * 方案签名：只放会改变结论的东西。等级按 5 级分档，候选池只看等级最高的 18 只，
   * 挂机时每升一级、每抓一只低级宝可梦都不会触发重算。「此处出没」只有刷级稳定度（zone）用。
   */
  function teamSig(save, key) {
    const p = teamPrefs();
    const team = new Set((save.team || []).map(String));
    const lv = (m) => ((m.level || 1) / 5) | 0;
    const ban = (m) => (m.ban && m.ban.length ? ':' + m.ban.join('/') : '');
    const top = (save.mons || []).filter((m) => m && !team.has(String(m.uid))).sort((a, b) => (b.level || 0) - (a.level || 0)).slice(0, 18);
    const mons = [...(save.mons || []).filter((m) => m && team.has(String(m.uid))), ...top].map((m) => `${m.uid}:${m.id}:${lv(m)}${ban(m)}`).join(',');
    const zone = key === 'zone' ? taEnemyPool().map((e) => e.id + ':' + e.level).join(',') : '';
    let h = 0;
    const s = `${key}|${save.adv && save.adv.unlocked}|${[...team].sort().join(',')}|${p.pins.join(',')}|${p.trainee}|${zone}|${mons}`;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return h;
  }

  /**
   * 算一份完整方案。返回：
   * { key, label, cur, best, bestUids, matrix, cap, atCap, needLv, trainee, evo, verdict }
   */
  async function teamPlanCompute(key, tier = 'full') {
    const bg = tier === 'bg';
    const save = S.save;
    const f = facts(save);
    const tgt = teamTarget(key, f);
    if (!tgt) return { key, error: key === 'zone' ? '读不到「此处出没」：先回到冒险界面' : '本地区没有可用的道馆数据' };
    const pool = teamPool(save, f.region);
    if (!pool.length) return { key, error: '没有可上场的宝可梦' };
    const unit = unitCache();
    const byUid = new Map(pool.map((m) => [String(m.uid), m]));
    const curMons = (save.team || []).map((u) => byUid.get(String(u))).filter(Boolean);
    const fixed = teamFixed(save, pool);
    const search = await teamSearch(tgt, pool, bg ? { fixed, unit, runs: 16, width: 12 } : { fixed, unit });
    const U = (list) => list.map((m) => unit(m));
    const quickScore = (list) => teamEval(U(list), tgt, bg ? 16 : 30, 17).score;
    // 核心队员不动，其余最多改 2 处
    let bestMons = await teamLimitSwaps(curMons, search.mons, fixed, TEAM_MAX_SWAPS, quickScore);
    // 上一次的推荐还成立、新推荐又没高出 5 分时沿用上一次的，免得推荐来回变
    const prevPlan = S.teamPlans && S.teamPlans[key];
    let prevMons = prevPlan && !prevPlan.error && !prevPlan.keep && prevPlan.best ? prevPlan.best.uids.map((u) => byUid.get(u)) : null;
    if (prevMons && (prevMons.some((m) => !m) || fixed.some((u) => !prevPlan.best.uids.includes(u))
        || (curMons.length >= 6 && teamSwapCount(curMons.map((m) => String(m.uid)), prevPlan.best.uids) > TEAM_MAX_SWAPS))) prevMons = null;
    let cur = teamEval(U(curMons), tgt, bg ? 80 : 200, 29);
    await idle();
    let best = teamEval(U(bestMons), tgt, bg ? 80 : 200, 29);
    const setKey = (l) => l.map((m) => String(m.uid)).sort().join(',');
    if (prevMons && setKey(prevMons) !== setKey(bestMons)) {
      const prev = teamEval(U(prevMons), tgt, bg ? 80 : 200, 29);
      if (best.score < prev.score + TEAM_STICKY) { bestMons = prevMons; best = prev; }
    }
    const model = { cur: cur.clear, best: best.clear };
    // 推荐要比现队高出 5 分才算值得换
    let keep = best.score <= cur.score + TEAM_STICKY && curMons.length >= Math.min(6, pool.length);
    let useMons = keep ? curMons : bestMons;
    let engine = 'model', native = null;
    if (tgt.kind === 'gym' && nsOk()) {
      try {
        const np = await teamNativePick(tgt, curMons, bestMons, search, fixed, tier, prevMons);
        if (np && !np.error && np.top) {
          const toRooms = (r) => r.rooms.map((x, i) => {
            const top = Object.entries(x.lostTo).sort((a, b) => b[1] - a[1])[0];
            return { win: x.win, arrive: x.arrive, reached: x.reached, roadLoss: x.runs ? x.roadLoss / x.runs : 0, topLost: top ? +top[0] : null,
              lostTo: tgt.rooms[i].ids.map(([id]) => x.lostTo[id] || 0) };
          });
          const nCur = np.cur, nTop = np.top;
          keep = !!nCur && (nTop === nCur || nTop.r.score <= nCur.r.score + TEAM_STICKY) && curMons.length >= Math.min(6, pool.length);
          const bestPick = keep ? nCur : nTop;
          useMons = bestPick.mons;
          bestMons = nTop.mons;
          cur = nCur ? { score: nCur.r.score, clear: nCur.r.clear, rooms: toRooms(nCur.r) } : { score: 0, clear: 0, rooms: tgt.rooms.map((r) => ({ win: 0, lostTo: r.ids.map(() => 0) })) };
          best = { score: nTop.r.score, clear: nTop.r.clear, rooms: toRooms(nTop.r) };
          engine = 'native';
          native = { runs: bestPick.r.runs, tried: np.tried, ms: np.ms, plans: np.plans, league: np.plans[0].kind === 'league' };
        } else if (np && np.error) native = { error: np.error };
      } catch (e) { native = { error: String((e && e.message) || e) }; }
    }
    const use = keep ? cur : best;
    await idle();
    // 后台档只算结论要用的：单挑表、练级新人、进化、再升几级、配招都留给配队页的完整档
    const matrix = bg ? [] : teamMatrix(U(useMons), tgt);
    await idle();
    const cap = Math.max(f.cap || 1, ...useMons.map((m) => m.level || 1));
    const atCap = tgt.kind === 'wild' ? use : teamAtLevel(useMons, tgt, cap, unit, bg ? 40 : 150);
    await idle();
    const minLv = Math.min(...useMons.map((m) => m.level || 1));
    const needLv = tgt.kind === 'wild' || use.clear >= 0.6 || (bg && engine === 'native') ? null : await teamLevelNeeded(useMons, tgt, minLv, cap, unit);
    await idle();
    // 练级新人：现队升到上限后，换进哪只（也升到上限）提升最大
    let trainee = null;
    const prefs = teamPrefs();
    if (tgt.kind !== 'wild' && !prefs.trainee && !bg) {
      const inTeam = new Set(useMons.map((m) => String(m.uid)));
      const fixedSet = new Set(fixed);
      const potential = pool.filter((m) => !inTeam.has(String(m.uid)) && (m.level || 1) < cap)
        .map((m) => ({ m, s: teamEval([unit(m, cap)], tgt, 8, 5).score }))
        .sort((a, b) => b.s - a.s).slice(0, 6);
      const baseCap = teamAtLevel(useMons, tgt, cap, unit, 60);
      for (const p of potential) {
        for (let i = 0; i < useMons.length; i++) {
          if (fixedSet.has(String(useMons[i].uid))) continue;
          const trial = useMons.slice();
          trial[i] = p.m;
          const r = teamAtLevel(trial, tgt, cap, unit, 60);
          const gain = r.clear - baseCap.clear + (r.score - baseCap.score) * 0.2;
          if (gain > 0.03 && (!trainee || gain > trainee.gain)) trainee = { uid: String(p.m.uid), m: p.m, out: String(useMons[i].uid), gain, clear: r.clear };
          if (tgt.rooms.length > 1) await idle();
        }
        await idle();
      }
    }
    // 道具进化：对现队员估算进化后的变化
    const evo = bg ? [] : evoOptions([...useMons, ...search.pre.slice(0, 12).map((p) => p.m)], save.items || {});
    for (const e of evo) {
      const i = useMons.findIndex((m) => String(m.uid) === e.uid);
      if (i < 0) continue;
      const trial = useMons.slice();
      trial[i] = { ...e.m, id: e.to, uid: e.uid + '>' + e.to };
      e.delta = teamEval(U(trial), tgt, 120, 29).clear - teamEval(U(useMons), tgt, 120, 29).clear;
    }
    const pct = (x) => `${Math.round(x * 100)}%`;
    if (engine === 'native') {
      await idle();
      native.whatIf = bg ? [] : await teamNativeWhatIf(native.plans, tgt, useMons, cap);
      await idle();
      native.loadout = bg ? null : await teamNativeLoadout(native.plans, tgt, useMons);
      if (trainee) {
        const trial = useMons.map((m) => (String(m.uid) === trainee.out ? trainee.m : m)).map((m) => ({ ...m, _lv: cap }));
        const r = await teamNativeEval(native.plans, tgt, trial, 16, performance.now() + 8000);
        if (!r.error) trainee.nclear = r.clear;
      }
      const arrive = use.rooms[0] && use.rooms[0].arrive;
      native.arrive = arrive;
      delete native.plans;
    }
    let verdict;
    if (tgt.kind === 'wild') verdict = keep ? `现队对本区域野怪胜率 ${pct(cur.clear)}，不用换` : `推荐队对本区域野怪胜率 ${pct(best.clear)}（现队 ${pct(cur.clear)}）`;
    else if (use.clear >= 0.6) verdict = `${keep ? '现队' : '推荐队'}预计通关率 ${pct(use.clear)}`;
    else if (needLv != null) verdict = `${keep ? '现队' : '推荐队'}现在通关率 ${pct(use.clear)}，全队练到 Lv.${needLv} 约 60%（升到 Lv.${cap} 约 ${pct(atCap.clear)}）`;
    else verdict = `${keep ? '现队' : '推荐队'}升到 Lv.${cap} 也只有 ${pct(atCap.clear)}：需要换人或进化${trainee ? `，建议培养 ${taMonName(trainee.m)}` : ''}`;
    if (engine === 'native') {
      const who = keep ? '现队' : '推荐队';
      const wi = (native.whatIf || []).find((w) => w.clear >= 0.6);
      const r0 = use.rooms[0] || {};
      const road = tgt.rooms.length !== 1 ? ''
        : (r0.roadLoss || 0) >= 0.5 ? `，${pct(r0.roadLoss)} 的重放倒在馆主之前（路上训练家连战不回血）`
        : native.arrive != null ? `，走到馆主时平均剩 ${pct(native.arrive)} 血` : '';
      if (use.clear >= 0.6) verdict = `${who}按游戏原版战斗重放通关率 ${pct(use.clear)}${road}`;
      else if (wi) verdict = `${who}原版重放通关率 ${pct(use.clear)}${road}；全队再升 ${wi.add} 级约 ${pct(wi.clear)}`;
      else verdict = `${who}原版重放通关率 ${pct(use.clear)}${road}；${(native.whatIf || []).length ? `再升 ${native.whatIf[native.whatIf.length - 1].add} 级也只有 ${pct(native.whatIf[native.whatIf.length - 1].clear)}，` : ''}需要换人、进化或调整招式${trainee ? `，建议培养 ${taMonName(trainee.m)}` : ''}`;
    }
    return {
      key, label: tgt.label, kind: tgt.kind, at: now(), ch: save.adv.chapter | 0, keep, engine, native, model,
      rooms: tgt.rooms.map((r) => ({ name: r.name, short: r.short, ids: r.ids, champ: r.champ })),
      cur: { uids: curMons.map((m) => String(m.uid)), ...cur }, best: { uids: bestMons.map((m) => String(m.uid)), ...best },
      useUids: useMons.map((m) => String(m.uid)), matrix, cap, atCap, needLv, trainee, evo, fixed, verdict,
    };
  }

  const TEAM_BG_MIN = 15 * 60000;

  /**
   * 读缓存；需要时在后台重算，算完回调 onDone。
   * tier = 'bg'（主线推进 / 自动换队）：轻量计算，距上次结果不到 15 分钟就沿用，哪怕存档变了；
   * tier = 'full'（配队页）：完整计算，存档变了、或手上只有轻量结果时重算。
   */
  function teamPlanGet(key, onDone, force = false, tier = 'full') {
    S.teamPlans = S.teamPlans || {};
    S.teamPlanSig = S.teamPlanSig || {};
    S.teamWait = S.teamWait || {};
    const save = S.save;
    if (!save) return null;
    const sig = teamSig(save, key);
    const have = S.teamPlans[key];
    const busy = !!S.teamWait[key];
    const age = have ? now() - have.at : Infinity;
    const changed = S.teamPlanSig[key] !== sig;
    const stale = force || !have || (tier === 'bg' ? age > TEAM_BG_MIN && (changed || age > 60 * 60000)
      : changed || age > 20 * 60000 || (have.tier === 'bg' && !have.error));
    if (onDone && (busy || stale)) (S.teamWait[key] = S.teamWait[key] || []).push(onDone);
    if (stale && !busy) {
      S.teamWait[key] = S.teamWait[key] || [];
      const why = force ? '手动' : !have ? '首次' : changed ? '存档变了' : have.tier === 'bg' && tier === 'full' ? '补完整' : '过期';
      PERF.plan.why[why] = (PERF.plan.why[why] || 0) + 1;
      S.teamPlanSig[key] = sig;
      const t0 = performance.now();
      const teamAt = (save.team || []).slice().sort().join(',');
      teamPlanCompute(key, tier).then((r) => { r.tier = tier; S.teamPlans[key] = r; })
        .finally(() => {
          perfAdd(PERF.plan, performance.now() - t0);
          // 算的过程中换了队：结果对应的是旧队，下次调用时重算
          if (((S.save && S.save.team) || []).slice().sort().join(',') !== teamAt) S.teamPlanSig[key] = null;
        }).catch((e) => { S.teamPlans[key] = { key, error: String((e && e.message) || e), at: now() }; })
        .finally(() => {
          const list = S.teamWait[key] || [];
          S.teamWait[key] = null;
          for (const fn of list) { try { fn(S.teamPlans[key]); } catch { /* 忽略 */ } }
        });
    }
    return have || null;
  }
  const teamPlanBusy = (key) => !!(S.teamWait && S.teamWait[key]);
  /** onDone 只在这次真的重算完才回调（面板拿它重绘，命中缓存时回调会无限递归） */
  function teamPlanAsync(key, force = false, tier = 'full') {
    return new Promise((res) => {
      const have = teamPlanGet(key, null, force, tier);
      if (teamPlanBusy(key)) S.teamWait[key].push(res);
      else res(have);
    });
  }

  /** 在队伍 / 电脑格子上标出 uid 的顺序 */
  function teamHighlight(uids) {
    $$('.pcauto-ta-mark').forEach((e) => e.remove());
    const order = new Map(uids.map((u, i) => [String(u), i + 1]));
    const done = new Set();
    let n = 0;
    for (const node of $$('.slot[data-uid], .pc-cell[data-uid], .tr-row[data-uid]')) {
      const uid = String(node.dataset.uid);
      const k = order.get(uid);
      if (!k || done.has(uid) || !node.getBoundingClientRect().width) continue;
      done.add(uid);
      const mark = document.createElement('span');
      mark.className = 'pcauto-ta-mark';
      mark.textContent = k;
      mark.style.cssText = 'position:absolute;left:2px;top:2px;z-index:7;min-width:14px;height:14px;border-radius:7px;background:#ffcb05;color:#12141c;font:700 10px/14px system-ui;text-align:center;padding:0 3px';
      node.style.position = 'relative';
      node.appendChild(mark);
      n++;
    }
    return n;
  }
