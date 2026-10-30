import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { requestPageTranslation } from '../shinkansen/lib/external-page.js';
import { createPageTranslator } from '../shinkansen/sdk/page-translator.mjs';

function setup(html, options = {}, reply) {
  const dom = new JSDOM(html);
  const calls = [];
  const runtime = { sendMessage(id, message, callback) {
    calls.push(message);
    if (reply) reply(message, callback);
    else callback({ ok: true, result: message.payload.texts.map(text => `译:${text}`) });
  } };
  return { dom, calls, translator: createPageTranslator({ extensionId: 'test-id', root: dom.window.document.body, runtime, ...options }) };
}

test('page request targets one frame and propagates failures', async () => {
  let args;
  const tabs = { async sendMessage(...values) { args = values; return { ok: true, status: 'accepted' }; } };
  assert.deepEqual(await requestPageTranslation({ tabId: 7 }, tabs), { status: 'accepted', tabId: 7, frameId: 0 });
  assert.deepEqual(args, [7, { type: 'EXTERNAL_TRANSLATE_PAGE' }, { frameId: 0 }]);
  await assert.rejects(requestPageTranslation({ tabId: '7' }, tabs));
  await assert.rejects(requestPageTranslation({ tabId: 7, frameId: -1 }, tabs));
  await assert.rejects(requestPageTranslation({ tabId: 7 }, { sendMessage: async () => undefined }));
});

test('bilingual adapter preserves markup, exclusions, batches and restoration', async () => {
  const { dom, calls, translator } = setup('<p>Hello <b>world</b></p><input value="secret"><pre>code</pre><div translate="no">skip</div>', { batchSize: 1 });
  assert.equal((await translator.translate()).translated, 2);
  assert.equal(calls.length, 2);
  assert.equal(dom.window.document.querySelector('b').firstChild.textContent, 'world');
  assert.equal(dom.window.document.querySelectorAll('[data-shinkansen-translation]').length, 2);
  assert.equal((await translator.translate()).translated, 0);
  translator.restore();
  assert.equal(dom.window.document.body.textContent, 'Hello worldcodeskip');
});

test('replace mode restores original and leaves host changes alone', async () => {
  const { dom, translator } = setup('<p>Hello</p><p>World</p>', { mode: 'replace' });
  await translator.translate();
  dom.window.document.querySelector('p').textContent = 'New host content';
  translator.restore();
  assert.equal(dom.window.document.querySelectorAll('p')[1].textContent, 'World');
  assert.equal(dom.window.document.querySelector('p').textContent, 'New host content');
});

test('restore cancels late responses and concurrent runs are rejected', async () => {
  let complete;
  const { dom, translator } = setup('<p>Hello</p>', {}, (message, callback) => { complete = callback; });
  const pending = translator.translate();
  await assert.rejects(translator.translate(), /already running/);
  translator.restore();
  complete({ ok: true, result: ['你好'] });
  assert.equal((await pending).status, 'cancelled');
  assert.equal(dom.window.document.body.textContent, 'Hello');
});

test('invalid response rejects and allows retry', async () => {
  const { translator } = setup('<p>Hello</p>', {}, (message, callback) => callback({ ok: true, result: [] }));
  await assert.rejects(translator.translate(), /Incomplete/);
  await assert.rejects(translator.translate(), /Incomplete/);
});
