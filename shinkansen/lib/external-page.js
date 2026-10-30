// 外部網頁請求只派送到明確指定的 frame，不採用快捷鍵 toggle 語意。
export async function requestPageTranslation(payload, tabs) {
  const tabId = payload?.tabId;
  const frameId = payload?.frameId ?? 0;
  if (!Number.isInteger(tabId) || tabId < 0 || !Number.isInteger(frameId) || frameId < 0) {
    throw new Error('TRANSLATE_PAGE: tabId and frameId must be non-negative integers');
  }
  const response = await tabs.sendMessage(tabId, { type: 'EXTERNAL_TRANSLATE_PAGE' }, { frameId });
  if (!response?.ok) throw new Error(response?.error || 'Page translation unavailable; reload the HTTPS page and check site access');
  return { status: response.status, tabId, frameId };
}
