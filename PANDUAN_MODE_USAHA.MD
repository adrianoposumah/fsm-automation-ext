# Panduan Perubahan: Mode Baru "Isi Usaha per Flag" (Blok II, kolom custom)

Dokumen ini ditujukan untuk agent editor. Terapkan perubahan **sesuai urutan** di bagian "Urutan pengerjaan".
Gaya kode: `'use strict'`, 2 spasi, kutip tunggal, penamaan Indonesia (ikuti kode yang ada).
Nomor baris mengacu ke file **sebelum** diubah dan hanya petunjuk; cari berdasarkan potongan kode.

Legenda: `// [BARU]` kode ditambahkan, `// [UBAH]` kode lama diganti.

> Prasyarat (opsional tetapi disarankan bila `kirimPembaruan: true` akan dipakai):
> terapkan lebih dulu bagian **6.4** di `PANDUAN_PERUBAHAN_catatan_kk.md` (guard tombol Kirim di `ops.js › akhirCatatan`).
> Panduan ini tidak bergantung pada bagian lain panduan itu; perubahan `mulai()` di kedua panduan berada di bagian berbeda.

---

## 1. Tujuan dan aturan bisnis

Mode baru untuk Blok II (usaha) dengan kolom Excel custom. Kolom yang disediakan:

```
biaya_produksi | biaya_produksi_flag | biaya_pembelian | biaya_operasional |
biaya_non_operasional | biaya_non_operasional_flag | total_pengeluaran |
pendapatan_barang_jasa | pendapatan_barang_jas_flag | pendapatan_lainnya | pendapatan_lainnya_flag
```

Aturan:

1. Hanya kolom yang punya pasangan `*_flag` yang diinput, dan **hanya jika flag bernilai `1`**.
2. Pemetaan ke field halaman (id kontainer di halaman memakai akhiran `#1`):

| Nama di panel          | Kolom nilai              | Kolom flag                                                                         | varId (awalan id)  |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------- | ------------------ |
| Biaya Produksi         | `biaya_produksi`         | `biaya_produksi_flag`                                                              | `biaya_produksi`   |
| Biaya Non Operasional  | `biaya_non_operasional`  | `biaya_non_operasional_flag`                                                       | `non_operasional`  |
| Pendapatan Barang Jasa | `pendapatan_barang_jasa` | `pendapatan_barang_jas_flag` (di Excel tertulis `jas`; kode juga mengenali `jasa`) | `nilai_pendapatan` |
| Pendapatan Lainnya     | `pendapatan_lainnya`     | `pendapatan_lainnya_flag`                                                          | `pendapatan_lain`  |

3. Setiap field yang menjadi target (flag = 1) **meninggalkan catatan**. Teks catatan diambil dari satu kolom Excel yang dipilih
   di panel (dropdown "Kolom catatan"). Teks yang sama dipakai untuk setiap field target di baris itu.
4. Kolom `biaya_pembelian`, `biaya_operasional`, `total_pengeluaran` **tidak diinput** dan tidak dipakai mode ini.
   Perhitungan skip-minus yang sudah ada tetap membaca nilai tersebut dari halaman.
5. Pengaman (keputusan perancangan, bukan permintaan eksplisit; semuanya bisa diubah lewat `config.js`):
   - Baris tanpa flag = 1 → `DILEWATI`, halaman tidak dibuka.
   - Flag = 1 tetapi nilai kosong, atau kolom catatan kosong → seluruh baris `DILEWATI` (tidak ada pembaruan sebagian).
   - Ada field target yang tidak ketemu / tersembunyi / ambigu / terkunci → `PERLU CEK MANUAL`, tidak ada yang diisi.
   - Selisih pendapatan − pengeluaran minus (kalkulasi yang sudah ada, memakai nilai baru dari Excel) → `DILEWATI`.
   - Catatan hanya ditulis untuk field yang benar-benar terisi. Bila nilai halaman sudah sama dengan Excel, tidak ada catatan (`catatanJikaSama: false`).
   - Bila ada field gagal diisi → Kirim **tidak** dijalankan. Bila semua field target sudah sama → Kirim tidak dijalankan (`SUDAH SESUAI`), sehingga run ulang file aman.
   - **Default dry-run**: `simpanCatatan: false` dan `kirimPembaruan: false`. Untuk menyimpan sungguhan, ubah keduanya menjadi `true`.

