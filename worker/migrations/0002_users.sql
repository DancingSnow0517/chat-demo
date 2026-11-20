-- 多用户：users 表 + 所有业务表加 user_id
CREATE TABLE users (
  github_id    INTEGER PRIMARY KEY,
  login        TEXT NOT NULL,
  name         TEXT NOT NULL,
  avatar_url   TEXT NOT NULL,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  api_key      TEXT,
  created_at   INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

ALTER TABLE sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staging_sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staging_files ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX idx_sessions_user_id ON sessions(user_id, id);
CREATE UNIQUE INDEX idx_files_user_id ON files(user_id, id);
