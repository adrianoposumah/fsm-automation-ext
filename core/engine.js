'use strict';
// Mesin: alur per baris dan loop utama.

function gabung(daftar) {
  const out = {};
  for (const r of daftar)
    for (const [k, v] of Object.entries(r || {})) {
      if (!out[k] || (v.ketemu && !out[k].ketemu)) out[k] = v;
    }
  return out;
}
const jumlahDari = (r) => r.reduce((s, x) => s + (x.jumlah || 0), 0);

async function ulangiCariEdit(jumlah, jenisOp, ms, limiter) {
  const cfg = CONFIG.CEK_ULANG_TOMBOL_EDIT;
  let hasil = jumlah;
  let percobaan = 0;
  while (hasil === 0 && cfg && cfg.aktif && percobaan < Math.max(0, Number(cfg.maksimal) || 0)) {
    percobaan++;
    await new Promise((r) => setTimeout(r, Math.max(0, Number(cfg.jedaMs) || 0)));
    await limiter.tunggu('filter');
    hasil = jumlahDari(await jalankanDiTab(jenisOp, { css: CONFIG.EDIT_CSS, ms }));
  }
  return { jumlah: hasil, percobaan };
}

// Normalisasi angka yang sama dengan operasi injeksi, untuk validasi flag=0
// sebelum field lain di baris tersebut diisi.
function angkaNilai(v) {
  let t = String(v == null ? '' : v).replace(/rp/gi, '').replace(/\s/g, '');
  if (t === '') return null;
  if (/^[-–—]+$/.test(t)) return '0';
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isInteger(n) ? String(n) : null;
}

// [BARU] Apakah nilai sel flag dianggap aktif? ('1', 1, '1.0' → true).
function flagAktif(v, cfgFlag) {
  const t = String(v == null ? '' : v).trim();
  if (t === '') return false;
  const aktif = (cfgFlag && cfgFlag.nilaiAktif) || ['1'];
  return aktif.includes(t) || aktif.includes(String(Number(t)));
}

