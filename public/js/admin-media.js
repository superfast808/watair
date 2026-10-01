const root = document.querySelector('[data-media-status]');

if (root && root.dataset.running === '1') {
  const fields = {
    pages: root.querySelector('[data-pages]'),
    found: root.querySelector('[data-found]'),
    imported: root.querySelector('[data-imported]'),
    bytes: root.querySelector('[data-bytes]'),
    message: root.querySelector('[data-message]'),
    current: root.querySelector('[data-current]'),
    pill: root.querySelector('[data-status-pill]')
  };

  const poll = async () => {
    try {
      const response = await fetch('/admin/media/status', {
        headers: { 'accept': 'application/json' },
        credentials: 'same-origin'
      });
      if (!response.ok) return;
      const state = await response.json();

      fields.pages.textContent = state.pagesScanned;
      fields.found.textContent = state.assetsFound;
      fields.imported.textContent = state.assetsImported;
      fields.bytes.textContent = (state.bytesImported / 1024 / 1024).toFixed(1) + ' MB';
      fields.message.textContent = state.message || '';
      fields.current.textContent = state.current || '';
      fields.pill.textContent = state.running ? 'running' : 'complete';

      if (state.running) {
        window.setTimeout(poll, 1400);
      } else {
        window.setTimeout(() => window.location.reload(), 700);
      }
    } catch {
      window.setTimeout(poll, 2500);
    }
  };

  window.setTimeout(poll, 700);
}
