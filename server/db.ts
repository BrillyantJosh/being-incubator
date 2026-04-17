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
    pubkey TEXT,
    created_at INTEGER,
    version TEXT,
    valid_from INTEGER,
    relays_json TEXT,
    electrum_json TEXT,
    exchange_rates_json TEXT,
    split TEXT,
    split_target_lana INTEGER,
    split_started_at INTEGER,
    split_ends_at INTEGER,
    raw_event TEXT,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS heartbeat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    success INTEGER,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS beings_embryos (
    id TEXT PRIMARY KEY,
    owner_hex TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    npub TEXT NOT NULL,
    hex_pub TEXT NOT NULL,
    hex_priv TEXT NOT NULL,
    nsec TEXT NOT NULL,
    wif TEXT,
    wallet TEXT,
    language TEXT,
    vision TEXT,
    father_hex TEXT NOT NULL,
    conceived_at INTEGER NOT NULL,
    birth_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'gestating',
    birth_logs TEXT,
    birth_error TEXT,
    birthed_at INTEGER,
    event_id TEXT
  );

  CREATE TABLE IF NOT EXISTS embryo_thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embryo_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    phase TEXT NOT NULL,
    progress REAL NOT NULL,
    content TEXT NOT NULL,
    FOREIGN KEY (embryo_id) REFERENCES beings_embryos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_embryo_thoughts_embryo
    ON embryo_thoughts(embryo_id, created_at);

  CREATE TABLE IF NOT EXISTS multi_being_creators (
    hex TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    breath_duration_ms INTEGER NOT NULL DEFAULT 732000,
    birth_spacing_ms INTEGER NOT NULL DEFAULT 48000,
    min_birth_ms INTEGER NOT NULL DEFAULT 300000,
    updated_at INTEGER,
    updated_by_hex TEXT
  );
`);

// Migration: add min_birth_ms column if upgrading from earlier schema.
// Must run BEFORE the seed INSERT below — the INSERT references min_birth_ms
// and SQLite validates column names at parse time even for OR IGNORE no-ops.
try {
  const cols = (db.prepare("PRAGMA table_info(admin_settings)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('min_birth_ms')) {
    db.exec(`ALTER TABLE admin_settings ADD COLUMN min_birth_ms INTEGER NOT NULL DEFAULT 300000`);
    console.log('[db] ✅ admin_settings.min_birth_ms added');
  }
} catch (err: any) {
  console.error('[db] admin_settings migration error:', err?.message);
}

db.exec(`
  INSERT OR IGNORE INTO admin_settings (id, breath_duration_ms, birth_spacing_ms, min_birth_ms, updated_at)
    VALUES (1, 732000, 48000, 300000, strftime('%s','now') * 1000);
