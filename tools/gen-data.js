// 生成内置数据：node tools/gen-data.js
// 输入 guide/chapters.json（由游戏 STORY 函数算出），输出 data/chapters.json（精简字段，构建时注入为 __DATA__.chapters）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'guide/chapters.json'), 'utf8'));

const chapters = src.map((c) => ({
  c: c.ch,
  r: c.region,
  rz: c.region_zh,
  n: c.name_zh,
  p: c.path_zh || '',
  ace: c.ace,
  cap: c.cap,
  lv: c.ui_lv,
  tr: c.trainers || 0,
  w: c.wild || 0,
  lg: !!c.league,
  room: c.league_room ?? null,
  first: !!c.first_of_region,
  last: !!c.last_of_region,
  g: c.gym ? {
    l: c.gym.leader_zh, lf: c.gym.leader_fr, b: c.gym.badge_zh, bf: c.gym.badge_fr,
    t: c.gym.types || [], ct: c.gym.counter_types || [], rt: c.gym.resist_types || [],
    champ: !!c.gym.champion, ace: c.gym.ace, pw: c.gym.power || 1, dbl: !!c.gym.double,
    team: (c.gym.team || []).map(([id, , lv]) => [id, lv]),
  } : null,
}));

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const out = path.join(ROOT, 'data', 'chapters.json');
fs.writeFileSync(out, JSON.stringify(chapters));
console.log('chapters', chapters.length, (fs.statSync(out).size / 1024).toFixed(1) + ' KB');

// 道具进化：{ 原图鉴号: [[进化后图鉴号, 道具 key]] }，只收用道具进化的分支；items = 这些道具的中文名
const GAME = path.resolve(ROOT, 'research/data');
const evoSrc = JSON.parse(fs.readFileSync(path.join(GAME, 'EVOLUTIONS.json'), 'utf8'));
const zhItems = JSON.parse(fs.readFileSync(path.join(GAME, 'zh.json'), 'utf8')).items || {};
const evo = {}, items = {};
for (const [from, list] of Object.entries(evoSrc)) {
  const byItem = list.filter((x) => x.item).map((x) => [x.to, x.item]);
  if (!byItem.length) continue;
  evo[from] = byItem;
  for (const [, it] of byItem) items[it] = zhItems[it] || it;
}
const evoOut = path.join(ROOT, 'data', 'evo.json');
fs.writeFileSync(evoOut, JSON.stringify({ evo, items }));
console.log('evo', Object.keys(evo).length, (fs.statSync(evoOut).size / 1024).toFixed(1) + ' KB');

