const { Store } = require("express-session");
const { getDb } = require("./db");

class SqliteStore extends Store {
  constructor(options = {}) {
    super();
    this.ttl = options.ttl || 43200000; // 12h default in ms
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);
    `);
    const prune = () => db.prepare("DELETE FROM sessions WHERE expired_at <= ?").run(Date.now());
    prune();
    setInterval(prune, 15 * 60 * 1000).unref();
  }

  get(sid, cb) {
    try {
      const row = getDb()
        .prepare("SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?")
        .get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) {
      cb(e);
    }
  }

  set(sid, sess, cb) {
    try {
      const ttl = sess.cookie?.maxAge != null ? sess.cookie.maxAge : this.ttl;
      const exp = Date.now() + ttl;
      getDb()
        .prepare("INSERT OR REPLACE INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)")
        .run(sid, JSON.stringify(sess), exp);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  destroy(sid, cb) {
    try {
      getDb().prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }

  touch(sid, sess, cb) {
    try {
      const ttl = sess.cookie?.maxAge != null ? sess.cookie.maxAge : this.ttl;
      const exp = Date.now() + ttl;
      getDb()
        .prepare("UPDATE sessions SET expired_at = ? WHERE sid = ?")
        .run(exp, sid);
      cb(null);
    } catch (e) {
      cb(e);
    }
  }
}

module.exports = SqliteStore;
