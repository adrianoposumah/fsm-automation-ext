// Ubah file ini untuk menyesuaikan dengan website. Tidak perlu mengubah kode lain.
const CONFIG = {
  // Host persis seperti di address bar Chrome, tanpa https://  (contoh: "contoh.go.id")
  HOST: 'fasih-sm.bps.go.id',
  START_PATH: '/app/',
  KOLOM_LINK: 'assignment_link', // tebakan awal kolom link (bisa diganti di panel)
  KOLOM_USAHA: 'nama_usaha', // tebakan awal kolom nama usaha (bisa diganti di panel)

  // Lokasi daftar usaha di sidebar halaman edit (judul persis seperti yang tampil)
  BLOK_USAHA: {
    blok: 'SE2026 - L BLOK II',
    grup: 'Keterangan Usaha/Perusahaan',
  },

  // Field identitas record yang dibaca dari halaman edit dan ditampilkan di log.
  // Berguna untuk memastikan halaman yang sedang dibuka adalah usaha dari baris Excel.
  // varId: awalan id kontainer di halaman, contoh id="nama_komersial#1001" -> "nama_komersial".
  IDENTITAS: {
    varId: 'nama_komersial',
    label: 'Nama komersial',
  },

  // Uji dry-run catatan: klik "Catatan" tiap field yang diisi, isi textarea,
  // tapi TIDAK menekan tombol Simpan/kirim. Dialog langsung ditutup.
  CATATAN: {
    aktif: true,
    teks: 'test',
  },

  LANGKAH_AKHIR: {
    aktif: true,
    blok: 'CATATAN',
    idToggle: 'cek_anomali_button',
    klikKirim: true,
    tahanDialog: true,
    konfirmasiKirim: false, // false = klik Batal di dialog (tidak menyimpan)
    // true  = klik Kirim di dialog (MENYIMPAN — §11)
  },

  // Jeda wajib antar baris (detik). Dijalankan setelah langkah akhir selesai,
  // sebelum baris berikutnya diproses. Berguna supaya SPA menutup dialog /
  // menyelesaikan animasi sebelum navigasi berikutnya.
  // Jitter hanya MENAMBAH (0–1× nilai) supaya tidak terlalu teratur.
  JEDA_ANTAR_BARIS_S: 3,

  // Kalkulasi total & skip jika minus.
  //   pengeluaran = gaji + biaya_produksi + biaya_pembelian + operasional + non_operasional
  //   pendapatan  = nilai_pendapatan + pendapatan_lain
  //   selisih     = pendapatan - pengeluaran
  // Kalau selisih < 0 → baris DILEWATI (tidak diisi apa pun).
  // Nilai biaya_produksi & operasional diambil dari Excel (nilai baru);
  // sisanya dibaca dari halaman apa adanya.
  KALKULASI_SKIP: {
    aktif: true,
    varIds: {
      gaji: 'gaji',
      biaya_produksi: 'biaya_produksi',
      biaya_pembelian: 'biaya_pembelian',
      operasional: 'operasional',
      non_operasional: 'non_operasional',
      nilai_pendapatan: 'nilai_pendapatan',
      pendapatan_lain: 'pendapatan_lain',
    },
    pengeluaran: ['gaji', 'biaya_produksi', 'biaya_pembelian', 'operasional', 'non_operasional'],
    pendapatan: ['nilai_pendapatan', 'pendapatan_lain'],
  },

  TEKS_SSO: 'Lanjutkan dengan SSO', // teks tombol login SSO
  TEKS_REVIEW: 'Review', // teks tombol/link Review di halaman detail
  EDIT_CSS: 'button:has(svg.tabler-icon-edit)', // tombol Edit (ikon, tanpa teks)
  REVOKE_CSS: 'button:has(svg.tabler-icon-rotate-clockwise)', // tombol Revoke assignment yang sudah approved

  // Field yang diubah. Kunci = nama tampilan di panel; kolom Excel dipilih lewat dropdown di panel.
  //   varId : awalan id kontainer pertanyaan di halaman (contoh id="biaya_produksi#1" -> "biaya_produksi")
  //   label : teks yang harus ada di kontainer itu (pengaman agar tidak salah field)
  //   tipe  : "angka" = nilai dinormalkan jadi bilangan bulat (hapus Rp, titik/koma ribuan)
  //   kolom : tebakan nama kolom Excel (hanya untuk pilihan awal dropdown)
  FIELDS: {
    'Biaya Produksi': {
      varId: 'biaya_produksi',
      label: 'Biaya produksi',
      tipe: 'angka',
      kolom: ['biaya_produksi', 'biaya produksi'],
    },
    'Biaya Operasional': {
      varId: 'operasional',
      label: 'Biaya operasional',
      tipe: 'angka',
      kolom: ['biaya_operasional', 'operasional', 'biaya operasional'],
    },
  },
};
// ─────────────────────────────────────────────────────────────────────
// Definisi blok: satu entri = satu "mode" pengisian.
// Setiap blok punya sidebar, identitas record, dan daftar field sendiri.
// Menambah blok baru cukup menambah entri di sini — jangan ubah engine.
//   sidebar.item = null → tidak ada pemilihan item (mis. Blok P / KK)
//   sidebar.item ≠ null → ada daftar item (mis. daftar usaha di Blok II)
//   identitas.varId bisa id polos (nama_kk) atau prefix (#N di Blok II)
//   fields[nama] = { varId, label, tipe, kolom: [...] }
// ─────────────────────────────────────────────────────────────────────
const BLOKS = {
  'blok2-usaha': {
    judul: 'Update Usaha (Blok II)',
    sidebar: {
      blok: 'SE2026 - L BLOK II',
      grup: 'Keterangan Usaha/Perusahaan',
      item: {
        kolomExcel: 'nama_usaha', // tebakan awal kolom Excel (bisa diganti di panel)
        cocok: 'ketat', // 'ketat' | 'longgar'
        wajibTepat: 1,
      },
    },
    identitas: {
      varId: 'nama_komersial',
      label: 'Nama komersial',
    },
    fields: {
      'Biaya Produksi': {
        varId: 'biaya_produksi',
        label: 'Biaya produksi',
        tipe: 'angka',
        kolom: ['biaya_produksi', 'biaya produksi'],
      },
      'Biaya Operasional': {
        varId: 'operasional',
        label: 'Biaya operasional',
        tipe: 'angka',
        kolom: ['biaya_operasional', 'operasional', 'biaya operasional'],
      },
    },
    kalkulasiSkip: true, // ikut perhitungan pendapatan - pengeluaran
  },

  // [BARU] Blok II per flag: nilai hanya diinput bila kolom flag-nya = 1.
  'blok2-usaha-flag': {
    judul: 'Update Usaha per Flag (Blok II)',
    sidebar: {
      blok: 'SE2026 - L BLOK II',
      grup: 'Keterangan Usaha/Perusahaan',
      item: {
        kolomExcel: 'nama_usaha',
        cocok: 'longgar',
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
      'Biaya Operasional': {
        varId: 'operasional',
        label: 'Biaya operasional',
        tipe: 'angka',
        kolom: ['biaya_operasional', 'operasional', 'biaya operasional'],
        flagKolom: ['biaya_operasional_flag', 'operasional_flag', 'biaya operasional flag'],
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
      catatanJikaSama: true, // true = tetap memeriksa/menulis catatan walau nilai halaman sudah sama
      simpanCatatan: true, // true = klik "Simpan" di dialog Catatan (MENYIMPAN catatan)
      kirimPembaruan: true, // true = klik "Kirim" lalu "Konfirmasi" (MENYIMPAN perubahan)
      // [BARU] true = assignment_link langsung ke halaman detail (ada tombol Edit); lewati pencarian tombol Review.
      linkLangsung: true,
    },
  },

  'blok1-keluarga': {
    judul: 'L BLOK I — Keterangan Anggota Keluarga',
    sidebar: {
      blok: 'SE2026 - L BLOK I',
      grup: 'Keterangan Anggota Keluarga',
      item: {
        kolomExcel: 'nama_nik',
        cocok: 'longgar',
        wajibTepat: 1,
      },
    },
    identitas: { varId: 'nama_dtsen', label: 'Nama anggota' },
    // field yang dipakai untuk validasi (bukan diinput):
    fields: {
      'NIK anggota': { varId: 'nik_dtsen', label: 'NIK', tipe: 'teks', kolom: [] },
      'Nama anggota': { varId: 'nama_dtsen', label: 'Nama', tipe: 'teks', kolom: [] },
    },
    kalkulasiSkip: false,
  },

  'blokP-kk': {
    judul: 'Update & Validasi KK (Blok P)',
    sidebar: {
      blok: 'SE2026 - P',
      grup: null,
      item: null, // tidak ada pemilihan item
    },
    identitas: { varId: 'nama_kk', label: 'Nama KK' },
    // Field yang diinput (dipakai mode kk-update):
    fields: {
      'Nomor KK': {
        varId: 'no_kk',
        label: 'Nomor KK',
        tipe: 'teks',
        kolom: ['kk_usul', 'KK usul', 'no_kk_usul'],
      },
    },
    // Kolom Excel untuk validasi (tidak diinput):
    validasi: {
      nik: { varId: 'nik', kolom: ['nik_usul', 'NIK usul'], label: 'NIK', cocok: 'ketat' },
      nama: { varId: 'nama_kk', kolom: ['nama_nik', 'nama NIK'], label: 'Nama', cocok: 'longgar' },
    },
    // Kolom Excel untuk info (hanya dicatat di log):
    info: {
      no_kk_awal: { kolom: ['no_kk'], label: 'No KK awal' },
      konfirmasi: { kolom: ['konfirmasi'], label: 'Konfirmasi (1/2/3)' },
    },
    kalkulasiSkip: false,
    // Catatan kode + kirim pembaruan setelah no_kk diproses.
    //   kodeLengkap      : [UBAH, dulu kodeBerubah] dipakai bila data Excel LENGKAP (no_kk/kk usul, NIK usul, nama NIK ada)
    //   kodeTidakLengkap : [UBAH, dulu kodeTetap]   dipakai bila salah satu data itu kosong (tidak memenuhi syarat perubahan)
    //   kirimCatatan: true = klik tombol "Simpan" di dialog Catatan (kirim catatan)
    //                 false = isi textarea lalu tutup tanpa kirim (dry-run)
    //   kirimPembaruan: true = klik "Kirim", lalu "Konfirmasi" pada dialog kedua
    //                   (SIMPAN perubahan dan lanjut ke baris berikutnya)
    //                   false = buka dialog Kirim lalu tahan tetap terbuka (dry-run)
    catatanKK: {
      aktif: true,
      kodeLengkap: '#DC_03', // [UBAH]
      kodeTidakLengkap: '#DC_00', // [UBAH]
      kirimCatatan: true,
      kirimPembaruan: true,
      // Kunci = kode yang AKAN ditulis. Nilai = daftar teks yang bila menjadi
      // pesan TERAKHIR di riwayat Catatan (dari siapa pun — diri sendiri atau
      // user lain) membuat penulisan dilewati. Cek hanya pada pesan terakhir,
      // bukan seluruh riwayat, supaya tidak terjebak catatan lama yang sudah
      // ditimpa statusnya.
      lewatJika: {
        '#DC_03': ['#DC_03'],
        '#DC_00': ['#DC_00', '#DC_03'],
      },
    },
  },
};

// ─────────────────────────────────────────────────────────────────────
// Definisi mode: satu entri = satu skenario lengkap.
// Mode tahu: aksi apa yang dijalankan (review/usaha/cek/isi) dan blok mana
// yang dipakai (atau null untuk mode review murni).
// Menambah mode baru = tambah entri di sini.
// ─────────────────────────────────────────────────────────────────────
const MODES = {
  review: {
    judul: 'Tes Review — buka link → halaman review',
    aksi: 'review',
    blok: null,
  },
  usaha: {
    judul: 'Tes pilih usaha — Blok II (tanpa isi field)',
    aksi: 'usaha',
    blok: 'blok2-usaha',
  },
  'cek-usaha': {
    judul: 'Cek field usaha — Blok II (tidak mengubah)',
    aksi: 'cek',
    blok: 'blok2-usaha',
  },
  'isi-usaha': {
    judul: 'Isi usaha tanpa simpan — Blok II',
    aksi: 'isi',
    blok: 'blok2-usaha',
  },
  'isi-usaha-flag': {
    judul: 'Isi usaha per flag — Blok II (kolom custom)',
    aksi: 'isi',
    blok: 'blok2-usaha-flag',
  },
  'kk-update': {
    judul: 'Update & Validasi KK — Blok P',
    aksi: 'kk',
    blok: 'blokP-kk',
  },
};

const RATE_LIMIT_PROFILES = {
  normal: {
    label: 'Normal',
    submit_min_interval_s: 6.0,
    submit_jitter_s: 1.2,
    submit_penalty_initial_s: 20.0,
    submit_penalty_max_s: 180.0,
    submit_cooldown_after: 3,
    submit_cooldown_s: 120.0,
    submit_success_delay_s: 4.0,
    filter_min_interval_s: 2.5,
    filter_jitter_s: 0.6,
    filter_penalty_initial_s: 8.0,
    filter_penalty_max_s: 60.0,
  },
  safe: {
    label: 'Safe',
    submit_min_interval_s: 8.0,
    submit_jitter_s: 1.5,
    submit_penalty_initial_s: 30.0,
    submit_penalty_max_s: 240.0,
    submit_cooldown_after: 3,
    submit_cooldown_s: 180.0,
    submit_success_delay_s: 6.0,
    filter_min_interval_s: 3.0,
    filter_jitter_s: 0.8,
    filter_penalty_initial_s: 10.0,
    filter_penalty_max_s: 90.0,
  },
  ultra: {
    label: 'Ultra',
    submit_min_interval_s: 10.0,
    submit_jitter_s: 2.0,
    submit_penalty_initial_s: 45.0,
    submit_penalty_max_s: 300.0,
    submit_cooldown_after: 2,
    submit_cooldown_s: 240.0,
    submit_success_delay_s: 8.0,
    filter_min_interval_s: 3.5,
    filter_jitter_s: 1.0,
    filter_penalty_initial_s: 12.0,
    filter_penalty_max_s: 120.0,
  },
};
