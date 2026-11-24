(() => {
  const STORAGE_KEY = 'techpulse:dsh-url';
  const card = document.getElementById('overviewDshCard');
  if (!card) return;

  const state = document.getElementById('overviewDshState');
  const dialog = document.getElementById('dshDialog');
  const form = document.getElementById('dshForm');
  const input = document.getElementById('dshUrlInput');
  const closeButton = document.getElementById('dshClose');
  const clearButton = document.getElementById('dshClear');

  const normalize = (value) => {
    const raw = String(value ?? '').trim();
    if (raw === '') return '';
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return `${url.origin}/`;
    } catch {
      return '';
    }
  };

  const readStored = () => {
    try {
      return normalize(window.localStorage.getItem(STORAGE_KEY) ?? '');
    } catch {
      return '';
    }
  };

  const writeStored = (value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private mode: the value still applies for this page load */
    }
  };

  const configured = normalize(window.TECHPULSE_DSH_URL ?? '');
  let current = configured || readStored();
  let healthTimer = null;

  // ?dsh=URL configures this device once; ?dsh=reset clears it.
  const param = new URLSearchParams(window.location.search).get('dsh');
  if (param !== null) {
    if (param.trim().toLowerCase() === 'reset') {
      writeStored('');
      current = configured;
    } else {
      const normalized = normalize(param);
      if (normalized !== '') {
        writeStored(normalized);
        current = normalized;
      }
    }
    const clean = new URL(window.location.href);
    clean.searchParams.delete('dsh');
    window.history.replaceState(null, '', clean.href);
  }

  const setState = (label, tone) => {
    if (state === null) return;
    state.textContent = label;
    state.dataset.tone = tone;
  };

  const probe = async () => {
    if (current === '') {
      setState('未配置', 'idle');
      return;
    }
    setState('检查中', 'idle');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${current}__health`, {
        cache: 'no-store',
        mode: 'cors',
        signal: controller.signal,
      });
      const payload = await response.json();
      setState(payload && payload.ok === true ? '在线' : '离线', payload && payload.ok === true ? 'online' : 'offline');
    } catch {
      setState('离线', 'offline');
    } finally {
      window.clearTimeout(timer);
    }
  };

  const openDialog = () => {
    if (dialog === null) return;
    if (input !== null) input.value = current;
    dialog.showModal();
    if (input !== null) input.focus();
  };

  const apply = () => {
    card.setAttribute('href', current === '' ? '#' : current);
    void probe();
  };

  card.addEventListener('click', (event) => {
    if (current === '') {
      event.preventDefault();
      openDialog();
    }
  });

  if (form !== null) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const normalized = normalize(input === null ? '' : input.value);
      if (normalized === '') {
        if (input !== null) input.setAttribute('aria-invalid', 'true');
        return;
      }
      current = normalized;
      writeStored(normalized);
      apply();
      dialog?.close();
    });
  }

  if (closeButton !== null) closeButton.addEventListener('click', () => dialog?.close());
  if (clearButton !== null) {
    clearButton.addEventListener('click', () => {
      current = configured;
      writeStored('');
      if (input !== null) input.value = current;
      apply();
      dialog?.close();
    });
  }

  apply();
  healthTimer = window.setInterval(() => void probe(), 60000);
  window.addEventListener('pagehide', () => window.clearInterval(healthTimer), { once: true });
})();
