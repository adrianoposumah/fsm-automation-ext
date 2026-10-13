'use strict';
const $ = (id) => document.getElementById(id);
const tidurMs = (ms) => new Promise((r) => setTimeout(r, ms));

// Jeda yang menghormati stopFlag: berhenti segera setelah baris berjalan selesai.
async function tidur(detik) {
  const akhir = Date.now() + detik * 1000;
  while (Date.now() < akhir && !stopFlag) await tidurMs(Math.max(0, Math.min(500, akhir - Date.now())));
}
