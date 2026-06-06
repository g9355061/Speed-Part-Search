import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'users.db');

const ADMINS = [
  { name: 'Chang Wei Li', email: 'weili_chang@yangshin.com' },
  { name: 'Danny Chen', email: 'g9355061@gmail.com' },
];

const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'SpeedPart@2026!';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  department: string;
  status: 'pending' | 'active' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface PasswordResetToken {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  used: boolean | number;
  created_at: string;
}

export type PublicUser = Omit<User, 'password_hash' | 'updated_at'> & {
  last_login_time?: string | null;
  last_login_city?: string | null;
  last_login_country?: string | null;
  last_login_ip?: string | null;
};

const isPostgres = !!DATABASE_URL;
let sqlite: Database.Database | undefined;
let pool: Pool | undefined;
let initPromise: Promise<void> | undefined;

function getSqlite() {
  if (!sqlite) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
  }

  return sqlite;
}

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }

  return pool;
}

async function initPostgres() {
  const pg = getPool();
  await pg.query(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      ip TEXT,
      city TEXT,
      country TEXT,
      time TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS demand_forecast_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS demand_forecast_thresholds (
      category_id TEXT PRIMARY KEY,
      min_stock INTEGER NOT NULL,
      low_stock INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS demand_forecast_snapshots (
      mpn TEXT NOT NULL,
      date TEXT NOT NULL,
      total_stock INTEGER NOT NULL,
      supplier_count INTEGER NOT NULL,
      lowest_price_usd DOUBLE PRECISION,
      min_lead_time_days INTEGER,
      max_lead_time_days INTEGER,
      risk_level TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (mpn, date)
    );
  `);
  await pg.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      department TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const column = await pg.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'department'"
  );
  if (column.rowCount === 0) {
    await pg.query("ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''");
  }
}

function initSqlite() {
  const db = getSqlite();
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ip TEXT,
      city TEXT,
      country TEXT,
      time TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      department TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS demand_forecast_thresholds (
      category_id TEXT PRIMARY KEY,
      min_stock INTEGER NOT NULL,
      low_stock INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS demand_forecast_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS demand_forecast_snapshots (
      mpn TEXT NOT NULL,
      date TEXT NOT NULL,
      total_stock INTEGER NOT NULL,
      supplier_count INTEGER NOT NULL,
      lowest_price_usd REAL,
      min_lead_time_days INTEGER,
      max_lead_time_days INTEGER,
      risk_level TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (mpn, date)
    );
  `);

  const cols = (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('department')) {
    db.exec("ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''");
  }
}

async function seedAdmins() {
  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);

  for (const admin of ADMINS) {
    if (isPostgres) {
      await getPool().query(
        `
          INSERT INTO users (name, email, password_hash, role, status)
          VALUES ($1, $2, $3, 'admin', 'active')
          ON CONFLICT (email) DO NOTHING
        `,
        [admin.name, admin.email, hash]
      );
    } else {
      const db = getSqlite();
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(admin.email);
      if (!existing) {
        db.prepare(`
          INSERT INTO users (name, email, password_hash, role, status)
          VALUES (?, ?, ?, 'admin', 'active')
        `).run(admin.name, admin.email, hash);
      }
    }
  }
}

async function initDb() {
  if (isPostgres) {
    await initPostgres();
  } else {
    initSqlite();
  }
  await seedAdmins();
}

function ensureDb() {
  initPromise ||= initDb();
  return initPromise;
}

function normalizeUser(row: unknown): User | undefined {
  if (!row) return undefined;
  const user = row as User;
  return {
    ...user,
    created_at: new Date(user.created_at).toISOString(),
    updated_at: new Date(user.updated_at).toISOString(),
  };
}

function normalizeToken(row: unknown): PasswordResetToken | undefined {
  if (!row) return undefined;
  const token = row as PasswordResetToken;
  return {
    ...token,
    expires_at: new Date(token.expires_at).toISOString(),
    created_at: new Date(token.created_at).toISOString(),
  };
}

