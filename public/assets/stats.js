import { jobById } from './rates.js';

var $ = function (id) { return document.getElementById(id); };
var TOKEN_KEY = 'qf-stats-token';
var RANGE_KEY = 'qf-stats-range';
var SVG = 'http://www.w3.org/2000/svg';
var lastData = null;

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
  }
  (children || []).forEach(function (c) {
    if (c != null) node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return node;
}

function svg(tag, attrs, children) {
  var node = document.createElementNS(SVG, tag);
  Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
  (children || []).forEach(function (c) { node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return node;
}

var fmt = function (n) { return Number(n || 0).toLocaleString('en-SG'); };
var pct = function (a, b) { return b ? Math.round((a / b) * 100) + '%' : '\u2013'; };
var count = function (n, one, many) { return fmt(n) + ' ' + (Number(n) === 1 ? one : many); };

function dayLabel(date, withYear) {
  var d = new Date(date + 'T00:00:00Z');
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
}

/* ---------- Labels ---------- */

var LABELS = {
  page: { landing: 'Estimator (home page)', suppliers: 'List your business', 'supplier-thanks': 'Application received', privacy: 'Privacy notice', terms: 'Terms', notfound: 'Page not found', other: 'Other' },
  ref: { direct: 'Direct or unknown' },
  dev: { mobile: 'Phone', desktop: 'Computer or tablet', unknown: 'Unknown' },
  via: { form: 'Described the job', board: 'Typical prices list', switch: 'Category suggestion' },
  what: { job: 'Changed the job', qty: 'Changed the quantity', home: 'Changed the home type', timing: 'Changed the timing' },
  target: {
    carousell: 'Carousell', helpling: 'Helpling', 'urban-company': 'Urban Company', airtasker: 'Airtasker',
    'google-maps': 'Google Maps', ema: 'EMA licence check', pub: 'PUB licence check',
    'partner-whatsapp': 'Partner: WhatsApp', 'partner-call': 'Partner: call', 'partner-website': 'Partner: website'
  },
  share: { whatsapp: 'Sent on WhatsApp', copy: 'Copied the summary' },
  code: {
    not_configured: 'Chat not switched on', limit: 'Chat length limit reached', rate: 'Visitor sent too fast',
    busy: 'AI service busy', timeout: 'AI reply timed out', network: 'Visitor offline', generic: 'Other error'
  },
  listing: { standard: 'Standard', featured: 'Featured (wants pricing)' }
};

var regionNames = (function () {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { return null; }
})();

function label(dim, value) {
  if (dim === 'job') { var job = jobById(value); return job ? job.name : value; }
  if (dim === 'cc') {
    if (value === 'unknown') return 'Unknown';
    try { return regionNames ? regionNames.of(value) : value; } catch (e) { return value; }
  }
  if (dim === 'ref' && !LABELS.ref[value]) return value.charAt(0).toUpperCase() + value.slice(1);
  return (LABELS[dim] && LABELS[dim][value]) || value;
}

/* ---------- Session ---------- */

function getToken() {
  try {
    var saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    return saved && saved.expires > Date.now() ? saved.token : null;
  } catch (e) { return null; }
}

function setToken(data) {
  try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(data)); } catch (e) { /* stays signed in for this page only */ }
  memoryToken = data.token;
}

var memoryToken = null;

function clearToken() {
  memoryToken = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}

function showLogin(message) {
  clearToken();
  $('dash').hidden = true;
  $('stats-controls').hidden = true;
  $('login').hidden = false;
  $('stats-sub').textContent = 'Sign in to see visits, estimates and bookings.';
  var err = $('password-error');
  err.textContent = message || '';
  err.hidden = !message;
  $('password').value = '';
  $('password').focus();
}

$('login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var pw = $('password').value;
  var err = $('password-error');
  if (!pw) {
    err.textContent = 'Enter the stats password.';
    err.hidden = false;
    $('password').setAttribute('aria-invalid', 'true');
    $('password').focus();
    return;
  }
  var btn = $('login-btn');
  btn.disabled = true;
  btn.textContent = 'Checking\u2026';
  fetch('/api/stats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    .then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
    })
    .then(function (out) {
      if (out.res.ok && out.data.token) {
        $('password').removeAttribute('aria-invalid');
        setToken(out.data);
        load();
        return;
      }
      var message = out.res.status === 401 ? 'That password isn\u2019t right.'
        : out.res.status === 429 ? 'Too many attempts. Wait a minute, then try again.'
        : out.res.status === 404 ? 'The stats service isn\u2019t deployed. Check that functions deployed with the site.'
        : 'Couldn\u2019t sign in. Try again in a moment.';
      err.textContent = message;
      err.hidden = false;
      $('password').setAttribute('aria-invalid', 'true');
      $('password').select();
    })
    .catch(function () {
      err.textContent = 'Couldn\u2019t reach the site. Check your connection and try again.';
      err.hidden = false;
    })
    .then(function () {
      btn.disabled = false;
      btn.textContent = 'Show statistics';
    });
});

