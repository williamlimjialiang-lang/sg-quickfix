/*
 * POST /api/track
 *
 * Records one anonymous event for the /stats dashboard. Visitors are counted
 * with a SHA-256 hash of the day, IP address and browser, so the same person
 * counts once per day and the hash can't be linked across days. The IP itself
 * is never stored.
 *
 * Environment variables
 *   STATS_SALT  Optional. Any long random string; mixed into the visitor hash.
 */

import { createHash } from 'node:crypto';
import type { Config, Context } from '@netlify/functions';
import { db } from '../../db/index.js';
import { events } from '../../db/schema.js';

export const config: Config = {
  path: '/api/track',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};

const EVENT_TYPES = ['pageview', 'estimate', 'chat', 'book', 'application'] as const;

const BOT_UA = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|axios|node-fetch/i;

function clip(value: unknown, max: number): string | null {
  return typeof value === 'string' && value ? value.slice(0, max) : null;
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  // Only count events sent from this site's own pages.
  const origin = req.headers.get('origin');
  try {
    if (!origin || new URL(origin).host !== new URL(req.url).host) return new Response(null, { status: 403 });
  } catch {
    return new Response(null, { status: 403 });
  }

  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT_UA.test(ua)) return new Response(null, { status: 204 });

  let body: { type?: unknown; path?: unknown; detail?: unknown };
  try {
    const text = await req.text();
    if (text.length > 2000) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!EVENT_TYPES.includes(body.type as (typeof EVENT_TYPES)[number])) return new Response(null, { status: 400 });

  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const salt = process.env.STATS_SALT || context.site.id || '';
  const visitor = createHash('sha256').update([day, context.ip, ua, salt].join('|')).digest('hex').slice(0, 32);

  try {
    await db.insert(events).values({
      type: body.type as string,
      path: clip(body.path, 200),
      detail: clip(body.detail, 120),
      visitor
    });
  } catch (err) {
    console.error('track insert failed', err);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
};