// [BARU] Tentukan field target satu baris: flag aktif. Field dengan flag aktif tetapi nilai kosong
// dicatat sebagai masalah (seluruh baris akan dilewati, tidak ada pembaruan sebagian).
function pilihDariFlag(baris, blok, petaKolom, petaFlag, petaCatatan, petaRemark) {
  const pilih = [];
  const masalah = [];
  const flagNilai = {};
  for (const k of Object.keys(blok.fields)) {
    if (!blok.flag.tanpaFlag) {
      const kolomPengendali = blok.flag.remarkPerField ? petaRemark[k] : petaFlag[k];
      if (!kolomPengendali) continue; // kolom pengendali tidak dipilih → field tidak dikelola
      const flagMentah = String(baris[kolomPengendali] == null ? '' : baris[kolomPengendali]).trim().replace(/^#/, '').replace(/\.0+$/, '');
      if (blok.flag.prosesFlag0 && flagMentah !== '0' && flagMentah !== '1') {
        masalah.push(`${k}: ${blok.flag.remarkPerField ? 'catatan/remark harus #0 atau #1' : 'flag harus 0 atau 1'}`);
        continue;
      }
      flagNilai[k] = blok.flag.remarkPerField ? (flagMentah === '1' ? '1' : '0') : (flagAktif(baris[kolomPengendali], blok.flag) ? '1' : '0');
      if (flagNilai[k] === '0' && !blok.flag.prosesFlag0) continue;
    }
    const mentah = petaKolom[k] ? baris[petaKolom[k]] : '';
    if (String(mentah == null ? '' : mentah).trim() === '') {
      if (blok.fields[k].opsional) continue;
      masalah.push(`${k}: nilai kosong`);
      continue;
    }
    if (blok.flag && blok.flag.catatanPerField && !blok.flag.catatanTetapPerFlag && blok.flag.catatanWajib !== false && !blok.fields[k].opsional) {
      const catatan = petaCatatan && petaCatatan[k] ? baris[petaCatatan[k]] : '';
      if (String(catatan == null ? '' : catatan).trim() === '') {
        masalah.push(`${k}: catatan kosong`);
        continue;
      }
    }
    pilih.push(k);
  }
  return { pilih, masalah, flagNilai };
}

// [BARU] Satu aturan kode catatan untuk semua jalur: lengkap → DC_03, tidak lengkap → DC_00.
function kodeKK(cfg, lengkap) {
  if (!cfg || !cfg.aktif) return '';
  return lengkap ? cfg.kodeLengkap || '#DC_03' : cfg.kodeTidakLengkap || '#DC_00';
}

// [BARU] Teks ringkas hasil catatan untuk kolom detail log.
function teksCatatan(catat) {
  if (!catat) return '';
  if (!catat.ok) return `; catatan GAGAL: ${catat.pesan || '?'}`;
  const t = catat.terakhir;
  const infoT = t ? `"${t.teks}" oleh ${t.pengirim}${t.tanggal ? ', ' + t.tanggal + ' ' + t.jam : ''}` : '';
  if (catat.dilewati) {
    const dari = catat.dilewatiDari === 'orang-lain' ? ' oleh user lain' : '';
    return `; catatan "${catat.teks}" DILEWATI (terakhir${dari}: ${infoT || '?'})`;
  }
  return `; catatan "${catat.teks}"${catat.dikirim ? ' DIKIRIM' : ' terisi (tidak dikirim)'}${infoT ? ` (sebelumnya: ${infoT})` : ''}`;
}

// [BARU] Tulis catatan no_kk dengan pengecekan riwayat (satu pintu untuk semua cabang alurKK).
async function catatKK(kode, cfg) {
  if (!kode || !cfg) return null;
  try {
    return (
      (
        await jalankanDiTab('catatanField', {
          varId: 'no_kk',
          teks: kode,
          simpan: !!cfg.kirimCatatan,
          lewatJika: (cfg.lewatJika && cfg.lewatJika[kode]) || null,
        })
      ).find((x) => x && x.ok !== undefined) || null
    );
  } catch (e) {
    return { ok: false, pesan: 'error: ' + (e && e.message) };
  }
}

// Validasi cepat Blok P: berhenti di halaman Review dan tidak pernah membuka /edit.
async function alurKKValidasi(baris, link, petaKK, limiter) {
  const blokP = BLOKS['blokP-kk'];
  const excel = (kunci) => {
    const kol = petaKK[kunci];
    return kol ? String(baris[kol] ?? '').trim() : '';
  };
  const kkUsul = excel('kk_usul');
  const nikUsul = excel('nik_usul');
  const namaNIKExcel = excel('nama_nik');
  const catatanAkhir = excel('catatan_akhir');

  const langsung = !!(blokP.validasiKK && blokP.validasiKK.linkLangsung);
  await limiter.tunggu('filter');
  await buka(link, limiter);
  let href = link;
  if (!langsung) {
    const rv = await jalankanDiTab('reviewHref', { teks: CONFIG.TEKS_REVIEW, ms: 10000 });
    const nRev = jumlahDari(rv);
    if (nRev === 0 && (await butuhLogin(true))) throw new SesiHabis();
    if (nRev !== 1) return { status: `PERLU CEK MANUAL: tombol Review ditemukan ${nRev}` };
    href = rv.find((r) => r.jumlah === 1).href;
    if (new URL(href).host !== CONFIG.HOST) return { status: 'PERLU CEK MANUAL: link Review mengarah ke host lain' };

    await limiter.tunggu('filter');
    await buka(href, limiter);
  }

  let nikH = '';
  let namaH = '';
  let identitas = '';
  if (nikUsul && namaNIKExcel) {
    await limiter.tunggu('filter');
    const ru1 = (
      await jalankanDiTab('usaha', {
        blok: 'SE2026 - L BLOK I',
        grup: 'Keterangan Anggota Keluarga',
        nama: namaNIKExcel,
        longgar: true,
        debug: false,
        fieldVarIds: ['nik_dtsen', 'nama_dtsen'],
      })
    ).find((r) => r.ada);
    if (!ru1 && (await butuhLogin(true))) throw new SesiHabis();
    if (!ru1 || !ru1.ok) return { status: 'PERLU CEK MANUAL: L BLOK I tidak bisa dibuka untuk validasi' };
    const rNilai = (await jalankanDiTab('bacaIdentitas', { varId: ['nik_dtsen', 'nama_dtsen'] })).find((x) => x.utama);
    const nilai = rNilai ? rNilai.nilai : {};
    nikH = String(nilai.nik_dtsen ?? '').trim();
    namaH = String(nilai.nama_dtsen ?? '').trim();
    identitas = `Anggota: "${namaH || '(kosong)'}" (NIK ${nikH || '-'})`;
  }

  await limiter.tunggu('filter');
  const rBlokP = (
    await jalankanDiTab('bukaBlok', { blok: blokP.sidebar.blok, fieldVarIds: ['no_kk'] })
  ).find((x) => x && x.ada);
  if (!rBlokP || !rBlokP.ok || !rBlokP.formMuncul)
    return {
      status: 'PERLU CEK MANUAL: field no_kk tidak tampil di halaman Review',
      detail: (rBlokP && rBlokP.pesan) || 'Blok P atau field no_kk tidak ditemukan',
      identitas,
    };

  const noKK = (await jalankanDiTab('bacaNilai', { varId: 'no_kk' })).find((x) => x && x.utama);
  const noKKH = noKK && noKK.ketemu && !noKK.ambigu ? String(noKK.nilai || '').trim() : '';
  if (!noKK || !noKK.ketemu || noKK.ambigu)
    return { status: 'PERLU CEK MANUAL: nilai no_kk tidak tunggal di halaman Review', detail: noKK && noKK.ambigu ? `no_kk ambigu (${noKK.ambigu})` : 'no_kk tidak ditemukan', identitas };

  const cat = (await jalankanDiTab('bacaCatatan', { varId: 'no_kk' })).find((x) => x && x.utama);
  if (!cat || !cat.ok) return { status: 'PERLU CEK MANUAL: riwayat catatan no_kk tidak dapat dibaca', detail: (cat && cat.pesan) || 'catatan tidak terbaca', identitas };

  const normNama = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const nikCocok = !!nikUsul && nikH === nikUsul;
  const namaCocok = !!namaNIKExcel && normNama(namaH) === normNama(namaNIKExcel);
  const kkCocok = !!kkUsul && noKKH === kkUsul;
  const catatanAda = !!catatanAkhir && (cat.riwayat || []).some((x) => normNama(x.teks) === normNama(catatanAkhir));
  const catatanTerakhirSama = !!catatanAkhir && cat.terakhir && normNama(cat.terakhir.teks) === normNama(catatanAkhir);
  const detail = [
    `no_kk halaman="${noKKH || '-'}" vs kk_usul="${kkUsul || '-'}" (${kkCocok ? 'OK' : 'BEDA'})`,
    `NIK halaman="${nikH || '-'}" vs Excel="${nikUsul || '-'}" (${nikCocok ? 'OK' : 'BEDA'})`,
    `nama halaman="${namaH || '-'}" vs Excel="${namaNIKExcel || '-'}" (${namaCocok ? 'OK' : 'BEDA'})`,
    `catatan akhir="${catatanAkhir || '-'}" (${catatanAda ? 'sudah ada' : 'belum ada'}, terakhir ${catatanTerakhirSama ? 'sama' : 'berbeda'})`,
  ].join('; ');
  const kodeMasalah = [];
  if (!kkCocok) kodeMasalah.push('NO_KK_BERBEDA');
  if (!nikCocok) kodeMasalah.push('NIK_BERBEDA');
  if (!namaCocok) kodeMasalah.push('NAMA_BERBEDA');
  if (!catatanAda) kodeMasalah.push('CATATAN_TIDAK_ADA');
  else if (!catatanTerakhirSama) kodeMasalah.push('CATATAN_TIDAK_SAMA');
  const semuaCocok = kodeMasalah.length === 0;
  return {
    kode: semuaCocok ? 'VALIDASI_OK' : kodeMasalah.join(','),
    status: semuaCocok ? 'VALIDASI OK: no_kk, NIK, nama, dan catatan sesuai' : `VALIDASI GAGAL: ${kodeMasalah.join(', ')}`,
    detail: `${langsung ? 'link langsung ke detail' : 'link melalui Review'}; ${detail}`,
    identitas,
    catatan: catatanAkhir,
    validasi: { noKKH, kkUsul, nikH, nikUsul, namaH, namaNIKExcel, catatanAkhir, catatanAda, catatanTerakhirSama, jumlahCatatan: (cat.riwayat || []).length },
  };
}

async function alurBaris(baris, link, mode, pilih, limiter, opsi) {
  const blok = opsi.blok;
  if (!blok && mode !== 'review') return { status: 'PERLU CEK MANUAL: blok tidak dikenal' };

  // [BARU] Mode flag: validasi data baris sebelum membuka halaman.
  if (mode === 'isi' && blok && blok.flag) {
    const masalah = opsi.masalahFlag || [];
    if (masalah.length) return { status: 'DILEWATI: ' + masalah.join('; ') };
    if (!pilih.length) return { status: blok.flag.tanpaFlag ? 'DILEWATI: tidak ada field yang dapat diproses' : 'DILEWATI: tidak ada flag bernilai 1' };
    if (blok.flag.catatanWajib !== false && !blok.flag.catatanPerField && !opsi.teksCatatan) return { status: 'DILEWATI: kolom catatan kosong untuk baris ini' };
  }

  await limiter.tunggu('filter');
  await buka(link, limiter);

  // [BARU] Link langsung ke halaman detail (mode flag): tidak ada pencarian tombol Review,
  // sehingga satu navigasi dan satu jeda rate limiter berkurang per baris.
  const langsung = !!(blok && blok.flag && blok.flag.linkLangsung);
  let href = link;
  if (!langsung) {
    const rv = await jalankanDiTab('reviewHref', { teks: CONFIG.TEKS_REVIEW, ms: 10000 });
    const nRev = jumlahDari(rv);
    if (nRev === 0 && (await butuhLogin(true))) throw new SesiHabis();
    if (nRev !== 1) return { status: `PERLU CEK MANUAL: tombol Review ditemukan ${nRev}` };
    href = rv.find((r) => r.jumlah === 1).href;
    if (new URL(href).host !== CONFIG.HOST) return { status: 'PERLU CEK MANUAL: link Review mengarah ke host lain' };

    await limiter.tunggu('filter');
    await buka(href, limiter);
  }
  if (mode === 'review') {
    const nEd = jumlahDari(await jalankanDiTab('hitung', { css: CONFIG.EDIT_CSS, ms: 8000 }));
    return {
      status: 'REVIEW OK: halaman review terbuka',
      detail: `${maskPath(href)} | tombol Edit ditemukan: ${nEd}`,
    };
  }

  await limiter.tunggu('filter');
  let nEdit = jumlahDari(await jalankanDiTab('klikEdit', { css: CONFIG.EDIT_CSS, ms: 10000 }));
  nEdit = (await ulangiCariEdit(nEdit, 'klikEdit', 10000, limiter)).jumlah;
  if (nEdit === 0 && (await butuhLogin(true))) throw new SesiHabis();
  let revoked = false;
  if (nEdit === 0) {
    // Assignment approved kadang tidak menampilkan Edit. Ikuti alur mode KBLI:
    // Revoke dulu, tunggu refresh, lalu cari dan klik Edit ulang.
    await limiter.tunggu('filter');
    const siapRefresh = tungguTab(workTabId, 15000).catch(() => null);
    const revoke = await jalankanDiTab('revoke', { css: CONFIG.REVOKE_CSS, ms: 10000 });
    const hasilRevoke = revoke.find((x) => x && x.jumlah !== undefined);
    if (!hasilRevoke || hasilRevoke.jumlah !== 1 || !hasilRevoke.dikonfirmasi) {
      return {
        status: 'PERLU CEK MANUAL: tombol Edit tidak ada dan Revoke tidak berhasil',
        detail: (hasilRevoke && hasilRevoke.pesan) || 'tombol Revoke tidak ditemukan atau konfirmasi gagal',
      };
    }
    revoked = true;
    await siapRefresh;
    await limiter.tunggu('filter');
    nEdit = jumlahDari(await jalankanDiTab('klikEdit', { css: CONFIG.EDIT_CSS, ms: 10000 }));
    nEdit = (await ulangiCariEdit(nEdit, 'klikEdit', 10000, limiter)).jumlah;
  }
  if (nEdit !== 1) return { status: `PERLU CEK MANUAL: tombol Edit ${revoked ? 'belum muncul setelah Revoke' : 'ditemukan ' + nEdit}${langsung ? ' (link langsung: pastikan URL = halaman detail yang memuat tombol Edit)' : ''}` };
  if (!(await tungguUrl((p) => /(?:^|\/)edit(?:\/|$)/.test(p), 10000))) {
    const tab = await chrome.tabs.get(workTabId).catch(() => null);
    return { status: 'GAGAL: halaman /edit tidak terbuka', detail: `URL setelah klik Edit: ${tab && (tab.url || tab.pendingUrl) || '(tidak terbaca)'}` };
  }

  // --- Buka blok sidebar (dengan atau tanpa pemilihan item) ---
  await limiter.tunggu('filter');
  const fieldVarIds = Object.values(blok.fields || {})
    .map((f) => f.varId)
    .filter(Boolean);

  const periksaSidebar = async () => {
    if (blok.sidebar.item) {
      // Blok dengan daftar item (mis. Blok II — pilih usaha)
      return (
        await jalankanDiTab('usaha', {
          blok: blok.sidebar.blok,
          grup: blok.sidebar.grup,
          nama: opsi.namaUsaha,
          longgar: opsi.longgar,
          debug: opsi.debug,
          fieldVarIds,
          varIdIdentitas: blok.identitas && blok.identitas.varId,
        })
      ).find((r) => r.ada);
    }
    // Blok tanpa item (mis. Blok P — form langsung tampil setelah header dibuka)
    return (
      await jalankanDiTab('bukaBlok', {
        blok: blok.sidebar.blok,
        fieldVarIds,
      })
    ).find((r) => r.ada);
  };

  let ru = await periksaSidebar();
  let percobaanUlangSidebar = 0;
  const cfgCekUlangSidebar = CONFIG.CEK_ULANG_BLOK_SIDEBAR;
  while (
    !ru &&
    cfgCekUlangSidebar &&
    cfgCekUlangSidebar.aktif &&
    blok.sidebar.blok === cfgCekUlangSidebar.blok &&
    percobaanUlangSidebar < Math.max(0, Number(cfgCekUlangSidebar.maksimal) || 0)
  ) {
    percobaanUlangSidebar++;
    await new Promise((r) => setTimeout(r, Math.max(0, Number(cfgCekUlangSidebar.jedaMs) || 0)));
    ru = await periksaSidebar();
  }
  if (!ru && (await butuhLogin(true))) throw new SesiHabis();
  if (!ru)
    return {
      status: `PERLU CEK MANUAL: Blok "${blok.sidebar.blok}" tidak ditemukan di sidebar`,
      detail: percobaanUlangSidebar ? `blok sudah diperiksa ulang ${percobaanUlangSidebar} kali; total pemeriksaan ${percobaanUlangSidebar + 1}` : '',
    };
  if (!ru.ok) return { status: 'PERLU CEK MANUAL: ' + (ru.pesan || 'blok tidak bisa dibuka') };

  // --- Identitas record ---
  let teksIdn = '';
  if (ru && ru.namaForm) {
    teksIdn = `${(blok.identitas && blok.identitas.label) || 'Nama komersial'} di halaman: "${ru.namaForm}"`;
  } else if (blok.identitas && blok.identitas.varId) {
    const rIdn = (await jalankanDiTab('bacaIdentitas', { varId: [blok.identitas.varId] })).find((x) => x.nilai && x.nilai[blok.identitas.varId] !== undefined && x.nilai[blok.identitas.varId] !== null);
    const nilaiIdn = rIdn ? rIdn.nilai[blok.identitas.varId] : null;
    teksIdn = nilaiIdn ? `${blok.identitas.label} di halaman: "${nilaiIdn}"` : `${blok.identitas.label} di halaman: (tidak ditemukan)`;
  }

  // --- Nilai baru dari Excel untuk field terpilih ---
  const fields = {},
    nilai = {};
  for (const k of pilih) {
    fields[k] = blok.fields[k];
    nilai[k] = opsi.petaKolom[k] ? baris[opsi.petaKolom[k]] : '';
  }

  // Mode "Tes pilih usaha" hanya berlaku untuk blok dengan item.
  if (mode === 'usaha') {
    if (!blok.sidebar.item) {
      return {
        status: 'PERLU CEK MANUAL: mode "Tes pilih usaha" tidak berlaku untuk blok tanpa daftar item',
        identitas: teksIdn,
      };
    }
    return {
      status: ru.formMuncul ? `USAHA OK: dipilih 1 dari ${ru.total} usaha` : `PERLU CEK MANUAL: usaha ditemukan tetapi form tidak muncul`,
      detail:
        `awalnya ${ru.terbukaAwal ? 'terbuka' : 'tertutup'}, ` +
        `${ru.diklik ? 'dibuka lewat klik' : 'tidak diklik'}, ` +
        `${ru.dipilih ? 'dipilih lewat klik' : 'tidak perlu klik pilih'} | ` +
        `form: ${ru.formMuncul ? 'muncul' : 'TIDAK muncul'} | ` +
        `elemen form di halaman: ${ru.kontrol} (terlihat ${ru.terlihat})`,
      identitas: teksIdn,
    };
  }

  // --- Kalkulasi skip-minus (hanya kalau blok mengaktifkannya) ---
  let kalk = null;
  if (mode === 'isi' && blok.kalkulasiSkip && CONFIG.KALKULASI_SKIP && CONFIG.KALKULASI_SKIP.aktif) {
    const cf = CONFIG.KALKULASI_SKIP;
    const baru = {};
    for (const k of pilih) {
      const v = blok.fields[k] && blok.fields[k].varId;
      if (v) baru[v] = nilai[k];
    }
    const rs = (
      await jalankanDiTab('hitungSelisih', {
        varIds: cf.varIds,
        baru,
        pengeluaran: cf.pengeluaran,
        pendapatan: cf.pendapatan,
      })
    ).find((x) => x.utama);

    if (rs) {
      kalk = rs;
      if (rs.minus) {
        const rincianStr = Object.entries(rs.rincian)
          .map(([k, v]) => `${k}=${v.nilai === null ? '-' : v.nilai}${v.ambigu ? `(ambigu ${v.ambigu})` : ''}`)
          .join(', ');
        return {
          status: `DILEWATI: pendapatan ${rs.totalPendapatan} - pengeluaran ${rs.totalPengeluaran} = ${rs.selisih} (minus)`,
          detail: rincianStr,
          identitas: teksIdn,
          kalk: rs,
        };
      }
    }
  }

  // --- Cek & isi field ---
  // Satu field per panggilan supaya hasilnya dapat ditampilkan ke log
  // segera setelah field selesai, bukan menunggu seluruh baris selesai.
  const logField = (fase, k, v, fieldSpec = fields[k]) => {
    const awalan = opsi.barisExcel ? `[baris ${opsi.barisExcel}] ` : '';
    const idField = fieldSpec && fieldSpec.varId;
    const penanda = idField && idField.endsWith('_bln') ? ` [ID ${idField}]` : '';
    if (!v || !v.ketemu) return log(`${awalan}${fase} ${k}${penanda}: TIDAK DITEMUKAN`);
    if (v.tersembunyi) return log(`${awalan}${fase} ${k}${penanda}: ADA TAPI TIDAK TAMPIL`);
    if (v.ambigu) return log(`${awalan}${fase} ${k}${penanda}: AMBIGU (${v.ambigu} kandidat)`);
    if (fase === 'cek') return log(`${awalan}cek ${k}${penanda}: ditemukan${v.terkunci ? ' [terkunci]' : ''}`);
    if (v.diisi) return log(`${awalan}isi ${k}${penanda}: "${v.lama ?? ''}" → "${v.baruAngka ?? nilai[k] ?? ''}"`);
    if (v.sama) return log(`${awalan}isi ${k}${penanda}: sudah sama ("${v.lama ?? ''}")`);
    return log(`${awalan}isi ${k}${penanda}: GAGAL${v.alasan ? ` — ${v.alasan}` : ''}`);
  };

  const jalankanSatu = async (op, k, argTambahan, fieldSpec = fields[k]) => {
    const hasilField = gabung(
      await jalankanDiTab(op, {
        ...argTambahan,
        fields: { [k]: fieldSpec },
        jedaMs: CONFIG.JEDA_FIELD_MS,
        tungguFieldMs: fieldSpec && fieldSpec.opsional ? CONFIG.TUNGGU_FIELD_OPSIONAL_MS : CONFIG.TUNGGU_FIELD_MS,
        ...(argTambahan.nilai ? { nilai: { [k]: nilai[k] } } : {}),
      }),
    );
    const hasil = hasilField[k];
    logField(op === 'cek' ? 'cek' : 'isi', k, hasil, fieldSpec);
    return hasil;
  };

  const catatanIsi = blok.flag
    ? blok.flag.catatanPerField
      ? {
          perField: Object.fromEntries(
            pilih.map((k) => {
              const flag = opsi.flagNilai && opsi.flagNilai[k];
              const teks = blok.flag.catatanTetapPerFlag
                ? ((blok.flag.catatanTeksPerNilai || {})[flag] || '')
                : (opsi.teksCatatan && opsi.teksCatatan[k] ? opsi.teksCatatan[k] : '');
              return [k, { aktif: true, teks, simpan: !!blok.flag.simpanCatatan, hanyaJikaBerhasil: true, jikaSama: !!blok.flag.catatanJikaSama, jedaMs: CONFIG.JEDA_CATATAN_MS, dialogBukaMs: CONFIG.TUNGGU_DIALOG_CATATAN_MS, textareaMs: CONFIG.TUNGGU_TEXTAREA_CATATAN_MS, dialogTutupMs: CONFIG.TUNGGU_TUTUP_DIALOG_MS }];
            }),
          ),
        }
      : opsi.teksCatatan
        ? { aktif: true, teks: opsi.teksCatatan, simpan: !!blok.flag.simpanCatatan, hanyaJikaBerhasil: true, jikaSama: !!blok.flag.catatanJikaSama, jedaMs: CONFIG.JEDA_CATATAN_MS }
        : { aktif: false }
    : CONFIG.CATATAN || { aktif: false };

  // Cek semua field terlebih dahulu. Ini penting untuk mode flag: bila satu
  // field flag=0 berbeda dari Excel, seluruh baris dilewati sebelum ada field
  // flag=1 yang sempat diubah.
  let g = {};
  for (const k of pilih) {
    const hasilCek = await jalankanSatu('cek', k, {});
    g[k] = hasilCek;
  }

  // Bila seluruh field utama sudah diperiksa, coba ID alternatif berakhiran
  // `_bln` hanya untuk field yang memang tidak ditemukan. Nilai Excel dan
  // catatan tetap memakai pemetaan field yang sama.
  const suffixFallback = blok.fieldFallbackSuffix;
  if (suffixFallback) {
    for (const k of pilih) {
      if (!g[k] || g[k].ketemu) continue;
      const utama = fields[k];
      if (!utama || !utama.varId || utama.varId.endsWith(suffixFallback)) continue;
      const alternatif = { ...utama, varId: utama.varId + suffixFallback };
      log(`${opsi.barisExcel ? `[baris ${opsi.barisExcel}] ` : ''}${k}: field utama ${utama.varId} tidak ditemukan; mencari ${alternatif.varId}`);
      const hasilFallback = await jalankanSatu('cek', k, {}, alternatif);
      if (hasilFallback && hasilFallback.ketemu) {
        fields[k] = alternatif;
        g[k] = hasilFallback;
      }
    }
  }

  // Field opsional yang memang tidak ada pada jenis usaha ini dikeluarkan dari
  // validasi/pengisian. Field lain di baris yang sama tetap diproses.
  const pilihUntukProses = pilih.filter((k) => {
    const sp = blok.fields[k] || {};
    return !(sp.opsional && (!g[k] || !g[k].ketemu));
  });

  const angkaSama = (sp, a, b) => sp.tipe === 'angka' ? angkaNilai(a) !== null && angkaNilai(a) === angkaNilai(b) : String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
  if (mode === 'isi' && blok.flag && blok.flag.prosesFlag0) {
    const berbeda = pilihUntukProses.filter((k) => {
      if (!opsi.flagNilai || opsi.flagNilai[k] !== '0') return false;
      const v = g[k];
      if (!v || !v.ketemu || v.ambigu || v.tersembunyi) return false;
      return !angkaSama(blok.fields[k] || {}, v.nilai, nilai[k]);
    });
    if (berbeda.length) {
      return {
        status: 'DILEWATI: nilai flag=0 berbeda dari nilai halaman',
        detail: berbeda.map((k) => `${k}: halaman="${g[k].nilai ?? ''}" vs Excel="${nilai[k] ?? ''}"`).join(' | '),
        identitas: teksIdn,
        namaUsaha: opsi.namaUsaha,
      };
    }
  }

  for (const k of pilihUntukProses) {
    const hasilCek = g[k];
    const sp = blok.fields[k] || {};
    const catatanOpsionalKosong = sp.opsional && hasilCek && hasilCek.ketemu && blok.flag && blok.flag.catatanPerField && !blok.flag.catatanTetapPerFlag && blok.flag.catatanWajib !== false && (!opsi.teksCatatan || !String(opsi.teksCatatan[k] || '').trim());
    const tidakValid = !hasilCek || !hasilCek.ketemu || hasilCek.ambigu || hasilCek.tersembunyi || (blok.flag && hasilCek.terkunci) || catatanOpsionalKosong;
    if (mode === 'isi' && !tidakValid) {
      const hanyaCatatan = !!(blok.flag && blok.flag.prosesFlag0 && opsi.flagNilai && opsi.flagNilai[k] === '0');
      g[k] = await jalankanSatu('isi', k, { nilai, catatan: catatanIsi, hanyaCatatan });
    }
  }

  const bermasalah = pilihUntukProses.filter((k) => {
    const sp = blok.fields[k] || {};
    const v = g[k];
    // Field opsional boleh tidak ada pada usaha tertentu; jika ada, tetap harus tunggal dan terlihat.
    if (sp.opsional && (!v || !v.ketemu)) return false;
    const catatanOpsionalKosong =
      sp.opsional &&
      v &&
      v.ketemu &&
      blok.flag &&
      blok.flag.catatanPerField && !blok.flag.catatanTetapPerFlag &&
      blok.flag.catatanWajib !== false &&
      (!opsi.teksCatatan || !String(opsi.teksCatatan[k] || '').trim());
    return !v || !v.ketemu || v.ambigu || v.tersembunyi || (blok.flag && v.terkunci) || catatanOpsionalKosong;
  });

  // [BARU] Mode flag: cek hasil pengisian sebelum langkah akhir.
  let gagalIsi = [];
  let adaPerubahan = true;
  let adaCatatanBaru = false;
  if (mode === 'isi' && blok.flag && !bermasalah.length) {
    gagalIsi = pilihUntukProses.filter((k) => {
      const v = g[k];
      return !(v && (v.diisi || v.sama));
    });
    adaPerubahan = pilihUntukProses.some((k) => g[k] && g[k].diisi);
    adaCatatanBaru = pilihUntukProses.some((k) => g[k] && g[k].catatan && g[k].catatan.ok && !g[k].catatan.dilewati && !g[k].catatan.sudahAda);
  }

  // Perlu kirim jika ada nilai field yang berubah ATAU ada catatan baru yang ditinggalkan pada mode flag
  const perluKirim = adaPerubahan || (blok.flag && adaCatatanBaru);

  // --- Langkah akhir ---
  let akhir = null;
  if (mode === 'isi' && !bermasalah.length && !gagalIsi.length && perluKirim && (!blok.flag || blok.flag.langkahAkhir !== false) && CONFIG.LANGKAH_AKHIR && CONFIG.LANGKAH_AKHIR.aktif) {
    // [BARU] kirimPembaruan: klik Kirim lalu Konfirmasi (menyimpan). Selain itu perilaku lama (dry-run).
    const langkah = blok.flag && blok.flag.kirimPembaruan
      ? { ...CONFIG.LANGKAH_AKHIR, tahanDialog: false, konfirmasiKirim: true, jedaMs: CONFIG.JEDA_CATATAN_MS, tungguBerhasilMs: CONFIG.TUNGGU_DIALOG_BERHASIL_MS }
      : { ...CONFIG.LANGKAH_AKHIR, jedaMs: CONFIG.JEDA_CATATAN_MS };
    try {
      akhir = (await jalankanDiTab('akhirCatatan', langkah)).find((x) => x && x.ok !== undefined);
    } catch (e) {
      akhir = { ok: false, pesan: 'error: ' + (e && e.message) };
    }
  }

  const ids = (v) => (v.wadah && v.wadah.length ? ` [id: ${v.wadah.join(', ')}]` : '');
  const detail = pilih
    .map((k) => {
      const v = g[k];
      if (!v || !v.ketemu) return `${k}: ${blok.fields[k] && blok.fields[k].opsional ? 'tidak tersedia, dilewati' : 'TIDAK ADA'}`;
      if (v.tersembunyi) return `${k}: ADA TAPI TIDAK TAMPIL${ids(v)}`;
      if (v.ambigu) return `${k}: AMBIGU (${v.ambigu} kandidat)${ids(v)}`;
      if (mode === 'isi' && !bermasalah.length) {
        const cat = v.catatan;
        const catTxt = cat ? (cat.ok ? (cat.sudahAda || cat.dilewati ? `; catatan "${cat.teks}" SUDAH ADA` : `; catatan "${cat.teks}" ${cat.dikirim ? 'DISIMPAN' : 'terisi (tidak disimpan)'}`) : `; catatan GAGAL: ${cat.pesan || '?'}`) : '';
        if (v.sama) return `${k}: sudah sama ("${v.lama}")${catTxt}`;
        return v.diisi ? `${k}: "${v.lama}" → "${String(nilai[k]).trim().slice(0, 60)}"${catTxt}` : `${k}: tidak terisi (${v.alasan || '?'}${v.lama !== undefined ? '; lama "' + v.lama + '"' : ''})${catTxt}`;
      }
      return `${k}: ketemu${ids(v)}${v.terkunci ? ' [terkunci]' : ''}`;
    })
    .join(' | ');

  const terkirim = !!(akhir && akhir.ok && (akhir.dikirim || (akhir.dialog && akhir.dialog.dikonfirmasi)));
  let status;
  if (bermasalah.length) status = `${mode === 'isi' ? 'PERLU CEK MANUAL' : 'CEK GAGAL'}: ada field tidak ketemu/tidak tampil/ambigu${blok && blok.flag ? '/terkunci' : ''}${mode === 'isi' ? ', tidak ada yang diisi' : ''}`;
  else if (mode === 'isi' && blok && blok.flag) {
    if (gagalIsi.length) status = `PERLU CEK MANUAL: field gagal diisi (${gagalIsi.join(', ')}); tidak dikirim`;
    else if (!adaPerubahan && !adaCatatanBaru) status = 'SUDAH SESUAI: semua field target sudah bernilai sama & catatan sudah ada; tidak dikirim';
    else if (blok.flag.kirimPembaruan) status = terkirim ? (adaPerubahan ? 'DIISI & DIKIRIM' : 'CATATAN DIISI & DIKIRIM') : `PERLU CEK MANUAL: ${adaPerubahan ? 'field terisi' : 'catatan terisi'} tetapi pembaruan tidak terkirim`;
    else status = adaPerubahan ? 'DRY-RUN: diisi, tidak disimpan' : 'DRY-RUN: nilai sudah sama, catatan terisi (tidak disimpan)';
  } else status = mode === 'isi' ? 'DRY-RUN: diisi, tidak disimpan' : 'CEK OK: semua field ketemu dan tampil';
  const catatan = pilih
    .map((k) => (g[k] && g[k].catatan && g[k].catatan.teks ? String(g[k].catatan.teks) : ''))
    .filter(Boolean)
    .join(' | ');
  const detailFlag =
    blok && blok.flag && mode === 'isi'
      ? `${blok.flag.tanpaFlag ? 'target (semua field)' : 'target (flag=1)'}: ${pilih.join(', ')}`
      : '';
  // [BARU] Kolom yang diubah: "kolom_excel = lama → baru" (hanya field yang benar-benar terisi).
  const fmtNilai = (norm, mentah) => (norm !== null && norm !== undefined ? String(norm) : String(mentah == null ? '' : mentah).trim() || '(kosong)');
  const perubahan =
    mode === 'isi'
      ? pilih
          .filter((k) => g[k] && g[k].diisi)
          .map((k) => `${opsi.petaKolom[k] || k} = ${fmtNilai(g[k].lamaAngka, g[k].lama)} → ${fmtNilai(g[k].baruAngka, nilai[k])}`)
          .join('; ')
      : '';
  const detailAkhir = akhir && akhir.pesan ? ` | status akhir: ${akhir.pesan}` : '';
  return { status, detail: (detailFlag ? `${detailFlag} | ${detail}` : detail) + detailAkhir, identitas: teksIdn, akhir, kalk, catatan, perubahan, namaUsaha: opsi.namaUsaha, hentikanProses: !!(akhir && akhir.hentikanProses) };
}

// Alur khusus KBLI: validasi optimistic-lock (KBLI lama di Excel harus sama
// dengan pilihan halaman), pilih kode baru dari radio group, lalu proses catatan.
async function alurKBLI(baris, link, petaKBLI, limiter) {
  const blok = BLOKS['blok2-kbli'];
  const cfg = blok.kbli || {};
  const val = (k) => petaKBLI[k] ? String(baris[petaKBLI[k]] ?? '').trim() : '';
  const lama = val('lama');
  const baru = val('baru');
  // KBLI baru dan KBLI final memakai kolom Excel yang sama.
  const final = val('baru');
  const teksCatatan = val('catatan');
  if (!final) return { status: 'DILEWATI: KBLI final kosong' };
  if (!lama || !baru) return { status: 'DILEWATI: kolom KBLI lama atau baru kosong' };
  if (cfg.catatanWajib !== false && !teksCatatan) return { status: 'DILEWATI: kolom catatan KBLI kosong' };

  await limiter.tunggu('filter');
  await buka(link, limiter);
  let href = link;
  if (!cfg.linkLangsung) {
    const rv = await jalankanDiTab('reviewHref', { teks: CONFIG.TEKS_REVIEW, ms: 10000 });
    const nRev = jumlahDari(rv);
    if (nRev === 0 && (await butuhLogin(true))) throw new SesiHabis();
    if (nRev !== 1) return { status: `PERLU CEK MANUAL: tombol Review ditemukan ${nRev}` };
    href = rv.find((r) => r.jumlah === 1).href;
    await limiter.tunggu('filter');
    await buka(href, limiter);
  }
  // Samakan dengan alur Update Usaha per Flag: langsung jalankan klikEdit.
  // Assignment approved yang tidak punya Edit kemudian ditangani dengan Revoke.
  await limiter.tunggu('filter');
  let nEdit = jumlahDari(await jalankanDiTab('klikEdit', { css: CONFIG.EDIT_CSS, ms: 10000 }));
  nEdit = (await ulangiCariEdit(nEdit, 'klikEdit', 10000, limiter)).jumlah;
  if (nEdit === 0 && (await butuhLogin(true))) throw new SesiHabis();
  let revoked = false;
  if (nEdit === 0) {
    await limiter.tunggu('filter');
    const siapRefresh = tungguTab(workTabId, 15000).catch(() => null);
    const revoke = await jalankanDiTab('revoke', { css: CONFIG.REVOKE_CSS, ms: 10000 });
    const hasilRevoke = revoke.find((x) => x && x.jumlah !== undefined);
    if (!hasilRevoke || hasilRevoke.jumlah !== 1 || !hasilRevoke.dikonfirmasi)
      return {
        status: 'PERLU CEK MANUAL: tombol Edit tidak ada dan Revoke tidak berhasil',
        detail: (hasilRevoke && hasilRevoke.pesan) || 'tombol Revoke tidak ditemukan atau konfirmasi gagal',
      };
    revoked = true;
    await siapRefresh;
    nEdit = jumlahDari(await jalankanDiTab('klikEdit', { css: CONFIG.EDIT_CSS, ms: 10000 }));
    nEdit = (await ulangiCariEdit(nEdit, 'klikEdit', 10000, limiter)).jumlah;
  }
  if (nEdit !== 1) return { status: `PERLU CEK MANUAL: tombol Edit ${revoked ? 'belum muncul setelah Revoke' : 'ditemukan ' + nEdit}` };
  if (!(await tungguUrl((p) => /(?:^|\/)edit(?:\/|$)/.test(p), 10000))) {
    const tab = await chrome.tabs.get(workTabId).catch(() => null);
    return { status: 'GAGAL: halaman /edit tidak terbuka', detail: `URL setelah klik Edit: ${tab && (tab.url || tab.pendingUrl) || '(tidak terbaca)'}` };
  }

  await limiter.tunggu('filter');
  const ru = (await jalankanDiTab('usaha', {
    blok: blok.sidebar.blok,
    grup: blok.sidebar.grup,
    nama: String(baris[petaKBLI.namaUsaha] || ''),
    longgar: true,
    fieldVarIds: [blok.fields['Kode KBLI'].varId],
    varIdIdentitas: blok.identitas.varId,
  })).find((r) => r.ada);
  if (!ru) return { status: 'PERLU CEK MANUAL: usaha KBLI tidak ditemukan di sidebar' };
  if (!ru.ok) return { status: 'PERLU CEK MANUAL: ' + (ru.pesan || 'usaha KBLI tidak bisa dibuka') };

  const r = (await jalankanDiTab('kbli', {
    varId: blok.fields['Kode KBLI'].varId,
    lama,
    baru,
    catatan: { teks: teksCatatan, simpan: !!cfg.simpanCatatan, delayMs: cfg.catatanDelayMs || 1500 },
  })).find((x) => x && x.utama);
  if (!r || !r.ketemu) return { status: 'PERLU CEK MANUAL: field KBLI tidak ditemukan', detail: r && r.pesan };
  if (r.ambigu) return { status: 'PERLU CEK MANUAL: field KBLI ambigu', detail: r.pesan };
  if (r.alasan && !r.sama && !r.diubah)
    return {
      status: 'PERLU CEK MANUAL: ' + r.alasan,
      detail: `${lama} → ${baru}`,
      hentikanProses: !!r.hentikanProses,
    };

  // Dialog Catatan sudah dibuka dari operasi KBLI setelah scroll/pemilihan.
  const catatan = r.catatan;
  if (!catatan || !catatan.ok) return { status: 'PERLU CEK MANUAL: catatan KBLI gagal diproses', detail: catatan && catatan.pesan };

  let akhir = null;
  const adaCatatanBaru = !!(catatan.ok && !catatan.dilewati && !catatan.sudahAda);
  const perluKirim = r.diubah || adaCatatanBaru;
  if (perluKirim && cfg.kirimPembaruan && CONFIG.LANGKAH_AKHIR && CONFIG.LANGKAH_AKHIR.aktif) {
    // Sama dengan mode Update Usaha per Flag: buka blok CATATAN,
    // klik Kirim utama, lalu klik Konfirmasi pada dialog berikutnya.
    const langkah = {
      ...CONFIG.LANGKAH_AKHIR,
      blok: 'CATATAN',
      klikKirim: true,
      tahanDialog: false,
      konfirmasiKirim: true,
      tungguBerhasilMs: CONFIG.TUNGGU_DIALOG_BERHASIL_MS,
    };
    try {
      akhir = (await jalankanDiTab('akhirCatatan', langkah)).find((x) => x && x.ok !== undefined);
    } catch (e) {
      akhir = { ok: false, pesan: 'error: ' + (e && e.message) };
    }
  }
  const label = r.baruLabel || r.sekarangLabel || '';
  const perubahan = r.diubah ? `${lama} → ${baru}${label ? ` (${label})` : ''}` : `${r.sekarang || lama} (sudah sesuai)`;
  const terkirim = !!(akhir && akhir.ok && (akhir.dikirim || (akhir.dialog && akhir.dialog.dikonfirmasi)));
  const catatanAda = !!(catatan.sudahAda || catatan.dilewati);
  const status = perluKirim
    ? cfg.kirimPembaruan
      ? terkirim ? (r.diubah ? 'KBLI DIUPDATE & DIKIRIM' : 'CATATAN DIISI & DIKIRIM') : 'PERLU CEK MANUAL: pembaruan KBLI/catatan belum terkirim'
      : r.diubah ? 'DRY-RUN: KBLI diubah, tidak disimpan' : 'DRY-RUN: catatan diisi, tidak dikirim'
    : catatanAda ? 'VALIDASI OK: KBLI & catatan sudah sesuai' : 'VALIDASI OK: KBLI sesuai, catatan diproses';
  return {
    status,
    kode: perluKirim ? (cfg.kirimPembaruan && terkirim ? 'KBLI_UPDATE_OK' : 'DRY_RUN') : 'KBLI_VALIDASI_OK',
    detail: `KBLI halaman=${r.sekarang || '-'}, lama Excel=${lama}, baru Excel=${baru}; catatan ${catatanAda ? 'sudah ada dan sama' : (catatan.dikirim ? 'disimpan' : 'terisi/tidak disimpan')}`,
    perubahan,
    catatan: teksCatatan,
    namaUsaha: String(baris[petaKBLI.namaUsaha] || ''),
    hentikanProses: !!(akhir && akhir.hentikanProses),
  };
}

async function alurKK(baris, link, petaKK, limiter) {
  const blok1 = BLOKS['blok1-keluarga'];
  const blokP = BLOKS['blokP-kk'];

  const excel = (kunci) => {
    const kol = petaKK[kunci];
    return kol ? String(baris[kol] ?? '').trim() : '';
  };
  const noKKAwalExcel = excel('no_kk_awal');
  const konfirmasiAwalRaw = excel('konfirmasi');
  const kkUsul = excel('kk_usul');
  const nikUsul = excel('nik_usul');
  const namaNIKExcel = excel('nama_nik');
  const dataKKLengkap = !!nikUsul && !!namaNIKExcel && !!kkUsul;
  const kodeCatatan = kodeKK(blokP.catatanKK, dataKKLengkap); // [BARU] dipakai semua cabang di bawah
  let validasiIdentitasTertunda = false;

  const konfAwal = konfirmasiAwalRaw || '1. Belum diperbaiki';

  // 1) Buka link
  await limiter.tunggu('filter');
  await buka(link, limiter);

  // 2) Cari tombol Review
  const rv = await jalankanDiTab('reviewHref', { teks: CONFIG.TEKS_REVIEW, ms: 10000 });
  const nRev = jumlahDari(rv);
  if (nRev === 0 && (await butuhLogin(true))) throw new SesiHabis();
  if (nRev !== 1)
    return {
      status: `PERLU CEK MANUAL: tombol Review ditemukan ${nRev}`,
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: konfAwal,
    };
  const href = rv.find((r) => r.jumlah === 1).href;
  if (new URL(href).host !== CONFIG.HOST)
    return {
      status: 'PERLU CEK MANUAL: link Review mengarah ke host lain',
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: konfAwal,
    };

  // 3) Buka halaman Review
  await limiter.tunggu('filter');
  await buka(href, limiter);

  // 5) Buka L BLOK I → pilih anggota keluarga bila identitas Excel lengkap.
  // Jika tidak lengkap, tetap lanjut ke jalur tanpa Edit agar catatan #DC_00
  // dapat dicatat pada field no_kk yang hanya tersedia di halaman Review.
  let nikH = '';
  let namaH = '';
  if (nikUsul && namaNIKExcel) {
    await limiter.tunggu('filter');
    const ru1 = (
      await jalankanDiTab('usaha', {
        blok: blok1.sidebar.blok,
        grup: blok1.sidebar.grup,
        nama: namaNIKExcel,
        longgar: true,
        debug: false,
        fieldVarIds: ['nik_dtsen', 'nama_dtsen'],
      })
    ).find((r) => r.ada);

    if (!ru1 && (await butuhLogin(true))) throw new SesiHabis();
    if (!ru1)
      return {
        status: 'PERLU CEK MANUAL: L BLOK I tidak ditemukan di sidebar',
        konfirmasiAwal: konfAwal,
        konfirmasiAkhir: konfAwal,
      };
    if (!ru1.ok) {
      if (!dataKKLengkap)
        return {
          status: `PERLU CEK MANUAL: L BLOK I — ${ru1.pesan || 'tidak bisa dibuka'}`,
          konfirmasiAwal: konfAwal,
          konfirmasiAkhir: '3. Tidak diperbaiki',
        };
      // Assignment approved dapat menyembunyikan item Blok I sebelum Revoke.
      // Tunda validasi identitas agar alur dapat menarik assignment terlebih dahulu.
      validasiIdentitasTertunda = true;
    }

    if (!validasiIdentitasTertunda) await new Promise((r) => setTimeout(r, 500));

    // 6) Baca nik_dtsen & nama_dtsen
    if (!validasiIdentitasTertunda) {
      const rNilai1 = (await jalankanDiTab('bacaIdentitas', { varId: ['nik_dtsen', 'nama_dtsen'] })).find((x) => x.utama);
      const nilai1 = rNilai1 ? rNilai1.nilai : {};
      nikH = String(nilai1.nik_dtsen ?? '').trim();
      namaH = String(nilai1.nama_dtsen ?? '').trim();
    }
  }

  const teksIdn = `Anggota: "${namaH || '(kosong)'}" (NIK ${nikH || '-'})`;
  const detailValidasi = `NIK halaman="${nikH || '-'}" vs Excel="${nikUsul || '-'}"; ` + `nama halaman="${namaH || '-'}" vs Excel="${namaNIKExcel || '-'}"`;

  // 7) Validasi
  const identitasExcelLengkap = !!nikUsul && !!namaNIKExcel;
  const nikCocok = identitasExcelLengkap && nikH === nikUsul;
  const namaCocok = identitasExcelLengkap && namaH.toLowerCase() === namaNIKExcel.toLowerCase();
  if (identitasExcelLengkap && !validasiIdentitasTertunda && (!nikCocok || !namaCocok))
    return {
      status: `DILEWATI: validasi gagal (NIK ${nikCocok ? 'OK' : 'BEDA'}, nama ${namaCocok ? 'OK' : 'BEDA'})`,
      detail: detailValidasi,
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: '3. Tidak diperbaiki',
      identitas: teksIdn,
    };

  // 8) Cek tombol Edit
  let nEdit = jumlahDari(await jalankanDiTab('hitung', { css: CONFIG.EDIT_CSS, ms: 5000 }));
  nEdit = (await ulangiCariEdit(nEdit, 'hitung', 5000, limiter)).jumlah;

  // 9) Jika tidak ada tombol Edit (mis. assignment approved), tarik (revoke)
  // terlebih dahulu agar tombol Edit muncul.
  if (nEdit === 0) {
    await limiter.tunggu('filter');
    const siapRefresh = tungguTab(workTabId, 15000).catch(() => null);
    const revoke = await jalankanDiTab('revoke', {
      css: CONFIG.REVOKE_CSS,
      ms: 10000,
    });
    const hasilRevoke = revoke.find((x) => x && x.jumlah !== undefined);
    if (!hasilRevoke || hasilRevoke.jumlah !== 1 || !hasilRevoke.dikonfirmasi)
      return {
        status: 'PERLU CEK MANUAL: tombol Edit tidak ada dan Revoke tidak berhasil',
        detail: (hasilRevoke && hasilRevoke.pesan ? hasilRevoke.pesan + ' | ' : '') + detailValidasi,
        konfirmasiAwal: konfAwal,
        konfirmasiAkhir: konfAwal,
        identitas: teksIdn,
      };
    await siapRefresh;

    nEdit = jumlahDari(
      await jalankanDiTab('hitung', {
        css: CONFIG.EDIT_CSS,
        ms: 10000,
      }),
    );
    nEdit = (await ulangiCariEdit(nEdit, 'hitung', 10000, limiter)).jumlah;
    if (nEdit !== 1)
      return {
        status: 'PERLU CEK MANUAL: tombol Edit belum muncul setelah Revoke',
        detail: `Revoke diklik, tetapi tombol Edit ditemukan ${nEdit} | ${detailValidasi}`,
        konfirmasiAwal: konfAwal,
        konfirmasiAkhir: konfAwal,
        identitas: teksIdn,
      };
  }

  // 11) Klik Edit (semua pencatatan dilakukan di halaman /edit)
  await limiter.tunggu('filter');
  await jalankanDiTab('klikEdit', { css: CONFIG.EDIT_CSS, ms: 10000 });
  if (!(await tungguUrl((p) => /(?:^|\/)edit(?:\/|$)/.test(p), 10000)))
    return {
      status: 'GAGAL: halaman /edit tidak terbuka',
      detail: detailValidasi,
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: konfAwal,
      identitas: teksIdn,
    };

  // 11) Blok P di /edit → baca no_kk
  await limiter.tunggu('filter');
  const rBlokP = (
    await jalankanDiTab('bukaBlok', {
      blok: blokP.sidebar.blok,
      fieldVarIds: ['no_kk'],
    })
  ).find((x) => x && x.ada);
  if (!rBlokP || !rBlokP.ada)
    return {
      status: 'PERLU CEK MANUAL: Blok P tidak ditemukan di halaman /edit',
      detail: detailValidasi,
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: konfAwal,
      identitas: teksIdn,
    };
  if (!rBlokP.ok || !rBlokP.formMuncul)
    return {
      status: 'PERLU CEK MANUAL: field no_kk belum tampil di Blok P',
      detail: (rBlokP.pesan || 'form no_kk tidak muncul') + ' | ' + detailValidasi,
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: konfAwal,
      identitas: teksIdn,
    };
  await new Promise((r) => setTimeout(r, 500));

  const rNoKK2 = (await jalankanDiTab('bacaIdentitas', { varId: ['no_kk'] })).find((x) => x.utama);
  const noKKH2 = String((rNoKK2 && rNoKK2.nilai && rNoKK2.nilai.no_kk) || '').trim();

  // [UBAH] Helper: jalankan catatan + kirim pembaruan sesuai config.
  const jalankanCatatKirim = async (kodeCatatan) => {
    const cfg = blokP.catatanKK;
    if (!cfg || !cfg.aktif) return { catatTxt: '', kirimTxt: '', catatan: '', dilewati: false, gagalKirim: false };

    const catat = await catatKK(kodeCatatan, cfg);
    const catatTxt = teksCatatan(catat);
    const catatan = catat && catat.teks ? String(catat.teks) : '';

    // [BARU] Catatan sudah ada di riwayat → jangan kirim ulang assignment yang sama.
    if (catat && catat.dilewati) {
      return { catatTxt, kirimTxt: '; Kirim dilewati (assignment sudah dicatat sebelumnya)', catatan, dilewati: true, gagalKirim: false };
    }

    let kirim = null;
    try {
      const langkahAkhir = CONFIG.LANGKAH_AKHIR || {};
      kirim = (
        await jalankanDiTab('akhirCatatan', {
          ...langkahAkhir,
          klikKirim: true,
          tahanDialog: !cfg.kirimPembaruan,
          konfirmasiKirim: !!cfg.kirimPembaruan,
          tungguBerhasilMs: CONFIG.TUNGGU_DIALOG_BERHASIL_MS,
        })
      ).find((x) => x && x.ok !== undefined);
    } catch (e) {
      kirim = { ok: false, pesan: 'error: ' + (e && e.message) };
    }

    // [UBAH] Baca status dari properti yang benar (sebelumnya kirim.dikonfirmasi → selalu undefined).
    const terkirim = !!(kirim && kirim.ok && (kirim.dikirim || (kirim.dialog && kirim.dialog.dikonfirmasi)));
    let kirimTxt = '';
    if (!kirim) kirimTxt = '; kirim GAGAL: tidak ada hasil dari halaman';
    else if (!kirim.ok) kirimTxt = `; kirim GAGAL: ${kirim.pesan}`;
    else if (terkirim) kirimTxt = '; pembaruan DIKIRIM';
    else if (kirim.dialog && kirim.dialog.ditahan) kirimTxt = '; dialog Kirim dibuka (belum dikirim)';
    else if (kirim.dialog && kirim.dialog.dibatalkan) kirimTxt = '; pembaruan dibatalkan (dry-run)';
    else kirimTxt = '; status kirim tidak jelas';

    // Pembaruan diminta dikirim (kirimPembaruan: true) tetapi tidak terkirim → harus ditandai.
    const gagalKirim = !!cfg.kirimPembaruan && !terkirim;
    return { catatTxt, kirimTxt, catatan, dilewati: false, gagalKirim, hentikanProses: !!(kirim && kirim.hentikanProses) };
  };

  // 12a) [UBAH] Tidak perlu mengisi no_kk: data Excel tidak lengkap (→ #DC_00) ATAU no_kk sudah sama (→ #DC_03).
  if (!dataKKLengkap || noKKH2 === kkUsul) {
    const { catatTxt, kirimTxt, catatan, dilewati, gagalKirim, hentikanProses } = await jalankanCatatKirim(kodeCatatan);
    const sesuai = !!kkUsul && noKKH2 === kkUsul;
    return {
      status: gagalKirim
        ? 'PERLU CEK MANUAL: pembaruan tidak terkirim'
        : dilewati
          ? 'SUDAH DICATAT: catatan sebelumnya masih berlaku'
          : !dataKKLengkap
            ? 'TIDAK DIUBAH: data Excel tidak lengkap, hanya catatan'
            : 'VALIDASI OK: no_kk di /edit sudah sesuai',
      detail: `no_kk="${noKKH2}"${!dataKKLengkap ? ' (data Excel tidak lengkap, no_kk tidak diubah)' : ''}${catatTxt}${kirimTxt} | ${detailValidasi}`,
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: gagalKirim ? konfAwal : sesuai ? '2. Sudah diperbaiki' : '3. Tidak diperbaiki',
      identitas: teksIdn,
      catatan,
      hentikanProses,
    };
  }

  // 12b) Isi no_kk dengan KK usul
  const fieldNoKK = blokP.fields['Nomor KK'];
  const g = gabung(
    await jalankanDiTab('isi', {
      fields: { 'Nomor KK': fieldNoKK },
      nilai: { 'Nomor KK': kkUsul },
      // Catatan KK dijalankan sesudah input melalui `catatanKK`.
      catatan: { aktif: false },
    }),
  );
  const hasil = g['Nomor KK'];

  if (!hasil || !hasil.diisi) {
    return {
      status: 'GAGAL: no_kk tidak bisa diisi',
      detail: (hasil ? hasil.alasan || '' : 'field tidak ketemu') + ' | ' + detailValidasi,
      konfirmasiAwal: konfAwal,
      konfirmasiAkhir: konfAwal,
      identitas: teksIdn,
    };
  }

  // 13) Catatan #DC_03 (data lengkap dan no_kk berhasil diisi) + kirim pembaruan
  // [UBAH] kodeCatatan sudah ada dari 7.2 = '#DC_03' karena data lengkap
  const { catatTxt, kirimTxt, catatan, gagalKirim, hentikanProses } = await jalankanCatatKirim(kodeCatatan);

  return {
    status: gagalKirim ? 'PERLU CEK MANUAL: no_kk sudah diisi tetapi pembaruan tidak terkirim' : 'DIISI: no_kk diperbarui',
    detail: `"${hasil.lama}" → "${kkUsul}"${catatTxt}${kirimTxt} | ${detailValidasi}`,
    konfirmasiAwal: konfAwal,
    konfirmasiAkhir: gagalKirim ? konfAwal : '2. Sudah diperbaiki',
    identitas: teksIdn,
    catatan,
    hentikanProses,
  };
}

async function mulai() {
  if (workTabId === null) return log('Buka jendela kerja dan login dulu.');
  const modeId = $('mode').value;
  const mode = MODES[modeId];
  if (!mode) return log('Mode tidak dikenal: ' + modeId);

  const aksi = mode.aksi;
  const blok = mode.blok ? BLOKS[mode.blok] : null;

  // Mode KBLI: peta kolom lama/baru/catatan dari panel.
  let petaKBLI = null;
  if (aksi === 'kbli') {
    petaKBLI = { namaUsaha: $('kolomUsaha').value };
    document.querySelectorAll('#kolomUpdate select[data-kbli]').forEach((sel) => {
      petaKBLI[sel.dataset.kbli] = sel.value;
    });
    const kurang = ['lama', 'baru', 'catatan'].filter((k) => !petaKBLI[k]);
    if (kurang.length) return log('Kolom KBLI belum dipilih: ' + kurang.join(', '));
  }

  // Mode KK: 5 kolom khusus dari #kolomUpdate select[data-kk]
  let petaKK = null;
  if (aksi === 'kk' || aksi === 'kk-validasi') {
    petaKK = {};
    document.querySelectorAll('#kolomUpdate select[data-kk]').forEach((sel) => {
      petaKK[sel.dataset.kk] = sel.value;
    });
    const wajib = aksi === 'kk'
      ? ['no_kk_awal', 'konfirmasi', 'kk_usul', 'nik_usul', 'nama_nik']
      : ['kk_usul', 'nik_usul', 'nama_nik', 'catatan_akhir'];
    const kurang = wajib.filter((k) => !petaKK[k]);
    if (kurang.length) return log('Kolom belum dipilih: ' + kurang.join(', '));
  }
  if (mode.blok && !blok) return log(`Blok "${mode.blok}" tidak ada di config.`);

  const kolomLink = $('kolomLink').value;
  const pakaiUpdateFlag = $('pakaiUpdateFlag').checked;
  const kolomUpdateFlag = $('kolomUpdateFlag').value;
  if (pakaiUpdateFlag && !kolomUpdateFlag) return log('Aktifkan update_flag: pilih kolom update_flag terlebih dahulu.');
  const kolomUsaha = $('kolomUsaha').value;
  const longgar = $('kecocokan').value === 'longgar';
  const pilih = [...document.querySelectorAll('#kolomUpdate input:checked')].map((c) => c.value);

  // [BARU] Mode flag: kolom flag per field + kolom catatan dari dropdown panel.
  const flagCfg = blok && blok.flag ? blok.flag : null;
  const petaFlag = {};
  const petaRemark = {};
  let kolomCatatan = '';
  const petaCatatan = {};
  if (flagCfg) {
    document.querySelectorAll('#kolomUpdate select[data-flag]').forEach((sel) => {
      petaFlag[sel.dataset.flag] = sel.value;
    });
    document.querySelectorAll('#kolomUpdate select[data-remark]').forEach((sel) => {
      petaRemark[sel.dataset.remark] = sel.value;
    });
    const selCat = document.querySelector('#kolomUpdate select[data-catatan]');
    kolomCatatan = selCat ? selCat.value : '';
    document.querySelectorAll('#kolomUpdate select[data-catatan-field]').forEach((sel) => {
      petaCatatan[sel.dataset.catatanField] = sel.value;
    });
  }

  if (!rows.length || !kolomLink) return log('Pilih file Excel dan kolom link dulu.');

  const butuhItem = !!(blok && blok.sidebar.item);
  if (aksi !== 'review' && butuhItem && !kolomUsaha) return log('Mode ini butuh kolom nama item (mis. nama usaha) di Excel.');

  const petaKolom = {};
  document.querySelectorAll('#kolomUpdate select[data-k]').forEach((sel) => {
    petaKolom[sel.dataset.k] = sel.value;
  });

  if (flagCfg) {
    const petaPengendali = flagCfg.remarkPerField ? petaRemark : petaFlag;
    const kelola = flagCfg.tanpaFlag ? Object.keys(blok.fields) : Object.keys(blok.fields).filter((k) => petaPengendali[k]);
    if (!kelola.length) return log('Pilih minimal satu kolom flag.');
    const tanpaNilai = kelola.filter((k) => !petaKolom[k]);
    if (tanpaNilai.length) return log('Pilih kolom nilai untuk: ' + tanpaNilai.join(', '));
    if (flagCfg.catatanPerField && !flagCfg.catatanTetapPerFlag) {
      const kurangCatatan = Object.keys(blok.fields).filter((k) => !petaCatatan[k]);
      if (flagCfg.catatanWajib !== false && kurangCatatan.length) return log('Pilih kolom catatan untuk: ' + kurangCatatan.join(', '));
    } else if (flagCfg.catatanWajib !== false && !kolomCatatan) return log('Pilih kolom catatan.');
    log(flagCfg.kirimPembaruan ? 'PERINGATAN: mode ini MENGIRIM perubahan (kirimPembaruan: true).' : 'Mode flag berjalan dry-run (tidak mengirim perubahan).');
    if (flagCfg.simpanCatatan) log('PERINGATAN: catatan akan DISIMPAN (simpanCatatan: true).');
  } else {
    if ((aksi === 'cek' || aksi === 'isi') && !pilih.length) return log('Centang minimal satu field untuk dicek/diisi.');
    if (aksi === 'isi' && pilih.some((k) => !petaKolom[k])) return log('Pilih kolom Excel untuk setiap field yang dicentang.');
  }

  stopFlag = false;
  hasil = [];
  const limiter = buatLimiter(RATE_LIMIT_PROFILES[$('profil').value]);
  const mulaiBaris = Math.max(2, parseInt($('mulaiBaris').value, 10) || 2);
  const mulaiIndex = mulaiBaris - 2;
  const batas = Math.max(1, parseInt($('batas').value, 10) || rows.length);
  if (mulaiIndex >= rows.length) return log(`Baris mulai ${mulaiBaris} berada di luar data.`);
  const target = rows.slice(mulaiIndex, mulaiIndex + batas);

  // [BARU] Mode KK: satu link dengan kk_usul berbeda antar baris = kemungkinan salah data Excel.
  const linkKonflik = new Set();
  if (aksi === 'kk' || aksi === 'kk-validasi') {
    const kkPerLink = new Map();
    for (const b of rows) {
      const l = String(b[kolomLink] || '').trim();
      const kk = String(b[petaKK.kk_usul] ?? '').trim();
      if (!l || !kk) continue;
      if (!kkPerLink.has(l)) kkPerLink.set(l, new Set());
      kkPerLink.get(l).add(kk);
    }
    for (const [l, s] of kkPerLink) if (s.size > 1) linkKonflik.add(l);
    if (linkKonflik.size) log(`PERINGATAN: ${linkKonflik.size} link punya kk_usul berbeda antar baris Excel; baris itu akan ditandai PERLU CEK MANUAL.`);
  }
  const linkTerlihat = new Map(); // [BARU] link → nomor baris Excel terakhir yang memprosesnya

  setBusy(true);
  let jumlahBerhasil = 0;
  let jumlahGagal = 0;
  perbaruiPanelProgres('Menyiapkan…', 0, 0);
  log(`Mulai: ${target.length} baris dari Excel baris ${mulaiBaris}, mode ${modeId}, profil ${$('profil').value}.`);
  if (pakaiUpdateFlag) log(`Filter update_flag aktif dari kolom '${kolomUpdateFlag}' (0 = lewati, 1 = proses).`);
  try {
    await buka(`https://${CONFIG.HOST}${CONFIG.START_PATH}`, limiter).catch((e) => {
      if (!(e instanceof SesiHabis)) throw e;
    });
    if (await butuhLogin(true)) await tungguLogin();

    for (let i = 0; i < target.length; i++) {
      if (stopFlag) {
        log('Dihentikan.');
        break;
      }
      const baris = target[i];
      const barisExcel = mulaiIndex + i + 2;
      perbaruiPanelProgres(`${barisExcel} (${i + 1}/${target.length})`, jumlahBerhasil, jumlahGagal);
      const link = String(baris[kolomLink] || '').trim();
      let r;
      try {
        if (pakaiUpdateFlag) {
          const nilaiFlag = String(baris[kolomUpdateFlag] ?? '').trim().replace(/\.0+$/, '');
          if (nilaiFlag === '0') r = { status: 'DILEWATI: update_flag = 0' };
          else if (nilaiFlag !== '1') r = { status: `PERLU CEK MANUAL: update_flag harus 0 atau 1 (nilai: ${nilaiFlag || 'kosong'})` };
        }
        if (r) {
          // Baris sudah ditangani oleh filter update_flag.
        } else if (!/^https:\/\//.test(link) || new URL(link).host !== CONFIG.HOST) {
          r = { status: 'DILEWATI: link kosong atau host tidak cocok' };
          // [BARU] cabang konflik
        } else if ((aksi === 'kk' || aksi === 'kk-validasi') && linkKonflik.has(link)) {
          r = { status: 'PERLU CEK MANUAL: link yang sama punya kk_usul berbeda antar baris Excel' };
        } else if (aksi === 'kbli') {
          r = await denganSesi(() => alurKBLI(baris, link, petaKBLI, limiter));
        } else if (aksi === 'kk') {
          r = await denganSesi(() => alurKK(baris, link, petaKK, limiter));
        } else if (aksi === 'kk-validasi') {
          r = await denganSesi(() => alurKKValidasi(baris, link, petaKK, limiter));
        } else {
          // [BARU] field target dan catatan per baris (mode flag)
          let pilihBaris = pilih;
          let masalahFlag = [];
          if (flagCfg) {
            const pf = pilihDariFlag(baris, blok, petaKolom, petaFlag, petaCatatan, petaRemark);
            pilihBaris = pf.pilih;
            masalahFlag = pf.masalah;
            var flagNilaiBaris = pf.flagNilai;
          }
          r = await denganSesi(() =>
            alurBaris(baris, link, aksi, pilihBaris, limiter, {
              namaUsaha: String(baris[kolomUsaha] || ''),
              longgar,
              petaKolom,
              debug: $('debug').checked,
              blok,
              masalahFlag,
              flagNilai: flagNilaiBaris || {},
              teksCatatan: flagCfg && flagCfg.catatanPerField
                ? Object.fromEntries(Object.entries(petaCatatan).map(([k, kol]) => [k, String(baris[kol] == null ? '' : baris[kol]).trim()]))
                : flagCfg ? String(baris[kolomCatatan] == null ? '' : baris[kolomCatatan]).trim() : '',
              barisExcel,
            }),
          );
        }
      } catch (e) {
        if (e instanceof Berhenti) {
          log(e.message);
          break;
        }
        r = { status: 'GAGAL: ' + String(e.message).split('\n')[0].slice(0, 200) };
      }

      // [BARU] Info audit: assignment ini sudah pernah diproses baris lain di sesi ini.
      const barisSebelumnya = linkTerlihat.get(link);
      if (barisSebelumnya) r.detail = (r.detail ? r.detail + ' | ' : '') + `link sama dengan baris Excel ${barisSebelumnya}`;
      if (link) linkTerlihat.set(link, barisExcel);

      const namaUsaha = (r && r.namaUsaha) || (kolomUsaha ? String(baris[kolomUsaha] || '').trim() : ((aksi === 'kk' || aksi === 'kk-validasi') && petaKK && petaKK.nama_nik ? String(baris[petaKK.nama_nik] || '').trim() : ''));

      hasil.push({
        baris_excel: barisExcel,
        link,
        nama_usaha: namaUsaha,
        mode: modeId,
        kode: r.kode || '',
        status: r.status,
        detail: r.detail || '',
        perubahan: r.perubahan || '', // [BARU]
        catatan: r.catatan || '',
        identitas: r.identitas || '',
        total_pendapatan: r.kalk ? r.kalk.totalPendapatan : '',
        total_pengeluaran: r.kalk ? r.kalk.totalPengeluaran : '',
        selisih: r.kalk ? r.kalk.selisih : '',
        konfirmasi_awal: r.konfirmasiAwal || '',
        konfirmasi_akhir: r.konfirmasiAkhir || '',
        waktu: new Date().toLocaleString('id-ID'),
      });

      const statusBaris = String(r.status || '');
      if (/^(GAGAL|CEK GAGAL|PERLU CEK MANUAL|DIBATASI)/i.test(statusBaris)) jumlahGagal++;
      else if (!/^DILEWATI:/i.test(statusBaris)) jumlahBerhasil++;
      perbaruiPanelProgres(`${barisExcel} (${i + 1}/${target.length})`, jumlahBerhasil, jumlahGagal);

      const tagUsaha = namaUsaha ? `[${namaUsaha}] ` : '';
      log(`[${i + 1}/${target.length}] ${tagUsaha}${r.status}${r.detail ? ' — ' + r.detail : ''}`);
      if (r.identitas) log(`   ↳ ${r.identitas}`);
      if (r.perubahan) log(`   ✎ perubahan: ${r.perubahan}`); // [BARU]
      if (r.konfirmasiAwal || r.konfirmasiAkhir) {
        log(`   ✓ konfirmasi: "${r.konfirmasiAwal || '-'}" → "${r.konfirmasiAkhir || '-'}"`);
      }
      if (r.kalk) {
        log(`   ⇢ pendapatan ${r.kalk.totalPendapatan} - pengeluaran ${r.kalk.totalPengeluaran} = ${r.kalk.selisih}${r.kalk.minus ? ' (MINUS)' : ''}`);
      }
      if (r.hentikanProses) {
        log('Proses dihentikan pada baris ini karena alur pengiriman belum selesai dengan aman. Baris berikutnya tidak dijalankan.');
        stopFlag = true;
        break;
      }
      if (r.akhir) {
        if (!r.akhir.ok) {
          log(`   ⤷ akhir GAGAL: ${r.akhir.pesan}`);
        } else {
          const a = r.akhir;
          const lokasi = a.dari ? ` [${a.dari}]` : '';
          let pesan;
          if (a.dialog && a.dialog.kartu && a.dialog.kartu.length) {
            const kartuStr = a.dialog.kartu.map((k) => `${k.label}=${k.jumlah}`).join(' ');
            if (a.dialog.ditahan) {
              pesan = `DIALOG DITAHAN TERBUKA${lokasi} (${a.dialog.deskripsi || '?'} | ${kartuStr})`;
            } else if (a.dialog.dikonfirmasi) {
              pesan = `DIKONFIRMASI lewat dialog${lokasi} (${a.dialog.deskripsi || '?'} | ${kartuStr})`;
            } else {
              pesan = `dialog dibatalkan${lokasi} (${a.dialog.deskripsi || '?'} | ${kartuStr})`;
            }
          } else if (a.dikirim) {
            pesan = `DIKIRIM tanpa dialog${lokasi}`;
          } else if (a.dari) {
            pesan = `terdeteksi${lokasi} (tidak diklik)`;
          } else {
            pesan = 'TIDAK ditemukan';
          }
          log(`   ⤷ akhir: switch anomali ${a.sebelum ? 'sudah aktif' : a.diubah ? 'diaktifkan' : 'GAGAL diaktifkan'}, tombol Kirim ${pesan}`);
        }
      }

      // Jeda antar baris — DI LUAR if (r.akhir), jalan untuk semua jenis hasil.
      // Hormati stopFlag; jitter hanya MENAMBAH.
      const jedaDasar = Number(CONFIG.JEDA_ANTAR_BARIS_S) || 0;
      const dilewati = String(r.status || '').startsWith('DILEWATI:');
      if (!dilewati && jedaDasar > 0 && i < target.length - 1 && !stopFlag) {
        const jeda = jedaDasar + Math.random() * jedaDasar;
        log(`   ⋯ jeda ${jeda.toFixed(1)} detik sebelum baris berikutnya`);
        await tidur(jeda);
      }
    }
  } catch (e) {
    log('Berhenti: ' + e.message);
  } finally {
    setBusy(false);
    perbaruiPanelProgres('Selesai', jumlahBerhasil, jumlahGagal);
    log("Selesai. Gunakan 'Unduh log' untuk menyimpan hasil.");
  }
}
