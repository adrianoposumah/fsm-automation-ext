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

async function alurBaris(baris, link, mode, pilih, limiter, opsi) {
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

  await limiter.tunggu('filter');
  const ru = (
    await jalankanDiTab('usaha', {
      blok: CONFIG.BLOK_USAHA.blok,
      grup: CONFIG.BLOK_USAHA.grup,
      nama: opsi.namaUsaha,
      longgar: opsi.longgar,
      debug: opsi.debug,
    })
  ).find((r) => r.ada);
  if (!ru && (await butuhLogin(true))) throw new SesiHabis();
  if (!ru)
    return {
      status: 'PERLU CEK MANUAL: Blok usaha di sidebar tidak ditemukan (cek BLOK_USAHA di config.js)',
    };
  if (!ru.ok) return { status: 'PERLU CEK MANUAL: ' + ru.pesan };

  // Baca identitas record yang sedang terbuka (untuk log).
  let teksIdn = '';
  if (CONFIG.IDENTITAS && CONFIG.IDENTITAS.varId) {
    const rIdn = (
      await jalankanDiTab('bacaIdentitas', {
        varId: [CONFIG.IDENTITAS.varId],
      })
    ).find((x) => x.nilai && x.nilai[CONFIG.IDENTITAS.varId] !== undefined && x.nilai[CONFIG.IDENTITAS.varId] !== null);
    const nilaiIdn = rIdn ? rIdn.nilai[CONFIG.IDENTITAS.varId] : null;
    const label = CONFIG.IDENTITAS.label;
    teksIdn = nilaiIdn ? `${label} di halaman: "${nilaiIdn}"` : `${label} di halaman: (tidak ditemukan)`;
  }

  const fields = {},
    nilai = {};
  for (const k of pilih) {
    fields[k] = CONFIG.FIELDS[k];
    nilai[k] = opsi.petaKolom[k] ? baris[opsi.petaKolom[k]] : '';
  }

  if (mode === 'usaha') {
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

  // --- Kalkulasi selisih: skip baris jika minus (hanya mode isi) ---
  let kalk = null;
  if (mode === 'isi' && CONFIG.KALKULASI_SKIP && CONFIG.KALKULASI_SKIP.aktif) {
    const cf = CONFIG.KALKULASI_SKIP;
    // Nilai baru dari Excel untuk field yang dipilih, dipetakan ke varId-nya.
    const baru = {};
    for (const k of pilih) {
      const v = CONFIG.FIELDS[k] && CONFIG.FIELDS[k].varId;
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

  // Langkah akhir opsional: buka sidebar Catatan, aktifkan switch anomali,
  // deteksi tombol Kirim. Tidak menyimpan kecuali klikKirim=true.
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
  return { status, detail, identitas: teksIdn, akhir, kalk };
}

async function mulai() {
  if (workTabId === null) return log('Buka jendela kerja dan login dulu.');
  const mode = $('mode').value;
  const kolomLink = $('kolomLink').value;
  const kolomUsaha = $('kolomUsaha').value;
  const longgar = $('kecocokan').value === 'longgar';
  const pilih = [...document.querySelectorAll('#kolomUpdate input:checked')].map((c) => c.value);
  if (!rows.length || !kolomLink) return log('Pilih file Excel dan kolom link dulu.');
  if (mode !== 'review' && !kolomUsaha) return log('Pilih kolom nama usaha dulu.');
  const petaKolom = {};
  document.querySelectorAll('#kolomUpdate select').forEach((sel) => {
    petaKolom[sel.dataset.k] = sel.value;
  });
  if ((mode === 'cek' || mode === 'isi') && !pilih.length) return log('Centang minimal satu field untuk dicek/diisi.');
  if (mode === 'isi' && pilih.some((k) => !petaKolom[k])) return log('Pilih kolom Excel untuk setiap field yang dicentang.');

  stopFlag = false;
  hasil = [];
  const limiter = buatLimiter(RATE_LIMIT_PROFILES[$('profil').value]);
  const target = rows.slice(0, Math.max(1, parseInt($('batas').value, 10) || rows.length));
  setBusy(true);
  log(`Mulai: ${target.length} baris, mode ${mode}, profil ${$('profil').value}.`);
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
        } else {
          r = await denganSesi(() =>
            alurBaris(baris, link, mode, pilih, limiter, {
              namaUsaha: String(baris[kolomUsaha] || ''),
              longgar,
              petaKolom,
              debug: $('debug').checked,
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

      hasil.push({
        baris_excel: i + 2,
        link,
        status: r.status,
        detail: r.detail || '',
        identitas: r.identitas || '',
        total_pendapatan: r.kalk ? r.kalk.totalPendapatan : '',
        total_pengeluaran: r.kalk ? r.kalk.totalPengeluaran : '',
        selisih: r.kalk ? r.kalk.selisih : '',
        waktu: new Date().toLocaleString('id-ID'),
      });

      log(`[${i + 1}/${target.length}] ${r.status}${r.detail ? ' — ' + r.detail : ''}`);
      if (r.identitas) log(`   ↳ ${r.identitas}`);
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
