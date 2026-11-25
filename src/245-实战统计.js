  /* ====================== 实战统计：每场战斗谁打了多少、挨了多少 ====================== */
  /*
   * 游戏接口的挂钩在 Adventure.step / tick 返回后回调 __pcautoTap(事件列表)（沙盒重放不回调）。
   * 按 attack 事件累计伤害（按目标剩余血量封顶，不算溢出）、承伤、击倒、暴击、落空、招式次数；
   * 战斗结束（胜 / 败 / 逃跑）归档，最多留 30 场。拿不到接口时这一块不工作，其余功能不受影响。
   */

  const BSTATS_KEEP = 30;

  function bstatsInit() {
    S.bstats = S.bstats || { cur: null, done: [] };
    return S.bstats;
  }

  function bsMon(b, uid, side) {
    let r = b.mons[uid];
    if (!r) {
      r = b.mons[uid] = { uid, side, id: null, lv: null, dealt: 0, taken: 0, ko: 0, hits: 0, crits: 0, misses: 0, moves: {} };
      const live = bsFind(uid);
      if (live) { r.id = live.id; r.lv = live.level; r.shiny = !!live.shiny; }
    }
    return r;
  }
  /** 在当前战斗和队伍里找 uid 对应的宝可梦；全箱索引每场只建一次 */
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

  function bsStart(ev) {
    const st = bstatsInit();
    if (st.cur) bsEnd('中断');
    const save = liveSave();
    const bt = save && save.adv && save.adv.battle;
    st.cur = {
      at: now(), kind: (ev && ev.kind) || (bt && bt.kind) || '?', ch: save && save.adv ? save.adv.chapter : null,
      foes: bt ? (bt.enemies || []).map((e) => [e.id, e.level]) : ev && ev.enemy ? [[ev.enemy.id, ev.enemy.level]] : [],
      leader: bt && bt.gym ? bt.gym.leader || null : null, mons: {}, hpLeft: {}, result: null,
    };
  }

  function bsEnd(result) {
    const st = bstatsInit();
    const b = st.cur;
    if (!b) return;
    b.result = result;
    b.ms = now() - b.at;
    bsIdx = null;
    st.done.unshift(b);
    if (st.done.length > BSTATS_KEEP) st.done.length = BSTATS_KEEP;
    st.cur = null;
  }

  function bsAttack(ev) {
    const st = bstatsInit();
    if (!st.cur) bsStart(null);
    const b = st.cur;
    const ally = ev.side === 'ally';
    const atk = bsMon(b, ev.uid, ally ? 'me' : 'foe');
    const def = bsMon(b, ev.target, ally ? 'foe' : 'me');
    const before = b.hpLeft[ev.target] != null ? b.hpLeft[ev.target] : (ev.hp != null ? ev.hp + (ev.damage || 0) : ev.damage || 0);
    const dmg = Math.max(0, Math.min(ev.damage || 0, before));
    if (ev.hp != null) b.hpLeft[ev.target] = ev.hp;
    const mv = ev.move && ((ev.move.key && TA_MVNAME[ev.move.key]) || ev.move.name || ev.move.key);
    if (mv) atk.moves[mv] = (atk.moves[mv] || 0) + 1;
    if (ev.miss) { atk.misses++; return; }
    atk.hits++;
    if (ev.crit) atk.crits++;
    atk.dealt += dmg;
    def.taken += dmg;
    if (ev.hp != null && ev.hp <= 0 && before > 0) atk.ko++;
  }

  /** 挂钩回调：kind = 'step' | 'tick'，events = 游戏返回的事件数组 */
  function bsTap(kind, events) {
    if (!Array.isArray(events) || !events.length) return;
    S.tapAt = S.lastActivityAt = S.lastProgressAt = now();
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      try {
        if (ev.type === 'battleStart') bsStart(ev);
        else if (ev.type === 'attack' && ev.uid != null && ev.target != null) bsAttack(ev);
        else if (ev.type === 'victory' || ev.type === 'eliteWin') bsEnd('胜');
        else if (ev.type === 'defeat') bsEnd('败');
        else if (ev.type === 'fled' || ev.type === 'legendFled') bsEnd('逃跑');
      } catch { /* 统计出错不影响游戏 */ }
    }
  }

  function installBattleStats() {
    bstatsInit();
    try { PAGE_WIN.__pcautoTap = bsTap; } catch { /* 忽略 */ }
  }

  const BS_KIND = { wild: '野生', trainer: '训练家', gym: '馆主', static: '定点', event: '活动', zone: '区域', raid: '团体战', tower: '对战塔', league: '联盟' };

  /** 一场的表格：我方按造成伤害排序；敌方列出承伤与击倒 */
  function battleStatsHtml(b) {
    if (!b) return '<div class="p-sub">还没有记录到战斗</div>';
    const name = (r) => (r.id ? TA_NAME[r.id - 1] || `#${r.id}` : '?');
    const mine = Object.values(b.mons).filter((r) => r.side === 'me').sort((x, y) => y.dealt - x.dealt);
    const foes = Object.values(b.mons).filter((r) => r.side === 'foe');
    const total = mine.reduce((s, r) => s + r.dealt, 0) || 1;
    const top = (r) => Object.entries(r.moves).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, n]) => `${esc(k)}×${n}`).join(' ');
    const foeTxt = (b.foes || []).map(([id, lv]) => `${TA_NAME[id - 1] || '#' + id} Lv.${lv}`).join('、');
    return `<div class="p-sub">${BS_KIND[b.kind] || esc(b.kind)}${b.leader ? ' · ' + esc(b.leader) : ''}${b.ch != null ? ` · 第 ${b.ch + 1} 章` : ''} · ${b.result || '进行中'}${b.ms ? ` · ${Math.round(b.ms / 1000)} 秒` : ''}${foeTxt ? ` · 对手：${esc(foeTxt)}` : ''}</div>
      <table><tr><th>我方</th><th>造成伤害</th><th>占比</th><th>承伤</th><th>击倒</th><th>命中/落空/暴击</th><th>常用招式</th></tr>
      ${mine.map((r) => `<tr><td>${esc(name(r))}${r.lv ? ` <span class="p-sub">Lv.${r.lv}</span>` : ''}</td><td>${fmt(Math.round(r.dealt))}</td><td>${Math.round((r.dealt / total) * 100)}%</td>
        <td>${fmt(Math.round(r.taken))}</td><td>${r.ko}</td><td>${r.hits}/${r.misses}/${r.crits}</td><td class="p-sub">${top(r)}</td></tr>`).join('') || '<tr><td colspan="7" class="p-sub">我方没有出手</td></tr>'}
      </table>
      ${foes.length ? `<table style="margin-top:4px"><tr><th>敌方</th><th>造成伤害</th><th>承伤</th><th>击倒</th></tr>
      ${foes.map((r) => `<tr><td>${esc(name(r))}${r.lv ? ` <span class="p-sub">Lv.${r.lv}</span>` : ''}</td><td>${fmt(Math.round(r.dealt))}</td><td>${fmt(Math.round(r.taken))}</td><td>${r.ko}</td></tr>`).join('')}</table>` : ''}`;
  }

  /** 日志战报页的「实战统计」区块：当前战斗 + 最近一场馆主 / 首领战 + 最近一场 */
  function battleStatsSection() {
    if (!nsOk()) return `<h4>实战统计</h4><div class="p-sub">没接入游戏内部接口（${esc(nsWhy())}），无法统计每只宝可梦的伤害</div>`;
    const st = bstatsInit();
    const boss = st.done.find((b) => ['gym', 'raid', 'zone', 'event', 'league'].includes(b.kind));
    const last = st.done[0];
    return `<h4>实战统计</h4>
      ${st.cur ? `<div class="p-sub" style="margin-top:4px">当前战斗</div>${battleStatsHtml(st.cur)}` : ''}
      ${last ? `<div class="p-sub" style="margin-top:6px">上一场</div>${battleStatsHtml(last)}` : ''}
      ${boss && boss !== last ? `<div class="p-sub" style="margin-top:6px">最近一场首领战</div>${battleStatsHtml(boss)}` : ''}
      ${!st.cur && !last ? '<div class="p-sub">还没有记录到战斗（刷新后从下一场开始统计）</div>' : ''}`;
  }
