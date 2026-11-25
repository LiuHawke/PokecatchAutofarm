// 构建：node tools/build.js
// 把 src/ 下的模块按文件名顺序拼进一个闭包，输出：
//   dist/ext-<版本>/        浏览器扩展（Chrome / Edge，MV3），以及同名 .zip
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
const V = pkg.version;
const MATCHES = [
  'https://pokecatch-online.netlify.app/*',
  'https://pokecatch-online.pages.dev/*',
  'https://pokecatch-online.app/*',
  'https://www.pokecatch-online.app/*',
];
const rd = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const check = (file) => execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const files = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /^\d+-.+\.js$/.test(f)).sort();
let body = '';
for (const f of files) {
  const code = rd('src', f).replace(/\{\{VERSION\}\}/g, V);
  body += `\n  // ---- ${f} ----\n` + code.replace(/\n+$/, '') + '\n';
}

// 数据文件（data/*.json）以 __DATA__.<名字> 注入
const dataDir = path.join(ROOT, 'data');
const data = {};
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir).filter((x) => x.endsWith('.json')).sort()) {
    data[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  }
}
const dataLine = `  const __DATA__ = ${JSON.stringify(data)};\n`;
const iife = `(function () {\n  'use strict';\n${dataLine}${body}\n})();\n`;

// ---- 扩展 ----
const EXT = path.join(ROOT, 'dist', `ext-${V}`);
fs.rmSync(EXT, { recursive: true, force: true });
fs.mkdirSync(EXT, { recursive: true });
const put = (name, text) => fs.writeFileSync(path.join(EXT, name), text);

// hook.js：012 里的 NS_HOOK 原样落地（不含 ${} 和转义，直接取模板字面量的内容）
const s012 = rd('src', files.find((f) => /^012-/.test(f)));
const ha = s012.indexOf('const NS_HOOK = `') + 'const NS_HOOK = `'.length;
const hookSrc = s012.slice(ha, s012.indexOf('`;', ha));
if (hookSrc.includes('${') || hookSrc.includes('\\')) throw new Error('NS_HOOK 含模板插值或转义，需要改构建方式');
put('hook.js', `// 游戏命名空间挂钩（页面世界，document_start）\n${hookSrc.trim()}\n`);

const wrap = rd('ext', 'app-wrap.js').replace(/\{\{VERSION\}\}/g, V);
if (!wrap.includes('/*__APP__*/')) throw new Error('app-wrap.js 缺少 /*__APP__*/');
put('app.js', wrap.replace('/*__APP__*/', () => iife));
put('bridge.js', rd('ext', 'bridge.js'));
put('popup.html', rd('ext', 'popup.html'));
put('popup.js', rd('ext', 'popup.js'));
const manifest = rd('ext', 'manifest.json').replace(/\{\{VERSION\}\}/g, V).replace(/\{\{MATCHES\}\}/g, JSON.stringify(MATCHES));
JSON.parse(manifest);
put('manifest.json', manifest);
for (const f of ['hook.js', 'app.js', 'bridge.js', 'popup.js']) check(path.join(EXT, f));

const zip = `${EXT}.zip`;
fs.rmSync(zip, { force: true });
// Windows 上显式用系统自带的 bsdtar：Git Bash 里的 GNU tar 会把 D:\\... 当成 host:path 远程路径而失败
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(TAR, ['-a', '-c', '-f', zip, '-C', EXT, '.'], { stdio: 'inherit' });

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`ok  ${path.relative(ROOT, EXT)}/  app.js ${kb(path.join(EXT, 'app.js'))} KB  ${files.length} 个模块`);
console.log(`ok  ${path.relative(ROOT, zip)}  ${kb(zip)} KB`);