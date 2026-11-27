// 离线回归禁招建议：node tools/ban-check.js [样本数]
// 随机阵容打各章馆主，比较「不禁招 / loadoutFor 规则 / 072 模拟搜索」在没参与搜索的种子上的通关率。
// 只统计不禁招时胜负未定（10%–90%）的样本；没有断言，人工看输出。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const data = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) data[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const pick = (re) => fs.readFileSync(path.join(SRC, fs.readdirSync(SRC).find((f) => re.test(f))), 'utf8');
const code = fs.readdirSync(SRC).filter((f) => /^(060|062|065|066)-/.test(f)).sort().map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
const eng = pick(/^070-/);
const lo = eng.slice(eng.indexOf('const LOADOUT_DOT'), eng.indexOf('/** 推荐配招对现阵容'));
const ban = pick(/^072-/);
const A = new Function('__DATA__', `${code}\n${lo}\n${ban}\nreturn { btUnit, btSim, btGymHpMul, btFoeDmgMul, BT_DEX, loadoutFor, banAdvise, banCands };`)(data);

const CH = data.chapters;
const N = Number(process.argv[2]) || 60;
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const ids = Object.keys(A.BT_DEX).map(Number).filter((id) => id <= 493);
const gyms = CH.map((c, i) => ({ c, i })).filter((x) => x.c.g && x.c.g.team && x.c.g.team.length);

const room = (c) => {
  const g = c.g, hm = A.btGymHpMul(g.pw, g.team.length);
  return { ids: g.team, kind: 'gym', dmgMul: A.btFoeDmgMul('gym', g.pw), w: 1, foes: g.team.map(([id, level]) => A.btUnit({ id, level }, { foe: true, hpMult: hm })).filter(Boolean) };
};
const clear = (mons, r, s, runs = 200) => A.btSim(mons.map((m) => A.btUnit(m)).filter(Boolean), r.foes, { kind: r.kind, dmgMul: r.dmgMul }, runs, s).win;

(async () => {
  const sum = { none: 0, rule: 0, search: 0, n: 0, changed: 0 };
  const t0 = Date.now();
  for (let k = 0; k < N * 4 && sum.n < N; k++) {
    const { c } = gyms[Math.floor(rnd() * gyms.length)];
    const lv = Math.max(5, Math.min(100, (c.cap || 50) - Math.floor(rnd() * 8)));
    const mons = Array.from({ length: 6 }, (_, i) => ({ uid: 'u' + i, id: ids[Math.floor(rnd() * ids.length)], level: lv }));
    const r = room(c);
    const base = clear(mons, r, 555);
    if (base < 0.1 || base > 0.9) continue;
    const foeTypes = r.ids.map(([id]) => A.BT_DEX[id] && A.BT_DEX[id].types).filter(Boolean);
    const ruled = mons.map((m) => { const l = A.loadoutFor(m, foeTypes, true); return l ? { ...m, ban: l.ban } : m; });
    const adv = await A.banAdvise(mons, [r]);
    const searched = adv ? mons.map((m) => { const s = adv.sug.find((x) => x.uid === m.uid); return s ? { ...m, ban: s.ban } : m; }) : mons;
    sum.none += base;
    sum.rule += clear(ruled, r, 555);
    sum.search += clear(searched, r, 555);
    sum.n++;
    if (adv) sum.changed++;
  }
  const p = (x) => `${(x / Math.max(1, sum.n) * 100).toFixed(1)}%`;
  console.log(`样本 ${sum.n}（胜负未定的随机阵容 × 道馆），用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  console.log(`不禁招        ${p(sum.none)}`);
  console.log(`loadoutFor    ${p(sum.rule)}`);
  console.log(`072 模拟搜索  ${p(sum.search)}（给出建议的样本 ${sum.changed}）`);
})();
