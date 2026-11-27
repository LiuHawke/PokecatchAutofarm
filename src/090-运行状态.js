  /* ====================== 运行状态 ====================== */

  const S = {
    cfg: readCfg(),
    bootAt: now(),
    save: null,
    saveRaw: '',           // 上次 parse 过的原始字符串，用于跳过没必要的 JSON.parse
    saveMissWarned: false,
    teamCache: null,       // { src: S.save, val }
    monMapCache: null,     // { src: S.save, map }
    baseline: null,        // {at, caught, battles, money, dex}
    sessionEarned: 0,      // 本次会话累计净赚金钱（忽略消费负增量）
    win: [],               // 滑动窗口样本
    rate: { catch: 0, battle: 0, money: 0 },
    avg: { catch: 0, battle: 0, money: 0 },
    shinyKeys: new Set(safeParse(lsGet(SHINY_KEY), []) || []),
    shinyPrimed: false,    // 首轮扫描只登记不通知，避免记录被裁剪后老闪光「复活」
    shinySession: 0,
    events: [],
    logDirty: true,
    lastProgressAt: now(),
    lastNodeKey: '',
    lastBadgeKey: null,
    modalKey: '',
    modalSince: 0,
    modalHandledAt: 0,
    unknownModal: '',
    lastEvoAt: 0,
    evoFail: 0,
    evoBefore: 0,
    lastTick: 0,
    lastTickAt: now(),
    lastActivityAt: now(),
    lastLogText: '',
    lastStartAt: 0,
    phase: -1,
    phaseAt: 0,
    phaseCatch: { 0: 0, 1: 0, 2: 0 },     // 本次会话各相位捕获数
    lastCatchAt: now(),
    lastCatchCount: -1,
    hiddenSince: 0,
    hiddenTotalMs: 0,
    prevTick: 0,
    keepAliveOn: null,
    berryAt: {},
    powerWarn: '',
    powerWarnAt: 0,
    speedPrev: null,
    speedAt: 0,            // 上次主动点击速度按钮的时间（冷却，防止 350ms 连点）
    deaths: null,
    deathStreak: 0,
    deathWarnAt: 0,
    switchAt: 0,
    speedRatio: null,
    // 脚本自己发起的操作：{ kind: 时间戳 }，弹窗模块据此判断「这个确认框是我点出来的」
    intents: {},
    busyTask: '',          // 正在执行的长任务（喂糖 / 换队 / 孵蛋 / 购物 / 换章节），期间主循环让路
    teamUndo: null,        // 上次换队前的队伍 uid
    autoTeamAt: 0,
    autoFeedAt: 0,
    pensionAt: 0,
    shopAt: 0,
    shopSpent: [],         // [{ at, cost }]，算每小时预算
    lastDeathAt: 0,
    prog: null,            // 主线状态（progState() 懒加载，跨刷新保存在 pcauto.progress.v4）
    plan: null,            // 主线策略最近一次的结论 { key, why }
    progressAt: 0,
    healthReloads: 0,
    taskFails: {},         // 每项自动化连续失败次数，到 3 次停用
    berryPending: null,    // { key, have, until }：吃树果后等采样确认
    penSlots: null,        // 培育屋已开放的寄放位数，第一次进培育屋时读取
    modalClsSeen: {},      // 没登记过的弹窗 class，进诊断
    catchup: null,         // 最近一次离线补算：{ mins, money, caught }
    realDescs: null,
    lastTapAt: 0,
    lastChoiceAt: 0,
    userAt: 0,
    eventKey: null,
    lastSaveAt: 0,
    lastNotifyKey: '',
    stalled: false,
    pausedByUser: false,
    lastEvoCount: null,
    lastDex: null,
    lastBackupAt: 0,
    restoring: false,
    // 离开战报用的累计计数（只增不减），战报 = 两个快照之差
    tally: {
      caught: 0, battles: 0, money: 0, evolutions: 0, dexNew: 0, berries: 0, deaths: 0, manual: 0, stalls: 0,
      teamSwaps: 0, hatched: 0, deposited: 0, candies: 0, shopSpent: 0, retreats: 0, advances: 0, catchupMin: 0,
      shinies: [], badges: [], events: [],
    },
    bootSnap: null,
    awaySnap: null,
    awayLastSeen: 0,
  };
