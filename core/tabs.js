'use strict';
// Tab kerja, sesi, dan jembatan ke halaman web target.

function tungguTab(tabId, ms = 30000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(fn);
      rej(new Error('Halaman terlalu lama dimuat'));
    }, ms);
    const fn = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(fn);
        res();
      }
    };
    chrome.tabs.onUpdated.addListener(fn);
  });
}

async function tungguUrl(cek, ms) {
  const akhir = Date.now() + ms;
  while (Date.now() < akhir) {
    const tab = await chrome.tabs.get(workTabId);
    try {
      const url = new URL(tab.url || tab.pendingUrl || 'about:blank');
      if (cek(url.pathname, url.href)) return true;
    } catch (e) {
      /* abaikan */
    }
    await tidurMs(300);
  }
  return false;
}

// Registri operasi diinjeksi lewat files, lalu op dipanggil lewat func.
// Ini menggantikan satu fungsi halaman() raksasa (AGENTS.md §10.2).
async function jalankanDiTab(op, args) {
  const target = { tabId: workTabId, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['inject/ops.js'] });
  const res = await chrome.scripting.executeScript({
    target,
    func: (op, a) => (window.__ops && window.__ops[op] ? window.__ops[op](a) : null),
    args: [op, args],
  });
  return res.map((r) => r.result).filter(Boolean);
}

async function butuhLogin(cekDom) {
  const tab = await chrome.tabs.get(workTabId);
  let u;
  try {
    u = new URL(tab.url || tab.pendingUrl || 'about:blank');
  } catch (e) {
    return true;
  }
  if (u.host !== CONFIG.HOST || u.pathname.includes('/auth/')) return true;
  if (!cekDom) return false;
  const r = await jalankanDiTab('sesi', { teks: CONFIG.TEKS_SSO, ms: 3000 });
  return r.some((x) => x.butuhLogin);
}

async function tungguLogin() {
  log('Sesi belum aktif. Silakan login SSO di jendela kerja...');
  await chrome.windows.update(workWinId, { focused: true });
  let sudahKlik = false;
  for (let i = 0; i < 150 && !stopFlag; i++) {
    await tidurMs(2000);
    if (!(await butuhLogin(true).catch(() => true))) {
      log('Login terdeteksi.');
      return;
    }
    if (!sudahKlik) {
      const tab = await chrome.tabs.get(workTabId);
      if (new URL(tab.url).host === CONFIG.HOST) {
        const r = await jalankanDiTab('klikSSO', { teks: CONFIG.TEKS_SSO });
        sudahKlik = r.some((x) => x.diklik);
      }
    }
  }
  throw new Berhenti(stopFlag ? 'Dihentikan.' : 'Waktu login habis (5 menit). Proses dihentikan.');
}

async function buka(url, limiter) {
  for (let coba = 1; coba <= 3; coba++) {
    const siap = tungguTab(workTabId);
    await chrome.tabs.update(workTabId, { url });
    await siap;
    if (await butuhLogin(false)) throw new SesiHabis();
    const st = (await jalankanDiTab('status', {})).find((r) => r.utama);
    if (st && (st.status === 429 || st.status === 503 || st.terbatas)) {
      if (coba === 3) throw new Berhenti('Server membatasi akses berulang kali. Proses dihentikan.');
      await limiter.tolak('filter');
      continue;
    }
    limiter.ok('filter');
    return;
  }
}

async function denganSesi(fn) {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof SesiHabis)) throw e;
    await tungguLogin();
    return await fn();
  }
}