export async function getUserByEmail(email: string) {
  await ensureDb();
  if (isPostgres) {
    const result = await getPool().query('SELECT * FROM users WHERE email = $1', [email]);
    return normalizeUser(result.rows[0]);
  }

  return normalizeUser(getSqlite().prepare('SELECT * FROM users WHERE email = ?').get(email));
}

export async function getActiveUserByEmail(email: string) {
  await ensureDb();
  if (isPostgres) {
    const result = await getPool().query('SELECT * FROM users WHERE email = $1 AND status = $2', [email, 'active']);
    return normalizeUser(result.rows[0]);
  }

  return normalizeUser(getSqlite().prepare('SELECT * FROM users WHERE email = ? AND status = ?').get(email, 'active'));
}

export async function getUserById(id: number | string) {
  await ensureDb();
  if (isPostgres) {
    const result = await getPool().query('SELECT * FROM users WHERE id = $1', [Number(id)]);
    return normalizeUser(result.rows[0]);
  }

  return normalizeUser(getSqlite().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

export async function createPendingUser(name: string, email: string, passwordHash: string, department: string) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query(
      `
        INSERT INTO users (name, email, password_hash, department, role, status)
        VALUES ($1, $2, $3, $4, 'user', 'pending')
      `,
      [name, email, passwordHash, department]
    );
    return;
  }

  getSqlite()
    .prepare(`
      INSERT INTO users (name, email, password_hash, department, role, status)
      VALUES (?, ?, ?, ?, 'user', 'pending')
    `)
    .run(name, email, passwordHash, department);
}

export async function recordLoginLog(userId: number | string, ip: string, city: string | null, country: string | null) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query(
      'INSERT INTO login_logs (user_id, ip, city, country) VALUES ($1, $2, $3, $4)',
      [Number(userId), ip, city, country]
    );
    return;
  }
  getSqlite()
    .prepare('INSERT INTO login_logs (user_id, ip, city, country) VALUES (?, ?, ?, ?)')
    .run(userId, ip, city, country);
}

export async function listUsers() {
  await ensureDb();
  if (isPostgres) {
    const result = await getPool().query(`
      SELECT u.id, u.name, u.email, u.role, u.department, u.status, u.created_at,
             l.ip AS last_login_ip, l.city AS last_login_city, l.country AS last_login_country,
             l.time AS last_login_time
      FROM users u
      LEFT JOIN LATERAL (
        SELECT ip, city, country, time FROM login_logs
        WHERE user_id = u.id ORDER BY time DESC LIMIT 1
      ) l ON true
      ORDER BY u.created_at DESC
    `);
    return result.rows.map((user) => ({
      ...user,
      created_at: new Date(user.created_at).toISOString(),
      last_login_time: user.last_login_time ? new Date(user.last_login_time).toISOString() : null,
    })) as PublicUser[];
  }

  return getSqlite().prepare(`
    SELECT u.id, u.name, u.email, u.role, u.department, u.status, u.created_at,
           l.ip AS last_login_ip, l.city AS last_login_city, l.country AS last_login_country,
           l.time AS last_login_time
    FROM users u
    LEFT JOIN (
      SELECT user_id, ip, city, country, MAX(time) AS time
      FROM login_logs GROUP BY user_id
    ) l ON l.user_id = u.id
    ORDER BY u.created_at DESC
  `).all() as PublicUser[];
}

export async function setUserStatus(id: number | string, status: User['status']) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query('UPDATE users SET status = $1, updated_at = now() WHERE id = $2', [status, Number(id)]);
    return;
  }

  getSqlite().prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

export async function updateUserPassword(id: number | string, passwordHash: string) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      passwordHash,
      Number(id),
    ]);
    return;
  }

  getSqlite().prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, id);
}

