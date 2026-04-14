import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.resolve('./data/incubator.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    hex TEXT PRIMARY KEY,
    npub TEXT NOT NULL,
    wallet_id TEXT,
    name TEXT,
    picture TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS beings_owners (
    owner_hex TEXT PRIMARY KEY,
    being_name TEXT NOT NULL UNIQUE,
    being_npub TEXT NOT NULL,
    being_domain TEXT NOT NULL,
    language TEXT,
    vision TEXT,
    birthed_at INTEGER NOT NULL,
    FOREIGN KEY (owner_hex) REFERENCES users(hex)
  );

  CREATE TABLE IF NOT EXISTS kind_38888 (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    event_id TEXT,
    version TEXT,
    relays_json TEXT,
    electrum_json TEXT,
    updated_at INTEGER
  );
`);

// Migrate: add electrum_json if missing
try {
  const cols = db.prepare("PRAGMA table_info(kind_38888)").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'electrum_json')) {
    db.exec('ALTER TABLE kind_38888 ADD COLUMN electrum_json TEXT');
  }
} catch {}

export const statements = {
  upsertUser: db.prepare(`
    INSERT INTO users (hex, npub, wallet_id, name, picture, first_seen, last_seen)
    VALUES (@hex, @npub, @wallet_id, @name, @picture, @now, @now)
    ON CONFLICT(hex) DO UPDATE SET
      npub = excluded.npub,
      wallet_id = excluded.wallet_id,
      name = COALESCE(excluded.name, users.name),
      picture = COALESCE(excluded.picture, users.picture),
      last_seen = @now
  `),

  getBeingByOwner: db.prepare(`
    SELECT being_name AS name, being_npub AS npub, being_domain AS domain, birthed_at
    FROM beings_owners
    WHERE owner_hex = ?
  `),

  getBeingByName: db.prepare(`
    SELECT * FROM beings_owners WHERE being_name = ?
  `),

  insertBeing: db.prepare(`
    INSERT INTO beings_owners (owner_hex, being_name, being_npub, being_domain, language, vision, birthed_at)
    VALUES (@owner_hex, @being_name, @being_npub, @being_domain, @language, @vision, @birthed_at)
  `),

  countBeings: db.prepare(`SELECT COUNT(*) AS n FROM beings_owners`),

  upsertKind38888: db.prepare(`
    INSERT INTO kind_38888 (id, event_id, version, relays_json, electrum_json, updated_at)
    VALUES (1, @event_id, @version, @relays_json, @electrum_json, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      event_id = excluded.event_id,
      version = excluded.version,
      relays_json = excluded.relays_json,
      electrum_json = excluded.electrum_json,
      updated_at = excluded.updated_at
  `),

  getKind38888: db.prepare(`SELECT * FROM kind_38888 WHERE id = 1`),
};