## 2. Ringkasan file

| File        | Perubahan                                                                        |
| ----------- | -------------------------------------------------------------------------------- |
| `config.js` | [BARU] entri `BLOKS['blok2-usaha-flag']`, [BARU] entri `MODES['isi-usaha-flag']` |
| `panel.js`  | [BARU] cabang `blok.flag` di `renderKolomUpdate`                                 |
| `ops.js`    | [UBAH] syarat penulisan catatan di `cekAtauIsi`                                  |
| `engine.js` | [BARU] `flagAktif`, `pilihDariFlag`; [UBAH] `alurBaris`; [UBAH] `mulai()`        |

**Jangan ubah:** `state.js`, `util.js`, `tabs.js`, `excel.js`, `rate-limiter.js`, `app.js`.
Mode lama (`isi-usaha`, `cek-usaha`, `usaha`, `review`, `kk-update`) tidak boleh berubah perilakunya.

## 3. Urutan pengerjaan

1. `config.js` → 2. `ops.js` → 3. `engine.js` → 4. `panel.js` → 5. pengujian (bagian 8).

---

## 4. `config.js`

### 4.1 [BARU] tambah entri di `BLOKS`

Lokasi: di dalam objek `BLOKS`, setelah entri `'blok2-usaha'` (sebelum `'blok1-keluarga'`).

```js
  // [BARU] Blok II per flag: nilai hanya diinput bila kolom flag-nya = 1.
  'blok2-usaha-flag': {
    judul: 'Update Usaha per Flag (Blok II)',
    sidebar: {
      blok: 'SE2026 - L BLOK II',
      grup: 'Keterangan Usaha/Perusahaan',
      item: {
        kolomExcel: 'nama_usaha',
        cocok: 'ketat',
        wajibTepat: 1,
      },
    },
    identitas: {
      varId: 'nama_komersial',
      label: 'Nama komersial',
    },
    // kolom   = tebakan awal kolom NILAI di Excel (huruf kecil)
    // flagKolom = tebakan awal kolom FLAG di Excel (huruf kecil)
    // label tidak diisi untuk 3 field di bawah karena teks aslinya di halaman belum diketahui
    // (label opsional; bila diisi, harus ada di teks kontainer field). Isi setelah diverifikasi di halaman.
    fields: {
      'Biaya Produksi': {
        varId: 'biaya_produksi',
        label: 'Biaya produksi',
        tipe: 'angka',
        kolom: ['biaya_produksi'],
        flagKolom: ['biaya_produksi_flag'],
      },
      'Biaya Non Operasional': {
        varId: 'non_operasional',
        tipe: 'angka',
        kolom: ['biaya_non_operasional'],
        flagKolom: ['biaya_non_operasional_flag'],
      },
      'Pendapatan Barang Jasa': {
        varId: 'nilai_pendapatan',
        tipe: 'angka',
        kolom: ['pendapatan_barang_jasa'],
        flagKolom: ['pendapatan_barang_jasa_flag', 'pendapatan_barang_jas_flag'],
      },
      'Pendapatan Lainnya': {
        varId: 'pendapatan_lain',
        tipe: 'angka',
        kolom: ['pendapatan_lainnya'],
        flagKolom: ['pendapatan_lainnya_flag'],
      },
    },
    kalkulasiSkip: true, // ikut perhitungan pendapatan - pengeluaran (CONFIG.KALKULASI_SKIP)
    // Penanda mode flag + pengaturannya.
    flag: {
      nilaiAktif: ['1'], // nilai sel flag yang dianggap aktif (angka 1.0 juga dikenali)
      catatanKolom: ['catatan'], // tebakan awal dropdown "Kolom catatan"
      catatanWajib: true, // true = baris dilewati bila teks catatan kosong
      catatanJikaSama: false, // true = tetap menulis catatan walau nilai halaman sudah sama
      simpanCatatan: false, // true = klik "Simpan" di dialog Catatan (MENYIMPAN catatan)
      kirimPembaruan: false, // true = klik "Kirim" lalu "Konfirmasi" (MENYIMPAN perubahan)
    },
  },
```

