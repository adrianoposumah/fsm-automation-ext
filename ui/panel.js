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

function renderPreviewMulai() {
  const el = $('previewMulai');
  if (!el) return;
  el.textContent = '';

  if (!rows.length) {
    el.textContent = 'Muat file Excel untuk melihat preview baris.';
    return;
  }

  const mulai = Math.max(2, parseInt($('mulaiBaris').value, 10) || 2);
  const batas = Math.max(1, parseInt($('batas').value, 10) || rows.length);
  const awal = mulai - 2;
  if (awal >= rows.length) {
    el.textContent = `Baris mulai ${mulai} berada di luar data (total baris data: ${rows.length}).`;
    return;
  }

  const jumlah = Math.min(batas, rows.length - awal);
  const akhir = mulai + jumlah - 1;
  const ringkasan = document.createElement('div');
  ringkasan.textContent = `Preview: ${jumlah} baris, Excel ${mulai}–${akhir} dari ${rows.length + 1} baris termasuk header.`;
  el.appendChild(ringkasan);

  const daftar = document.createElement('div');
  const kolomLinkDipilih = $('kolomLink').value;
  const kolomNama = $('kolomUsaha').value;
  for (let i = 0; i < Math.min(jumlah, 5); i++) {
    const baris = rows[awal + i];
    const link = kolomLinkDipilih && baris[kolomLinkDipilih] ? maskPath(String(baris[kolomLinkDipilih]).trim()) : '(link kosong)';
    const nama = kolomNama && baris[kolomNama] ? String(baris[kolomNama]).trim() : '';
    const item = document.createElement('div');
    item.textContent = `Baris ${mulai + i}: ${nama ? nama + ' — ' : ''}${link}`;
    daftar.appendChild(item);
  }
  if (jumlah > 5) {
    const sisa = document.createElement('div');
    sisa.textContent = `… dan ${jumlah - 5} baris lainnya.`;
    daftar.appendChild(sisa);
  }
  el.appendChild(daftar);
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
    const kolom = ['baris_excel', 'link', 'nama_usaha', 'mode', 'kode', 'status', 'detail', 'perubahan', 'catatan', 'identitas', 'total_pendapatan', 'total_pengeluaran', 'selisih', 'konfirmasi_awal', 'konfirmasi_akhir', 'waktu'];
    const data = hasil.map((baris) => Object.fromEntries(kolom.map((k) => [k, baris[k] ?? ''])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data, { header: kolom }), 'log');
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
      renderPreviewMulai();
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
  $('mulaiBaris').addEventListener('input', renderPreviewMulai);
  $('batas').addEventListener('input', renderPreviewMulai);
  $('kolomLink').addEventListener('change', renderPreviewMulai);
  $('kolomUsaha').addEventListener('change', renderPreviewMulai);
  renderKolomUpdate();
  renderPreviewMulai();

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

  if (!blok) {
    $('kolomUpdate').innerHTML = '<small class="hint">(mode ini tidak mengisi field)</small>';
    $('kolomUsaha').disabled = true;
    $('kecocokan').disabled = true;
    return;
  }

  // Mode KBLI memakai tiga kolom terpisah: kode lama, kode baru, dan catatan.
  if (mode.aksi === 'kbli') {
    const opsi = `<option value="">(pilih kolom)</option>` + kolom.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    const definisi = [
      ['lama', 'KBLI lama (validasi)', blok.fields['Kode KBLI'].kolomLama],
      ['baru', 'KBLI baru/final (kosong = dilewati)', blok.fields['Kode KBLI'].kolomBaru],
      ['catatan', 'Catatan KBLI', blok.fields['Kode KBLI'].kolomCatatan],
    ];
    $('kolomUpdate').innerHTML = definisi.map(([k, label]) =>
      `<div class="field-row"><span>${esc(label)}</span><select data-kbli="${k}">${opsi}</select></div>`).join('');
    $('kolomUpdate').querySelectorAll('select').forEach((sel) => {
      const d = definisi.find((x) => x[0] === sel.dataset.kbli);
      const tebakan = (d[2] || []).map((x) => x.toLowerCase());
      const ketemu = kolom.find((x) => tebakan.includes(x.trim().toLowerCase()));
      if (ketemu) sel.value = ketemu;
    });
    $('kolomUsaha').disabled = false;
    $('kecocokan').disabled = false;
    return;
  }

  // ── Mode KK: kolom khusus, tanpa checkbox ──
  if (mode.aksi === 'kk' || mode.aksi === 'kk-validasi') {
    const daftar = mode.aksi === 'kk'
      ? [
          { kunci: 'no_kk_awal', label: 'No KK awal (info)', kolom: blok.info.no_kk_awal.kolom },
          { kunci: 'konfirmasi', label: 'Konfirmasi 1/2/3 (info)', kolom: blok.info.konfirmasi.kolom },
          { kunci: 'kk_usul', label: 'KK usul (diinput)', kolom: blok.fields['Nomor KK'].kolom },
          { kunci: 'nik_usul', label: 'NIK usul (validasi)', kolom: blok.validasi.nik.kolom },
          { kunci: 'nama_nik', label: 'Nama NIK (validasi)', kolom: blok.validasi.nama.kolom },
        ]
      : [
          { kunci: 'kk_usul', label: 'KK usul (validasi no_kk)', kolom: blok.fields['Nomor KK'].kolom },
          { kunci: 'nik_usul', label: 'NIK usul (validasi)', kolom: blok.validasi.nik.kolom },
          { kunci: 'nama_nik', label: 'Nama NIK (validasi)', kolom: blok.validasi.nama.kolom },
          { kunci: 'catatan_akhir', label: 'Catatan akhir (validasi)', kolom: blok.validasi.catatanAkhir.kolom },
        ];
    const opsi = `<option value="">(pilih kolom)</option>` + kolom.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    $('kolomUpdate').innerHTML = daftar
      .map((d) => `<div class="field-row">` + `<span>${esc(d.label)}</span>` + `<select data-kk="${esc(d.kunci)}">${opsi}</select>` + `<small class="pratinjau" data-kk="${esc(d.kunci)}"></small>` + `</div>`)
      .join('');

    const contohKolom = (kol) => {
      if (!kol) return '';
      const b = rows.find((r) => String(r[kol] ?? '').trim() !== '');
      if (!b) return '(kosong)';
      const v = String(b[kol]);
      return `contoh: "${v.length > 30 ? v.slice(0, 30) + '…' : v}"`;
    };
    const perbaruiPratinjau = (sel) => {
      const el = [...$('kolomUpdate').querySelectorAll('small.pratinjau')].find((s) => s.dataset.kk === sel.dataset.kk);
      if (el) el.textContent = contohKolom(sel.value);
    };

    $('kolomUpdate')
      .querySelectorAll('select')
      .forEach((sel) => {
        const d = daftar.find((x) => x.kunci === sel.dataset.kk);
        const tebak = (d.kolom || []).map((t) => t.toLowerCase());
        const ketemu = kolom.find((k) => tebak.includes(k.trim().toLowerCase()));
        if (ketemu) sel.value = ketemu;
        perbaruiPratinjau(sel);
        sel.addEventListener('change', () => perbaruiPratinjau(sel));
      });

    $('kolomUsaha').disabled = true;
    $('kecocokan').disabled = true;
    return;
  }

  // [BARU] ── Mode flag: per field = dropdown kolom nilai + dropdown kolom flag; satu dropdown kolom catatan. Tanpa checkbox ──
  if (blok.flag) {
    const opsiKol = `<option value="">(pilih kolom)</option>` + kolom.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    const cari = (tebakan) => {
      const t = (tebakan || []).map((x) => x.toLowerCase());
      return kolom.find((k) => t.includes(k.trim().toLowerCase())) || '';
    };
    const contoh = (kol) => {
      if (!kol) return '';
      const b = rows.find((r) => String(r[kol] ?? '').trim() !== '');
      if (!b) return '(kosong)';
      const v = String(b[kol]);
      return `contoh: "${v.length > 30 ? v.slice(0, 30) + '…' : v}"`;
    };

    const barisField = Object.keys(blok.fields)
      .map(
        (nama) =>
          `<div class="field-row">` +
          `<span>${esc(nama)}</span>` +
          `<select data-k="${esc(nama)}" title="Kolom nilai">${opsiKol}</select>` +
          (blok.flag.tanpaFlag ? '' : `<select data-flag="${esc(nama)}" title="Kolom flag (diinput hanya bila = 1)">${opsiKol}</select>`) +
          `<small class="pratinjau" data-info="${esc(nama)}"></small>` +
          `</div>`,
      )
      .join('');
    const barisCatatan = blok.flag.catatanPerField
      ? ''
      : `<div class="field-row"><span>Kolom catatan</span><select data-catatan="1">${opsiKol}</select><small class="pratinjau" data-info="catatan"></small></div>`;
    const barisCatatanField = blok.flag.catatanPerField
      ? Object.keys(blok.fields).map((nama) => `<div class="field-row"><span>${esc(nama)} — catatan</span><select data-catatan-field="${esc(nama)}" title="Kolom catatan untuk field ini">${opsiKol}</select><small class="pratinjau" data-info="catatan-${esc(nama)}"></small></div>`).join('')
      : '';
    $('kolomUpdate').innerHTML = barisField + barisCatatan + barisCatatanField;

    const perbarui = (sel, kunci) => {
      const el = [...$('kolomUpdate').querySelectorAll('small.pratinjau')].find((s) => s.dataset.info === kunci);
      if (el) el.textContent = contoh(sel.value);
    };
    $('kolomUpdate')
      .querySelectorAll('select')
      .forEach((sel) => {
        let tebakan;
        let kunci = null; // kunci pratinjau (hanya kolom nilai dan catatan yang punya pratinjau)
        if (sel.dataset.k !== undefined) {
          tebakan = blok.fields[sel.dataset.k].kolom;
          kunci = sel.dataset.k;
        } else if (sel.dataset.flag !== undefined) {
          tebakan = blok.fields[sel.dataset.flag].flagKolom;
        } else if (sel.dataset.catatan !== undefined) {
          tebakan = blok.flag.catatanKolom;
          kunci = 'catatan';
        } else {
          tebakan = blok.fields[sel.dataset.catatanField].catatanKolom;
          kunci = 'catatan-' + sel.dataset.catatanField;
        }
        const ketemu = cari(tebakan);
        if (ketemu) sel.value = ketemu;
        if (kunci) {
          perbarui(sel, kunci);
          sel.addEventListener('change', () => perbarui(sel, kunci));
        }
      });

    // Mode ini memilih item (usaha) di sidebar seperti Blok II lainnya.
    $('kolomUsaha').disabled = false;
    $('kecocokan').disabled = false;
    return;
  }

  // ── Mode lain: tampilkan blok.fields seperti sebelumnya ──
  if (!blok.fields || !Object.keys(blok.fields).length) {
    $('kolomUpdate').innerHTML = '<small class="hint">(mode ini tidak mengisi field)</small>';
    const pakaiItem = !!blok.sidebar.item;
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