export async function deleteUser(id: number | string) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query('DELETE FROM users WHERE id = $1', [Number(id)]);
    return;
  }

  const db = getSqlite();
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export async function invalidatePasswordResetTokens(userId: number | string) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1', [Number(userId)]);
    return;
  }

  getSqlite().prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?').run(userId);
}

export async function createPasswordResetToken(userId: number | string, token: string, expiresAt: string) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [Number(userId), token, expiresAt]
    );
    return;
  }

  getSqlite()
    .prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(userId, token, expiresAt);
}

export async function getPasswordResetToken(token: string) {
  await ensureDb();
  if (isPostgres) {
    const result = await getPool().query('SELECT * FROM password_reset_tokens WHERE token = $1 AND used = false', [token]);
    return normalizeToken(result.rows[0]);
  }

  return normalizeToken(getSqlite().prepare('SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0').get(token));
}

export async function markPasswordResetTokenUsed(id: number | string) {
  await ensureDb();
  if (isPostgres) {
    await getPool().query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [Number(id)]);
    return;
  }

  getSqlite().prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(id);
}

export async function getDemandForecastCache(): Promise<any | null> {
  await ensureDb();
  if (isPostgres) {
    try {
      const result = await getPool().query("SELECT data FROM demand_forecast_cache WHERE key = $1", ['default']);
      if (result.rowCount === 0) return null;
      return JSON.parse(result.rows[0].data);
    } catch (err) {
      console.error("[DB-CACHE] Failed to get demand forecast cache:", err);
      return null;
    }
  } else {
    try {
      const db = getSqlite();
      const row = db.prepare("SELECT data FROM demand_forecast_cache WHERE key = ?").get('default') as any;
      if (!row) return null;
      return JSON.parse(row.data);
    } catch (err) {
      console.error("[DB-CACHE] Failed to get demand forecast cache (sqlite):", err);
      return null;
    }
  }
}

export async function setDemandForecastCache(data: any): Promise<void> {
  await ensureDb();
  const dataStr = JSON.stringify(data);
  if (isPostgres) {
    try {
      await getPool().query(
        `
          INSERT INTO demand_forecast_cache (key, data, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (key) DO UPDATE
          SET data = EXCLUDED.data, updated_at = now()
        `,
        ['default', dataStr]
      );
    } catch (err) {
      console.error("[DB-CACHE] Failed to set demand forecast cache:", err);
    }
  } else {
    try {
      getSqlite()
        .prepare(
          `
            INSERT INTO demand_forecast_cache (key, data)
            VALUES (?, ?)
            ON CONFLICT (key) DO UPDATE
            SET data = excluded.data
          `
        )
        .run('default', dataStr);
    } catch (err) {
      console.error("[DB-CACHE] Failed to set demand forecast cache (sqlite):", err);
    }
  }
}

export async function getMarketReportsCache(): Promise<any | null> {
  await ensureDb();
  if (isPostgres) {
    try {
      const result = await getPool().query("SELECT data FROM demand_forecast_cache WHERE key = $1", ['market_reports']);
      if (result.rowCount === 0) return null;
      return JSON.parse(result.rows[0].data);
    } catch (err) {
      console.error("[DB-CACHE] Failed to get market reports cache:", err);
      return null;
    }
  } else {
    try {
      const db = getSqlite();
      const row = db.prepare("SELECT data FROM demand_forecast_cache WHERE key = ?").get('market_reports') as any;
      if (!row) return null;
      return JSON.parse(row.data);
    } catch (err) {
      console.error("[DB-CACHE] Failed to get market reports cache (sqlite):", err);
      return null;
    }
  }
}

