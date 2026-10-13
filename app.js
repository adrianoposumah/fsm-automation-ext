'use strict';
logger.init(document.getElementById('log'));
pasangPanel();
log(typeof XLSX === 'undefined' ? 'PERINGATAN: pustaka Excel gagal dimuat (lib/xlsx.full.min.js).' : 'Panel siap.');
if (CONFIG.HOST.startsWith('GANTI')) log('Isi HOST di config.js terlebih dahulu.');
