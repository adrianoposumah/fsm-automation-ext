'use strict';
// Registri operasi yang dijalankan DI DALAM halaman web target.
// Diinjeksi via chrome.scripting.executeScript({ files: ['inject/ops.js'] }).
// Semua op menerima satu argumen (objek); hasil dikembalikan dari window.__ops[op](a).
(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const kontrol = 'input:not([type=hidden]),select,textarea';
  const utama = window === window.top;

  const tunggu = async (fn, ms) => {
    const mulai = Date.now();
    for (;;) {
      const v = fn();
      if (v && (!Array.isArray(v) || v.length)) return v;
      if (Date.now() - mulai > ms) return v;
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const terlihat = (e) => e.getClientRects().length > 0;

  // ---- Helper dialog Kirim (dipakai oleh akhirCatatan & kirimForm) ----
  const cariTombolKirim = () => {
    const bawah = document.getElementById('fasih-form-nav-submit-button');
    if (bawah && terlihat(bawah)) return { el: bawah, dari: 'form-bawah' };
    const navbar = [...document.querySelectorAll('button')].filter(
      (b) => terlihat(b) && norm(b.textContent) === 'kirim' && !b.closest('aside') && !b.closest('[role="dialog"]'),
    );
    return navbar.length ? { el: navbar[0], dari: 'navbar-atas' } : null;
  };

  const cariDialogKirim = () => {
    const ds = [...document.querySelectorAll('[role="dialog"]')].filter(terlihat);
    return (
      ds.find((d) => {
        const t = d.querySelector('[id$="-title"]');
        return t && norm(t.textContent) === 'kirim';
      }) || null
    );
  };

  const cariDialogKonfirmasiKirim = () => {
    const ds = [...document.querySelectorAll('[role="dialog"]')].filter(terlihat);
    return (
      ds.find((d) => {
        const t = d.querySelector('[id$="-title"]');
        return t && norm(t.textContent) === 'konfirmasi kirim';
      }) || null
    );
  };

  const bacaRingkasanDialog = (dialog) => {
    const kartu = [];
    for (const b of dialog.querySelectorAll('button[type="button"]')) {
      if (b.getAttribute('aria-label')) continue;
      const spans = [...b.querySelectorAll('span')];
      let label = '',
        jumlah = null,
        ket = '';
      for (const s of spans) {
        const cls = typeof s.className === 'string' ? s.className : '';
        const txt = s.textContent.trim();
        if (!txt) continue;
        if (/uppercase/.test(cls) && !label) label = txt;
        else if (/text-base/.test(cls) && jumlah === null && /^\d+$/.test(txt)) jumlah = parseInt(txt, 10);
        else if (!ket && /text-\[10px\]/.test(cls)) ket = txt;
      }
      if (label && jumlah !== null) kartu.push({ label, jumlah, ket });
    }
    const judulEl = dialog.querySelector('[id$="-title"]');
    const descEl = dialog.querySelector('[id$="-description"]');
    return {
      judul: judulEl ? judulEl.textContent.trim() : '',
      deskripsi: descEl ? descEl.textContent.trim() : '',
      kartu,
    };
  };

  const cariSemua = (sp) => {
    if (!sp) return [];
    if (sp.varId) {
      const wadah = [...document.querySelectorAll('[id^="' + sp.varId + '#"]')];
      const langsung = document.getElementById(sp.varId);
      if (langsung) wadah.push(langsung);
      return wadah
        .filter((w, i, semua) => semua.indexOf(w) === i)
        .filter((w) => !sp.label || norm(w.textContent).includes(norm(sp.label)))
        .map((w) => w.querySelector(kontrol))
        .filter(Boolean);
    }
    if (sp.css) return [...document.querySelectorAll(sp.css)];
    if (!sp.label) return [];
    const t = norm(sp.label);
    const set = new Set();
    for (const l of document.querySelectorAll('label')) {
      if (!norm(l.textContent).includes(t)) continue;
      const el = l.control || (l.htmlFor && document.getElementById(l.htmlFor)) || l.querySelector(kontrol) || (l.parentElement && l.parentElement.querySelector(kontrol));
      if (el) set.add(el);
    }
    if (!set.size) {
      for (const e of document.querySelectorAll(kontrol)) {
        if (norm(e.getAttribute('aria-label')).includes(t) || norm(e.placeholder).includes(t) || norm(e.name).includes(t)) set.add(e);
      }
    }
    return [...set];
  };

  // Normalkan nilai rupiah jadi string bilangan bulat; null kalau bukan angka bulat.
  const angka = (v) => {
    let t = String(v).replace(/rp/gi, '').replace(/\s/g, '');
    if (t === '') return null;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else t = t.replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isInteger(n) ? String(n) : null;
  };

  const setNilai = (el, v) => {
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find((o) => norm(o.textContent) === norm(v) || o.value === v);
      if (!opt) return 'opsi tidak ditemukan';
      el.value = opt.value;
    } else if (el.type === 'checkbox') {
      const mau = ['1', 'true', 'ya', 'y', 'yes'].includes(norm(v));
      if (el.checked !== mau) el.click();
      return '';
    } else {
      if (el.focus) el.focus();
      el.dispatchEvent(new FocusEvent('focus'));
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur'));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    if (el.blur) el.blur();
    return '';
  };

  const ops = {
    status() {
      const nav = performance.getEntriesByType('navigation')[0];
      const teks = ((document.body && document.body.innerText) || '').slice(0, 2000);
      return {
        utama,
        status: nav ? nav.responseStatus || 0 : 0,
        terbatas: /too many requests|terlalu banyak permintaan/i.test(teks),
      };
    },

    async sesi(a) {
      const cari = () => [...document.querySelectorAll('a,button')].filter((x) => norm(x.textContent).includes(norm(a.teks)));
      return { utama, butuhLogin: ((await tunggu(cari, a.ms)) || []).length > 0 };
    },

    klikSSO(a) {
      const l = [...document.querySelectorAll('a,button')].filter((x) => norm(x.textContent).includes(norm(a.teks)));
      if (l.length) {
        l[0].click();
        return { utama, diklik: true };
      }
      return { utama, diklik: false };
    },

    scan() {
      const f = [...document.querySelectorAll(kontrol)].map((e) => ({
        tag: e.tagName.toLowerCase(),
        type: e.type || '',
        name: e.name || '',
        id: e.id || '',
        label: ((e.labels && e.labels[0] && e.labels[0].textContent) || e.getAttribute('aria-label') || e.placeholder || '').trim().slice(0, 60),
        terisi: !!e.value,
        terkunci: !!(e.readOnly || e.disabled),
      }));
      return { frame: utama ? 'utama' : 'iframe', jumlahField: f.length, fields: f };
    },

    async reviewHref(a) {
      const cari = () => [...document.querySelectorAll('a[href]')].filter((x) => norm(x.textContent) === norm(a.teks));
      const l = (await tunggu(cari, a.ms)) || [];
      return {
        jumlah: l.length,
        href: l.length ? new URL(l[0].getAttribute('href'), location.origin).href : '',
      };
    },

    async hitung(a) {
      const b = (await tunggu(() => [...document.querySelectorAll(a.css)], a.ms)) || [];
      return { jumlah: b.length };
    },

    async klikEdit(a) {
      const b = (await tunggu(() => [...document.querySelectorAll(a.css)], a.ms)) || [];
      if (b.length === 1) b[0].click();
      return { jumlah: b.length };
    },

    async usaha(a) {
      const isHeader = (el) => el.hasAttribute('title') && el.nextElementSibling && /^collapsible-/.test(el.nextElementSibling.id || '');
      const headers = (root) => [...root.querySelectorAll('[title]')].filter(isHeader);
      const judul = (h) => norm(h.getAttribute('title'));
      const terbuka = (h) => h.nextElementSibling.hasAttribute('data-expanded');
      const bukaHeader = async (h) => {
        if (terbuka(h)) return true;
        for (const el of [h, h.querySelector('[title]'), h.lastElementChild]) {
          if (!el) continue;
          el.click();
          if (await tunggu(() => terbuka(h), 1500)) return true;
        }
        return false;
      };

      const blok = await tunggu(() => headers(document).find((h) => judul(h) === norm(a.blok)), 10000);
      if (!blok) return { ada: false };
      if (!(await bukaHeader(blok))) return { ada: true, ok: false, pesan: 'Blok usaha tidak bisa dibuka' };
      const grup = await tunggu(() => headers(blok.nextElementSibling).find((h) => judul(h) === norm(a.grup)), 5000);
      if (!grup) return { ada: true, ok: false, pesan: 'Grup daftar usaha tidak ditemukan di dalam blok' };
      if (!(await bukaHeader(grup))) return { ada: true, ok: false, pesan: 'Grup daftar usaha tidak bisa dibuka' };

      const grupK = grup.nextElementSibling;
      const langsung = (h) => {
        const n = h.parentElement && h.parentElement.closest('[id^="collapsible-"]');
        return !!n && (n.id === grupK.id || n.id === grupK.id + '-content');
      };
      // Item sidebar bisa dimuat bertahap setelah grup dibuka.
      // Tunggu jumlah item stabil selama `msTenang` sebelum diambil.
      const kumpulStabil = async (msTenang = 600, msMax = 6000) => {
        const mulai = Date.now();
        let terakhir = -1;
        let waktuStabil = Date.now();
        while (Date.now() - mulai < msMax) {
          const n = headers(grupK).filter(langsung).length;
          if (n !== terakhir) {
            terakhir = n;
            waktuStabil = Date.now();
          } else if (n > 0 && Date.now() - waktuStabil >= msTenang) {
            break;
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        return headers(grupK).filter(langsung);
      };
      const daftar = await kumpulStabil();

      const target = norm(a.nama);
      if (!target) return { ada: true, ok: false, total: daftar.length, pesan: 'nama usaha di Excel kosong' };
      const tanpaKurung = (t) => norm(String(t).replace(/\s*\([^)]*\)\s*$/, ''));
      let cocok = daftar.filter((h) => judul(h) === target);
      if (!cocok.length) cocok = daftar.filter((h) => tanpaKurung(h.getAttribute('title')) === target);
      if (!cocok.length && a.longgar) cocok = daftar.filter((h) => judul(h).includes(target));
      if (cocok.length !== 1) {
        return {
          ada: true,
          ok: false,
          total: daftar.length,
          cocok: cocok.length,
          pesan:
            `usaha yang cocok: ${cocok.length} dari ${daftar.length} (harus tepat 1)` +
            (a.debug
              ? ` | Excel: "${target}" | sidebar: ${daftar
                  .slice(0, 8)
                  .map((h) => '"' + h.getAttribute('title') + '"')
                  .join(', ')}`
              : ''),
        };
      }

      const h = cocok[0];
      const terbukaAwal = terbuka(h);
      let diklikBuka = false;
      let diklikPilih = false;

      if (h.scrollIntoView) h.scrollIntoView({ block: 'center' });

      // --- 1) Buka collapsible kalau belum terbuka (perilaku lama).
      if (!terbukaAwal) diklikBuka = await bukaHeader(h);

      // --- 2) Pilih usaha → memicu SPA memuat form usaha di area utama.
      //     Deteksi pakai id field yang stabil: <varId>#<N>. Kita pakai daftar
      //     id dari CONFIG kalau tersedia; fallback ke awalan generik.
      const prefiks = Array.isArray(a.fieldVarIds) && a.fieldVarIds.length ? a.fieldVarIds : ['biaya_produksi', 'operasional'];
      const adaForm = () => prefiks.some((p) => document.querySelector(`[id^="${p}#"]`));

      if (!adaForm()) {
        // Kandidat klik untuk memilih: <a href> di header, <a href> di konten
        // collapsible, lalu header itu sendiri (fallback).
        const kandidat = [];
        const aHeader = h.querySelector('a[href]');
        if (aHeader) kandidat.push(aHeader);
        const konten = h.nextElementSibling;
        const aKonten = konten && konten.querySelector('a[href]');
        if (aKonten) kandidat.push(aKonten);
        // Fallback: klik header persis seperti bukaHeader.
        for (const el of [h, h.querySelector('[title]'), h.lastElementChild]) {
          if (el) kandidat.push(el);
        }

        for (const el of kandidat) {
          el.click();
          if (await tunggu(adaForm, 2500)) {
            diklikPilih = true;
            break;
          }
        }
      }

      // --- 3) Tunggu form benar-benar ter-render.
      const formMuncul = await tunggu(adaForm, 8000);
      await new Promise((r) => setTimeout(r, 400));

      h.style.outline = '3px solid #16a34a';

      const ctr = [...document.querySelectorAll(kontrol)];
      return {
        ada: true,
        ok: true,
        total: daftar.length,
        cocok: 1,
        terbukaAwal,
        diklik: diklikBuka,
        dipilih: diklikPilih,
        formMuncul: !!formMuncul,
        kontrol: ctr.length,
        terlihat: ctr.filter(terlihat).length,
      };
    },

    async bukaBlok(a) {
      // Buka satu header sidebar level 1 tanpa memilih item.
      // Dipakai untuk blok yang form-nya langsung tampil (mis. Blok P / KK).
      // a.blok        : judul header sidebar (mis. 'SE2026 - P')
      // a.fieldVarIds : array prefix id field untuk deteksi form muncul
      const isHeader = (el) => el.hasAttribute('title') && el.nextElementSibling && /^collapsible-/.test(el.nextElementSibling.id || '');
      const headers = (root) => [...root.querySelectorAll('[title]')].filter(isHeader);
      const judul = (h) => norm(h.getAttribute('title'));
      const terbuka = (h) => h.nextElementSibling.hasAttribute('data-expanded');
      const bukaHeader = async (h) => {
        if (terbuka(h)) return true;
        for (const el of [h, h.querySelector('[title]'), h.lastElementChild]) {
          if (!el) continue;
          el.click();
          if (await tunggu(() => terbuka(h), 1500)) return true;
        }
        return false;
      };

      const blok = await tunggu(() => headers(document).find((h) => judul(h) === norm(a.blok)), 10000);
      if (!blok) return { ada: false };

      const terbukaAwal = terbuka(blok);
      let diklikBuka = false;
      if (!terbukaAwal) diklikBuka = await bukaHeader(blok);

      // Tunggu form muncul di area utama (id polos atau prefix #N)
      const prefiks = Array.isArray(a.fieldVarIds) ? a.fieldVarIds : [];
      const adaForm = () => prefiks.some((p) => document.querySelector(`[id^="${p}#"]`) || document.getElementById(p));
      const formMuncul = prefiks.length ? !!(await tunggu(adaForm, 8000)) : true;

      if (blok.scrollIntoView) blok.scrollIntoView({ block: 'center' });
      blok.style.outline = '3px solid #16a34a';
      await new Promise((r) => setTimeout(r, 400));
      blok.style.outline = '';

      return {
        ada: true,
        ok: true,
        terbukaAwal,
        diklik: diklikBuka,
        formMuncul,
        kontrol: [...document.querySelectorAll(kontrol)].length,
        terlihat: [...document.querySelectorAll(kontrol)].filter(terlihat).length,
      };
    },

    async bacaIdentitas(a) {
      const out = {};
      for (const v of a.varId || []) {
        // Prioritas: [id^="varId#"] (Blok II). Fallback: id polos (Blok P).
        let w = document.querySelector('[id^="' + v + '#"]');
        if (!w) w = document.getElementById(v);
        if (!w) {
          out[v] = null;
          continue;
        }
        const inp = w.querySelector(kontrol);
        out[v] = inp ? String(inp.value || '') : (w.textContent || '').trim().slice(0, 120);
      }
      return { utama, nilai: out };
    },

    async hitungSelisih(a) {
      // a.varIds      : {namaKunci: varIdPrefix} — mis. {gaji:'gaji', biaya_produksi:'biaya_produksi', ...}
      // a.baru        : {varIdPrefix: nilaiBaru} — override dari Excel; field ini pakai nilai baru
      // a.pengeluaran : [namaKunci] — dijumlahkan sebagai total pengeluaran
      // a.pendapatan  : [namaKunci] — dijumlahkan sebagai total pendapatan
      const angkaDesimal = (v) => {
        let t = String(v == null ? '' : v)
          .replace(/rp/gi, '')
          .replace(/\s/g, '');
        if (t === '') return null;
        if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
        else t = t.replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(t)) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      };
      const bacaSatu = (v) => {
        let semua = [...document.querySelectorAll('[id^="' + v + '#"]')].filter(terlihat);
        if (!semua.length) {
          const e = document.getElementById(v);
          if (e && terlihat(e)) semua = [e];
        }
        if (!semua.length) return { nilai: null, ada: false, ambigu: 0 };
        if (semua.length > 1) return { nilai: null, ada: true, ambigu: semua.length };
        const inp = semua[0].querySelector(kontrol);
        const t = inp ? String(inp.value || '') : String(semua[0].textContent || '');
        return { nilai: t, ada: true, ambigu: 0 };
      };

      const rincian = {};
      for (const [k, v] of Object.entries(a.varIds || {})) {
        if (a.baru && Object.prototype.hasOwnProperty.call(a.baru, v)) {
          rincian[k] = {
            varId: v,
            nilai: String(a.baru[v] == null ? '' : a.baru[v]),
            ada: true,
            ambigu: 0,
            dari: 'excel',
          };
        } else {
          rincian[k] = { varId: v, ...bacaSatu(v), dari: 'halaman' };
        }
      }

      const jumlah = (daftar) =>
        (daftar || []).reduce((s, k) => {
          const n = angkaDesimal(rincian[k] && rincian[k].nilai);
          return s + (n === null ? 0 : n);
        }, 0);

      const totalPengeluaran = jumlah(a.pengeluaran);
      const totalPendapatan = jumlah(a.pendapatan);
      const selisih = totalPendapatan - totalPengeluaran;
      return {
        utama,
        totalPengeluaran,
        totalPendapatan,
        selisih,
        minus: selisih < 0,
        rincian,
      };
    },

    async akhirCatatan(a) {
      // a.blok             : judul sidebar blok catatan (mis. 'CATATAN')
      // a.idToggle         : id kontainer switch anomali (mis. 'cek_anomali_button')
      // a.klikKirim        : true = klik tombol Kirim utama (memunculkan dialog)
      // a.konfirmasiKirim  : true = klik Kirim di dalam dialog (MENYIMPAN);
      //                      false = klik Batal di dialog (tidak menyimpan).
      const isHeader = (el) => el.hasAttribute('title') && el.nextElementSibling && /^collapsible-/.test(el.nextElementSibling.id || '');
      const headers = (root) => [...root.querySelectorAll('[title]')].filter(isHeader);
      const judul = (h) => norm(h.getAttribute('title'));

      const targetVisible = () => {
        const r = document.getElementById(a.idToggle);
        return r && terlihat(r) ? r : null;
      };

      // 1) Buka sidebar CATATAN.
      const blok = await tunggu(() => headers(document).find((h) => judul(h) === norm(a.blok)), 8000);
      if (!blok) return { ok: false, pesan: `blok "${a.blok}" tidak ditemukan di sidebar` };

      if (blok.scrollIntoView) blok.scrollIntoView({ block: 'center' });
      blok.style.outline = '3px solid #2563eb';
      await new Promise((r) => setTimeout(r, 400));

      let klikKe = 0;
      if (!targetVisible()) {
        for (const el of [blok, blok.querySelector('[title]'), blok.lastElementChild]) {
          if (!el) continue;
          el.click();
          klikKe++;
          if (await tunggu(targetVisible, 2500)) break;
        }
      }
      blok.style.outline = '';

      const root = await tunggu(targetVisible, 4000);
      if (!root)
        return {
          ok: false,
          pesan: `#${a.idToggle} tidak muncul setelah klik sidebar "${a.blok}" (klik: ${klikKe})`,
        };

      // 2) Aktifkan switch anomali kalau belum.
      const sw = root.querySelector('input[role="switch"]') || root.querySelector('input[type="checkbox"]');
      if (!sw) return { ok: false, pesan: 'switch input tidak ditemukan di dalam ' + a.idToggle };

      const statusSebelum = sw.getAttribute('aria-checked') === 'true' || sw.checked === true;
      let diubah = false;

      if (!statusSebelum) {
        const ctrl = root.querySelector('[id$="-control"]') || sw.parentElement || sw;
        if (ctrl.scrollIntoView) ctrl.scrollIntoView({ block: 'center' });
        ctrl.style.outline = '3px solid #2563eb';
        ctrl.click();
        diubah = !!(await tunggu(() => sw.getAttribute('aria-checked') === 'true' || sw.checked === true, 3000));
        ctrl.style.outline = '';
      }

      const statusSesudah = sw.getAttribute('aria-checked') === 'true' || sw.checked === true;
      if (!statusSesudah)
        return {
          ok: false,
          sebelum: statusSebelum,
          sesudah: statusSesudah,
          diubah,
          pesan: 'switch tidak berubah menjadi true',
        };

      // 3) Cari tombol Kirim utama.
      const tombol = await tunggu(cariTombolKirim, 5000);
      if (!tombol)
        return {
          ok: true,
          sebelum: statusSebelum,
          sesudah: statusSesudah,
          diubah,
          dikirim: false,
          dari: null,
          dialog: null,
          pesan: 'tombol Kirim tidak ditemukan (baik di bawah form maupun navbar)',
        };

      const btn = tombol.el;
      if (btn.scrollIntoView) btn.scrollIntoView({ block: 'center' });
      btn.style.outline = '3px solid #dc2626';
      await new Promise((r) => setTimeout(r, 700));

      if (!a.klikKirim) {
        btn.style.outline = '';
        return {
          ok: true,
          sebelum: statusSebelum,
          sesudah: statusSesudah,
          diubah,
          dikirim: false,
          dari: tombol.dari,
          dialog: null,
          pesan: `tombol Kirim terdeteksi di ${tombol.dari} (tidak diklik — klikKirim=false)`,
        };
      }

      // 4) Klik tombol Kirim utama → tunggu dialog konfirmasi.
      btn.click();
      btn.style.outline = '';

      const dialog = await tunggu(cariDialogKirim, 6000);
      if (!dialog)
        return {
          ok: true,
          sebelum: statusSebelum,
          sesudah: statusSesudah,
          diubah,
          dikirim: false,
          dari: tombol.dari,
          dialog: null,
          pesan: 'tombol Kirim diklik tetapi dialog konfirmasi tidak muncul',
        };

      const ringkasan = bacaRingkasanDialog(dialog);

      // 5) Mode inspeksi: biarkan dialog ringkasan terbuka.
      if (a.tahanDialog) {
        return {
          ok: true,
          sebelum: statusSebelum,
          sesudah: statusSesudah,
          diubah,
          dikirim: false,
          dari: tombol.dari,
          dialog: { ...ringkasan, ditahan: true, dikonfirmasi: false, dibatalkan: false },
        };
      }

      // 5b) Klik Kirim pada dialog ringkasan.
      const btnBatal = [...dialog.querySelectorAll('button')].find((b) => !b.getAttribute('aria-label') && norm(b.textContent) === 'batal');
      const btnKonfirm = [...dialog.querySelectorAll('button')].find((b) => !b.getAttribute('aria-label') && norm(b.textContent) === 'kirim');
      const btnDismiss = dialog.querySelector('button[aria-label="Dismiss"]');

      if (a.konfirmasiKirim && btnKonfirm) {
        btnKonfirm.click();
        const dialogKonfirmasi = await tunggu(cariDialogKonfirmasiKirim, 5000);
        if (!dialogKonfirmasi) {
          return {
            ok: false,
            sebelum: statusSebelum,
            sesudah: statusSesudah,
            diubah,
            dikirim: false,
            dari: tombol.dari,
            dialog: { ...ringkasan, dikonfirmasi: false, dibatalkan: false },
            pesan: 'dialog Konfirmasi Kirim tidak muncul setelah tombol Kirim diklik',
          };
        }

        const btnKonfirmasiFinal = [...dialogKonfirmasi.querySelectorAll('button')].find(
          (b) => !b.getAttribute('aria-label') && norm(b.textContent) === 'konfirmasi',
        );
        if (!btnKonfirmasiFinal) {
          return {
            ok: false,
            sebelum: statusSebelum,
            sesudah: statusSesudah,
            diubah,
            dikirim: false,
            dari: tombol.dari,
            dialog: { ...ringkasan, konfirmasiKedua: true, dikonfirmasi: false, dibatalkan: false },
            pesan: 'tombol Konfirmasi tidak ditemukan',
          };
        }

        btnKonfirmasiFinal.click();
        await tunggu(() => !cariDialogKonfirmasiKirim() && !cariDialogKirim(), 5000);
        await new Promise((r) => setTimeout(r, 800));
        return {
          ok: true,
          sebelum: statusSebelum,
          sesudah: statusSesudah,
          diubah,
          dikirim: true,
          dari: tombol.dari,
          dialog: { ...ringkasan, konfirmasiKedua: true, dikonfirmasi: true, dibatalkan: false },
        };
      } else if (btnBatal) {
        btnBatal.click();
      } else if (btnDismiss) {
        btnDismiss.click();
      } else {
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }

      await tunggu(() => !cariDialogKirim(), 5000);
      await new Promise((r) => setTimeout(r, 800));

      return {
        ok: true,
        sebelum: statusSebelum,
        sesudah: statusSesudah,
        diubah,
        dikirim: false,
        dari: tombol.dari,
        dialog: { ...ringkasan, dikonfirmasi: false, dibatalkan: true },
      };
    },
    async cek(a) {
      return cekAtauIsi(a, false);
    },
    async isi(a) {
      return cekAtauIsi(a, true);
    },

    async catatanField(a) {
      // a.varId, a.teks, a.simpan
      if (!a || !a.varId) return { ok: false, pesan: 'varId tidak diberikan' };
      let w = [...document.querySelectorAll('[id^="' + a.varId + '#"]')].filter(terlihat);
      if (!w.length) {
        const el = document.getElementById(a.varId);
        if (el && terlihat(el)) w = [el];
      }
      if (!w.length) return { ok: false, pesan: `field ${a.varId} tidak ditemukan` };
      if (w.length > 1) return { ok: false, pesan: `field ${a.varId} ambigu (${w.length})` };
      const inp = w[0].querySelector(kontrol);
      if (!inp) return { ok: false, pesan: `input ${a.varId} tidak ditemukan` };
      return bukaDialogCatatan(inp, a.varId, a.teks, !!a.simpan, w[0]);
    },

    async kirimForm(a) {
      // a.kirim: true = klik tombol Kirim di dalam dialog (MENYIMPAN)
      //          false = klik Batal (dry-run, tidak menyimpan)
      const tombol = await tunggu(cariTombolKirim, 5000);
      if (!tombol) return { ok: false, pesan: 'tombol Kirim tidak ditemukan' };

      tombol.el.click();
      const dialog = await tunggu(cariDialogKirim, 6000);
      if (!dialog) return { ok: false, pesan: 'dialog konfirmasi tidak muncul', dari: tombol.dari };

      const ringkasan = bacaRingkasanDialog(dialog);
      const btnBatal = [...dialog.querySelectorAll('button')].find((b) => !b.getAttribute('aria-label') && norm(b.textContent) === 'batal');
      const btnKonfirm = [...dialog.querySelectorAll('button')].find((b) => !b.getAttribute('aria-label') && norm(b.textContent) === 'kirim');
      const btnDismiss = dialog.querySelector('button[aria-label="Dismiss"]');

      let dikonfirmasi = false;
      if (a.kirim && btnKonfirm) {
        btnKonfirm.click();
        dikonfirmasi = true;
      } else if (btnBatal) {
        btnBatal.click();
      } else if (btnDismiss) {
        btnDismiss.click();
      } else {
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }

      await tunggu(() => !cariDialogKirim(), 5000);
      await new Promise((r) => setTimeout(r, 800));

      return {
        ok: true,
        dikonfirmasi,
        dari: tombol.dari,
        ringkasan: { ...ringkasan, dikonfirmasi, dibatalkan: !dikonfirmasi },
      };
    },
  };

  // ---- Catatan dry-run ----
  // Klik tombol "Catatan" di field, isi textarea, tutup dialog. TIDAK klik Simpan.
  async function bukaDialogCatatan(el, varId, teks, simpan, wadahField) {
    // Cari kontainer pertanyaan terkini (mungkin sudah re-render setelah input).
    let root = wadahField && terlihat(wadahField) ? wadahField : null;
    if (!root && varId) root = el.closest('[id^="' + varId + '#"]');
    if (!root && varId) root = document.getElementById(varId);
    if (!root && varId) {
      const semua = [...document.querySelectorAll('[id^="' + varId + '#"]')].filter(terlihat);
      if (semua.length === 1) root = semua[0];
    }
    if (!root) root = el.parentElement || document.body;

    // Ambil tombol Catatan yang VISIBLE (ada dua di DOM: mobile & desktop).
    const tombols = [...root.querySelectorAll('button[title="Catatan"]')].filter(terlihat);
    if (!tombols.length) return { ok: false, pesan: 'tombol Catatan tidak ditemukan' };

    tombols[0].click();

    // Tunggu dialog Catatan muncul (Radix menambahkan [data-expanded] saat terbuka).
    const dialog = await tunggu(() => {
      const d = [...document.querySelectorAll('[role="dialog"][data-expanded]')].filter(terlihat);
      return d.length ? d[d.length - 1] : null;
    }, 4000);
    if (!dialog) return { ok: false, pesan: 'dialog Catatan tidak muncul' };

    // Tunggu textarea di dalam dialog.
    const ta = await tunggu(() => {
      const t = dialog.querySelector('textarea');
      return t && terlihat(t) ? t : null;
    }, 3000);
    if (!ta) {
      await tutupDialog(dialog);
      return { ok: false, pesan: 'textarea catatan tidak ditemukan' };
    }

    ta.style.outline = '3px solid #2563eb';
    if (ta.scrollIntoView) ta.scrollIntoView({ block: 'center' });
    if (ta.focus) ta.focus();
    ta.dispatchEvent(new FocusEvent('focus'));
    ta.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, teks);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));

    const tertahan = String(ta.value) === String(teks);
    ta.style.outline = '';

    if (simpan) {
      const btnSimpan = dialog.querySelector('button[title="Simpan"]');
      if (btnSimpan) {
        btnSimpan.click();
        await tunggu(() => !dialog.hasAttribute('data-expanded'), 3000);
        return { ok: tertahan, tertahan, teks, dikirim: true };
      }
    }

    await tutupDialog(dialog);

    return { ok: tertahan, tertahan, teks, dikirim: false };
  }

  async function tutupDialog(dialog) {
    const btn = dialog.querySelector('button[aria-label="Dismiss"]') || dialog.querySelector('button[aria-label="Close"]');
    if (btn) btn.click();
    else dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // Tunggu dialog benar-benar tertutup (atribut data-expanded hilang).
    await tunggu(() => !dialog.hasAttribute('data-expanded'), 2000);
    return true;
  }

  async function cekAtauIsi(a, isIsi) {
    const nama = Object.keys(a.fields);
    await tunggu(() => nama.some((k) => cariSemua(a.fields[k]).some(terlihat)), 10000);
    const out = {};
    let sebelumnya = null;

    for (const k of nama) {
      // Highlight bergerak berurutan: lepas highlight field sebelumnya.
      if (sebelumnya) sebelumnya.style.outline = '';

      const sp = a.fields[k];
      const semua = cariSemua(sp);
      if (!semua.length) {
        out[k] = { ketemu: false };
        continue;
      }
      const wadah = sp.varId ? semua.map((e) => (e.closest('[id^="' + sp.varId + '#"]') || {}).id || '') : undefined;
      const tampak = semua.filter(terlihat);
      if (!tampak.length) {
        out[k] = { ketemu: true, tersembunyi: true, wadah };
        continue;
      }
      if (tampak.length > 1) {
        out[k] = { ketemu: true, ambigu: tampak.length, wadah };
        continue;
      }

      const el = tampak[0];
      sebelumnya = el;
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      el.style.outline = '3px solid #16a34a';
      // Jeda singkat supaya highlight terlihat oleh pengguna sebelum lanjut.
      await new Promise((r) => setTimeout(r, 350));

      out[k] = {
        ketemu: true,
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        name: el.name || '',
        terkunci: !!(el.readOnly || el.disabled),
        wadah,
      };
      if (!isIsi) continue;

      // ---- isi nilai field (dry-run) ----
      const mentah = a.nilai[k];
      const modeAngka = sp.tipe === 'angka';
      const biasa = el.tagName !== 'SELECT' && el.type !== 'checkbox';
      const baru = modeAngka ? angka(mentah) : String(mentah).trim();
      out[k].lama = String(el.value || '').slice(0, 60);
      if (mentah === undefined || mentah === null || String(mentah).trim() === '') {
        out[k].diisi = false;
        out[k].alasan = 'sel kosong';
      } else if (baru === null) {
        out[k].diisi = false;
        out[k].alasan = 'nilai Excel bukan angka bulat';
      } else if (out[k].terkunci) {
        out[k].diisi = false;
        out[k].alasan = 'field terkunci';
      } else if (biasa && (modeAngka ? angka(el.value) : String(el.value)) === baru) {
        out[k].diisi = false;
        out[k].sama = true;
      } else {
        const err = setNilai(el, baru);
        if (err) {
          out[k].diisi = false;
          out[k].alasan = err;
        } else if (!biasa) out[k].diisi = true;
        else {
          await new Promise((r) => setTimeout(r, 300));
          out[k].diisi = (modeAngka ? angka(el.value) : String(el.value)) === baru;
          if (!out[k].diisi) out[k].alasan = 'nilai tidak tertahan setelah diisi';
        }
      }

      // ---- catatan dry-run: hanya kalau mode isi dan ada konfigurasi ----
      if (a.catatan && a.catatan.aktif && a.catatan.teks) {
        try {
          out[k].catatan = await bukaDialogCatatan(el, sp.varId, a.catatan.teks, !!a.catatan.simpan);
        } catch (e) {
          out[k].catatan = { ok: false, pesan: 'error: ' + (e && e.message) };
        }
      }
    }

    // Lepas highlight terakhir setelah semua field selesai.
    if (sebelumnya) sebelumnya.style.outline = '';
    return out;
  }

  window.__ops = ops;
})();
