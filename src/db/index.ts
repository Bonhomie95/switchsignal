import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = ReturnType<typeof createDb>;

function createDb() {
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const file =
    process.env.DATABASE_FILE ?? path.join(dataDir, "switchsignal.db");
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });

  if (process.env.RUN_MIGRATIONS === "true") {
    migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  }

  return db;
}

// During `next build`, Next.js imports every route module to collect page
// data — including this one. We must NOT open a real SQLite/WAL connection
// during that phase, or the build fails inside Docker's build filesystem.
// NEXT_PHASE is set automatically by Next.js during the build step only.
function createBuildTimeStub(): DB {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Database accessed during build time (NEXT_PHASE=phase-production-build). " +
            "This route must not run DB queries at module scope or during static analysis."
        );
      },
    }
  ) as DB;
}

// Singleton across Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { __db?: DB };
export const db: DB =
  globalForDb.__db ??
  (process.env.NEXT_PHASE === "phase-production-build"
    ? createBuildTimeStub()
    : createDb());
globalForDb.__db = db;

export * from "./schema";