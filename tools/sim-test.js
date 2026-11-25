// 离线验证对战模拟：node tools/sim-test.js
// 只拼数据与战斗模块（060/062/065/066），用固定阵容打关都联盟各间
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const data = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) data[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const files = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /^(060|062|065|066)-/.test(f)).sort();
const code = files.map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const api = new Function('__DATA__', `${code}\nreturn { btUnit, btSim, btGymHpMul, btFoeDmgMul, btPickMove, btSwitchScore, TA_NAME };`)(data);

const CH = data.chapters;
const team = [[112, 97], [130, 97], [25, 95], [57, 97], [119, 95], [118, 95]];
const mine = team.map(([id, level], i) => api.btUnit({ uid: 'm' + i, id, level }));
const name = (id) => api.TA_NAME[id - 1] || '#' + id;
let clear = 1;
const t0 = Date.now();
for (const c of CH.filter((x) => x.lg && x.r === 'kanto')) {
  const g = c.g;
  const hm = api.btGymHpMul(g.pw, g.team.length);
  const foes = g.team.map(([id, level]) => api.btUnit({ id, level }, { foe: true, hpMult: hm }));
  const r = api.btSim(mine, foes, { kind: 'gym', dmgMul: api.btFoeDmgMul('gym', g.pw) }, 300, 7);
  clear *= r.win;
  console.log(`${g.l.padEnd(4)} 胜率 ${(r.win * 100).toFixed(1)}%  打倒 ${(r.ko * 100).toFixed(0)}%  回合 ${r.turns.toFixed(0)}  终结者 ${r.lostTo.map((n, i) => n ? name(g.team[i][0]) + '×' + n : '').filter(Boolean).join(' ')}`);
}
console.log('通关率', (clear * 100).toFixed(1) + '%', '耗时', Date.now() - t0, 'ms');
