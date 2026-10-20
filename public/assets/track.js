/*
 * Anonymous usage counts for the /stats dashboard.
 * No cookies. Sends a page view on load and exposes window.qfTrack(event, props).
 *
 * To stop counting your own visits on a browser, open any page with ?notrack=1
 * (or use the toggle on /stats). Undo with ?notrack=0.
 */
(function () {
  var FLAG = 'qf-notrack';

  try {
    var q = new URLSearchParams(location.search).get('notrack');
    if (q === '1') localStorage.setItem(FLAG, '1');
    if (q === '0') localStorage.removeItem(FLAG);
  } catch (e) { /* storage blocked: tracking stays on */ }

  function excluded() {
    try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }

  function send(event, props) {
    if (excluded()) return;
    try {
      var body = JSON.stringify({ e: event, p: props || {} });
      if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) return;
      fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true })
        .catch(function () {});
    } catch (e) { /* never let analytics break the page */ }
  }

  /* Where the visit came from: a utm_source tag, the referring site, or direct. */
  function source() {
    try {
      var utm = new URLSearchParams(location.search).get('utm_source');
      if (utm) return utm.toLowerCase().slice(0, 40);
      if (!document.referrer) return 'direct';
      var host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host === location.hostname) return 'direct';
      var known = [
        [/(^|\.)google\./, 'google'], [/(^|\.)bing\.com$/, 'bing'], [/duckduckgo\.com$/, 'duckduckgo'],
        [/(^|\.)facebook\.com$|^fb\.me$/, 'facebook'], [/instagram\.com$/, 'instagram'],
        [/^t\.co$|(^|\.)x\.com$|twitter\.com$/, 'x'], [/linkedin\.com$|^lnkd\.in$/, 'linkedin'],
        [/whatsapp\.com$|^wa\.me$/, 'whatsapp'], [/t\.me$|telegram\./, 'telegram'],
        [/reddit\.com$/, 'reddit'], [/carousell\./, 'carousell'], [/hardwarezone\./, 'hardwarezone'],
        [/chatgpt\.com$|openai\.com$/, 'chatgpt'], [/claude\.ai$/, 'claude'], [/perplexity\.ai$/, 'perplexity']
      ];
      for (var i = 0; i < known.length; i++) if (known[i][0].test(host)) return known[i][1];
      return host.slice(0, 40);
    } catch (e) {
      return 'direct';
    }
  }

  window.qfTrack = send;
  window.qfTrackExcluded = excluded;
  window.qfTrackSetExcluded = function (on) {
    try {
      if (on) localStorage.setItem(FLAG, '1');
      else localStorage.removeItem(FLAG);
    } catch (e) { /* ignore */ }
  };

  var page = document.body && document.body.getAttribute('data-page');
  if (page) {
    send('view', {
      page: page,
      ref: source(),
      dev: window.matchMedia('(max-width: 700px)').matches ? 'mobile' : 'desktop'
    });
  }
})();
