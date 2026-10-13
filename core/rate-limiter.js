'use strict';
// j = "filter" (navigasi) atau "submit" (simpan, belum dipakai).
// Jitter hanya MENAMBAH jeda di atas interval minimum, tidak pernah mengurangi.
function buatLimiter(p) {
  const last = { filter: 0, submit: 0 },
    pen = { filter: 0, submit: 0 },
    gagal = { filter: 0, submit: 0 };
  return {
    async tunggu(j) {
      const sisa = last[j] + (p[j + '_min_interval_s'] + p[j + '_jitter_s'] * Math.random()) * 1000 - Date.now();
      if (sisa > 0) await tidur(sisa / 1000);
      last[j] = Date.now();
    },
    async tolak(j) {
      gagal[j]++;
      pen[j] = pen[j] ? Math.min(pen[j] * 2, p[j + '_penalty_max_s']) : p[j + '_penalty_initial_s'];
      let w = pen[j];
      const ca = p[j + '_cooldown_after'];
      if (ca && gagal[j] >= ca) {
        w = Math.max(w, p[j + '_cooldown_s']);
        gagal[j] = 0;
      }
      log(`Server membatasi akses. Menunggu ${w} detik...`);
      await tidur(w);
      last[j] = Date.now();
    },
    ok(j) {
      gagal[j] = 0;
      pen[j] = 0;
    },
    async sukses(j) {
      this.ok(j);
      if (p[j + '_success_delay_s']) await tidur(p[j + '_success_delay_s']);
    },
  };
}