export async function setMarketReportsCache(data: any): Promise<void> {
  await ensureDb();
  const dataStr = JSON.stringify(data);
  if (isPostgres) {
    try {
      await getPool().query(
        `
          INSERT INTO demand_forecast_cache (key, data, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (key) DO UPDATE
          SET data = EXCLUDED.data, updated_at = now()
        `,
        ['market_reports', dataStr]
      );
    } catch (err) {
      console.error("[DB-CACHE] Failed to set market reports cache:", err);
    }
  } else {
    try {
      getSqlite()
        .prepare(
          `
            INSERT INTO demand_forecast_cache (key, data)
            VALUES (?, ?)
            ON CONFLICT (key) DO UPDATE
            SET data = excluded.data
          `
        )
        .run('market_reports', dataStr);
    } catch (err) {
      console.error("[DB-CACHE] Failed to set market reports cache (sqlite):", err);
    }
  }
}

export async function getGenericCache(key: string): Promise<any | null> {
  await ensureDb();
  if (isPostgres) {
    try {
      const result = await getPool().query("SELECT data FROM demand_forecast_cache WHERE key = $1", [key]);
      if (result.rowCount === 0) return null;
      return JSON.parse(result.rows[0].data);
    } catch (err) {
      console.error(`[DB-CACHE] Failed to get cache for key ${key}:`, err);
      return null;
    }
  } else {
    try {
      const db = getSqlite();
      const row = db.prepare("SELECT data FROM demand_forecast_cache WHERE key = ?").get(key) as any;
      if (!row) return null;
      return JSON.parse(row.data);
    } catch (err) {
      console.error(`[DB-CACHE] Failed to get cache for key ${key} (sqlite):`, err);
      return null;
    }
  }
}

export async function setGenericCache(key: string, data: any): Promise<void> {
  await ensureDb();
  const dataStr = JSON.stringify(data);
  if (isPostgres) {
    try {
      await getPool().query(
        `
          INSERT INTO demand_forecast_cache (key, data, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (key) DO UPDATE
          SET data = EXCLUDED.data, updated_at = now()
        `,
        [key, dataStr]
      );
    } catch (err) {
      console.error(`[DB-CACHE] Failed to set cache for key ${key}:`, err);
    }
  } else {
    try {
      getSqlite()
        .prepare(
          `
            INSERT INTO demand_forecast_cache (key, data)
            VALUES (?, ?)
            ON CONFLICT (key) DO UPDATE
            SET data = excluded.data
          `
        )
        .run(key, dataStr);
    } catch (err) {
      console.error(`[DB-CACHE] Failed to set cache for key ${key} (sqlite):`, err);
    }
  }
}

export async function saveDemandForecastSnapshot(
  mpn: string,
  totalStock: number,
  supplierCount: number,
  lowestPriceUsd: number | null,
  minLeadTimeDays: number | null,
  maxLeadTimeDays: number | null,
  riskLevel: string
): Promise<void> {
  await ensureDb();
  const dateStr = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  if (isPostgres) {
    try {
      await getPool().query(
        `
          INSERT INTO demand_forecast_snapshots (
            mpn, date, total_stock, supplier_count, lowest_price_usd, min_lead_time_days, max_lead_time_days, risk_level, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (mpn, date) DO UPDATE
          SET total_stock = EXCLUDED.total_stock,
              supplier_count = EXCLUDED.supplier_count,
              lowest_price_usd = EXCLUDED.lowest_price_usd,
              min_lead_time_days = EXCLUDED.min_lead_time_days,
              max_lead_time_days = EXCLUDED.max_lead_time_days,
              risk_level = EXCLUDED.risk_level
        `,
        [mpn, dateStr, totalStock, supplierCount, lowestPriceUsd, minLeadTimeDays, maxLeadTimeDays, riskLevel]
      );
    } catch (err) {
      console.error("[DB-SNAPSHOT] Failed to save postgres snapshot:", err);
    }
  } else {
    try {
      getSqlite()
        .prepare(
          `
            INSERT INTO demand_forecast_snapshots (
              mpn, date, total_stock, supplier_count, lowest_price_usd, min_lead_time_days, max_lead_time_days, risk_level
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (mpn, date) DO UPDATE
            SET total_stock = excluded.total_stock,
                supplier_count = excluded.supplier_count,
                lowest_price_usd = excluded.lowest_price_usd,
                min_lead_time_days = excluded.min_lead_time_days,
                max_lead_time_days = excluded.max_lead_time_days,
                risk_level = excluded.risk_level
          `
        )
        .run(mpn, dateStr, totalStock, supplierCount, lowestPriceUsd, minLeadTimeDays, maxLeadTimeDays, riskLevel);
    } catch (err) {
      console.error("[DB-SNAPSHOT] Failed to save sqlite snapshot:", err);
    }
  }
}

