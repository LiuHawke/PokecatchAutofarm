  /* ====================== 自检 ====================== */

  /**
   * 不改动游戏：弹窗规则用脱离文档的样例元素跑，逻辑检查用合成数据跑，
   * 存档和页面结构只读。游戏更新后先跑一遍，能直接看出哪条规则或选择器失效了。
   */
  function runSelfTest() {
    const out = [];
    const add = (group, name, level, detail = '') => out.push({ group, name, level, detail });
    const ok = (group, name, cond, detail = '', bad = 'fail') => add(group, name, cond ? 'ok' : bad, detail);

    /* ---- 弹窗规则 ---- */
    const mk = (cls, html) => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = html;
      return el;
    };
    const b = (t, cls = 'btn') => `<button class="${cls}">${t}</button>`;
    const fixtures = [
      ['捕获卡点「继续」', 'modal dexcard-modal', '<p>捕获成功</p>' + b('继续', 'btn gold'), 'click', '继续'],
      ['详情卡不乱点', 'modal dexcard-modal mon-modal', b('✕', 'dc-x') + b('放生'), 'warn'],
      ['游戏设置窗不乱点', 'modal dexcard-modal gd-modal opt-modal', '<p>设置</p>' + b('OK', 'btn primary'), 'warn'],
      ['放生确认交给玩家', 'modal', '<p>确定要放生这只宝可梦吗？</p>' + b('取消') + b('确定'), 'warn'],
      ['自己发起的进化确认', 'modal', '<p>要让2只宝可梦进化吗？</p>' + b('取消', 'btn ghost') + b('进化', 'btn primary'), 'click', '进化', { evo: 1 }],
      ['花钱的确认不自动点', 'modal', '<p>花费 5,000 ₽ 购买？</p>' + b('取消') + b('确定'), 'warn'],
      ['自己发起的购买确认', 'modal', '<p>花费 5,000 ₽ 购买？</p>' + b('取消') + b('确定'), 'click', '确定', { shop: 1 }],
      ['树果替换（脚本发起）', 'modal dexcard-modal ot-dlg', '<p>替换你的树果？</p>' + b('替换') + b('保留'), 'click', '替换', { berry: 1 }],
      ['树果替换（玩家发起）', 'modal dexcard-modal ot-dlg', '<p>替换你的树果？</p>' + b('替换') + b('保留'), 'click', '保留'],
      ['团体战提醒', 'modal dexcard-modal raid-dlg', '<p>团体战</p>' + b('加入', 'btn gold') + b('取消', 'btn ghost'), 'warn'],
      ['首次指南', 'modal gd-modal gd-tip-modal', '<p>商店</p>' + b('更多', 'btn ghost gd-more') + b('明白了', 'btn primary gd-ok'), 'click', '明白了'],
      ['回顾结算', 'modal oc-modal ug-recap', '<p>本次收获</p>' + b('继续', 'btn gold'), 'click', '继续'],
      ['单按钮提示（陌生文案）', 'modal', '<p>Season reward</p>' + b('Got it', 'btn primary'), 'click', 'Got it'],
      ['认不出的多按钮弹窗', 'modal', '<p>？？？</p>' + b('甲') + b('乙'), 'warn'],
    ];
    const saved = { cfg: S.cfg, intents: S.intents, userAt: S.userAt };
    try {
      S.cfg = { ...S.cfg, autoDex: true, autoModal: true, autoGift: true };
      for (const [name, cls, html, act, btnText, intents] of fixtures) {
        S.intents = {};
        S.userAt = 0;
        for (const k of Object.keys(intents || {})) S.intents[k] = now();
        const r = classifyModal(mk(cls, html), true);
        const got = r.act + (r.btn ? `「${r.btn.textContent.trim()}」` : '');
        const pass = r.act === act && (!btnText || (r.btn && r.btn.textContent.trim() === btnText));
        ok('弹窗规则', name, pass, pass ? got : `期望 ${act}${btnText ? `「${btnText}」` : ''}，实际 ${got}`);
      }
    } finally {
      S.cfg = saved.cfg; S.intents = saved.intents; S.userAt = saved.userAt;
    }

    /* ---- 存档字段 ---- */
    const save = readSave();
    if (!save) add('存档', `读取 ${SAVE_KEY}`, 'fail', '读不到存档，游戏可能改了存档 key');
    else {
      const t = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
      const fields = [
        ['mons', save.mons, 'array'], ['team', save.team, 'array'], ['items', save.items, 'object'],
        ['money', save.money, 'number'], ['stats.wins', save.stats && save.stats.wins, 'number'],
        ['adv.chapter', save.adv && save.adv.chapter, 'number'], ['adv.deaths', save.adv && save.adv.deaths, 'object'],
        ['adv.nodes', save.adv && save.adv.nodes, 'array'], ['lastTick', save.lastTick, 'number'],
        ['adv.unlocked', save.adv && save.adv.unlocked, 'number'], ['adv.loops', save.adv && save.adv.loops, 'array'],
      ];
      for (const [k, v, want] of fields) ok('存档', k, t(v) === want, `类型 ${t(v)}`);
      const soft = [['teamSets.list', save.teamSets && save.teamSets.list, 'array'], ['pension', save.pension, 'object'], ['buffs', save.buffs, 'object']];
      for (const [k, v, want] of soft) ok('存档', k, t(v) === want, t(v) === want ? '' : `类型 ${t(v)}，相关自动化不可用`, 'warn');
    }

    /* ---- 页面结构 ---- */
    const sels = [
      ['#speed-btns', '速度按钮', 'fail'], ['#tabs button[data-screen="team"]', '队伍页签', 'fail'],
      ['#team-slots', '队伍格子', 'warn'], ['#chapter-btn', '章节按钮', 'warn'], ['#bag-panel', '背包（吃树果）', 'warn'],
      ['#tabs button[data-screen="pension"]', '培育屋页签', 'warn'], ['#tabs button[data-screen="shop"]', '商店页签', 'warn'],
      ['#battle-log', '战斗日志（停滞检测）', 'warn'], ['#modal-root', '弹窗容器', 'warn'],
    ];
    for (const [sel, label, bad] of sels) ok('页面结构', label, !!$(sel), sel, bad);

    /* ---- 逻辑 ---- */
    const speeds = [1, 2, 4].map((v) => { const c = S.cfg.speed; S.cfg.speed = v; const r = speedTarget(); S.cfg.speed = c; return r; });
    ok('逻辑', '速度档位目标', speeds.join() === '1,2,2.5', speeds.join(' / '));
    const fake = {
      team: ['t1'], teamSets: { list: [['p1']] }, pension: { mons: [{ mon: { uid: 'n1' } }] },
      mons: [
        { uid: 't1', id: 16, level: 30 }, { uid: 'a1', id: 16, level: 5 }, { uid: 'a2', id: 16, level: 9 },
        { uid: 's1', id: 19, level: 3, shiny: true }, { uid: 's2', id: 19, level: 4 },
        { uid: 'p1', id: 21, level: 2 }, { uid: 'p2', id: 21, level: 8 },
        { uid: 'l1', id: 150, level: 70 }, { uid: 'l2', id: 150, level: 71 },
        { uid: 'u1', id: 25, level: 9 }, { uid: 'd1', id: 132, level: 40 },
      ],
    };
    const dep = depositCandidates(fake).join();
    ok('逻辑', '培育屋寄放顺序（百变怪优先，跳过队伍/预设/异色/传说）', dep === 'd1,a1,a2,s2,p2,u1', dep || '（空）');
    const shopEl = mk('sh-item', '<div class="sh-price"><span class="unit">单价1,200 ₽</span></div>');
    ok('逻辑', '商店价格解析', shopPrice(shopEl) === 1200, String(shopPrice(shopEl)));

    for (const name of Object.keys(PRESETS)) {
      const c = { ...S.cfg, ...PRESETS[name].cfg };
      const got = detectPreset(c);
      const changed = detectPreset({ ...c, autoFeed: !c.autoFeed });
      ok('逻辑', `档位「${PRESETS[name].label}」识别`, got === name && changed === 'custom', `${got} / 改一项后 ${changed}`);
    }
    ok('逻辑', '1.1 档位迁移（稳妥→练级刷钱，均衡/全托管→推关）',
        PRESET_LEGACY.safe === 'grind' && PRESET_LEGACY.balanced === 'push' && PRESET_LEGACY.full === 'push' && Object.values(PRESET_LEGACY).every((k) => PRESETS[k]));
    ok('逻辑', '只有推关模式换章、补位（练级刷钱 / 抓宠图鉴不动章节和队伍）',
        PRESETS.push.cfg.progress && PRESETS.push.cfg.counterSwap && ['grind', 'dex'].every((k) => !PRESETS[k].cfg.progress && !PRESETS[k].cfg.counterSwap));
    {
      const lid = log('info', '自检：日志写入').id;
      logPersist(true);
      const back = safeParse(JSON.stringify(storeGet(LOG_KEY) || []), []);
      S.events = S.events.filter((e) => e.id !== lid);
      logPersist(true);
      ok('逻辑', '日志能存下并按分类归档', Array.isArray(back) && back.some((e) => e.id === lid && e.cat === 'info') && logCat('game') === 'game' && logCat('battle') === 'team',
          HAS_STORE ? `${back.length} 条` : '没有扩展存储，日志只在本次页面里', HAS_STORE ? 'fail' : 'warn');
    }
    persistState();
    const back = safeParse(lsGet(STATE_KEY), {});
    ok('逻辑', '自动化状态持久化', STATE_FIELDS.every((k) => JSON.stringify(back[k]) === JSON.stringify(S[k])));
    const dt = dailyText({ t: { runMin: 90, caught: 12, money: 3400, shinyList: ['皮卡丘'], stalls: 1 } });
    ok('逻辑', '日报文本', /挂机 1 小时 30 分/.test(dt) && /闪光 1/.test(dt) && /停滞 1/.test(dt), dt.replace(/\n/g, ' / '));

    /* ---- 攻略规则（4.0） ---- */
    ok('规则', '内置章节数据', CH.length === 84 && CH.filter((c) => c.g).every((c) => c.g.team.length && c.cap), `${CH.length} 章`);
    const caps = [levelCap(0, 'kanto'), levelCap(7, 'kanto'), levelCap(13, 'kanto'), levelCap(14, 'kanto'), levelCap(20, 'johto')];
    ok('规则', '等级上限（第1章20 / 第8章70 / 冠军100 / 通关100 / 城都无馆章62）', caps.join() === '20,70,100,100,62', caps.join(' / '));
    ok('规则', '升级经验公式（Lv.10 关都 = 630）', xpNeed(10, 'kanto') === 630, String(xpNeed(10, 'kanto')));
    if (save) {
      const f = facts(save);
      if (f && f.team.length) {
        const over = f.team.filter((t) => t.lv > t.cap);
        ok('规则', '队伍等级没有超过算出的上限', !over.length, over.length ? over.map((t) => `${taMonName(t.m)} Lv.${t.lv} > ${t.cap}`).join('、') : `上限 Lv.${f.cap}`);
        const bad = f.team.filter((t) => t.lv < 100 && (t.m.xp || 0) >= xpNeed(t.lv, f.region));
        ok('规则', '升级经验公式与存档吻合', !bad.length, bad.length ? `${bad.length} 只的经验超出公式（可能有地下通道段位加成），喂糖会偏保守` : '', 'warn');
      }
    }
    const pf = (o) => ({ special: '', loops: [], regionDoneNext: false, ch: 7, unlocked: 7, gymCh: 7, gym: CH[7].g, atCap: false,
      team: [{ lv: 60, cap: 70 }], cap: 70, xpDemand: 1000, deathsHere: 0, regionZh: '关都', inLeague: false, leagueDeaths: 0, ...o });
    const lg = (o) => pf({ ch: 9, unlocked: 12, gymCh: 12, gym: CH[12].g, inLeague: true, cap: 93, team: [{ lv: 90, cap: 93 }], ...o });
    const cfgP = { progress: true, counterSwap: true, stuckDeaths: 4 };
    const st0 = { capBase: {}, counter: {}, told: {} };
    const cases = [
      ['循环陷阱 → 关循环', pf({ ch: 6, loops: [6, 7] }), st0, 'clearLoops'],
      ['落后于最新章 → 进最新章', pf({ ch: 6 }), st0, 'go'],
      ['没到上限 → 原地刷', pf({}), st0, 'farm'],
      ['到上限还连败 → 克制换队', pf({ atCap: true, deathsHere: 14 }), { ...st0, capBase: { 7: 10 } }, 'counter'],
      ['换过克制队仍连败 → 请玩家处理', pf({ atCap: true, deathsHere: 14 }), { ...st0, capBase: { 7: 10 }, counter: { 7: { at: 1 } } }, 'stuck'],
      ['补位后又练了级、再连败 → 再补一次', pf({ atCap: true, deathsHere: 14 }), { ...st0, capBase: { 7: 10 }, counter: { 7: { at: 1, n: 1, sig: '0|50', deaths: 10 } } }, 'counter'],
      ['补位后队伍没变化 → 不反复换', pf({ atCap: true, deathsHere: 14 }), { ...st0, capBase: { 7: 10 }, counter: { 7: { at: 1, n: 1, sig: '0|60', deaths: 10 } } }, 'stuck'],
      ['手动调整后让路', pf({ ch: 6, loops: [6] }), { ...st0, holdUntil: now() + 60000 }, 'hold'],
      ['地区通关 → 只提醒', pf({ ch: 13, unlocked: 14, regionDoneNext: true }), st0, 'travel'],
      ['活动中不动', pf({ special: '活动', ch: 6 }), st0, 'wait'],
      ['联盟输了回第 1 间 → 不跳房间', lg({}), st0, 'farm'],
      ['联盟到上限、累计失败没到次数 → 继续打', lg({ atCap: true, leagueDeaths: 12 }), { ...st0, capBase: { L12: 10 } }, 'farm'],
      ['联盟到上限后累计连败 → 按模拟换队', lg({ atCap: true, leagueDeaths: 20 }), { ...st0, capBase: { L12: 10 } }, 'counter'],
      ['地图上找不到最新章 → 30 分钟内不再切', pf({ ch: 6 }), { ...st0, noRow: { 7: now() } }, 'farm'],
    ];
    for (const [name, fx, st, want] of cases) {
      const got = planProgress(fx, st, cfgP).key;
      ok('规则', `主线策略：${name}`, got === want, got === want ? '' : `期望 ${want}，实际 ${got}`);
    }
    const pc = [pickCandy(200000, { 'exp-candy-xl': 1, 'exp-candy-big': 1 }, 'kanto'), pickCandy(100000, { 'exp-candy-xl': 1, 'exp-candy-m': 2 }, 'kanto'),
      pickCandy(500, { 'exp-candy-s': 3 }, 'kanto')].map((c) => (c ? c.key : '—'));
    ok('规则', '喂糖不溢出（20万→XL / 10万→M / 500→不喂）', pc.join() === 'exp-candy-xl,exp-candy-m,—', pc.join(' / '));
    const fakeSave = {
      adv: { chapter: 7, unlocked: 7, badges: ['Roche', 'Cascade', 'Foudre', 'Prisme', 'Âme', 'Marais', 'Volcan'], loops: [], deaths: {} },
      team: ['m1'], mons: [{ uid: 'm1', id: 25, level: 60, xp: 0 }], items: { 'exp-candy-xl': 1 },
    };
    const want = shopWant(fakeSave);
    const demand = xpToCap(fakeSave.mons[0], 70, 'kanto');
    const buyXp = Object.entries(want).reduce((a, [k, n]) => a + n * candyXp(CANDIES.find((c) => c.key === k), 'kanto'), 0) + 150000;
    ok('规则', '按需买糖：只买最划算的 XL（8 徽章前没有特大），总量不超过离上限的经验',
        Object.keys(want).join() === 'exp-candy-xl' && buyXp <= demand && demand - buyXp < 150000,
        `差 ${fmt(demand)}，买 ${JSON.stringify(want)}`);
    /* ---- 战斗模型与配队（4.1） ---- */
    const pct100 = (x) => `${Math.round(x * 100)}%`;
    const pika = btUnit({ id: 25, level: 50 }), gyara = btUnit({ id: 130, level: 50 });
    const tb = BT_MV.thunderbolt;
    const base = tb && pika && gyara ? btBase(pika, gyara, tb, tb.p, btEff(tb.t, gyara.types), null, null) : 0;
    ok('战斗', '伤害公式（Lv50 皮卡丘十万伏特打 Lv50 暴鲤龙 ≈ 136.46）', Math.abs(base - 136.457) < 0.01, base.toFixed(3));
    ok('战斗', '血量公式（Lv50 皮卡丘 = 182）', pika && pika.maxHp === 182, String(pika && pika.maxHp));
    ok('战斗', '学习表来自游戏（皮卡丘 Lv50 会电磁波和十万伏特以外的招）', pika && pika.smoves.includes('thunder-wave') && pika.moves.some((m) => m.key === 'spark'),
        pika ? pika.moves.map((m) => m.key).join(',') : '—');
    const r1 = btSim([btUnit({ id: 150, level: 100 })], [btUnit({ id: 19, level: 5 }, { foe: true })], { kind: 'trainer', dmgMul: 0.9 }, 30, 1).win;
    const golem = btUnit({ id: 76, level: 50 });
    const r2 = btSim([golem], [pika], { kind: 'trainer', dmgMul: 0.9 }, 100, 1).win;
    ok('战斗', '模拟合理（Lv100 超梦必胜 Lv5 小拉达，Lv50 隆隆岩稳胜 Lv50 皮卡丘）', r1 === 1 && r2 > 0.9, `${pct100(r1)} / ${pct100(r2)}`);
    ok('战斗', '自动换人打分（打皮卡丘派隆隆岩不派暴鲤龙）', btSwitchScore(golem, pika) > btSwitchScore(gyara, pika),
        `${btSwitchScore(golem, pika).toFixed(2)} vs ${btSwitchScore(gyara, pika).toFixed(2)}`);
    const fl = { region: 'kanto', regionZh: '关都', gymCh: 12, cur: CH[12] };
    const lt = teamTarget('league', fl);
    if (lt) {
      const team6 = [[112, 90], [130, 90], [25, 90], [57, 90], [119, 90], [118, 90]].map(([id, level], i) => btUnit({ uid: 'q' + i, id, level }));
      const ev = teamEval(team6, lt, 40, 3);
      ok('战斗', '联盟通关率不高于任何一间的胜率', ev.clear <= Math.min(...ev.rooms.map((r) => r.win)) + 1e-9, `通关 ${pct100(ev.clear)}，各间 ${ev.rooms.map((r) => pct100(r.win)).join(' / ')}`);
    } else ok('战斗', '联盟目标解析', false, '关都联盟数据缺失');
    const prefsOld = S.teamPrefs;
    S.teamPrefs = { pins: ['p1'], trainee: 't9' };
    const poolF = [{ uid: 'p1', id: 16, level: 5 }, { uid: 't9', id: 19, level: 3 }, { uid: 'x1', id: 25, level: 9 }];
    const fx1 = teamFixed({ team: [] }, poolF);
    S.teamPrefs = prefsOld;
    ok('战斗', '锁定队员与练级新人固定在队里', fx1.join() === 'p1,t9', fx1.join());
    {
      const poolC = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ uid: 'c' + i, id: 16, level: 10 * i }));
      S.teamPrefs = { pins: [], trainee: null, coreOff: ['c6'] };
      const core = teamFixed({ team: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] }, poolC);
      S.teamPrefs = prefsOld;
      ok('战斗', '核心队：队里等级最高的 4 只不被换（取消核心的那只除外）', core.join() === 'c5,c4,c3,c2', core.join());
      ok('战斗', '换下几只的计数（补空位不算）', teamSwapCount(['a', 'b', 'c'], ['a', 'b', 'c', 'd']) === 0 && teamSwapCount(['a', 'b', 'c'], ['a', 'x', 'y']) === 2);
    }
    {
      const lv = btUnit({ id: 25, level: 50 });
      const low = btSim([{ ...lv, startHp: 1 }], [gyara], { kind: 'trainer', dmgMul: 0.9 }, 40, 1).win;
      const full = btSim([lv], [gyara], { kind: 'trainer', dmgMul: 0.9 }, 40, 1).win;
      ok('战斗', '战斗中换克制按当前血量算（1 血的皮卡丘胜率低于满血）', low < full, `${pct100(low)} / ${pct100(full)}`);
    }
    const eo = evoOptions([{ uid: 'e1', id: 25, level: 30 }, { uid: 'e2', id: 16, level: 30 }], { 'thunder-stone': 1 });
    ok('战斗', '道具进化提醒（雷之石 → 雷丘，比比鸟不用道具）', eo.length === 1 && eo[0].to === 26, eo.map((e) => `${e.uid}→${e.to}`).join(','));

    /* ---- 4.2：招式禁用、游戏接口与原版重放、团体战优化 ---- */
    const pkBan = btUnit({ id: 25, level: 50, ban: ['spark'] });
    const pkDmg = pika ? pika.moves.map((m) => m.key) : [];
    const pkAll = btUnit({ id: 25, level: 50, ban: pkDmg });
    ok('战斗', '招式禁用（禁电光就不用；攻击招全禁时游戏恢复全部）',
        pkBan && !pkBan.moves.some((m) => m.key === 'spark') && pkBan.moves.length === pkDmg.length - 1 && pkAll && pkAll.moves.length === pkDmg.length,
        `${pkBan ? pkBan.moves.length : 0} / ${pkAll ? pkAll.moves.length : 0} / ${pkDmg.length}`);
    const lo = loadoutFor({ id: 25, level: 50 }, [[TA_TI.water, TA_TI.flying]], true);
    ok('战斗', '配招建议（皮卡丘打暴鲤龙：留电系招，禁电磁波）', !!lo && lo.keep.some((k) => BT_MV[k].t === TA_TI.electric) && lo.ban.includes('thunder-wave'),
        lo ? `留 ${lo.keep.join(',')}；禁 ${lo.ban.join(',')}` : '没有建议');
    ok('游戏接口', '启动时拿到游戏内部对象', nsOk(), nsOk() ? `已挂钩 step/tick ${PAGE_WIN.__pcautoWrapped | 0} 个` : nsWhy(), 'warn');
    if (nsOk()) ok('游戏接口', 'step / tick 两个都挂上了（实战统计要用）', (PAGE_WIN.__pcautoWrapped | 0) === 2, `${PAGE_WIN.__pcautoWrapped | 0} 个`, 'warn');
    ok('运行环境', '只有一份助手在运行', $$('#pcauto-hud').length === 1 && !!PAGE_WIN.__pcauto && PAGE_WIN.__pcauto.version === VERSION,
        `面板 ${$$('#pcauto-hud').length} 个 · 页面上的版本 ${(PAGE_WIN.__pcauto && PAGE_WIN.__pcauto.version) || '—'}`);
    if (EXT) {
      const rt = S_BOOT.extRT;
      ok('运行环境', '扩展存储：写入后能读回', HAS_STORE && !!rt && rt.ok,
          !HAS_STORE ? '没收到存储快照' : !rt ? '启动时的读写检查还没完成' : rt.ok ? `往返 ${rt.ms} ms` : rt.err || '读回的值不一致', rt ? 'fail' : 'warn');
    }
    if (nsOk()) {
      const G = NS().Game, sv = G.S;
      const fT = facts(S.save);
      const ch = fT && fT.gymCh >= 0 ? fT.gymCh : -1;
      const plan = ch >= 0 ? nrPlanChapter(ch) : null;
      const lineup = sv ? nrMons(sv.team || []) : [];
      if (plan && lineup.length) {
        const h = (s) => { let x = 0; for (let i = 0; i < s.length; i++) x = (Math.imul(x, 31) + s.charCodeAt(i)) | 0; return x; };
        const before = h(JSON.stringify(sv)), lsBefore = lsGet(SAVE_KEY);
        const t0 = performance.now();
        const a = nrRun(plan, lineup, 42), b = nrRun(plan, lineup, 42);
        const ms = Math.round(performance.now() - t0);
        const done = !!a && !!b && !a.error && !b.error && (a.win || a.lostTo != null) && (b.win || b.lostTo != null);
        const same = !a || !a.seeded || (a.win === b.win && a.steps === b.steps && a.arrive === b.arrive);
        const desc = (r) => (r ? `${r.win ? '胜' : '败'} ${r.steps} 步 进馆剩血 ${r.arrive != null ? pct100(r.arrive) : '—'}${r.error ? ' 出错：' + r.error : ''}` : '没跑起来');
        ok('游戏接口', '原版重放跑到分出胜负', done && same, `${desc(a)} / ${desc(b)} · 两次共 ${ms} ms${a && !a.seeded ? ' · 游戏冻结了随机数，不固定种子' : ''}`);
        ok('游戏接口', '原版重放不改动真实存档', G.S === sv && h(JSON.stringify(G.S)) === before && lsGet(SAVE_KEY) === lsBefore && !G.inSandbox());
        ok('游戏接口', '实战统计监听已装上', PAGE_WIN.__pcautoTap === bsTap, '', 'warn');
      } else ok('游戏接口', '原版重放', true, '当前没有下一道馆或队伍为空，跳过', 'warn');
    }
    /* ---- 1.1：实战统计、禁招候选、属性克制面 ---- */
    {
      const keep = S.bstats;
      S.bstats = { cur: null, seg: null, segs: [], last: null, lastBoss: null, inflict: {}, hp: {}, dirty: false, savedAt: 0, scratch: true };
      try {
        bsTap('step', [{ type: 'battleStart', kind: 'wild' }], null);
        bsTap('tick', [
          { type: 'attack', side: 'ally', uid: 'zA', target: 'zE', damage: 50, hp: 30, maxHp: 80 },
          { type: 'attack', side: 'ally', uid: 'zA', target: 'zE', damage: 100, hp: 0, maxHp: 80 },
          { type: 'attack', side: 'enemy', uid: 'zF', target: 'zA', statusMove: true, inflict: 'burn', damage: 0 },
          { type: 'status', side: 'ally', uid: 'zA', status: 'burn', what: 'hurt', damage: 10, hp: 90, maxHp: 100 },
          { type: 'status', side: 'ally', uid: 'zB', status: 'poison', what: 'hurt', damage: 5, hp: 50, maxHp: 100 },
        ], { zE: 80, zA: 100, zB: 55 });
        bsTap('tick', [{ type: 'victory' }], null);
        const sc = S.bstats.seg && S.bstats.seg.scopes.all;
        const rows = sc ? Object.values(sc.mons) : [];
        const a = rows.find((r) => r.uid === 'zA'), unk = rows.find((r) => r.uid === '?');
        const dotFoe = rows.find((r) => r.side === 'foe' && r.dot === 10);
        ok('实战统计', '不计溢出伤害（80 血的敌人挨 50 + 100 只算 80）', !!a && a.dealt === 80 && a.ko === 1, a ? `输出 ${a.dealt} · 击倒 ${a.ko}` : '没记到');
        ok('实战统计', '灼伤记给施加者，没来源的记「来源不明」', !!dotFoe && !!unk && unk.dealt === 5 && a.taken === 10,
          `施加者 ${dotFoe ? dotFoe.dot : '—'} · 来源不明 ${unk ? unk.dealt : '—'}`);
        ok('实战统计', '野怪战不算进首领范围', sc && sc.n === 1 && S.bstats.seg.scopes.boss.n === 0);
      } catch (e) {
        ok('实战统计', '合成事件跑通', false, String((e && e.message) || e));
      } finally { S.bstats = keep; }
      ok('实战统计', '挂钩源码里没有模板插值和反斜杠', NS_HOOK.indexOf('${') < 0 && NS_HOOK.indexOf('\\') < 0);
    }
    {
      const pk = { id: 25, level: 50 };
      const cs = banCands(pk, [[TA_TI.water, TA_TI.flying]], true);
      const atkKeys = (banMoves(pk) || { atk: [] }).atk.map((m) => m.key);
      ok('禁招', '候选禁法始终至少留一个攻击招', cs.length > 1 && cs.every((b) => atkKeys.some((k) => !b.includes(k))), `${cs.length} 种候选`);
      const team = [btUnit({ id: 25, level: 50 }), btUnit({ id: 26, level: 50 })];
      const cv = covTeam(team);
      ok('属性克制面', '纯电队怕地面、打水系两倍', !cv.blind.includes(TA_TI.water) && cv.off[TA_TI.water].e >= 2 && cv.hole.includes(TA_TI.ground),
        `盲区 ${cv.blind.map(covTypeCn).join('、')} · 弱点 ${cv.hole.map(covTypeCn).join('、')}`);
    }

    const fakePick = document.createElement('div');
    fakePick.innerHTML = '<div id="evt-pick" class="open"><div id="evt-pick-head"><h2>自检首领</h2></div><button id="evt-opt">Optimiser</button><div id="evt-team"></div></div>';
    let clicks = 0;
    $('#evt-opt', fakePick).addEventListener('click', () => { clicks++; });
    const seenT = {};
    raidOptimizeTick({ root: fakePick, seen: seenT });
    raidOptimizeTick({ root: fakePick, seen: seenT });
    ok('逻辑', '团体战选队：同一首领只点一次「优化」', clicks === 1, `点了 ${clicks} 次`);

    const mig = migrateCfgV3({ autoRetreat: true, push: true, pushEvents: { a: 1 }, shopBudget: 50000, autoFeed: false });
    ok('规则', '3.x 设置迁移', mig.progress && mig.counterSwap && !('push' in mig) && !('pushEvents' in mig) && mig.shopBudget === 50000 && mig.autoFeed === false,
        JSON.stringify(mig));

    S.selfTest = { at: now(), items: out };
    const fails = out.filter((x) => x.level === 'fail').length;
    const warns = out.filter((x) => x.level === 'warn').length;
    log(fails ? 'warn' : 'info', `自检完成：${out.length} 项，失败 ${fails}，警告 ${warns}`);
    return { total: out.length, fails, warns, items: out };
  }

  function selfTestText(r) {
    const mark = { ok: '✔', warn: '⚠', fail: '✘' };
    return [`Poke'Catch AutoFarm v${VERSION} 自检 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
      `共 ${r.total} 项，失败 ${r.fails}，警告 ${r.warns}`,
      ...r.items.map((x) => `${mark[x.level]} [${x.group}] ${x.name}${x.detail ? ` — ${x.detail}` : ''}`)].join('\n');
  }

  /** HUD「诊断」：先跑自检并展示结果，可复制自检报告或完整诊断信息 */
  function openDiag() {
    $('#pcauto-diagbox')?.remove();
    const r = runSelfTest();
    const color = { ok: '#4ade80', warn: '#fbbf24', fail: '#f87171' };
    const mark = { ok: '✔', warn: '⚠', fail: '✘' };
    let lastGroup = '';
    const rows = r.items.map((x) => {
      const head = x.group !== lastGroup ? `<div style="color:#8b93a7;font-size:11px;margin:8px 0 2px">${esc(x.group)}</div>` : '';
      lastGroup = x.group;
      return `${head}<div style="display:flex;gap:6px;font-size:11.5px;padding:1px 0">
        <b style="color:${color[x.level]};width:12px">${mark[x.level]}</b>
        <span style="flex:1">${esc(x.name)}${x.detail ? `<span style="color:#6b7488"> · ${esc(x.detail)}</span>` : ''}</span></div>`;
    }).join('');
    const box = document.createElement('div');
    box.id = 'pcauto-diagbox';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483002;background:rgba(6,8,14,.6);display:flex;align-items:center;justify-content:center';
    const btn = 'flex:1;padding:8px;border-radius:9px;border:1px solid #2c3346;background:transparent;color:#c7d0e0;cursor:pointer;font-size:12px';
    box.innerHTML = `<div style="width:360px;max-height:82vh;overflow:auto;background:#12141c;border:1px solid rgba(255,203,5,.32);border-radius:14px;padding:14px 16px;color:#e8ecf4;font:13px/1.5 system-ui,-apple-system,'PingFang SC',sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.65)">
      <b style="font-size:15px">自检与诊断</b>
      <div style="margin-top:4px;color:${r.fails ? '#f87171' : r.warns ? '#fbbf24' : '#4ade80'}">共 ${r.total} 项 · 失败 ${r.fails} · 警告 ${r.warns}</div>
      <div style="margin-top:4px;color:#8b93a7;font-size:11px">性能：${esc(perfText())}</div>
      ${rows}
      <div style="display:flex;gap:6px;margin-top:12px">
        <button id="pcauto-diag-st" style="${btn}">复制自检报告</button>
        <button id="pcauto-diag-info" style="${btn}">复制诊断信息</button>
      </div>
      <button id="pcauto-diag-ok" style="width:100%;margin-top:8px;padding:8px;border-radius:9px;border:0;background:#ffcb05;color:#12141c;font-weight:700;cursor:pointer">关闭</button>
    </div>`;
    document.documentElement.appendChild(box);
    $('#pcauto-diag-st', box).onclick = () => copyText(selfTestText(r), '自检报告');
    $('#pcauto-diag-info', box).onclick = dumpDiag;
    $('#pcauto-diag-ok', box).onclick = () => box.remove();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
    // 一键禁招的点击流程是异步的，跑完再补到列表里
    banSelfTest().then((items) => {
      const extra = items.map((x) => ({ group: '一键禁招', name: x.name, level: x.ok ? 'ok' : 'fail', detail: x.detail }));
      r.items.push(...extra);
      r.total += extra.length;
      r.fails += extra.filter((x) => x.level === 'fail').length;
      const anchor = $('#pcauto-diag-st', box);
      if (!anchor) return;
      const html = `<div style="color:#8b93a7;font-size:11px;margin:8px 0 2px">一键禁招</div>` + extra.map((x) => `<div style="display:flex;gap:6px;font-size:11.5px;padding:1px 0">
        <b style="color:${color[x.level]};width:12px">${mark[x.level]}</b><span style="flex:1">${esc(x.name)}<span style="color:#6b7488"> · ${esc(x.detail)}</span></span></div>`).join('');
      anchor.parentElement.insertAdjacentHTML('beforebegin', html);
    }).catch(() => { /* 忽略 */ });
  }
