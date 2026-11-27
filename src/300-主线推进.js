  /* ====================== 主线推进：章节 / 循环 / 克制换队 ====================== */

  const PROG_KEY = 'pcauto.progress.v4';
  const LEGACY_RETREAT_KEY = 'pcauto.retreat.v1';

  /** 跨刷新保留的主线状态：手动让路截止时间、每个道馆的「到上限时」失败基数、已试过的克制队、已发过的提醒 */
  function progState() {
    if (!S.prog) {
      const p = safeParse(lsGet(PROG_KEY), null);
      S.prog = p && typeof p === 'object' ? p : {};
      S.prog.capBase = S.prog.capBase || {};
      S.prog.counter = S.prog.counter || {};
      S.prog.told = S.prog.told || {};
    }
    return S.prog;
  }
  function persistProg() { lsSet(PROG_KEY, JSON.stringify(progState())); }

  const advLoops = () => (((readSave() || {}).adv || {}).loops || []).map(String);

  /** 打开章节地图（#screen-map），已经在地图上就直接返回 */
  async function openMap() {
    if ($('#screen-map') && $('#screen-map').classList.contains('active') && $('.mp-row[data-ch]')) return true;
    gotoScreen('adventure');
    await wait(400);
    const btn = $('#chapter-btn');
    if (!btn) return false;
    fire(btn);
    await wait(900);
    await settleModals();
    return !!$('.mp-row[data-ch]');
  }

  /** 地图上的循环开关；开关会立即写进存档 adv.loops，以存档为准核对。需已在地图上 */
  async function loopToggle(ch, on) {
    const isOn = () => advLoops().includes(String(ch));
    if (isOn() === on) return true;
    const sw = $(`.pg-loop[data-loop="${ch}"]`);
    if (!sw) return false;
    fire(sw);
    for (let i = 0; i < 6; i++) {
      await wait(300);
      if (isOn() === on) return true;
    }
    return false;
  }

  /** 在地图上选中第 n 章并点「继续」，核对存档。需已在地图上 */
  async function mapGo(n, opts = {}) {
    const row = $(`.mp-row[data-ch="${n}"]`);
    if (!row) return { ok: false, skip: !!opts.softMissing, msg: `地图上没有第 ${n + 1} 章` };
    if (row.classList.contains('locked')) return { ok: false, msg: `第 ${n + 1} 章未解锁` };
    fire(row);
    await wait(500);
    const go = $(`.mp-go[data-go="${n}"]`);
    if (!go || go.disabled) return { ok: false, msg: '找不到「继续」按钮' };
    intent('chapter');
    fire(go);
    for (let i = 0; i < 8; i++) {
      await wait(500);
      await settleModals(2);
      if ((readSave() || {}).adv?.chapter === n) return { ok: true };
    }
    return { ok: false, msg: `切换后存档章节仍是 ${(readSave() || {}).adv?.chapter}` };
  }

  /** 切到第 n 章（0 起算，对应存档 adv.chapter） */
  async function chapterGo(n, opts = {}) {
    return runTask('chapter', async () => {
      if ((readSave() || {}).adv?.chapter === n) return { ok: true, same: true };
      if (!(await openMap())) return { ok: false, msg: '打不开章节地图' };
      return mapGo(n, opts);
    });
  }

  /** 关掉全部循环（循环里只要有章节，打赢馆主后游戏就会按循环把你送回去） */
  async function clearLoops() {
    return runTask('chapter', async () => {
      const loops = (facts(readSave() || S.save)?.loops || []).map(String);
      if (!loops.length) return { ok: true, same: true };
      if (!(await openMap())) return { ok: false, msg: '打不开章节地图' };
      intent('chapter');
      for (const l of loops) await loopToggle(l, false);
      const left = facts(readSave() || S.save)?.loops || [];
      return left.length ? { ok: false, msg: `还有循环没关掉：${left.map(loopName).join('、')}` } : { ok: true };
    });
  }

  /**
   * 玩家自己换章节或改循环时让路 2 小时：脚本不再动章节和循环。
   * 游戏循环中自己绕回去的章节变化不算手动。
   */
  function progressWatch(save) {
    const adv = save && save.adv;
    if (!adv) return;
    const st = progState();
    const ch = adv.chapter | 0;
    const loopsKey = (adv.loops || []).join(',');
    // 打赢馆主自然进下一章、切回前台时游戏补算期间推进的章节，都不是玩家动的手
    const scripted = intentFresh('chapter', 60000)
        || (S.lastChapter != null && ch === S.lastChapter + 1)
        || (S.catchup && now() - S.catchup.at < 15000);
    if (S.lastLoopsKey != null && loopsKey !== S.lastLoopsKey && !scripted && loopsKey) {
      st.holdUntil = now() + 2 * 3600000;
      persistProg();
      log('info', `检测到您手动设置了循环（${(adv.loops || []).map(loopName).join('、')}），2 小时内不改动章节和循环`);
    } else if (S.lastChapter != null && ch !== S.lastChapter && !scripted && !(adv.loops || []).length && ch < (adv.unlocked | 0)) {
      st.holdUntil = now() + 2 * 3600000;
      persistProg();
      log('info', `检测到您手动换到第 ${ch + 1} 章，2 小时内不自动推进`);
    }
    S.lastLoopsKey = loopsKey;
    S.lastChapter = ch;
  }

  /**
   * 主线策略（纯函数）：根据局势给出下一步，附中文原因。
   * 规则来自攻略：
   *  1. 循环会在打赢馆主后把人送回旧章节 → 推进时不留循环
   *  2. 最新章节经验最多，输了游戏会从本章开头重来，本身就是刷级 → 不再「回上一章刷」
   *  3. 普通道馆的上限等于馆主王牌等级，全队到上限还输就不会再变强 → 换克制队，仍不行就请玩家处理
   *  4. 跨地区会清空队伍、钱包重算 → 只提醒
   */
  function planProgress(f, st, cfg) {
    if (!f) return { key: 'none', why: '还没读到存档' };
    if (!cfg.progress) return { key: 'off', why: '主线推进未开启' };
    if (f.special) return { key: 'wait', why: `正在进行${f.special}，等结束后再安排主线` };
    if ((st.holdUntil || 0) > now()) {
      return { key: 'hold', why: `您刚手动调整过章节，${Math.ceil((st.holdUntil - now()) / 60000)} 分钟内不改动` };
    }
    if (f.loops.length) {
      return { key: 'clearLoops', why: `开着${f.loops.map(loopName).join('、')}循环：打赢馆主后游戏会按循环把你送回旧章节，先关掉` };
    }
    if (f.regionDoneNext) {
      const nx = chOf(f.unlocked);
      return { key: 'travel', why: `${f.regionZh}已通关，可以前往${nx ? nx.rz : '下一个地区'}（跨地区会清空队伍、钱包重算，请您亲自操作）` };
    }
    const noRow = (st.noRow || {})[f.unlocked];
    if (f.ch < f.unlocked && chOf(f.unlocked) && !f.inLeague && !(noRow && now() - noRow < 30 * 60000)) {
      return { key: 'go', to: f.unlocked, why: `最新的第 ${f.unlocked + 1} 章经验更多，输了也会从章节开头重来，相当于边刷边打` };
    }
    const league = f.inLeague || (f.gym && chOf(f.gymCh) && chOf(f.gymCh).lg);
    const foe = league ? `${f.regionZh}联盟（卡在${f.gym ? f.gym.l : '联盟'}）` : f.gym ? f.gym.l : '';
    const tp = (S.teamPlans || {}).auto;
    const hint = tp && !tp.error && tp.verdict ? `；配队模拟：${tp.verdict}` : '';
    if (!league && (f.ch !== f.unlocked || f.gymCh !== f.ch || !f.gym)) return { key: 'farm', why: '正在最新章节推进' };
    if (!f.gym) return { key: 'farm', why: '正在联盟中推进' };
    if (!f.atCap) {
      const lack = f.team.filter((t) => t.lv < t.cap).length;
      const where = league ? '联盟里边打边刷（输了回第 1 间是正常的）' : '本章刷级';
      return { key: 'farm', why: `${lack} 只队员还没到上限 Lv.${f.cap}，继续在${where}${f.xpDemand ? `（共差约 ${fmt(f.xpDemand)} 经验）` : ''}${hint}` };
    }
    const sk = league ? `L${f.unlocked}` : String(f.ch);
    const deaths = league ? f.leagueDeaths : f.deathsHere;
    const base = st.capBase[sk];
    const lost = base == null ? 0 : deaths - base;
    if (lost < (cfg.stuckDeaths || 4)) {
      return { key: 'farm', why: `全队已到上限 Lv.${f.cap}，挑战${foe}中（到上限后输了 ${lost} 次）${hint}` };
    }
    const tried = st.counter[sk];
    if (cfg.counterSwap && !tried) {
      return { key: 'counter', sk, why: `全队到上限后在${foe}输了 ${lost} 次：按模拟换上胜率最高的阵容${hint}` };
    }
    return { key: 'stuck', sk, why: `已到上限 Lv.${f.cap}${tried ? '、也按模拟换过阵容' : ''}，仍打不过${foe}${hint || '：需要换人或进化'}。挂机会继续刷钱和捕获` };
  }

  /** 提醒只发一次（同一章同一类） */
  function tellOnce(key, title, msg) {
    const st = progState();
    if (st.told[key]) return;
    st.told[key] = now();
    persistProg();
    log('warn', msg);
    beep('warn');
    notify(title, msg, 'pcauto-progress');
  }

  /** 换地区后：别的地区的锁定队员 / 练级新人上不了场，清掉；配队缓存作废，目标自然切到新地区的道馆 */
  function regionCleanup(f) {
    if (!f || !f.region) return;
    if (S.lastRegion === undefined) { S.lastRegion = f.region; return; }
    if (S.lastRegion === f.region) return;
    const from = S.lastRegion;
    S.lastRegion = f.region;
    const save = S.save || {};
    const ok = new Set((save.mons || []).filter((m) => !m.reg || m.reg === f.region).map((m) => String(m.uid)));
    const p = teamPrefs();
    const pins = p.pins.filter((u) => ok.has(u));
    const dropped = p.pins.length - pins.length;
    const trDrop = p.trainee && !ok.has(p.trainee);
    if (dropped || trDrop) {
      p.pins = pins;
      if (trDrop) p.trainee = null;
      saveTeamPrefs();
    }
    S.teamPlans = {};
    S.teamPlanSig = {};
    log('info', `进入${f.regionZh}（从${REGION_ZH[from] || from}）${dropped || trDrop ? `：清掉了上不了场的${dropped ? ` ${dropped} 个锁定` : ''}${trDrop ? '、练级新人' : ''}` : ''}，配队目标改为本地区的下一道馆`);
  }

  async function progressTick() {
    const f = facts();
    regionCleanup(f);
    const st = progState();
    // 到上限的那一刻记下失败基数，之后的失败才算「到上限还打不过」；联盟按全联盟累计失败
    if (f && f.atCap && f.gym) {
      if (f.inLeague || (chOf(f.gymCh) || {}).lg) {
        const k = `L${f.unlocked}`;
        if (st.capBase[k] == null) { st.capBase[k] = f.leagueDeaths; persistProg(); }
      } else if (f.ch === f.gymCh && st.capBase[f.ch] == null) { st.capBase[f.ch] = f.deathsHere; persistProg(); }
    }
    // 卡在道馆 / 联盟时提前在后台算好推进目标的配队，计划说明里会带上模拟结论
    if (f && f.gym && f.atCap) teamPlanGet('auto', null, false, 'bg');
    const plan = planProgress(f, st, S.cfg);
    S.plan = plan;
    if (!['clearLoops', 'go', 'counter', 'travel', 'stuck'].includes(plan.key)) return;
    if (plan.key === 'travel') { tellOnce(`travel:${f.unlocked}`, '可以前往新地区', plan.why); return; }
    if (plan.key === 'stuck') { tellOnce(`stuck:${plan.sk}`, '道馆卡关', plan.why); return; }
    if (!autoIdle(15000) || now() - (S.progressAt || 0) < 60000) return;
    S.progressAt = now();
    let r;
    if (plan.key === 'clearLoops') {
      r = await clearLoops();
      if (r.ok && !r.same) log('info', `已关闭章节循环：${plan.why.split('：')[1] || ''}`);
    } else if (plan.key === 'go') {
      r = await chapterGo(plan.to, { softMissing: true });
      if (r.ok && !r.same) { log('badge', `已进入第 ${plan.to + 1} 章：${plan.why}`); S.tally.advances = (S.tally.advances || 0) + 1; }
      if (r.skip) { st.noRow = { ...(st.noRow || {}), [plan.to]: now() }; persistProg(); log('warn', `${r.msg}，30 分钟内不再尝试打开地图切章`); }
    } else if (plan.key === 'counter') {
      const tp = await teamPlanAsync('auto', false, 'bg');
      st.counter[plan.sk] = { at: now(), clear: tp && tp.best ? tp.best.clear : 0, cur: tp && tp.cur ? tp.cur.clear : 0 };
      persistProg();
      if (!tp || tp.error || tp.keep) {
        log('info', `配队模拟：${tp ? tp.error || tp.verdict : '没有结果'}，不换`);
        return;
      }
      S.counterFor = f.unlocked;
      r = await applyTeam(tp.best.uids, `按模拟换队（通关率 ${Math.round(tp.cur.clear * 100)}% → ${Math.round(tp.best.clear * 100)}%）`);
    }
    taskResult('progress', '主线推进', r);
  }

  /** 3.x 的「连败回退」状态：4.0 不再回退，读到就丢掉，循环交给 planProgress 清理 */
  function dropLegacyRetreat() {
    if (lsGet(LEGACY_RETREAT_KEY) == null) return;
    try { localStorage.removeItem(LEGACY_RETREAT_KEY); } catch { /* 忽略 */ }
    log('info', '已停用 3.x 的「连败回退刷级」：4.0 改为在最新章节边刷边打');
  }
