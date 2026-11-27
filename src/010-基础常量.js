  /* ====================== 基础常量 ====================== */

  const VERSION = '{{VERSION}}';
  // 页面的 window（扩展跑在页面世界，就是 window 本身）
  const PAGE_WIN = window;
  // 改写可见性必须作用在页面自己的 document 上，否则游戏看不到
  const PAGE_DOC = PAGE_WIN.document || document;
  const SAVE_KEY = 'gachamon-save-v1';
  const CFG_KEY = 'pcauto.cfg.v4';
  const CFG_KEY_V3 = 'pcauto.cfg.v1';   // 3.x 的设置：只读一次做迁移，不改写，回退旧版时还能用
  const SHINY_KEY = 'pcauto.shinies.v1';
  const TICK_MS = 350;
  const BAK_INDEX = 'pcauto.bak.index';
  const BAK_PREFIX = 'pcauto.bak.';
  const RESTORE_KEY = 'pcauto.restore.pending';
  const TALLY_KEY = 'pcauto.tally.v1';
  const S_BOOT = {};   // 启动早期（S 建好之前）的标记，start() 里再写日志

  /* ---- 性能计数：诊断里显示，用来定位卡顿 ---- */
  const PERF = {
    since: Date.now(),
    nr: { n: 0, ms: 0, max: 0 },          // 原版重放（每次同步阻塞）
    plan: { n: 0, ms: 0, why: {} },       // 配队重算次数、耗时、触发原因
    tick: { n: 0, ms: 0, max: 0 },        // 主循环 tick
    lt: { n: 0, ms: 0, max: 0 },          // 浏览器报告的长任务（> 50 ms，含游戏自己的）
  };
  function perfAdd(slot, ms) {
    slot.n++; slot.ms += ms;
    if (ms > slot.max) slot.max = ms;
  }
  function perfText() {
    const min = Math.max(1, (Date.now() - PERF.since) / 60000);
    const r = (x) => Math.round(x);
    return `统计 ${r(min)} 分钟：原版重放 ${PERF.nr.n} 次 共 ${r(PERF.nr.ms / 1000)} 秒（最长阻塞 ${r(PERF.nr.max)} ms）· `
      + `配队重算 ${PERF.plan.n} 次 共 ${r(PERF.plan.ms / 1000)} 秒（${Object.entries(PERF.plan.why).map(([k, v]) => `${k} ${v}`).join('、') || '—'}）· `
      + `tick 平均 ${PERF.tick.n ? (PERF.tick.ms / PERF.tick.n).toFixed(1) : 0} ms（最长 ${r(PERF.tick.max)}）· `
      + `长任务 ${PERF.lt.n} 次 共 ${r(PERF.lt.ms / 1000)} 秒（最长 ${r(PERF.lt.max)} ms，每分钟 ${(PERF.lt.n / min).toFixed(1)} 次）`;
  }

  /* ---- 扩展存储（chrome.storage，经 app.js 提供同步接口）：页面脚本读不到，用来放存档备份 ---- */

  // eslint-disable-next-line no-undef
  const EXT = typeof PCAUTO_EXT !== 'undefined' ? PCAUTO_EXT : null;
  const HAS_STORE = typeof extGet === 'function' && typeof extSet === 'function';
  function storeGet(key, fb) { try { return HAS_STORE ? extGet(key, fb) : fb; } catch { return fb; } }
  function storeSet(key, v) { try { if (!HAS_STORE) return false; extSet(key, v); return true; } catch { return false; } }
  function storeDel(key) { try { if (HAS_STORE && typeof extDel === 'function') extDel(key); } catch { /* 忽略 */ } }

  /*
   * 上一次页面里发起的恢复：只读出标记，启动后在日志里报告结果。
   * 写档本身在旧页面卸载时完成（见 restoreRaw），不再依赖 document-start 抢在游戏读档之前。
   */
  const restoredFrom = (() => {
    const p = storeGet(RESTORE_KEY, null);
    if (!p) return null;
    storeDel(RESTORE_KEY);
    return { label: p.label || '?', sum: p.sum || null };
  })();

  const DEFAULTS = {
    enabled: true,
    speed: 4,             // 1 / 2 / 4（界面显示 ×1 ×2 ×3）
    autoDex: true,        // 关闭捕获图鉴卡
    autoModal: true,      // 自动确认普通提示弹窗
    autoGift: true,       // 自动处理礼物/单选
    autoEvo: true,        // 自动进化
    evoEverySec: 30,
    autoSave: true,
    saveEveryMin: 5,
    notify: true,
    sound: true,
    wakeLock: true,
    stallSec: 120,
    stallReload: false,
    phaseNotify: true,       // 昼夜切换提醒
    nightGuard: true,        // 夜间零捕获告警
    keepAlive: false,        // 后台保活（实验）
    powerGuard: true,        // 战力与胜率告警
    showGrades: true,        // 队伍/PC 评分角标
    casinoAuto: false,       // 游戏城自动（消耗金钱）
    casinoFloor: 50000,      // 金钱低于此值时停手
    grindMode: true,         // 道馆/四天王死磕（失败后继续）
    autoSwitch: false,       // 残血自动换人（默认关，可能和你抢操作）
    switchAtHp: 30,          // 上场宝可梦血量低于该百分比时换人
    autoBerry: true,         // 自动吃树果
    berryLeadMin: 25,        // 剩余不足多少分钟时补一颗
    berryFamilies: { shiny: true, dex: true, rare: true, capture: true, xp: true, money: true },
    berryReserve: 1,         // 每种至少留几颗不吃
    hud: true,
    hudCollapsed: false,
    hudX: null,
    hudY: null,
    bsWinOnStart: false,     // 启动时打开实战统计悬浮窗
    logToConsole: false,
    // 存档备份（存在扩展存储里，不占页面 localStorage 的 5MB）
    backup: true,
    backupEveryMin: 30,
    backupKeep: 8,           // 自动备份保留份数；手动备份和「恢复前」备份另外最多留 5 份
    // 离开战报
    awayReport: true,
    awayMin: 15,             // 离开超过多少分钟，回来时弹战报
    // 主线策略（4.0）：按等级上限推进剧情
    progress: false,         // 主线推进：自动进最新章节、清掉会把人拉回旧章的循环
    counterSwap: false,      // 卡道馆且全队到上限时，按馆主属性换克制队
    stuckDeaths: 4,          // 全队到上限后，在馆主前再输几次算「卡住」
    // 自动化（会改阵容 / 花钱的默认关）
    autoFeed: true,          // 定时自动喂经验糖（按离上限的经验精确喂，不溢出）
    autoFeedMin: 15,
    autoTeam: false,         // 推荐阵容明显更强时自动换上
    autoTeamGap: 15,         // 推荐队的模拟得分比当前队高出多少（百分制）才换
    autoTeamProtect: true,   // 异色与传说（种族值 ≥ 580）不会被自动换下
    autoHatch: true,         // 蛋孵好了自动孵化
    autoDeposit: false,      // 培育屋空位自动放入宝可梦（百变怪优先）
    autoEvent: false,        // 活动队伍选好后自动出发（实验）
    raidOptimize: true,      // 团体战选队弹窗打开时，替你点一次游戏自带的「优化」（不点加入）
    autoShop: false,         // 按「离上限还差多少经验」自动买经验糖
    shopFloor: 100000,       // 花完后至少留多少 ₽
    shopBudget: 200000,      // 每小时最多花多少
    shopUnitMax: 100000,     // 单笔超过这个数不自动买，只提醒
    healthReload: false,     // 连续运行很久后在空闲时存档并刷新页面，释放内存
    healthHours: 6,
    preset: 'custom',        // 一键挂机档位：safe / balanced / full / custom
  };

  /*
   * 一键挂机档位：只写这里列出的开关，HUD、通知、声音等个人设置不动。
   * 后一档在前一档的基础上追加。
   */
  const PRESET_SAFE = {
    enabled: true, autoDex: true, autoModal: true, autoGift: true, autoEvo: true, autoSave: true,
    autoBerry: true, autoFeed: true, autoHatch: true, stallReload: true,
    progress: false, counterSwap: false, autoTeam: false, autoDeposit: false, autoShop: false,
    grindMode: false, keepAlive: false, healthReload: false,
  };
  const PRESET_BALANCED = {
    ...PRESET_SAFE,
    progress: true, counterSwap: true, autoDeposit: true, grindMode: true, wakeLock: true,
  };
  const PRESET_FULL = {
    ...PRESET_BALANCED,
    autoTeam: true, autoTeamGap: 15, autoShop: true, keepAlive: true, healthReload: true,
  };
  const PRESETS = {
    safe: { label: '稳妥', desc: '不花钱、不换章节、不换队：托管弹窗、进化、精确喂糖、孵蛋、树果', cfg: PRESET_SAFE },
    balanced: { label: '均衡', desc: '加上主线推进（防循环陷阱）、卡道馆按克制换队、培育屋寄放', cfg: PRESET_BALANCED },
    full: { label: '全托管', desc: '再加按需买经验糖、平时自动优化阵容、后台保活、定期健康刷新', cfg: PRESET_FULL },
  };

  const SAFE_EXACT = [
    '继续', '确定', '确定！', '好', '好的', '明白了', '太棒了', '收下', '领取', '关闭', '跳过', '知道了', '是', '嗯',
    '在这里玩', '在这里继续', 'Jouer ici', 'Continuer ici', 'Play here', 'Play here instead', 'Jugar aquí', 'Hier spielen',
    'Continuer', 'Continue', 'Confirmer', 'Valider', 'Fermer', 'Passer', 'Oui', 'Compris', 'Super !', 'Génial !',
    'OK', 'Okay', 'Continuar', 'Weiter', '계속', '続ける', 'はい',
  ];
  const DENY = /取消|返回|放弃|放生|出售|购买|删除|重置|Annuler|Retour|Relâcher|Vendre|Acheter|Supprimer|Cancel|Back/i;
  // 出现这些词的弹窗一律不自动点击（不可逆操作 / 玩家自己打开的详情卡）
  // 花钱 / 消耗道具的确认框：不进 DANGER（图鉴卡描述里也可能出现这些词），只拦住通用确认
  const SPEND = /购买|花费|Acheter|Dépenser|Buy|Spend|Purchase/i;
  const DANGER = /放生|Relâcher|出售|Vendre|删除|Supprimer|重置|Reset|Recommencer|重新开始|放弃|Abandonner|改名|Renommer|换装|重置存档/i;
