  /* ====================== 模块：存档备份 ====================== */

  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + ':' + s.length;
  }
  function bakList() { const v = storeGet(BAK_INDEX, []); return Array.isArray(v) ? v : []; }

  function saveSummary(save) {
    const st = (save && save.stats) || {};
    return {
      dex: Object.keys((save && save.dex) || {}).length,
      caught: st.caught || 0,
      money: (save && save.money) || 0,
      chapter: ((save && save.adv && save.adv.chapter) || 0) + 1,
      mons: ((save && save.mons) || []).length,
    };
  }

  /** kind：auto（定时）/ manual（手动）/ pre（恢复前自动留底） */
  function backupNow(kind = 'auto') {
    if (!HAS_STORE) return { ok: false, msg: '扩展存储没连上（刷新页面试试）' };
    const raw = readSaveRaw();
    const save = raw ? safeParse(raw, null) : null;
    if (!save) return { ok: false, msg: '读不到有效存档' };
    const hash = hashStr(raw);
    const list = bakList();
    if (kind === 'auto' && list.length && list[0].hash === hash) return { ok: false, same: true, msg: '存档没有变化' };
    const id = now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!storeSet(BAK_PREFIX + id, raw)) return { ok: false, msg: '写入失败（存储可能已满）' };
    list.unshift({ id, at: now(), kind, hash, size: raw.length, sum: saveSummary(save) });
    // 自动备份按 backupKeep 轮换；手动和恢复前备份另外最多留 5 份，互不挤占
    const keepAuto = clamp(S.cfg.backupKeep | 0, 1, 30);
    let autoN = 0, otherN = 0;
    const kept = [];
    for (const b of list) {
      const keep = b.kind === 'auto' ? ++autoN <= keepAuto : ++otherN <= 5;
      if (keep) kept.push(b); else storeDel(BAK_PREFIX + b.id);
    }
    storeSet(BAK_INDEX, kept);
    return { ok: true, msg: `已备份（${Math.round(raw.length / 1024)} KB）` };
  }

  function maybeBackup() {
    if (!S.cfg.backup || !HAS_STORE || S.restoring) return;
    if (now() - S.lastBackupAt < clamp(S.cfg.backupEveryMin, 5, 720) * 60000) return;
    S.lastBackupAt = now();
    const r = backupNow('auto');
    if (!r.ok && !r.same) log('warn', '自动备份失败：' + r.msg);
  }

  function isGameSave(save) {
    return !!save && typeof save === 'object' && !Array.isArray(save) && ('mons' in save || 'adv' in save);
  }

  function restoreRaw(raw, label) {
    if (!HAS_STORE) { log('warn', '扩展存储没连上，无法恢复（刷新页面试试）'); return; }
    const save = safeParse(raw, null);
    if (!isGameSave(save)) { log('warn', '恢复失败：内容不是 Poke\'Catch 存档'); return; }
    const s = saveSummary(save);
    if (!confirm(`确定要把存档恢复到「${label}」吗？\n\n该存档：第 ${s.chapter} 章 · 图鉴 ${s.dex} · 捕获 ${s.caught} · ₽${s.money}\n\n当前存档会先自动备份一份，然后页面会刷新。`)) return;
    const pre = backupNow('pre');
    if (!pre.ok && !confirm(`当前存档备份失败（${pre.msg}），仍要继续恢复吗？`)) return;
    if (!storeSet(RESTORE_KEY, { label, sum: s })) { log('warn', '恢复失败：无法写入扩展存储'); return; }
    S.restoring = true;
    S.pausedByUser = true;
    // 游戏在 beforeunload 里会把内存里的存档再写一遍；pagehide 在它之后触发，
    // 所以在这里写回备份，才不会被游戏盖掉
    addEventListener('pagehide', () => { lsSet(SAVE_KEY, raw); });
    location.reload();
  }

  function stamp(t) {
    const d = new Date(t), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function importSaveFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) { log('warn', '导入失败：文件太大，不像存档'); return; }
      f.text().then((txt) => restoreRaw(txt, '文件 ' + f.name)).catch(() => log('warn', '导入失败：读不了文件'));
    };
    inp.click();
  }
