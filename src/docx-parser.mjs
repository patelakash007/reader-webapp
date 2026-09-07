import { assertActiveFileRead, formatError, isActiveFileRead } from './utils.mjs';

export function createDocxParser(context, { ui, enforceTextLimit }) {
  const { runtime } = context;
  const libraries = {
    mammoth: {
      src: 'vendor/mammoth.browser.min.js',
      check: () => (typeof window !== 'undefined' ? window.mammoth : null)
    }
  };

  async function loadLibrary() {
    const name = 'mammoth';
    if (runtime.file.loadedLibraries.has(name)) return runtime.file.loadedLibraries.get(name);
    const promise = (async () => {
      const lib = libraries[name];
      if (!lib) throw new Error(`Unknown library: ${name}`);

      if (lib.check && lib.check()) {
        if (lib.onLoad) lib.onLoad();
        return lib.check();
      }

      if (name === 'mammoth' && typeof window === 'undefined') {
        try {
          const mod = await import('../vendor/mammoth.browser.min.js');
          const mammothLib = mod && (mod.default || mod);
          if (mammothLib && mammothLib.extractRawText) return mammothLib;
        } catch (err) {}
      }

      return new Promise((resolve, reject) => {
        if (lib.check && lib.check()) {
          if (lib.onLoad) lib.onLoad();
          resolve(lib.check());
          return;
        }
        if (typeof document === 'undefined') {
          reject(new Error(`Cannot load script ${lib.src} in headless environment.`));
          return;
        }
        const script = document.createElement('script');
        script.src = lib.src;
        script.onload = () => {
          try {
            if (lib.onLoad) lib.onLoad();
            if (lib.check && lib.check()) resolve(lib.check());
            else reject(new Error(`Library ${name} loaded but could not be initialized.`));
          } catch (err) {
            reject(err);
          }
        };
        script.onerror = () => reject(new Error(`Failed to load local parser library ${name} from ${lib.src}. Check that the vendor file is available.`));
        document.head.appendChild(script);
      });
    })();
    runtime.file.loadedLibraries.set(name, promise);
    promise.catch(() => runtime.file.loadedLibraries.delete(name));
    return promise;
  }

  function showReadLoader(readToken, message) {
    if (isActiveFileRead(context, readToken)) ui.showLoader(message);
  }

  async function extractDocxText(arrayBuffer, readToken) {
    assertActiveFileRead(context, readToken);
    showReadLoader(readToken, 'Loading DOCX parser module...');
    let mammothLib;
    try {
      mammothLib = await loadLibrary();
    } catch (err) {
      throw new Error(`DOCX parser library failed to load: ${formatError(err)} Try reloading the app or exporting this file as TXT/Markdown.`);
    }
    if (!mammothLib) throw new Error('DOCX parser library is unavailable. Try reloading the app or exporting this file as TXT/Markdown.');
    assertActiveFileRead(context, readToken);
    const result = await mammothLib.extractRawText({ arrayBuffer });
    assertActiveFileRead(context, readToken);
    return enforceTextLimit((result.value || '').trim(), 'DOCX');
  }

  return { loadLibrary, extractDocxText };
}
