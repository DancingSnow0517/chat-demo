import type { Env } from './auth'

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

const error = (status: number, message: string) => json({ error: message }, { status })

export const handleListUsers = async (env: Env): Promise<Response> => {
  const { results } = await env.DB.prepare(
    'SELECT github_id, login, name, avatar_url, is_admin, api_key IS NOT NULL AS has_api_key, created_at, last_login_at FROM users ORDER BY created_at ASC'
  ).all<{
    github_id: number
    login: string
    name: string
    avatar_url: string
    is_admin: number
    has_api_key: number
    created_at: number
    last_login_at: number
  }>()
  return json(
    results.map((row) => ({
      githubId: row.github_id,
      login: row.login,
      name: row.name,
      avatarUrl: row.avatar_url,
      isAdmin: row.is_admin === 1,
      hasApiKey: row.has_api_key === 1,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    }))
  )
}

export const handleAddUser = async (request: Request, env: Env): Promise<Response> => {
  const payload = (await request.json()) as { login?: string }
  const login = typeof payload.login === 'string' ? payload.login.trim().replace(/^@/, '') : ''
  if (!login || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(login)) {
    return error(400, 'invalid github login')
  }

  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'chat-worker',
    },
  })
  if (!response.ok) {
    return error(404, 'github user not found')
  }
  const ghUser = (await response.json()) as {
    id?: number
    login?: string
    name?: string | null
    avatar_url?: string
  }
  if (!ghUser.id || !ghUser.login) {
    return error(502, 'unexpected github response')
  }

  const now = Date.now()
  const existing = await env.DB.prepare('SELECT github_id FROM users WHERE github_id = ?')
    .bind(ghUser.id)
    .first<{ github_id: number }>()
  if (existing) {
    return error(409, 'user already exists')
  }
  await env.DB.prepare(
    'INSERT INTO users (github_id, login, name, avatar_url, is_admin, created_at, last_login_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
  )
    .bind(ghUser.id, ghUser.login, ghUser.name ?? ghUser.login, ghUser.avatar_url ?? '', now, 0)
    .run()
  return json({ ok: true })
}

export const handleDeleteUser = async (githubId: string, env: Env): Promise<Response> => {
  const id = Number(githubId)
  if (!Number.isInteger(id) || id <= 0) {
    return error(400, 'invalid github id')
  }

  const target = await env.DB.prepare('SELECT is_admin FROM users WHERE github_id = ?')
    .bind(id)
    .first<{ is_admin: number }>()
  if (!target) {
    return error(404, 'user not found')
  }
  if (target.is_admin === 1) {
    return error(403, 'cannot delete admin')
  }

  // 删用户全部会话与附件索引
  const { results: sessions } = await env.DB.prepare(
    'SELECT id, body_r2_key FROM sessions WHERE user_id = ?'
  )
    .bind(id)
    .all<{ id: string; body_r2_key: string | null }>()
  for (const session of sessions) {
    if (session.body_r2_key) {
      try {
        await env.BUCKET.delete(session.body_r2_key)
      } catch (error) {
        console.error(`[admin] failed to delete session body ${session.body_r2_key}`, error)
      }
    }
  }
  await env.DB.prepare(
    'DELETE FROM session_files WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)'
  )
    .bind(id)
    .run()
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()

  // 删用户全部附件
  const { results: files } = await env.DB.prepare('SELECT id FROM files WHERE user_id = ?')
    .bind(id)
    .all<{ id: string }>()
  for (const file of files) {
    try {
      await env.BUCKET.delete(`files/${id}/${file.id}`)
    } catch (error) {
      console.error(`[admin] failed to delete file files/${id}/${file.id}`, error)
    }
  }
  await env.DB.prepare('DELETE FROM files WHERE user_id = ?').bind(id).run()

  // 删暂存
  await env.DB.prepare('DELETE FROM staging_sessions WHERE user_id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM staging_files WHERE user_id = ?').bind(id).run()
  const { results: staging } = await env.DB.prepare('SELECT id FROM staging_files WHERE user_id = ?')
    .bind(id)
    .all<{ id: string }>()
  for (const file of staging) {
    try {
      await env.BUCKET.delete(`staging/${id}/${file.id}`)
    } catch (error) {
      console.error(`[admin] failed to delete staging file staging/${id}/${file.id}`, error)
    }
  }

  await env.DB.prepare('DELETE FROM users WHERE github_id = ?').bind(id).run()
  return json({ ok: true })
}
