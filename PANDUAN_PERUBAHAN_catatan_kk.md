# Panduan Perubahan (v2): Aturan Kode Catatan KK + Cek Riwayat Catatan + Perbaikan Alur Kirim (mode `kk-update`)

Dokumen ini ditujukan untuk agent editor. Terapkan perubahan **sesuai urutan** di bagian "Urutan pengerjaan".
Gaya kode: `'use strict'`, 2 spasi, kutip tunggal, penamaan Indonesia (ikuti kode yang ada).
Nomor baris mengacu ke file **sebelum** diubah dan hanya petunjuk; cari berdasarkan potongan kode.

Legenda penanda di dalam kode:

- `// [BARU]` = kode ditambahkan
- `// [UBAH]` = kode lama diganti
- `// [HAPUS]` = kode lama dihapus

---

## 1. Latar belakang

1. **Satu assignment dipakai beberapa baris Excel** (anggota satu keluarga punya `assignment_link` dan `no_kk` yang sama).
   Catatan di field `no_kk` bisa tertulis berurutan (`#DC_03` lalu `#DC_00`) di assignment yang sama.
   Contoh riwayat nyata: `#DC_01` (reviewer) → `#DC_03` → `#DC_00`.
2. **Aturan kode catatan belum konsisten antar jalur.** Jalur tanpa tombol Edit memilih kode berdasarkan kelengkapan data Excel,
   sedangkan jalur `/edit` memilih berdasarkan "no_kk berubah atau tidak".
3. **Bug status Kirim.** `engine.js` membaca `kirim.dikonfirmasi`, padahal `ops.js › akhirCatatan` mengembalikan `dikirim: true`
   dan `dialog.dikonfirmasi: true`. Akibatnya pembaruan yang **berhasil terkirim pun tercatat "dibatalkan (dry-run)"**.
   Jalur lain yang menghasilkan teks itu: tombol "Kirim" di dialog ringkasan tidak ditemukan, lalu kode diam-diam menekan "Batal" dan melapor `ok: true`.
4. **`konfirmasiAkhir` selalu `'2. Sudah diperbaiki'`** walaupun pembaruan tidak terkirim.

## 2. Aturan bisnis (sudah dikonfirmasi pemilik kode)

### 2.1 Pemilihan kode catatan (berlaku di semua jalur `alurKK`)

`dataKKLengkap = !!nikUsul && !!namaNIKExcel && !!kkUsul` (sudah ada di kode).

| Kondisi                                                                          | Kode catatan | Mengisi no_kk?                                     |
| -------------------------------------------------------------------------------- | ------------ | -------------------------------------------------- |
| `dataKKLengkap` **true**                                                         | `#DC_03`     | hanya jika `no_kk` di halaman ≠ `kkUsul`           |
| `dataKKLengkap` **false** (salah satu dari kk usul / NIK usul / nama NIK kosong) | `#DC_00`     | **tidak pernah** (tidak memenuhi syarat perubahan) |

Kode **tidak lagi** bergantung pada apakah no_kk di halaman berubah. Perubahan perilaku dibanding sekarang:

- Jalur `/edit`, data lengkap dan no_kk sudah sama: dulu `#DC_00`, sekarang `#DC_03`.
- Jalur `/edit`, data tidak lengkap (mis. `kk_usul` kosong) dan no_kk halaman berisi: dulu mencoba mengisi nilai kosong lalu `GAGAL`, sekarang tidak mengisi, `#DC_00`.

### 2.2 Cek riwayat catatan (mencegah catatan ganda di assignment yang sama)

Hanya **pesan terbaru** (paling bawah) di dialog Catatan field `no_kk` yang menentukan.

| Pesan terbaru                            | Kode yang akan ditulis | Aksi                                                           |
| ---------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| Tidak ada riwayat                        | apa saja               | tulis (+ kirim sesuai config)                                  |
| Milik sendiri `#DC_03`                   | `#DC_03`               | **lewati** (catatan + Kirim)                                   |
| Milik sendiri `#DC_03`                   | `#DC_00`               | **lewati** (jangan menimpa catatan yang sudah memenuhi syarat) |
| Milik sendiri `#DC_00`                   | `#DC_00`               | **lewati**                                                     |
| Milik sendiri `#DC_00`                   | `#DC_03`               | tulis (data kini lengkap)                                      |
| Milik user lain (mis. `#DC_01` reviewer) | apa saja               | tulis (ada respons baru)                                       |

