/*
 * /api/stats
 *   POST { password }            -> { token, expires }  (sign in)
 *   GET  ?days=7  + Bearer token -> daily summaries and totals
 *
 * Password: "admin!@#" unless you set STATS_PASSWORD in Netlify.
 */

import {
  SUMMARY_VERSION, addDays, checkPassword, issueToken, mergeSummaries,
  sgDate, statsStore, summarizeKeys, verifyToken
} from '../lib/stats-core.js';

export const config = {
  path: '/api/stats',
  // Also slows down password guessing: 30 requests a minute per IP.
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};

const MAX_DAYS = 90;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex'
    }
  });
}

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return req.method === 'GET';
  try { return new URL(origin).host === new URL(req.url).host; } catch (e) { return false; }
}

/* Runs fn over items with at most `limit` in flight. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function daySummary(store, date, frozen) {
  if (frozen) {
    const cached = await store.get('sum/' + date, { type: 'json' });
    if (cached && cached.v === SUMMARY_VERSION) return cached;
  }
  const { blobs } = await store.list({ prefix: 'ev/' + date + '/' });
  const summary = summarizeKeys(date, blobs.map((b) => b.key));
  if (frozen) {
    await store.setJSON('sum/' + date, summary).catch((err) => console.error('stats: could not cache', date, err && err.message));
  }
  return summary;
}

export default async (req, context) => {
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403);

  if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch (e) { /* treated as a wrong password */ }
    if (!checkPassword(body && body.password)) {
      await new Promise((r) => setTimeout(r, 500));
      return json({ error: 'wrong_password' }, 401);
    }
    return json(issueToken());
  }

  if (req.method !== 'GET') return json({ error: 'method' }, 405);

  const auth = req.headers.get('authorization') || '';
  if (!verifyToken(auth.replace(/^Bearer\s+/i, ''))) return json({ error: 'signed_out' }, 401);

  const url = new URL(req.url);
  const days = Math.min(MAX_DAYS, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 7));
  const today = sgDate();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(addDays(today, -i));

  // Today and yesterday are always counted fresh; older days are cached.
  const frozenBefore = addDays(today, -1);
  const store = statsStore(context);

  try {
    const daily = await mapLimit(dates, 8, (d) => daySummary(store, d, d < frozenBefore));
    return json({
      days: days,
      from: dates[0],
      to: today,
      generatedAt: new Date().toISOString(),
      daily: daily,
      total: mergeSummaries(daily)
    });
  } catch (err) {
    console.error('stats: could not read events', err && err.message);
    return json({ error: 'storage' }, 500);
  }
};
