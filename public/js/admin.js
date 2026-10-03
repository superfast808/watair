(() => {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';


  // Friendly confirmation after redirects such as ?saved=1 or ?created=1.
  const params = new URLSearchParams(window.location.search);
  const notice = params.get('created') === '1'
    ? 'Product created successfully.'
    : params.get('saved') === '1'
      ? 'Changes saved.'
      : null;
  if (notice) {
    const toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.textContent = notice;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => toast.classList.remove('show'), 2800);
    setTimeout(() => toast.remove(), 3300);
  }



  // Confirm destructive admin actions without inline JavaScript (keeps CSP strict).
  document.querySelectorAll('[data-confirm-action]').forEach(button => {
    button.addEventListener('click', event => {
      const message = button.dataset.confirmAction || 'Are you sure?';
      if (!window.confirm(message)) event.preventDefault();
    });
  });

  // Navigation manager: keep the menu overview compact and reveal editing
  // controls only for the item being worked on.
  function setNavigationEditor(card, open, focus = false) {
    if (!card) return;
    const panel = card.querySelector('[data-navigation-panel]');
    const button = card.querySelector('[data-navigation-edit]');
    if (!panel || !button) return;

    panel.hidden = !open;
    card.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = button.querySelector('span:first-child');
    if (label) label.textContent = open ? 'Close editor' : 'Edit item';

    if (open && focus) {
      const firstField = panel.querySelector('input:not([type="checkbox"]):not(:disabled), select:not(:disabled)');
      firstField?.focus({ preventScroll: true });
    }
  }

  document.querySelectorAll('[data-navigation-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-navigation-card]');
      const panel = card?.querySelector('[data-navigation-panel]');
      if (!card || !panel) return;

      const opening = panel.hidden;
      document.querySelectorAll('[data-navigation-card].is-open').forEach(openCard => {
        if (openCard !== card) setNavigationEditor(openCard, false);
      });
      setNavigationEditor(card, opening, opening);
    });
  });

  const navigationContextId = params.get('saved') || params.get('created');
  if (navigationContextId && /^\d+$/.test(navigationContextId)) {
    const card = document.querySelector(`[data-navigation-card][data-navigation-id="${navigationContextId}"]`);
    if (card) {
      setNavigationEditor(card, true);
      requestAnimationFrame(() => card.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
  }

  // Product deletion requires typing the exact product name before submit.
  document.querySelectorAll('[data-delete-product]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const productName = button.dataset.productName || '';
      const form = button.closest('form');
      const confirmation = form?.querySelector('[data-delete-confirmation]');
      if (!form || !confirmation || !productName) return;

      const typed = prompt(`Permanently delete "${productName}"?\n\nType the product name exactly to confirm:`);
      if (typed === null) return;
      if (typed.trim() !== productName) {
        alert('Product not deleted. The name did not match.');
        return;
      }

      confirmation.value = productName;
      form.requestSubmit(button);
    });
  });

  // Admin user password helpers.
  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.closest('.password-field')?.querySelector('input');
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.textContent = showing ? 'Show' : 'Hide';
    });
  });

  function securePassword(length = 20) {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%*-_=+';
    const all = letters + numbers + symbols;
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    const chars = Array.from(values, value => all[value % all.length]);
    chars[0] = letters[values[0] % letters.length];
    chars[1] = numbers[values[1] % numbers.length];
    return chars.join('');
  }

  document.querySelectorAll('[data-generate-password]').forEach(button => {
    button.addEventListener('click', () => {
      const form = button.closest('[data-password-pair]');
      if (!form) return;
      const password = securePassword();
      const primary = form.querySelector('[data-password-primary]');
      const confirm = form.querySelector('[data-password-confirm]');
      if (primary) primary.value = password;
      if (confirm) confirm.value = password;
      const box = form.querySelector('[data-generated-password]');
      const value = form.querySelector('[data-generated-password-value]');
      if (value) value.textContent = password;
      if (box) box.hidden = false;
    });
  });

  document.querySelectorAll('[data-copy-generated]').forEach(button => {
    button.addEventListener('click', async () => {
      const box = button.closest('[data-generated-password]');
      const value = box?.querySelector('[data-generated-password-value]')?.textContent || '';
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const old = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => button.textContent = old, 1200);
      } catch {
        alert(value);
      }
    });
  });

  // Mobile admin navigation.
  const sidebar = document.querySelector('[data-admin-sidebar]');
  const openNav = document.querySelector('[data-admin-menu-toggle]');
  const closeNav = document.querySelector('[data-admin-menu-close]');
  const setNav = open => {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    document.body.classList.toggle('admin-nav-open', open);
  };
  openNav?.addEventListener('click', () => setNav(true));
  closeNav?.addEventListener('click', () => setNav(false));

  // Shared upload helper.
  async function uploadImage(file) {
    if (!file) throw new Error('Choose an image first.');
    const form = new FormData();
    form.append('image', file);
    const response = await fetch('/admin/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'x-csrf-token': csrf },
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Upload failed.');
    return payload;
  }

  function setMediaField(field, url) {
    const input = field.querySelector('[data-media-url]');
    const preview = field.querySelector('[data-media-preview]');
    const empty = field.querySelector('[data-media-empty]');
    if (input) input.value = url || '';
    if (preview) {
      preview.src = url || '';
      preview.hidden = !url;
    }
    if (empty) empty.hidden = !!url;
    field.classList.toggle('has-image', !!url);
  }

  // Media field controls used by products, pages and settings.
  let activeMediaField = null;
  document.querySelectorAll('[data-media-field]').forEach(field => {
    const direct = field.querySelector('[data-media-direct-upload]');
    field.querySelector('[data-media-choose]')?.addEventListener('click', () => {
      activeMediaField = field;
      openMediaPicker();
    });
    field.querySelector('[data-media-clear]')?.addEventListener('click', () => setMediaField(field, ''));
    direct?.addEventListener('change', async () => {
      const file = direct.files?.[0];
      if (!file) return;
      field.classList.add('is-uploading');
      try {
        const asset = await uploadImage(file);
        setMediaField(field, asset.url);
      } catch (err) {
        alert(err.message);
      } finally {
        field.classList.remove('is-uploading');
        direct.value = '';
      }
    });
  });

  // Reusable media picker modal.
  const picker = document.querySelector('[data-media-picker]');
  const pickerGrid = document.querySelector('[data-media-picker-grid]');
  const pickerSearch = document.querySelector('[data-media-search]');
  const pickerUpload = document.querySelector('[data-media-upload]');
  let pickerAssets = null;

  function renderPicker(assets, query = '') {
    if (!pickerGrid) return;
    const q = query.trim().toLowerCase();
    const filtered = assets.filter(asset => !q || String(asset.name || asset.public_url).toLowerCase().includes(q));
    pickerGrid.innerHTML = '';
    if (!filtered.length) {
      pickerGrid.innerHTML = '<p class="media-picker-loading">No matching images.</p>';
      return;
    }
    filtered.forEach(asset => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'media-choice';
      button.dataset.url = asset.public_url;
      button.innerHTML = `
        <span class="media-choice-thumb"><img src="${asset.public_url}" alt="" loading="lazy"></span>
        <span class="media-choice-copy"><strong>${escapeHtml(asset.name || 'Image')}</strong><small>${asset.source === 'upload' ? 'Uploaded' : 'Imported'}</small></span>
      `;
      button.addEventListener('click', () => {
        if (activeMediaField) setMediaField(activeMediaField, asset.public_url);
        closeMediaPicker();
      });
      pickerGrid.appendChild(button);
    });
  }

  async function loadPickerAssets(force = false) {
    if (pickerAssets && !force) return pickerAssets;
    if (pickerGrid) pickerGrid.innerHTML = '<div class="media-picker-loading">Loading media…</div>';
    const response = await fetch('/admin/media/assets.json', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Could not load the media library.');
    const payload = await response.json();
    pickerAssets = payload.assets || [];
    renderPicker(pickerAssets, pickerSearch?.value || '');
    return pickerAssets;
  }

  function openMediaPicker() {
    if (!picker) return;
    picker.hidden = false;
    document.body.classList.add('media-picker-open');
    loadPickerAssets().catch(err => {
      if (pickerGrid) pickerGrid.innerHTML = '<p class="media-picker-loading">' + escapeHtml(err.message) + '</p>';
    });
  }
  function closeMediaPicker() {
    if (!picker) return;
    picker.hidden = true;
    document.body.classList.remove('media-picker-open');
  }
  document.querySelectorAll('[data-media-picker-close]').forEach(el => el.addEventListener('click', closeMediaPicker));
  pickerSearch?.addEventListener('input', () => renderPicker(pickerAssets || [], pickerSearch.value));
  pickerUpload?.addEventListener('change', async () => {
    const file = pickerUpload.files?.[0];
    if (!file) return;
    try {
      const asset = await uploadImage(file);
      pickerAssets = null;
      await loadPickerAssets(true);
      if (activeMediaField) {
        setMediaField(activeMediaField, asset.url);
        closeMediaPicker();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      pickerUpload.value = '';
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker && !picker.hidden) closeMediaPicker();
  });

  // Specification editor.
  const specList = document.querySelector('[data-spec-list]');
  const specTemplate = document.querySelector('[data-spec-template]');
  function addSpec(name = '', value = '') {
    if (!specList || !specTemplate) return;
    const fragment = specTemplate.content.cloneNode(true);
    const row = fragment.querySelector('[data-spec-row]');
    row.querySelector('[name="spec_name"]').value = name;
    row.querySelector('[name="spec_value"]').value = value;
    specList.appendChild(fragment);
    row.querySelector('[name="spec_value"]').focus();
  }
  document.querySelector('[data-add-spec]')?.addEventListener('click', () => addSpec());
  document.querySelectorAll('[data-spec-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const name = button.dataset.specPreset;
      const exists = [...document.querySelectorAll('[name="spec_name"]')].some(input => input.value.trim().toLowerCase() === name.toLowerCase());
      if (!exists) addSpec(name, '');
    });
  });
  specList?.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-spec]');
    if (!remove) return;
    const row = remove.closest('[data-spec-row]');
    if (row) row.remove();
  });

  // Lightweight rich-text editor for ordinary users.
  document.querySelectorAll('[data-rich-editor]').forEach(editor => {
    const wrapper = editor.closest('[data-rich-wrapper]');
    const hidden = wrapper?.querySelector('textarea[name="body_html"]');
    const form = editor.closest('form');
    wrapper?.querySelectorAll('[data-rich-command]').forEach(button => {
      button.addEventListener('click', () => {
        editor.focus();
        const command = button.dataset.richCommand;
        const value = button.dataset.richValue || null;
        if (command === 'createLink') {
          const href = prompt('Paste the link address');
          if (href) document.execCommand('createLink', false, href);
        } else {
          document.execCommand(command, false, value);
        }
      });
    });
    form?.addEventListener('submit', () => {
      if (hidden) hidden.value = editor.innerHTML.trim();
    });
  });

  // Media library upload box.
  const libraryInput = document.querySelector('[data-library-upload]');
  libraryInput?.addEventListener('change', async () => {
    const file = libraryInput.files?.[0];
    if (!file) return;
    const area = libraryInput.closest('[data-library-upload-area]');
    area?.classList.add('is-uploading');
    try {
      await uploadImage(file);
      window.location.reload();
    } catch (err) {
      alert(err.message);
      area?.classList.remove('is-uploading');
    }
  });


  // Simple filtering for product/page management lists.
  document.querySelectorAll('[data-table-search]').forEach(search => {
    const list = search.closest('.admin-card')?.querySelector('[data-search-list]');
    if (!list) return;
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      list.querySelectorAll('[data-search-item]').forEach(item => {
        item.hidden = !!query && !String(item.dataset.searchItem || '').includes(query);
      });
    });
  });

  // Copy media URLs.
  document.addEventListener('click', async event => {
    const copy = event.target.closest('[data-copy-url]');
    if (!copy) return;
    try {
      await navigator.clipboard.writeText(copy.dataset.copyUrl || '');
      const old = copy.textContent;
      copy.textContent = 'Copied';
      setTimeout(() => copy.textContent = old, 1200);
    } catch {
      alert(copy.dataset.copyUrl || '');
    }
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[char]);
  }
})();
