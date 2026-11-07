/* geo.js — conversões MGRS / UTM / WGS84 (UMD: browser e Node). Usa proj4 para UTM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/proj4/proj4.js'));
  else root.Geo = factory(root.proj4);
})(typeof self !== 'undefined' ? self : this, function (proj4) {
  'use strict';
  var BANDS = 'CDEFGHJKLMNPQRSTUVWX';
  var ROWS = 'ABCDEFGHJKLMNPQRSTUV';
  var COLS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];

  function utmDef(zone, hem) {
    return '+proj=utm +zone=' + zone + (hem === 'S' ? ' +south' : '') + ' +datum=WGS84 +units=m +no_defs';
  }
  function utmToLatLon(zone, hem, east, north) {
    if (!Number.isInteger(zone) || zone < 1 || zone > 60) throw new Error('A zona UTM deve estar entre 1 e 60.');
    if (hem !== 'N' && hem !== 'S') throw new Error('Hemisfério inválido.');
    if (!(east >= 100000 && east <= 900000) || !(north >= 0 && north <= 10000000))
      throw new Error('Coordenadas UTM fora dos intervalos esperados (Este 100 000–900 000; Norte 0–10 000 000).');
    var p = proj4(utmDef(zone, hem), proj4.WGS84, [east, north]);
    return { lat: p[1], lon: p[0] };
  }
  function zoneFor(lat, lon) {
    var z = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32;
    if (lat >= 72 && lat < 84) {
      if (lon >= 0 && lon < 9) z = 31; else if (lon >= 9 && lon < 21) z = 33;
      else if (lon >= 21 && lon < 33) z = 35; else if (lon >= 33 && lon < 42) z = 37;
    }
    return Math.min(60, Math.max(1, z));
  }
  function bandFor(lat) {
    if (lat < -80 || lat > 84) throw new Error('UTM/MGRS só são definidos entre 80°S e 84°N.');
    return BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
  }
  function latLonToUtm(lat, lon) {
    var band = bandFor(lat), zone = zoneFor(lat, lon), hem = lat >= 0 ? 'N' : 'S';
    var p = proj4(proj4.WGS84, utmDef(zone, hem), [lon, lat]);
    return { zone: zone, band: band, hem: hem, east: p[0], north: p[1] };
  }
  function latLonToMgrs(lat, lon, digitsPerAxis) {
    var d = digitsPerAxis === undefined ? 5 : digitsPerAxis;
    var u = latLonToUtm(lat, lon);
    u.east = Math.round(u.east * 1000) / 1000; u.north = Math.round(u.north * 1000) / 1000; // evita 99999 por ruído numérico
    var col = COLS[(u.zone - 1) % 3][Math.floor(u.east / 100000) - 1];
    var row = ROWS[(Math.floor(u.north / 100000) + (u.zone % 2 === 0 ? 5 : 0)) % 20];
    var cell = Math.pow(10, 5 - d);
    var e = Math.floor((u.east % 100000) / cell), n = Math.floor((u.north % 100000) / cell);
    var pad = function (v) { return d ? String(v).padStart(d, '0') : ''; };
    return (u.zone < 10 ? '0' : '') + u.zone + u.band + ' ' + col + row + (d ? ' ' + pad(e) + ' ' + pad(n) : '');
  }
  function mgrsToLatLon(s) {
    var v = String(s).toUpperCase().replace(/[\s-]/g, '');
    var m = v.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{0,10})$/);
    if (!m) throw new Error('Formato MGRS inválido. Exemplo: 31U DQ 48251 11932');
    var zone = +m[1], band = m[2], sq = m[3], digits = m[4];
    if (zone < 1 || zone > 60) throw new Error('Zona MGRS fora do intervalo 1–60.');
    if (digits.length % 2) throw new Error('A referência MGRS deve ter igual número de dígitos Este e Norte.');
    var col = COLS[(zone - 1) % 3].indexOf(sq[0]);
    if (col < 0) throw new Error('A coluna de 100 km não é válida para esta zona MGRS.');
    var row = ROWS.indexOf(sq[1]);
    if (row < 0) throw new Error('A linha de 100 km MGRS não é válida.');
    var half = digits.length / 2, cell = Math.pow(10, 5 - half);
    var e = (col + 1) * 100000 + (half ? Number(digits.slice(0, half)) * cell : 0);
    var n0 = ((row - (zone % 2 === 0 ? 5 : 0) + 20) % 20) * 100000 + (half ? Number(digits.slice(half)) * cell : 0);
    var bi = BANDS.indexOf(band), minlat = -80 + bi * 8, maxlat = band === 'X' ? 84 : minlat + 8;
    var hem = bi >= 10 ? 'N' : 'S', found = [];
    for (var k = 0; k <= 5; k++) {
      var n = n0 + 2000000 * k;
      if (n + cell / 2 > 10000000) break;
      var pos = utmToLatLon(zone, hem, e + cell / 2, n + cell / 2);
      if (pos.lat >= minlat - 0.002 && pos.lat <= maxlat + 0.002) found.push({ pos: pos, n: n });
    }
    if (found.length !== 1) throw new Error('Referência MGRS fora da faixa geográfica indicada ou ambígua. Confirma a zona, banda e quadrícula.');
    var f = found[0], c = function (de, dn) { var q = utmToLatLon(zone, hem, e + de, f.n + dn); return [q.lat, q.lon]; };
    return { lat: f.pos.lat, lon: f.pos.lon, precision: cell, zone: zone, hem: hem,
             bounds: [c(0, 0), c(cell, 0), c(cell, cell), c(0, cell)] };
  }

  /* Entrada flexível: "38.7223, -9.1393" | "38.7223 -9.1393" | DMS "38°43'20.3"N 9°8'21.5"W" */
  function parseLatLon(text) {
    var t = String(text).trim().replace(/[′’']/g, "'").replace(/[″”]/g, '"');
    if (!t) throw new Error('Introduz latitude e longitude.');
    var pre = /^\s*[NSEWnsew]/.test(t), num = '(-?\\d+(?:[.,]\\d+)?)';
    var core = num + "\\s*(?:°|º|d|\\s)\\s*(?:" + num.replace('-?', '') + "\\s*(?:'|m)\\s*)?(?:" + num.replace('-?', '') + '\\s*(?:"|s)\\s*)?';
    var dms = new RegExp(pre ? '([NSEWnsew])\\s*' + core : core + '([NSEWnsew])?', 'g');
    var parts = [], mt;
    if (/[°º'"NSEWnsew]/.test(t.replace(/\s/g, ''))) {
      while ((mt = dms.exec(t)) !== null) {
        if (mt[0].trim() === '') { dms.lastIndex++; continue; }
        var o = pre ? 1 : 0, deg = parseFloat(mt[1 + o].replace(',', '.')), min = mt[2 + o] ? parseFloat(mt[2 + o].replace(',', '.')) : 0,
            sec = mt[3 + o] ? parseFloat(mt[3 + o].replace(',', '.')) : 0, h = ((pre ? mt[1] : mt[4]) || '').toUpperCase();
        var val = Math.abs(deg) + min / 60 + sec / 3600;
        if (deg < 0 || h === 'S' || h === 'W') val = -val;
        parts.push({ v: val, h: h });
      }
      if (parts.length !== 2) throw new Error('Não consegui ler a latitude e a longitude. Exemplo: 38°43\'20.3"N 9°8\'21.5"W');
      var a = parts[0], b = parts[1];
      if (a.h === 'E' || a.h === 'W' || b.h === 'N' || b.h === 'S') { var tmp = a; a = b; b = tmp; }
      return { lat: a.v, lon: b.v };
    }
    var raw = t.trim(), pair;
    if (raw.indexOf(';') >= 0) pair = raw.split(';');
    else if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(raw)) pair = raw.split(',');
    else pair = raw.split(/\s+/);
    var nums = pair.map(function (x) { return Number(x.trim().replace(',', '.')); });
    if (nums.length !== 2 || nums.some(function (x) { return !Number.isFinite(x); }))
      throw new Error('Formato inválido. Exemplo: 38.7223, -9.1393');
    return { lat: nums[0], lon: nums[1] };
  }
  function toDms(n, isLat) {
    var h = isLat ? (n >= 0 ? 'N' : 'S') : (n >= 0 ? 'E' : 'W'), a = Math.abs(n);
    var d = Math.floor(a), mm = Math.floor((a - d) * 60), s = ((a - d) * 60 - mm) * 60;
    if (s.toFixed(2) === '60.00') { s = 0; mm++; } if (mm === 60) { mm = 0; d++; }
    return d + '° ' + mm + '′ ' + s.toFixed(2) + '″ ' + h;
  }
  function validate(p) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)
      throw new Error('Latitude ou longitude fora do intervalo válido.');
    return p;
  }

  /* ---------- Cartografia portuguesa (cadernetas prediais) ----------
     Transformações de Helmert (7 parâmetros) via proj4: precisão estimada de alguns metros.
     As grelhas oficiais da DGT (NTv2) dariam precisão sub-métrica (previsto para a v2). */
  var SYSTEMS = {
    hgm: { label: 'Hayford-Gauss militar · Datum Lisboa (EPSG:20790, origem 200 km / 300 km)',
           def: '+proj=tmerc +lat_0=39.66666666666666 +lon_0=-8.131906111111112 +k=1 +x_0=200000 +y_0=300000 +ellps=intl +towgs84=-288.885,-91.744,126.244,-1.691,0.41,-0.211,-4.598 +units=m +no_defs' },
    tm06: { label: 'PT-TM06 / ETRS89 (EPSG:3763)',
            def: '+proj=tmerc +lat_0=39.66825833333333 +lon_0=-8.133108333333334 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
    d73: { label: 'Datum 73 · Hayford-Gauss modificado (EPSG:27493)',
           def: '+proj=tmerc +lat_0=39.66666666666666 +lon_0=-8.131906111111112 +k=1 +x_0=180.598 +y_0=-86.99 +ellps=intl +towgs84=-239.749,88.181,30.488,0.263,0.082,1.211,2.229 +units=m +no_defs' }
  };
  function xyToLatLon(sys, x, y) {
    var s = SYSTEMS[sys]; if (!s) throw new Error('Sistema de referência desconhecido.');
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Introduz as coordenadas X e Y.');
    if (Math.abs(x) > 1000000 || Math.abs(y) > 1000000) throw new Error('X/Y fora do intervalo plausível para Portugal (verifica separadores de milhares e decimais).');
    var p = proj4(s.def, proj4.WGS84, [x, y]);
    return { lat: p[1], lon: p[0] };
  }
  /* aproximação grosseira de Portugal continental, só para assinalar hipóteses implausíveis */
  function inMainlandPT(p) { return p.lat >= 36.9 && p.lat <= 42.2 && p.lon >= -9.6 && p.lon <= -6.1; }
  /* "87.420,00" | "87420,00" | "87 420,5" | "87420.5" | "-104.327,50" */
  function parsePtNumber(str) {
    var s = String(str).replace(/[\s\u00a0]/g, '');
    if (!s) return NaN;
    if (!/^[-+]?[\d.,]+$/.test(s)) return NaN;
    var dot = s.indexOf('.') >= 0, com = s.indexOf(',') >= 0;
    if (dot && com) { if (s.lastIndexOf(',') < s.lastIndexOf('.')) return NaN; s = s.replace(/\./g, '').replace(',', '.'); }
    else if (com) { if ((s.match(/,/g) || []).length > 1) return NaN; s = s.replace(',', '.'); }
    else if (dot && /^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var v = Number(s); return Number.isFinite(v) ? v : NaN;
  }
  /* linha com um par X/Y: "87.420,00 193.257,00" | "87420,00;193257,00" | tab */
  function parseXYLine(line) {
    var t = String(line).trim(), parts;
    if (/[\t;]/.test(t)) parts = t.split(/[\t;]+/); else parts = t.split(/\s+/);
    parts = parts.map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length !== 2) throw new Error('Esperava dois valores (X e Y) separados por espaço, tab ou ponto e vírgula.');
    var x = parsePtNumber(parts[0]), y = parsePtNumber(parts[1]);
    if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('Não consegui ler os números.');
    return { x: x, y: y };
  }
  return { parseXYLine: parseXYLine, SYSTEMS: SYSTEMS, xyToLatLon: xyToLatLon, inMainlandPT: inMainlandPT, parsePtNumber: parsePtNumber, utmToLatLon: utmToLatLon, latLonToUtm: latLonToUtm, latLonToMgrs: latLonToMgrs,
           mgrsToLatLon: mgrsToLatLon, parseLatLon: parseLatLon, toDms: toDms, validate: validate, zoneFor: zoneFor };
});
