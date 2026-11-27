  /* ====================== 活动配队：宝可方块首领、地下通道（只推荐，不出发） ====================== */
  /*
   * 方块首领：游戏的 BlocBoss.plan(队伍, 今天) 是确定的（种子 = 日期 + 队伍 uid 顺序），真正出击也用同一个函数，
   *   所以可以直接按它的结果（打到第几阶、总伤害）搜阵容和站位；每只只用一个对首领最好的攻击招（游戏 bestMoveAgainst，
   *   会看招式禁用），再试「只留某一个攻击招」是否打得更多，作为禁招建议。
   * 地下通道：游戏的 Underground.simulate(宝可梦, 主题, 起始层) 就是派遣时用的模拟，每套跑几次取平均层数。
   *   主题只读存档里已经生成好的（没生成时提示先打开一次地下通道），不去调用会写存档的 theme()。
   * 两者都只读：不调用 Cloud、不出击、不派遣、不改队伍。
   */

  const EV_BUDGET_MS = 20000;

  /** 存档里学会的攻击招（按等级） */
  function evAttackKeys(m) {
    const d = BT_DEX[m.id];
    if (!d) return [];
    const out = [];
    for (const [lv, key] of d.learn) if (lv <= (m.level || 1) && BT_MV[key] && BT_MV[key].p > 0 && !out.includes(key)) out.push(key);
    return out;
  }
  function evAllKeys(m) {
    const d = BT_DEX[m.id];
    if (!d) return [];
    const out = [];
    for (const [lv, key] of d.learn) if (lv <= (m.level || 1) && !out.includes(key)) out.push(key);
    return out;
  }

  /* ---------- 方块首领 ---------- */

  function blocInfo() {
    if (!nsOk()) return { error: nsWhy() || '没接入游戏内部接口' };
    const ns = NS(), BB = ns.BlocBoss, G = ns.Game;
    if (!BB || typeof BB.plan !== 'function') return { error: '这个游戏版本没有方块首领接口' };
    try { if (!BB.unlocked()) return { error: '方块首领还没解锁' }; } catch { return { error: '方块首领还没解锁' }; }
    const today = BB.today();
    if (!today) return { error: '还没拿到今天的首领：先在游戏里打开一次方块首领页面' };
    const size = (ns.CONFIG.BLOC_BOSS && ns.CONFIG.BLOC_BOSS.TEAM) || 6;
    const save = G.S;
    const pool = (save.mons || []).filter((m) => { try { return BB.allowed(m); } catch { return false; } });
    const curUids = ((save.eventTeams || {})[BB.TEAM_KEY] || []).map(String);
    return { ns, BB, G, today, size, save, pool, curUids, played: !!(BB.playedToday && BB.playedToday()) };
  }

  /** plan 的结果打分：先看打到第几阶，再看总伤害 */
  function blocScore(BB, team, today) {
    try {
      const r = BB.plan(team, today);
      return { step: r.step || 0, pct: r.pct || 0, dmg: r.dmg || 0, s: (r.step || 0) * 1e9 + (r.dmg || 0) };
    } catch (e) { return { step: 0, pct: 0, dmg: 0, s: -1, err: String((e && e.message) || e) }; }
  }

  async function blocPick() {
    const I = blocInfo();
    if (I.error) return { error: I.error };
    const { BB, today, size, pool, curUids, save } = I;
    if (!pool.length) return { error: '没有能参加方块首领的宝可梦' };
    const t0 = performance.now(), deadline = t0 + EV_BUDGET_MS;
    const byUid = new Map(pool.map((m) => [String(m.uid), m]));
    const curTeam = curUids.map((u) => byUid.get(u)).filter(Boolean).slice(0, size);
    // 单只打分预筛
    const solo = pool.map((m) => ({ m, s: blocScore(BB, [m], today).dmg })).sort((a, b) => b.s - a.s);
    const short = solo.slice(0, 24).map((x) => x.m);
    let evals = 0;
    const score = (team) => { evals++; return blocScore(BB, team, today); };
    // 贪心拼队：每次加边际贡献最大的
    let team = [];
    while (team.length < size) {
      let best = null, bs = -Infinity;
      for (const m of short) {
        if (team.includes(m)) continue;
        const r = score([...team, m]);
        if (r.s > bs) { bs = r.s; best = m; }
      }
      if (!best) break;
      team.push(best);
      if (performance.now() > deadline) break;
      await idle();
    }
    let cur = score(team);
    // 局部搜索：换人、换站位，直到没有提升
    for (let round = 0; round < 4 && performance.now() < deadline; round++) {
      let improved = false;
      for (let i = 0; i < team.length && performance.now() < deadline; i++) {
        for (const m of short) {
          if (team.includes(m)) continue;
          const t = team.slice(); t[i] = m;
          const r = score(t);
          if (r.s > cur.s) { team = t; cur = r; improved = true; }
        }
        for (let j = i + 1; j < team.length; j++) {
          const t = team.slice(); [t[i], t[j]] = [t[j], t[i]];
          const r = score(t);
          if (r.s > cur.s) { team = t; cur = r; improved = true; }
        }
        await idle();
      }
      if (!improved) break;
    }
    // 禁招：每只试「只留某一个攻击招」（作用在拷贝上，不改存档）
    const bans = [];
    let work = team.map((m) => ({ ...m }));
    let base = score(work);
    for (let i = 0; i < work.length && performance.now() < deadline + 5000; i++) {
      const m = work[i];
      const atk = evAttackKeys(m);
      if (atk.length <= 1) continue;
      let bestBan = null, bestR = base;
      for (const k of atk) {
        const ban = [...new Set([...(m.ban || []).filter((x) => !atk.includes(x)), ...atk.filter((x) => x !== k)])].sort();
        const t = work.slice(); t[i] = { ...m, ban };
        const r = score(t);
        if (r.s > bestR.s && r.dmg >= bestR.dmg * 1.02) { bestR = r; bestBan = ban; }
      }
      if (bestBan) {
        bans.push({ uid: String(m.uid), m: team[i], ban: bestBan, keep: atk.filter((k) => !bestBan.includes(k)) });
        work[i] = { ...m, ban: bestBan };
        base = bestR;
      }
    }
    const curR = curTeam.length ? score(curTeam) : null;
    return {
      kind: 'bloc', at: now(), today, played: I.played, team, r: cur, withBan: bans.length ? base : null, bans,
      curTeam, cur: curR, evals, ms: Math.round(performance.now() - t0), saveRef: save,
    };
  }

  /* ---------- 地下通道 ---------- */

  function ugInfo() {
    if (!nsOk()) return { error: nsWhy() || '没接入游戏内部接口' };
    const ns = NS(), UG = ns.Underground, G = ns.Game, C = ns.CONFIG;
    if (!UG || typeof UG.simulate !== 'function') return { error: '这个游戏版本没有地下通道接口' };
    try { if (!UG.unlocked()) return { error: '地下通道还没解锁' }; } catch { return { error: '地下通道还没解锁' }; }
    const save = G.S, under = save.under || {};
    const theme = under.next && under.next[0];
    if (!theme) return { error: '还没生成本次的主题：先在游戏里打开一次地下通道页面' };
    const size = (C.UNDERGROUND && C.UNDERGROUND.TEAM) || 3;
    const day = typeof UG.dayKey === 'function' ? UG.dayKey() : null;
    const used = under.day === day ? under.used || {} : {};
    let inCandy = new Set();
    try { const run = ns.CandyRun && ns.CandyRun.run && ns.CandyRun.run(); inCandy = new Set(((run && run.mons) || []).map((x) => x.src)); } catch { /* 忽略 */ }
    const pool = (save.mons || []).filter((m) => {
      if (!m || used[m.uid] || inCandy.has(m.uid) || !BT_DEX[m.id]) return false;
      try { return !G.can || !G.can(m, 'region', 'sinnoh'); } catch { return false; }
    });
    let starts = [1];
    try { if (typeof UG.starts === 'function') starts = UG.starts(); } catch { /* 忽略 */ }
    const left = (() => { try { return UG.left(); } catch { return null; } })();
    return { ns, UG, G, save, theme, size, pool, floor: Math.max(1, ...starts), left };
  }

  async function ugPick() {
    const I = ugInfo();
    if (I.error) return { error: I.error };
    const { UG, theme, size, pool, floor, save, G } = I;
    if (pool.length < size) return { error: `能派遣的宝可梦不足 ${size} 只（已派过、在糖果工厂、或不能去神奥的不算）` };
    const t0 = performance.now(), deadline = t0 + EV_BUDGET_MS;
    const power = (m) => { const u = btUnit(m); return u ? u.maxHp * 0.5 + Math.max(u.st.atk, u.st.spa) + (u.st.def + u.st.spd) * 0.5 : 0; };
    const ranked = pool.map((m) => ({ m, p: power(m) })).sort((a, b) => b.p - a.p).map((x) => x.m);
    const short = ranked.slice(0, 10);
    const cache = new Map();
    const key = (t) => t.map((m) => m.uid).join('|');
    const runs = 3;
    let sims = 0;
    const evalTeam = async (team) => {
      const k = key(team);
      if (cache.has(k)) return cache.get(k);
      let fl = 0, gd = 0, n = 0;
      for (let i = 0; i < runs; i++) {
        if (G.inSandbox && G.inSandbox()) break;
        try {
          const r = await UG.simulate(team, theme, floor);
          sims++;
          if (r) { fl += r.floors || 0; gd += r.guards || 0; n++; }
        } catch { break; }
        await nrFrame();
      }
      const res = n ? { floors: fl / n, guards: gd / n, s: fl / n + 0.1 * (gd / n), n } : { floors: 0, guards: 0, s: -1, n: 0 };
      cache.set(k, res);
      return res;
    };
    let team = short.slice(0, size);
    let cur = await evalTeam(team);
    for (let round = 0; round < 3 && performance.now() < deadline; round++) {
      let improved = false;
      for (let i = 0; i < team.length && performance.now() < deadline; i++) {
        for (const m of short) {
          if (team.includes(m) || performance.now() > deadline) continue;
          const t = team.slice(); t[i] = m;
          const r = await evalTeam(t);
          if (r.s > cur.s) { team = t; cur = r; improved = true; }
        }
      }
      if (!improved) break;
    }
    return { kind: 'ug', at: now(), theme, floor, left: I.left, team, r: cur, sims, ms: Math.round(performance.now() - t0), saveRef: save };
  }

  /* ---------- 日程页区块 ---------- */

  function eventTeamSection() {
    if (!nsOk()) return '';
    const ep = S.evPick || {};
    const name = (m) => `${esc(taMonName(m))} <span class="p-sub">Lv.${m.level}</span>`;
    const box = (k, title, btnTxt) => {
      const r = ep[k];
      const busy = ep.busy === k;
      const head = `<div class="pa-row"><span><b>${title}</b></span><button class="pa-btn" data-ev="${k}" ${ep.busy ? 'disabled' : ''}>${busy ? '计算中…' : r ? '重新计算' : btnTxt}</button></div>`;
      if (!r) return head;
      if (r.error) return head + `<div class="pa-note warn">${esc(r.error)}</div>`;
      let body = `<div class="p-sub">${r.team.map(name).join('、')}</div>`;
      if (k === 'bloc') {
        const tgt = r.withBan || r.r;
        body = `<div class="pa-note ${r.played ? 'info' : 'ok'}">推荐队预计打到第 ${tgt.step} 阶 · 总伤害 ${fmt(tgt.dmg)}${r.withBan ? `（按下方禁招；不禁招 ${fmt(r.r.dmg)}）` : ''}${r.cur ? `；现在的方块首领队 第 ${r.cur.step} 阶 · ${fmt(r.cur.dmg)}` : ''}${r.played ? '。今天已经打过了，明天可用' : ''}</div>`
          + body + `<div class="p-sub">按游戏自己的首领结算函数算的（结果确定，站位顺序也有影响，按列出的顺序上场）。比较了 ${r.evals} 种 · ${(r.ms / 1000).toFixed(1)} 秒</div>`
          + (r.bans.length ? `<div class="p-sub" style="margin-top:4px">禁招建议（招式禁用对所有玩法生效，主线也会受影响）：</div>${r.bans.map((b) => `<div class="pa-row"><span>${esc(taMonName(b.m))}</span><b class="p-sub" style="font-weight:400">只留 ${b.keep.map((x) => esc(TA_MVNAME[x] || x)).join('、')}</b></div>`).join('')}
            ${banApplyButtons('bloc', r.bans)}` : '');
      } else {
        body = `<div class="pa-note ok">推荐派遣：平均到第 ${r.r.floors.toFixed(1)} 层、击败守卫 ${r.r.guards.toFixed(1)} 次（从第 ${r.floor} 层出发，每套 ${r.r.n} 次游戏原版模拟）${r.left != null ? ` · 今天还能派 ${r.left} 次` : ''}</div>`
          + body + `<div class="p-sub">共模拟 ${r.sims} 次 · ${(r.ms / 1000).toFixed(1)} 秒。地下通道的掉落有随机性，层数是平均值。</div>`;
      }
      return head + body + `<div class="p-btns"><button class="pa-btn" data-evmark="${k}">在 PC 里标出</button></div>`;
    };
    return `<h4>活动配队（只推荐，不出击）</h4>${box('bloc', '宝可方块首领', '按今天的首领选队')}${box('ug', '地下通道', '按本次主题选队')}`;
  }

  function bindEventTeam(body, redraw) {
    $$('[data-ev]', body).forEach((b) => {
      b.onclick = async () => {
        const k = b.dataset.ev;
        S.evPick = { ...(S.evPick || {}), busy: k };
        redraw();
        let r;
        try { r = k === 'bloc' ? await blocPick() : await ugPick(); } catch (e) { r = { error: String((e && e.message) || e) }; }
        S.evPick = { ...(S.evPick || {}), busy: null, [k]: r };
        redraw();
      };
    });
    $$('[data-evmark]', body).forEach((b) => {
      b.onclick = () => {
        const r = (S.evPick || {})[b.dataset.evmark];
        const n = r && r.team ? teamHighlight(r.team.map((m) => String(m.uid))) : 0;
        log('info', n ? `已在格子上标出推荐的 ${n} 只` : '当前界面没有可标记的格子：先打开游戏的选队页');
      };
    });
    bindBanApply(body, redraw);
  }
