  /* ====================== 主面板：概览 / 队伍 / 日程 / 日志战报 / 设置 ====================== */

  const PANEL_TABS = [['ov', '概览'], ['team', '配队'], ['plan', '日程'], ['log', '日志战报'], ['set', '设置']];
  let panelTab = 'ov';

  function openPanel(tab) {
    if (tab) panelTab = tab;
    let box = $('#pcauto-panel');
    if (box && !tab) { box.remove(); return; }
    ensureCss();
    if (!box) {
      box = document.createElement('div');
      box.id = 'pcauto-panel';
      box.innerHTML = `<div class="p-box">
        <div class="p-top"><b style="font-size:15px">挂机助手</b><span class="p-sub">v${VERSION} · 设置自动保存</span>
          <span style="flex:1"></span><button class="pa-btn" id="pcauto-p-x">关闭</button></div>
        <div class="p-tabs">${PANEL_TABS.map(([k, t]) => `<button class="p-tab" data-tab="${k}">${t}</button>`).join('')}</div>
        <div class="p-body" id="pcauto-p-body"></div></div>`;
      document.documentElement.appendChild(box);
      $('#pcauto-p-x', box).onclick = () => box.remove();
      box.onclick = (e) => { if (e.target === box) box.remove(); };
      $$('.p-tab', box).forEach((b) => { b.onclick = () => { panelTab = b.dataset.tab; renderPanel(true); }; });
    }
    renderPanel(true);
  }
  /** 兼容 3.x 的入口名 */
  function openSettings() { openPanel('set'); }

  /** full=false 时是定时刷新：设置页、配队页不重绘（免得打断输入和点击），其他页按最新状态重绘 */
  function renderPanel(full) {
    const box = $('#pcauto-panel');
    if (!box) return;
    if (!full && (panelTab === 'set' || panelTab === 'team')) return;
    $$('.p-tab', box).forEach((b) => b.classList.toggle('on', b.dataset.tab === panelTab));
    const body = $('#pcauto-p-body', box);
    const keep = body.scrollTop;
    const fn = { ov: panelOverview, team: panelTeam, plan: panelSchedule, log: panelLog, set: panelSettings }[panelTab];
    fn(body);
    if (!full) body.scrollTop = keep;
  }

  /* ---------- 概览 ---------- */

  function panelOverview(body) {
    const save = S.save || {};
    const f = facts(save);
    if (!f) { body.innerHTML = '<div class="p-sub">还没读到存档</div>'; return; }
    const plan = S.plan || planProgress(f, progState(), S.cfg);
    const g = f.gym;
    const cn = (ts) => ts.map((t) => TA_TYPE_CN[t] || t).join('、');
    const candy = candyPlanFor(save);
    const want = shopWant(save);
    const wantTxt = Object.entries(want).map(([k, n]) => `${(CANDIES.find((c) => c.key === k) || {}).zh || k} ×${n}`).join('、');
    body.innerHTML = `
      ${alertsHtml()}
      <h4>主线</h4>
      ${uiRow('当前', `${esc(f.regionZh)} 第 ${f.ch + 1} 章 · ${esc(f.cur.n || '')}`)}
      ${uiRow('推进到', `第 ${f.unlocked + 1} 章${f.loops.length ? ` · 循环 ${f.loops.map(loopName).join('、')}` : ''}`)}
      ${uiRow('等级上限', `Lv.${f.cap}（全队${f.atCap ? '已到上限' : `最低 Lv.${f.teamMin}`}）`, f.atCap ? '#ffcb05' : undefined)}
      ${g ? uiRow('下一个馆主', `${esc(g.l)} · ${cn(g.t)}系 · 王牌 Lv.${g.ace}`) : ''}
      ${g ? uiRow('推荐属性', `打：${cn(g.ct)}　抗：${cn(g.rt)}`) : ''}
      <div class="pa-note ${planTone(plan)}">${esc(plan.why)}${plan.key === 'hold' ? '<div class="p-btns"><button class="pa-btn" id="pcauto-p-unhold">不是我换的，恢复自动推进</button></div>' : ''}</div>
      <h4>经验糖</h4>
      ${uiRow('全队离上限还差', `${fmt(f.xpDemand)} 经验 · 手上糖约 ${fmt(f.candyOwnedXp)}`)}
      ${candy.length ? `<div class="p-sub">喂糖方案：${candy.map((p) => `${esc(p.name)} ${p.list.length} 颗`).join('、')}</div>` : '<div class="p-sub">现在没有可以不溢出地喂进去的糖</div>'}
      ${wantTxt ? `<div class="p-sub">还缺：${esc(wantTxt)}${S.cfg.autoShop ? '（全托管会自动按需买）' : ''}</div>` : ''}
      <h4>收益</h4>
      ${uiRow('捕获 /时', `${fmt(S.rate.catch)}${S.avg.catch ? `（均 ${fmt(S.avg.catch)}）` : ''}`)}
      ${uiRow('战斗 /时', `${fmt(S.rate.battle)}`)}
      ${uiRow('金钱 /时', `₽ ${fmt(S.rate.money)} · 现有 ₽ ${fmt(f.money)}`)}
      ${uiRow('本次运行', `${((now() - S.bootAt) / 60000).toFixed(0)} 分钟 · 闪光 ${S.shinySession} · 失败 ${S.deaths ?? 0}`)}
      <div class="p-btns">
        <button class="pa-btn acc" id="pcauto-p-feed">按上限精确喂糖</button>
        <button class="pa-btn" id="pcauto-p-bak">立即备份存档</button>
        <button class="pa-btn" id="pcauto-p-diag">自检与诊断</button>
      </div>`;
    $('#pcauto-p-feed', body).onclick = async () => { const r = await feedAllCandy(); log('item', '喂糖：' + r); };
    $('#pcauto-p-bak', body).onclick = () => { const r = backupNow('manual'); log(r.ok ? 'info' : 'warn', (r.ok ? '' : '备份失败：') + r.msg); };
    $('#pcauto-p-diag', body).onclick = openDiag;
    const uh = $('#pcauto-p-unhold', body);
    if (uh) uh.onclick = () => { progState().holdUntil = 0; persistProg(); S.plan = null; log('info', '已恢复自动推进'); renderPanel(true); };
  }

  /* ---------- 配队 ---------- */

  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  const ago = (t) => `${Math.max(0, Math.round((now() - t) / 60000))} 分钟前算的`;
  const winBg = (p) => (p >= 0.7 ? 'rgba(74,222,128,.22)' : p >= 0.4 ? 'rgba(251,191,36,.2)' : 'rgba(248,113,113,.2)');
  const monImg = (id) => `<img src="assets/pokemon/${id}.png" alt="" loading="lazy">`;

  function panelTeam(body) {
    const save = S.save || {};
    const f = facts(save);
    if (!f) { body.innerHTML = '<div class="p-sub">还没读到存档</div>'; return; }
    const redraw = () => { if (panelTab === 'team') renderPanel(true); };
    const tp = teamPlanGet('auto', redraw);
    const busy = teamPlanBusy('auto');
    const prefs = teamPrefs();
    const seg = `<div class="tm-seg"><b style="align-self:center">${esc(tp && tp.label ? tp.label : '推进目标')}</b>
      <span style="flex:1"></span><span class="p-sub" style="align-self:center">${busy ? (tp ? '正在补完整结果…' : '模拟中…') : tp && tp.at ? ago(tp.at) : ''}</span></div>`;
    const bind = () => {};
    if (!tp || tp.error) {
      body.innerHTML = `${seg}<div class="pa-note ${tp && tp.error ? 'warn' : 'info'}">${tp && tp.error ? esc(tp.error) : '正在按游戏战斗规则模拟（几秒钟）…'}</div>`;
      bind();
      return;
    }
    const byUid = new Map((save.mons || []).map((m) => [String(m.uid), m]));
    const useSet = new Set(tp.useUids);
    const curSet = new Set(tp.cur.uids);
    const monRow = (uid, cls) => {
      const m = byUid.get(uid);
      if (!m) return '';
      const pin = prefs.pins.includes(uid), tr = prefs.trainee === uid;
      return `<div class="tm-mon ${cls}">${monImg(m.id)}
        <div class="nm"><b>${esc(taMonName(m))}</b>${m.shiny ? '✨' : ''} <span class="p-sub">Lv.${m.level}</span><div class="p-sub">${esc(typesCn(m.id))}</div></div>
        <button class="tm-ic ${pin ? 'on' : ''}" data-pin="${esc(uid)}" title="锁定：自动换队不会换下">📌</button>
        <button class="tm-ic ${tr ? 'on' : ''}" data-tr="${esc(uid)}" title="练级新人：固定在队里，喂糖优先">🎓</button></div>`;
    };
    const curCol = tp.cur.uids.map((u) => monRow(u, tp.keep || useSet.has(u) ? '' : 'out')).join('') || '<div class="p-sub">队伍是空的</div>';
    const bestCol = tp.keep ? '<div class="p-sub" style="padding:6px 2px">现队已经是模拟出来最好的阵容</div>'
      : tp.best.uids.map((u) => monRow(u, curSet.has(u) ? '' : 'new')).join('');
    const tone = tp.kind === 'wild' ? 'ok' : (tp.keep ? tp.cur : tp.best).clear >= 0.6 ? 'ok' : tp.needLv != null ? 'warn' : 'bad';
    const name = (id) => TA_NAME[id - 1] || `#${id}`;
    const threat = (res, r) => {
      if (res.topLost !== undefined) return res.topLost ? `${esc(name(res.topLost))}${res.roadLoss >= 0.5 ? '（路上）' : ''}` : '—';
      const i = res.lostTo ? res.lostTo.indexOf(Math.max(...res.lostTo)) : -1;
      return i >= 0 && res.lostTo[i] > 0 ? esc(name(r.ids[i][0])) : '—';
    };
    const nat = tp.engine === 'native';
    const lgRun = nat && tp.native.league;
    const useR = (i) => (tp.keep ? tp.cur : tp.best).rooms[i];
    const roomRows = tp.kind === 'wild' ? '' : `<table><tr><th>对手</th><th>现队</th><th>${tp.keep ? '' : '推荐'}</th>${lgRun ? '<th>打到这间</th><th>进场剩血</th>' : nat ? '<th>到馆主剩血</th><th>倒在路上</th>' : ''}<th>主要威胁</th></tr>
      ${tp.rooms.map((r, i) => `<tr><td>${esc(r.name)}${r.champ ? ' 👑' : ''}</td>
        <td style="background:${winBg(tp.cur.rooms[i].win)}">${pct(tp.cur.rooms[i].win)}</td>
        <td style="background:${tp.keep ? 'none' : winBg(tp.best.rooms[i].win)}">${tp.keep ? '' : pct(tp.best.rooms[i].win)}</td>
        ${lgRun ? `<td>${pct(useR(i).reached || 0)}</td><td>${useR(i).arrive != null ? pct(useR(i).arrive) : '—'}</td>`
        : nat ? `<td>${useR(i).arrive != null ? pct(useR(i).arrive) : '—'}</td><td>${pct(useR(i).roadLoss || 0)}</td>` : ''}
        <td>${threat(useR(i), r)}</td></tr>`).join('')}</table>`;
    const engineNote = tp.kind === 'wild' ? '' : nat
      ? `<div class="pa-note ok" style="margin-top:6px">原生引擎：用游戏自己的战斗代码在沙盒里重放（${lgRun ? '各间按顺序连打，只在有宝可梦中心的间回血，有夜间阵容的间白天 / 夜晚轮流；每间胜率是「打到这间时」的胜率' : '从章节开头走到馆主，含路上训练家'}、招式禁用、状态抗性），每套 ${tp.native.runs} 次 · 比较了 ${tp.native.tried} 套 · ${(tp.native.ms / 1000).toFixed(1)} 秒。近似模型给的是：现队 ${pct(tp.model.cur)} / 推荐 ${pct(tp.model.best)}</div>`
      : `<div class="pa-note warn" style="margin-top:6px">近似模型（没接入游戏内部接口：${esc(tp.native && tp.native.error ? tp.native.error : nsWhy() || '本目标不支持')}）。下方数字没算路上训练家，会偏乐观</div>`;
    const mvZh = (k) => TA_MVNAME[k] || k;
    const lo = nat && tp.native.loadout;
    const mvList = (ks) => ks.map((k) => esc(mvZh(k))).join('、');
    const loadout = tp.kind === 'wild' ? ''
      : !nat ? `<h4>禁招建议</h4><div class="p-sub">需要游戏内部接口（${esc(nsWhy() || '没接入')}），接上后这里会给出禁招建议和一键禁招</div>`
      : !lo ? `<h4>禁招建议</h4><div class="p-sub">${busy ? '正在搜索…' : '后台只做了轻量计算，点上方「重新计算」后给出禁招建议'}</div>`
      : lo.none ? `<h4>禁招建议</h4><div class="p-sub">对战模拟逐只试了各种禁法，都没有比现在的招式设置明显更好（提升不足 2%），不用改。</div>${S.banUndo ? banApplyButtons('team', []) : ''}`
      : !lo.better
      ? `<h4>禁招建议</h4><div class="p-sub">模拟搜索出的禁法用原版重放复核：${pct(lo.before)} → ${pct(lo.after)}，提升不到 4%，不用改</div>${S.banUndo ? banApplyButtons('team', []) : ''}`
      : `<h4>禁招建议</h4>
      <div class="pa-note ok">按建议改招式禁用后原版重放通关率 ${pct(lo.before)} → ${pct(lo.after)}，值得改。
        可以一键让助手替您在游戏的招式抽屉里点（改完可撤销），也可以自己点开宝可梦 → 招式手动改。</div>
      ${lo.sug.map((s) => `<div class="pa-row"><span>${esc(taMonName(s.m))} Lv.${s.m.level}</span>
        <b class="p-sub" style="font-weight:400">${s.add.length ? `禁：${mvList(s.add)}` : ''}${s.add.length && s.enable.length ? '；' : ''}${s.enable.length ? `恢复：${mvList(s.enable)}` : ''}；攻击招留 ${mvList(s.keep)}</b></div>`).join('')}
      ${banApplyButtons('team', lo.sug)}
      <div class="p-sub">招式禁用对所有玩法生效。每只的禁法由对战模拟逐只搜索，再用游戏原版重放复核。</div>`;
    const whatIf = nat && tp.native.whatIf && tp.native.whatIf.length
      ? tp.native.whatIf.map((w) => uiRow(`全队再升 ${w.add} 级（原版重放）`, pct(w.clear), w.clear >= 0.6 ? '#4ade80' : undefined)).join('') : '';
    const mxMons = tp.useUids.map((u) => byUid.get(u)).filter(Boolean);
    const matrix = tp.matrix.map((room) => `<div class="p-sub" style="margin:6px 0 2px">${esc(room.name)}</div>
      <table class="tm-mx"><tr><th></th>${room.cols.map((c) => `<th title="${esc(name(c.id))} Lv.${c.lv}">${monImg(c.id)}<div>${c.lv}</div></th>`).join('')}</tr>
      ${mxMons.map((m, i) => `<tr><td title="${esc(taMonName(m))}">${esc(taMonName(m))}</td>${room.cols.map((c) => `<td class="${c.sent === i ? 'sent' : ''}" style="background:${winBg(c.cells[i])}">${Math.round(c.cells[i] * 100)}</td>`).join('')}</tr>`).join('')}</table>`).join('');
    const trM = prefs.trainee && byUid.get(prefs.trainee);
    const trainee = trM
      ? `<div class="pa-note info">练级新人：${esc(taMonName(trM))} Lv.${trM.level}（固定在队里，喂糖优先）<button class="pa-btn" data-tr="${esc(prefs.trainee)}" style="margin-left:6px">取消</button></div>`
      : tp.trainee ? `<div class="pa-note info">建议培养 <b>${esc(taMonName(tp.trainee.m))}</b> Lv.${tp.trainee.m.level}：升到 Lv.${tp.cap} 后换下 ${esc(monLabel(tp.trainee.out))}，升满通关率约 ${tp.trainee.nclear != null ? `${pct(tp.trainee.nclear)}（原版重放）` : pct(tp.trainee.clear)}
          <div class="p-btns"><button class="pa-btn acc" id="pcauto-tm-train">设为新人并带上</button></div></div>` : '';
    const evo = tp.evo.length ? `<h4>道具进化（只提醒，不会替您使用）</h4>${tp.evo.map((e) => `<div class="pa-row"><span>${esc(taMonName(e.m))} Lv.${e.m.level} → ${esc(name(e.to))}</span>
        <b>${esc(e.itemZh)} ×${e.have}${e.delta != null ? ` · 通关率 ${e.delta >= 0 ? '+' : ''}${Math.round(e.delta * 100)}%` : ''}</b></div>`).join('')}` : '';

    body.innerHTML = `${seg}
      <div class="pa-note ${tone}">${esc(tp.label)}：${esc(tp.verdict)}</div>
      ${tp.kind === 'wild' ? uiRow('胜率', `现队 ${pct(tp.cur.clear)}${tp.keep ? '' : ` → 推荐 ${pct(tp.best.clear)}`}`)
        : `${uiRow('通关率', `现队 ${pct(tp.cur.clear)}${tp.keep ? '' : ` → 推荐 ${pct(tp.best.clear)}`}`, (tp.keep ? tp.cur : tp.best).clear >= 0.6 ? '#4ade80' : undefined)}
           ${whatIf}${uiRow(`全队升到 Lv.${tp.cap}（近似模型）`, pct(tp.atCap.clear))}${engineNote}`}
      <div class="p-btns">
        ${tp.keep ? '' : '<button class="pa-btn pri" id="pcauto-tm-apply">一键换上推荐</button>'}
        <button class="pa-btn" id="pcauto-tm-undo" ${S.teamUndo ? '' : 'disabled'}>撤销上次换队</button>
        <button class="pa-btn" id="pcauto-tm-mark">在 PC 里标出</button>
        <button class="pa-btn" id="pcauto-tm-re" ${busy ? 'disabled' : ''}>重新计算</button>
      </div>
      ${trainee}
      <div class="tm-cols" style="margin-top:8px"><div><h4>现在的队伍</h4>${curCol}</div><div><h4>${tp.keep ? '推荐' : '推荐（绿框 = 新换上）'}</h4>${bestCol}</div></div>
      ${roomRows ? `<h4>各间胜率</h4>${roomRows}` : ''}
      ${loadout}
      ${coverageSection(f)}
      ${eliteSection(f)}
      ${matrix ? `<h4>单挑胜率（%）· 黄框 = 游戏自动换人会派出的那只</h4>${matrix}` : ''}
      ${evo}
      ${zoneSection(f)}
      <div class="p-sub" style="margin-top:10px">${nat ? '通关率来自游戏原版战斗重放；单挑表、进化、练级新人仍用近似模型（1 对 1 车轮战，按属性克制自动换人）。' : '模拟按游戏规则：1 对 1 车轮战，新敌人出场时游戏按属性克制自动换人；含命中、暴击、状态招。每间之前在宝可梦中心回满，道中训练师未计入。'}冒险途中换人要到下一个宝可梦中心才生效。</div>`;
    bind();
    $$('[data-pin]', body).forEach((b) => { b.onclick = () => { togglePin(b.dataset.pin); renderPanel(true); }; });
    $$('[data-tr]', body).forEach((b) => { b.onclick = () => { setTrainee(b.dataset.tr); renderPanel(true); }; });
    const ap = $('#pcauto-tm-apply', body);
    if (ap) ap.onclick = async () => {
      S.counterFor = f.unlocked;
      const r = await applyTeam(tp.best.uids, `换上推荐队（${tp.label}）`);
      if (!r.ok) log('warn', '换队没完成：' + r.msg);
      renderPanel(true);
    };
    const trBtn = $('#pcauto-tm-train', body);
    if (trBtn) trBtn.onclick = async () => {
      const t = tp.trainee;
      setTrainee(t.uid);
      const target = tp.useUids.map((u) => (u === t.out ? t.uid : u));
      const r = await applyTeam(target, `带上练级新人 ${taMonName(t.m)}`);
      if (!r.ok) log('warn', '换队没完成：' + r.msg);
      renderPanel(true);
    };
    $('#pcauto-tm-undo', body).onclick = async () => { const r = await undoTeam(); if (!r.ok) log('warn', r.msg); renderPanel(true); };
    $('#pcauto-tm-mark', body).onclick = () => {
      const n = teamHighlight(tp.useUids);
      log('info', n ? `已在格子上标出推荐的 ${n} 只（黄色序号）` : '当前界面没有可标记的格子：先打开游戏的「队伍」页');
    };
    $('#pcauto-tm-re', body).onclick = () => { teamPlanGet('auto', redraw, true); renderPanel(true); };
    const zb = $('#pcauto-tm-zone', body);
    if (zb) zb.onclick = () => { teamPlanGet('zone', redraw, true); renderPanel(true); };
    bindElite(body, f, redraw);
    bindBanApply(body, redraw);
  }

  /** 精英联盟：选阶级 → 整轮重放选队（约 20 秒，点了才算，只推荐不换队） */
  function eliteSection(f) {
    const tiers = eliteTiers(f.region);
    if (!tiers.length) return '';
    const ep = S.elitePick || {};
    const same = ep.region === f.region;
    const tier = same && ep.tier ? ep.tier : tiers[0];
    const sel = `<select id="pcauto-el-tier">${tiers.map((t) => `<option value="${t}" ${t === tier ? 'selected' : ''}>阶级 ${t}</option>`).join('')}</select>`;
    const btn = `<button class="pa-btn" id="pcauto-el-go" ${ep.busy ? 'disabled' : ''}>${ep.busy ? `重放中…（已比较 ${ep.n || 0} 套）` : '整轮重放选队'}</button>`;
    let out = '';
    const r = same && ep.tier === tier ? ep.res : null;
    if (r && r.error) out = `<div class="pa-note warn">${esc(r.error)}</div>`;
    else if (r) {
      const name = (id) => TA_NAME[id - 1] || `#${id}`;
      const row = (res) => res.rooms.map((x, i) => {
        const top = Object.entries(x.lostTo || {}).sort((a, b) => b[1] - a[1])[0];
        return `<tr><td>${esc(r.stages[i].leader)}${r.stages[i].night ? ' 🌙' : ''}${r.stages[i].heal ? ' ✚' : ''}</td><td>${pct(x.reached)}</td>
          <td style="background:${winBg(x.win)}">${x.reached ? pct(x.win) : '—'}</td><td>${top ? esc(name(+top[0])) : '—'}</td></tr>`;
      }).join('');
      out = `<div class="pa-note ${r.best.clear >= 0.6 ? 'ok' : 'warn'}">推荐队整轮通关率 ${pct(r.best.clear)}${r.cur && r.cur !== r.best ? `（现在的精英联盟队 ${pct(r.cur.clear)}）` : ''} · 比较了 ${r.tried} 套 · ${(r.ms / 1000).toFixed(1)} 秒</div>
        <div class="p-sub">${r.team.map((m) => `${esc(taMonName(m))} Lv.${m.level}${m.rank ? ` ◆${m.rank}` : ''}`).join('、')}</div>
        <table style="margin-top:4px"><tr><th>对手（🌙 有夜间阵容 · ✚ 会回血）</th><th>打到</th><th>胜率</th><th>主要威胁</th></tr>${row(r.best)}</table>
        <div class="p-btns"><button class="pa-btn" id="pcauto-el-mark">在 PC 里标出</button></div>
        ${r.ban && r.ban.better ? `<div class="pa-note ok" style="margin-top:6px">禁招建议：整轮通关率 ${pct(r.ban.before)} → ${pct(r.ban.after)}（原版重放复核）</div>
          ${r.ban.sug.map((s) => `<div class="pa-row"><span>${esc(taMonName(s.m))}</span><b class="p-sub" style="font-weight:400">${s.add.length ? `禁：${s.add.map((k) => esc(TA_MVNAME[k] || k)).join('、')}` : ''}${s.enable.length ? ` 恢复：${s.enable.map((k) => esc(TA_MVNAME[k] || k)).join('、')}` : ''}</b></div>`).join('')}
          ${banApplyButtons('elite', r.ban.sug)}` : r.ban ? `<div class="p-sub">禁招：模拟搜出的禁法原版重放 ${pct(r.ban.before)} → ${pct(r.ban.after)}，不用改</div>` : ''}
        <div class="p-sub">精英联盟的队伍在游戏的联盟入口里选，这里只给推荐。</div>`;
    }
    return `<h4>精英联盟</h4><div class="pa-row"><span>${sel}</span>${btn}</div>${out}`;
  }
  function bindElite(body, f, redraw) {
    const go = $('#pcauto-el-go', body);
    if (go) go.onclick = async () => {
      const tier = Number($('#pcauto-el-tier', body).value) || 1;
      S.elitePick = { region: f.region, tier, busy: true, n: 0 };
      renderPanel(true);
      const res = await eliteLeaguePick(f.region, tier, (n) => { S.elitePick.n = n; });
      S.elitePick = { region: f.region, tier, busy: false, res };
      redraw();
    };
    const sel = $('#pcauto-el-tier', body);
    if (sel) sel.onchange = () => { if (!(S.elitePick || {}).busy) { S.elitePick = { ...(S.elitePick || {}), region: f.region, tier: Number(sel.value) }; renderPanel(true); } };
    const mk = $('#pcauto-el-mark', body);
    if (mk) mk.onclick = () => {
      const r = S.elitePick && S.elitePick.res;
      const n = r && r.team ? teamHighlight(r.team.map((m) => String(m.uid))) : 0;
      log('info', n ? `已在格子上标出精英联盟推荐的 ${n} 只` : '当前界面没有可标记的格子：先打开游戏的「队伍」页');
    };
  }

  /** 刷级稳定度：现队在当前区域野怪里的胜率（近似模型，点了才算） */
  function zoneSection(f) {
    const zp = (S.teamPlans || {}).zone;
    const busy = teamPlanBusy('zone');
    const fresh = zp && !zp.error && zp.ch === f.ch;
    const btn = `<button class="pa-btn" id="pcauto-tm-zone" ${busy ? 'disabled' : ''}>${busy ? '计算中…' : fresh ? '重新计算' : '点击计算'}</button>`;
    if (!fresh) {
      return `<h4>刷级稳定度</h4><div class="pa-row"><span class="p-sub">现队在这里刷野怪会不会翻车${zp && zp.error ? `（上次：${esc(zp.error)}）` : ''}</span>${btn}</div>`;
    }
    const name = (id) => TA_NAME[id - 1] || `#${id}`;
    const weak = zp.rooms.map((r, i) => ({ r, w: zp.cur.rooms[i].win })).sort((a, b) => a.w - b.w).slice(0, 3).filter((x) => x.w < 0.95);
    const tone = zp.cur.clear >= 0.9 ? 'ok' : zp.cur.clear >= 0.7 ? 'warn' : 'bad';
    return `<h4>刷级稳定度</h4>
      <div class="pa-note ${tone}">现队对这里的野怪平均胜率 ${pct(zp.cur.clear)}${zp.keep ? '' : `；只为刷级换队可到 ${pct(zp.best.clear)}`}</div>
      ${weak.length ? uiRow('最难打', weak.map((x) => `${esc(name(x.r.ids[0][0]))} Lv.${x.r.ids[0][1]} ${pct(x.w)}`).join('、')) : ''}
      <div class="pa-row"><span class="p-sub">近似模型 · ${ago(zp.at)}</span>${btn}</div>`;
  }

  /* ---------- 日程 ---------- */

  function panelSchedule(body) {
    const save = S.save || {};
    const f = facts(save);
    if (!f) { body.innerHTML = '<div class="p-sub">还没读到存档</div>'; return; }
    const modes = modeStatus(save, f);
    const color = { '可玩': '#4ade80', '临近截止': '#fbbf24', '今日已打': '#6b7488', '未解锁': '#6b7488' };
    const pen = save.pension || {};
    const eggs = (pen.eggs || []).filter(Boolean);
    const penMons = (pen.mons || []).filter(Boolean).map((p) => p.mon || p);
    const eggGoal = pen.eggGoal || 0;
    const ditto = penMons.some((m) => m.id === DITTO_ID);
    const buffs = Object.values(buffState(save));
    body.innerHTML = `
      <h4>每日 / 每周玩法</h4>
      <table><tr><th>玩法</th><th>周期</th><th>状态</th><th>说明</th></tr>
      ${modes.map((m) => `<tr><td>${esc(m.zh)}</td><td>${m.cycle}</td><td style="color:${color[m.state] || '#e8ecf4'}">${m.state}</td><td class="p-sub">${esc(m.hint || '')}</td></tr>`).join('')}</table>
      <div class="p-sub" style="margin-top:6px">这些玩法需要登录拿服务器数据，结果由服务器校验，脚本只提醒不代打。攻略顺序：宝可方块首领 → 糖果工厂 → 团体战 → 对战塔（有里程碑且临近周一 08:00）→ 主线；地下通道不占队伍，随时派。</div>
      ${eventTeamSection()}
      <h4>培育屋</h4>
      ${uiRow('寄放', `${penMons.length} 只${ditto ? '（有百变怪）' : '（没有百变怪，下蛋只能同家族配对）'}`)}
      ${penMons.length ? `<div class="p-sub">${penMons.map((m) => esc(taMonName(m)) + (m.shiny ? '✨' : '')).join('、')}</div>` : ''}
      ${uiRow('下一个蛋', eggGoal ? `进度 ${Math.min(100, Math.round(((pen.egg || 0) / eggGoal) * 100))}%` : '—')}
      ${eggs.map((e) => uiRow(`蛋 · ${esc(taMonName({ id: e.id }))}`, e.hatchAt <= now() ? '可以孵化' : `${fmtDur(e.hatchAt - now())} 后孵化`, e.hatchAt <= now() ? '#4ade80' : undefined)).join('')}
      <h4>树果增益</h4>
      ${buffs.length ? buffs.map((b) => uiRow(esc((BERRY_BUFFS[b.key] || {}).label || b.key), `剩 ${b.leftMin} 分钟`)).join('') : '<div class="p-sub">没有生效中的增益</div>'}`;
    bindEventTeam(body, () => { if (panelTab === 'plan') renderPanel(true); });
  }

  /* ---------- 日志战报 ---------- */

  function panelLog(body) {
    const tone = { warn: '#fbbf24', badge: '#ffcb05', item: '#93c5fd', shiny: '#f472b6' };
    body.innerHTML = `
      <div class="p-btns" style="margin-top:0">
        <button class="pa-btn" id="pcauto-p-rs">本次会话战报</button>
        <button class="pa-btn" id="pcauto-p-rd">今日 / 昨日战报</button>
      </div>
      ${battleStatsSection()}
      <h4>最近 ${S.events.length} 条</h4>
      ${S.events.map((e) => `<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#5b6478">${e.t}</span> <span style="color:${tone[e.kind] || '#c7d0e0'}">${esc(e.msg)}</span></div>`).join('') || '<div class="p-sub">还没有事件</div>'}`;
    $('#pcauto-p-rs', body).onclick = () => { $('#pcauto-panel')?.remove(); showReport(reportSince(S.bootSnap || tallySnap()), '本次会话战报'); };
    $('#pcauto-p-rd', body).onclick = () => { $('#pcauto-panel')?.remove(); showDaily(); };
  }

  /* ---------- 设置 ---------- */

  function panelSettings(body) {
    const chk = (k, label) => `<label class="p-chk"><input type="checkbox" data-k="${k}" ${S.cfg[k] ? 'checked' : ''}><span>${label}</span></label>`;
    const num = (k, label, min, max, step = 1) => `<label class="p-num"><span>${label}</span>
        <input type="number" data-k="${k}" value="${S.cfg[k]}" min="${min}" max="${max}" step="${step}"></label>`;
    const grp = (title, inner, open = false) => `<details ${open ? 'open' : ''}><summary>${title}</summary>${inner}</details>`;
    body.innerHTML = `
      <h4>一键挂机档位</h4>
      <div id="pcauto-set-presets">${presetCardsHtml()}</div>
      <h4>详细设置</h4>
      ${grp('主线策略', `
        ${chk('progress', '主线推进：自动进最新章节，关掉会把人拉回旧章节的循环（您手动换章或改循环后 2 小时不动）')}
        ${chk('counterSwap', '卡道馆 / 联盟：全队到上限后仍连败，按对战模拟换上胜率最高的阵容')}
        ${num('stuckDeaths', '到上限后再输几次算卡住', 2, 20)}
        ${chk('grindMode', '道馆 / 四天王失败后自动继续')}`)}
      ${grp('经验糖与金钱', `
        ${chk('autoFeed', '定时精确喂经验糖（只喂不会超出上限的那颗）')}
        ${num('autoFeedMin', '喂糖间隔（分钟）', 5, 240, 5)}
        ${chk('autoShop', '按「离上限还差多少经验」自动买经验糖')}
        ${num('shopFloor', '买完至少留多少 ₽', 0, 100000000, 1000)}
        ${num('shopBudget', '每小时最多花多少 ₽', 0, 100000000, 1000)}
        ${num('shopUnitMax', '单笔超过多少 ₽ 不自动买', 1000, 100000000, 1000)}`)}
      ${grp('队伍', `
        ${chk('autoTeam', '按推进目标（下一道馆 / 整个联盟）模拟，推荐队明显更强时自动换上（锁定队员和练级新人不动）')}
        ${num('autoTeamGap', '推荐队的模拟得分高出多少（百分制）才换', 3, 60)}
        ${chk('autoTeamProtect', '异色 / 传说级（种族值 ≥ 580）不会被自动换下')}
        ${chk('raidOptimize', '团体战 / 活动选队面板打开时，替您点一次游戏自带的「优化」（每个首领每天一次，不点加入）')}
        ${chk('autoSwitch', '残血自动换人（会覆盖手动操作）')}
        ${num('switchAtHp', '血量低于多少 % 换人', 5, 90, 5)}
        ${chk('powerGuard', '战力 / 胜率告警')}
        ${chk('showGrades', '队伍 / PC 显示评分角标')}`)}
      ${grp('培育屋与树果', `
        ${chk('autoHatch', '蛋孵好了马上孵化')}
        ${chk('autoDeposit', '空位自动寄放（百变怪优先；队伍、预设队、异色、传说级除外）')}
        ${chk('autoBerry', '自动吃树果维持增益')}
        ${num('berryLeadMin', '剩余不足多少分钟补一颗', 5, 180, 5)}
        ${num('berryReserve', '每种保留几颗不吃', 0, 99)}
        <div id="pcauto-berry-fam" style="display:flex;flex-wrap:wrap;gap:10px;padding:4px 0"></div>`)}
      ${grp('弹窗、进化与存档', `
        ${chk('autoDex', '自动关闭捕获图鉴卡')}
        ${chk('autoModal', '自动确认提示类弹窗')}
        ${chk('autoGift', '自动选择礼物 / 单选')}
        ${chk('autoEvo', '自动进化')}
        ${num('evoEverySec', '进化检查间隔（秒）', 5, 600, 5)}
        ${chk('autoSave', '定期保存存档')}
        ${num('saveEveryMin', '保存间隔（分钟）', 1, 120)}
        ${chk('autoEvent', '活动选好队伍后自动出发（实验）')}
        ${chk('casinoAuto', '游戏城：进入后自动挂老虎机（消耗金钱）')}
        ${num('casinoFloor', '金钱低于多少 ₽ 停手', 0, 100000000, 1000)}`)}
      ${grp('挂机连续性', `
        <label class="p-num"><span>战斗速度</span><select data-k="speed">
          <option value="1" ${S.cfg.speed == 1 ? 'selected' : ''}>×1 原速</option>
          <option value="2" ${S.cfg.speed == 2 ? 'selected' : ''}>×2</option>
          <option value="4" ${S.cfg.speed == 4 ? 'selected' : ''}>最快（推荐）</option></select></label>
        ${chk('keepAlive', '后台保活（实验：切走标签页仍继续挂机）')}
        ${chk('wakeLock', '保持屏幕常亮')}
        ${chk('stallReload', '长时间停滞自动刷新')}
        ${num('stallSec', '判定停滞（秒）', 15, 1800, 5)}
        ${chk('healthReload', '健康刷新：连续运行很久或内存暴涨时，挑空档存档并刷新')}
        ${num('healthHours', '连续运行多少小时刷新一次', 1, 48)}
        ${chk('phaseNotify', '昼夜时段切换提醒')}
        ${chk('nightGuard', '夜间长时间零捕获告警')}`)}
      ${grp('提醒', `
        ${chk('notify', '桌面通知（闪光、卡关、需要您点一下）')}
        ${chk('sound', '提示音')}
        ${chk('awayReport', '回到电脑前时弹出离开期间战报')}
        ${chk('bsWinOnStart', '启动时打开实战统计悬浮窗（HUD 上的 📊 随时开关）')}
        ${num('awayMin', '离开超过多少分钟才弹', 1, 1440)}`)}
      ${grp('存档备份', `
        ${HAS_STORE ? '' : '<div class="pa-note bad">扩展存储没连上，备份不可用</div>'}
        ${chk('backup', '定期自动备份存档（存在扩展存储里）')}
        ${num('backupEveryMin', '备份间隔（分钟）', 5, 720, 5)}
        ${num('backupKeep', '自动备份保留几份', 1, 30)}
        <div class="p-btns"><button class="pa-btn" id="pcauto-bak-now">立即备份</button>
          <button class="pa-btn" id="pcauto-bak-export">导出当前存档</button>
          <button class="pa-btn" id="pcauto-bak-import">从文件恢复</button></div>
        <div id="pcauto-bak-list" style="font-size:11.5px;margin-top:6px"></div>`)}
      <div class="p-btns" style="margin-top:14px">
        <button class="pa-btn" id="pcauto-diag-open">自检与诊断</button>
        <button class="pa-btn" id="pcauto-diag-copy">复制诊断信息</button>
        <button class="pa-btn" id="pcauto-reset">恢复默认设置</button>
      </div>
      <div class="p-sub" style="margin-top:8px">请让游戏标签页保持在前台：后台标签会被浏览器挂起，游戏停摆，离线也永远不会打道馆。</div>`;

    const famBox = $('#pcauto-berry-fam', body);
    const fams = [['shiny', '闪光 🌟'], ['dex', '图鉴 📖'], ['rare', '稀有 ✨'], ['capture', '捕获 🎯'], ['xp', '经验 ⭐'], ['money', '金钱 💰']];
    famBox.innerHTML = fams.map(([k, label]) =>
        `<label class="p-chk" style="padding:0"><input type="checkbox" data-fam="${k}" ${S.cfg.berryFamilies?.[k] ? 'checked' : ''}>${label}</label>`).join('');
    $$('input[data-fam]', famBox).forEach((el) => {
      el.onchange = () => {
        S.cfg.berryFamilies = { ...(S.cfg.berryFamilies || {}), [el.dataset.fam]: el.checked };
        writeCfg(S.cfg);
      };
    });

    const refreshPreset = () => {
      const host = $('#pcauto-set-presets', body);
      if (host) { host.innerHTML = presetCardsHtml(); bindPresetCards(host, () => renderPanel(true)); }
      renderHud();
    };
    $$('input[type=checkbox][data-k]', body).forEach((el) => {
      el.onchange = () => {
        S.cfg[el.dataset.k] = el.checked;
        writeCfg(S.cfg);
        if (el.dataset.k === 'keepAlive') setKeepAlive(el.checked);
        if (el.dataset.k === 'showGrades' && el.checked) paintBadges();
        if (el.dataset.k === 'notify' && el.checked && Notification.permission === 'default') Notification.requestPermission?.();
        refreshPreset();
      };
    });
    $$('input[type=number][data-k]', body).forEach((el) => {
      el.onchange = () => {
        const k = el.dataset.k;
        const min = el.min !== '' ? +el.min : 0;
        const max = el.max !== '' ? +el.max : 1e9;
        const val = Number(el.value);
        S.cfg[k] = clamp(Number.isFinite(val) ? val : min, min, max);
        el.value = S.cfg[k];
        writeCfg(S.cfg);
        refreshPreset();
      };
    });
    $$('select[data-k]', body).forEach((el) => {
      el.onchange = () => { S.cfg[el.dataset.k] = +el.value; writeCfg(S.cfg); };
    });
    bindPresetCards(body, () => renderPanel(true));

    const bakBox = $('#pcauto-bak-list', body);
    const kindName = { auto: '自动', manual: '手动', pre: '恢复前' };
    const renderBakList = () => {
      const list = bakList();
      if (!list.length) { bakBox.innerHTML = '<div class="p-sub">还没有备份</div>'; return; }
      bakBox.innerHTML = list.map((b) => {
        const s = b.sum || {};
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)">
          <span style="flex:1;color:#c7d0e0">${esc(new Date(b.at).toLocaleString('zh-CN', { hour12: false }))}
            <span class="p-sub">· ${esc(kindName[b.kind] || b.kind)} · 第${esc(s.chapter ?? '?')}章 图鉴${esc(s.dex ?? '?')}</span></span>
          <button class="pa-btn" data-bak-restore="${esc(b.id)}">恢复</button>
          <button class="pa-btn" data-bak-dl="${esc(b.id)}">下载</button></div>`;
      }).join('');
      $$('[data-bak-restore]', bakBox).forEach((el) => {
        el.onclick = () => {
          const b = bakList().find((x) => x.id === el.dataset.bakRestore);
          const raw = b && storeGet(BAK_PREFIX + b.id, null);
          if (!raw) { log('warn', '这份备份的数据丢失了'); return; }
          restoreRaw(raw, new Date(b.at).toLocaleString('zh-CN', { hour12: false }) + ' 的备份');
        };
      });
      $$('[data-bak-dl]', bakBox).forEach((el) => {
        el.onclick = () => {
          const b = bakList().find((x) => x.id === el.dataset.bakDl);
          const raw = b && storeGet(BAK_PREFIX + b.id, null);
          if (raw) downloadText(`pokecatch-backup-${stamp(b.at)}.json`, raw);
        };
      });
    };
    renderBakList();
    $('#pcauto-bak-now', body).onclick = () => {
      const r = backupNow('manual');
      log(r.ok ? 'info' : 'warn', (r.ok ? '' : '备份失败：') + r.msg);
      renderBakList();
    };
    $('#pcauto-bak-export', body).onclick = () => {
      const raw = readSaveRaw();
      if (!raw) { log('warn', '读不到存档，无法导出'); return; }
      downloadText(`pokecatch-save-${stamp(now())}.json`, raw);
    };
    $('#pcauto-bak-import', body).onclick = importSaveFile;
    $('#pcauto-diag-open', body).onclick = openDiag;
    $('#pcauto-diag-copy', body).onclick = dumpDiag;
    $('#pcauto-reset', body).onclick = () => {
      S.cfg = defaultCfg();
      writeCfg(S.cfg);
      log('info', '已恢复默认设置');
      renderPanel(true);
      renderHud();
    };
  }
