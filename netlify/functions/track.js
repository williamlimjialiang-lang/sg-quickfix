/*
 * POST /api/track
 * Records one anonymous event. The browser sends { e: "estimate", p: { cat: "Aircon" } }.
 */

import { EVENTS, cleanProps, eventKey, sgDate, statsStore, visitorId } from '../lib/stats-core.js';

export const config = {
  path: '/api/track',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};

// Crawlers that run JavaScript, plus scripted clients. Real browsers never match.
const NOT_A_PERSON = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|curl|wget|python-requests|node-fetch|axios|go-http/i;

const done = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export default async (req, context) => {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) return new Response(null, { status: 403 });
    } catch (e) {
      return new Response(null, { status: 403 });
    }
  }

  const ua = req.headers.get('user-agent') || '';
  if (!ua || NOT_A_PERSON.test(ua)) return done();

  const text = await req.text().catch(() => '');
  if (!text || text.length > 2000) return new Response(null, { status: 400 });

  let body;
  try { body = JSON.parse(text); } catch (e) { return new Response(null, { status: 400 }); }
  const event = body && body.e;
  if (!Object.prototype.hasOwnProperty.call(EVENTS, event)) return new Response(null, { status: 400 });

  const raw = body.p && typeof body.p === 'object' ? Object.assign({}, body.p) : {};
  if (event === 'view') {
    raw.cc = context && context.geo && context.geo.country ? context.geo.country.code : '';
  }
  const props = cleanProps(event, raw);

  const ip = (context && context.ip) ||
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const date = sgDate();
  const key = eventKey(date, event, visitorId(ip, ua, date), props);

  try {
    await statsStore(context).set(key, '1');
  } catch (err) {
    console.error('track: could not save event', err && err.message);
    return new Response(null, { status: 500 });
  }
  return done();
};