Aturan disimpan sebagai data di `config.js` (`lewatJika`). "Milik sendiri" = bubble pesan di kanan (class mengandung `flex-row-reverse`).

> Asumsi yang masih perlu dikonfirmasi pemilik kode: `#DC_00` setelah `#DC_03` di assignment yang sama **dilewati**.
> Untuk mengubahnya cukup edit `lewatJika` di `config.js`.

### 2.3 Pemetaan `konfirmasiAkhir` (kolom Excel konfirmasi)

Mengikuti jalur tanpa Edit yang sudah ada:

- `kkUsul` terisi **dan** no_kk halaman sama dengan `kkUsul` → `'2. Sudah diperbaiki'`
- selain itu (mis. data tidak lengkap dan no_kk tidak sama) → `'3. Tidak diperbaiki'`
- pembaruan diminta dikirim tetapi tidak terkirim → tetap `konfAwal` dan status `PERLU CEK MANUAL`

## 3. Ringkasan file

| File        | Jenis perubahan                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.js` | [UBAH] rename `kodeBerubah`→`kodeLengkap`, `kodeTetap`→`kodeTidakLengkap`; [BARU] `lewatJika`                                                 |
| `ops.js`    | [BARU] `bacaRiwayat`; [UBAH] `bukaDialogCatatan`, `catatanField`; [BARU] guard di `akhirCatatan`                                              |
| `engine.js` | [BARU] `kodeKK`, `teksCatatan`, `catatKK`; [UBAH] `alurKK` (kode catatan, cabang tanpa-Edit, `jalankanCatatKirim`, langkah 12a/13), `mulai()` |

**Jangan ubah:** `panel.js`, `state.js`, `util.js`, `tabs.js`, `excel.js`, `rate-limiter.js`, `app.js`.
Jangan mengubah nilai default `kirimCatatan` / `kirimPembaruan`.
Setelah selesai, pastikan tidak ada sisa referensi: `grep -rn "kodeBerubah\|kodeTetap" .` harus kosong.

## 4. Urutan pengerjaan

1. `config.js` (data)
2. `ops.js` (parser riwayat, skip, guard Kirim)
3. `engine.js` (pemakai hasil ops)
4. Jalankan skenario di bagian "Pengujian"

---

## 5. `config.js`

Lokasi: `BLOKS['blokP-kk'].catatanKK`.

```js
    // Catatan kode + kirim pembaruan setelah no_kk diproses.
    //   kodeLengkap      : [UBAH, dulu kodeBerubah] dipakai bila data Excel LENGKAP (no_kk/kk usul, NIK usul, nama NIK ada)
    //   kodeTidakLengkap : [UBAH, dulu kodeTetap]   dipakai bila salah satu data itu kosong (tidak memenuhi syarat perubahan)
    //   kirimCatatan: ... (tidak berubah)
    //   kirimPembaruan: ... (tidak berubah)
    catatanKK: {
      aktif: true,
      kodeLengkap: '#DC_03', // [UBAH]
      kodeTidakLengkap: '#DC_00', // [UBAH]
      kirimCatatan: true,
      kirimPembaruan: true,
      // [BARU] Kunci = kode yang AKAN ditulis. Nilai = daftar teks catatan terakhir
      // (milik sendiri) yang membuat penulisan dilewati. Pesan terakhir dari user lain
      // tidak pernah menyebabkan skip.
      lewatJika: {
        '#DC_03': ['#DC_03'],
        '#DC_00': ['#DC_00', '#DC_03'],
      },
    },
