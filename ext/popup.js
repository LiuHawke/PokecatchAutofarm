const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IDX = 'pcauto.bak.index', BAK = 'pcauto.bak.';
const get = (k) => new Promise((r) => chrome.storage.local.get(k, r));
const set = (o) => new Promise((r) => chrome.storage.local.set(o, r));
const msg = (t, cls = 'sub') => { const m = $('#msg'); m.className = cls; m.textContent = t; };
const when = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false });

$('#ver').textContent = 'v' + chrome.runtime.getManifest().version;

async function render() {
  const all = await get(null);
  const st = all._status;
  const row = (k, v, cls = '') => `<div class="row"><span>${k}</span><span class="${cls}">${v}</span></div>`;
  $('#status').innerHTML = !st ? row('游戏页', '还没打开过（打开游戏后约 10 秒会显示）', 'warn')
    : st.dup ? row('状态', `另一份 v${esc(st.other || '?')} 在运行，扩展版没启动。请先停用另一份`, 'bad')
    : [row('最近一次', `${esc(st.host)} · ${when(st.at)}`),
      row('页面里的版本', 'v' + esc(st.version)),
      row('游戏内部接口', st.ns ? `已接入（step/tick 挂钩 ${st.wrapped} 个）` : `没接入：${esc(st.why || '?')}`, st.ns && st.wrapped === 2 ? 'ok' : 'warn'),
      row('扩展存储', st.hasStore ? '正常' : '没连上', st.hasStore ? 'ok' : 'bad')].join('');
  const idx = Array.isArray(all[IDX]) ? all[IDX] : [];
  const n = idx.filter((b) => typeof all[BAK + b.id] === 'string').length;
  const bytes = idx.reduce((s, b) => s + ((all[BAK + b.id] || '').length || 0), 0);
  $('#baks').textContent = idx.length ? `${n} 份（约 ${Math.round(bytes / 1024)} KB），最新 ${when(idx[0].at)}` : '还没有备份';
}

$('#exp').onclick = async () => {
  const all = await get(null);
  const out = {};
  for (const [k, v] of Object.entries(all)) if (k === IDX || k.startsWith(BAK)) out[k] = v;
  const url = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  const a = document.createElement('a');
  const d = new Date(), p = (x) => String(x).padStart(2, '0');
  a.href = url;
  a.download = `pcauto-backups-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/** 只收 pcauto.bak.index（数组）和 pcauto.bak.<id>（字符串）；索引按 id 合并、按时间倒序 */
async function importText(txt) {
  let obj;
  try { obj = JSON.parse(txt); } catch { return msg('不是有效的 JSON', 'bad'); }
  if (obj && typeof obj === 'object' && obj.data && typeof obj.data === 'object' && !obj[IDX]) obj = obj.data;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return msg('内容不是键值对象', 'bad');
  const inIdx = Array.isArray(obj[IDX]) ? obj[IDX].filter((b) => b && typeof b.id === 'string' && /^[\w-]{1,40}$/.test(b.id)) : [];
  const write = {};
  const good = [];
  for (const b of inIdx) {
    const raw = obj[BAK + b.id];
    if (typeof raw !== 'string' || raw.length < 20) continue;
    try { const s = JSON.parse(raw); if (!s || typeof s !== 'object' || !('mons' in s || 'adv' in s)) continue; } catch { continue; }
    write[BAK + b.id] = raw;
    good.push({ id: b.id, at: +b.at || Date.now(), kind: b.kind === 'auto' ? 'auto' : b.kind === 'pre' ? 'pre' : 'manual', hash: String(b.hash || ''), size: raw.length, sum: b.sum && typeof b.sum === 'object' ? b.sum : null });
  }
  if (!good.length) return msg('没找到可导入的备份（需要 pcauto.bak.index 和对应的 pcauto.bak.* 存档）', 'warn');
  const cur = (await get(IDX))[IDX];
  const merged = new Map((Array.isArray(cur) ? cur : []).map((b) => [b.id, b]));
  let added = 0;
  for (const b of good) { if (!merged.has(b.id)) added++; merged.set(b.id, b); }
  write[IDX] = [...merged.values()].sort((a, b) => b.at - a.at);
  await set(write);
  msg(`已导入 ${good.length} 份（新增 ${added}）。刷新游戏页后在助手的备份列表里能看到`, 'ok');
  render();
}

$('#impFile').onclick = () => $('#file').click();
$('#file').onchange = async () => {
  const f = $('#file').files[0];
  if (!f) return;
  if (f.size > 64 * 1024 * 1024) return msg('文件太大', 'bad');
  importText(await f.text());
};

render();
