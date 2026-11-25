  /* ====================== 模块：保存 ====================== */

  function maybeSave() {
    if (!S.cfg.autoSave) return;
    if (now() - S.lastSaveAt < S.cfg.saveEveryMin * 60000) return;
    const btn = $('#save-btn');
    if (btn) { S.lastSaveAt = now(); fire(btn); }
  }