```

---

## 6. `ops.js`

### 6.1 [BARU] fungsi `bacaRiwayat`

Lokasi: function declaration di dalam IIFE, tepat **di atas** `async function bukaDialogCatatan(...)` (bagian "Catatan dry-run", sekitar baris 754).

Struktur DOM dialog Catatan yang diandalkan parser:

- Pemisah tanggal: `<span>` dengan class mengandung `rounded-full` (mis. "10 Oktober 2026", "Hari ini").
- Baris pesan: `<div>` dengan class mengandung `w-full`, `items-start`, `gap-3`. Pesan sendiri memiliki `flex-row-reverse`.
- Pengirim: `div[title]` (avatar). Jam: `<span>` berformat `HH:MM`. Isi: elemen dengan class mengandung `whitespace-pre-wrap`.
- Urutan DOM = kronologis naik, pesan terbaru paling bawah.

```js
// [BARU] Baca riwayat catatan di dialog Catatan (urut lama → baru).
function bacaRiwayat(dialog) {
  const out = [];
  let tanggal = '';
  const sel = 'span[class*="rounded-full"], div[class*="w-full"][class*="items-start"][class*="gap-3"]';
  for (const el of dialog.querySelectorAll(sel)) {
    if (el.tagName === 'SPAN') {
      tanggal = el.textContent.trim();
      continue;
    }
    const av = el.querySelector('div[title]');
    const isi = el.querySelector('[class*="whitespace-pre-wrap"]');
    if (!av || !isi) continue;
    const jam = [...el.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => /^\d{1,2}:\d{2}$/.test(t)) || '';
    out.push({
      pengirim: av.getAttribute('title') || '',
      milikSendiri: /flex-row-reverse/.test(el.className),
      tanggal,
      jam,
      teks: isi.textContent.trim(),
    });
  }
  return out;
}
```

### 6.2 [UBAH] `bukaDialogCatatan`: parameter `opsi` + logika skip

**a) Signature**

```js
// SEBELUM
async function bukaDialogCatatan(el, varId, teks, simpan, wadahField) {

// SESUDAH  [UBAH]
async function bukaDialogCatatan(el, varId, teks, simpan, wadahField, opsi) {
```

**b) Sisipkan blok baru** tepat setelah blok `if (!ta) { await tutupDialog(dialog); return {...}; }` dan **sebelum** `ta.style.outline = '3px solid #2563eb';`:

```js
// [BARU] Cek riwayat catatan sebelum menulis.
await tunggu(() => bacaRiwayat(dialog).length, 1200); // riwayat dimuat async; bila kosong menunggu 1,2 dtk
const riwayat = bacaRiwayat(dialog);
const terakhir = riwayat.length ? riwayat[riwayat.length - 1] : null;
if (opsi && Array.isArray(opsi.lewatJika) && terakhir && terakhir.milikSendiri && opsi.lewatJika.includes(terakhir.teks)) {
  await tutupDialog(dialog);
  return { ok: true, dilewati: true, teks, terakhir, jumlahRiwayat: riwayat.length };
}
```

**c) [UBAH] dua `return` normal di fungsi yang sama**, tambahkan `terakhir` untuk audit di log:

```js
// SEBELUM
return { ok: tertahan, tertahan, teks, dikirim: true };
// SESUDAH
return { ok: tertahan, tertahan, teks, dikirim: true, terakhir };

// SEBELUM
return { ok: tertahan, tertahan, teks, dikirim: false };
// SESUDAH
return { ok: tertahan, tertahan, teks, dikirim: false, terakhir };
```

### 6.3 [UBAH] `ops.catatanField`: teruskan argumen `a`

```js
// SEBELUM
return bukaDialogCatatan(inp, a.varId, a.teks, !!a.simpan, w[0]);
// SESUDAH
return bukaDialogCatatan(inp, a.varId, a.teks, !!a.simpan, w[0], a); // [UBAH] a.lewatJika dipakai di dalam
```

`cekAtauIsi` (op `isi`) tidak diubah: ia memanggil `bukaDialogCatatan` tanpa `opsi`, jadi tidak ada skip.

### 6.4 [BARU] guard tombol Kirim di `ops.akhirCatatan`

Lokasi: langkah "5b", tepat setelah baris `const btnDismiss = dialog.querySelector('button[aria-label="Dismiss"]');` dan **sebelum** `if (a.konfirmasiKirim && btnKonfirm) {`.

Tujuan: bila `konfirmasiKirim: true` tetapi tombol Kirim di dialog tidak ada atau disabled, jangan diam-diam menekan Batal dan melapor `ok: true`.

```js
// [BARU] Konfirmasi diminta tetapi tombol Kirim di dialog tidak ada / disabled → gagal, bukan "dry-run".
if (a.konfirmasiKirim && (!btnKonfirm || btnKonfirm.disabled)) {
  const daftarTombol = [...dialog.querySelectorAll('button')].map((b) => norm(b.textContent) || b.getAttribute('aria-label') || '(tanpa teks)');
  if (btnBatal) btnBatal.click();
  else if (btnDismiss) btnDismiss.click();
  await tunggu(() => !cariDialogKirim(), 5000);
  return {
    ok: false,
    sebelum: statusSebelum,
    sesudah: statusSesudah,
    diubah,
    dikirim: false,
    dari: tombol.dari,
    dialog: { ...ringkasan, dikonfirmasi: false, dibatalkan: true },
    pesan: (btnKonfirm ? 'tombol Kirim di dialog disabled' : 'tombol Kirim di dialog tidak ditemukan') + '; tombol: ' + daftarTombol.join(' | '),
  };
}
```

---

## 7. `engine.js`

### 7.1 [BARU] helper top-level: `kodeKK`, `teksCatatan`, `catatKK`

Lokasi: tepat di bawah `const jumlahDari = ...` (sekitar baris 12).

```js
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
  if (catat.dilewati) return `; catatan "${catat.teks}" DILEWATI (terakhir: ${infoT || '?'})`;
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
```

### 7.2 [BARU] tentukan `kodeCatatan` sekali di awal `alurKK`

Lokasi: tepat setelah `const dataKKLengkap = !!nikUsul && !!namaNIKExcel && !!kkUsul;` (sekitar baris 213).

```js
const dataKKLengkap = !!nikUsul && !!namaNIKExcel && !!kkUsul;
const kodeCatatan = kodeKK(blokP.catatanKK, dataKKLengkap); // [BARU] dipakai semua cabang di bawah
```

Setelah ini **hapus** semua deklarasi `kodeCatatan` / `kode` / `cfgKK` lama (lihat 7.3 dan 7.5) agar tidak ada deklarasi ganda.

### 7.3 [UBAH] `alurKK`, cabang "Tanpa tombol Edit" (langkah 10)

Lokasi: blok `if (nEdit === 0) {`, setelah `const noKKH = ...;`.

```js
// SEBELUM  [HAPUS]
const cfg = blokP.catatanKK;
const kodeCatatan = cfg && cfg.aktif ? (nikUsul && namaNIKExcel && kkUsul ? cfg.kodeBerubah || '#DC_03' : cfg.kodeTetap || '#DC_00') : '';
let catat = null;
if (kodeCatatan) {
  try {
    catat = (
      await jalankanDiTab('catatanField', {
        varId: 'no_kk',
        teks: kodeCatatan,
        simpan: !!cfg.kirimCatatan,
      })
    ).find((x) => x && x.ok !== undefined);
  } catch (e) {
    catat = { ok: false, pesan: 'error: ' + (e && e.message) };
  }
}
const catatTxt = catat ? (catat.ok ? `; catatan "${catat.teks}"${catat.dikirim ? ' DIKIRIM' : ' terisi (tidak dikirim)'}` : `; catatan GAGAL: ${catat.pesan || '?'}`) : '';

// SESUDAH  [UBAH]
const cfg = blokP.catatanKK;
const catat = await catatKK(kodeCatatan, cfg); // kodeCatatan dari 7.2
const catatTxt = teksCatatan(catat);
```

Dua `return` sesudahnya (`VALIDASI OK: no_kk sudah benar (tanpa tombol Edit)` dan `VALIDASI: no_kk halaman ≠ KK usul`) tidak perlu diubah.
Cabang ini tidak punya langkah Kirim.

### 7.4 [UBAH] `jalankanCatatKirim` (helper di dalam `alurKK`, sekitar baris 460–508)

Ganti **seluruh isi** fungsi. Perubahan utama: pakai `catatKK`/`teksCatatan`; bila catatan dilewati, **Kirim juga dilewati**;
status terkirim dibaca dari properti yang benar; menghasilkan `dilewati` dan `gagalKirim`.

```js
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
```

### 7.5 [UBAH] langkah 12a, 12b, 13 di `alurKK`

**a) Langkah 12a**: ganti seluruh blok `if (noKKH2 === kkUsul) { ... }` (sekitar baris 510–523).
Kondisinya sekarang mencakup **data tidak lengkap**, karena data tidak lengkap berarti tidak memenuhi syarat perubahan (tidak mengisi, `#DC_00`).

```js
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
```

**b) Langkah 12b** (isi no_kk dengan KK usul): **tidak berubah**. Sampai di sini dijamin `dataKKLengkap === true` dan `noKKH2 !== kkUsul`.

**c) Langkah 13**: ganti blok setelah 12b.

```js
  // SEBELUM  [HAPUS]
  const cfgKK = blokP.catatanKK;
  const kodeCatatan = cfgKK && cfgKK.aktif ? cfgKK.kodeBerubah || '#DC_03' : '';
  const { catatTxt, kirimTxt, catatan } = await jalankanCatatKirim(kodeCatatan);

  return {
    status: 'DIISI: no_kk diperbarui',
    ...
    konfirmasiAkhir: '2. Sudah diperbaiki',
    ...
  };

  // SESUDAH  [UBAH]  (kodeCatatan sudah ada dari 7.2 = '#DC_03' karena data lengkap)
  const { catatTxt, kirimTxt, catatan, gagalKirim } = await jalankanCatatKirim(kodeCatatan);

  return {
    status: gagalKirim ? 'PERLU CEK MANUAL: no_kk sudah diisi tetapi pembaruan tidak terkirim' : 'DIISI: no_kk diperbarui',
    detail: `"${hasil.lama}" → "${kkUsul}"${catatTxt}${kirimTxt} | ${detailValidasi}`,
    konfirmasiAwal: konfAwal,
    konfirmasiAkhir: gagalKirim ? konfAwal : '2. Sudah diperbaiki',
    identitas: teksIdn,
    catatan,
  };
```

### 7.6 [UBAH] `mulai()`: deteksi konflik KK per link + penanda link yang sama

**a) [BARU] pra-pemeriksaan**, setelah `const target = rows.slice(...)` dan sebelum `setBusy(true);`.
Memakai `rows` (bukan `target`) agar konflik terdeteksi walau batas baris dipakai. Baris dengan `kk_usul` kosong diabaikan.

```js
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
```

**b) [UBAH] percabangan di dalam loop** yang menentukan `r`:

