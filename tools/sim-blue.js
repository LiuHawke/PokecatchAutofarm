// 离线细看冠军战：node tools/sim-blue.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const data = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) data[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const files = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /^(060|062|065|066)-/.test(f)).sort();
const code = files.map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const A = new Function('__DATA__', `${code}\nreturn { btUnit, btSim, btFight, btRng, btGymHpMul, btFoeDmgMul, btPickMove, btBestVs, btSwitchScore, btEff, btBase, TA_NAME, BT_MV };`)(data);
const name = (id) => A.TA_NAME[id - 1] || '#' + id;

const lg = data.chapters.filter((x) => x.lg && x.r === 'kanto');
const g = lg[lg.length - 1].g;
console.log('冠军', g.l, 'power', g.pw, 'team', g.team.map(([id, lv]) => name(id) + lv).join(' '));
const hm = A.btGymHpMul(g.pw, g.team.length), dm = A.btFoeDmgMul('gym', g.pw);
const foes = g.team.map(([id, level]) => A.btUnit({ id, level }, { foe: true, hpMult: hm }));
const team = [[130, 100], [57, 100], [112, 100], [119, 100], [22, 100], [20, 96]];
const mine = team.map(([id, level], i) => A.btUnit({ uid: 'm' + i, id, level }));
for (const f of foes) console.log(name(f.id), f.lv, 'types', f.types, 'hp', f.maxHp, 'st', f.st, 'moves', f.moves.map((m) => m.key).join(','));
for (const m of mine) console.log(name(m.id), m.lv, 'hp', m.maxHp, 'st', m.st, 'moves', m.moves.length);
const r = A.btSim(mine, foes, { kind: 'gym', dmgMul: dm }, 500, 3);
console.log('胜率', r.win, '终结者', r.lostTo.map((n, i) => n ? name(g.team[i][0]) + '×' + n : '').filter(Boolean).join(' '));
const bl = foes.find((f) => f.id === 9);
if (bl) {
  for (const m of mine) {
    const one = A.btSim([m], [bl], { kind: 'gym', dmgMul: dm }, 200, 5);
    const mv = A.btPickMove(m, bl), back = A.btPickMove(bl, m);
    const eff = (a, d, x) => A.btEff(x.t, d.types);
    const dmg = (a, d, x, mul) => Math.round(A.btBase(a, d, x, x.p, eff(a, d, x), null, null) * 0.925 * mul);
    console.log(`${name(m.id).padEnd(4)} 单挑水箭龟 胜率 ${(one.win * 100).toFixed(0)}% 对方剩血 ${(one.foeHp * 100).toFixed(0)}% | 我方 ${mv.key} 一下约 ${dmg(m, bl, mv, 1)}/${bl.maxHp} 速${m.st.spe} | 对方 ${back.key} 一下约 ${dmg(bl, m, back, dm)}/${m.maxHp} 速${bl.st.spe} | 派出分 ${A.btSwitchScore(m, bl).toFixed(2)}`);
  }
}