export async function getDemandForecastSnapshot7DaysAgo(mpn: string): Promise<any | null> {
  await ensureDb();
  const today = new Date();
  const targetDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const targetDateStr = targetDate.toISOString().split('T')[0];
  const minDateStr = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const maxDateStr = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (isPostgres) {
    try {
      const result = await getPool().query(
        `
          SELECT * FROM demand_forecast_snapshots
          WHERE mpn = $1 AND date >= $2 AND date <= $3
          ORDER BY abs(date::date - $4::date) ASC
          LIMIT 1
        `,
        [mpn, minDateStr, maxDateStr, targetDateStr]
      );
      if (result.rowCount === 0) return null;
      const row = result.rows[0];
      return {
        mpn: row.mpn,
        date: row.date,
        totalStock: row.total_stock,
        supplierCount: row.supplier_count,
        lowestPriceUsd: row.lowest_price_usd,
        minLeadTimeDays: row.min_lead_time_days,
        maxLeadTimeDays: row.max_lead_time_days,
        riskLevel: row.risk_level,
      };
    } catch (err) {
      console.error("[DB-SNAPSHOT] Failed to get postgres snapshot:", err);
      return null;
    }
  } else {
    try {
      const row = getSqlite()
        .prepare(
          `
            SELECT * FROM demand_forecast_snapshots
            WHERE mpn = ? AND date >= ? AND date <= ?
            ORDER BY abs(strftime('%s', date) - strftime('%s', ?)) ASC
            LIMIT 1
          `
        )
        .get(mpn, minDateStr, maxDateStr, targetDateStr) as any;
      if (!row) return null;
      return {
        mpn: row.mpn,
        date: row.date,
        totalStock: row.total_stock,
        supplierCount: row.supplier_count,
        lowestPriceUsd: row.lowest_price_usd,
        minLeadTimeDays: row.min_lead_time_days,
        maxLeadTimeDays: row.max_lead_time_days,
        riskLevel: row.risk_level,
      };
    } catch (err) {
      console.error("[DB-SNAPSHOT] Failed to get sqlite snapshot:", err);
      return null;
    }
  }
}

export type HistoryPoint = { date: string; price: number | null; stock: number };

/**
 * 批次讀取多顆料件的歷史快照（最低價 + 總庫存，依日期升冪）。
 * 回傳所有快照點（price 可能為 null；stock 一律有值），每顆料最多取最近 limit 個點。
 * 回傳結構：{ [mpn]: HistoryPoint[] }
 */
