/*
 * Shared logic for /api/track and /api/stats.
 *
 * How events are stored
 *   Each event is its own Netlify Blobs entry. Nothing is ever read, changed
 *   and written back, so two visitors at the same moment can't overwrite each
 *   other. Everything the dashboard needs lives in the key itself:
 *
 *     ev/2026-10-20/estimate/Ab3dE9fGh1Jk/cat=Aircon&job=ac-chemwash/lx9z2k1a3f9c
 *        date (SGT)  event    visitor ID    properties                 unique id
 *
 *   So the dashboard only has to list keys, never open them. Once a day is
 *   two days old its totals are saved under sum/<date> and reused.
 *
 * Privacy
 *   The visitor ID is a hash of IP address + browser + a salt that changes
 *   every day. The IP itself is never stored, IDs can't be linked across days,
 *   and no cookies are used.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const SUMMARY_VERSION = 2;

/* Allowed events and the properties each one may carry. */
export const EVENTS = {
  view: ['page', 'ref', 'dev', 'cc'],
  estimate: ['cat', 'job', 'via'],
  adjust: ['what'],
  chat_start: ['cat', 'job'],
  chat_message: ['cat'],
  chat_refined: ['cat', 'job'],
  chat_error: ['code'],
  book_click: ['target', 'cat', 'partner'],
  share: ['via', 'cat'],
  supplier_submit: ['listing']
};

/* Which properties get a breakdown table on the dashboard. */
const BREAKDOWNS = {
  estimate: ['cat', 'job', 'via'],
  adjust: ['what'],
  chat_start: ['cat'],
  chat_refined: ['cat'],
  chat_error: ['code'],
  book_click: ['target', 'partner'],
  share: ['via'],
  supplier_submit: ['listing']
};

/* ---------- Dates (Singapore time, UTC+8, no daylight saving) ---------- */