```js
        if (!/^https:\/\//.test(link) || new URL(link).host !== CONFIG.HOST) {
          r = { status: 'DILEWATI: link kosong atau host tidak cocok' };
        // [BARU] cabang konflik
        } else if (aksi === 'kk' && linkKonflik.has(link)) {
          r = { status: 'PERLU CEK MANUAL: link yang sama punya kk_usul berbeda antar baris Excel' };
        } else if (aksi === 'kk') {
          r = await denganSesi(() => alurKK(baris, link, petaKK, limiter));
        } else {
```

**c) [BARU] penanda link sama**, setelah blok `try/catch` yang mengisi `r` dan **sebelum** `hasil.push({...})`:

```js
// [BARU] Info audit: assignment ini sudah pernah diproses baris lain di sesi ini.
const barisSebelumnya = linkTerlihat.get(link);
if (barisSebelumnya) r.detail = (r.detail ? r.detail + ' | ' : '') + `link sama dengan baris Excel ${barisSebelumnya}`;
if (link) linkTerlihat.set(link, i + 2);
```

Sumber kebenaran skip tetap **riwayat catatan di server** (tahan terhadap run ulang); `linkTerlihat` hanya untuk log.

---

## 8. Pengujian

Gunakan satu assignment uji yang dipakai oleh **2 baris Excel** (A dan B). Jalankan dengan `kirimCatatan: true`.
`kirimPembaruan: true` hanya pada assignment uji.