// 战斗招式表：按游戏 movePower / minPower / moveAcc 算好的有效数值，以及状态招与追加效果。
// mv[key] = [属性, 威力, 最低段威力, 'p'|'s', 命中, 多段]；st[key] = [状态, 概率%（已按游戏上限截断）, 属性]
const CONFIG = JSON.parse(fs.readFileSync(path.join(GAME, 'CONFIG.json'), 'utf8'));
const MOVES = JSON.parse(fs.readFileSync(path.join(GAME, 'MOVES.json'), 'utf8'));
const STATUS = JSON.parse(fs.readFileSync(path.join(GAME, 'STATUS.json'), 'utf8')).MOVES;
const MH = CONFIG.MULTI_HIT, MHO = CONFIG.MULTI_HIT_ODDS;
const movePower = (k) => {
  if (CONFIG.SIGNATURE_POWER[k] != null) return CONFIG.SIGNATURE_POWER[k];
  if (CONFIG.MOVE_POWER_OVERRIDES[k] != null) return CONFIG.MOVE_POWER_OVERRIDES[k];
  const b = (MOVES[k] && MOVES[k].power) || 0, h = MH[k];
  if (h == null) return b;
  if (Array.isArray(h)) return h.reduce((a, x) => a + x, 0);
  if (h === '2-5') return b * MHO.reduce((a, p, i) => a + p * (i + 2), 0);
  return b * h;
};
const minPower = (k) => (MH[k] === '2-5' ? 2 * ((MOVES[k] && MOVES[k].power) || 0) : movePower(k));
const [A0, A1, AMIN] = CONFIG.ACC_CURVE;
const moveAcc = (k) => {
  const p = movePower(k);
  return p <= 0 ? (MOVES[k].acc || 100) : 100 - (100 - AMIN) * Math.min(1, Math.max(0, p - A0) / (A1 - A0));
};
const CAP100 = new Set(['spore', 'sacred-fire', 'nuzzle', 'zap-cannon', 'inferno', 'dynamic-punch']);
const r2 = (x) => Math.round(x * 100) / 100;
const mv = {}, st = {};
for (const [k, m] of Object.entries(MOVES)) {
  if (CONFIG.MOVE_BLACKLIST.includes(k)) continue;
  const p = movePower(k);
  if (p > 0) mv[k] = [m.type, r2(p), r2(minPower(k)), m.cat === 'phys' ? 'p' : 's', r2(moveAcc(k)), MH[k] == null ? 0 : MH[k]];
  const s = STATUS[k];
  if (s) {
    const cap = CAP100.has(k) ? 100 : p > 0 ? 30 : 70;
    st[k] = [s[0], p > 0 ? Math.min(s[1], cap) : Math.min(m.acc || s[1], cap), m.type];
  }
}
// 学习表：游戏启动时按进化链、威力台阶重排出 learnAll，规则很绕，这里直接截取游戏原代码在 Node 里跑一遍
const POKEDEX = JSON.parse(fs.readFileSync(path.join(GAME, 'POKEDEX.json'), 'utf8'));
const PRETTY = fs.readFileSync(path.resolve(ROOT, 'research/tmp/app.pretty.js'), 'utf8');
const cut = (from, to) => {
  const a = PRETTY.indexOf(from);
  const b = PRETTY.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('游戏代码里找不到标记：' + (a < 0 ? from : to));
  return PRETTY.slice(a, b + to.length);
};
const learnSrc = cut('const t=a.CONFIG,g={', 's.learnAll=Ot.sort((an,Dn)=>an[0]-Dn[0])}');
const powerSrc = cut('function O(s,f){', 'I==="2-5"?b*t.MULTI_HIT_ODDS.reduce((ze,Sa,Ka)=>ze+Sa*(Ka+2),0):b*I}');
// JSON 导出时把 Infinity 存成了 null（MOVE_LEVELS 的最后一档）
CONFIG.MOVE_LEVELS = CONFIG.MOVE_LEVELS.map(([p, lv]) => [p == null ? Infinity : p, lv]);
// 形态条目（id = 本体×100+n）导出时共享引用的字段写成了 "[ref]"，按本体补回
const dexCopy = JSON.parse(JSON.stringify(POKEDEX));
const dexById = new Map(dexCopy.map((d) => [d.id, d]));
for (const d of dexCopy) {
  for (const [k, v] of Object.entries(d)) {
    if (v !== '[ref]') continue;
    const base = dexById.get(Math.floor(d.id / 100));
    d[k] = base ? JSON.parse(JSON.stringify(base[k])) : [];
  }
}
const gameA = {
  CONFIG, POKEDEX: dexCopy, MOVES,
  EVOLUTIONS: JSON.parse(JSON.stringify(evoSrc)), STATUS: { MOVES: STATUS },
};
const learnAll = new Function('a', `${powerSrc}\n${learnSrc}\nreturn g;`)(gameA);
const useful = (k) => !!mv[k] || !!st[k];
const mvKeys = [...new Set(Object.values(learnAll).flatMap((d) => (d.learnAll || []).map((x) => x[1]).filter(useful)))].sort();
const kIdx = new Map(mvKeys.map((k, i) => [k, i]));
const dex = {};
for (const d of Object.values(learnAll)) {
  const s = d.stats;
  const ln = (d.learnAll || []).filter((x) => useful(x[1])).map(([lv, k]) => `${Math.max(0, lv | 0).toString(36)}.${kIdx.get(k).toString(36)}`).join(' ');
  dex[d.id] = `${d.types.join(',')}|${[s.hp, s.atk, s.def, s.spa, s.spd, s.spe].join(',')}|${ln}`;
}

const pick = (keys) => Object.fromEntries(keys.map((k) => [k, CONFIG[k]]));
const battle = {
  mv, st, keys: mvKeys, dex,
  cfg: pick(['LEVEL_GAP', 'GYM_DAMAGE', 'GYM_HP_MULT', 'GYM_TEAM_EXP', 'ENEMY_DAMAGE', 'HP_BOOST', 'HP_LEVEL_MAX', 'HP_LEVEL_SCALE',
    'CRIT_CHANCE', 'CRIT_MULT', 'STATUS_MOVE_CHANCE', 'TYPE_EFF_MAX', 'TYPE_POWER', 'STALL_ROUNDS', 'MAX_ROUNDS', 'THAW_CHANCE',
    'FULL_PARA_CHANCE', 'CONFUSION_SELF_HIT', 'STATUS_FX', 'DRAIN', 'SHINY_STAT_BONUS', 'MULTI_HIT_ODDS']),
  rankStat: CONFIG.UNDERGROUND.RANK_STAT, rankMax: CONFIG.UNDERGROUND.RANK_MAX,
};
const batOut = path.join(ROOT, 'data', 'battle.json');
fs.writeFileSync(batOut, JSON.stringify(battle));
console.log('battle', Object.keys(mv).length, 'moves', Object.keys(st).length, 'status', (fs.statSync(batOut).size / 1024).toFixed(1) + ' KB');
