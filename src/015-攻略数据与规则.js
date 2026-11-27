  /* ====================== 攻略数据与规则 ====================== */

  /*
   * 游戏模块封在闭包里读不到，这里按攻略内置规则（数据由 tools/gen-data.js 从游戏 STORY 算出）。
   * CH[n] 对应存档 adv.chapter === n。
   */
  const CH = __DATA__.chapters;
  const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova'];
  const REGION_ZH = { kanto: '关都', johto: '城都', hoenn: '丰缘', sinnoh: '神奥', unova: '合众' };
  const REGION_XP = { kanto: 1, johto: 1.25, hoenn: 1.25, sinnoh: 1.35, unova: 1.35 };
  const LEAGUE_DONE_CAP = 100;

  /** 经验糖：面值 × 0.6 × 当前地区倍率；badges = 当前地区需要的徽章数；idx = 糖果卡上的按钮顺序 */
  const CANDIES = [
    { key: 'exp-candy-big', face: 1000000, price: 96000, badges: 8, idx: 3, zh: '经验糖果特大' },
    { key: 'exp-candy-xl', face: 250000, price: 48000, badges: 6, idx: 2, zh: '经验糖果XL' },
    { key: 'exp-candy-m', face: 15000, price: 7200, badges: 3, idx: 1, zh: '经验糖果M' },
    { key: 'exp-candy-s', face: 1000, price: 1200, badges: 0, idx: 0, zh: '经验糖果S' },
  ];

  /** 每日 / 每周玩法的解锁条件（攻略第 5 章） */
  const MODES = [
    { key: 'raid', zh: '团体战', cycle: '每日', test: (f) => f.badges.includes('Maître') },
    { key: 'under', zh: '地下通道', cycle: '每日', test: (f) => f.badges.includes('Forêt') },
    { key: 'candy', zh: '糖果工厂', cycle: '每日', test: (f) => f.badges.includes('Maître Hoenn') },
    { key: 'tower', zh: '对战塔', cycle: '每周', test: (f) => regionDone(f, 'hoenn') },
    { key: 'wboss', zh: '世界首领', cycle: '活动', test: (f) => regionDone(f, 'sinnoh') },
    { key: 'bloc', zh: '宝可方块首领', cycle: '每日', test: (f) => regionDone(f, 'unova') },
  ];

  const chOf = (n) => CH[n | 0] || null;
  function regionRange(r) {
    let a = -1, b = -1;
    CH.forEach((c, i) => { if (c.r === r) { if (a < 0) a = i; b = i; } });
    return [a, b];
  }
  function regionDone(f, r) { return (f.unlocked | 0) > regionRange(r)[1]; }

  /** 从 from 起本地区第一个有道馆的章节；没有了返回 -1（本地区已通关） */
  function nextGymCh(from, region) {
    for (let i = Math.max(0, from | 0); i < CH.length && CH[i].r === region; i++) if (CH[i].g) return i;
    return -1;
  }

  /** 某地区的等级上限：从推进到的最远章节往后找下一个道馆，取它的上限；地区通关后为 100 */
  function levelCap(unlocked, region) {
    const [a, b] = regionRange(region);
    if (a < 0) return 100;
    if ((unlocked | 0) > b) return LEAGUE_DONE_CAP;
    const g = nextGymCh(Math.max(a, unlocked | 0), region);
    return g < 0 ? LEAGUE_DONE_CAP : Math.min(100, CH[g].cap || 100);
  }

  /** 升到下一级所需经验：floor(ue(L) × 1.0361^(L−10) × 3 × 地区倍率)（未计地下通道段位） */
  function xpNeed(level, region) {
    const L = Math.max(1, level | 0);
    const ue = Math.floor(0.8 * Math.pow(L, 2.4) + 10);
    const g = L <= 10 ? 1 : Math.pow(1.0361, L - 10);
    return Math.floor(ue * g * 3 * (REGION_XP[region] || 1));
  }
  /** 离上限还差多少经验（存档里 mon.xp 是当前等级内的进度） */
  function xpToCap(mon, cap, region) {
    const L = mon.level | 0;
    if (L >= cap) return 0;
    let sum = 0;
    for (let l = L; l < cap; l++) sum += xpNeed(l, region);
    return Math.max(0, sum - (mon.xp || 0));
  }
  function candyXp(c, region) { return Math.floor(c.face * 0.6 * (REGION_XP[region] || 1)); }

  /** 本地区拿到的徽章数（决定商店能买哪种经验糖） */
  function regionBadgeCount(badges, region) {
    return CH.filter((c) => c.r === region && c.g && c.g.bf && badges.includes(c.g.bf)).length;
  }

  /** 存档 adv.loops 里数字是章节号，"L" / "L:地区" 是整个联盟 */
  const loopIsLeague = (x) => typeof x === 'string' && x[0] === 'L';
  const loopRegion = (x) => (loopIsLeague(x) ? x.slice(2) || 'kanto' : (chOf(x | 0) || {}).r);
  const loopName = (x) => (loopIsLeague(x) ? `${REGION_ZH[loopRegion(x)] || ''}联盟` : `第 ${(x | 0) + 1} 章`);

  /**
   * 局势快照：策略引擎只看它，不直接碰存档。每次调用重新算，开销很小。
   */
  function facts(save = S.save) {
    if (!save || !save.adv) return null;
    const adv = save.adv;
    const ch = adv.chapter | 0, unlocked = adv.unlocked | 0;
    const cur = chOf(ch) || {};
    const region = cur.r || 'kanto';
    const badges = (adv.badges || []).map(String);
    const gymCh = nextGymCh(Math.max(unlocked, regionRange(region)[0]), region);
    const byUid = new Map((save.mons || []).map((m) => [String(m.uid), m]));
    const team = (save.team || []).map((u) => byUid.get(String(u))).filter(Boolean).map((m) => {
      const cap = levelCap(unlocked, m.reg || region);
      return { m, uid: String(m.uid), lv: m.level | 0, cap, toCap: xpToCap(m, cap, region) };
    });
    const cap = levelCap(unlocked, region);
    const node = adv.nodes && adv.nodes[adv.node];
    const items = save.items || {};
    const rb = regionBadgeCount(badges, region);
    const candyOwnedXp = CANDIES.reduce((a, c) => a + (items[c.key] || 0) * candyXp(c, region), 0);
    const f = {
      ch, unlocked, region, regionZh: REGION_ZH[region] || region, cur, badges, regionBadges: rb,
      cap, gymCh, gym: gymCh >= 0 ? CH[gymCh].g : null,
      loops: [],
      team, teamMin: team.length ? Math.min(...team.map((t) => t.lv)) : 0,
      atCap: team.length > 0 && team.every((t) => t.lv >= t.cap),
      xpDemand: team.reduce((a, t) => a + t.toCap, 0),
      candyOwnedXp,
      deathsHere: ((adv.deaths || {})[ch]) | 0,
      special: adv.event ? '活动' : adv.zone ? '区域' : adv.tower ? '对战塔' : adv.league ? '联盟' : '',
      nodeType: node ? node.type : '',
      money: save.money || 0,
      monsN: (save.mons || []).length,
      regionDoneNext: unlocked < CH.length && chOf(unlocked) && chOf(unlocked).r !== region,
    };
    // 联盟：各间是连续章节，输了游戏把人送回第 1 间（章节号 < 推进到的那间属于正常）
    const lgChs = CH.filter((c) => c.lg && c.r === region).map((c) => c.c);
    f.leagueChs = lgChs;
    f.inLeague = lgChs.includes(ch) && lgChs.includes(unlocked);
    f.leagueDeaths = lgChs.reduce((a, c) => a + (((adv.deaths || {})[c]) | 0), 0);
    // 还在打本地区联盟时，联盟循环只会把人送回联盟第 1 间，不妨碍推进
    f.loops = (adv.loops || []).filter((x) => !(loopIsLeague(x) && loopRegion(x) === region && lgChs.includes(unlocked)));
    f.modes = MODES.map((m) => ({ key: m.key, zh: m.zh, cycle: m.cycle, open: !!m.test(f) }));
    return f;
  }
