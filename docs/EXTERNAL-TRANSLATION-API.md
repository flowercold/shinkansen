# 外部扩展翻译调用规范

适用于本 fork 的 custom-features 定制版。上游官方版不保证包含此接口。当前协议没有版本协商能力。

## 职责与前提

调用方传入文本，新干线返回译文；调用方负责渲染、加载状态、错误提示和用户交互。接口不会打开右键翻译浮层。

当前主要面向 Chrome / Chromium 扩展间消息；其他浏览器需另行实测。用户必须安装并启用本定制版，并配置好所选翻译服务。调用方需要取得它在 chrome://extensions 中显示的扩展 ID，建议做成可配置项。不要使用上游商店版 ID 代替本地定制版 ID。

本扩展 manifest 设置 externally_connectable.ids 为 ["*"]，允许任意扩展连接；未配置网页 matches，因此普通网页不能直接调用该外部接口。调用方不需要为扩展间 sendMessage 单独申请主机权限。

推荐从调用方的 service worker、popup 或扩展页面发送。若文本来自 content script，可先发给自己的 service worker，由它转发并返回结果；这样便于集中维护 ID 和错误处理。

## 请求

```javascript
{
  type: 'TRANSLATE_TEXTS',
  payload: {
    texts: ['Hello world', 'Good morning']
  }
}
```

- type 必须精确为 TRANSLATE_TEXTS；未知类型不保证获得响应。
- texts 必须是数组，长度为 1 至 500。
- 每项必须为字符串，trim() 后不能为空；实际传入的文本不被接口自动 trim。
- 当前协议不支持单独指定目标语言、引擎、模型、提示词、流式输出或取消。
- 引擎和模型跟随新干线主预设 slot 2，目标语言跟随新干线设置。设置或模型改变后，同一请求可能得到不同译文。
- 500 是条数上限，并非适合一次发送的推荐量；字符长度、服务配额及模型限制仍然适用。建议小批次、限制并发。

## 响应

成功示例（译文只作说明）：

```javascript
{
  ok: true,
  result: ['你好，世界', '早上好']
}
```

result 按输入顺序对应。内部处理器还可能返回 usage、hadMismatch 等字段；它们因引擎而异，不应作为跨引擎稳定契约。调用方应验证数组长度和每项类型；若 hadMismatch === true，应作为结果不完整处理，而不是直接显示为完整成功。

翻译失败示例：

```javascript
{
  ok: false,
  error: '错误描述',
  errorCode: 'apiKeyMissing',
  errorParams: {}
}
```

error 是错误说明；errorCode、errorParams 可选，并非每个错误都有。实际字段名是 errorCode，不是 code。不要依赖错误文案做程序判断。

还有一类是连接失败：目标未安装、ID 错误、扩展被禁用或消息通道中断。这类情况通过 chrome.runtime.lastError 报告，可能根本没有上述响应对象。

## 可直接复用的调用函数

以下代码放在调用方扩展中。SHINKANSEN_ID 必须替换为用户安装的定制版 ID。

```javascript
const SHINKANSEN_ID = '替换为定制版扩展ID';

function translateTexts(texts) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(SHINKANSEN_ID, {
      type: 'TRANSLATE_TEXTS',
      payload: { texts },
    }, (response) => {
      const connectionError = chrome.runtime.lastError;
      if (connectionError) {
        reject(new Error(`无法连接翻译扩展：${connectionError.message}`));
        return;
      }
      if (!response || response.ok !== true) {
        const error = new Error(response?.error || '翻译扩展未返回有效响应');
        error.code = response?.errorCode;
        error.params = response?.errorParams;
        reject(error);
        return;
      }
      if (response.hadMismatch === true ||
          !Array.isArray(response.result) ||
          response.result.length !== texts.length ||
          response.result.some(text => typeof text !== 'string' || !text.trim())) {
        reject(new Error('翻译结果不完整'));
        return;
      }
      resolve(response.result);
    });
  });
}

// 在调用方自己的界面代码中使用，自行显示加载状态和错误。
async function renderTranslation(outputElement, sourceText) {
  outputElement.textContent = '翻译中…';
  try {
    const [translation] = await translateTexts([sourceText]);
    outputElement.textContent = translation;
  } catch (error) {
    outputElement.textContent = error.message;
  }
}
```

渲染译文使用 textContent；如果产品需要 HTML，调用方应自行清理并限制允许的标记，不能直接信任返回内容后赋给 innerHTML。

## 缓存、费用和等待

- 调用复用翻译插件已有缓存及对应引擎处理流程。
- Gemini / 自定义服务使用翻译插件用户配置的 API 凭据，可能产生该用户的服务费用；调用方不需要也不应索取这些凭据。
- Google 路径有缓存，但不走术语表；不能假设所有引擎能力一致。
- 本接口没有按调用方设置限流、授权提示或额度上限。任意已安装扩展都能请求，调用方应按用户意图发送，避免重复请求和无限重试。
- 翻译耗时随服务与文本变化；当前没有明确的 SLA、取消或幂等请求 ID。调用方的 UI 超时只停止等待，不保证服务端翻译已经取消；自动重试可能重复计费。

## 联调与验收

1. 在 Chrome 加载本 fork 的 shinkansen/ 目录并配置主预设。
2. 在调用方配置扩展 ID，从调用方发送一条英文文本。
3. 验证收到 ok: true 和一条译文，且新干线没有弹出翻译框；由调用方显示结果。
4. 测试多条文本顺序、空数组/空字符串的错误响应、错误扩展 ID 的连接错误。
5. 切换主预设与目标语言，确认调用结果跟随设置；按实际需要测试三种引擎。

当前文档基于代码核对，真实浏览器跨扩展调用尚未在本会话验证。