### 4.2 [BARU] tambah entri di `MODES`

```js
  'isi-usaha-flag': {
    judul: 'Isi usaha per flag — Blok II (kolom custom)',
    aksi: 'isi',
    blok: 'blok2-usaha-flag',
  },
```

---

## 5. `ops.js`

### 5.1 [UBAH] `cekAtauIsi`: syarat penulisan catatan

Lokasi: bagian "catatan dry-run: hanya kalau mode isi dan ada konfigurasi" (sekitar baris 901).
Mode lama tidak mengirim `hanyaJikaBerhasil`, sehingga perilakunya tidak berubah.

```js
      // SEBELUM
      if (a.catatan && a.catatan.aktif && a.catatan.teks) {
        try {
          out[k].catatan = await bukaDialogCatatan(el, sp.varId, a.catatan.teks, !!a.catatan.simpan);

      // SESUDAH  [UBAH]
      // [BARU] hanyaJikaBerhasil: catatan hanya untuk field yang benar-benar terisi
      // (atau sudah sama bila jikaSama true). Tanpa flag ini perilaku lama dipertahankan.
      const bolehCatatan = !a.catatan || !a.catatan.hanyaJikaBerhasil || out[k].diisi || (out[k].sama && a.catatan.jikaSama);
      if (a.catatan && a.catatan.aktif && a.catatan.teks && bolehCatatan) {
        try {
          out[k].catatan = await bukaDialogCatatan(el, sp.varId, a.catatan.teks, !!a.catatan.simpan);
```

(Bagian `catch` dan penutup blok tidak berubah.)

---

## 6. `engine.js`

### 6.1 [BARU] helper `flagAktif` dan `pilihDariFlag`

Lokasi: top-level, tepat di bawah `const jumlahDari = ...` (baris 12).

```js
// [BARU] Apakah nilai sel flag dianggap aktif? ('1', 1, '1.0' → true).
function flagAktif(v, cfgFlag) {
  const t = String(v == null ? '' : v).trim();
  if (t === '') return false;
  const aktif = (cfgFlag && cfgFlag.nilaiAktif) || ['1'];
  return aktif.includes(t) || aktif.includes(String(Number(t)));
}

// [BARU] Tentukan field target satu baris: flag aktif. Field dengan flag aktif tetapi nilai kosong
// dicatat sebagai masalah (seluruh baris akan dilewati, tidak ada pembaruan sebagian).
function pilihDariFlag(baris, blok, petaKolom, petaFlag) {
  const pilih = [];
  const masalah = [];
  for (const k of Object.keys(blok.fields)) {
    if (!petaFlag[k]) continue; // kolom flag tidak dipilih → field tidak dikelola
    if (!flagAktif(baris[petaFlag[k]], blok.flag)) continue;
    const mentah = petaKolom[k] ? baris[petaKolom[k]] : '';
    if (String(mentah == null ? '' : mentah).trim() === '') {
      masalah.push(`${k}: flag aktif tetapi nilai kosong`);
      continue;
    }
    pilih.push(k);
  }
  return { pilih, masalah };
}
```

### 6.2 [UBAH] `alurBaris`

**a) Validasi awal**: sisipkan tepat setelah `if (!blok) return { status: 'PERLU CEK MANUAL: blok tidak dikenal' };` dan **sebelum** `await limiter.tunggu('filter');` (baris ~17).
Halaman tidak dibuka bila baris tidak memenuhi syarat.

