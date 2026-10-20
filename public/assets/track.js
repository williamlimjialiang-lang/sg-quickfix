/*
 * Anonymous usage counts for the /stats dashboard. No cookies and nothing
 * stored in the browser; the server keeps a hash that changes every day.
 * Usage: track('estimate', 'Plumbing'). A page view is sent on load.
 */
export function track(type, detail) {
  try {
    if (navigator.doNotTrack === '1' || window.globalPrivacyControl) return;
    var body = JSON.stringify({ type: type, path: location.pathname, detail: detail || null });
    var blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/track', blob)) return;
    fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true })
      .catch(function () {});
  } catch (e) { /* tracking must never break the page */ }
}

window.sgTrack = track; // for classic scripts such as suppliers.js
track('pageview');
