import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

// One row per tracked action. `visitor` is a hash that rotates daily, so the
// same person can be counted once per day without cookies or stored IPs.
export const events = pgTable(
  "events",
  {
    id: serial().primaryKey(),
    type: text().notNull(),
    path: text(),
    detail: text(),
    visitor: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_created_at_idx").on(t.createdAt), index("events_type_created_at_idx").on(t.type, t.createdAt)]
);
