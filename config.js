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
  },

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
