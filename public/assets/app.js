import {
  CATEGORIES, HOME_TYPES, TIMINGS, RATES_UPDATED,
  jobById, jobsFor, defaultJobFor, matchJob, guessQty, clampQty, unitNoun,
  estimate, formatRange, greetingFor
} from './rates.js';

/* ---------- Helpers ---------- */

var $ = function (id) { return document.getElementById(id); };

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
  }
  (children || []).forEach(function (c) {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---------- State ---------- */

var state = {
  category: '',
  description: '',
  jobId: null,
  qty: 1,
  home: 'hdb',
  timing: 'normal',
  suggestCat: null,
  refined: null,          // { low, high, basis } from the chat
  lastShown: '',          // last range text, to decide when to flash
  partners: [],
  chat: { messages: [], busy: false, closed: false, started: false }
};

var MAX_PHOTO_BYTES = 8 * 1024 * 1024;
var MAX_USER_MESSAGES = 12;
var photoFile = null;
var photoPreviewUrl = null;
var photoPayload = undefined; // undefined = not prepared, null = unusable

/* ---------- Views ---------- */

var views = {};
document.querySelectorAll('[data-view]').forEach(function (v) { views[v.dataset.view] = v; });

function showView(name, opts) {
  opts = opts || {};
  Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  document.body.dataset.view = name;
  if (opts.push && name === 'results') history.pushState({ view: 'results' }, '', '#estimate');
  var target = name === 'results' ? $('est-title') : null;
  var main = $('main');
  if (main.getBoundingClientRect().top < 0) {
    main.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
  if (target) target.focus({ preventScroll: true });
}

window.addEventListener('popstate', function () {
  if (location.hash !== '#estimate') {
    showView('details');
    category.focus({ preventScroll: true });
  } else if (state.jobId) {
    showView('results');
  }
});

if (location.hash === '#estimate') history.replaceState(null, '', location.pathname + location.search);

/* ---------- Details form ---------- */

var form = $('quote');
var category = $('category');
var description = $('description');
var photo = $('photo');

var placeholders = {
  'Plumbing': 'e.g. Kitchen sink drains slowly and water backs up',
  'Electrical': 'e.g. Bedroom power point sparks when I plug something in',
  'Aircon': 'e.g. Three wall units, last serviced a year ago, one is dripping',
  'Carpentry': 'e.g. Wardrobe door hinge broke and the door won\u2019t close',
  'General Handyman': 'e.g. Mount a 55-inch TV on a concrete wall'
};

function setError(input, errorEl, message) {
  errorEl.textContent = message || '';
  errorEl.hidden = !message;
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function markStep(n, done) { $('step-' + n).classList.toggle('is-done', !!done); }

category.addEventListener('change', function () {
  setError(category, $('category-error'), '');
  description.placeholder = placeholders[category.value] || description.placeholder;
  markStep(1, !!category.value);
});

description.addEventListener('input', function () {
  markStep(2, description.value.trim().length > 0);
});

function clearPhoto() {
  photo.value = '';
  photoFile = null;
  photoPayload = undefined;
  if (photoPreviewUrl) { URL.revokeObjectURL(photoPreviewUrl); photoPreviewUrl = null; }
  $('upload-empty').hidden = false;
  $('upload-preview').hidden = true;
  markStep(3, false);
}

photo.addEventListener('change', function () {
  var errorEl = $('photo-error');
  var file = photo.files && photo.files[0];
  setError(null, errorEl, '');
  if (!file) { clearPhoto(); return; }
  if (file.size > MAX_PHOTO_BYTES) {
    clearPhoto();
    setError(null, errorEl, 'This photo is ' + formatSize(file.size) + '. Choose one under 8 MB.');
    return;
  }
  photoFile = file;
  photoPayload = undefined;
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = URL.createObjectURL(file);
  var img = $('preview-img');
  img.hidden = false;
  img.onerror = function () { img.hidden = true; };
  img.src = photoPreviewUrl;
  $('preview-name').textContent = file.name;
  $('preview-size').textContent = formatSize(file.size);
  $('upload-empty').hidden = true;
  $('upload-preview').hidden = false;
  markStep(3, true);
});

$('photo-remove').addEventListener('click', function () {
  clearPhoto();
  photo.focus();
});

form.addEventListener('submit', function (e) {
  e.preventDefault();
  if (!category.value) {
    setError(category, $('category-error'), 'Choose what needs fixing to continue.');
    category.focus();
    return;
  }
  startEstimate(category.value, description.value.trim(), null);
});

/* ---------- Starting an estimate ---------- */

function startEstimate(cat, desc, forcedJobId) {
  var match = matchJob(cat, desc);
  var job = forcedJobId ? jobById(forcedJobId) : match.job;
  var contextChanged = cat !== state.category || desc !== state.description || job.id !== state.jobId;

  state.category = cat;
  state.description = desc;
  state.jobId = job.id;
  state.suggestCat = forcedJobId ? null : match.suggestCat;
  state.qty = guessQty(job, desc);

  if (contextChanged) {
    state.refined = null;
    resetChat();
  }

  buildJobSelect();
  renderAll();
  showView('results', { push: true });
}

/* ---------- Results rendering ---------- */

function currentJob() { return jobById(state.jobId); }

function baseline() {
  return estimate(currentJob(), { qty: state.qty, home: state.home, timing: state.timing });
}

function buildJobSelect() {
  var select = $('job-select');
  select.innerHTML = '';
  jobsFor(state.category).forEach(function (job) {
    var opt = el('option', { value: job.id, text: job.name });
    if (job.id === state.jobId) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderEstimate() {
  var job = currentJob();
  var base = baseline();
  var shown = state.refined || base;
  var rangeText = formatRange(shown.low, shown.high);

  $('est-job').textContent = job.name;

  var range = $('est-range');
  range.textContent = rangeText;
  if (state.lastShown && state.lastShown !== rangeText && !reducedMotion()) {
    range.classList.remove('is-flash');
    void range.offsetWidth;
    range.classList.add('is-flash');
  }
  state.lastShown = rangeText;

  var home = HOME_TYPES[state.home];
  var article = state.home === 'hdb' ? 'an ' : 'a ';
  var qtyPart = job.unit ? ' for ' + base.qty + ' ' + unitNoun(job, base.qty) : '';
  $('est-note').textContent = 'Labour' + qtyPart + ' in ' + article + home.label + ', booked ' + TIMINGS[state.timing].label + '.';

  var refined = $('est-refined');
  if (state.refined) {
    refined.hidden = false;
    refined.textContent = 'Updated from your chat' + (state.refined.basis ? ': ' + state.refined.basis : '') +
      '. The baseline was ' + formatRange(base.low, base.high) + '.';
  } else {
    refined.hidden = true;
  }

  var qtyRow = $('qty-row');
  if (job.unit) {
    qtyRow.hidden = false;
    $('qty-label').textContent = job.unit;
    $('qty-value').textContent = String(base.qty);
    $('qty-minus').disabled = base.qty <= 1;
    $('qty-plus').disabled = base.qty >= 40;
  } else {
    qtyRow.hidden = true;
  }

  var hint = $('cat-hint');
  if (state.suggestCat) {
    hint.hidden = false;
    $('cat-hint-name').textContent = state.suggestCat === 'General Handyman' ? 'handyman' : state.suggestCat.toLowerCase();
    $('cat-hint-btn').textContent = 'Switch to ' + state.suggestCat;
  } else {
    hint.hidden = true;
  }

  $('est-includes').textContent = job.includes;
  var extras = $('est-extras');
  extras.innerHTML = '';
  job.extras.forEach(function (x) { extras.appendChild(el('li', { text: x })); });

  $('est-source').textContent = job.confidence === 'indicative'
    ? 'Indicative range. Fewer contractors publish prices for this job, so get a quote to confirm. Updated ' + RATES_UPDATED + '.'
    : 'Based on published Singapore price lists, updated ' + RATES_UPDATED + '.';

  document.querySelectorAll('input[name="home"]').forEach(function (r) { r.checked = r.value === state.home; });
  document.querySelectorAll('input[name="timing"]').forEach(function (r) { r.checked = r.value === state.timing; });

  renderShare();
}

function jobSummary() {
  var job = currentJob();
  var base = baseline();
  var shown = state.refined || base;
  var lines = [
    'Hi, I\u2019d like a quote for this job.',
    'Job: ' + job.name + (job.unit ? ', ' + base.qty + ' ' + unitNoun(job, base.qty) : ''),
    'Home: ' + HOME_TYPES[state.home].label.replace(/^./, function (c) { return c.toUpperCase(); }),
    'When: ' + TIMINGS[state.timing].label
  ];
  if (state.description) lines.push('Details: ' + state.description);
  lines.push('My SG QuickFix estimate: ' + formatRange(shown.low, shown.high));
  lines.push('Are you available, and what would you charge?');
  return lines.join('\n');
}

function renderShare() {
  $('share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(jobSummary());
}

$('jump-chat').addEventListener('click', function () {
  document.querySelector('.chat').scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  chatInput.focus({ preventScroll: true });
});

$('share-copy').addEventListener('click', function () {
  var btn = this;
  var text = jobSummary();
  var done = function () {
    btn.textContent = 'Copied';
    setTimeout(function () { btn.textContent = 'Copy job summary'; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
  } else {
    fallbackCopy(text);
    done();
  }
});

function fallbackCopy(text) {
  var ta = el('textarea', { 'aria-hidden': 'true' });
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
  ta.remove();
}

/* Adjust controls */

function onContextChange(note) {
  if (state.refined) {
    state.refined = null;
    if (state.chat.started) addNote(note || 'Details changed, so the estimate is back to the baseline. Keep chatting to refine it again.');
  }
  renderEstimate();
  renderBooking();
}

$('job-select').addEventListener('change', function () {
  var job = jobById(this.value);
  if (!job) return;
  state.jobId = job.id;
  state.qty = guessQty(job, state.description);
  state.suggestCat = null;
  if (!state.chat.started) resetChat();
  else addNote('Job changed to \u201c' + job.name.toLowerCase() + '\u201d.');
  onContextChange();
});

$('qty-minus').addEventListener('click', function () {
  state.qty = clampQty(currentJob(), state.qty - 1);
  onContextChange();
});

$('qty-plus').addEventListener('click', function () {
  state.qty = clampQty(currentJob(), state.qty + 1);
  onContextChange();
});

document.querySelectorAll('input[name="home"]').forEach(function (r) {
  r.addEventListener('change', function () { state.home = this.value; onContextChange(); });
});

document.querySelectorAll('input[name="timing"]').forEach(function (r) {
  r.addEventListener('change', function () { state.timing = this.value; onContextChange(); });
});

$('cat-hint-btn').addEventListener('click', function () {
  var cat = state.suggestCat;
  if (!cat) return;
  category.value = cat;
  category.dispatchEvent(new Event('change'));
  var match = matchJob(cat, state.description);
  state.category = cat;
  state.jobId = match.job.id;
  state.qty = guessQty(match.job, state.description);
  state.suggestCat = null;
  state.refined = null;
  resetChat();
  buildJobSelect();
  renderAll();
  $('est-title').focus();
});

document.querySelectorAll('[data-action="edit"]').forEach(function (b) {
  b.addEventListener('click', function () {
    if (location.hash === '#estimate') {
      history.back();
    } else {
      showView('details');
      category.focus({ preventScroll: true });
    }
  });
});

/* ---------- Booking ---------- */

var PLATFORMS = {
  'Aircon': [
    { mark: 'H', name: 'Helpling', desc: 'Book aircon servicing, chemical washes and overhauls online at listed prices.', href: 'https://www.helpling.com.sg/aircon-services', cta: 'Book on Helpling' },
    { mark: 'U', name: 'Urban Company', desc: 'Fixed-price aircon servicing and repairs with a 30-day service guarantee.', href: 'https://www.urbancompany.com/singapore-ac-service-repair', cta: 'Book on Urban Company' }
  ],
  'General Handyman': [
    { mark: 'U', name: 'Urban Company', desc: 'Book a handyman for mounting, assembly and curtain jobs at listed prices.', href: 'https://www.urbancompany.com/singapore-handyman', cta: 'Book on Urban Company' }
  ],
  'Carpentry': [
    { mark: 'U', name: 'Urban Company', desc: 'Book a handyman for small hinge, door and fitting repairs at listed prices.', href: 'https://www.urbancompany.com/singapore-handyman', cta: 'Book on Urban Company' }
  ],
  'Plumbing': [
    { mark: 'A', name: 'Airtasker', desc: 'Post the job, set your budget and choose from plumbers who make offers.', href: 'https://airtasker.com/sg/services/plumbing/', cta: 'Post on Airtasker' }
  ],
  'Electrical': []
};

function tradePlural(trade) {
  if (/man$/.test(trade)) return trade.replace(/man$/, 'men');
  if (/servicing$/.test(trade)) return trade + ' companies';
  return trade + 's';
}

function linkRow(item) {
  var actions = item.href
    ? el('div', { class: 'book-actions' }, [
        el('a', { class: 'btn-sm ghost', href: item.href, target: '_blank', rel: 'noopener', text: item.cta })
      ])
    : null;
  return el('li', { class: 'book-row' + (item.href ? '' : ' is-tip') }, [
    el('div', { class: 'book-mark', 'aria-hidden': 'true', text: item.mark }),
    el('div', { class: 'book-body' }, [
      el('h3', { text: item.name }),
      el('p', { text: item.desc })
    ]),
    actions
  ]);
}

function partnerRow(p) {
  var job = currentJob();
  var summary = jobSummary();
  var initials = p.name.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  var mark = el('div', { class: 'book-mark', 'aria-hidden': 'true' }, [
    p.logo ? el('img', { src: p.logo, alt: '' }) : initials
  ]);

  var title = el('h3', null, [p.name]);
  title.appendChild(el('span', { class: 'tag', text: p.sponsored ? 'Sponsored' : 'Partner' }));

  var metaParts = [];
  if (p.fromPrice) metaParts.push('From S$' + p.fromPrice + (p.priceUnit ? ' ' + p.priceUnit : ''));
  if (p.areas && p.areas.length) metaParts.push(p.areas.join(', '));
  if (p.licence) metaParts.push(p.licence);
  if (p.rating && p.reviews) metaParts.push(p.rating.toFixed(1) + ' from ' + p.reviews + ' ' + (p.reviewSource || '') + ' reviews');
  if (p.verified) metaParts.push('Business details checked ' + p.verified);

  var actions = el('div', { class: 'book-actions' });
  if (p.whatsapp) {
    actions.appendChild(el('a', {
      class: 'btn-sm', target: '_blank', rel: 'noopener',
      href: 'https://wa.me/' + String(p.whatsapp).replace(/\D/g, '') + '?text=' + encodeURIComponent(summary),
      text: 'WhatsApp'
    }));
  }
  if (p.phone) actions.appendChild(el('a', { class: 'btn-sm ghost', href: 'tel:' + String(p.phone).replace(/[^\d+]/g, ''), text: 'Call' }));
  if (p.website) actions.appendChild(el('a', { class: 'btn-sm ghost', href: p.website, target: '_blank', rel: 'noopener sponsored', text: 'Website' }));

  return el('li', { class: 'book-row is-partner', 'data-partner': p.id || slug(p.name) }, [
    mark,
    el('div', { class: 'book-body' }, [
      title,
      p.tagline ? el('p', { text: p.tagline }) : null,
      metaParts.length ? el('p', { class: 'book-meta', text: metaParts.join('. ') + '.' }) : null
    ]),
    actions
  ]);
}

function renderBooking() {
  var job = currentJob();
  var cat = state.category;

  var partners = state.partners
    .filter(function (p) { return p.categories.indexOf(cat) !== -1; })
    .sort(function (a, b) {
      var sa = (a.sponsored ? 2 : 0) + (a.jobs && a.jobs.indexOf(job.id) !== -1 ? 1 : 0);
      var sb = (b.sponsored ? 2 : 0) + (b.jobs && b.jobs.indexOf(job.id) !== -1 ? 1 : 0);
      return sb - sa || a.name.localeCompare(b.name);
    })
    .slice(0, 6);

  var partnerList = $('book-partners');
  partnerList.innerHTML = '';
  partners.forEach(function (p) { partnerList.appendChild(partnerRow(p)); });

  var links = [];
  links.push({
    mark: 'C', name: 'Carousell',
    desc: 'Current listings for \u201c' + job.search + '\u201d from Singapore contractors. Compare prices, reviews and response times.',
    href: 'https://www.carousell.sg/' + slug(job.search) + '/q/',
    cta: 'See listings'
  });
  (PLATFORMS[cat] || []).forEach(function (p) { links.push(p); });
  links.push({
    mark: 'G', name: 'Google Maps',
    desc: 'Nearby ' + tradePlural(job.trade) + ' with recent reviews. Sort by rating and check what people paid.',
    href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(job.trade + ' Singapore'),
    cta: 'Open Maps'
  });
  if (state.home === 'hdb' && (cat === 'Plumbing' || cat === 'Electrical')) {
    links.push({
      mark: 'TC', name: 'Your town council',
      desc: 'Many HDB town councils appoint contractors for basic plumbing and electrical repairs and publish fixed prices. Check your town council\u2019s website or call its office.'
    });
  }
  if (cat === 'Electrical') {
    links.push({
      mark: 'EMA', name: 'Check the electrician\u2019s licence',
      desc: 'Electrical work in Singapore must be done by an EMA-licensed electrical worker. Look them up before work starts.',
      href: 'https://elise.ema.gov.sg/elise/LEWs.jsp',
      cta: 'Search EMA register'
    });
  }
  if (cat === 'Plumbing') {
    links.push({
      mark: 'PUB', name: 'Check the plumber\u2019s licence',
      desc: 'Regulated water and sanitary plumbing must be done by a PUB-licensed plumber. PUB lists where to find and verify them.',
      href: 'https://www.pub.gov.sg/Professionals/Requirements/Licensed-Plumbers/Plumbing-Works',
      cta: 'See PUB guidance'
    });
  }

  var linkList = $('book-links');
  linkList.innerHTML = '';
  links.forEach(function (l) { linkList.appendChild(linkRow(l)); });
}

function normalisePartner(p) {
  if (!p || typeof p !== 'object' || !p.name || !Array.isArray(p.categories)) return null;
  if (p.active === false) return null;
  var cats = p.categories.filter(function (c) { return CATEGORIES.indexOf(c) !== -1; });
  if (!cats.length) return null;
  var safeUrl = function (u) { return typeof u === 'string' && /^https:\/\//i.test(u) ? u : null; };
  return {
    id: p.id, name: String(p.name), categories: cats,
    jobs: Array.isArray(p.jobs) ? p.jobs : [],
    tagline: p.tagline ? String(p.tagline) : '',
    areas: Array.isArray(p.areas) ? p.areas.map(String) : [],
    fromPrice: typeof p.fromPrice === 'number' ? p.fromPrice : null,
    priceUnit: p.priceUnit ? String(p.priceUnit) : '',
    licence: p.licence ? String(p.licence) : '',
    rating: typeof p.rating === 'number' ? p.rating : null,
    reviews: typeof p.reviews === 'number' ? p.reviews : null,
    reviewSource: p.reviewSource ? String(p.reviewSource) : '',
    verified: p.verified ? String(p.verified) : '',
    whatsapp: p.whatsapp ? String(p.whatsapp) : '',
    phone: p.phone ? String(p.phone) : '',
    website: safeUrl(p.website),
    logo: typeof p.logo === 'string' && (/^\/[^/]/.test(p.logo) || /^https:\/\//.test(p.logo)) ? p.logo : null,
    sponsored: !!p.sponsored
  };
}

fetch('/data/partners.json', { cache: 'no-cache' })
  .then(function (r) { return r.ok ? r.json() : []; })
  .then(function (list) {
    state.partners = (Array.isArray(list) ? list : []).map(normalisePartner).filter(Boolean);
    if (state.jobId) renderBooking();
  })
  .catch(function () { state.partners = []; });

/* ---------- Chat ---------- */

var chatLog = $('chat-log');
var chatForm = $('chat-form');
var chatInput = $('chat-input');
var chatSend = $('chat-send');
var chatChips = $('chat-chips');

function scrollChat() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

function addBubble(role, text, update) {
  var bubble = el('div', { class: 'msg ' + (role === 'user' ? 'msg-user' : 'msg-bot') }, [
    el('span', { class: 'visually-hidden', text: role === 'user' ? 'You said: ' : 'Assistant: ' }),
    text
  ]);
  if (update) bubble.appendChild(el('span', { class: 'msg-update', text: 'Estimate updated to ' + update }));
  chatLog.appendChild(bubble);
  scrollChat();
  return bubble;
}

function addNote(text) {
  chatLog.appendChild(el('p', { class: 'msg msg-note', text: text }));
  scrollChat();
}

function addError(text) {
  var node = el('p', { class: 'msg msg-error', role: 'alert', text: text });
  chatLog.appendChild(node);
  scrollChat();
  return node;
}

function setChatEnabled(on) {
  chatInput.disabled = !on;
  chatSend.disabled = !on;
}

var CHIPS = [
  { label: 'I got a quote. Is it fair?', fill: 'I was quoted S$ for this. Is that fair?', caret: 13 },
  { label: 'What could make it cost more?', send: 'What could make this cost more than the estimate?' },
  { label: 'What should I ask the contractor?', send: 'What should I ask a contractor before I book this job?' }
];

function renderChips() {
  chatChips.innerHTML = '';
  CHIPS.forEach(function (c) {
    var b = el('button', { type: 'button', class: 'chip', text: c.label });
    b.addEventListener('click', function () {
      if (c.send) { sendMessage(c.send); return; }
      chatInput.value = c.fill;
      autoGrow();
      chatInput.focus();
      chatInput.setSelectionRange(c.caret, c.caret);
    });
    chatChips.appendChild(b);
  });
  chatChips.hidden = false;
}

function resetChat() {
  state.chat = { messages: [], busy: false, closed: false, started: false };
  chatLog.innerHTML = '';
  var job = currentJob();
  if (job) addBubble('assistant', greetingFor(job));
  renderChips();
  setChatEnabled(true);
  chatInput.value = '';
  autoGrow();
}

function autoGrow() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight + 2, 160) + 'px';
}

chatInput.addEventListener('input', autoGrow);
chatInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    chatForm.requestSubmit ? chatForm.requestSubmit() : chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
});

chatForm.addEventListener('submit', function (e) {
  e.preventDefault();
  var text = chatInput.value.trim();
  if (!text) { chatInput.focus(); return; }
  sendMessage(text);
});

/* Shrink the photo before it goes to the assistant: max 1024px, JPEG. */
function preparePhoto() {
  if (photoPayload !== undefined) return Promise.resolve(photoPayload);
  if (!photoFile) { photoPayload = null; return Promise.resolve(null); }
  var url = URL.createObjectURL(photoFile);
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      try {
        var max = 1024;
        var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        var data = dataUrl.split(',')[1] || '';
        photoPayload = data ? { media_type: 'image/jpeg', data: data } : null;
      } catch (err) {
        photoPayload = null;
      }
      URL.revokeObjectURL(url);
      resolve(photoPayload);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      photoPayload = null;
      resolve(null);
    };
    img.src = url;
  });
}

var ERRORS = {
  not_configured: 'The quote assistant isn\u2019t available on this site yet. Your estimate above still works, and you can book below.',
  limit: 'This chat has reached its length limit. Your latest estimate is saved above. Start a new estimate to chat again.',
  busy: 'The assistant is busy right now. Wait a few seconds and send your message again.',
  timeout: 'The assistant took too long to reply. Send your message again.',
  rate: 'You\u2019re sending messages quickly. Wait a minute, then send again.',
  network: 'Couldn\u2019t reach the assistant. Check your connection and send again.',
  generic: 'The assistant couldn\u2019t reply. Send your message again.'
};

function sendMessage(text) {
  if (state.chat.busy || state.chat.closed) return;
  var userCount = state.chat.messages.filter(function (m) { return m.role === 'user'; }).length;
  if (userCount >= MAX_USER_MESSAGES) {
    state.chat.closed = true;
    setChatEnabled(false);
    addError(ERRORS.limit);
    return;
  }

  state.chat.busy = true;
  state.chat.started = true;
  chatChips.hidden = true;
  setChatEnabled(false);
  chatInput.value = '';
  autoGrow();

  state.chat.messages.push({ role: 'user', content: text });
  var userBubble = addBubble('user', text);

  var typing = el('div', { class: 'msg msg-bot', 'aria-label': 'Assistant is typing' }, [
    el('span', { class: 'typing', 'aria-hidden': 'true' }, [el('span'), el('span'), el('span')])
  ]);
  chatLog.appendChild(typing);
  scrollChat();

  preparePhoto().then(function (image) {
    var body = {
      jobId: state.jobId,
      qty: state.qty,
      home: state.home,
      timing: state.timing,
      description: state.description,
      messages: state.chat.messages
    };
    if (image) body.image = image;

    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { res: res, data: data };
      });
    });
  }).then(function (out) {
    typing.remove();
    var res = out.res;
    var data = out.data || {};

    if (res.ok && data.reply) {
      state.chat.messages.push({ role: 'assistant', content: data.reply });
      var updateText = null;
      if (data.estimate) {
        var job = currentJob();
        if (data.estimate.qty && job && job.unit) state.qty = clampQty(job, data.estimate.qty);
        state.refined = { low: data.estimate.low, high: data.estimate.high, basis: data.estimate.basis };
        updateText = formatRange(data.estimate.low, data.estimate.high);
        renderEstimate();
        renderShare();
      }
      addBubble('assistant', data.reply, updateText);
      finishSend(true);
      return;
    }

    // Failure: take the message back so the person can resend it.
    var code = data.error;
    if (res.status === 404 || code === 'not_configured') return failSend(text, userBubble, ERRORS.not_configured, true);
    if (code === 'limit') return failSend(null, null, ERRORS.limit, true);
    if (res.status === 429) return failSend(text, userBubble, ERRORS.rate, false);
    if (code === 'busy') return failSend(text, userBubble, ERRORS.busy, false);
    if (code === 'timeout') return failSend(text, userBubble, ERRORS.timeout, false);
    return failSend(text, userBubble, ERRORS.generic, false);
  }).catch(function () {
    typing.remove();
    failSend(text, userBubble, ERRORS.network, false);
  });
}

function failSend(text, bubble, message, close) {
  if (text) {
    state.chat.messages.pop();
    if (bubble) bubble.remove();
    chatInput.value = text;
    autoGrow();
  }
  if (!state.chat.messages.length) state.chat.started = false;
  addError(message);
  state.chat.busy = false;
  if (close) {
    state.chat.closed = true;
    setChatEnabled(false);
  } else {
    setChatEnabled(true);
    chatInput.focus();
  }
}

function finishSend() {
  state.chat.busy = false;
  setChatEnabled(true);
  chatInput.focus({ preventScroll: true });
}

/* ---------- Price board ---------- */

var BOARD = ['ac-chemwash', 'plumb-choke-toilet', 'elec-socket', 'hm-tv', 'carp-hinge', 'elec-trip'];

function renderBoard() {
  var list = $('board-list');
  BOARD.forEach(function (id) {
    var job = jobById(id);
    if (!job) return;
    var e = estimate(job, {});
    var price = el('span', { class: 'board-price' }, [formatRange(e.low, e.high)]);
    if (job.unit) price.appendChild(el('small', { text: 'first ' + unitNoun(job, 1) }));
    var btn = el('button', { type: 'button', class: 'board-item' }, [
      el('span', null, [
        el('span', { class: 'board-name', text: job.name }),
        el('span', { class: 'board-cat', text: job.cat })
      ]),
      price
    ]);
    btn.addEventListener('click', function () {
      category.value = job.cat;
      category.dispatchEvent(new Event('change'));
      description.value = '';
      markStep(2, false);
      startEstimate(job.cat, '', job.id);
    });
    list.appendChild(el('li', null, [btn]));
  });
  $('board-source').textContent = 'From published Singapore price lists, updated ' + RATES_UPDATED + '.';
}

/* ---------- Boot ---------- */

function renderAll() {
  renderEstimate();
  renderBooking();
}

renderBoard();
document.body.dataset.view = 'details';
