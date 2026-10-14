'use strict';
// Semua wiring UI: tombol, dropdown, file input.

function setBusy(b) {
  $('btnMulai').disabled = b;
  $('btnStop').disabled = !b;
}

function setChipSesi(status) {
  const chip = $('chipSesi');
  if (!chip) return;
  chip.classList.remove('aktif', 'habis');
  if (status === 'aktif') {
    chip.textContent = 'Sesi aktif';
    chip.classList.add('aktif');
  } else if (status === 'habis') {
    chip.textContent = 'Sesi habis / belum login';
    chip.classList.add('habis');
  } else if (status === 'belum-dicek') {
    chip.textContent = 'Sesi belum dicek';
  } else {
    chip.textContent = 'Jendela belum dibuka';
  }
}

async function pilihTabKerja() {
  // Cari tab yang sudah terbuka di host target.
  const tabs = await chrome.tabs.query({ url: `https://${CONFIG.HOST}/*` });
  if (!tabs.length) return null;
  const aktif = tabs.find((t) => t.active) || tabs[0];
  workTabId = aktif.id;
  workWinId = aktif.windowId;
  await chrome.tabs.update(workTabId, { active: true });
  if (workWinId != null) await chrome.windows.update(workWinId, { focused: true });
  return aktif;
}

function pasangPanel() {
  $('btnBuka').onclick = async () => {
    if (CONFIG.HOST.startsWith('GANTI')) return log('Isi HOST di config.js dulu.');
    const ok = await chrome.permissions.request({ origins: [`https://${CONFIG.HOST}/*`] });
    if (!ok) return log('Izin akses ke situs ditolak.');

    // Utamakan tab yang sudah terbuka di host target.
    const t = await pilihTabKerja();
    if (t) {
      log(`Memakai tab yang sudah terbuka (id ${workTabId}).`);
      setChipSesi('belum-dicek');
      return;
    }

    // Tidak ada → buat jendela baru.
    log('Belum ada tab di situs target. Membuat jendela baru.');
    const w = await chrome.windows.create({
      url: `https://${CONFIG.HOST}${CONFIG.START_PATH}`,
      focused: true,
    });
    workWinId = w.id;
    workTabId = w.tabs[0].id;
    log("Jendela kerja dibuka. Login SSO di sana, lalu klik 'Cek sesi'.");
    setChipSesi('belum-dicek');
  };

  $('btnSesi').onclick = async () => {
    if (workTabId === null) {
      setChipSesi('belum-dibuka');
      return log('Klik "Buka jendela kerja" dulu.');
    }
    const butuh = await butuhLogin(true).catch(() => true);
    setChipSesi(butuh ? 'habis' : 'aktif');
    log(butuh ? 'Belum login.' : 'Sesi aktif.');
  };

  $('btnScan').onclick = async () => {
    if (workTabId === null) return log('Buka jendela kerja dulu.');
    const r = (await jalankanDiTab('scan', {})).filter((x) => x.jumlahField > 0);
    if (!r.length) return log('Tidak ada field form di halaman aktif.');
    r.forEach((x) => log(`Frame ${x.frame}: ${x.jumlahField} field\n` + x.fields.map((f) => `  <${f.tag}${f.type ? ' ' + f.type : ''}> name="${f.name}" id="${f.id}" label="${f.label}"${f.terkunci ? ' [terkunci]' : ''}`).join('\n')));
  };

  $('btnMulai').onclick = mulai;
  $('btnStop').onclick = () => {
    stopFlag = true;
  };

  $('btnLog').onclick = () => {
    if (!hasil.length) return log('Belum ada hasil.');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hasil), 'log');
    XLSX.writeFile(wb, `log_${Date.now()}.xlsx`);
  };

  $('file').onchange = async (e) => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      if (typeof XLSX === 'undefined') return log('ERROR: pustaka Excel tidak termuat (lib/xlsx.full.min.js).');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const b = bacaExcel(wb);
      rows = b.data;
      kolom = b.head;
      if (!kolom.length) return log('Excel terbaca tetapi tidak ada baris judul kolom/data. Pastikan sheet berisi tabel.');
      log(`Excel dimuat dari sheet '${b.sheet}': ${rows.length} baris. Kolom: ${kolom.join(', ')}`);

      $('kolomLink').innerHTML = kolom.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
      $('kolomUsaha').innerHTML = $('kolomLink').innerHTML;

      const tebakUsaha = kolom.find((k) => k.trim().toLowerCase() === CONFIG.KOLOM_USAHA.toLowerCase()) || kolom.find((k) => /usaha/i.test(k));
      if (tebakUsaha) {
        $('kolomUsaha').value = tebakUsaha;
        log(`Kolom nama usaha: '${tebakUsaha}' (bisa diganti di dropdown).`);
      } else {
        log("Kolom nama usaha tidak terdeteksi otomatis, pilih manual di dropdown 'Kolom nama usaha'.");
      }

      const sama = (k) => k.trim().toLowerCase() === CONFIG.KOLOM_LINK.toLowerCase();
      const tebak = kolom.find(sama) || kolom.find((k) => /link/i.test(k));
      if (tebak) $('kolomLink').value = tebak;
      if (!kolom.some(sama)) {
        log(`Kolom '${CONFIG.KOLOM_LINK}' tidak ditemukan, pilih kolom link secara manual.`);
      } else {
        const hostOk = rows.filter((r) => {
          try {
            return new URL(String(r[tebak]).trim()).host === CONFIG.HOST;
          } catch (err) {
            return false;
          }
        }).length;
        log(`Kolom '${tebak}': ${hostOk} dari ${rows.length} baris berisi link dengan host sesuai config.`);
        const contoh = rows.find((r) => String(r[tebak] || '').trim());
        if (contoh) log(`Contoh link baris pertama: ${maskPath(String(contoh[tebak]).trim())}`);
      }

      renderKolomUpdate();
    } catch (err) {
      log('ERROR membaca Excel: ' + err.message);
    }
  };

  $('profil').innerHTML = Object.entries(RATE_LIMIT_PROFILES)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
    .join('');
  $('profil').value = 'safe';

  $('mode').innerHTML = Object.entries(MODES)
    .map(([id, m]) => `<option value="${esc(id)}">${esc(m.judul)}</option>`)
    .join('');
  $('mode').value = 'review';
  $('mode').onchange = renderKolomUpdate;
  renderKolomUpdate();

  setChipSesi('belum-dibuka');

  // Pintasan: Ctrl+Enter = Mulai (kalau tidak disabled), Esc = Stop (kalau proses jalan).
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (!$('btnMulai').disabled) $('btnMulai').click();
    } else if (e.key === 'Escape') {
      if (!$('btnStop').disabled) $('btnStop').click();
    }
  });
}

