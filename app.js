/* UI-Logik. Keine fetches, keine externen Requests – alles bleibt im Browser. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    secret: $('secret'), keyMeta: $('keyMeta'), keyHint: $('keyHint'),
    keyToggle: $('keyToggle'), keyCopy: $('keyCopy'), keyGenerate: $('keyGenerate'),
    input: $('input'), output: $('output'),
    inputCount: $('inputCount'), outputCount: $('outputCount'),
    hint: $('inputHint'), byteInfo: $('byteInfo'),
    flowLabel: $('flowLabel'), flowDetail: $('flowDetail'),
    nodeFrom: $('nodeFrom'), nodeTo: $('nodeTo'),
    statusText: $('statusText'), statusDot: $('statusDot'),
    actionBtn: $('actionBtn'), actionLabel: $('actionLabel'),
    copyBtn: $('copyBtn'), copyLabel: $('copyLabel'),
    clearBtn: $('clearBtn'), swapBtn: $('swapBtn'),
    toast: $('toast'), installBtn: $('installBtn'), installHint: $('installHint')
  };

  const state = { mode: 'auto', busy: false, notice: null };
  const utf8 = new TextEncoder();
  let toastTimer = null;
  let deferredPrompt = null;

  function chars(count) { return count + ' Zeichen'; }

  function setStatus(text, kind) {
    ui.statusText.textContent = text;
    ui.statusDot.className = 'status-dot' + (kind ? ' is-' + kind : '');
  }

  function direction() {
    if (state.mode !== 'auto') return state.mode;
    return window.NeonCrypt.looksLikeCiphertext(ui.input.value) ? 'decrypt' : 'encrypt';
  }

  function render() {
    const text = ui.input.value;
    const secretLength = ui.secret.value.length;
    const dir = direction();
    const encrypting = dir === 'encrypt';

    ui.inputCount.textContent = chars(text.length);
    ui.outputCount.textContent = chars(ui.output.value.length);
    ui.keyMeta.textContent = chars(secretLength);

    ui.nodeFrom.textContent = encrypting ? 'KLARTEXT' : 'NC1';
    ui.nodeTo.textContent = encrypting ? 'NC1' : 'KLARTEXT';
    ui.nodeFrom.classList.toggle('is-active', !!text.trim());
    ui.nodeTo.classList.toggle('is-active', !!text.trim());
    ui.nodeTo.classList.toggle('node-accent', encrypting);

    ui.actionLabel.textContent = encrypting ? 'Verschlüsseln' : 'Entschlüsseln';
    ui.flowLabel.textContent = state.mode === 'auto' && text.trim()
      ? (encrypting ? 'AUTO · KLARTEXT' : 'AUTO · NC1 ERKANNT')
      : 'BEREIT';
    ui.flowDetail.textContent = state.mode === 'auto'
      ? (encrypting ? 'Klartext erkannt – bereit zum Verschlüsseln' : 'NC1 erkannt – bereit zum Entschlüsseln')
      : (encrypting ? 'Klartext wird mit AES-256-GCM verschlüsselt' : 'NC1-Nachricht wird entschlüsselt');

    const inputBytes = utf8.encode(text).length;
    const outputBytes = ui.output.value ? utf8.encode(ui.output.value).length : 0;
    ui.byteInfo.textContent = inputBytes + ' B' + (outputBytes ? ' → ' + outputBytes + ' B' : '');

    ui.hint.className = 'hint';
    if (!text.trim()) {
      ui.hint.textContent = 'Tippe oder füge etwas ein.';
    } else if (encrypting) {
      ui.hint.textContent = 'Wird mit AES-256-GCM verschlüsselt.';
      ui.hint.classList.add('is-ok');
    } else {
      ui.hint.textContent = 'NC1 erkannt – entschlüsseln mit dem richtigen Schlüssel.';
      ui.hint.classList.add('is-ok');
    }

    if (!state.notice) {
      if (!ui.secret.value) {
        setStatus('Schlüssel fehlt – eingeben oder erzeugen', 'idle');
      } else if (!text.trim()) {
        setStatus(navigator.onLine ? 'Bereit – alles bleibt auf diesem Gerät' : 'Offline – keine Verbindung nötig', 'idle');
      } else {
        setStatus(navigator.onLine ? 'Bereit zum ' + (encrypting ? 'Verschlüsseln' : 'Entschlüsseln') : 'Offline bereit – 100 % lokal', 'ok');
      }
    } else {
      setStatus(state.notice.text, state.notice.kind);
      if (state.notice.hint) {
        ui.hint.textContent = state.notice.hint;
        ui.hint.className = 'hint is-error';
      }
    }

    ui.keyHint.className = 'key-hint';
    ui.keyHint.textContent = secretLength
      ? 'Schlüssel bleibt nur im Arbeitsspeicher dieser Seite – nie speichern, nie mitschicken.'
      : 'Der Schlüssel bleibt nur im Arbeitsspeicher dieser Seite und wird nie gespeichert oder gesendet.';
    if (secretLength) ui.keyHint.classList.add('is-ok');

    ui.actionBtn.disabled = state.busy || !ui.secret.value || !text.trim();
    ui.copyBtn.disabled = !ui.output.value;
    ui.swapBtn.disabled = !ui.output.value;
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove('is-visible'); }, 2400);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        const ok = document.execCommand('copy');
        helper.remove();
        if (!ok) throw new Error('Kopieren blockiert');
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async function run() {
    if (state.busy) return;
    const secret = ui.secret.value;
    const text = ui.input.value;
    if (!secret) { toast('Bitte zuerst einen Schlüssel eingeben oder erzeugen.'); ui.secret.focus(); return; }
    if (!text.trim()) { toast('Bitte zuerst eine Nachricht eingeben.'); ui.input.focus(); return; }

    const dir = direction();
    state.busy = true;
    state.notice = null;
    document.body.classList.add('is-busy');
    ui.output.value = '';
    render();
    setStatus(dir === 'encrypt' ? 'Verschlüssle mit AES-256-GCM …' : 'Leite Schlüssel ab und entschlüssle …', 'idle');

    try {
      const result = dir === 'encrypt'
        ? await window.NeonCrypt.encrypt(secret, text)
        : await window.NeonCrypt.decrypt(secret, text);
      ui.output.value = result;
      ui.copyLabel.textContent = 'Kopieren';
      state.notice = {
        text: dir === 'encrypt' ? 'Verschlüsselt – die Daten verlassen dieses Gerät nicht' : 'Entschlüsselt – nur auf diesem Gerät',
        kind: 'ok'
      };
      toast(dir === 'encrypt' ? 'Nachricht verschlüsselt' : 'Nachricht entschlüsselt');
    } catch (error) {
      const message = error && error.message ? error.message : 'Vorgang fehlgeschlagen.';
      state.notice = { text: message, kind: 'error', hint: message };
      toast(message);
    } finally {
      state.busy = false;
      document.body.classList.remove('is-busy');
      render();
    }
  }

  function setMode(mode) {
    state.mode = mode;
    state.notice = null;
    document.querySelectorAll('.mode').forEach(function (button) {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    render();
  }

  function setKeyVisible(visible) {
    ui.secret.type = visible ? 'text' : 'password';
    ui.keyToggle.setAttribute('aria-pressed', String(visible));
    const label = visible ? 'Schlüssel verbergen' : 'Schlüssel anzeigen';
    ui.keyToggle.title = label;
    ui.keyToggle.setAttribute('aria-label', label);
  }

  document.querySelectorAll('.mode').forEach(function (button) {
    button.addEventListener('click', function () { setMode(button.dataset.mode); });
  });

  ui.input.addEventListener('input', function () { state.notice = null; render(); });
  ui.keyGenerate.addEventListener('click', function () {
    try {
      ui.secret.value = window.NeonCrypt.generateSecret();
      setKeyVisible(true);
      state.notice = null;
      ui.output.value = '';
      render();
      toast('Neuer Schlüssel erzeugt – jetzt sicher weitergeben.');
    } catch (error) {
      toast(error.message || 'Schlüssel konnte nicht erzeugt werden.');
    }
  });
  ui.secret.addEventListener('input', function () {
    state.notice = null;
    ui.output.value = '';
    ui.copyLabel.textContent = 'Kopieren';
    render();
  });
  ui.keyToggle.addEventListener('click', function () { setKeyVisible(ui.secret.type === 'password'); });

  ui.keyCopy.addEventListener('click', async function () {
    if (!ui.secret.value) { toast('Noch kein Schlüssel vorhanden.'); return; }
    toast((await copyText(ui.secret.value)) ? 'Schlüssel kopiert – sicher übermitteln!' : 'Kopieren nicht möglich – bitte manuell markieren');
  });

  ui.actionBtn.addEventListener('click', run);
  ui.clearBtn.addEventListener('click', function () {
    ui.input.value = '';
    ui.output.value = '';
    state.notice = null;
    render();
    ui.input.focus();
  });
  ui.swapBtn.addEventListener('click', function () {
    if (!ui.output.value) return;
    ui.input.value = ui.output.value;
    if (state.mode === 'encrypt' && window.NeonCrypt.looksLikeCiphertext(ui.input.value)) setMode('decrypt');
    state.notice = null;
    render();
    ui.input.focus();
    toast('Ergebnis übernommen');
  });
  ui.copyBtn.addEventListener('click', async function () {
    if (!ui.output.value) return;
    if (await copyText(ui.output.value)) {
      ui.copyLabel.textContent = 'Kopiert';
      toast('Ergebnis kopiert');
    } else {
      toast('Kopieren nicht möglich – bitte manuell markieren');
    }
  });

  document.addEventListener('keydown', function (event) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key === 'k' || event.key === 'K') {
      event.preventDefault();
      if (event.shiftKey) { ui.secret.focus(); ui.secret.select(); }
      else { ui.input.focus(); ui.input.select(); }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run();
    }
  });

  window.addEventListener('online', render);
  window.addEventListener('offline', render);

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    ui.installBtn.hidden = false;
    ui.installHint.hidden = true;
  });
  ui.installBtn.addEventListener('click', async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    ui.installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    ui.installBtn.hidden = true;
    ui.installHint.hidden = true;
    toast('App installiert');
  });

  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (!standalone) setTimeout(function () { if (!deferredPrompt) ui.installHint.hidden = false; }, 1600);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* Offline-Nutzung ohne SW weiterhin möglich */ });
    });
  }

  render();
})();
