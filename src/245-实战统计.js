  /* ====================== 实战统计：每只宝可梦打了多少、挨了多少 ====================== */
  /*
   * 游戏接口的挂钩在 Adventure.step / tick 返回后回调 __pcautoTap(事件列表, 调用前血量)（沙盒重放不回调）。
   * 伤害按目标打之前的血量封顶（不算溢出）：打之前的血量优先用挂钩的快照，其次用本段里记下的上一次血量。
   * 灼伤 / 中毒 / 混乱自伤记给施加状态的那只；追溯不到的记在「来源不明」。
   * 按「段」累计：一段大致是一章。章节结束（打赢馆主）、战败、切换章节、刷新页面、手动「结束本轮」时归档，
   * 留最近 20 段，存在扩展存储里。每段分三种范围：全层 / 仅首领 / 仅遭遇（游走与定点的神兽）。
   * 拿不到接口时这一块不工作，其余功能不受影响。
   */

  const BSTATS_KEY = 'pcauto.bstats.v2';
  const BSTATS_SEGS = 20;
  const BS_FOE_ROWS = 14;
  const BS_BOSS = ['gym', 'raid', 'zone', 'event', 'league', 'tower'];
  const BS_SCOPES = [['all', '全层'], ['boss', '仅首领'], ['encounter', '仅遭遇']];
  const BS_DOT = ['burn', 'poison', 'confusion'];

  function bstatsInit() {
    if (S.bstats) return S.bstats;
    const saved = storeGet(BSTATS_KEY, null);
    const st = { cur: null, seg: null, segs: [], last: null, lastBoss: null, inflict: {}, hp: {}, dirty: false, savedAt: 0 };
    if (saved && typeof saved === 'object') {
      st.segs = Array.isArray(saved.segs) ? saved.segs.slice(0, BSTATS_SEGS) : [];
      st.lastBoss = saved.lastBoss || null;
      // 刷新前没归档的那一段：按「刷新」归档
      if (saved.seg && saved.seg.n > 0) st.segs.unshift({ ...saved.seg, end: saved.seg.upd || saved.seg.at, why: '刷新页面' });
      st.segs.length = Math.min(st.segs.length, BSTATS_SEGS);
    }
    S.bstats = st;
    return st;
  }
  function bsPersist(force) {
    const st = S.bstats;
    if (!st || st.scratch || (!st.dirty && !force)) return;
    if (!force && now() - st.savedAt < 15000) return;
    st.dirty = false;
    st.savedAt = now();
    storeSet(BSTATS_KEY, { segs: st.segs, seg: st.seg, lastBoss: st.lastBoss });
  }

  const bsName = (r) => (r.uid === '?' ? '来源不明' : r.id ? TA_NAME[r.id - 1] || `#${r.id}` : '?');
  function bsRow(map, key, side, id, lv) {
    let r = map[key];
    if (!r) r = map[key] = { uid: key, side, id: id || null, lv: lv || null, dealt: 0, dot: 0, taken: 0, ko: 0, hits: 0, crits: 0, misses: 0, moves: {} };
    else if (lv && (!r.lv || lv > r.lv)) r.lv = lv;
    return r;
  }

  /* ---------- 段 ---------- */

  function bsNewSeg(save) {
    const adv = (save && save.adv) || {};
    const c = adv.chapter != null ? CH[adv.chapter | 0] : null;
    return {
      at: now(), upd: now(), end: null, why: null, ch: adv.chapter != null ? adv.chapter | 0 : null,
      chName: c ? c.n : '', region: c ? c.rz : '', n: 0,
      scopes: { all: bsScope(), boss: bsScope(), encounter: bsScope() },
    };
  }
  const bsScope = () => ({ n: 0, win: 0, lose: 0, ms: 0, mons: {} });

  function bsArchive(why) {
    const st = bstatsInit();
    const seg = st.seg;
    st.seg = null;
    if (!seg || !seg.n) return;
    seg.end = now();
    seg.why = why;
    for (const sc of Object.values(seg.scopes)) {
      const foes = Object.entries(sc.mons).filter(([, r]) => r.side === 'foe' && r.uid !== '?').sort((a, b) => b[1].taken - a[1].taken);
      for (const [k] of foes.slice(BS_FOE_ROWS)) delete sc.mons[k];
    }
    st.segs.unshift(seg);
    if (st.segs.length > BSTATS_SEGS) st.segs.length = BSTATS_SEGS;
    st.dirty = true;
    bsPersist(true);
  }
  /** 「结束本轮」：当前战斗也算进去后归档 */
  function bsFinish() {
    const st = bstatsInit();
    if (st.cur) bsEnd('中断');
    bsArchive('手动结束');
  }

  /** 这一场属于哪些范围 */
  function bsScopesOf(b) {
    const out = ['all'];
    if (BS_BOSS.includes(b.kind)) out.push('boss');
    if (b.roam || b.kind === 'static') out.push('encounter');
    return out;
  }

  /** 一场打完：并进当前段的各个范围；我方按 uid、敌方按物种合并 */
  function bsMerge(seg, b) {
    for (const key of bsScopesOf(b)) {
      const sc = seg.scopes[key];
      sc.n++;
      if (b.result === '胜') sc.win++;
      else if (b.result === '败') sc.lose++;
      sc.ms += b.ms || 0;
      for (const r of Object.values(b.mons)) {
        const k = r.uid === '?' ? '?' + r.side : r.side === 'me' ? r.uid : 'f' + r.id;
        const t = bsRow(sc.mons, k, r.side, r.id, r.lv);
        if (r.uid === '?') t.uid = '?';
        for (const f of ['dealt', 'dot', 'taken', 'ko', 'hits', 'crits', 'misses']) t[f] += r[f];
        for (const [mv, n] of Object.entries(r.moves)) t.moves[mv] = (t.moves[mv] || 0) + n;
      }
    }
    seg.n++;
    seg.upd = now();
  }

  /* ---------- 场 ---------- */

  /** 在当前战斗和全箱里找 uid 对应的宝可梦；全箱索引每场只建一次 */
  let bsIdx = null;
  function bsFind(uid) {
    const save = liveSave();
    if (!save) return null;
    const bt = save.adv && save.adv.battle;
    const foe = bt && (bt.enemies || []).find((e) => e.uid === uid);
    if (foe) return foe;
    if (!bsIdx || bsIdx.save !== save) bsIdx = { save, by: new Map((save.mons || []).map((m) => [m.uid, m])) };
    return bsIdx.by.get(uid) || null;
  }
  function bsMon(b, uid, side) {
    if (uid === '?') { const u = bsRow(b.mons, '?' + side, side); u.uid = '?'; return u; }
    let r = b.mons[uid];
    if (!r) {
      const live = bsFind(uid);
      r = bsRow(b.mons, uid, side, live && live.id, live && live.level);
    }
    return r;
  }

  function bsStart(ev) {
    const st = bstatsInit();
    if (st.cur) bsEnd('中断');
    const save = liveSave();
    const adv = (save && save.adv) || {};
    if (st.seg && st.seg.ch != null && adv.chapter != null && (adv.chapter | 0) !== st.seg.ch) bsArchive('切换章节');
    if (!st.seg) st.seg = bsNewSeg(save);
    const bt = adv.battle;
    st.cur = {
      at: now(), kind: (ev && ev.kind) || (bt && bt.kind) || '?', ch: adv.chapter != null ? adv.chapter : null, roam: !!(ev && ev.roam),
      foes: bt ? (bt.enemies || []).map((e) => [e.id, e.level]) : ev && ev.enemy ? [[ev.enemy.id, ev.enemy.level]] : [],
      leader: bt && bt.gym ? bt.gym.leader || null : null, mons: {}, result: null,
    };
    st.inflict = {};
  }

  function bsEnd(result) {
    const st = bstatsInit();
    const b = st.cur;
    if (!b) return;
    b.result = result;
    b.ms = now() - b.at;
    bsIdx = null;
    st.cur = null;
    st.inflict = {};
    st.last = b;
    if (BS_BOSS.includes(b.kind)) st.lastBoss = b;
    if (!st.seg) st.seg = bsNewSeg(liveSave());
    bsMerge(st.seg, b);
    st.dirty = true;
    if (result === '败') bsArchive('战败');
    else if (result === '胜' && b.kind === 'gym') bsArchive('章节结束');
  }

  /** 打之前的血量：本段记下的 > 挂钩快照 > 事件里的上限 / 打后血量 + 伤害 */
  function bsBefore(st, uid, ev, pre) {
    if (st.hp[uid] != null) return st.hp[uid];
    if (pre && pre[uid] != null) return pre[uid];
    const est = (ev.hp != null ? ev.hp : 0) + (ev.damage || 0);
    return ev.maxHp != null ? Math.min(ev.maxHp, est) : est;
  }

  function bsAttack(ev, pre) {
    const st = bstatsInit();
    if (!st.cur) bsStart(null);
    const b = st.cur;
    const ally = ev.side === 'ally';
    const atk = bsMon(b, ev.uid, ally ? 'me' : 'foe');
    const def = bsMon(b, ev.target, ally ? 'foe' : 'me');
    const mv = ev.move && ((ev.move.key && TA_MVNAME[ev.move.key]) || ev.move.name || ev.move.key);
    if (mv) atk.moves[mv] = (atk.moves[mv] || 0) + 1;
    if (ev.inflict && BS_DOT.includes(ev.inflict)) (st.inflict[ev.target] = st.inflict[ev.target] || {})[ev.inflict] = { uid: ev.uid, side: atk.side };
    if (ev.miss) { atk.misses++; return; }
    if (ev.statusMove) return;
    const before = bsBefore(st, ev.target, ev, pre);
    const dmg = Math.max(0, Math.min(ev.damage || 0, before));
    if (ev.hp != null) st.hp[ev.target] = ev.hp;
    if (ev.attHp != null) st.hp[ev.uid] = ev.attHp;
    atk.hits++;
    if (ev.crit) atk.crits++;
    atk.dealt += dmg;
    def.taken += dmg;
    if (ev.hp != null && ev.hp <= 0 && before > 0) atk.ko++;
  }

  /** 灼伤 / 中毒每回合的伤害、混乱自伤：记给施加者 */
  function bsStatusHurt(ev, pre) {
    const st = bstatsInit();
    if (!st.cur) bsStart(null);
    const b = st.cur;
    const meVictim = ev.side === 'ally';
    const victim = bsMon(b, ev.uid, meVictim ? 'me' : 'foe');
    const src = st.inflict[ev.uid] && st.inflict[ev.uid][ev.status];
    const by = src ? bsMon(b, src.uid, src.side) : bsMon(b, '?', meVictim ? 'foe' : 'me');
    const before = bsBefore(st, ev.uid, ev, pre);
    const dmg = Math.max(0, Math.min(ev.damage || 0, before));
    if (ev.hp != null) st.hp[ev.uid] = ev.hp;
    by.dealt += dmg;
    by.dot += dmg;
    victim.taken += dmg;
    if (ev.hp != null && ev.hp <= 0 && before > 0) by.ko++;
  }

  /** 挂钩回调：kind = 'step' | 'tick'，events = 游戏返回的事件数组，pre = 调用前 { uid: 血量 } */
  function bsTap(kind, events, pre) {
    if (!Array.isArray(events) || !events.length) return;
    S.tapAt = S.lastActivityAt = S.lastProgressAt = now();
    const st = bstatsInit();
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      try {
        if (ev.type === 'battleStart') { bsStart(ev); st.hp = {}; }
        else if (ev.type === 'attack' && ev.uid != null && ev.target != null) bsAttack(ev, pre);
        else if (ev.type === 'status' && ev.what === 'hurt' && ev.uid != null && ev.damage) bsStatusHurt(ev, pre);
        else if (ev.type === 'status' && ev.what === 'end' && st.inflict[ev.uid]) delete st.inflict[ev.uid][ev.status];
        else if (ev.type === 'victory' || ev.type === 'eliteWin') bsEnd('胜');
        else if (ev.type === 'defeat') bsEnd('败');
        else if (ev.type === 'fled' || ev.type === 'legendFled') bsEnd('逃跑');
      } catch { /* 统计出错不影响游戏 */ }
    }
    if (st.seg) st.seg.upd = now();
    st.dirty = true;
    bsPersist(false);
  }

  function installBattleStats() {
    bstatsInit();
    try { PAGE_WIN.__pcautoTap = bsTap; } catch { /* 忽略 */ }
    addEventListener('pagehide', () => { try { bsPersist(true); } catch { /* 忽略 */ } });
  }

  /* ---------- 读出与展示 ---------- */

  /** 当前段（含进行中的那一场）某个范围的汇总；不改动原数据 */
  function bsLiveScope(scope) {
    const st = bstatsInit();
    if (!st.seg && !st.cur) return null;
    const seg = st.seg ? JSON.parse(JSON.stringify(st.seg)) : bsNewSeg(liveSave());
    if (st.cur) bsMerge(seg, { ...st.cur, result: null, ms: now() - st.cur.at });
    return { seg, sc: seg.scopes[scope] };
  }

  const BS_KIND = { wild: '野生', trainer: '训练家', gym: '馆主', static: '定点', event: '活动', zone: '区域', raid: '团体战', tower: '对战塔', league: '联盟' };

  function bsSegTitle(seg) {
    if (!seg) return '';
    const t = (x) => new Date(x).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    return `${seg.region ? esc(seg.region) + ' · ' : ''}${seg.ch != null ? `第 ${seg.ch + 1} 章` : ''}${seg.chName ? ' ' + esc(seg.chName) : ''}`
      + ` · ${t(seg.at)}${seg.end ? '–' + t(seg.end) : ' 起'}${seg.why ? ' · ' + esc(seg.why) : ''}`;
  }

  /** 一个范围的表格：我方按造成伤害排序，绿色 = 输出、橙色 = 承伤；compact 给悬浮窗用 */
  function bsScopeHtml(sc, compact) {
    if (!sc || !sc.n) return '<div class="p-sub">这个范围还没有战斗</div>';
    const mine = Object.values(sc.mons).filter((r) => r.side === 'me').sort((x, y) => y.dealt - x.dealt);
    const foes = Object.values(sc.mons).filter((r) => r.side === 'foe').sort((x, y) => y.dealt - x.dealt);
    const total = mine.reduce((s, r) => s + r.dealt, 0) || 1;
    const maxV = Math.max(1, ...mine.map((r) => Math.max(r.dealt, r.taken)));
    const top = (r) => Object.entries(r.moves).sort((x, y) => y[1] - x[1]).slice(0, compact ? 1 : 2).map(([k, n]) => `${esc(k)}×${n}`).join(' ');
    const bar = (v, c) => `<div style="height:3px;border-radius:2px;background:${c};width:${Math.max(2, Math.round((v / maxV) * 100))}%"></div>`;
    const head = `<div class="p-sub">${sc.n} 场 · 胜 ${sc.win} 败 ${sc.lose}${sc.ms ? ` · ${Math.round(sc.ms / 60000)} 分钟` : ''}</div>`;
    const mineRows = mine.map((r) => `<tr><td>${esc(bsName(r))}${r.lv && !compact ? ` <span class="p-sub">Lv.${r.lv}</span>` : ''}
        ${bar(r.dealt, '#4ade80')}${bar(r.taken, '#fb923c')}</td>
        <td style="color:#86efac">${fmt(Math.round(r.dealt))}${r.dot ? `<div class="p-sub">持续 ${fmt(Math.round(r.dot))}</div>` : ''}</td>
        <td>${Math.round((r.dealt / total) * 100)}%</td><td style="color:#fdba74">${fmt(Math.round(r.taken))}</td><td>${r.ko}</td>
        ${compact ? '' : `<td>${r.hits}/${r.misses}/${r.crits}</td><td class="p-sub">${top(r)}</td>`}</tr>`).join('');
    const foeRows = foes.slice(0, compact ? 6 : BS_FOE_ROWS).map((r) => `<tr><td>${esc(bsName(r))}${r.lv ? ` <span class="p-sub">Lv.${r.lv}</span>` : ''}</td>
        <td style="color:#86efac">${fmt(Math.round(r.dealt))}</td><td style="color:#fdba74">${fmt(Math.round(r.taken))}</td><td>${r.ko}</td></tr>`).join('');
    return `${head}<table><tr><th>我方</th><th>输出</th><th>占比</th><th>承伤</th><th>击倒</th>${compact ? '' : '<th>命中/落空/暴击</th><th>常用招式</th>'}</tr>
      ${mineRows || `<tr><td colspan="${compact ? 5 : 7}" class="p-sub">我方没有出手</td></tr>`}</table>
      ${foeRows ? `<table style="margin-top:4px"><tr><th>敌方</th><th>输出</th><th>承伤</th><th>击倒</th></tr>${foeRows}</table>` : ''}`;
  }

  /** 日志战报页的「实战统计」区块：本段全层 + 上一段 + 最近一场首领战 */
  function battleStatsSection() {
    if (!nsOk()) return `<h4>实战统计</h4><div class="p-sub">没接入游戏内部接口（${esc(nsWhy())}），无法统计每只宝可梦的伤害</div>`;
    const st = bstatsInit();
    const live = bsLiveScope('all');
    const prev = st.segs[0];
    const boss = st.lastBoss;
    const bossSc = boss ? (() => { const s = bsNewSeg(null); bsMerge(s, boss); return s.scopes.all; })() : null;
    return `<h4>实战统计 <span class="p-sub" style="font-weight:400">（悬浮窗里可切换范围、看最近 ${BSTATS_SEGS} 段）</span></h4>
      ${live ? `<div class="p-sub" style="margin-top:4px">本段：${bsSegTitle(live.seg)}</div>${bsScopeHtml(live.sc)}` : ''}
      ${prev ? `<div class="p-sub" style="margin-top:8px">上一段：${bsSegTitle(prev)}</div>${bsScopeHtml(prev.scopes.all)}` : ''}
      ${bossSc ? `<div class="p-sub" style="margin-top:8px">最近一场首领战：${BS_KIND[boss.kind] || esc(boss.kind)}${boss.leader ? ' · ' + esc(boss.leader) : ''} · ${boss.result || '进行中'}</div>${bsScopeHtml(bossSc)}` : ''}
      ${!live && !prev ? '<div class="p-sub">还没有记录到战斗（从下一场开始统计）</div>' : ''}
      <div class="p-sub" style="margin-top:4px">不计溢出伤害；灼伤、中毒、混乱自伤记给施加者，追溯不到的单列「来源不明」。</div>`;
  }