function renderKolomUpdate() {
  const mode = MODES[$('mode').value];
  const blok = mode && mode.blok ? BLOKS[mode.blok] : null;

  if (!blok || !blok.fields || !Object.keys(blok.fields).length) {
    $('kolomUpdate').innerHTML = '<small class="hint">(mode ini tidak mengisi field)</small>';
    const pakaiItem = !!(blok && blok.sidebar.item);
    $('kolomUsaha').disabled = !pakaiItem;
    $('kecocokan').disabled = !pakaiItem;
    return;
  }

  const opsiKolom = `<option value="">(pilih kolom)</option>` + kolom.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');

  $('kolomUpdate').innerHTML = Object.keys(blok.fields)
    .map(
      (nama) =>
        `<div class="field-row">` + `<label><input type="checkbox" value="${esc(nama)}"> ${esc(nama)}</label>` + `<select data-k="${esc(nama)}">${opsiKolom}</select>` + `<small class="pratinjau" data-k="${esc(nama)}"></small>` + `</div>`,
    )
    .join('');

  const contohKolom = (kol) => {
    if (!kol) return '';
    const b = rows.find((r) => String(r[kol] ?? '').trim() !== '');
    if (!b) return '(kolom kosong)';
    const v = String(b[kol]);
    return `contoh: "${v.length > 40 ? v.slice(0, 40) + '…' : v}"`;
  };
  const perbaruiPratinjau = (sel) => {
    const el = [...$('kolomUpdate').querySelectorAll('small.pratinjau')].find((s) => s.dataset.k === sel.dataset.k);
    if (el) el.textContent = contohKolom(sel.value);
  };

  $('kolomUpdate')
    .querySelectorAll('select')
    .forEach((sel) => {
      const tebak = (blok.fields[sel.dataset.k].kolom || []).map((t) => t.toLowerCase());
      const ketemu = kolom.find((k) => tebak.includes(k.trim().toLowerCase()));
      if (ketemu) {
        sel.value = ketemu;
        sel.parentElement.querySelector('input').checked = true;
      }
      perbaruiPratinjau(sel);
      sel.addEventListener('change', () => perbaruiPratinjau(sel));
    });

  const pakaiItem = !!blok.sidebar.item;
  $('kolomUsaha').disabled = !pakaiItem;
  $('kecocokan').disabled = !pakaiItem;
}
