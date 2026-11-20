import type { Env } from './auth'

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

const error = (status: number, message: string) => json({ error: message }, { status })

/** 会话 JSON 超过此阈值时改存 R2，D1 只留元数据 */
const INLINE_BODY_THRESHOLD = 1.9 * 1024 * 1024

/** 删除不再被任何会话引用的附件：先查孤儿列表删 R2，再删索引。失败只记日志，不阻塞主流程。 */
const collectGarbage = async (env: Env): Promise<void> => {
  const { results: orphans } = await env.DB.prepare(
    'SELECT id FROM files WHERE NOT EXISTS (SELECT 1 FROM session_files WHERE file_id = files.id)'
  ).all<{ id: string }>()
  for (const file of orphans) {
    try {
      await env.BUCKET.delete(`files/${file.id}`)
    } catch (error) {
      console.error(`[gc] failed to delete file ${file.id}`, error)
    }
  }
  await env.DB.prepare(
    'DELETE FROM files WHERE NOT EXISTS (SELECT 1 FROM session_files WHERE file_id = files.id)'
  ).run()
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

interface SessionRow {
  id: string
  title: string
  created_at: number
  updated_at: number
  data: string | null
  body_r2_key: string | null
  body_size: number
}

const readSessionBody = async (row: SessionRow, env: Env): Promise<string> => {
  if (row.data !== null) {
    return row.data
  }
  const obj = await env.BUCKET.get(row.body_r2_key!)
  if (!obj) {
    throw new Error(`Session body missing from R2: ${row.body_r2_key}`)
  }
  return obj.text()
}

const writeSessionBody = async (
  id: string,
  body: string,
  env: Env
): Promise<{ data: string | null; bodyR2Key: string | null; bodySize: number }> => {
  const bodySize = new TextEncoder().encode(body).byteLength
  if (bodySize <= INLINE_BODY_THRESHOLD) {
    return { data: body, bodyR2Key: null, bodySize }
  }
  const bodyR2Key = `bodies/${id}`
  await env.BUCKET.put(bodyR2Key, body)
  return { data: null, bodyR2Key, bodySize }
}

export const handleListSessions = async (env: Env): Promise<Response> => {
  const { results } = await env.DB.prepare(
    'SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC'
  ).all()
  return json(results)
}

export const handleGetSession = async (id: string, env: Env): Promise<Response> => {
  const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(id)
    .first<SessionRow>()
  if (!row) {
    return error(404, 'session not found')
  }
  const body = await readSessionBody(row, env)
  return json({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, body })
}

export const handleSaveSession = async (
  id: string,
  request: Request,
  env: Env
): Promise<Response> => {
  const payload = (await request.json()) as {
    title?: string
    createdAt?: number
    updatedAt?: number
    baseUpdatedAt?: number | null
    body?: string
    fileIds?: string[]
  }
  if (
    typeof payload.title !== 'string' ||
    typeof payload.createdAt !== 'number' ||
    typeof payload.updatedAt !== 'number' ||
    (payload.baseUpdatedAt !== null && typeof payload.baseUpdatedAt !== 'number') ||
    typeof payload.body !== 'string'
  ) {
    return error(400, 'invalid session payload')
  }

  const existing = await env.DB.prepare('SELECT updated_at, body_r2_key FROM sessions WHERE id = ?')
    .bind(id)
    .first<{ updated_at: number; body_r2_key: string | null }>()

  if (!existing) {
    // 创建：baseUpdatedAt 必须为 null，否则视为冲突
    if (payload.baseUpdatedAt !== null) {
      return error(409, 'session conflict')
    }
  } else if (existing.updated_at !== payload.baseUpdatedAt) {
    return error(409, 'session conflict')
  }

  const { data, bodyR2Key, bodySize } = await writeSessionBody(id, payload.body, env)

  const stmts = [
    env.DB.prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at, data, body_r2_key, body_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         updated_at = excluded.updated_at,
         data = excluded.data,
         body_r2_key = excluded.body_r2_key,
         body_size = excluded.body_size
       WHERE sessions.updated_at = ?`
    ).bind(id, payload.title, payload.createdAt, payload.updatedAt, data, bodyR2Key, bodySize, payload.baseUpdatedAt),
    env.DB.prepare('DELETE FROM session_files WHERE session_id = ?').bind(id),
  ]
  if (Array.isArray(payload.fileIds)) {
    for (const fileId of payload.fileIds) {
      stmts.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO session_files (session_id, file_id) VALUES (?, ?)'
        ).bind(id, fileId)
      )
    }
  }
  const results = await env.DB.batch(stmts)
  if (!results[0] || results[0].meta.changes === 0) {
    return error(409, 'session conflict')
  }

  // 旧的 R2 正文若存在且 key 已变（例如从超限回落到内联），清理掉
  if (existing?.body_r2_key && existing.body_r2_key !== bodyR2Key) {
    await env.BUCKET.delete(existing.body_r2_key)
  }

  await collectGarbage(env)
  return json({ ok: true })
}

export const handleRenameSession = async (
  id: string,
  request: Request,
  env: Env
): Promise<Response> => {
  const payload = (await request.json()) as { title?: string; baseUpdatedAt?: number }
  if (typeof payload.title !== 'string' || typeof payload.baseUpdatedAt !== 'number') {
    return error(400, 'invalid rename payload')
  }
  const result = await env.DB.prepare(
    'UPDATE sessions SET title = ? WHERE id = ? AND updated_at = ?'
  )
    .bind(payload.title, id, payload.baseUpdatedAt)
    .run()
  if (result.meta.changes === 0) {
    return error(409, 'session conflict')
  }
  return json({ ok: true })
}

export const handleDeleteSession = async (id: string, env: Env): Promise<Response> => {
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
  // GC 失败不阻塞删除操作，孤儿 R2 对象由后续清理处理
  try {
    await collectGarbage(env)
  } catch (error) {
    console.error(`[gc] failed after deleting session ${id}`, error)
  }
  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// files
// ---------------------------------------------------------------------------

export const handleUploadFile = async (request: Request, env: Env): Promise<Response> => {
  const form = await request.formData()
  const id = form.get('id')
  const file = form.get('file')
  if (typeof id !== 'string' || typeof file !== 'object' || file === null) {
    return error(400, 'invalid upload payload')
  }
  const blob = file as File
  await env.BUCKET.put(`files/${id}`, blob.stream(), {
    httpMetadata: { contentType: blob.type },
  })
  await env.DB.prepare(
    'INSERT OR REPLACE INTO files (id, mime_type, size) VALUES (?, ?, ?)'
  )
    .bind(id, blob.type, blob.size)
    .run()
  return json({ ok: true })
}

export const handleGetFile = async (id: string, env: Env): Promise<Response> => {
  const row = await env.DB.prepare('SELECT mime_type FROM files WHERE id = ?')
    .bind(id)
    .first<{ mime_type: string }>()
  if (!row) {
    return error(404, 'file not found')
  }
  const obj = await env.BUCKET.get(`files/${id}`)
  if (!obj) {
    return error(404, 'file not found')
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.mime_type,
      'Cache-Control': 'no-store',
    },
  })
}

// ---------------------------------------------------------------------------
// staging（历史导入的两阶段提交）
// ---------------------------------------------------------------------------

export const handleAddStagingSession = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const payload = (await request.json()) as { id?: string; data?: string }
  if (typeof payload.id !== 'string' || typeof payload.data !== 'string') {
    return error(400, 'invalid staging session payload')
  }
  await env.DB.prepare('INSERT INTO staging_sessions (id, data) VALUES (?, ?)')
    .bind(payload.id, payload.data)
    .run()
  return json({ ok: true })
}

export const handleSaveStagingFiles = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const form = await request.formData()
  for (const [key, value] of form.entries()) {
    if (key !== 'file' || typeof value !== 'object' || value === null) {
      continue
    }
    const blob = value as File
    const id = blob.name
    await env.BUCKET.put(`staging/${id}`, blob.stream(), {
      httpMetadata: { contentType: blob.type },
    })
    await env.DB.prepare(
      'INSERT OR REPLACE INTO staging_files (id, mime_type) VALUES (?, ?)'
    )
      .bind(id, blob.type)
      .run()
  }
  return json({ ok: true })
}

export const handleUpdateStagingFileTypes = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const payload = (await request.json()) as Record<string, string>
  const stmts = Object.entries(payload).map(([id, mime]) =>
    env.DB.prepare('UPDATE staging_files SET mime_type = ? WHERE id = ?').bind(mime, id)
  )
  await env.DB.batch(stmts)
  return json({ ok: true })
}

export const handleClearStaging = async (env: Env): Promise<Response> => {
  await env.DB.prepare('DELETE FROM staging_sessions').run()
  await env.DB.prepare('DELETE FROM staging_files').run()
  // R2 的 staging/ 对象在 commit 时转为正式；若导入失败，由调用方负责重传，这里不清理 R2
  return json({ ok: true })
}

export const handleCommitStaging = async (env: Env): Promise<Response> => {
  const { results: stagingSessions } = await env.DB.prepare(
    'SELECT id, data FROM staging_sessions'
  ).all<{ id: string; data: string }>()
  const { results: stagingFiles } = await env.DB.prepare(
    'SELECT id, mime_type FROM staging_files'
  ).all<{ id: string; mime_type: string }>()

  // 先把 R2 的 staging 文件转为正式（不可回滚，放在 D1 事务之前）
  // 全部 put 成功后才 delete staging，避免中途失败导致 staging 对象丢失
  const stagedObjects: { id: string; body: ReadableStream }[] = []
  for (const file of stagingFiles) {
    const obj = await env.BUCKET.get(`staging/${file.id}`)
    if (obj) {
      stagedObjects.push({ id: file.id, body: obj.body })
    }
  }
  for (const { id, body } of stagedObjects) {
    await env.BUCKET.put(`files/${id}`, body)
  }
  for (const { id } of stagedObjects) {
    await env.BUCKET.delete(`staging/${id}`)
  }

  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM session_files'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM files'),
  ]
  for (const row of stagingSessions) {
    const parsed = JSON.parse(row.data) as {
      title: string
      createdAt: number
      updatedAt: number
      messages?: { role: string; files?: { id: string }[] }[]
    }
    const { data, bodyR2Key, bodySize } = await writeSessionBody(row.id, row.data, env)
    stmts.push(
      env.DB.prepare(
        'INSERT INTO sessions (id, title, created_at, updated_at, data, body_r2_key, body_size) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(row.id, parsed.title, parsed.createdAt, parsed.updatedAt, data, bodyR2Key, bodySize)
    )
    if (Array.isArray(parsed.messages)) {
      for (const message of parsed.messages) {
        if (message.role === 'user' && Array.isArray(message.files)) {
          for (const file of message.files) {
            stmts.push(
              env.DB.prepare(
                'INSERT OR IGNORE INTO session_files (session_id, file_id) VALUES (?, ?)'
              ).bind(row.id, file.id)
            )
          }
        }
      }
    }
  }
  for (const file of stagingFiles) {
    stmts.push(
      env.DB.prepare('INSERT INTO files (id, mime_type, size) VALUES (?, ?, ?)').bind(
        file.id,
        file.mime_type,
        0
      )
    )
  }
  stmts.push(env.DB.prepare('DELETE FROM staging_sessions'))
  stmts.push(env.DB.prepare('DELETE FROM staging_files'))
  await env.DB.batch(stmts)

  await collectGarbage(env)

  const { results: summaries } = await env.DB.prepare(
    'SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC'
  ).all()
  return json(summaries)
}