`);

// Migration: beings_owners PK change (owner_hex → auto-increment id) for multi-being support
try {
  const tableInfo = db.prepare("PRAGMA table_info(beings_owners)").all() as { name: string; pk: number }[];
  const ownerCol = tableInfo.find((c) => c.name === 'owner_hex');
  if (ownerCol && ownerCol.pk === 1) {
    console.log('[db] Migrating beings_owners: owner_hex PK → id PK (multi-being support)');
    db.exec(`
      CREATE TABLE beings_owners_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_hex TEXT NOT NULL,
        being_name TEXT NOT NULL UNIQUE,
        being_npub TEXT NOT NULL,
        being_domain TEXT NOT NULL,
        language TEXT,
        vision TEXT,
        birthed_at INTEGER NOT NULL,
        FOREIGN KEY (owner_hex) REFERENCES users(hex)
      );
      INSERT INTO beings_owners_new (owner_hex, being_name, being_npub, being_domain, language, vision, birthed_at)
        SELECT owner_hex, being_name, being_npub, being_domain, language, vision, birthed_at FROM beings_owners;
      DROP TABLE beings_owners;
      ALTER TABLE beings_owners_new RENAME TO beings_owners;
      CREATE INDEX idx_beings_owner ON beings_owners(owner_hex);
    `);
    console.log('[db] ✅ beings_owners migrated');
  }
} catch (err: any) {
  console.error('[db] beings_owners migration error:', err?.message);
}

// Migration: beings_embryos remove UNIQUE on owner_hex for multi-being support
try {
  const embryoCols = db.prepare("PRAGMA index_list(beings_embryos)").all() as { name: string; unique: number }[];
  // SQLite auto-creates "sqlite_autoindex_beings_embryos_2" for UNIQUE(owner_hex).
  // If present, recreate table without that constraint.
  const hasOwnerUnique = embryoCols.some(
    (idx) => idx.unique === 1 && idx.name.includes('autoindex') && idx.name.includes('2')
  );
  if (hasOwnerUnique) {
    console.log('[db] Migrating beings_embryos: removing UNIQUE on owner_hex');
    // Disable FK checks during table swap (embryo_thoughts references beings_embryos)
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE beings_embryos_new (
        id TEXT PRIMARY KEY,
        owner_hex TEXT NOT NULL,
        name TEXT NOT NULL UNIQUE,
        domain TEXT NOT NULL,
        npub TEXT NOT NULL,
        hex_pub TEXT NOT NULL,
        hex_priv TEXT NOT NULL,
        nsec TEXT NOT NULL,
        wif TEXT,
        wallet TEXT,
        language TEXT,
        vision TEXT,
        father_hex TEXT NOT NULL,
        conceived_at INTEGER NOT NULL,
        birth_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'gestating',
        birth_logs TEXT,
        birth_error TEXT,
        birthed_at INTEGER,
        event_id TEXT
      );
      INSERT INTO beings_embryos_new SELECT * FROM beings_embryos;
      DROP TABLE beings_embryos;
      ALTER TABLE beings_embryos_new RENAME TO beings_embryos;
      CREATE INDEX idx_embryos_owner ON beings_embryos(owner_hex);
    `);
    db.pragma('foreign_keys = ON');
    console.log('[db] ✅ beings_embryos migrated');
  }
} catch (err: any) {
  console.error('[db] beings_embryos migration error:', err?.message);
  try { db.pragma('foreign_keys = ON'); } catch {}
}

// Seed multi-being creators
try {
  db.exec(`INSERT OR IGNORE INTO multi_being_creators (hex) VALUES ('56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061')`);
} catch {}

