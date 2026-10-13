'use strict';
// State global panel. Dimuat sekali; modul lain baca/tulis binding ini.
let rows = [],
  kolom = [],
  hasil = [];
let workTabId = null,
  workWinId = null,
  stopFlag = false;

class SesiHabis extends Error {}
class Berhenti extends Error {}
