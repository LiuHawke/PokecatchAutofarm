// 打印 012 里注入页面的挂钩源码（单行），供浏览器实测用 CDP 预注入：node tools/hook-src.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src');
const s = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /^012-/.test(f))), 'utf8');
const a = s.indexOf('const NS_HOOK = `') + 'const NS_HOOK = `'.length;
const b = s.indexOf('`;', a);
console.log(s.slice(a, b).replace(/\s*\n\s*/g, ' '));
