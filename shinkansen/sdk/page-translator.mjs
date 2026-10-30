// Copy this module into the calling extension; never load remote executable code.
export function createPageTranslator({ extensionId, root = document.body, batchSize = 20,
  mode = 'bilingual', runtime = globalThis.chrome?.runtime } = {}) {
  if (!extensionId || !root || !runtime || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500 ||
      !['bilingual', 'replace'].includes(mode)) throw new Error('Invalid page translator options');
  const document = root.ownerDocument;
  const records = new Map();
  let generation = 0;
  let running = false;
  const excluded = 'script,style,noscript,textarea,input,select,option,code,pre,[contenteditable]:not([contenteditable="false"]),[translate="no"],[data-shinkansen-ignore],[data-shinkansen-translation]';

  function request(texts) {
    return new Promise((resolve, reject) => {
      runtime.sendMessage(extensionId, { type: 'TRANSLATE_TEXTS', payload: { texts } }, response => {
        const error = runtime.lastError;
        if (error) return reject(new Error(error.message));
        if (!response?.ok) return reject(new Error(response?.error || 'Translation failed'));
        if (response.hadMismatch || !Array.isArray(response.result) || response.result.length !== texts.length ||
            response.result.some(value => typeof value !== 'string' || !value.trim())) {
          return reject(new Error('Incomplete translation result'));
        }
        resolve(response.result);
      });
    });
  }

  async function translate() {
    if (running) throw new Error('Translation already running');
    running = true;
    const token = generation;
    let translated = 0;
    try {
      const walker = document.createTreeWalker(root, 4);
      const nodes = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const parent = node.parentElement;
        if (!parent || records.has(node) || !node.textContent.trim() || parent.closest(excluded) ||
            parent.closest('[hidden],[aria-hidden="true"]')) continue;
        nodes.push(node);
      }
      for (let i = 0; i < nodes.length; i += batchSize) {
        if (token !== generation) break;
        const batch = nodes.slice(i, i + batchSize);
        const originals = batch.map(node => node.textContent);
        const results = await request(originals);
        if (token !== generation) break;
        await new Promise(resolve => setTimeout(resolve, 0));
        if (token !== generation) break;
        batch.forEach((node, index) => {
          // Host frameworks may replace or edit nodes while the request is in flight.
          if (!root.contains(node) || node.textContent !== originals[index]) return;
          let annotation = null;
          if (mode === 'replace') node.textContent = results[index];
          else {
            annotation = document.createElement('span');
            annotation.dataset.shinkansenTranslation = '';
            annotation.style.cssText = 'display:block;white-space:pre-wrap;';
            annotation.textContent = results[index];
            node.after(annotation);
          }
          records.set(node, { original: originals[index], translation: results[index], annotation });
          translated++;
        });
      }
      return { status: token === generation ? 'completed' : 'cancelled', translated };
    } finally {
      running = false;
    }
  }

  function restore() {
    generation++;
    for (const [node, record] of records) {
      record.annotation?.remove();
      if (mode === 'replace' && node.textContent === record.translation) node.textContent = record.original;
    }
    records.clear();
  }

  return { translate, restore };
}
