var $ = function (id) { return document.getElementById(id); };
var SVG = 'http://www.w3.org/2000/svg';
var KEY = 'sgqf-stats-password';
var days = 30;

function el(tag, text, cls) {
  var node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

function svg(tag, attrs, text) {
  var node = document.createElementNS(SVG, tag);
  Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  if (text != null) node.textContent = text;
  return node;
}

function num(n) { return Number(n || 0).toLocaleString('en-SG'); }
function pct(part, whole) { return whole ? (100 * part / whole).toFixed(1) + '%' : '—'; }

function showLogin(message) {
  $('dashboard').hidden = true;
  $('login').hidden = false;
  $('login-error').textContent = message || '';
  $('login-error').hidden = !message;
  $('password').focus();
}

function load() {
  var password = sessionStorage.getItem(KEY);
  if (!password) return showLogin();
  fetch('/api/stats?days=' + days, { headers: { authorization: 'Bearer ' + password }, cache: 'no-store' })
    .then(function (res) {
      if (res.status === 401) { sessionStorage.removeItem(KEY); return showLogin('That password isn’t right.'); }
      if (res.status === 503) return showLogin('The dashboard password hasn’t been set up on Netlify yet.');
      if (res.status === 429) return showLogin('Too many attempts. Wait a minute and try again.');
      if (!res.ok) throw new Error('Status ' + res.status);
      return res.json().then(render);
    })
    .catch(function () { showLogin('Couldn’t load the stats. Try again.'); });
}

/* Turn the per-day, per-type rows into one object per calendar day, filling gaps. */
function byDay(data) {
  var map = {};
  data.daily.forEach(function (r) {
    var d = map[r.day] || (map[r.day] = {});
    d[r.type] = { events: Number(r.events), people: Number(r.people) };
  });
  var out = [];
  var today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }) + 'T00:00:00Z');
  for (var i = data.days - 1; i >= 0; i--) {
    var key = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    out.push({ day: key, t: map[key] || {} });
  }
  return out;
}

function sum(rows, type, field) {
  return rows.reduce(function (n, r) { return n + (r.t[type] ? r.t[type][field] : 0); }, 0);
}

function tile(label, value, sub) {
  var li = el('li', null, 'stat-tile');
  li.appendChild(el('span', label, 'label'));
  li.appendChild(el('span', value, 'value'));
  if (sub) li.appendChild(el('span', sub, 'sub'));
  return li;
}

function render(data) {
  $('login').hidden = true;
  $('dashboard').hidden = false;
  $('range-title').textContent = data.days === 365 ? 'Last 12 months' : 'Last ' + data.days + ' days';

  var rows = byDay(data);
  var visitors = sum(rows, 'pageview', 'people');
  var requesters = sum(rows, 'estimate', 'people');
  var bookers = sum(rows, 'book', 'people');

  var tiles = $('tiles');
  tiles.innerHTML = '';
  tiles.appendChild(tile('Visitors', num(visitors), num(sum(rows, 'pageview', 'events')) + ' page views'));
  tiles.appendChild(tile('Requested an estimate', num(requesters), pct(requesters, visitors) + ' of visitors'));
  tiles.appendChild(tile('Chatted with the assistant', num(sum(rows, 'chat', 'people')), pct(sum(rows, 'chat', 'people'), visitors) + ' of visitors'));
  tiles.appendChild(tile('Clicked to book', num(bookers), pct(bookers, visitors) + ' of visitors'));
  tiles.appendChild(tile('Supplier applications', num(sum(rows, 'application', 'events'))));

  renderChart(rows);

  var body = $('rows');
  body.innerHTML = '';
  rows.slice().reverse().forEach(function (r) {
    var tr = el('tr');
    var get = function (type, field) { return r.t[type] ? r.t[type][field] : 0; };
    [r.day, get('pageview', 'people'), get('pageview', 'events'), get('estimate', 'events'),
     get('chat', 'events'), get('book', 'events'), get('application', 'events')].forEach(function (v, i) {
      tr.appendChild(el('td', i ? num(v) : v));
    });
    body.appendChild(tr);
  });

  var cats = $('categories');
  cats.innerHTML = '';
  if (!data.topCategories.length) {
    var empty = el('tr');
    var td = el('td', 'No estimates yet.');
    td.colSpan = 2;
    empty.appendChild(td);
    cats.appendChild(empty);
  }
  data.topCategories.forEach(function (c) {
    var tr = el('tr');
    tr.appendChild(el('td', c.detail || 'Unknown'));
    tr.appendChild(el('td', num(c.events)));
    cats.appendChild(tr);
  });
}

/* Overlapping bars: visitors behind, people who requested an estimate in front. */
function renderChart(rows) {
  var W = 960, H = 220, top = 12, bottom = 24, left = 36;
  var plotW = W - left, plotH = H - top - bottom;
  var max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.t.pageview ? r.t.pageview.people : 0; })));
  var step = plotW / rows.length;
  var barW = Math.max(1, step * 0.7);

  var chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'stats-chart', role: 'img',
    'aria-label': 'Daily visitors compared with people who requested an estimate. The table below has the same figures.' });

  [0, 0.5, 1].forEach(function (f) {
    var y = top + plotH * (1 - f);
    chart.appendChild(svg('text', { x: left - 6, y: y + 4, 'text-anchor': 'end' }, num(Math.round(max * f))));
  });

  rows.forEach(function (r, i) {
    var x = left + i * step + (step - barW) / 2;
    var v = r.t.pageview ? r.t.pageview.people : 0;
    var q = r.t.estimate ? r.t.estimate.people : 0;
    var hv = plotH * v / max, hq = plotH * q / max;
    var title = r.day + ': ' + v + ' visitors, ' + q + ' requested an estimate';
    var g = svg('g', {});
    g.appendChild(svg('title', {}, title));
    g.appendChild(svg('rect', { class: 'bar-visitors', x: x, y: top + plotH - hv, width: barW, height: hv }));
    g.appendChild(svg('rect', { class: 'bar-requests', x: x + barW * 0.2, y: top + plotH - hq, width: barW * 0.6, height: hq }));
    chart.appendChild(g);
  });

  var labelEvery = Math.ceil(rows.length / 8);
  rows.forEach(function (r, i) {
    if (i % labelEvery) return;
    var d = new Date(r.day + 'T00:00:00Z');
    chart.appendChild(svg('text', { x: left + i * step + step / 2, y: H - 6, 'text-anchor': 'middle' },
      d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' })));
  });

  $('chart').innerHTML = '';
  $('chart').appendChild(chart);
}

$('login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var value = $('password').value;
  if (!value) return showLogin('Enter the password.');
  sessionStorage.setItem(KEY, value);
  $('password').value = '';
  load();
});

document.querySelectorAll('[data-days]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    days = Number(btn.dataset.days);
    document.querySelectorAll('[data-days]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
    load();
  });
});

load();
