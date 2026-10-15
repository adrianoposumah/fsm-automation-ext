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

async function alurBaris(baris, link, mode, pilih, limiter, opsi) {
  const blok = opsi.blok;
  if (!blok) return { status: 'PERLU CEK MANUAL: blok tidak dikenal' };

  await limiter.tunggu('filter');
  await buka(link, limiter);

  const rv = await jalankanDiTab('reviewHref', { teks: CONFIG.TEKS_REVIEW, ms: 10000 });
  const nRev = jumlahDari(rv);
  if (nRev === 0 && (await butuhLogin(true))) throw new SesiHabis();
  if (nRev !== 1) return { status: `PERLU CEK MANUAL: tombol Review ditemukan ${nRev}` };
  const href = rv.find((r) => r.jumlah === 1).href;
  if (new URL(href).host !== CONFIG.HOST) return { status: 'PERLU CEK MANUAL: link Review mengarah ke host lain' };

  await limiter.tunggu('filter');
  await buka(href, limiter);
  if (mode === 'review') {
    const nEd = jumlahDari(await jalankanDiTab('hitung', { css: CONFIG.EDIT_CSS, ms: 8000 }));
    return {
      status: 'REVIEW OK: halaman review terbuka',
      detail: `${maskPath(href)} | tombol Edit ditemukan: ${nEd}`,
    };
  }

  await limiter.tunggu('filter');
  const ke = await jalankanDiTab('klikEdit', { css: CONFIG.EDIT_CSS, ms: 10000 });
  const nEdit = jumlahDari(ke);
  if (nEdit === 0 && (await butuhLogin(true))) throw new SesiHabis();
  if (nEdit !== 1) return { status: `PERLU CEK MANUAL: tombol Edit ditemukan ${nEdit}` };
  if (!(await tungguUrl((p) => /\/edit\/?$/.test(p), 10000))) return { status: 'GAGAL: halaman /edit tidak terbuka' };

  // --- Buka blok sidebar (dengan atau tanpa pemilihan item) ---
  await limiter.tunggu('filter');
  const fieldVarIds = Object.values(blok.fields || {})
    .map((f) => f.varId)
    .filter(Boolean);

  let ru;
  if (blok.sidebar.item) {
    // Blok dengan daftar item (mis. Blok II — pilih usaha)
    ru = (
      await jalankanDiTab('usaha', {
        blok: blok.sidebar.blok,
        grup: blok.sidebar.grup,
        nama: opsi.namaUsaha,
        longgar: opsi.longgar,
        debug: opsi.debug,
        fieldVarIds,
      })
    ).find((r) => r.ada);
  } else {
    // Blok tanpa item (mis. Blok P — form langsung tampil setelah header dibuka)
    ru = (
      await jalankanDiTab('bukaBlok', {
        blok: blok.sidebar.blok,
        fieldVarIds,
      })
    ).find((r) => r.ada);
  }
  if (!ru && (await butuhLogin(true))) throw new SesiHabis();
  if (!ru)
    return {
      status: `PERLU CEK MANUAL: Blok "${blok.sidebar.blok}" tidak ditemukan di sidebar`,
    };
  if (!ru.ok) return { status: 'PERLU CEK MANUAL: ' + (ru.pesan || 'blok tidak bisa dibuka') };

  // --- Identitas record ---
  let teksIdn = '';
  if (blok.identitas && blok.identitas.varId) {
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

  // --- Cek & isi field (tetap seperti sebelumnya) ---
  let g = gabung(await jalankanDiTab('cek', { fields }));
  const bermasalah = pilih.filter((k) => !g[k] || !g[k].ketemu || g[k].ambigu || g[k].tersembunyi);
  if (mode === 'isi' && !bermasalah.length) {
    g = gabung(
      await jalankanDiTab('isi', {
        fields,
        nilai,
        catatan: CONFIG.CATATAN || { aktif: false },
      }),
    );
  }

  // --- Langkah akhir ---
  let akhir = null;
  if (mode === 'isi' && !bermasalah.length && CONFIG.LANGKAH_AKHIR && CONFIG.LANGKAH_AKHIR.aktif) {
    try {
      akhir = (await jalankanDiTab('akhirCatatan', CONFIG.LANGKAH_AKHIR)).find((x) => x && x.ok !== undefined);
    } catch (e) {
      akhir = { ok: false, pesan: 'error: ' + (e && e.message) };
    }
  }

  const ids = (v) => (v.wadah && v.wadah.length ? ` [id: ${v.wadah.join(', ')}]` : '');
  const detail = pilih
    .map((k) => {
      const v = g[k];
      if (!v || !v.ketemu) return `${k}: TIDAK ADA`;
      if (v.tersembunyi) return `${k}: ADA TAPI TIDAK TAMPIL${ids(v)}`;
      if (v.ambigu) return `${k}: AMBIGU (${v.ambigu} kandidat)${ids(v)}`;
      if (mode === 'isi' && !bermasalah.length) {
        const cat = v.catatan;
        const catTxt = cat ? (cat.ok ? `; catatan "${cat.teks}" terisi (tidak dikirim)` : `; catatan GAGAL: ${cat.pesan || '?'}`) : '';
        if (v.sama) return `${k}: sudah sama ("${v.lama}")${catTxt}`;
        return v.diisi ? `${k}: "${v.lama}" → "${String(nilai[k]).trim().slice(0, 60)}"${catTxt}` : `${k}: tidak terisi (${v.alasan || '?'}${v.lama !== undefined ? '; lama "' + v.lama + '"' : ''})${catTxt}`;
      }
      return `${k}: ketemu${ids(v)}${v.terkunci ? ' [terkunci]' : ''}`;
    })
    .join(' | ');

  let status;
  if (bermasalah.length) status = `${mode === 'isi' ? 'PERLU CEK MANUAL' : 'CEK GAGAL'}: ada field tidak ketemu/tidak tampil/ambigu${mode === 'isi' ? ', tidak ada yang diisi' : ''}`;
  else status = mode === 'isi' ? 'DRY-RUN: diisi, tidak disimpan' : 'CEK OK: semua field ketemu dan tampil';
  const catatan = pilih
    .map((k) => (g[k] && g[k].catatan && g[k].catatan.teks ? String(g[k].catatan.teks) : ''))
    .filter(Boolean)
    .join(' | ');
  return { status, detail, identitas: teksIdn, akhir, kalk, catatan };
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
  if (!(await tungguUrl((p) => /\/edit\/?$/.test(p), 10000)))
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
    return { catatTxt, kirimTxt, catatan, dilewati: false, gagalKirim };
  };

  // 12a) [UBAH] Tidak perlu mengisi no_kk: data Excel tidak lengkap (→ #DC_00) ATAU no_kk sudah sama (→ #DC_03).
  if (!dataKKLengkap || noKKH2 === kkUsul) {
    const { catatTxt, kirimTxt, catatan, dilewati, gagalKirim } = await jalankanCatatKirim(kodeCatatan);
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
  const { catatTxt, kirimTxt, catatan, gagalKirim } = await jalankanCatatKirim(kodeCatatan);

  return {
    status: gagalKirim ? 'PERLU CEK MANUAL: no_kk sudah diisi tetapi pembaruan tidak terkirim' : 'DIISI: no_kk diperbarui',
    detail: `"${hasil.lama}" → "${kkUsul}"${catatTxt}${kirimTxt} | ${detailValidasi}`,
    konfirmasiAwal: konfAwal,
    konfirmasiAkhir: gagalKirim ? konfAwal : '2. Sudah diperbaiki',
    identitas: teksIdn,
    catatan,
  };
}

async function mulai() {
  if (workTabId === null) return log('Buka jendela kerja dan login dulu.');
  const modeId = $('mode').value;
  const mode = MODES[modeId];
  if (!mode) return log('Mode tidak dikenal: ' + modeId);

  const aksi = mode.aksi;
  const blok = mode.blok ? BLOKS[mode.blok] : null;

  // Mode KK: 5 kolom khusus dari #kolomUpdate select[data-kk]
  let petaKK = null;
  if (aksi === 'kk') {
    petaKK = {};
    document.querySelectorAll('#kolomUpdate select[data-kk]').forEach((sel) => {
      petaKK[sel.dataset.kk] = sel.value;
    });
    const wajib = ['no_kk_awal', 'konfirmasi', 'kk_usul', 'nik_usul', 'nama_nik'];
    const kurang = wajib.filter((k) => !petaKK[k]);
    if (kurang.length) return log('Kolom belum dipilih: ' + kurang.join(', '));
  }
  if (mode.blok && !blok) return log(`Blok "${mode.blok}" tidak ada di config.`);

  const kolomLink = $('kolomLink').value;
  const kolomUsaha = $('kolomUsaha').value;
  const longgar = $('kecocokan').value === 'longgar';
  const pilih = [...document.querySelectorAll('#kolomUpdate input:checked')].map((c) => c.value);

  if (!rows.length || !kolomLink) return log('Pilih file Excel dan kolom link dulu.');

  const butuhItem = !!(blok && blok.sidebar.item);
  if (aksi !== 'review' && butuhItem && !kolomUsaha) return log('Mode ini butuh kolom nama item (mis. nama usaha) di Excel.');

  const petaKolom = {};
  document.querySelectorAll('#kolomUpdate select').forEach((sel) => {
    petaKolom[sel.dataset.k] = sel.value;
  });

  if ((aksi === 'cek' || aksi === 'isi') && !pilih.length) return log('Centang minimal satu field untuk dicek/diisi.');
  if (aksi === 'isi' && pilih.some((k) => !petaKolom[k])) return log('Pilih kolom Excel untuk setiap field yang dicentang.');

  stopFlag = false;
  hasil = [];
  const limiter = buatLimiter(RATE_LIMIT_PROFILES[$('profil').value]);
  const target = rows.slice(0, Math.max(1, parseInt($('batas').value, 10) || rows.length));

  // [BARU] Mode KK: satu link dengan kk_usul berbeda antar baris = kemungkinan salah data Excel.
  const linkKonflik = new Set();
  if (aksi === 'kk') {
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
  log(`Mulai: ${target.length} baris, mode ${modeId}, profil ${$('profil').value}.`);
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
      const link = String(baris[kolomLink] || '').trim();
      let r;
      try {
        if (!/^https:\/\//.test(link) || new URL(link).host !== CONFIG.HOST) {
          r = { status: 'DILEWATI: link kosong atau host tidak cocok' };
          // [BARU] cabang konflik
        } else if (aksi === 'kk' && linkKonflik.has(link)) {
          r = { status: 'PERLU CEK MANUAL: link yang sama punya kk_usul berbeda antar baris Excel' };
        } else if (aksi === 'kk') {
          r = await denganSesi(() => alurKK(baris, link, petaKK, limiter));
        } else {
          r = await denganSesi(() =>
            alurBaris(baris, link, aksi, pilih, limiter, {
              namaUsaha: String(baris[kolomUsaha] || ''),
              longgar,
              petaKolom,
              debug: $('debug').checked,
              blok,
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
      if (link) linkTerlihat.set(link, i + 2);

      hasil.push({
        baris_excel: i + 2,
        link,
        mode: modeId,
        status: r.status,
        detail: r.detail || '',
        catatan: r.catatan || '',
        identitas: r.identitas || '',
        total_pendapatan: r.kalk ? r.kalk.totalPendapatan : '',
        total_pengeluaran: r.kalk ? r.kalk.totalPengeluaran : '',
        selisih: r.kalk ? r.kalk.selisih : '',
        konfirmasi_awal: r.konfirmasiAwal || '',
        konfirmasi_akhir: r.konfirmasiAkhir || '',
        waktu: new Date().toLocaleString('id-ID'),
      });

      log(`[${i + 1}/${target.length}] ${r.status}${r.detail ? ' — ' + r.detail : ''}`);
      if (r.identitas) log(`   ↳ ${r.identitas}`);
      if (r.konfirmasiAwal || r.konfirmasiAkhir) {
        log(`   ✓ konfirmasi: "${r.konfirmasiAwal || '-'}" → "${r.konfirmasiAkhir || '-'}"`);
      }
      if (r.kalk) {
        log(`   ⇢ pendapatan ${r.kalk.totalPendapatan} - pengeluaran ${r.kalk.totalPengeluaran} = ${r.kalk.selisih}${r.kalk.minus ? ' (MINUS)' : ''}`);
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
      if (jedaDasar > 0 && i < target.length - 1 && !stopFlag) {
        const jeda = jedaDasar + Math.random() * jedaDasar;
        log(`   ⋯ jeda ${jeda.toFixed(1)} detik sebelum baris berikutnya`);
        await tidur(jeda);
      }
    }
  } catch (e) {
    log('Berhenti: ' + e.message);
  } finally {
    setBusy(false);
    log("Selesai. Gunakan 'Unduh log' untuk menyimpan hasil.");
  }
}