```js
// [BARU] Mode flag: validasi data baris sebelum membuka halaman.
if (mode === 'isi' && blok.flag) {
  const masalah = opsi.masalahFlag || [];
  if (masalah.length) return { status: 'DILEWATI: ' + masalah.join('; ') };
  if (!pilih.length) return { status: 'DILEWATI: tidak ada flag bernilai 1' };
  if (blok.flag.catatanWajib !== false && !opsi.teksCatatan) return { status: 'DILEWATI: kolom catatan kosong untuk baris ini' };
}
```

**b) `bermasalah`**: field terkunci juga dianggap masalah di mode flag (baris ~152).

```js
// SEBELUM
const bermasalah = pilih.filter((k) => !g[k] || !g[k].ketemu || g[k].ambigu || g[k].tersembunyi);
// SESUDAH  [UBAH]
const bermasalah = pilih.filter((k) => !g[k] || !g[k].ketemu || g[k].ambigu || g[k].tersembunyi || (blok.flag && g[k].terkunci));
```

**c) Pemanggilan `isi`**: catatan berasal dari kolom yang dipilih (baris ~153–161).

```js
// SEBELUM
if (mode === 'isi' && !bermasalah.length) {
  g = gabung(
    await jalankanDiTab('isi', {
      fields,
      nilai,
      catatan: CONFIG.CATATAN || { aktif: false },
    }),
  );
}

// SESUDAH  [UBAH]
if (mode === 'isi' && !bermasalah.length) {
  // [BARU] Mode flag: teks catatan dari kolom Excel terpilih; hanya untuk field yang benar-benar terisi.
  const catatanIsi = blok.flag
    ? opsi.teksCatatan
      ? { aktif: true, teks: opsi.teksCatatan, simpan: !!blok.flag.simpanCatatan, hanyaJikaBerhasil: true, jikaSama: !!blok.flag.catatanJikaSama }
      : { aktif: false }
    : CONFIG.CATATAN || { aktif: false };
  g = gabung(
    await jalankanDiTab('isi', {
      fields,
      nilai,
      catatan: catatanIsi,
    }),
  );
}

// [BARU] Mode flag: cek hasil pengisian sebelum langkah akhir.
let gagalIsi = [];
let adaPerubahan = true;
if (mode === 'isi' && blok.flag && !bermasalah.length) {
  gagalIsi = pilih.filter((k) => !(g[k] && (g[k].diisi || g[k].sama)));
  adaPerubahan = pilih.some((k) => g[k] && g[k].diisi);
}
```

**d) Langkah akhir**: jangan jalan bila ada field gagal atau tidak ada perubahan; pakai konfirmasi bila `kirimPembaruan` (baris ~164–171).

```js
  // SEBELUM
  let akhir = null;
  if (mode === 'isi' && !bermasalah.length && CONFIG.LANGKAH_AKHIR && CONFIG.LANGKAH_AKHIR.aktif) {
    try {
      akhir = (await jalankanDiTab('akhirCatatan', CONFIG.LANGKAH_AKHIR)).find((x) => x && x.ok !== undefined);

  // SESUDAH  [UBAH]
  let akhir = null;
  if (mode === 'isi' && !bermasalah.length && !gagalIsi.length && adaPerubahan && CONFIG.LANGKAH_AKHIR && CONFIG.LANGKAH_AKHIR.aktif) {
    // [BARU] kirimPembaruan: klik Kirim lalu Konfirmasi (menyimpan). Selain itu perilaku lama (dry-run).
    const langkah = blok.flag && blok.flag.kirimPembaruan ? { ...CONFIG.LANGKAH_AKHIR, tahanDialog: false, konfirmasiKirim: true } : CONFIG.LANGKAH_AKHIR;
    try {
      akhir = (await jalankanDiTab('akhirCatatan', langkah)).find((x) => x && x.ok !== undefined);
```

**e) Teks catatan di `detail`**: bedakan disimpan atau tidak (baris ~182).

