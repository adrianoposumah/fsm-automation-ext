# Panduan Lanjutan: Link Langsung ke Detail + Log Perubahan per Kolom (mode `isi-usaha-flag`)

Dokumen ini adalah **lanjutan** dari `PANDUAN_mode_usaha_flag.md` dan ditujukan untuk agent editor.
**Terapkan panduan itu lebih dulu.** Potongan "SEBELUM" di bawah mengacu ke kode **setelah** panduan tersebut diterapkan
(khususnya `alurBaris` di `engine.js`). Gaya kode: `'use strict'`, 2 spasi, kutip tunggal, penamaan Indonesia.

Legenda: `// [BARU]` kode ditambahkan, `// [UBAH]` kode lama diganti.

---

## 1. Tujuan

1. **Link langsung ke detail.** Untuk mode flag, `assignment_link` di Excel sudah berupa URL halaman detail (halaman yang memuat tombol Edit).
   Alur lama membuka link, mencari tombol "Review", lalu membuka `href`-nya. Untuk mode ini langkah pencarian Review **dilewati**.
2. **Log perubahan per baris.** Setiap baris di log (konsol panel dan file `log_*.xlsx`) memuat kolom yang benar-benar diubah dengan format
   `nama_kolom = lama → baru`, misalnya `biaya_produksi = 1000000 → 1500000`.

> Asumsi: URL langsung mengarah ke halaman yang sama dengan tujuan link "Review" pada alur lama, yaitu halaman yang memuat tombol Edit
> (`CONFIG.EDIT_CSS`). Bila URL langsung ternyata halaman sebelum itu, alur tidak bisa langsung klik Edit dan baris akan berstatus
> `PERLU CEK MANUAL: tombol Edit ditemukan 0`.

## 2. Ringkasan file

| File        | Perubahan                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `config.js` | [BARU] `linkLangsung: true` di `BLOKS['blok2-usaha-flag'].flag`                                              |
| `ops.js`    | [UBAH] `cekAtauIsi`: kembalikan nilai lama/baru yang sudah dinormalkan                                       |
| `engine.js` | [UBAH] `alurBaris` (lewati Review, bentuk teks `perubahan`); [UBAH] `mulai()` (kolom log + baris log konsol) |
| `panel.js`  | [UBAH] daftar kolom di tombol "Unduh log"                                                                    |

**Jangan ubah:** `state.js`, `util.js`, `tabs.js`, `excel.js`, `rate-limiter.js`, `app.js`.

## 3. Urutan pengerjaan

`config.js` → `ops.js` → `engine.js` → `panel.js` → pengujian (bagian 8).

---

## 4. `config.js`

Tambahkan `linkLangsung` di objek `flag` pada `BLOKS['blok2-usaha-flag']`:

```js
    flag: {
      nilaiAktif: ['1'],
      catatanKolom: ['catatan'],
      catatanWajib: true,
      catatanJikaSama: false,
      simpanCatatan: false,
      kirimPembaruan: false,
      // [BARU] true = assignment_link langsung ke halaman detail (ada tombol Edit); lewati pencarian tombol Review.
      linkLangsung: true,
    },
```

---

## 5. `ops.js`

### 5.1 [UBAH] `cekAtauIsi`: kembalikan nilai lama dan baru yang sudah dinormalkan

Lokasi: di bagian "isi nilai field", tepat setelah baris `out[k].lama = String(el.value || '').slice(0, 60);` (sekitar baris 875).
Nilai `lama` mentah dari halaman bisa berformat (mis. `1.000.000`), sedangkan `baru` yang akan diketik sudah dinormalkan oleh `angka()`.
Dengan menyimpan keduanya dalam bentuk yang sama, log perubahan konsisten dan mudah dibaca.

```js
out[k].lama = String(el.value || '').slice(0, 60);
// [BARU] bentuk ternormalisasi untuk log perubahan (null bila tidak bisa dinormalkan / bukan field angka)
out[k].lamaAngka = modeAngka ? angka(el.value) : null;
out[k].baruAngka = modeAngka ? baru : null;
```

(`modeAngka` dan `baru` sudah dideklarasikan tepat di atas baris ini; jangan mendeklarasikan ulang.)

---

## 6. `engine.js`

### 6.1 [UBAH] `alurBaris`: lewati pencarian Review untuk link langsung