export async function getDemandForecastPriceHistory(
  mpns: string[],
  limit = 26
): Promise<Record<string, HistoryPoint[]>> {
  await ensureDb();
  const result: Record<string, HistoryPoint[]> = {};
  if (mpns.length === 0) return result;

  if (isPostgres) {
    try {
      const res = await getPool().query(
        `
          SELECT mpn, date, lowest_price_usd, total_stock
          FROM demand_forecast_snapshots
          WHERE mpn = ANY($1)
          ORDER BY mpn ASC, date ASC
        `,
        [mpns]
      );
      for (const row of res.rows) {
        (result[row.mpn] ??= []).push({
          date: row.date,
          price: row.lowest_price_usd == null ? null : Number(row.lowest_price_usd),
          stock: Number(row.total_stock),
        });
      }
    } catch (err) {
      console.error("[DB-SNAPSHOT] Failed to get postgres price history:", err);
    }
  } else {
    try {
      const placeholders = mpns.map(() => '?').join(',');
      const rows = getSqlite()
        .prepare(
          `
            SELECT mpn, date, lowest_price_usd, total_stock
            FROM demand_forecast_snapshots
            WHERE mpn IN (${placeholders})
            ORDER BY mpn ASC, date ASC
          `
        )
        .all(...mpns) as any[];
      for (const row of rows) {
        (result[row.mpn] ??= []).push({
          date: row.date,
          price: row.lowest_price_usd == null ? null : Number(row.lowest_price_usd),
          stock: Number(row.total_stock),
        });
      }
    } catch (err) {
      console.error("[DB-SNAPSHOT] Failed to get sqlite price history:", err);
    }
  }

  // 每顆料只保留最近 limit 個點
  for (const mpn of Object.keys(result)) {
    if (result[mpn].length > limit) {
      result[mpn] = result[mpn].slice(-limit);
    }
  }
  return result;
}

export async function getCustomThresholds(): Promise<Record<string, { minStock: number; lowStock: number }> | null> {
  await ensureDb();
  if (isPostgres) {
    try {
      const result = await getPool().query("SELECT category_id, min_stock, low_stock FROM demand_forecast_thresholds");
      if (result.rowCount === 0) return null;
      const map: Record<string, { minStock: number; lowStock: number }> = {};
      for (const row of result.rows) {
        map[row.category_id] = { minStock: row.min_stock, lowStock: row.low_stock };
      }
      return map;
    } catch (err) {
      console.error("[DB] Failed to get custom thresholds:", err);
      return null;
    }
  } else {
    try {
      const db = getSqlite();
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='demand_forecast_thresholds'").get();
      if (!tableExists) return null;

      const rows = db.prepare("SELECT category_id, min_stock, low_stock FROM demand_forecast_thresholds").all() as any[];
      if (rows.length === 0) return null;
      const map: Record<string, { minStock: number; lowStock: number }> = {};
      for (const row of rows) {
        map[row.category_id] = { minStock: row.min_stock, lowStock: row.low_stock };
      }
      return map;
    } catch (err) {
      console.error("[DB] Failed to get custom thresholds (sqlite):", err);
      return null;
    }
  }
}

export async function saveCustomThresholds(thresholds: Record<string, { minStock: number; lowStock: number }>): Promise<void> {
  await ensureDb();
  if (isPostgres) {
    const pg = getPool();
    try {
      await pg.query("BEGIN");
      for (const [catId, thr] of Object.entries(thresholds)) {
        await pg.query(
          `
            INSERT INTO demand_forecast_thresholds (category_id, min_stock, low_stock, updated_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (category_id) DO UPDATE
            SET min_stock = EXCLUDED.min_stock, low_stock = EXCLUDED.low_stock, updated_at = now()
          `,
          [catId, thr.minStock, thr.lowStock]
        );
      }
      await pg.query("COMMIT");
    } catch (err) {
      await pg.query("ROLLBACK");
      console.error("[DB] Failed to save custom thresholds:", err);
    }
  } else {
    const db = getSqlite();
    try {
      db.transaction(() => {
        for (const [catId, thr] of Object.entries(thresholds)) {
          db.prepare(
            `
              INSERT INTO demand_forecast_thresholds (category_id, min_stock, low_stock)
              VALUES (?, ?, ?)
              ON CONFLICT (category_id) DO UPDATE
              SET min_stock = excluded.min_stock, low_stock = excluded.low_stock
            `
          ).run(catId, Number(thr.minStock), Number(thr.lowStock));
        }
      })();
    } catch (err) {
      console.error("[DB] Failed to save custom thresholds (sqlite):", err);
    }
  }
}