| #   | Skenario                                                                      | Hasil yang diharapkan                                                                                                    |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | A: data lengkap, no_kk halaman beda, riwayat kosong                           | `DIISI`, catatan `#DC_03` DIKIRIM, log Kirim sesuai kenyataan di web                                                     |
| 2   | B (link sama): data lengkap, no_kk kini sama                                  | `SUDAH DICATAT`, `#DC_03` DILEWATI, `Kirim dilewati`, detail "link sama dengan baris Excel N"                            |
| 3   | Run ulang seluruh file                                                        | A dan B dilewati (terakhir = `#DC_03` milik sendiri)                                                                     |
| 4   | Data lengkap, no_kk halaman **sudah sama sejak awal**, riwayat kosong         | `VALIDASI OK`, catatan **`#DC_03`** (bukan `#DC_00`), Kirim                                                              |
| 5   | `kk_usul` kosong, no_kk halaman berisi                                        | **tidak mengisi**, `TIDAK DIUBAH: data Excel tidak lengkap`, catatan `#DC_00`, `konfirmasiAkhir` = `3. Tidak diperbaiki` |
| 6   | `nik_usul` atau `nama_nik` kosong, `kk_usul` terisi dan sama dengan halaman   | `#DC_00`, `konfirmasiAkhir` = `2. Sudah diperbaiki`                                                                      |
| 7   | Pesan terakhir dari reviewer (mis. `#DC_01`)                                  | catatan **ditulis** walau sendiri pernah menulis `#DC_03`                                                                |
| 8   | Riwayat terakhir milik sendiri `#DC_00`, kini data lengkap                    | `#DC_03` **ditulis**                                                                                                     |
| 9   | Dua baris satu link dengan `kk_usul` berbeda (keduanya terisi)                | keduanya `PERLU CEK MANUAL: link yang sama punya kk_usul berbeda...`                                                     |
| 10  | Tombol Kirim di dialog dibuat tidak terdeteksi (ubah teks selector sementara) | `PERLU CEK MANUAL`, `kirim GAGAL: tombol Kirim di dialog tidak ditemukan; tombol: ...`, `konfirmasiAkhir` tidak berubah  |
| 11  | `kirimPembaruan: false`                                                       | `dialog Kirim dibuka (belum dikirim)`; perilaku dry-run lama tidak berubah                                               |