Lokasi: bagian awal `alurBaris`, dari `const rv = await jalankanDiTab('reviewHref', ...)` sampai `await buka(href, limiter);` (baris ~21–29 pada kode asli).
`await limiter.tunggu('filter'); await buka(link, limiter);` di atasnya **tidak diubah**.
Blok `if (mode === 'review') { ... }` di bawahnya tidak diubah (memakai variabel `href`, yang kini dideklarasikan di luar `if`).

```js
// SEBELUM
const rv = await jalankanDiTab('reviewHref', { teks: CONFIG.TEKS_REVIEW, ms: 10000 });
const nRev = jumlahDari(rv);
if (nRev === 0 && (await butuhLogin(true))) throw new SesiHabis();
if (nRev !== 1) return { status: `PERLU CEK MANUAL: tombol Review ditemukan ${nRev}` };
const href = rv.find((r) => r.jumlah === 1).href;
if (new URL(href).host !== CONFIG.HOST) return { status: 'PERLU CEK MANUAL: link Review mengarah ke host lain' };

await limiter.tunggu('filter');
await buka(href, limiter);

// SESUDAH  [UBAH]
// [BARU] Link langsung ke halaman detail (mode flag): tidak ada pencarian tombol Review,
// sehingga satu navigasi dan satu jeda rate limiter berkurang per baris.
const langsung = !!(blok.flag && blok.flag.linkLangsung);
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
```

Pemeriksaan sesi untuk jalur langsung sudah ditangani dua tempat yang ada: `buka()` melempar `SesiHabis` bila diarahkan ke halaman login/host lain,
dan langkah `klikEdit` melempar `SesiHabis` bila `nEdit === 0` dan sesi habis. Tidak perlu kode tambahan.

Beri petunjuk pada pesan gagal tombol Edit (baris ~42 pada kode asli):

```js
// SEBELUM
if (nEdit !== 1) return { status: `PERLU CEK MANUAL: tombol Edit ditemukan ${nEdit}` };
// SESUDAH  [UBAH]
if (nEdit !== 1) return { status: `PERLU CEK MANUAL: tombol Edit ditemukan ${nEdit}${langsung ? ' (link langsung: pastikan URL = halaman detail yang memuat tombol Edit)' : ''}` };
```

### 6.2 [BARU] teks `perubahan` di `alurBaris`

Lokasi: tepat sebelum `return` terakhir `alurBaris` (setelah `const detailFlag = ...` dari panduan sebelumnya).
Hanya field yang **benar-benar diisi** (`diisi === true`) yang dicantumkan; field yang sudah sama, gagal, atau tidak dipilih tidak muncul.
Nama kolom yang ditampilkan adalah nama kolom **Excel** yang dipilih di dropdown (mis. `biaya_produksi`, `biaya_non_operasional`).

```js
// [BARU] Kolom yang diubah: "kolom_excel = lama → baru" (hanya field yang benar-benar terisi).
const fmtNilai = (norm, mentah) => (norm !== null && norm !== undefined ? String(norm) : String(mentah == null ? '' : mentah).trim() || '(kosong)');
const perubahan =
  mode === 'isi'
    ? pilih
        .filter((k) => g[k] && g[k].diisi)
        .map((k) => `${opsi.petaKolom[k] || k} = ${fmtNilai(g[k].lamaAngka, g[k].lama)} → ${fmtNilai(g[k].baruAngka, nilai[k])}`)
        .join('; ')
    : '';
```

Lalu tambahkan `perubahan` pada `return`:

```js
// SEBELUM  (hasil panduan sebelumnya)
return { status, detail: detailFlag ? `${detailFlag} | ${detail}` : detail, identitas: teksIdn, akhir, kalk, catatan };
// SESUDAH  [UBAH]
return { status, detail: detailFlag ? `${detailFlag} | ${detail}` : detail, identitas: teksIdn, akhir, kalk, catatan, perubahan };
```

Catatan: teks ini juga terisi untuk mode lama `isi-usaha` (penambahan kolom log saja, perilaku lain tidak berubah). Mode `cek-usaha`, `usaha`, `review`, dan `kk-update` menghasilkan string kosong / tidak mengisinya.
Untuk mengganti simbol panah, ubah `→` pada template string di atas.

### 6.3 [UBAH] `mulai()`: kolom log dan baris log konsol

**a)** Tambah `perubahan` pada `hasil.push({...})` (baris ~646–660 pada kode asli), setelah `detail`:

