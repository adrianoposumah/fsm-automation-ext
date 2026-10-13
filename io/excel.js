'use strict';
// Baca file Excel/CSV. Cari baris header di semua sheet, bukan hanya baris 1 sheet pertama.
function bacaExcel(wb) {
  const sama = (c) => String(c).trim().toLowerCase() === CONFIG.KOLOM_LINK.toLowerCase();
  let pilihan = null;
  for (const nama of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nama], { header: 1, defval: '', raw: false });
    const idx = aoa.findIndex((r) => r.some(sama));
    const h = idx >= 0 ? idx : aoa.findIndex((r) => r.some((c) => String(c).trim() !== ''));
    if (h < 0) continue;
    const head = aoa[h].map((c) => String(c).trim());
    const data = aoa
      .slice(h + 1)
      .filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => {
        const o = {};
        head.forEach((k, i) => {
          if (k) o[k] = r[i] === undefined ? '' : r[i];
        });
        return o;
      });
    const kandidat = { sheet: nama, head: head.filter(Boolean), data, ketemu: idx >= 0 };
    if (kandidat.ketemu) return kandidat;
    if (!pilihan && data.length) pilihan = kandidat;
  }
  return pilihan || { sheet: null, head: [], data: [], ketemu: false };
}