// Migrations: add new kind_38888 columns if upgrading from earlier schema
try {
  const cols = (db.prepare("PRAGMA table_info(kind_38888)").all() as { name: string }[]).map((c) => c.name);
  const addIfMissing = (name: string, type: string) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE kind_38888 ADD COLUMN ${name} ${type}`);
  };
  addIfMissing('pubkey', 'TEXT');
  addIfMissing('created_at', 'INTEGER');
  addIfMissing('valid_from', 'INTEGER');
  addIfMissing('electrum_json', 'TEXT');
  addIfMissing('exchange_rates_json', 'TEXT');
  addIfMissing('split', 'TEXT');
  addIfMissing('split_target_lana', 'INTEGER');
  addIfMissing('split_started_at', 'INTEGER');
  addIfMissing('split_ends_at', 'INTEGER');
  addIfMissing('raw_event', 'TEXT');
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

  getBeingsByOwner: db.prepare(`
    SELECT being_name AS name, being_npub AS npub, being_domain AS domain, language, birthed_at
    FROM beings_owners
    WHERE owner_hex = ?
    ORDER BY birthed_at ASC
  `),

  isMultiBeingCreator: db.prepare(`
    SELECT 1 FROM multi_being_creators WHERE hex = ?
  `),

  getActiveEmbryoByOwner: db.prepare(`
    SELECT * FROM beings_embryos
    WHERE owner_hex = ? AND status IN ('gestating', 'birthing')
    LIMIT 1
  `),

  cleanupCompletedEmbryos: db.prepare(`
    DELETE FROM beings_embryos WHERE owner_hex = ? AND status IN ('birthed', 'failed')
  `),

  cleanupThoughtsForCompletedEmbryos: db.prepare(`
    DELETE FROM embryo_thoughts WHERE embryo_id IN (
      SELECT id FROM beings_embryos WHERE owner_hex = ? AND status IN ('birthed', 'failed')
    )
  `),

  getBeingByName: db.prepare(`
    SELECT * FROM beings_owners WHERE being_name = ?
  `),

  insertBeing: db.prepare(`
    INSERT INTO beings_owners (owner_hex, being_name, being_npub, being_domain, language, vision, birthed_at)
    VALUES (@owner_hex, @being_name, @being_npub, @being_domain, @language, @vision, @birthed_at)
  `),

  // Guarantee a users row exists for owner_hex so the FK on beings_owners
  // can never fail at finalize. Real login flow (upsertUser) populates the
  // full row; this is a safety net when birth is reached without prior auth
  // (e.g. API-driven tests, or any path that bypasses NIP-07 upsert).
  ensureUser: db.prepare(`
    INSERT OR IGNORE INTO users (hex, npub, first_seen, last_seen)
    VALUES (@hex, @npub, @now, @now)
  `),

  countBeings: db.prepare(`SELECT COUNT(*) AS n FROM beings_owners`),

  upsertKind38888: db.prepare(`
    INSERT INTO kind_38888 (
      id, event_id, pubkey, created_at, version, valid_from,
      relays_json, electrum_json, exchange_rates_json,
      split, split_target_lana, split_started_at, split_ends_at,
      raw_event, updated_at
    )
    VALUES (
      1, @event_id, @pubkey, @created_at, @version, @valid_from,
      @relays_json, @electrum_json, @exchange_rates_json,
      @split, @split_target_lana, @split_started_at, @split_ends_at,
      @raw_event, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      event_id = excluded.event_id,
      pubkey = excluded.pubkey,
      created_at = excluded.created_at,
      version = excluded.version,
      valid_from = excluded.valid_from,
      relays_json = excluded.relays_json,
      electrum_json = excluded.electrum_json,
      exchange_rates_json = excluded.exchange_rates_json,
      split = excluded.split,
      split_target_lana = excluded.split_target_lana,
      split_started_at = excluded.split_started_at,
      split_ends_at = excluded.split_ends_at,
      raw_event = excluded.raw_event,
      updated_at = excluded.updated_at
  `),

  getKind38888: db.prepare(`SELECT * FROM kind_38888 WHERE id = 1`),

  insertHeartbeatLog: db.prepare(`
    INSERT INTO heartbeat_logs (started_at) VALUES (?)
  `),
  updateHeartbeatLog: db.prepare(`
    UPDATE heartbeat_logs SET completed_at = @completed_at, success = @success, error = @error WHERE id = @id
  `),
  pruneHeartbeatLogs: db.prepare(`
    DELETE FROM heartbeat_logs WHERE id < (SELECT MAX(id) FROM heartbeat_logs) - 500
  `),

  // ── Embryos ──────────────────────────────────────────────
  insertEmbryo: db.prepare(`
    INSERT INTO beings_embryos (
      id, owner_hex, name, domain, npub, hex_pub, hex_priv, nsec, wif, wallet,
      language, vision, father_hex, conceived_at, birth_at, status
    ) VALUES (
      @id, @owner_hex, @name, @domain, @npub, @hex_pub, @hex_priv, @nsec, @wif, @wallet,
      @language, @vision, @father_hex, @conceived_at, @birth_at, 'gestating'
    )
  `),

  getEmbryoById: db.prepare(`SELECT * FROM beings_embryos WHERE id = ?`),
  getEmbryoByOwner: db.prepare(`SELECT * FROM beings_embryos WHERE owner_hex = ?`),
  getEmbryoByName: db.prepare(`SELECT id FROM beings_embryos WHERE name = ?`),

  getDueEmbryos: db.prepare(`
    SELECT * FROM beings_embryos
    WHERE status = 'gestating' AND birth_at <= ?
    ORDER BY birth_at ASC
    LIMIT 1
  `),

  setEmbryoStatus: db.prepare(`
    UPDATE beings_embryos SET status = @status WHERE id = @id
  `),

  completeEmbryoBirth: db.prepare(`
    UPDATE beings_embryos
    SET status = 'birthed', birthed_at = @birthed_at, birth_logs = @birth_logs, event_id = @event_id
    WHERE id = @id
  `),

  failEmbryoBirth: db.prepare(`
    UPDATE beings_embryos
    SET status = 'failed', birth_error = @error, birth_logs = @birth_logs
    WHERE id = @id
  `),

  deleteEmbryo: db.prepare(`DELETE FROM beings_embryos WHERE id = ?`),

  // Recover any embryos marked 'birthing' but never completed —
  // happens if the process crashed mid-birth. They come back as
  // 'gestating' one more time, the watcher will retry.
  recoverStuckBirthing: db.prepare(`
    UPDATE beings_embryos
    SET status = 'gestating'
    WHERE status = 'birthing' AND birthed_at IS NULL
  `),

  // ── Embryo thoughts ──────────────────────────────────────
  insertThought: db.prepare(`
    INSERT INTO embryo_thoughts (embryo_id, created_at, phase, progress, content)
    VALUES (@embryo_id, @created_at, @phase, @progress, @content)
  `),

  getThoughtsByEmbryo: db.prepare(`
    SELECT id, created_at, phase, progress, content
    FROM embryo_thoughts
    WHERE embryo_id = ?
    ORDER BY created_at ASC, id ASC
  `),

  countThoughtsByEmbryo: db.prepare(`
    SELECT COUNT(*) AS n FROM embryo_thoughts WHERE embryo_id = ?
  `),

  getLastThought: db.prepare(`
    SELECT created_at, phase, content
    FROM embryo_thoughts
    WHERE embryo_id = ?
    ORDER BY id DESC LIMIT 1
  `),

  getGestatingEmbryos: db.prepare(`
    SELECT id, name, language, vision, conceived_at, birth_at
    FROM beings_embryos
    WHERE status = 'gestating'
  `),

  // Queue: latest scheduled birth_at among gestating/birthing embryos.
  // Used to calculate the next slot (previous birth_at + spacing).
  getLatestQueuedBirthAt: db.prepare(`
    SELECT MAX(birth_at) AS latest_birth_at
    FROM beings_embryos
    WHERE status IN ('gestating', 'birthing')
  `),

  // Queue position: how many embryos are scheduled to birth before a given time.
  getQueuePosition: db.prepare(`
    SELECT COUNT(*) AS pos
    FROM beings_embryos
    WHERE status IN ('gestating', 'birthing')
      AND birth_at <= ?
  `),

  // Total queue size (gestating + birthing).
  getQueueSize: db.prepare(`
    SELECT COUNT(*) AS n
    FROM beings_embryos
    WHERE status IN ('gestating', 'birthing')
  `),

  // ── Admin settings ───────────────────────────────────────
  getAdminSettings: db.prepare(`
    SELECT breath_duration_ms, birth_spacing_ms, min_birth_ms, updated_at, updated_by_hex
    FROM admin_settings WHERE id = 1
  `),

  updateAdminSettings: db.prepare(`
    UPDATE admin_settings
    SET breath_duration_ms = @breath_duration_ms,
        birth_spacing_ms   = @birth_spacing_ms,
        min_birth_ms       = @min_birth_ms,
        updated_at         = @updated_at,
        updated_by_hex     = @updated_by_hex
    WHERE id = 1
  `),

  // Admin queue: full embryo list with owner info, ordered by birth_at.
  listGestatingEmbryos: db.prepare(`
    SELECT e.id, e.owner_hex, e.name, e.domain, e.npub, e.language, e.vision,
           e.conceived_at, e.birth_at, e.status,
           u.name AS owner_name, u.npub AS owner_npub, u.picture AS owner_picture
    FROM beings_embryos e
    LEFT JOIN users u ON u.hex = e.owner_hex
    WHERE e.status IN ('gestating', 'birthing')
    ORDER BY e.birth_at ASC
  `),
};
