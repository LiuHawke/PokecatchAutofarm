  /* ====================== 挂机模式 ====================== */

  function presetCardsHtml() {
    const cur = detectPreset(S.cfg);
    const card = (name) => {
      const p = PRESETS[name], on = cur === name;
      return `<button data-preset="${name}" style="display:block;width:100%;text-align:left;margin-top:8px;padding:9px 11px;border-radius:10px;cursor:pointer;
        border:1px solid ${on ? '#ffcb05' : '#2c3346'};background:${on ? 'rgba(255,203,5,.13)' : 'transparent'};color:#e8ecf4">
        <b style="font-size:13px;color:${on ? '#ffcb05' : '#e8ecf4'}">${p.label}${on ? ' · 当前' : ''}</b>
        <div style="font-size:11px;color:#8b93a7;margin-top:2px;line-height:1.45">${esc(p.desc)}</div></button>`;
    };
    return `${['push', 'grind', 'dex'].map(card).join('')}
      <div style="font-size:11px;color:#6b7488;margin-top:8px;line-height:1.5">${cur === 'custom' ? '当前是「自定义」：开关被手动改过，不属于任何模式。' : '之后在设置里手动改任何一项，都会变成「自定义」。'}
      三种模式都会托管弹窗、进化、孵蛋、存档和精确喂糖。练级刷钱、抓宠图鉴不会自己换章：去日程页的「章节收益」看哪章合适，点「去这章并循环」。
      切到推关前会先跑一次自检，有失败项时改用练级刷钱。</div>`;
  }

  function bindPresetCards(root, after) {
    $$('button[data-preset]', root).forEach((b) => {
      b.onclick = () => {
        applyPreset(b.dataset.preset);
        if (after) after();
      };
    });
  }

  function openPresetPicker() {
    $('#pcauto-preset-box')?.remove();
    const box = document.createElement('div');
    box.id = 'pcauto-preset-box';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483002;background:rgba(6,8,14,.6);display:flex;align-items:center;justify-content:center';
    box.innerHTML = `<div style="width:340px;background:#12141c;border:1px solid rgba(255,203,5,.32);border-radius:14px;padding:14px 16px;color:#e8ecf4;font:13px/1.5 system-ui,-apple-system,'PingFang SC',sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.65)">
      <b style="font-size:15px">挂机模式</b>
      <div id="pcauto-preset-cards">${presetCardsHtml()}</div>
      <button id="pcauto-preset-x" style="width:100%;margin-top:10px;padding:8px;border-radius:9px;border:1px solid #2c3346;background:transparent;color:#9aa4b8;cursor:pointer">关闭</button>
    </div>`;
    document.documentElement.appendChild(box);
    bindPresetCards(box, () => box.remove());
    $('#pcauto-preset-x', box).onclick = () => box.remove();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
  }
