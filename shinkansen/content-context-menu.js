// content-context-menu.js — 右鍵「翻譯選取文字」的頁內浮層。
// 不替換選取範圍或網頁 DOM；沿用主要預設（slot 2）的引擎、模型與目標語言。
(function (SK) {
  'use strict';
  if (!SK || SK.disabled || SK.contextMenuSelection) return;

  let host = null;
  let shadow = null;
  let panel = null;
  let headerEl = null;
  let sourceEl = null;
  let resultEl = null;
  let requestSerial = 0;
  let lastPointer = null;
  let dragState = null;

  function message(key, fallback) {
    try { return browser.i18n.getMessage(key) || fallback; } catch (_) { return fallback; }
  }

  function closePanel() {
    requestSerial++; // 讓關閉後才回來的回應失效
    dragState = null; // 拖曳中關閉直接收尾（window listener 一併移除）
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', endDrag, true);
    window.removeEventListener('pointercancel', endDrag, true);
    if (host) host.remove();
    host = null;
    shadow = null;
    panel = null;
    headerEl = null;
  }

  function placePanel(x, y) {
    if (!panel) return;
    const margin = 12;
    const rect = panel.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function selectionAnchor() {
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (rect.width || rect.height) return { x: rect.left, y: rect.bottom + 8 };
      }
    } catch (_) { /* 使用右鍵座標 */ }
    return lastPointer || { x: window.innerWidth / 2 - 180, y: 80 };
  }

  // 拖曳：header 是把手（cursor:grab），pointerdown 記下指標與 panel 左上角
  // 的相對位移，window 級 pointermove 即時 placePanel（沿用邊界夾制），pointerup
  // 收尾。關閉鈕在 header 內，event.target.closest('button') 命中時不進拖曳、
  // 不 preventDefault，讓 click 正常觸發。
  function onDragMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId || !panel) return;
    placePanel(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
  }

  function endDrag(event) {
    if (dragState && event.pointerId === dragState.pointerId) dragState = null;
    if (headerEl) headerEl.classList.remove('dragging');
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', endDrag, true);
    window.removeEventListener('pointercancel', endDrag, true);
  }

  function beginDrag(event) {
    if (!panel || event.button !== 0) return;
    if (event.target && event.target.closest && event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    if (headerEl) headerEl.classList.add('dragging');
    window.addEventListener('pointermove', onDragMove, true);
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    event.preventDefault(); // 拖曳期間不選字 / 不搶 focus
  }

  function showPanel(text) {
    closePanel();
    const serial = requestSerial;
    const anchor = selectionAnchor();
    host = document.createElement('div');
    host.id = 'shinkansen-selection-host';
    host.style.cssText = 'all:initial;position:fixed;left:0;top:0;z-index:2147483647;';
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; }
      .panel { position:fixed; width:min(420px,calc(100vw - 24px)); max-height:min(560px,calc(100vh - 24px)); overflow:auto; padding:14px 16px; border:1px solid #e2e2e7; border-radius:12px; background:#fff; color:#1d1d1f; box-shadow:0 10px 36px rgba(0,0,0,.22); font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft JhengHei",sans-serif; text-align:left; }
      .header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; cursor:grab; user-select:none; -webkit-user-select:none; touch-action:none; }
      .header.dragging { cursor:grabbing; }
      .title { font-size:13px; font-weight:600; color:#6e6e73; }
      button { border:0; border-radius:5px; background:transparent; color:#6e6e73; font:20px/1 sans-serif; cursor:pointer; padding:2px 5px; }
      button:hover { background:#f0f0f3; color:#1d1d1f; }
      .label { margin:10px 0 4px; font-size:11px; font-weight:600; color:#86868b; }
      .source { max-height:130px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; color:#6e6e73; font-size:12px; }
      .result { white-space:pre-wrap; overflow-wrap:anywhere; }
      .loading { color:#6e6e73; }
      .error { color:#c9342c; }
    `;
    panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', message('contextTranslateSelection', 'Translate selection'));

    const header = document.createElement('div');
    header.className = 'header';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = 'Shinkansen';
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', closePanel);
    header.append(title, close);
    headerEl = header;
    header.addEventListener('pointerdown', beginDrag);

    const sourceLabel = document.createElement('div');
    sourceLabel.className = 'label';
    sourceLabel.textContent = message('selectionOriginal', 'Original');
    sourceEl = document.createElement('div');
    sourceEl.className = 'source';
    sourceEl.textContent = text;
    resultEl = document.createElement('div');
    resultEl.className = 'result loading';
    resultEl.textContent = message('selectionTranslating', 'Translating…');
    panel.append(header, sourceLabel, sourceEl, resultEl);
    shadow.append(style, panel);
    (document.body || document.documentElement).appendChild(host);
    placePanel(anchor.x, anchor.y);
    return serial;
  }

  async function mainPreset() {
    const fallback = SK.DEFAULT_PRESETS || [{ slot: 2, engine: 'gemini', model: null }];
    try {
      const { translatePresets } = await browser.storage.sync.get('translatePresets');
      const presets = Array.isArray(translatePresets) && translatePresets.length ? translatePresets : fallback;
      return presets.find(p => p.slot === 2) || presets[0];
    } catch (_) {
      return fallback.find(p => p.slot === 2) || fallback[0];
    }
  }

  async function translateSelection(text, serial) {
    try {
      const preset = await mainPreset();
      let type = 'TRANSLATE_BATCH';
      if (preset.engine === 'google') type = 'TRANSLATE_BATCH_GOOGLE';
      if (preset.engine === 'openai-compat') type = 'TRANSLATE_BATCH_CUSTOM';
      const response = await SK.safeSendMessage({
        type,
        payload: {
          texts: [text],
          modelOverride: preset.engine === 'gemini' ? preset.model || null : null,
        },
      });
      if (serial !== requestSerial) return;
      if (!response?.ok) {
        throw new Error(SK.i18n.bgErrorMessage(response) || SK.t('common.errorUnknown'));
      }
      if (typeof response.result?.[0] !== 'string' || !response.result[0].trim()) {
        throw new Error(SK.t('common.errorUnknown'));
      }
      resultEl.className = 'result';
      resultEl.textContent = response.result[0];
      placePanel(parseFloat(panel.style.left), parseFloat(panel.style.top));
    } catch (err) {
      if (serial !== requestSerial || !resultEl) return;
      resultEl.className = 'result error';
      resultEl.textContent = SK.t('toast.translateFailed', { error: err?.message || String(err) });
    }
  }

  document.addEventListener('contextmenu', (event) => {
    lastPointer = { x: event.clientX + 4, y: event.clientY + 4 };
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && host) closePanel();
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (host && event.target !== host) closePanel();
  }, true);

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'TRANSLATE_SELECTION') return;
    const text = String(msg.payload?.text || '').trim();
    if (!text) return;
    const serial = showPanel(text);
    translateSelection(text, serial);
  });

  SK.contextMenuSelection = { installed: true, close: closePanel };
})(window.__SK);