export function sgDate(ts) {
  return new Date((ts == null ? Date.now() : ts) + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- Storage ---------- */

/*
 * Production gets its own store. Deploy previews and branch deploys write to a
 * separate one, so testing a preview never pollutes your real numbers.
 */
export function statsStore(context) {
  const ctx = (context && context.deploy && context.deploy.context) || process.env.CONTEXT || 'production';
  const name = ctx === 'production' ? 'stats' : 'stats-' + String(ctx).replace(/[^a-z0-9-]/gi, '').slice(0, 40);
  return getStore({ name });
}

/* ---------- Visitor IDs ---------- */

function secret() {
  return process.env.STATS_SECRET || process.env.SITE_ID || 'sg-quickfix';
}

export function visitorId(ip, userAgent, date) {
  const salt = createHmac('sha256', 'sgqf-visitor-v1').update(secret() + ':' + date).digest();
  return createHash('sha256')
    .update(salt)
    .update(String(ip || ''))
    .update('|')
    .update(String(userAgent || ''))
    .digest('base64url')
    .slice(0, 12);
}

/* ---------- Keys ---------- */

function cleanValue(v) {
  return String(v == null ? '' : v).replace(/[^A-Za-z0-9 _.:-]/g, '').trim().slice(0, 40);
}

export function cleanProps(event, props) {
  const out = {};
  (EVENTS[event] || []).forEach(function (k) {
    if (props && props[k] != null) {
      const v = cleanValue(props[k]);
      if (v) out[k] = v;
    }
  });
  return out;
}

export function eventKey(date, event, visitor, props) {
  const pairs = Object.keys(props).map(function (k) { return k + '=' + encodeURIComponent(props[k]); });
  const id = Date.now().toString(36) + randomBytes(4).toString('hex');
  return ['ev', date, event, visitor, pairs.length ? pairs.join('&') : '-', id].join('/');
}

export function parseKey(key) {
  const parts = String(key).split('/');
  if (parts.length !== 6 || parts[0] !== 'ev' || !EVENTS[parts[2]]) return null;
  const props = {};
  if (parts[4] !== '-') {
    parts[4].split('&').forEach(function (pair) {
      const i = pair.indexOf('=');
      if (i > 0) {
        try { props[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); } catch (e) { /* skip */ }
      }
    });
  }
  return { date: parts[1], event: parts[2], visitor: parts[3], props: props };
}

/* ---------- Summaries ---------- */

function bump(map, key, n) {
  map[key] = (map[key] || 0) + (n || 1);
}

/* Turns one day's keys into counts, unique visitors and breakdowns. */
export function summarizeKeys(date, keys) {
  const events = {};
  const eventVisitors = {};
  const pages = {};
  const pageVisitors = {};
  const landingDims = { ref: {}, dev: {}, cc: {} };
  const by = {};

  keys.forEach(function (key) {
    const k = parseKey(key);
    if (!k || k.date !== date) return;

    events[k.event] = events[k.event] || { n: 0, u: 0 };
    events[k.event].n++;
    (eventVisitors[k.event] = eventVisitors[k.event] || new Set()).add(k.visitor);

    if (k.event === 'view') {
      const page = k.props.page || 'other';
      pages[page] = pages[page] || { n: 0, u: 0 };
      pages[page].n++;
      (pageVisitors[page] = pageVisitors[page] || new Set()).add(k.visitor);
      if (page === 'landing') {
        Object.keys(landingDims).forEach(function (dim) {
          const value = k.props[dim] || (dim === 'ref' ? 'direct' : 'unknown');
          (landingDims[dim][value] = landingDims[dim][value] || new Set()).add(k.visitor);
        });
      }
      return;
    }

    (BREAKDOWNS[k.event] || []).forEach(function (dim) {
      if (k.props[dim]) {
        const name = k.event + '.' + dim;
        by[name] = by[name] || {};
        bump(by[name], k.props[dim]);
      }
    });
  });

  Object.keys(events).forEach(function (e) { events[e].u = eventVisitors[e].size; });
  Object.keys(pages).forEach(function (p) { pages[p].u = pageVisitors[p].size; });
  Object.keys(landingDims).forEach(function (dim) {
    const name = 'landing.' + dim;
    by[name] = {};
    Object.keys(landingDims[dim]).forEach(function (v) { by[name][v] = landingDims[dim][v].size; });
  });

  const size = function (set) { return set ? set.size : 0; };
  return {
    v: SUMMARY_VERSION,
    date: date,
    events: events,
    pages: pages,
    funnel: {
      landing: size(pageVisitors.landing),
      estimate: size(eventVisitors.estimate),
      chat: size(eventVisitors.chat_start),
      refined: size(eventVisitors.chat_refined),
      book: size(eventVisitors.book_click)
    },
    by: by
  };
}

/* Adds daily summaries together. Unique visitors are summed per day. */
export function mergeSummaries(list) {
  const total = { events: {}, pages: {}, funnel: { landing: 0, estimate: 0, chat: 0, refined: 0, book: 0 }, by: {} };
  list.forEach(function (s) {
    Object.keys(s.events).forEach(function (e) {
      total.events[e] = total.events[e] || { n: 0, u: 0 };
      total.events[e].n += s.events[e].n;
      total.events[e].u += s.events[e].u;
    });
    Object.keys(s.pages).forEach(function (p) {
      total.pages[p] = total.pages[p] || { n: 0, u: 0 };
      total.pages[p].n += s.pages[p].n;
      total.pages[p].u += s.pages[p].u;
    });
    Object.keys(total.funnel).forEach(function (f) { total.funnel[f] += s.funnel[f] || 0; });
    Object.keys(s.by).forEach(function (name) {
      total.by[name] = total.by[name] || {};
      Object.keys(s.by[name]).forEach(function (v) { bump(total.by[name], v, s.by[name][v]); });
    });
  });
  return total;
}

/* ---------- Password and sign-in tokens ---------- */

// SHA-256 of the default password. Set STATS_PASSWORD in Netlify to change it.
const DEFAULT_PASSWORD_SHA256 = '15a7274356a34fc22820f5a8dbfdef63843051fff087f352e56b4056f6e887f4';
const TOKEN_TTL_MS = 12 * 3600 * 1000;

function sha256(text) {
  return createHash('sha256').update(String(text)).digest();
}

function passwordDigest() {
  return process.env.STATS_PASSWORD ? sha256(process.env.STATS_PASSWORD) : Buffer.from(DEFAULT_PASSWORD_SHA256, 'hex');
}

export function checkPassword(input) {
  const a = sha256(input == null ? '' : input);
  const b = passwordDigest();
  return a.length === b.length && timingSafeEqual(a, b);
}

// Tokens are signed with a key derived from the password, so changing the
// password signs everyone out.
function signingKey() {
  return createHmac('sha256', 'sgqf-stats-v1').update(passwordDigest()).update(secret()).digest();
}

export function issueToken() {
  const expires = Date.now() + TOKEN_TTL_MS;
  const body = expires.toString(36);
  const sig = createHmac('sha256', signingKey()).update(body).digest('base64url');
  return { token: body + '.' + sig, expires: expires };
}

export function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  const expires = parseInt(parts[0], 36);
  if (!isFinite(expires) || expires < Date.now()) return false;
  const expected = createHmac('sha256', signingKey()).update(parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
