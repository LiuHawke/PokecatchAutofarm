  /* ====================== 属性克制面：队伍的进攻盲区、防守弱点和补位推荐 ====================== */
  /*
   * 进攻：18 种单属性对手，队里所有攻击招（按招式禁用后）能打出的最高倍率。
   * 防守：18 种攻击属性，队里几只被克制、几只能抵抗。
   * 补位：对当前推进目标的敌人，PC 里谁能补上队伍打不动 / 扛不住的地方；拿到游戏接口时再列本章野外能抓到的。
   * 只提醒，不换队。结果按存档和目标缓存 30 秒。
   */

  const COV_TTL = 30000;
  let covCache = null;

  const covTypeCn = (t) => TA_TYPE_CN[TA_TYPES[t]] || '?';
  /** 一个单位的攻击招对某组属性的最高倍率 */
  function covBest(u, defTypes) {
    let best = 0, mv = null;
    for (const m of u.moves) {
      if (!(m.p > 0)) continue;
      const e = btEff(m.t, defTypes, true);
      if (e > best) { best = e; mv = m; }
    }
    return { e: best, mv };
  }

  function covTeam(units) {
    const off = [], def = [];
    for (let t = 0; t < 18; t++) {
      let best = 0, who = null;
      for (const u of units) { const b = covBest(u, [t]); if (b.e > best) { best = b.e; who = u; } }
      off.push({ t, e: best, who });
      let weak = 0, resist = 0;
      for (const u of units) { const e = btEff(t, u.types, true); if (e > 1) weak++; else if (e < 1) resist++; }
      def.push({ t, weak, resist });
    }
    return { off, def, blind: off.filter((x) => x.e < 1).map((x) => x.t), hole: def.filter((x) => x.weak >= 2 && x.resist === 0).map((x) => x.t) };
  }

  /** 目标敌人：属性组合和它们会用的攻击属性 */
  function covFoes(tgt) {
    const foes = [];
    const seen = new Set();
    for (const r of (tgt && tgt.rooms) || []) {
      for (const u of r.foes || []) {
        if (!u || seen.has(u.id)) continue;
        seen.add(u.id);
        foes.push({ id: u.id, types: u.types, atk: [...new Set(u.moves.filter((m) => m.p > 0).map((m) => m.t))] });
      }
    }
    return foes;
  }

  /** 候选能补多少：对每个敌人，进攻倍率比队里最好的高出多少；敌人的攻击属性里，队里怕而它能抗的 */
  function covGain(c, team, foes, cov) {
    let off = 0, def = 0;
    const why = [];
    for (const f of foes) {
      const have = Math.max(0, ...team.map((u) => covBest(u, f.types).e));
      const b = covBest(c, f.types);
      if (b.e > have && b.e > 1) { off += Math.min(2, b.e - have); why.push(`${TA_MVNAME[b.mv.key] || b.mv.key}打${TA_NAME[f.id - 1] || f.id} ×${b.e}`); }
    }
    const scared = new Set();
    for (const f of foes) for (const t of f.atk) if (team.filter((u) => btEff(t, u.types, true) > 1).length >= 2) scared.add(t);
    for (const t of scared) if (btEff(t, c.types, true) < 1) { def += 1; why.push(`抗${covTypeCn(t)}`); }
    const blind = cov.blind.filter((t) => covBest(c, [t]).e >= 1).length;
    return { score: off * 2 + def + blind * 0.2, why: why.slice(0, 3), blind };
  }

  /** 本章野外能遇到的物种（游戏 zonePool，只读）；拿不到接口返回 null */
  function covWildIds(save) {
    const ns = NS();
    const adv = save && save.adv;
    if (!ns || !adv || !Array.isArray(adv.nodes)) return null;
    const out = new Map();
    for (const node of adv.nodes) {
      let pool;
      try { pool = ns.Adventure.zonePool(node, adv.chapter); } catch { continue; }
      for (const p of pool || []) if (p && p.id && btKnown(p.id) && !out.has(p.id)) out.set(p.id, Math.max(p.min || 1, p.max || 1));
    }
    return out;
  }

  function covCompute(save, f) {
    const byUid = new Map((save.mons || []).map((m) => [String(m.uid), m]));
    const teamMons = (save.team || []).map((u) => byUid.get(String(u))).filter(Boolean);
    const team = teamMons.map((m) => btUnit(m)).filter(Boolean);
    if (!team.length) return null;
    const cov = covTeam(team);
    const tgt = teamTarget('auto', f);
    const foes = covFoes(tgt);
    const minLv = Math.min(...team.map((u) => u.lv));
    const inTeam = new Set(teamMons.map((m) => String(m.uid)));
    const pcPick = [];
    if (foes.length) {
      for (const m of teamPool(save, f.region)) {
        if (inTeam.has(String(m.uid)) || (m.level || 1) < minLv - 10) continue;
        const u = btUnit(m);
        if (!u) continue;
        const g = covGain(u, team, foes, cov);
        if (g.score > 0) pcPick.push({ m, ...g });
      }
      pcPick.sort((a, b) => b.score - a.score || (b.m.level || 0) - (a.m.level || 0));
    }
    // 同一物种只留等级最高的那只
    const pcTop = [];
    const pcIds = new Set();
    for (const p of pcPick) { if (pcIds.has(p.m.id)) continue; pcIds.add(p.m.id); pcTop.push(p); if (pcTop.length >= 3) break; }
    let wild = null;
    const ids = foes.length ? covWildIds(save) : null;
    if (ids) {
      const owned = new Set((save.mons || []).map((m) => m.id));
      const lv = Math.max(minLv, f.cap || minLv);
      wild = [];
      for (const [id] of ids) {
        if (owned.has(id)) continue;
        const u = btUnit({ id, level: lv });
        if (!u) continue;
        const g = covGain(u, team, foes, cov);
        if (g.score > 0) wild.push({ id, ...g });
      }
      wild.sort((a, b) => b.score - a.score);
      wild = wild.slice(0, 3);
    }
    return { cov, label: tgt ? tgt.label : '', foes: foes.length, pcTop, wild };
  }

  function coverageSection(f) {
    const save = S.save || {};
    const sig = [(save.team || []).join(','), (save.mons || []).length, f.ch, f.gymCh, f.cap].join('|');
    if (!covCache || covCache.sig !== sig || now() - covCache.at > COV_TTL) {
      let r = null;
      try { r = covCompute(save, f); } catch (e) { r = { error: String((e && e.message) || e) }; }
      covCache = { sig, at: now(), r };
    }
    const r = covCache.r;
    if (!r) return '';
    if (r.error) return `<h4>属性克制面</h4><div class="p-sub">算不出来：${esc(r.error)}</div>`;
    const effTxt = (e) => (e === 0 ? '0' : e >= 4 ? '4' : e >= 2 ? '2' : e >= 1 ? '1' : '½');
    const offBg = (e) => (e >= 2 ? 'rgba(74,222,128,.22)' : e >= 1 ? 'transparent' : 'rgba(248,113,113,.22)');
    const defBg = (d) => (d.weak >= 2 && d.resist === 0 ? 'rgba(248,113,113,.22)' : d.resist > d.weak ? 'rgba(74,222,128,.16)' : 'transparent');
    const head = r.cov.off.map((x) => `<th title="${covTypeCn(x.t)}">${covTypeCn(x.t).slice(0, 1)}</th>`).join('');
    const offRow = r.cov.off.map((x) => `<td style="background:${offBg(x.e)}" title="${x.who ? esc(TA_NAME[x.who.id - 1] || '') : '没有攻击招'}">${effTxt(x.e)}</td>`).join('');
    const defRow = r.cov.def.map((d) => `<td style="background:${defBg(d)}" title="${d.weak} 只被克、${d.resist} 只抵抗">${d.weak}/${d.resist}</td>`).join('');
    const tc = (ts) => ts.map(covTypeCn).join('、');
    const pick = (list, nameOf) => list.map((p) => `<div class="pa-row"><span>${nameOf(p)}</span><b class="p-sub" style="font-weight:400">${esc(p.why.join('；') || `补上 ${p.blind} 个进攻盲区`)}</b></div>`).join('');
    return `<h4>属性克制面</h4>
      <table class="tm-mx"><tr><th></th>${head}</tr><tr><td>进攻</td>${offRow}</tr><tr><td>被克/抗</td>${defRow}</tr></table>
      <div class="p-sub" style="margin-top:3px">${r.cov.blind.length ? `进攻盲区（打不出一倍）：${tc(r.cov.blind)}。` : '18 种属性都能打出至少一倍。'}${r.cov.hole.length ? `防守弱点（≥2 只被克、没人抵抗）：${tc(r.cov.hole)}。` : ''}招式按您设置的禁用计算。</div>
      ${r.foes ? `<div class="p-sub" style="margin-top:6px">针对${esc(r.label)}可补位：</div>
        ${pick(r.pcTop, (p) => `${esc(taMonName(p.m))} <span class="p-sub">Lv.${p.m.level}（PC）</span>`) || '<div class="p-sub">PC 里没有能明显补位的</div>'}
        ${r.wild ? pick(r.wild, (p) => `${esc(TA_NAME[p.id - 1] || '#' + p.id)} <span class="p-sub">（本章野外，未拥有）</span>`) : ''}` : ''}`;
  }
