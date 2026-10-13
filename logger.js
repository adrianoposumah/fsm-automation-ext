'use strict';
// Logger terpusat. T3 akan memperluas: logger.baris, logger.langkah, filter level, samarkan.
const logger = (() => {
  let el = null;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Tampilkan hanya path URL dengan UUID diganti <id>, supaya log aman dibagikan.
  const maskPath = (u) => {
    try {
      return new URL(u).pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>');
    } catch (e) {
      return '(url tidak valid)';
    }
  };

  function init(logEl) {
    el = logEl;
    window.addEventListener('unhandledrejection', (e) => log('ERROR: ' + ((e.reason && e.reason.message) || e.reason)));
    window.addEventListener('error', (e) => log('ERROR: ' + e.message));
  }

  function log(m) {
    if (!el) {
      console.log(m);
      return;
    }
    el.textContent += `[${new Date().toLocaleTimeString('id-ID')}] ${m}\n`;
    el.scrollTop = el.scrollHeight;
  }

  return {
    init,
    log,
    info: (m) => log(m),
    warn: (m) => log('[WARN] ' + m),
    error: (m) => log('[ERROR] ' + m),
    esc,
    maskPath,
  };
})();

// Pembungkus kompatibilitas untuk kode lama.
const log = logger.log;
const esc = logger.esc;
const maskPath = logger.maskPath;
