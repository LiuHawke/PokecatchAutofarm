  /* ====================== 一键禁招：替您在游戏的招式抽屉里点禁用 / 恢复 ====================== */
  /*
   * 和手动操作一样：打开宝可梦卡片 → 点招式格（.dc-move）打开自己的招式抽屉（.mvd-root）→
   * 点招式行里的 .mvd-mv 切换禁用。游戏自己写 mon.ban 并保存；禁到一个攻击招都不剩时游戏会拒绝（抖一下）。
   * 先恢复、后禁用，避免中途触发「没有攻击招」。每点一次都读回 mon.ban 核对，没生效最多再点 2 次。
   * 改之前的禁招记下来，可以一键撤销。需要游戏内部接口（用它打开卡片）。
   */

  const BAN_ROW = (key) => `.mvd-row[data-k="${CSS.escape(key)}"]`;

  /** 在抽屉 root 里把 key 切到 want（true = 禁用）；readBan() 读当前禁用列表。返回 'ok' | 'missing' | 'locked' | 'refused' */
  async function banToggleIn(root, key, want, readBan, pause = 250) {
    for (let t = 0; t < 3; t++) {
      const row = root.querySelector(BAN_ROW(key));
      if (!row) return 'missing';
      if (!row.classList.contains('done')) return 'locked';
      if (readBan().includes(key) === want) return 'ok';
      const mv = row.querySelector('.mvd-mv');
      if (!mv) return 'missing';
      mv.click();
      await wait(pause);
    }
    return readBan().includes(key) === want ? 'ok' : 'refused';
  }

  const banVisible = (el) => !!el && el.getClientRects().length > 0;
  async function banWaitFor(sel, ms = 2500) {
    const t0 = now();
    while (now() - t0 < ms) {
      const el = $$(sel).find(banVisible);
      if (el) return el;
      await wait(100);
    }
    return null;
  }
  async function banCloseAll(ns) {
    try { ns.UI.closeMovesDrawer(); } catch { /* 忽略 */ }
    await wait(200);
    for (let i = 0; i < 3; i++) {
      const x = $$('.dexcard-modal .dc-x, .dc-x').find(banVisible);
      if (!x) break;
      fire(x);
      await wait(250);
    }
  }

  /** 一只：把禁用列表改成 want（招式 key 数组） */
  async function banApplyOne(uid, want) {
    const ns = NS();
    const live = () => monByUid(uid, liveSave());
    const m0 = live();
    if (!m0) return { ok: false, msg: `找不到 ${monLabel(uid)}` };
    const cur = (m0.ban || []).slice();
    const wantSet = new Set(want);
    const toEnable = cur.filter((k) => !wantSet.has(k));
    const toBan = want.filter((k) => !cur.includes(k));
    if (!toEnable.length && !toBan.length) return { ok: true, changed: 0 };
    try { ns.UI.monDetail(uid, null); } catch (e) { return { ok: false, msg: '打不开宝可梦卡片：' + ((e && e.message) || e) }; }
    const tile = await banWaitFor('.dc-move');
    if (!tile) { await banCloseAll(ns); return { ok: false, msg: '卡片里找不到招式格' }; }
    fire(tile);
    const root = await banWaitFor('.mvd-root');
    if (!root || !root.querySelector('.mvd-row')) { await banCloseAll(ns); return { ok: false, msg: '招式抽屉没打开' }; }
    const readBan = () => ((live() || {}).ban || []);
    const bad = [];
    for (const k of toEnable) { const r = await banToggleIn(root, k, false, readBan); if (r !== 'ok') bad.push(`${TA_MVNAME[k] || k}（${r}）`); }
    for (const k of toBan) { const r = await banToggleIn(root, k, true, readBan); if (r !== 'ok') bad.push(`${TA_MVNAME[k] || k}（${r}）`); }
    await banCloseAll(ns);
    const fin = readBan().slice().sort().join(',');
    const ok = fin === want.slice().sort().join(',');
    return { ok, changed: toEnable.length + toBan.length, msg: ok ? '' : `${monLabel(uid)}：${bad.join('、') || '结果和建议不一致'}` };
  }

  /** 批量改禁招。list：[{ uid, ban }]；记下改之前的状态供撤销 */
  async function applyBans(list, reason = '一键禁招') {
    if (!nsOk()) return { ok: false, msg: '需要游戏内部接口（用来打开宝可梦卡片）' };
    if (findModal()) return { ok: false, msg: '先关掉游戏里的弹窗' };
    return runTask('ban', async () => {
      const panel = $('#pcauto-panel');
      if (panel) panel.style.visibility = 'hidden';
      const undo = [];
      const fails = [];
      let changed = 0;
      try {
        for (const s of list) {
          const m = monByUid(s.uid, liveSave());
          if (!m) { fails.push(`找不到 ${s.uid}`); continue; }
          undo.push({ uid: String(s.uid), ban: (m.ban || []).slice() });
          const r = await banApplyOne(String(s.uid), s.ban || []);
          changed += r.changed || 0;
          if (!r.ok) fails.push(r.msg);
        }
      } finally { if (panel) panel.style.visibility = ''; }
      if (changed) {
        S.banUndo = undo;
        log('info', `${reason}：改了 ${list.length} 只的招式禁用（共 ${changed} 处）${fails.length ? `，${fails.length} 只没改完` : ''}`);
      }
      return fails.length ? { ok: false, msg: fails.join('；') } : { ok: true, changed };
    });
  }

  async function undoBans() {
    if (!S.banUndo) return { ok: false, msg: '没有可撤销的禁招' };
    const prev = S.banUndo;
    const r = await applyBans(prev, '撤销禁招');
    if (r.ok) S.banUndo = null;
    return r;
  }

  /** 建议列表旁边的按钮；sug：[{ uid, ban }] */
  function banApplyButtons(scope, sug) {
    S.banSug = S.banSug || {};
    S.banSug[scope] = sug.map((s) => ({ uid: String(s.uid), ban: s.ban.slice() }));
    return `<div class="p-btns"><button class="pa-btn acc" data-banapply="${esc(scope)}" ${nsOk() ? '' : 'disabled title="需要游戏内部接口"'}>一键按建议禁招</button>
      <button class="pa-btn" data-banundo="1" ${S.banUndo ? '' : 'disabled'}>撤销上次禁招</button></div>`;
  }
  function bindBanApply(body, redraw) {
    $$('[data-banapply]', body).forEach((b) => {
      b.onclick = async () => {
        const list = (S.banSug || {})[b.dataset.banapply] || [];
        if (!list.length) return;
        b.disabled = true;
        const r = await applyBans(list);
        if (!r.ok) log('warn', '禁招没完成：' + r.msg);
        redraw();
      };
    });
    $$('[data-banundo]', body).forEach((b) => {
      b.onclick = async () => { const r = await undoBans(); if (!r.ok) log('warn', r.msg); redraw(); };
    });
  }

  /**
   * 自检：在不挂到页面上的样例抽屉里跑 banToggleIn，样例按游戏的规则响应点击
   * （切换 ban、重画行、不许禁掉最后一个攻击招）。返回 [{ name, ok, detail }]
   */
  async function banSelfTest() {
    const out = [];
    const moves = [['tackle', 1], ['ember', 1], ['growl', 0], ['flamethrower', 1]];
    let ban = ['growl'];
    const root = document.createElement('div');
    root.className = 'mvd-root';
    const road = document.createElement('ul');
    road.className = 'mvd-road';
    root.appendChild(road);
    const render = () => {
      road.innerHTML = moves.map(([k], i) => `<li class="mvd-row${i < 3 ? ' done' : ''}${ban.includes(k) ? ' ban' : ''}" data-k="${k}"><div class="mvd-mv"><span class="n">${k}</span></div></li>`).join('');
    };
    render();
    root.addEventListener('click', (e) => {
      const row = e.target.closest('.mvd-row.done');
      if (!row || !e.target.closest('.mvd-mv')) return;
      const k = row.dataset.k;
      const next = ban.includes(k) ? ban.filter((x) => x !== k) : [...ban, k];
      if (!moves.some(([x, atk], i) => i < 3 && atk && !next.includes(x))) return;
      ban = next;
      render();
    });
    const rd = () => ban;
    const t = async (name, key, want, expect, check) => {
      const r = await banToggleIn(root, key, want, rd, 0);
      out.push({ name, ok: r === expect && (!check || check()), detail: r });
    };
    await t('禁用一个攻击招', 'tackle', true, 'ok', () => ban.includes('tackle'));
    await t('恢复一个变化招', 'growl', false, 'ok', () => !ban.includes('growl'));
    await t('已是目标状态不点', 'tackle', true, 'ok');
    await t('最后一个攻击招被游戏拒绝', 'ember', true, 'refused', () => !ban.includes('ember'));
    await t('没学会的招不点', 'flamethrower', true, 'locked');
    await t('抽屉里没有的招', 'surf', true, 'missing');
    return out;
  }