```js
      hasil.push({
        baris_excel: i + 2,
        link,
        mode: modeId,
        status: r.status,
        detail: r.detail || '',
        perubahan: r.perubahan || '', // [BARU]
        catatan: r.catatan || '',
        identitas: r.identitas || '',
        ...
```

**b)** Tambah baris log konsol, tepat setelah `if (r.identitas) log(...)` (baris ~663):

```js
if (r.identitas) log(`   ↳ ${r.identitas}`);
if (r.perubahan) log(`   ✎ perubahan: ${r.perubahan}`); // [BARU]
```

---

## 7. `panel.js`

### 7.1 [UBAH] kolom file log di tombol "Unduh log"

Lokasi: `$('btnLog').onclick`, deklarasi `const kolom = [...]`. Sisipkan `'perubahan'` setelah `'detail'`.
(Variabel `kolom` di sini adalah variabel lokal yang menimpa global `kolom` hanya di dalam handler; jangan diubah namanya.)

```js
// SEBELUM
const kolom = ['baris_excel', 'link', 'mode', 'status', 'detail', 'catatan', 'identitas', 'total_pendapatan', 'total_pengeluaran', 'selisih', 'konfirmasi_awal', 'konfirmasi_akhir', 'waktu'];
// SESUDAH  [UBAH]
const kolom = ['baris_excel', 'link', 'mode', 'status', 'detail', 'perubahan', 'catatan', 'identitas', 'total_pendapatan', 'total_pengeluaran', 'selisih', 'konfirmasi_awal', 'konfirmasi_akhir', 'waktu'];
```

---

## 8. Pengujian

Gunakan `assignment_link` berupa URL halaman detail yang memuat tombol Edit. Mulai dengan dry-run (`simpanCatatan: false`, `kirimPembaruan: false`).

| #   | Skenario                                         | Hasil yang diharapkan                                                                                                    |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Link langsung, `biaya_produksi_flag=1`           | Tidak ada pencarian Review (tidak ada pemanggilan `reviewHref`); langsung klik Edit → `/edit` terbuka; field terisi      |
| 2   | Log baris yang sama                              | Konsol: `✎ perubahan: biaya_produksi = <lama> → <baru>`; file `log_*.xlsx` punya kolom `perubahan` berisi teks yang sama |
| 3   | Dua flag = 1                                     | `perubahan` memuat dua entri dipisah `; ` (mis. `biaya_produksi = ... → ...; pendapatan_lainnya = ... → ...`)            |
| 4   | Nilai halaman sudah sama dengan Excel            | Field itu **tidak** muncul di `perubahan`; bila semua sama → `SUDAH SESUAI` dan `perubahan` kosong                       |
| 5   | Field gagal diisi (mis. nilai bukan angka)       | Field itu tidak muncul di `perubahan`; status `PERLU CEK MANUAL`                                                         |
| 6   | `lama` berformat titik ribuan (`1.000.000`)      | `perubahan` menampilkan `1000000 → ...` (bentuk ternormalisasi)                                                          |
| 7   | URL bukan halaman detail (tidak ada tombol Edit) | `PERLU CEK MANUAL: tombol Edit ditemukan 0 (link langsung: pastikan URL = halaman detail ...)`                           |
| 8   | Sesi habis di tengah proses                      | Login ulang, baris diulang, tidak ada pencarian Review                                                                   |
| 9   | Regresi: mode lama `isi-usaha` (link biasa)      | Alur Review tetap berjalan; kolom `perubahan` terisi untuk field yang diisi; mode lain kosong                            |

## 9. Catatan

- **`perubahan` = nilai yang diisi ke form**, bukan jaminan tersimpan. Pada dry-run (`kirimPembaruan: false`) nilai itu tidak disimpan; baca kolom `status` (`DRY-RUN`, `DIISI & DIKIRIM`, `PERLU CEK MANUAL`) untuk tahu apakah benar-benar terkirim.
- **Temuan terpisah (opsional diperbaiki):** `alurBaris` baris 16 menolak blok `null` (`if (!blok) return ... 'blok tidak dikenal'`) sebelum cabang `mode === 'review'`,
  sedangkan mode `review` memang tidak punya blok. Akibatnya mode "Tes Review" selalu berstatus `PERLU CEK MANUAL: blok tidak dikenal`.
  Perbaikan: ubah baris itu menjadi `if (!blok && mode !== 'review') return { status: 'PERLU CEK MANUAL: blok tidak dikenal' };`.
  Setelah itu pastikan akses `blok.flag` di bawahnya aman (`blok && blok.flag`) untuk mode `review`.