Verifikasi parser pada skenario 7: `terakhir.pengirim`, `terakhir.teks`, `terakhir.milikSendiri`, `terakhir.tanggal`, `terakhir.jam`
muncul di detail log dan benar. Bila `milikSendiri` salah, periksa class bubble (`flex-row-reverse`) pada DOM terbaru.

## 9. Risiko dan catatan

- **Skip menyembunyikan assignment yang belum terkirim.** Jika baris pertama menulis catatan tetapi pembaruannya gagal terkirim, baris kedua
  melewati catatan dan Kirim. Karena itu baris pertama kini ditandai `PERLU CEK MANUAL` (`gagalKirim`); tinjau log sebelum run ulang.
- **Data tidak lengkap tetap memicu Kirim.** Di jalur `/edit`, baris dengan data tidak lengkap tetap mendapat `#DC_00` lalu Kirim (sesuai perilaku `kodeTetap` lama).
  Bila Anda tidak ingin Kirim untuk kasus ini, beri syarat `!dataKKLengkap` di `jalankanCatatKirim` untuk melewati langkah `akhirCatatan`.
- **Pencocokan teks catatan** memakai kesamaan persis setelah `trim()`. Bila catatan nyata berisi tambahan teks setelah kodenya
  (mis. `#DC_03 keterangan`), ubah pembandingan menjadi `startsWith` di `bukaDialogCatatan`.
- **Urutan riwayat** diasumsikan lama → baru (terbaru paling bawah), sesuai DOM contoh. Jika UI berubah, perbaiki pemilihan `terakhir`.
- **Selector berbasis class Tailwind** (`rounded-full`, `w-full`, `items-start`, `gap-3`, `whitespace-pre-wrap`) rawan berubah saat situs target di-update;
  `bacaRiwayat` adalah satu-satunya tempat yang perlu disesuaikan.
- Menunggu riwayat memuat menambah hingga 1,2 detik per pemanggilan saat riwayat kosong; masih jauh di bawah jeda rate limiter.