$('sign-out').addEventListener('click', function () { showLogin(''); });
$('refresh').addEventListener('click', function () { load(); });

document.querySelectorAll('input[name="range"]').forEach(function (r) {
  r.addEventListener('change', function () {
    try { sessionStorage.setItem(RANGE_KEY, this.value); } catch (e) { /* ignore */ }
    load();
  });
});

function currentRange() {
  var checked = document.querySelector('input[name="range"]:checked');
  return checked ? checked.value : '7';
}

/* ---------- Loading ---------- */

function load() {
  var token = memoryToken || getToken();
  if (!token) { showLogin(''); return; }
  memoryToken = token;

  $('login').hidden = true;
  $('dash').hidden = false;
  $('stats-controls').hidden = false;
  $('dash').setAttribute('aria-busy', 'true');
  $('stats-sub').textContent = 'Loading\u2026';

  fetch('/api/stats?days=' + currentRange(), { headers: { authorization: 'Bearer ' + token } })
    .then(function (res) {
      if (res.status === 401) { showLogin('Your session ended. Sign in again.'); return null; }
      if (!res.ok) throw new Error('Status ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      lastData = data;
      render(data);
    })
    .catch(function () {
      $('stats-sub').textContent = 'Couldn\u2019t load the numbers. Use Refresh to try again.';
    })
    .then(function () { $('dash').setAttribute('aria-busy', 'false'); });
}

/* ---------- Rendering ---------- */

function ev(total, name) { return total.events[name] || { n: 0, u: 0 }; }

function render(data) {
  var t = data.total;
  var f = t.funnel;
  var updated = new Date(data.generatedAt).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' });
  $('stats-sub').textContent = (data.days === 1
    ? 'Today, ' + dayLabel(data.to, true)
    : dayLabel(data.from) + ' to ' + dayLabel(data.to, true)) + ', Singapore time. Updated ' + updated + '.';

  var hasData = Object.keys(t.events).length > 0;
  $('empty').hidden = hasData;

  renderKpis(t, f);
  renderFunnel(f);
  renderChart(data.daily);
  renderTables(t);
  renderDaily(data.daily);
}

function renderKpis(t, f) {
  var landing = t.pages.landing || { n: 0, u: 0 };
  var suppliers = t.pages.suppliers || { n: 0, u: 0 };
  var items = [
    { label: 'Visitors', value: f.landing, note: count(landing.n, 'view', 'views') + ' of the estimator' },
    { label: 'Got an estimate', value: f.estimate, note: pct(f.estimate, f.landing) + ' of visitors, ' + count(ev(t, 'estimate').n, 'estimate', 'estimates') },
    { label: 'Used the chat', value: f.chat, note: pct(f.chat, f.estimate) + ' of estimators, ' + count(ev(t, 'chat_message').n, 'message', 'messages') },
    { label: 'Clicked to book', value: f.book, note: pct(f.book, f.estimate) + ' of estimators, ' + count(ev(t, 'book_click').n, 'click', 'clicks') },
    { label: 'Supplier applications', value: ev(t, 'supplier_submit').n, note: count(suppliers.u, 'visitor', 'visitors') + ' to the sign-up page' }
  ];
  var dl = $('kpis');
  dl.innerHTML = '';
  items.forEach(function (it) {
    dl.appendChild(el('div', { class: 'kpi' }, [
      el('dt', { text: it.label }),
      el('dd', null, [el('span', { class: 'kpi-value', text: fmt(it.value) }), el('span', { class: 'kpi-note', text: it.note })])
    ]));
  });
}

function renderFunnel(f) {
  var steps = [
    ['Visited the estimator', f.landing],
    ['Got an estimate', f.estimate],
    ['Started a chat', f.chat],
    ['Got a sharper price from the chat', f.refined],
    ['Clicked a booking link', f.book]
  ];
  var top = Math.max(f.landing, f.estimate, 1);
  var ol = $('funnel');
  ol.innerHTML = '';
  steps.forEach(function (s, i) {
    var bar = el('span', { class: 'funnel-fill' });
    bar.style.width = Math.max(s[1] ? 1.5 : 0, (s[1] / top) * 100) + '%';
    var prev = i > 0 ? steps[i - 1][1] : null;
    ol.appendChild(el('li', { class: 'funnel-step' }, [
      el('span', { class: 'funnel-label', text: s[0] }),
      el('span', { class: 'funnel-bar', 'aria-hidden': 'true' }, [bar]),
      el('span', { class: 'funnel-num' }, [
        el('strong', { text: fmt(s[1]) }),
        el('span', { text: i === 0 ? (s[1] === 1 ? 'visitor' : 'visitors') : pct(s[1], prev) + ' of the step before' })
      ])
    ]));
  });
}

/* A round axis maximum whose halfway point is also a whole number. */
function niceMax(n) {
  if (n <= 4) return 4;
  var p = Math.pow(10, Math.floor(Math.log10(n)));
  var steps = [1, 2, 4, 6, 8, 10];
  for (var i = 0; i < steps.length; i++) if (steps[i] * p >= n && (steps[i] * p) % 2 === 0) return steps[i] * p;
  return 10 * p;
}

function renderChart(daily) {
  var box = $('chart');
  box.innerHTML = '';
  var W = 720, H = 240, L = 40, R = 8, T = 12, B = 30;
  var max = niceMax(Math.max.apply(null, daily.map(function (d) { return d.funnel.landing; }).concat([0])));
  var n = daily.length;
  var band = (W - L - R) / n;
  var barW = Math.max(1, Math.min(18, band * 0.38));
  var y = function (v) { return T + (H - T - B) * (1 - v / max); };

  var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Daily visitors and visitors who got an estimate' });
  [0, max / 2, max].forEach(function (v) {
    root.appendChild(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
    root.appendChild(svg('text', { x: L - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' }, [fmt(v)]));
  });

  daily.forEach(function (d, i) {
    var cx = L + band * i + band / 2;
    var a = d.funnel.landing, b = d.funnel.estimate;
    var title = dayLabel(d.date) + ': ' + fmt(a) + ' visitors, ' + fmt(b) + ' got an estimate';
    var g = svg('g', null, [svg('title', null, [title])]);
    g.appendChild(svg('rect', { x: cx - barW - 1, y: y(a), width: barW, height: Math.max(0, y(0) - y(a)), class: 'bar-a' }));
    g.appendChild(svg('rect', { x: cx + 1, y: y(b), width: barW, height: Math.max(0, y(0) - y(b)), class: 'bar-b' }));
    root.appendChild(g);
  });

  var labelAt = n === 1 ? [0] : n <= 7 ? daily.map(function (_, i) { return i; }) : [0, Math.floor((n - 1) / 2), n - 1];
  labelAt.forEach(function (i) {
    var anchor = n > 7 && i === 0 ? 'start' : n > 7 && i === n - 1 ? 'end' : 'middle';
    var x = n > 7 && i === 0 ? L : n > 7 && i === n - 1 ? W - R : L + band * i + band / 2;
    root.appendChild(svg('text', { x: x, y: H - 8, class: 'axis', 'text-anchor': anchor }, [dayLabel(daily[i].date)]));
  });
  box.appendChild(root);
}

/* A two-column breakdown table with an inline share bar. */
function breakdown(title, dim, map, opts) {
  opts = opts || {};
  var rows = Object.keys(map || {}).map(function (k) { return [k, map[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
  var total = rows.reduce(function (s, r) { return s + r[1]; }, 0);
  if (opts.limit) rows = rows.slice(0, opts.limit);

  var section = el('section', { class: 'stats-section' }, [el('h3', { class: 'section-title', text: title })]);
  if (!rows.length) {
    section.appendChild(el('p', { class: 'stats-none', text: opts.empty || 'Nothing yet.' }));
    return section;
  }
  var tbody = el('tbody');
  rows.forEach(function (r) {
    var fill = el('span', { class: 'share-fill' });
    fill.style.width = (total ? (r[1] / total) * 100 : 0) + '%';
    tbody.appendChild(el('tr', null, [
      el('th', { scope: 'row', text: label(dim, r[0]) }),
      el('td', { class: 'num', text: fmt(r[1]) }),
      el('td', { class: 'col-share' }, [el('div', { class: 'share-wrap' }, [
        el('span', { class: 'share-bar', 'aria-hidden': 'true' }, [fill]),
        el('span', { class: 'share-pct', text: pct(r[1], total) })
      ])])
    ]));
  });
  section.appendChild(el('table', { class: 'tbl' }, [
    el('thead', null, [el('tr', null, [
      el('th', { scope: 'col', text: opts.col || '' }),
      el('th', { scope: 'col', class: 'num', text: opts.unit || 'Count' }),
      el('th', { scope: 'col', class: 'col-share', text: 'Share' })
    ])]),
    tbody
  ]));
  return section;
}

function pagesTable(pages) {
  var rows = Object.keys(pages).map(function (k) { return [k, pages[k]]; }).sort(function (a, b) { return b[1].n - a[1].n; });
  var section = el('section', { class: 'stats-section' }, [el('h3', { class: 'section-title', text: 'Pages' })]);
  if (!rows.length) {
    section.appendChild(el('p', { class: 'stats-none', text: 'No page views yet.' }));
    return section;
  }
  var tbody = el('tbody');
  rows.forEach(function (r) {
    tbody.appendChild(el('tr', null, [
      el('th', { scope: 'row', text: label('page', r[0]) }),
      el('td', { class: 'num', text: fmt(r[1].u) }),
      el('td', { class: 'num', text: fmt(r[1].n) })
    ]));
  });
  section.appendChild(el('table', { class: 'tbl' }, [
    el('thead', null, [el('tr', null, [
      el('th', { scope: 'col', text: 'Page' }),
      el('th', { scope: 'col', class: 'num', text: 'Visitors' }),
      el('th', { scope: 'col', class: 'num', text: 'Views' })
    ])]),
    tbody
  ]));
  return section;
}

function renderTables(t) {
  var by = t.by;
  var grid = $('tables');
  grid.innerHTML = '';
  [
    breakdown('Where visitors come from', 'ref', by['landing.ref'], { col: 'Source', unit: 'Visitors', empty: 'No visits yet.' }),
    breakdown('Devices', 'dev', by['landing.dev'], { col: 'Device', unit: 'Visitors', empty: 'No visits yet.' }),
    breakdown('Countries', 'cc', by['landing.cc'], { col: 'Country', unit: 'Visitors', limit: 8, empty: 'No visits yet.' }),
    pagesTable(t.pages),
    breakdown('Estimates by category', 'cat', by['estimate.cat'], { col: 'Category', unit: 'Estimates', empty: 'No estimates yet.' }),
    breakdown('Most estimated jobs', 'job', by['estimate.job'], { col: 'Job', unit: 'Estimates', limit: 10, empty: 'No estimates yet.' }),
    breakdown('How estimates started', 'via', by['estimate.via'], { col: 'Started from', unit: 'Estimates', empty: 'No estimates yet.' }),
    breakdown('Estimate adjustments', 'what', by['adjust.what'], { col: 'Adjustment', unit: 'Estimates', empty: 'Nobody has adjusted an estimate yet.' }),
    breakdown('Booking clicks', 'target', by['book_click.target'], { col: 'Destination', unit: 'Clicks', empty: 'No booking clicks yet.' }),
    breakdown('Partner listing clicks', 'partner', by['book_click.partner'], { col: 'Partner', unit: 'Clicks', empty: 'No partner clicks yet. Partners appear once you add them to data/partners.json.' }),
    breakdown('Job summaries shared', 'share', by['share.via'], { col: 'Method', unit: 'Shares', empty: 'No shares yet.' }),
    breakdown('Chat problems', 'code', by['chat_error.code'], { col: 'Problem', unit: 'Times', empty: 'No chat problems. Good.' })
  ].forEach(function (s) { grid.appendChild(s); });
}

var DAILY_COLS = [
  ['Date', function (d) { return dayLabel(d.date, true); }, function (d) { return d.date; }],
  ['Visitors', function (d) { return d.funnel.landing; }],
  ['Got an estimate', function (d) { return d.funnel.estimate; }],
  ['Estimates', function (d) { return (d.events.estimate || { n: 0 }).n; }],
  ['Chatted', function (d) { return d.funnel.chat; }],
  ['Chat messages', function (d) { return (d.events.chat_message || { n: 0 }).n; }],
  ['Refined by chat', function (d) { return d.funnel.refined; }],
  ['Clicked to book', function (d) { return d.funnel.book; }],
  ['Booking clicks', function (d) { return (d.events.book_click || { n: 0 }).n; }],
  ['Supplier page visitors', function (d) { return (d.pages.suppliers || { u: 0 }).u; }],
  ['Supplier applications', function (d) { return (d.events.supplier_submit || { n: 0 }).n; }]
];

function renderDaily(daily) {
  var table = $('daily');
  table.innerHTML = '';
  table.appendChild(el('thead', null, [el('tr', null, DAILY_COLS.map(function (c, i) {
    return el('th', { scope: 'col', class: i ? 'num' : null, text: c[0] });
  }))]));
  var tbody = el('tbody');
  daily.slice().reverse().forEach(function (d) {
    tbody.appendChild(el('tr', null, DAILY_COLS.map(function (c, i) {
      return i === 0 ? el('th', { scope: 'row', text: c[1](d) }) : el('td', { class: 'num', text: fmt(c[1](d)) });
    })));
  });
  table.appendChild(tbody);
}

$('csv').addEventListener('click', function () {
  if (!lastData) return;
  var lines = [DAILY_COLS.map(function (c) { return c[0]; }).join(',')];
  lastData.daily.forEach(function (d) {
    lines.push(DAILY_COLS.map(function (c, i) { return i === 0 ? c[2](d) : c[1](d); }).join(','));
  });
  var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = el('a', { href: url, download: 'sg-quickfix-stats-' + lastData.from + '-to-' + lastData.to + '.csv' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
});

/* ---------- Exclude this browser ---------- */

var exclude = $('exclude');
function syncExclude() {
  exclude.checked = !!(window.qfTrackExcluded && window.qfTrackExcluded());
}
exclude.addEventListener('change', function () {
  if (window.qfTrackSetExcluded) window.qfTrackSetExcluded(exclude.checked);
});

/* ---------- Boot ---------- */

try {
  var savedRange = sessionStorage.getItem(RANGE_KEY);
  if (savedRange) {
    var r = document.querySelector('input[name="range"][value="' + savedRange + '"]');
    if (r) r.checked = true;
  }
} catch (e) { /* ignore */ }

syncExclude();
if (getToken()) load();
else showLogin('');
