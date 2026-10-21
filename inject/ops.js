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
    const navbar = [...document.querySelectorAll('button')].filter((b) => terlihat(b) && norm(b.textContent) === 'kirim' && !b.closest('aside') && !b.closest('[role="dialog"]'));
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

  const cariDialogBerhasilSubmit = () => {
    const ds = [...document.querySelectorAll('[role="alertdialog"], [role="dialog"]')].filter(terlihat);
    return ds.find((d) => {
      const teks = norm(d.textContent);
      return /assignment/.test(teks) && /berhasil/.test(teks) && /(disubmit|dikirim|terkirim)/.test(teks);
    }) || null;
  };

  const cariTombolTetapDiHalaman = (dialog) =>
    [...dialog.querySelectorAll('button')].find((b) => /tetap di halaman/i.test(norm(b.textContent))) || null;

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
  // Nilai berupa tanda strip ("-", "–", "—") dinormalkan menjadi "0".
  const angka = (v) => {
    let t = String(v == null ? '' : v)
      .replace(/rp/gi, '')
      .replace(/\s/g, '');
    if (t === '') return null;
    if (/^[-–—]+$/.test(t)) return '0';
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

    async revoke(a) {
      const cari = () => [...document.querySelectorAll('button')].filter((b) => terlihat(b) && [...b.querySelectorAll('svg')].some((svg) => svg.classList.contains('tabler-icon-rotate-clockwise')));
      const tombol = (await tunggu(cari, a.ms)) || [];
      if (tombol.length !== 1) return { jumlah: tombol.length, dikonfirmasi: false };
      tombol[0].focus();
      tombol[0].click();

      const dialog = await tunggu(() => {
        const ds = [...document.querySelectorAll('[role="alertdialog"]')].filter(terlihat);
        return (
          ds.find((d) => {
            const t = d.querySelector('[id$="-title"], [id$="-label"], h2');
            return t && norm(t.textContent) === 'revoke assignment?';
          }) || null
        );
      }, 5000);
      if (!dialog) return { jumlah: 1, dikonfirmasi: false, pesan: 'dialog Revoke tidak muncul' };

      const konfirmasi = [...dialog.querySelectorAll('button')].find((b) => !b.getAttribute('aria-label') && norm(b.textContent) === 'konfirmasi');
      if (!konfirmasi) return { jumlah: 1, dikonfirmasi: false, pesan: 'tombol Konfirmasi Revoke tidak ditemukan' };

      konfirmasi.click();
      return { jumlah: 1, dikonfirmasi: true };
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

      // Helper pembersih kurung dan karakter ekstra
      const bersihkan = (t) =>
        norm(
          String(t || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\([^)]*\)/g, ' '),
        )
          .replace(/\s+/g, ' ')
          .trim();
      const targetBersih = bersihkan(target);

      // Tahap 1: Kumpulkan kandidat dari sidebar
      // 1. Judul item persis sama
      let kandidat = daftar.filter((h) => judul(h) === target);
      // 2. Judul item sama setelah kurung dibersihkan
      if (!kandidat.length) {
        kandidat = daftar.filter((h) => bersihkan(judul(h)) === targetBersih);
      }
      // 3. Loose match: salah satu memuat yang lain
      if (!kandidat.length || a.longgar) {
        const tambahan = daftar.filter((h) => {
          const jB = bersihkan(judul(h));
          return jB && targetBersih && (jB.includes(targetBersih) || targetBersih.includes(jB) || judul(h).includes(target) || target.includes(judul(h)));
        });
        kandidat = [...new Set([...kandidat, ...tambahan])];
      }
      // 4. Fallback: jika hanya ada 1 item di sidebar seluruhnya, masukkan untuk diverifikasi di form
      if (!kandidat.length && daftar.length === 1) {
        kandidat = [daftar[0]];
      }

      if (!kandidat.length) {
        return {
          ada: true,
          ok: false,
          total: daftar.length,
          cocok: 0,
          pesan: `usaha di sidebar tidak ditemukan untuk "${a.nama}" (ada ${daftar.length}: ${daftar
            .slice(0, 8)
            .map((h) => '"' + h.getAttribute('title') + '"')
            .join(', ')})`,
        };
      }

      // Deteksi form ter-render
      const prefiks = Array.isArray(a.fieldVarIds) && a.fieldVarIds.length ? a.fieldVarIds : ['biaya_produksi', 'operasional'];
      const adaForm = () => prefiks.some((p) => document.querySelector(`[id^="${p}#"]`));

      const pilihHeader = async (h) => {
        if (h.scrollIntoView) h.scrollIntoView({ block: 'center' });
        const terbukaAwal = terbuka(h);
        let diklikBuka = false;
        let diklikPilih = false;
        if (!terbukaAwal) diklikBuka = await bukaHeader(h);

        const kandidatKlik = [];
        const aHeader = h.querySelector('a[href]');
        if (aHeader) kandidatKlik.push(aHeader);
        const konten = h.nextElementSibling;
        const aKonten = konten && konten.querySelector('a[href]');
        if (aKonten) kandidatKlik.push(aKonten);
        for (const el of [h, h.querySelector('[title]'), h.lastElementChild]) {
          if (el) kandidatKlik.push(el);
        }

        for (const el of kandidatKlik) {
          el.click();
          await new Promise((r) => setTimeout(r, 300));
          if (adaForm()) {
            diklikPilih = true;
            break;
          }
        }
        await tunggu(adaForm, 8000);
        await new Promise((r) => setTimeout(r, 400));
        return { diklikBuka, diklikPilih, terbukaAwal };
      };

      const bacaNamaForm = () => {
        const idList = [a.varIdIdentitas, 'nama_komersial', 'nama_usaha'].filter(Boolean);
        for (const v of idList) {
          const wadah = [...document.querySelectorAll('[id^="' + v + '#"]')].filter(terlihat);
          const langsung = document.getElementById(v);
          if (langsung && terlihat(langsung)) wadah.push(langsung);
          for (const w of wadah) {
            const inp = w.querySelector(kontrol);
            const val = inp ? String(inp.value || '') : String(w.textContent || '');
            if (val.trim()) return val.trim();
          }
        }
        return '';
      };

      const cekNamaCocok = (namaForm, namaExcel) => {
        const f = norm(namaForm);
        const e = norm(namaExcel);
        if (!f || !e) return false;
        if (f === e) return true;

        const fPolos = f
          .replace(/[<>()\[\]]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const ePolos = e
          .replace(/[<>()\[\]]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (fPolos === ePolos) return true;
        if (fPolos.includes(ePolos) || ePolos.includes(fPolos)) return true;

        const matchOwner = String(namaExcel).match(/[<(]([^>)]+)[>)]/);
        const baseExcel = bersihkan(namaExcel);
        if (matchOwner) {
          const owner = norm(matchOwner[1]);
          if (fPolos.includes(baseExcel) && fPolos.includes(owner)) return true;
        }
        return false;
      };

      // Tahap 2: Verifikasi form identitas untuk setiap kandidat sidebar
      let terpilih = null;
      let infoTerpilih = null;
      let namaFormTerverifikasi = '';
      const riwayatCek = [];

      for (let i = 0; i < kandidat.length; i++) {
        const h = kandidat[i];
        const info = await pilihHeader(h);
        const namaForm = bacaNamaForm();
        const judulSidebar = h.getAttribute('title') || '';
        riwayatCek.push(`sidebar "${judulSidebar}" → form "${namaForm || '(kosong)'}"`);

        // Cocok jika nama komersial di form sesuai,
        // atau jika kandidat hanya 1 dan judul sidebar sudah persis sama / form tidak memuat field nama
        if (cekNamaCocok(namaForm, a.nama) || (kandidat.length === 1 && (!namaForm || judul(h) === target))) {
          terpilih = h;
          infoTerpilih = info;
          namaFormTerverifikasi = namaForm || judulSidebar;
          break;
        }
      }

      if (!terpilih) {
        return {
          ada: true,
          ok: false,
          total: daftar.length,
          cocok: 0,
          pesan: `nama usaha di form tidak cocok dengan Excel "${a.nama}" (diperiksa: ${riwayatCek.join('; ')})`,
        };
      }

      terpilih.style.outline = '3px solid #16a34a';
      const ctr = [...document.querySelectorAll(kontrol)];
      return {
        ada: true,
        ok: true,
        total: daftar.length,
        cocok: 1,
        terbukaAwal: infoTerpilih ? infoTerpilih.terbukaAwal : false,
        diklik: infoTerpilih ? infoTerpilih.diklikBuka : false,
        dipilih: infoTerpilih ? infoTerpilih.diklikPilih : false,
        formMuncul: true,
        namaForm: namaFormTerverifikasi,
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
      await new Promise((r) => setTimeout(r, Number(a.jedaMs) || 400));
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

    async bacaNilai(a) {
      const varId = a && a.varId;
      if (!varId) return { utama, ketemu: false, pesan: 'varId tidak diberikan' };
      let semua = [...document.querySelectorAll('[id^="' + varId + '#"]')].filter(terlihat);
      if (!semua.length) {
        const el = document.getElementById(varId);
        if (el && terlihat(el)) semua = [el];
      }
      if (!semua.length) return { utama, ketemu: false, nilai: '' };
      if (semua.length > 1) return { utama, ketemu: true, ambigu: semua.length, nilai: '' };
      const el = semua[0];
      const inp = el.querySelector(kontrol);
      return { utama, ketemu: true, ambigu: 0, nilai: inp ? String(inp.value || '') : String(el.textContent || '').trim() };
    },

    async bacaCatatan(a) {
      const varId = a && a.varId;
      if (!varId) return { utama, ok: false, pesan: 'varId tidak diberikan' };
      let w = [...document.querySelectorAll('[id^="' + varId + '#"]')].filter(terlihat);
      if (!w.length) {
        const el = document.getElementById(varId);
        if (el && terlihat(el)) w = [el];
      }
      if (!w.length) return { utama, ok: false, pesan: `field ${varId} tidak ditemukan` };
      if (w.length > 1) return { utama, ok: false, pesan: `field ${varId} ambigu (${w.length})` };
      const inp = w[0].querySelector(kontrol);
      if (!inp) return { utama, ok: false, pesan: `input ${varId} tidak ditemukan` };
      return { utama, ...(await bacaRiwayatField(inp, varId, w[0])) };
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
        if (/^[-–—]+$/.test(t)) return 0;
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
      await new Promise((r) => setTimeout(r, Number(a.jedaMs) || 400));

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
      await new Promise((r) => setTimeout(r, Number(a.jedaMs) || 700));

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

        const btnKonfirmasiFinal = [...dialogKonfirmasi.querySelectorAll('button')].find((b) => !b.getAttribute('aria-label') && norm(b.textContent) === 'konfirmasi');
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
        // Dialog sukses bisa muncul setelah dialog konfirmasi tertutup. Tunggu
        // tanda sukses itu sendiri agar loop tidak pindah baris terlalu cepat.
        const dialogBerhasil = await tunggu(cariDialogBerhasilSubmit, Number(a.tungguBerhasilMs) || 15000);
        if (!dialogBerhasil) {
          return {
            ok: false,
            sebelum: statusSebelum,
            sesudah: statusSesudah,
            diubah,
            dikirim: false,
            dari: tombol.dari,
            dialog: { ...ringkasan, konfirmasiKedua: true, dikonfirmasi: false, dibatalkan: false },
            pesan: 'dialog sukses pengiriman tidak terdeteksi setelah konfirmasi akhir; status kirim belum dapat dipastikan',
          };
        }

        const tombolTetap = cariTombolTetapDiHalaman(dialogBerhasil);
        if (tombolTetap) {
          tombolTetap.click();
          const tertutup = await tunggu(() => !dialogBerhasil.isConnected || !terlihat(dialogBerhasil), 5000);
          if (!tertutup) {
            return {
              ok: true,
              sebelum: statusSebelum,
              sesudah: statusSesudah,
              diubah,
              dikirim: true,
              dari: tombol.dari,
              dialog: { ...ringkasan, konfirmasiKedua: true, dikonfirmasi: true, dibatalkan: false, suksesTerdeteksi: true },
              pesan: 'dialog sukses terdeteksi tetapi tetap terbuka setelah memilih Tetap di Halaman; proses dilanjutkan',
            };
          }
        }
        return {
          ok: true,
          sebelum: statusSebelum,
          sesudah: statusSesudah,
          diubah,
          dikirim: true,
          dari: tombol.dari,
          dialog: { ...ringkasan, konfirmasiKedua: true, dikonfirmasi: true, dibatalkan: false, suksesTerdeteksi: true },
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

    // Field KBLI adalah radio group, bukan input teks/select. Kode dibandingkan
    // dari atribut value, sedangkan deskripsi diambil dari label terkait.
    async kbli(a) {
      const varId = a && a.varId;
      const normKode = (v) => {
        const t = String(v == null ? '' : v)
          .trim()
          .replace(/\.0+$/, '');
        // Kode KBLI selalu 5 digit; pertahankan/pulihkan nol di depan.
        return /^\d+$/.test(t) ? (t.length <= 5 ? t.padStart(5, '0') : t) : '';
      };
      const labelRadio = (input) => {
        if (!input) return '';
        const id = input.getAttribute('aria-labelledby');
        const l = id ? document.getElementById(id) : document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        return (l ? l.textContent : '').trim() || ((input.parentElement && input.parentElement.textContent) || '').trim();
      };
      // Beberapa halaman memakai value internal (mis. 143211), sedangkan
      // kode yang terlihat pengguna adalah 43211 di label pilihan.
      const kodeRadio = (input) => {
        const dariLabel = labelRadio(input).match(/\b\d{5}\b/);
        return normKode(dariLabel ? dariLabel[0] : input && input.value);
      };
      // Tunggu form benar-benar selesai dirender. Jangan langsung jatuh ke
      // Master KBLI saat field kbli_genai masih dalam proses memuat.
      let wadah = [];
      const mulaiTungguField = Date.now();
      while (Date.now() - mulaiTungguField < 4000) {
        wadah = varId ? [...document.querySelectorAll('[id^="' + varId + '#"]')].filter(terlihat) : [];
        if (!wadah.length && varId) {
          const e = document.getElementById(varId);
          if (e && terlihat(e)) wadah = [e];
        }
        if (wadah.length && wadah.some((w) => w.querySelector('input[type="radio"]'))) break;
        if ([...document.querySelectorAll('[id^="kbli#"]')].some(terlihat) && Date.now() - mulaiTungguField > 3000) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!wadah.length) {
        const masterAwal = [...document.querySelectorAll('[id^="kbli#"]')].find(terlihat);
        if (masterAwal) wadah = [masterAwal];
      }
      if (!wadah.length) return { utama, ketemu: false, pesan: `field ${varId || 'KBLI'} tidak ditemukan setelah menunggu form` };
      if (wadah.length > 1) return { utama, ketemu: true, ambigu: wadah.length, pesan: 'field KBLI lebih dari satu' };
      const root = wadah[0];
      if (root.scrollIntoView) root.scrollIntoView({ block: 'center', behavior: 'smooth' });
      root.style.outline = '3px solid #2563eb';
      const prosesCatatan = async (input, catatanVarId = varId, catatanRoot = root) => {
        if (!a.catatan || !a.catatan.teks || !input) return null;
        const freshRoot = [...document.querySelectorAll('[id^="' + catatanVarId + '#"]')].find(terlihat) || document.getElementById(catatanVarId) || catatanRoot;
        const freshInput = (freshRoot && (freshRoot.querySelector('input[type="radio"]') || freshRoot.querySelector('textarea'))) || input;
        return bukaDialogCatatan(freshInput, catatanVarId, a.catatan.teks, !!a.catatan.simpan, freshRoot, {
          lewatJika: [a.catatan.teks],
        });
      };
      const pilihMaster = async (masterRoot, lamaKode, baruKode, bukaCatatan) => {
        const ambilArea = () => [...document.querySelectorAll('[id^="kbli#"] textarea')].find(terlihat) || masterRoot.querySelector('textarea');
        const kodeTerpilih = (el) => {
          if (!el) return '';
          // Pilihan tersimpan pada placeholder berformat [F][43211]....
          // area.value adalah teks pencarian dan tidak membuktikan pilihan.
          const terpilih = String(el.placeholder || '').match(/\[[A-Z]\]\[?(\d{5})\]?/i);
          return terpilih ? terpilih[1] : '';
        };
        let area = ambilArea();
        const tombolBuka = [...masterRoot.querySelectorAll('button[aria-haspopup="dialog"]')].find(terlihat);
        if (!area || !tombolBuka) return { utama, ketemu: false, pesan: 'kontrol Master KBLI tidak lengkap' };
        if (masterRoot.scrollIntoView) masterRoot.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Pada kondisi tertentu nilai terpilih disimpan di placeholder, bukan
        // value textarea. Hanya placeholder berformat kode yang membuktikan pilihan.
        const teksLama = String(area.placeholder || area.value || '').trim();
        const kodeLama = kodeTerpilih(area);
        if (kodeLama && kodeLama === baruKode) {
          masterRoot.style.outline = '3px solid #16a34a';
          if (masterRoot.scrollIntoView) masterRoot.scrollIntoView({ block: 'center', behavior: 'smooth' });
          await new Promise((r) => setTimeout(r, Number(a.catatan && a.catatan.delayMs) || 1500));
          const catatanSama = await bukaCatatan(area, 'kbli', masterRoot);
          masterRoot.style.outline = '';
          return {
            utama,
            ketemu: true,
            ambigu: 0,
            sekarang: kodeLama,
            lama: lamaKode,
            baru: baruKode,
            diubah: false,
            sama: true,
            baruLabel: teksLama,
            pilihanMaster: true,
            catatan: catatanSama,
          };
        }
        if (kodeLama && lamaKode && kodeLama !== lamaKode) return { utama, ketemu: true, sama: false, diubah: false, alasan: `KBLI Master halaman ${kodeLama} berbeda dari KBLI lama Excel ${lamaKode}` };
        tombolBuka.click();
        area = ambilArea() || area;
        area.focus();
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(area, baruKode);
        area.dispatchEvent(new Event('input', { bubbles: true }));
        area.dispatchEvent(new Event('change', { bubbles: true }));
        const idPopover = tombolBuka.getAttribute('aria-controls');
        const popoverSel = idPopover ? `#${CSS.escape(idPopover)}` : '[role="dialog"][data-expanded]';
        const statusHasil = () => {
          const dialog = [...document.querySelectorAll(popoverSel)].filter(terlihat).pop();
          if (!dialog) return { selesai: false, memuat: true, opsi: [] };
          const memuat = [...dialog.querySelectorAll('span')].some((s) => /memuat opsi/i.test(s.textContent || ''));
          const semua = [...dialog.querySelectorAll('[role="listbox"] [role="option"]')].filter(terlihat);
          const exact = semua.filter((x) => normKode(x.getAttribute('data-key')) === baruKode);
          const cocok = exact.length ? exact : semua.filter((x) => {
            const teks = String(x.textContent || '').replace(/\s+/g, ' ');
            return new RegExp('\\b' + baruKode + '\\b').test(teks);
          });
          return { selesai: !memuat, memuat, opsi: cocok, dialog };
        };
        const cariOpsi = () => {
          const s = statusHasil();
          return s.selesai ? s.opsi : [];
        };
        const opsi = await (async () => {
          const batas = Date.now() + 60000;
          let kosongStabilSejak = 0;
          while (Date.now() < batas) {
            const s = statusHasil();
            if (!s.selesai || s.memuat) {
              kosongStabilSejak = 0;
              await new Promise((r) => setTimeout(r, 250));
              continue;
            }
            if (!s.opsi.length) {
              if (!kosongStabilSejak) kosongStabilSejak = Date.now();
              // Tunggu rerender/debounce setelah spinner hilang sebelum
              // menyimpulkan kode memang tidak ditemukan.
              if (Date.now() - kosongStabilSejak >= 8000) return { status: 'kosong', opsi: [] };
              await new Promise((r) => setTimeout(r, 250));
              continue;
            }
            const pertama = cariOpsi();
            const tanda = `${pertama[0].getAttribute('data-key')}|${pertama[0].textContent}`;
            await new Promise((r) => setTimeout(r, 600));
            const kedua = cariOpsi();
            if (kedua.length && `${kedua[0].getAttribute('data-key')}|${kedua[0].textContent}` === tanda) return { status: 'ada', opsi: kedua };
          }
          return { status: 'timeout', opsi: [] };
        })();
        if (opsi.status === 'timeout') {
          masterRoot.style.outline = '';
          return { utama, ketemu: true, sama: false, diubah: false, hentikanProses: true, alasan: `hasil pencarian KBLI ${baruKode} masih memuat setelah 60 detik; proses dihentikan agar baris berikutnya tidak berjalan` };
        }
        if (opsi.status !== 'ada' || !opsi.opsi.length) {
          masterRoot.style.outline = '';
          return { utama, ketemu: true, sama: false, diubah: false, alasan: `opsi Master KBLI untuk ${baruKode} tidak ditemukan setelah hasil pencarian stabil` };
        }
        let tertahan = null;
        let targetLabel = '';
        for (let percobaan = 1; percobaan <= 3 && !tertahan; percobaan++) {
          const target = cariOpsi().find((x) => normKode(x.getAttribute('data-key')) === baruKode) || cariOpsi()[0];
          if (!target) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          targetLabel = target.textContent || '';
          target.style.outline = '3px solid #16a34a';
          if (target.scrollIntoView) target.scrollIntoView({ block: 'center' });
          await new Promise((r) => setTimeout(r, 350));
          // Klik satu kali pada <li> terbaru; event sintetis berurutan dapat
          // membuat komponen memilih lalu menutup/mengganti hasil sebelum click.
          target.click();
          tertahan = await tunggu(() => {
            area = ambilArea() || area;
            const kodeAktif = kodeTerpilih(area);
            const dialogMasihTerbuka = !![...document.querySelectorAll('[role="dialog"][data-expanded]')].find(terlihat);
            return kodeAktif === baruKode && !dialogMasihTerbuka ? area : null;
          }, 2500);
        }
        const catatan = tertahan
          ? (await new Promise((r) => setTimeout(r, Number(a.catatan && a.catatan.delayMs) || 1500)), await bukaCatatan(area, 'kbli', masterRoot))
          : null;
        masterRoot.style.outline = '';
        return {
          utama,
          ketemu: true,
          ambigu: 0,
          sekarang: kodeLama,
          lama: lamaKode,
          baru: baruKode,
          diubah: !!tertahan,
          sama: false,
          baruLabel: String(area.value || targetLabel || '').trim(),
          pilihanMaster: true,
          catatan,
          alasan: tertahan ? '' : 'nilai Master KBLI tidak tertahan setelah dipilih',
        };
      };
      const radios = [...root.querySelectorAll('input[type="radio"]')];
      const masterRoot = [...document.querySelectorAll('[id^="kbli#"]')].find(terlihat);
      if (!radios.length) {
        if (!masterRoot) return { utama, ketemu: false, pesan: 'pilihan radio KBLI dan field Master KBLI tidak ditemukan' };
        const lamaKode = normKode(a.lama);
        const baruKode = normKode(a.baru);
        if (!lamaKode || !baruKode) return { utama, ketemu: true, alasan: 'kode KBLI lama atau baru Excel tidak valid' };
        return pilihMaster(masterRoot, lamaKode, baruKode, prosesCatatan);
      }
      const terpilih = radios.find((r) => r.checked || r.closest('[data-checked]')) || null;
      const sorot = (input) => {
        if (!input) return;
        const id = input.getAttribute('aria-labelledby');
        const label = id ? document.getElementById(id) : null;
        const visual = label || input.parentElement;
        if (visual) {
          visual.style.outline = '3px solid #16a34a';
          visual.style.outlineOffset = '3px';
          if (visual.scrollIntoView) visual.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      };
      sorot(terpilih);
      const sekarang = terpilih ? kodeRadio(terpilih) : '';
      if (masterRoot && terpilih && (/master kbli/i.test(labelRadio(terpilih)) || sekarang === '999999')) {
        const lamaKode = normKode(a.lama);
        const baruKode = normKode(a.baru);
        if (!lamaKode || !baruKode) return { utama, ketemu: true, alasan: 'kode KBLI lama atau baru Excel tidak valid' };
        return pilihMaster(masterRoot, lamaKode, baruKode, prosesCatatan);
      }
      const hasil = {
        utama,
        ketemu: true,
        ambigu: 0,
        sekarang,
        sekarangLabel: labelRadio(terpilih),
        pilihan: radios.map((r) => ({ kode: kodeRadio(r), value: normKode(r.value), label: labelRadio(r) })),
        diubah: false,
        sama: false,
      };
      const lama = normKode(a.lama);
      const baru = normKode(a.baru);
      if (!lama || !baru) {
        hasil.alasan = !lama ? 'kode KBLI lama Excel tidak valid' : 'kode KBLI baru Excel tidak valid';
        return hasil;
      }
      hasil.lama = lama;
      hasil.baru = baru;
      if (sekarang !== lama) {
        hasil.alasan = `KBLI halaman ${sekarang || '(kosong)'} berbeda dari KBLI lama Excel ${lama}`;
        return hasil;
      }
      if (sekarang === baru) {
        hasil.sama = true;
        hasil.baruLabel = terpilih ? labelRadio(terpilih) : '';
        hasil.disorot = true;
        await new Promise((r) => setTimeout(r, Number(a.catatan && a.catatan.delayMs) || 1500));
        hasil.catatan = await prosesCatatan(terpilih);
        return hasil;
      }
      const target = radios.find((r) => kodeRadio(r) === baru || normKode(r.value) === baru);
      if (!target) {
        // Kode baru mungkin memang tidak tersedia sebagai radio pada
        // kbli_genai. Dalam kondisi itu, alihkan ke opsi "Pilih dari Master
        // KBLI", tunggu kontrol pencarian tampil, lalu cari kode yang sama.
        const radioMaster = radios.find((r) => /pilih dari master\s*kbli|master\s*kbli/i.test(labelRadio(r)));
        if (!radioMaster) {
          hasil.alasan = `kode KBLI baru ${baru} tidak ada di pilihan halaman dan opsi Master KBLI tidak tersedia`;
          return hasil;
        }
        radioMaster.click();
        const masterSiap = await tunggu(() => {
          const segar = [...document.querySelectorAll('[id^="kbli#"]')].find(terlihat);
          return segar && segar.querySelector('textarea') && segar.querySelector('button[aria-haspopup="dialog"]')
            ? segar
            : null;
        }, 8000);
        if (!masterSiap) {
          hasil.alasan = 'opsi Pilih dari Master KBLI dipilih tetapi kontrol pencarian tidak muncul';
          return hasil;
        }
        const hasilMaster = await pilihMaster(masterSiap, lama, baru, prosesCatatan);
        return {
          ...hasil,
          ...hasilMaster,
          sekarang,
          sekarangLabel: labelRadio(terpilih),
          pilihanMaster: true,
        };
      }
      if (target.disabled) {
        hasil.alasan = 'pilihan KBLI baru terkunci';
        return hasil;
      }
      target.click();
      await new Promise((r) => setTimeout(r, 400));
      const sesudah = radios.find((r) => r.checked || r.closest('[data-checked]'));
      sorot(sesudah || target);
      hasil.diubah = !!sesudah && kodeRadio(sesudah) === baru;
      hasil.sesudah = sesudah ? kodeRadio(sesudah) : '';
      hasil.baruLabel = labelRadio(target);
      hasil.disorot = true;
      if (!hasil.diubah) hasil.alasan = 'pilihan KBLI tidak tertahan setelah dipilih';
      if (hasil.diubah) {
        await new Promise((r) => setTimeout(r, Number(a.catatan && a.catatan.delayMs) || 1500));
        hasil.catatan = await prosesCatatan(sesudah || target);
      }
      return hasil;
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
      return bukaDialogCatatan(inp, a.varId, a.teks, !!a.simpan, w[0], a); // [UBAH] a.lewatJika dipakai di dalam
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

  async function bukaDialogCatatan(el, varId, teks, simpan, wadahField, opsi) {
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
    }, Number(opsi && opsi.dialogBukaMs) || 4000);
    if (!dialog) return { ok: false, pesan: 'dialog Catatan tidak muncul' };

    // Tunggu textarea di dalam dialog.
    const ta = await tunggu(() => {
      const t = dialog.querySelector('textarea');
      return t && terlihat(t) ? t : null;
    }, Number(opsi && opsi.textareaMs) || 3000);
    if (!ta) {
      await tutupDialog(dialog, Number(opsi && opsi.dialogTutupMs) || 2000);
      return { ok: false, pesan: 'textarea catatan tidak ditemukan' };
    }

    // Cek riwayat catatan sebelum menulis. Pesan terakhir dari SIAPA PUN
    // (diri sendiri atau user lain) yang cocok dengan `lewatJika` → tulis dilewati.
    await tunggu(() => bacaRiwayat(dialog).length, 1200);
    const riwayat = bacaRiwayat(dialog);
    const terakhir = riwayat.length ? riwayat[riwayat.length - 1] : null;
    if (opsi && Array.isArray(opsi.lewatJika) && terakhir && opsi.lewatJika.includes(terakhir.teks)) {
      await tutupDialog(dialog, Number(opsi && opsi.dialogTutupMs) || 2000);
      return {
        ok: true,
        dilewati: true,
        dilewatiDari: terakhir.milikSendiri ? 'sendiri' : 'orang-lain',
        teks,
        terakhir,
        jumlahRiwayat: riwayat.length,
      };
    }

    // [BARU] Cek apakah teks catatan yang sama sudah ada di riwayat dialog
    const teksNorm = norm(teks);
    const adaDiRiwayat = riwayat.some((r) => norm(r.teks) === teksNorm);
    if (adaDiRiwayat) {
      await tutupDialog(dialog, Number(opsi && opsi.dialogTutupMs) || 2000);
      return {
        ok: true,
        dilewati: true,
        sudahAda: true,
        teks,
        terakhir,
        jumlahRiwayat: riwayat.length,
      };
    }

    ta.style.outline = '3px solid #2563eb';
    if (ta.scrollIntoView) ta.scrollIntoView({ block: 'center' });
    if (ta.focus) ta.focus();
    ta.dispatchEvent(new FocusEvent('focus'));
    ta.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, teks);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, Number(opsi && opsi.jedaMs) || 400));

    const tertahan = String(ta.value) === String(teks);
    ta.style.outline = '';

    if (simpan) {
      const btnSimpan = dialog.querySelector('button[title="Simpan"]');
      if (btnSimpan) {
        btnSimpan.click();
        await tunggu(() => !dialog.hasAttribute('data-expanded'), Number(opsi && opsi.dialogTutupMs) || 3000);
        // Pada sebagian halaman, tombol Simpan hanya menyimpan catatan
        // tetapi dialog tetap terbuka. Tutup secara eksplisit agar alur
        // berikutnya (termasuk tombol Kirim utama) tidak tertahan oleh dialog.
        if (dialog.hasAttribute('data-expanded')) await tutupDialog(dialog, Number(opsi && opsi.dialogTutupMs) || 2000);
        return { ok: tertahan, tertahan, teks, dikirim: true, baru: true, terakhir };
      }
    }

    await tutupDialog(dialog, Number(opsi && opsi.dialogTutupMs) || 2000);

    return { ok: tertahan, tertahan, teks, dikirim: false, baru: true, terakhir };
  }

  async function bacaRiwayatField(el, varId, wadahField) {
    const root = wadahField && terlihat(wadahField) ? wadahField : el.closest('[id^="' + varId + '#"]') || el.parentElement;
    const tombol = [...(root ? root.querySelectorAll('button[title="Catatan"]') : [])].filter(terlihat);
    if (!tombol.length) return { ok: false, pesan: 'tombol Catatan tidak ditemukan' };
    tombol[0].click();
    const dialog = await tunggu(() => [...document.querySelectorAll('[role="dialog"][data-expanded]')].filter(terlihat).pop() || null, 4000);
    if (!dialog) return { ok: false, pesan: 'dialog Catatan tidak muncul' };
    await tunggu(() => bacaRiwayat(dialog).length, 1200);
    const riwayat = bacaRiwayat(dialog);
    const terakhir = riwayat.length ? riwayat[riwayat.length - 1] : null;
    await tutupDialog(dialog);
    return { ok: true, riwayat, terakhir, adaCatatan: riwayat.length > 0 };
  }

  async function tutupDialog(dialog, timeoutMs = 2000) {
    const btn = dialog.querySelector('button[aria-label="Dismiss"]') || dialog.querySelector('button[aria-label="Close"]');
    if (btn) btn.click();
    else dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // Tunggu dialog benar-benar tertutup (atribut data-expanded hilang).
    await tunggu(() => !dialog.hasAttribute('data-expanded'), timeoutMs);
    return true;
  }

  async function cekAtauIsi(a, isIsi) {
    const nama = Object.keys(a.fields);
    await tunggu(() => nama.some((k) => cariSemua(a.fields[k]).some(terlihat)), Number(a.tungguFieldMs) || 10000);
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
      await new Promise((r) => setTimeout(r, Number(a.jedaMs) || 350));

      out[k] = {
        ketemu: true,
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        name: el.name || '',
        nilai: String(el.value == null ? '' : el.value),
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
      // [BARU] bentuk ternormalisasi untuk log perubahan (null bila tidak bisa dinormalkan / bukan field angka)
      out[k].lamaAngka = modeAngka ? angka(el.value) : null;
      out[k].baruAngka = modeAngka ? baru : null;
      if (a.hanyaCatatan) {
        // Flag 0 hanya meninggalkan catatan; nilai form tidak boleh disentuh.
        out[k].sama = modeAngka ? angka(el.value) === baru : String(el.value) === baru;
      } else if (mentah === undefined || mentah === null || String(mentah).trim() === '') {
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
          await new Promise((r) => setTimeout(r, Number(a.jedaMs) || 300));
          out[k].diisi = (modeAngka ? angka(el.value) : String(el.value)) === baru;
          if (!out[k].diisi) out[k].alasan = 'nilai tidak tertahan setelah diisi';
        }
      }

      // ---- catatan dry-run: hanya kalau mode isi dan ada konfigurasi ----
      // [BARU] hanyaJikaBerhasil: catatan hanya untuk field yang benar-benar terisi
      // (atau sudah sama bila jikaSama true). Tanpa flag ini perilaku lama dipertahankan.
      const cfgCatatan = a.catatan && a.catatan.perField ? a.catatan.perField[k] : a.catatan;
      const bolehCatatan = !cfgCatatan || !cfgCatatan.hanyaJikaBerhasil || out[k].diisi || (out[k].sama && cfgCatatan.jikaSama);
      if (cfgCatatan && cfgCatatan.aktif && cfgCatatan.teks && bolehCatatan) {
        try {
          out[k].catatan = await bukaDialogCatatan(el, sp.varId, cfgCatatan.teks, !!cfgCatatan.simpan, undefined, cfgCatatan);
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