```js
// SEBELUM
const catTxt = cat ? (cat.ok ? `; catatan "${cat.teks}" terisi (tidak dikirim)` : `; catatan GAGAL: ${cat.pesan || '?'}`) : '';
// SESUDAH  [UBAH]
const catTxt = cat ? (cat.ok ? `; catatan "${cat.teks}" ${cat.dikirim ? 'DISIMPAN' : 'terisi (tidak disimpan)'}` : `; catatan GAGAL: ${cat.pesan || '?'}`) : '';
```

**f) Status akhir dan detail** (baris ~190–197):

```js
// SEBELUM
let status;
if (bermasalah.length) status = `${mode === 'isi' ? 'PERLU CEK MANUAL' : 'CEK GAGAL'}: ada field tidak ketemu/tidak tampil/ambigu${mode === 'isi' ? ', tidak ada yang diisi' : ''}`;
else status = mode === 'isi' ? 'DRY-RUN: diisi, tidak disimpan' : 'CEK OK: semua field ketemu dan tampil';

// SESUDAH  [UBAH]
const terkirim = !!(akhir && akhir.ok && (akhir.dikirim || (akhir.dialog && akhir.dialog.dikonfirmasi)));
let status;
if (bermasalah.length) status = `${mode === 'isi' ? 'PERLU CEK MANUAL' : 'CEK GAGAL'}: ada field tidak ketemu/tidak tampil/ambigu${blok.flag ? '/terkunci' : ''}${mode === 'isi' ? ', tidak ada yang diisi' : ''}`;
else if (mode === 'isi' && blok.flag) {
  if (gagalIsi.length) status = `PERLU CEK MANUAL: field gagal diisi (${gagalIsi.join(', ')}); tidak dikirim`;
  else if (!adaPerubahan) status = 'SUDAH SESUAI: semua field target sudah bernilai sama; tidak dikirim';
  else if (blok.flag.kirimPembaruan) status = terkirim ? 'DIISI & DIKIRIM' : 'PERLU CEK MANUAL: field terisi tetapi pembaruan tidak terkirim';
  else status = 'DRY-RUN: diisi, tidak disimpan';
} else status = mode === 'isi' ? 'DRY-RUN: diisi, tidak disimpan' : 'CEK OK: semua field ketemu dan tampil';
```

Dan pada `return` terakhir `alurBaris`, awali `detail` dengan daftar target (baris ~197):

```js
// SEBELUM
return { status, detail, identitas: teksIdn, akhir, kalk, catatan };
// SESUDAH  [UBAH]
const detailFlag = blok.flag && mode === 'isi' ? `target (flag=1): ${pilih.join(', ')}` : '';
return { status, detail: detailFlag ? `${detailFlag} | ${detail}` : detail, identitas: teksIdn, akhir, kalk, catatan };
```

Blok kalkulasi skip-minus (baris ~116–148) **tidak diubah**: `baru` sudah dibangun dari `pilih`, jadi hanya field flag = 1 yang memakai nilai Excel.
Kunci `varId` field baru (`non_operasional`, `nilai_pendapatan`, `pendapatan_lain`) sudah sama dengan `CONFIG.KALKULASI_SKIP.varIds`.

### 6.3 [UBAH] `mulai()`

**a) Peta kolom flag dan kolom catatan**. Sisipkan setelah `const pilih = [...document.querySelectorAll('#kolomUpdate input:checked')]...` (baris 587):

```js
// [BARU] Mode flag: kolom flag per field + kolom catatan dari dropdown panel.
const flagCfg = blok && blok.flag ? blok.flag : null;
const petaFlag = {};
let kolomCatatan = '';
if (flagCfg) {
  document.querySelectorAll('#kolomUpdate select[data-flag]').forEach((sel) => {
    petaFlag[sel.dataset.flag] = sel.value;
  });
  const selCat = document.querySelector('#kolomUpdate select[data-catatan]');
  kolomCatatan = selCat ? selCat.value : '';
}
```

**b) `petaKolom` hanya dari select bernilai-kolom** (baris 594–597):

