import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../database.db');
const db = new sqlite3.Database(dbPath);

// Helper to run query with Promise
export const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// Helper to get single row
export const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Helper to get all rows
export const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const initDb = async () => {
  // 1. Create users table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Create documents table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      raw_text TEXT,
      formatted_text TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 3. Create credentials table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS credentials (
      user_id INTEGER PRIMARY KEY,
      provider TEXT,
      api_key TEXT,
      custom_prompt TEXT,
      open_router_model TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create an initial admin user if none exists
  const userCount = await dbGet("SELECT COUNT(*) as count FROM users");
  if (userCount.count === 0) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash("Socoolsosoft1", salt);
    await dbRun(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
      ["frzdmhb@gmail.com", hash, "Farzad Mohebi", "admin"]
    );
    console.log("Database initialized. Default admin user created: frzdmhb@gmail.com / Socoolsosoft1");
  } else {
    console.log("Database connection established.");
  }
};
