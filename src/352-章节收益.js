  /* ====================== 章节收益：练级刷钱、抓宠图鉴去哪章 ====================== */
  /*
   * 估算：在游戏沙盒里用现在的队伍把每章从开头走到馆主门口（只读，不写存档），
   * 记下路上拿到的钱、全队经验和走了多少步；同时用游戏的 zonePool 读出每章野外能遇到的物种。
   * 实测：挂机时每分钟按当前章节累计实际赚到的钱和捕获数，离线补算那一跳不算。
   */

  const CHY_KEY = 'pcauto.chyield.v1';
  const CHY_STEP_S = 1.12;          // 在线 ×4 每步约 1.12 秒（攻略按 ACTION_MS 推算的设计值）
  const CHY_STEP_MAX = 3000;
  const chy = { busy: false, done: 0, total: 0, rows: null, at: 0, sig: '', err: '' };

  function chyStore() {
    const v = storeGet(CHY_KEY, null);
    return v && typeof v === 'object' ? v : {};
  }

  /** 能去刷的章：已解锁、不在比当前更后的地区、不是联盟 */
  function chyCandidates(f) {
    const ri = REGIONS.indexOf(f.region);
    const out = [];
    for (let i = 0; i <= Math.min(f.unlocked, CH.length - 1); i++) {
      const c = CH[i];
      if (!c || c.lg || REGIONS.indexOf(c.r) > ri) continue;
      out.push(i);
    }
    return out;
  }

  function chyTotalXp(m, region) {
    let s = m.xp || 0;
    for (let l = 1; l < (m.level | 0); l++) s += xpNeed(l, region);
    return s;
  }

  /** 已登记图鉴（存档 dex 里有这个物种）或者盒子里有 */
  function chyOwnedSet(save) {
    const s = new Set(Object.keys(save.dex || {}).map(Number));
    for (const m of save.mons || []) s.add(m.id);
    return s;
  }

  /** 沙盒里走一章：返回 { money, xp, steps, lost, species } */
  function chyRun(ch, lineup, seed, region) {
    const ns = NS(), G = ns.Game, A = ns.Adventure, save = G.S;
    if (G.inSandbox()) return null;
    const base = nrClone({ ...G.freshState(), ...pick(save, ['trainer', 'link', 'buffs', 'items', 'dex']) });
    const adv = nrClone(save.adv);
    Object.assign(adv, {
      chapter: ch, nodes: [], node: 0, battle: null, pending: null,
      event: null, zone: null, tower: null, league: null, loops: [], kept: {},
      capture: { ...(adv.capture || {}), on: false },
    });
    base.adv = adv;
    base.money = 0;
    base.mons = lineup.map((m) => { const c = nrClone(m); for (const k of NR_DROP) delete c[k]; return c; });
    const uids = base.mons.map((m) => m.uid);
    base.team = uids.slice();
    base.road = uids.slice();
    base.eventTeams = {};
    const xp0 = base.mons.reduce((a, m) => a + chyTotalXp(m, region), 0);
    const out = { money: 0, xp: 0, steps: 0, lost: false, species: new Map() };
    const M = PAGE_WIN.Math, rand = M.random, seeded = nrSeedable();
    let s = seed >>> 0 || 1;
    if (seeded) M.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const STOP = { t: 'stop' };
    const t0 = performance.now();
    try {
      G.sandbox(base, () => {
        A.buildChapter(ch, true);
        for (const node of base.adv.nodes || []) {
          let pool;
          try { pool = A.zonePool(node, ch); } catch { continue; }
          for (const p of pool || []) if (p && p.id && !out.species.has(p.id)) out.species.set(p.id, { id: p.id, min: p.min || 1, max: p.max || p.min || 1 });
        }
        let stuck = 0, lastNode = -1;
        for (; out.steps < CHY_STEP_MAX; out.steps++) {
          const b = base.adv.battle;
          if (b && b.kind === 'gym') throw STOP;                 // 只算路上：馆主重打只给 10%，进馆就停
          if (base.adv.chapter !== ch) throw STOP;
          A.step();
          // 全灭后游戏会回城重开本章：血量清零或节点倒退都算输
          if (!G.teamMons().some((m) => G.curHp(m) > 0) || base.adv.node < lastNode) { out.lost = true; throw STOP; }
          if (base.adv.pending) {
            if (base.adv.node === lastNode && ++stuck > 3) { base.adv.pending = null; base.adv.node++; stuck = 0; }
          } else stuck = 0;
          lastNode = base.adv.node;
          if (base.adv.node >= (base.adv.nodes || []).length) break;
        }
      });
    } catch (e) {
      if (e !== STOP) out.error = String((e && e.message) || e);
    } finally {
      if (seeded) M.random = rand;
      perfAdd(PERF.nr, performance.now() - t0);
    }
    out.money = base.money || 0;
    out.xp = Math.max(0, base.mons.reduce((a, m) => a + chyTotalXp(m, region), 0) - xp0);
    return out;
  }

  /** 逐章估算（每章 2 次取平均），算完缓存；队伍或推进变了才需要重算 */
  async function chyCompute(onProgress) {
    if (chy.busy) return chy.rows;
    const save = liveSave() || S.save;
    const f = facts(S.save);
    if (!nsOk() || !save || !f) { chy.err = nsOk() ? '还没读到存档' : `需要游戏内部接口（${nsWhy() || '没接入'}）`; return null; }
    const lineup = nrMons(save.team || []);
    if (!lineup.length) { chy.err = '队伍是空的'; return null; }
    const list = chyCandidates(f);
    chy.busy = true; chy.done = 0; chy.total = list.length; chy.err = '';
    log('flow', `开始估算 ${list.length} 章的收益（原版重放，只读）`);
    const owned = chyOwnedSet(S.save);
    const rows = [];
    try {
      for (const ch of list) {
        let money = 0, xp = 0, steps = 0, lost = 0, n = 0, err = '';
        let species = new Map();
        for (const seed of [13, 71]) {
          const t0 = performance.now();
          const r = chyRun(ch, lineup, seed, f.region);
          if (!r) { err = '游戏正处于沙盒中'; break; }
          if (r.error) { err = r.error; continue; }
          money += r.money; xp += r.xp; steps += r.steps; lost += r.lost ? 1 : 0; n++;
          if (!species.size) species = r.species;
          await nrPace('bg', performance.now() - t0);
        }
        const c = CH[ch];
        const sp = [...species.values()];
        rows.push({
          ch, name: c.n, rz: c.rz, lv: c.lv, n, err,
          steps: n ? steps / n : 0,
          moneyH: n && steps ? (money / steps) * (3600 / CHY_STEP_S) : 0,
          xpH: n && steps ? (xp / steps) * (3600 / CHY_STEP_S) : 0,
          lostRate: n ? lost / n : 0,
          species: sp.length, missing: sp.filter((p) => !owned.has(p.id)),
        });
        chy.done++;
        if (onProgress) onProgress(chy.done, chy.total);
      }
    } finally {
      chy.busy = false;
    }
    chy.rows = rows;
    chy.at = now();
    chy.sig = `${(save.team || []).join(',')}|${f.unlocked}`;
    log('flow', `章节收益估算完成：${rows.length} 章`);
    return rows;
  }

  /* ---- 实测：挂机时每分钟按章节累计 ---- */

  let chyLast = null;
  function chyMeasureTick() {
    const save = S.save;
    if (!save || !save.adv) return;
    const pt = { at: now(), ch: save.adv.chapter | 0, money: S.tally.money, caught: S.tally.caught };
    const prev = chyLast;
    chyLast = pt;
    if (!prev || prev.ch !== pt.ch || isRealHidden() || isBusyTask()) return;
    if (S.catchup && now() - S.catchup.at < 120000) return;
    const dt = pt.at - prev.at;
    if (dt <= 0 || dt > 5 * 60000) return;
    const st = chyStore();
    const r = st[pt.ch] || { ms: 0, money: 0, caught: 0 };
    r.ms += dt;
    r.money += Math.max(0, pt.money - prev.money);
    r.caught += Math.max(0, pt.caught - prev.caught);
    st[pt.ch] = r;
    storeSet(CHY_KEY, st);
  }

  /* ---- 去这章并循环（练级刷钱 / 抓宠图鉴模式用） ---- */

  async function chapterFarm(n) {
    return runTask('chapter', async () => {
      if (!(await openMap())) return { ok: false, msg: '打不开章节地图' };
      intent('chapter');
      for (const l of advLoops()) if (l !== String(n)) await loopToggle(l, false);
      const looped = await loopToggle(String(n), true);
      if ((readSave() || {}).adv?.chapter !== n) {
        const r = await mapGo(n);
        if (!r.ok) return r;
      }
      return looped ? { ok: true } : { ok: false, msg: '章节到了，但循环开关没打开' };
    });
  }

  /* ---- 界面（日程页） ---- */

  function chyMeasuredRow(ch) {
    const r = chyStore()[ch];
    if (!r || r.ms < 5 * 60000) return null;
    const h = r.ms / 3600000;
    return { moneyH: r.money / h, caughtH: r.caught / h, min: Math.round(r.ms / 60000) };
  }

  function chapterYieldSection() {
    const f = facts();
    if (!f) return '';
    const mode = S.cfg.preset;
    const push = mode === 'push';
    const rows = chy.rows;
    const head = `<h4>章节收益${mode === 'dex' ? '（抓宠图鉴）' : '（练级刷钱）'}</h4>`;
    const btn = `<div class="p-btns"><button class="pa-btn acc" id="pcauto-chy-run" ${chy.busy ? 'disabled' : ''}>${chy.busy ? `估算中 ${chy.done}/${chy.total}…` : rows ? '重新估算' : '估算各章收益（原版重放，只读）'}</button></div>`;
    const note = `<div class="p-sub">用现在的队伍在游戏沙盒里把每章从开头走到馆主门口，统计路上的钱和全队经验（按 ×4 速度每步约 ${CHY_STEP_S} 秒换算成每小时）。只算路上，馆主重打的奖金不计。「实测」是您在这章挂机满 5 分钟后的真实数字。
      ${push ? '<b style="color:#fbbf24">现在是推关模式：推关会自动关掉循环、回最新章。想留在某章刷，先切到「练级刷钱」或「抓宠图鉴」。</b>' : '「去这章并循环」会打开地图、只留这一章的循环并进入，之后打完馆主会回到本章开头继续刷。'}</div>`;
    if (!rows) return `${head}${chy.err ? `<div class="pa-note warn">${esc(chy.err)}</div>` : ''}${btn}${note}`;
    const loopsNow = (((S.save || {}).adv || {}).loops || []).map(String);
    const go = (r) => (push ? '' : `<button class="pa-btn" data-chy-go="${r.ch}" ${r.ch === f.ch && loopsNow.includes(String(r.ch)) ? 'disabled' : ''}>${r.ch === f.ch ? '循环本章' : '去这章并循环'}</button>`);
    let table;
    if (mode === 'dex') {
      const list = rows.filter((r) => r.missing.length).sort((a, b) => b.missing.length - a.missing.length);
      table = list.length ? `<table><tr><th>章节</th><th>没抓到</th><th>野外物种</th><th>实测捕获/时</th><th></th></tr>
        ${list.map((r) => { const m = chyMeasuredRow(r.ch); return `<tr><td>${r.ch + 1} · ${esc(r.rz)} ${esc(r.name)}</td>
          <td><b>${r.missing.length}</b> <span class="p-sub">${r.missing.slice(0, 6).map((p) => esc(TA_NAME[p.id - 1] || '#' + p.id)).join('、')}${r.missing.length > 6 ? '…' : ''}</span></td>
          <td>${r.species}</td><td>${m ? `${fmt(m.caughtH)}（${m.min} 分钟）` : '—'}</td><td>${go(r)}</td></tr>`; }).join('')}</table>
        <div class="p-sub">野外物种按现在的时段和天气读取；夜间限定、天气限定的要在对应时段再看。</div>`
        : '<div class="pa-note ok">能去的章节里，野外的宝可梦您都已经登记过了</div>';
    } else {
      const list = rows.filter((r) => r.n).sort((a, b) => b.moneyH - a.moneyH);
      const best = list[0];
      table = `<table><tr><th>章节</th><th>₽/时（估）</th><th>经验/时（估）</th><th>实测 ₽/时</th><th>路上会输</th><th></th></tr>
        ${list.slice(0, 15).map((r) => { const m = chyMeasuredRow(r.ch); return `<tr${r === best ? ' style="background:rgba(74,222,128,.12)"' : ''}><td>${r.ch + 1} · ${esc(r.rz)} ${esc(r.name)}${r.ch === f.ch ? ' <span class="p-sub">（当前）</span>' : ''}</td>
          <td>${fmt(r.moneyH)}</td><td>${fmt(r.xpH)}</td><td>${m ? `${fmt(m.moneyH)}（${m.min} 分钟）` : '—'}</td>
          <td style="color:${r.lostRate > 0 ? '#f87171' : '#6b7488'}">${r.lostRate > 0 ? `${Math.round(r.lostRate * 100)}%` : '—'}</td><td>${go(r)}</td></tr>`; }).join('')}</table>
        <div class="p-sub">按 ₽/时 从高到低，只列前 15 章。钱多的章经验通常也多；买糖升级的话优先看 ₽/时。"路上会输"大于 0 说明队伍在这章路上就会全灭，实际收益会更低。</div>`;
    }
    return `${head}<div class="p-sub">${Math.max(0, Math.round((now() - chy.at) / 60000))} 分钟前算的${chy.sig !== `${((S.save || {}).team || []).join(',')}|${f.unlocked}` ? '，队伍或进度已经变了，建议重新估算' : ''}</div>${table}${btn}${note}`;
  }

  function bindChapterYield(body, redraw) {
    const run = $('#pcauto-chy-run', body);
    if (run) run.onclick = async () => { const p = chyCompute(() => redraw()); redraw(); await p; redraw(); };
    $$('[data-chy-go]', body).forEach((b) => {
      b.onclick = async () => {
        const n = +b.dataset.chyGo;
        b.disabled = true;
        const r = await chapterFarm(n);
        log(r.ok ? 'prog' : 'warn', r.ok ? `已进入第 ${n + 1} 章并只循环这一章` : `去第 ${n + 1} 章没完成：${r.msg}`);
        redraw();
      };
    });
  }