```js
  // SEBELUM
  document.querySelectorAll('#kolomUpdate select').forEach((sel) => {
  // SESUDAH  [UBAH]
  document.querySelectorAll('#kolomUpdate select[data-k]').forEach((sel) => {
```

**c) Validasi** (baris 599–600). Mode flag tidak memakai checkbox:

```js
// SEBELUM
if ((aksi === 'cek' || aksi === 'isi') && !pilih.length) return log('Centang minimal satu field untuk dicek/diisi.');
if (aksi === 'isi' && pilih.some((k) => !petaKolom[k])) return log('Pilih kolom Excel untuk setiap field yang dicentang.');

// SESUDAH  [UBAH]
if (flagCfg) {
  const kelola = Object.keys(blok.fields).filter((k) => petaFlag[k]);
  if (!kelola.length) return log('Pilih minimal satu kolom flag.');
  const tanpaNilai = kelola.filter((k) => !petaKolom[k]);
  if (tanpaNilai.length) return log('Pilih kolom nilai untuk: ' + tanpaNilai.join(', '));
  if (flagCfg.catatanWajib !== false && !kolomCatatan) return log('Pilih kolom catatan.');
  log(flagCfg.kirimPembaruan ? 'PERINGATAN: mode ini MENGIRIM perubahan (kirimPembaruan: true).' : 'Mode flag berjalan dry-run (tidak mengirim perubahan).');
  if (flagCfg.simpanCatatan) log('PERINGATAN: catatan akan DISIMPAN (simpanCatatan: true).');
} else {
  if ((aksi === 'cek' || aksi === 'isi') && !pilih.length) return log('Centang minimal satu field untuk dicek/diisi.');
  if (aksi === 'isi' && pilih.some((k) => !petaKolom[k])) return log('Pilih kolom Excel untuk setiap field yang dicentang.');
}
```

**d) Di dalam loop** (cabang `else` yang memanggil `alurBaris`, baris ~627–636):

```js
        } else {
          // [BARU] field target dan catatan per baris (mode flag)
          let pilihBaris = pilih;
          let masalahFlag = [];
          if (flagCfg) {
            const pf = pilihDariFlag(baris, blok, petaKolom, petaFlag);
            pilihBaris = pf.pilih;
            masalahFlag = pf.masalah;
          }
          r = await denganSesi(() =>
            alurBaris(baris, link, aksi, pilihBaris, limiter, {   // [UBAH] pilih → pilihBaris
              namaUsaha: String(baris[kolomUsaha] || ''),
              longgar,
              petaKolom,
              debug: $('debug').checked,
              blok,
              masalahFlag, // [BARU]
              teksCatatan: flagCfg ? String(baris[kolomCatatan] == null ? '' : baris[kolomCatatan]).trim() : '', // [BARU]
            }),
          );
        }
```

---

## 7. `panel.js`

### 7.1 [BARU] cabang `blok.flag` di `renderKolomUpdate`

Lokasi: setelah blok `if (mode.aksi === 'kk') { ... return; }` dan **sebelum** komentar `// ── Mode lain: tampilkan blok.fields seperti sebelumnya ──`.
Cabang ini berdiri sendiri (helper dibuat lokal) agar tidak bergantung pada konstanta yang dideklarasikan lebih bawah di fungsi yang sama.

```js
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
        `<select data-flag="${esc(nama)}" title="Kolom flag (diinput hanya bila = 1)">${opsiKol}</select>` +
        `<small class="pratinjau" data-info="${esc(nama)}"></small>` +
        `</div>`,
    )
    .join('');
  const barisCatatan = `<div class="field-row"><span>Kolom catatan</span><select data-catatan="1">${opsiKol}</select><small class="pratinjau" data-info="catatan"></small></div>`;
  $('kolomUpdate').innerHTML = barisField + barisCatatan;

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
      } else {
        tebakan = blok.flag.catatanKolom;
        kunci = 'catatan';
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
```

