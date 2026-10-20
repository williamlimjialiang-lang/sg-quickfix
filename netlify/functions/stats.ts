/*
 * GET /api/stats?days=30
 *
 * Totals and a daily breakdown for the /stats dashboard. Requires the header
 * "Authorization: Bearer <STATS_PASSWORD>".
 *
 * Environment variables
 *   STATS_PASSWORD  Required. The password for the dashboard. The endpoint
 *                   refuses every request until it is set.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Config } from '@netlify/functions';
import { and, count, countDistinct, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { events } from '../../db/schema.js';

export const config: Config = {
  path: '/api/stats',
  // Slows down password guessing.
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function passwordOk(req: Request): boolean {
  const expected = process.env.STATS_PASSWORD;
  if (!expected) return false;
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export default async (req: Request) => {
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  if (!process.env.STATS_PASSWORD) return json({ error: 'not_configured' }, 503);
  if (!passwordOk(req)) return json({ error: 'unauthorized' }, 401);

  const requested = Number(new URL(req.url).searchParams.get('days'));
  const days = [7, 30, 90, 365].includes(requested) ? requested : 30;
  const since = new Date(Date.now() - days * 86400000);

  const day = sql<string>`to_char(${events.createdAt} at time zone 'Asia/Singapore', 'YYYY-MM-DD')`;

  const [daily, totals, topJobs] = await Promise.all([
    // Visitor hashes rotate daily, so "people" here means distinct per day.
    db
      .select({ day, type: events.type, events: count(), people: countDistinct(events.visitor) })
      .from(events)
      .where(gte(events.createdAt, since))
      .groupBy(day, events.type)
      .orderBy(day),
    db
      .select({ type: events.type, events: count() })
      .from(events)
      .where(gte(events.createdAt, since))
      .groupBy(events.type),
    db
      .select({ detail: events.detail, events: count() })
      .from(events)
      .where(and(gte(events.createdAt, since), eq(events.type, 'estimate')))
      .groupBy(events.detail)
      .orderBy(desc(count()))
      .limit(8)
  ]);

  return json({ days, daily, totals, topCategories: topJobs });
};
