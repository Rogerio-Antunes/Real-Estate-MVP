(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var mode = 'cad', latest = null, map, marker, cellPoly, altMarkers = [];

  /* ---------- separadores ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  function setTab(m, focus) {
    mode = m;
    tabs.forEach(function (t) { var on = t.dataset.tab === m; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    ['cad', 'lista', 'mgrs', 'utm', 'll'].forEach(function (k) { $('p-' + k).classList.toggle('active', k === m); });
    var needDatum = m === 'mgrs' || m === 'utm'; $('datum-wrap').hidden = !needDatum; if (!needDatum) $('datum-warn').hidden = true; else onDatum();
    showError(''); $('batch').hidden = true;
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { setTab(t.dataset.tab); });
    t.addEventListener('keydown', function (e) {
      var n = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : -1;
      if (n >= 0) { e.preventDefault(); setTab(tabs[n].dataset.tab, true); }
    });
  });
  function onDatum() { $('datum-warn').hidden = !(mode === 'mgrs' || mode === 'utm') || $('datum').value === 'wgs84'; }
  $('datum').addEventListener('change', onDatum);

  function showError(msg) { var e = $('error'); e.textContent = msg; e.hidden = !msg; }
  function clearAlts() { altMarkers.forEach(function (m) { map.removeLayer(m); }); altMarkers = []; $('alts').hidden = true; $('altList').textContent = ''; }
  function hideResult() { if (map) clearAlts(); $('result').hidden = true; $('batch').hidden = true; if (marker) { map.removeLayer(marker); marker = null; } if (cellPoly) { map.removeLayer(cellPoly); cellPoly = null; } }

  /* ---------- mapa ---------- */
  function initMap() {
    if (!window.L) return;
    map = L.map('map', { scrollWheelZoom: false }).setView([39.6, -8.0], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    map.on('focus', function () { map.scrollWheelZoom.enable(); }); map.on('blur', function () { map.scrollWheelZoom.disable(); });
  }
  function drawMap(p) {
    if (!map) return;
    if (marker) map.removeLayer(marker); if (cellPoly) { map.removeLayer(cellPoly); cellPoly = null; }
    marker = L.marker([p.lat, p.lon]).addTo(map);
    if (p.bounds && p.precision >= 10) { cellPoly = L.polygon(p.bounds, { color: '#0c5f8a', weight: 2, fillOpacity: .15 }).addTo(map); map.fitBounds(cellPoly.getBounds().pad(.6), { maxZoom: 17 }); }
    else map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16));
  }

  /* ---------- conversão ---------- */
  function fmtPrec(m) { return m >= 1000 ? (m / 1000) + ' km' : m + ' m'; }
  function read() {
    if (mode === 'cad') {
      var x = G.parsePtNumber($('cadX').value), y = G.parsePtNumber($('cadY').value);
      if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('Não consegui ler X e Y. Exemplo: 87.420,00 e 193.257,00');
      var sys = $('cadSys').value, p = G.xyToLatLon(sys, x, y);
      p.precision = null; p.cad = { x: x, y: y, sys: sys }; return p;
    }
    if (mode === 'mgrs') { if ($('datum').value !== 'wgs84') throw new Error('Datum não suportado nesta versão.'); return G.mgrsToLatLon($('mgrsVal').value); }
    if (mode === 'utm') {
      if ($('datum').value !== 'wgs84') throw new Error('Datum não suportado nesta versão.');
      var z = $('zone').value, e = $('east').value, n = $('north').value;
      if (z === '' || e === '' || n === '') throw new Error('Preenche zona, Este e Norte.');
      var p = G.utmToLatLon(Number(z), $('hem').value, Number(e), Number(n)); p.precision = null; return p;
    }
    var q = G.parseLatLon($('llVal').value); q.precision = null; return q;
  }
  var G = window.Geo;
  function convert() {
    if (mode === 'lista') return convertList();
    try {
      var p = G.validate(read()); latest = p;
      var pos = p.lat.toFixed(7) + ', ' + p.lon.toFixed(7);
      $('decimal').textContent = pos;
      $('dms').textContent = G.toDms(p.lat, true) + '  ·  ' + G.toDms(p.lon, false);
      var outOfUtm = p.lat < -80 || p.lat > 84;
      $('o-mgrs').textContent = outOfUtm ? 'fora do alcance UTM/MGRS' : G.latLonToMgrs(p.lat, p.lon, 5);
      if (outOfUtm) $('o-utm').textContent = 'fora do alcance UTM/MGRS';
      else { var u = G.latLonToUtm(p.lat, p.lon); $('o-utm').textContent = u.zone + u.band + ' ' + Math.round(u.east) + ' E  ' + Math.round(u.north) + ' N'; }
      $('precision').textContent = p.cad ? 'Interpretado como: ' + G.SYSTEMS[p.cad.sys].label + '. Transformação de Datum por parâmetros de Helmert (precisão estimada: alguns metros); a posição na caderneta é tipicamente aproximada.' : p.precision ? 'Centro da quadrícula MGRS · resolução nominal: ' + fmtPrec(p.precision) : 'Coordenadas WGS84; a precisão depende da origem dos dados.';
      $('maps').href = 'https://www.google.com/maps/search/?api=1&query=' + p.lat.toFixed(8) + '%2C' + p.lon.toFixed(8);
      $('osm').href = 'https://www.openstreetmap.org/?mlat=' + p.lat.toFixed(8) + '&mlon=' + p.lon.toFixed(8) + '#map=17/' + p.lat.toFixed(8) + '/' + p.lon.toFixed(8);
      showError(''); $('result').hidden = false; drawMap(p); showAlts(p); writeHash();
    } catch (err) { hideResult(); showError(err.message); }
  }
  function showAlts(p) {
    clearAlts(); if (!p.cad) return;
    var ul = $('altList'), bounds = [[p.lat, p.lon]];
    Object.keys(G.SYSTEMS).forEach(function (k) {
      var q = G.xyToLatLon(k, p.cad.x, p.cad.y), inside = G.inMainlandPT(q), li = document.createElement('li');
      var t = document.createElement('b'); t.textContent = (k === p.cad.sys ? '▶ ' : '') + G.SYSTEMS[k].label; li.appendChild(t);
      li.appendChild(document.createTextNode(q.lat.toFixed(6) + ', ' + q.lon.toFixed(6) + ' · '));
      var st = document.createElement('span'); st.className = inside ? 'ok' : 'bad';
      st.textContent = inside ? 'na área aproximada de Portugal continental (junto à fronteira pode ser Espanha)' : 'fora de Portugal continental (improvável)'; li.appendChild(st);
      li.appendChild(document.createTextNode(' · '));
      var a = document.createElement('a'); a.href = 'https://www.google.com/maps/search/?api=1&query=' + q.lat.toFixed(8) + '%2C' + q.lon.toFixed(8);
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Google Maps ↗'; li.appendChild(a); ul.appendChild(li);
      if (k !== p.cad.sys && inside && map && !(Math.abs(q.lat - p.lat) < 2e-4 && Math.abs(q.lon - p.lon) < 2e-4)) {
        var m = L.circleMarker([q.lat, q.lon], { radius: 8, color: '#8a98a8', fillColor: '#8a98a8', fillOpacity: .7 }).bindTooltip(G.SYSTEMS[k].label).addTo(map); altMarkers.push(m); bounds.push([q.lat, q.lon]);
      }
    });
    $('alts').hidden = false;
    if (map && bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }
  var batchRows = [];
  function convertList() {
    hideResult(); showError('');
    var lines = $('listaVal').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) { showError('Cola pelo menos uma linha com X e Y.'); return; }
    if (lines.length > 500) { showError('Máximo de 500 linhas de cada vez.'); return; }
    var tb = document.querySelector('#batchTable tbody'); tb.textContent = ''; batchRows = []; var okN = 0, warnN = 0;
    lines.forEach(function (ln, i) {
      var tr = document.createElement('tr'), td = function (t) { var c = document.createElement('td'); c.textContent = t; tr.appendChild(c); return c; };
      td(String(i + 1));
      try {
        var xy = G.parseXYLine(ln), p = G.xyToLatLon('hgm', xy.x, xy.y), inside = G.inMainlandPT(p);
        td(xy.x.toLocaleString('pt-PT', { minimumFractionDigits: 2 })); td(xy.y.toLocaleString('pt-PT', { minimumFractionDigits: 2 }));
        td(p.lat.toFixed(6) + ', ' + p.lon.toFixed(6) + (inside ? '' : '  ⚠ fora de Portugal continental'));
        var c = document.createElement('td'), a = document.createElement('a');
        a.href = 'https://www.google.com/maps/search/?api=1&query=' + p.lat.toFixed(8) + '%2C' + p.lon.toFixed(8); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Google Maps ↗'; c.appendChild(a); tr.appendChild(c);
        batchRows.push({ n: i + 1, x: xy.x, y: xy.y, lat: p.lat, lon: p.lon, aviso: inside ? '' : 'fora de Portugal continental' }); okN++; if (!inside) warnN++;
      } catch (e) { var c2 = td(ln + ' — ' + e.message); c2.className = 'err'; c2.colSpan = 4; batchRows.push({ n: i + 1, x: '', y: '', lat: '', lon: '', aviso: 'erro: ' + e.message }); }
      tb.appendChild(tr);
    });
    $('batchSummary').textContent = okN + ' de ' + lines.length + ' convertidas' + (warnN ? ' · ' + warnN + ' com aviso' : '') + '. Sistema: Hayford-Gauss militar, Datum Lisboa (WGS84).';
    $('batch').hidden = false;
    if (map) { var pts = batchRows.filter(function (r) { return r.lat !== ''; }); if (marker) { map.removeLayer(marker); marker = null; }
      pts.forEach(function (r) { altMarkers.push(L.marker([r.lat, r.lon]).bindTooltip('#' + r.n).addTo(map)); });
      if (pts.length) map.fitBounds(pts.map(function (r) { return [r.lat, r.lon]; }), { padding: [40, 40], maxZoom: 16 }); }
  }
  $('batchCsv').addEventListener('click', function () {
    if (!batchRows.length) return;
    var rows = ['n;x;y;latitude;longitude;aviso'].concat(batchRows.map(function (r) { return [r.n, r.x, r.y, r.lat === '' ? '' : r.lat.toFixed(7), r.lon === '' ? '' : r.lon.toFixed(7), '"' + r.aviso.replace(/"/g, '""') + '"'].join(';'); }));
    download('cadernetas.csv', 'text/csv', '\ufeff' + rows.join('\r\n') + '\r\n');
  });
  $('batchCopy').addEventListener('click', function () {
    if (!batchRows.length) return;
    copyText(batchRows.map(function (r) { return [r.n, r.x, r.y, r.lat === '' ? '' : r.lat.toFixed(7), r.lon === '' ? '' : r.lon.toFixed(7)].join('\t'); }).join('\n'), this);
  });
  $('convert').addEventListener('click', convert);
  document.querySelectorAll('input').forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') convert(); }); });
  $('clear').addEventListener('click', function () { hideResult(); showError(''); latest = null; history.replaceState(null, '', location.pathname + location.search); });

  /* ---------- exportação / partilha ---------- */
  function flash(btn, txt) { var o = btn.dataset.o || btn.textContent; btn.dataset.o = o; btn.textContent = txt; setTimeout(function () { btn.textContent = o; }, 1600); }
  function copyText(t, btn) {
    var done = function () { flash(btn, 'Copiado ✓'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() { var el = document.createElement('textarea'); el.value = t; document.body.appendChild(el); el.select(); try { document.execCommand('copy'); done(); } catch (e) { flash(btn, 'Falhou'); } el.remove(); }
  }
  function download(name, mime, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 500); }
  $('copy').addEventListener('click', function () { if (latest) copyText(latest.lat.toFixed(7) + ', ' + latest.lon.toFixed(7), this); });
  $('csv').addEventListener('click', function () {
    if (!latest) return; var m = $('o-mgrs').textContent;
    download('coordenadas.csv', 'text/csv', 'latitude,longitude,crs,mgrs\n' + latest.lat.toFixed(7) + ',' + latest.lon.toFixed(7) + ',EPSG:4326,"' + m + '"\n');
  });
  $('geojson').addEventListener('click', function () {
    if (!latest) return;
    download('coordenadas.geojson', 'application/geo+json', JSON.stringify({ type: 'Feature', properties: { crs: 'EPSG:4326', mgrs: $('o-mgrs').textContent }, geometry: { type: 'Point', coordinates: [+latest.lon.toFixed(7), +latest.lat.toFixed(7)] } }, null, 2));
  });
  $('share').addEventListener('click', function () { writeHash(); copyText(location.href, this); });

  /* ligação partilhável: #mgrs=..., #utm=29,N,E,N, #ll=lat,lon */
  function writeHash() {
    if (mode === 'lista') return;
    var h = mode === 'cad' ? 'cad=' + encodeURIComponent($('cadX').value.trim() + '|' + $('cadY').value.trim()) + '&sys=' + $('cadSys').value
          : mode === 'mgrs' ? 'mgrs=' + encodeURIComponent($('mgrsVal').value.trim())
          : mode === 'utm' ? 'utm=' + [$('zone').value, $('hem').value, $('east').value, $('north').value].join(',')
          : 'datum=wgs84&ll=' + encodeURIComponent($('llVal').value.trim());
    if (mode === 'mgrs' || mode === 'utm') h += '&datum=wgs84';
    history.replaceState(null, '', '#' + h);
  }
  function readHash() {
    var q = new URLSearchParams(location.hash.slice(1)); if (!q.toString()) return false;
    if (q.has('cad')) { var xy = q.get('cad').split('|'); setTab('cad'); $('cadX').value = xy[0] || ''; $('cadY').value = xy[1] || ''; if (q.has('sys') && G.SYSTEMS[q.get('sys')]) $('cadSys').value = q.get('sys'); }
    else if (q.has('mgrs')) { setTab('mgrs'); $('mgrsVal').value = q.get('mgrs'); }
    else if (q.has('utm')) { var a = q.get('utm').split(','); setTab('utm'); $('zone').value = a[0] || ''; $('hem').value = a[1] === 'S' ? 'S' : 'N'; $('east').value = a[2] || ''; $('north').value = a[3] || ''; }
    else if (q.has('ll')) { setTab('ll'); $('llVal').value = q.get('ll'); }
    else return false;
    return true;
  }

  initMap(); onDatum();
  if (readHash()) convert();
})();