Catatan: `renderKolomUpdate` sudah dipanggil setelah Excel dimuat dan saat dropdown mode berubah, jadi tebakan kolom otomatis terisi.

---

## 8. Pengujian

Contoh baris Excel uji (kolom lain bebas): `nama_usaha`, `assignment_link`, `catatan`, serta kolom nilai/flag di atas.
Pakai satu assignment uji. Awali dengan dry-run (`simpanCatatan: false`, `kirimPembaruan: false`).

| #   | Skenario                                                                        | Hasil yang diharapkan                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Semua flag kosong / 0                                                           | `DILEWATI: tidak ada flag bernilai 1`; halaman tidak dibuka                                                                                                                                       |
| 2   | `biaya_produksi_flag=1`, nilai valid, catatan terisi                            | Biaya Produksi terisi; field lain tidak disentuh; catatan terisi (tidak disimpan); dialog Kirim ditahan; status `DRY-RUN: diisi, tidak disimpan`; detail memuat `target (flag=1): Biaya Produksi` |
| 3   | Flag = 1 tetapi nilai kosong                                                    | `DILEWATI: <field>: flag aktif tetapi nilai kosong`; halaman tidak dibuka                                                                                                                         |
| 4   | Flag = 1, kolom catatan kosong                                                  | `DILEWATI: kolom catatan kosong untuk baris ini`                                                                                                                                                  |
| 5   | Dua flag = 1                                                                    | Dua field terisi; catatan yang sama muncul di kedua field                                                                                                                                         |
| 6   | Salah satu field target tersembunyi/terkunci/ambigu                             | `PERLU CEK MANUAL`, tidak ada field yang diisi                                                                                                                                                    |
| 7   | Nilai baru membuat selisih minus                                                | `DILEWATI: pendapatan ... - pengeluaran ... (minus)`; tidak ada yang diisi                                                                                                                        |
| 8   | Nilai halaman sudah sama dengan Excel untuk semua field target                  | `SUDAH SESUAI`, tanpa catatan, tanpa Kirim                                                                                                                                                        |
| 9   | Nilai Excel bukan angka bulat (mis. `12abc`)                                    | `PERLU CEK MANUAL: field gagal diisi`, tidak ada catatan untuk field itu, tidak Kirim                                                                                                             |
| 10  | Live: `simpanCatatan: true` dan `kirimPembaruan: true` pada satu assignment uji | `DIISI & DIKIRIM`, catatan `DISIMPAN`; cocokkan dengan status sebenarnya di web                                                                                                                   |
| 11  | Regresi: jalankan mode lama `isi-usaha`                                         | Perilaku sama seperti sebelumnya (checkbox + dropdown, dry-run)                                                                                                                                   |

## 9. Risiko dan catatan

- **Label field belum diketahui** untuk `non_operasional`, `nilai_pendapatan`, `pendapatan_lain`. Tanpa `label`, pencocokan hanya lewat awalan id (`[id^="varId#"]`), yang sudah dipakai kalkulasi skip-minus. Bila ada beberapa kontainer berawalan sama, hasilnya `ambigu`. Isi `label` bila teks di halaman sudah dipastikan.
- **Catatan tersimpan lebih dulu dari Kirim.** Dengan `simpanCatatan: true`, catatan langsung tersimpan saat field diisi, sebelum langkah Kirim. Bila Kirim gagal, catatan sudah ada tanpa perubahan nilai terkirim; status baris `PERLU CEK MANUAL` menandai ini.
- **Validasi angka** dilakukan di halaman oleh fungsi `angka()` di `ops.js`; baris dengan nilai tak valid baru ketahuan setelah halaman dibuka (pengaman: tidak Kirim).
- **`total_pengeluaran`, `biaya_pembelian`, `biaya_operasional` di Excel diabaikan.** Bila ingin dibandingkan dengan nilai halaman atau dicatat di log, tambahkan sebagai kolom info seperti pola `info` di mode KK.
- **Nomor `baris_excel` di log** masih `i + 2` (mengasumsikan header di baris 1); tidak diubah di panduan ini.
