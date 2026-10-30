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

## 普通网页翻译：TRANSLATE_PAGE

从调用方扩展发送（tabId 是已打开的网页标签页 ID，不是 URL）：

```javascript
const response = await chrome.runtime.sendMessage(SHINKANSEN_ID, {
  type: 'TRANSLATE_PAGE',
  payload: { tabId: 123, frameId: 0 },
});
if (!response?.ok) throw new Error(response?.error || '无法启动网页翻译');
```

frameId 可省略，默认 0，仅处理指定 frame；不会广播到所有 iframe。该 frame 必须是 HTTP/HTTPS 网页，并已加载且允许新干线内容脚本运行。新安装或重载扩展后需要刷新网页。浏览器内部页、其他插件页面、无内容脚本或无访问权的页面会失败；不自动打开 URL 或注入脚本。

响应为 `{ ok: true, status, tabId, frameId }`。status 为 accepted（请求已接受，不代表最终翻译成功或完成）、already-running 或 already-translated。重复调用不会取消翻译或恢复原文。页面渲染、目标语言和引擎使用新干线现有整页流程及主预设 slot 2。此接口暂不提供完成事件或恢复操作。

## 其他插件自己的页面：页面适配器

将本仓库 `shinkansen/sdk/page-translator.mjs` 复制并打包到调用方扩展中。浏览器禁止新干线向另一插件页面直接注入，因此适配器必须由对方主动加载；无须开放其 web_accessible_resources，也不从新干线远程加载代码。

在 popup、侧边栏或扩展页面的本地模块脚本中使用：

```javascript
import { createPageTranslator } from './page-translator.mjs';

const translator = createPageTranslator({
  extensionId: SHINKANSEN_ID,
  root: document.querySelector('main'),
  mode: 'bilingual', // 或 replace
  batchSize: 20,
});
document.querySelector('#translate').addEventListener('click', async () => {
  try {
    const result = await translator.translate();
    console.log(result.status, result.translated);
  } catch (error) {
    console.error(error); // 调用方应展示错误
  }
});
document.querySelector('#restore').addEventListener('click', () => translator.restore());
```

HTML 用 `<script type="module" src="page.js"></script>` 加载自己的本地脚本，禁止内联脚本。root 必须是已存在的 DOM 容器，建议不包含翻译/恢复按钮本身。

适配器逐文本节点提取、批次请求现有 TRANSLATE_TEXTS，并安全地以纯文本显示译文。bilingual 保留原文，在其后插入译文；replace 修改文本节点，保留元素及事件监听。restore 恢复适配器改动，并忽略本次尚未返回的结果（不会取消已经发出的付费请求）。宿主在等待期间修改的节点不会被旧响应覆盖。

跳过输入框、可编辑区域、脚本/样式、代码块、hidden、aria-hidden、translate="no" 和 data-shinkansen-ignore 区域；这不是完整的视觉可见性检测。不会访问 iframe、Shadow DOM、属性文本、placeholder 或图片内容。动态新增文本需主动再次调用 translate()；并发调用会报错。部分批次成功后后续失败时，已显示译文保留，可 restore 后重试。框架管理的界面建议选用专门的静态内容容器，避免框架重渲染与 DOM 插入竞争。

这是一套轻量页面适配器，不包含新干线网页引擎的所有正文识别、SPA 或字幕功能。它通过新干线完成翻译，页面 DOM 操作运行在调用方自己的上下文。

自动化检查：`node --test tools/external-translation.test.mjs`。真实浏览器跨扩展调用、服务付费请求尚未在本会话验证。
