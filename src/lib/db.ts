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

export type PublicUser = Omit<User, 'password_hash' | 'updated_at'>;

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

export async function listUsers() {
  await ensureDb();
  if (isPostgres) {
    const result = await getPool().query(`
      SELECT id, name, email, role, department, status, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    return result.rows.map((user) => ({
      ...user,
      created_at: new Date(user.created_at).toISOString(),
    })) as PublicUser[];
  }

  return getSqlite()
    .prepare('SELECT id, name, email, role, department, status, created_at FROM users ORDER BY created_at DESC')
    .all() as PublicUser[];
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
