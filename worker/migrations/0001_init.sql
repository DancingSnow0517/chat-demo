-- 会话：data 为 Session 整体 JSON（含消息分支树）；超 1.9MB 时置空，JSON 存 R2（body_r2_key）。
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  data        TEXT,
  body_r2_key TEXT,
  body_size   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

-- 附件原件索引：内容在 R2，key 为 files/{id}
CREATE TABLE files (
  id        TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  size      INTEGER NOT NULL
);

-- 会话对附件原件的引用；删除会话后清理无引用原件
CREATE TABLE session_files (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_id    TEXT NOT NULL REFERENCES files(id),
  PRIMARY KEY (session_id, file_id)
);

-- 历史导入暂存：导入期间写入，commit 事务中替换正式数据后清空
CREATE TABLE staging_sessions (
  id   TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE staging_files (
  id        TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL
);
