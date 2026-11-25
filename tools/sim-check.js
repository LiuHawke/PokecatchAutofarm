// 离线核对战斗模型自检项：node tools/sim-check.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const data = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) data[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const files = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /^(060|062|065|066)-/.test(f)).sort();
const code = files.map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const eng = fs.readFileSync(path.join(ROOT, 'src', fs.readdirSync(path.join(ROOT, 'src')).find((f) => /^070-/.test(f))), 'utf8');
const lo = eng.slice(eng.indexOf('const LOADOUT_DOT'), eng.indexOf('/** 推荐配招对现阵容'));
const A = new Function('__DATA__', `${code}\n${lo}\nreturn { btUnit, btSim, btBase, btEff, btSwitchScore, BT_MV, loadoutFor, TA_TI };`)(data);
const pk = A.loadoutFor({ id: 25, level: 50 }, [[A.TA_TI.water, A.TA_TI.flying]], true);
console.log('配招 皮卡丘→暴鲤龙', pk, '禁电光后', A.btUnit({ id: 25, level: 50, ban: ['spark'] }).moves.length);

const pika = A.btUnit({ id: 25, level: 50 }), gyara = A.btUnit({ id: 130, level: 50 }), golem = A.btUnit({ id: 76, level: 50 });
const tb = A.BT_MV.thunderbolt;
console.log('十万伏特', tb, '伤害', A.btBase(pika, gyara, tb, tb.p, A.btEff(tb.t, gyara.types), null, null));
console.log('皮卡丘血', pika.maxHp, '招式', pika.moves.map((m) => m.key).join(','), '| 变化', pika.smoves.join(','));
console.log('超梦 vs 小拉达', A.btSim([A.btUnit({ id: 150, level: 100 })], [A.btUnit({ id: 19, level: 5 }, { foe: true })], { kind: 'trainer', dmgMul: 0.9 }, 30, 1).win);
console.log('隆隆岩 vs 皮卡丘', A.btSim([golem], [pika], { kind: 'trainer', dmgMul: 0.9 }, 100, 1).win);
console.log('换人打分 隆隆岩/暴鲤龙', A.btSwitchScore(golem, pika), A.btSwitchScore(gyara, pika));
