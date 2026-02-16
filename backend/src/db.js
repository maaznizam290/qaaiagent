const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT,
      company TEXT,
      role TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_url TEXT,
      events_json TEXT NOT NULL,
      selector_map_json TEXT NOT NULL,
      transformed_playwright TEXT,
      transformed_cypress TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      framework TEXT NOT NULL,
      status TEXT NOT NULL,
      analysis_status TEXT,
      analysis_timestamp DATETIME,
      logs TEXT,
      duration_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (flow_id) REFERENCES flows (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS failure_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_run_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      failure_report_json TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (test_run_id) REFERENCES test_runs (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS test_run_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_run_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'requested',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (test_run_id) REFERENCES test_runs (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Backfill-compatible columns so failed run records can carry AI artifacts directly.
  try {
    await run('ALTER TABLE test_runs ADD COLUMN failure_report_json TEXT');
  } catch (error) {
    if (!String(error?.message || '').includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await run('ALTER TABLE test_runs ADD COLUMN failure_analysis_json TEXT');
  } catch (error) {
    if (!String(error?.message || '').includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await run('ALTER TABLE test_runs ADD COLUMN analysis_status TEXT');
  } catch (error) {
    if (!String(error?.message || '').includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await run('ALTER TABLE test_runs ADD COLUMN analysis_timestamp DATETIME');
  } catch (error) {
    if (!String(error?.message || '').includes('duplicate column name')) {
      throw error;
    }
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};
