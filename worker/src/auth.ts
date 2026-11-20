import { SignJWT, jwtVerify } from 'jose'

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  ADMIN_GITHUB_ID: string
  SESSION_SECRET: string
  GITHUB_API_TOKEN?: string
}

export interface SessionUser {
  githubId: number
  login: string
  name: string
  avatarUrl: string
  isAdmin: boolean
}

const secretKey = (env: Env) => {
  const hex = env.SESSION_SECRET
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('SESSION_SECRET must be a 64-character hex string')
  }
  return new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
}

export const signSession = async (env: Env, user: SessionUser): Promise<string> => {
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  return new SignJWT({
    exp,
    sub: String(user.githubId),
    login: user.login,
    name: user.name,
    avatar: user.avatarUrl,
    admin: user.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secretKey(env))
}

export const verifySession = async (env: Env, token: string): Promise<SessionUser | null> => {
  try {
    const { payload } = await jwtVerify(token, secretKey(env))
    const githubId = Number(payload.sub)
    if (!Number.isInteger(githubId)) {
      return null
    }
    return {
      githubId,
      login: String(payload.login ?? ''),
      name: String(payload.name ?? ''),
      avatarUrl: String(payload.avatar ?? ''),
      isAdmin: payload.admin === true,
    }
  } catch {
    return null
  }
}

const sessionCookie = (value: string, maxAge: number) =>
  `dsh_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`

export const setSessionCookie = (token: string) => sessionCookie(token, 30 * 24 * 60 * 60)
export const clearSessionCookie = () => sessionCookie('', 0)

export const getSessionToken = (request: Request): string | null => {
  const cookie = request.headers.get('Cookie')
  if (!cookie) {
    return null
  }
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'dsh_session') {
      return rest.join('=')
    }
  }
  return null
}

export const requireAuth = async (request: Request, env: Env): Promise<SessionUser | Response> => {
  const token = getSessionToken(request)
  const user = token ? await verifySession(env, token) : null
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return user
}

export const handleAuthGithub = (env: Env): Response => {
  const state = crypto.randomUUID().replaceAll('-', '')
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    scope: 'read:user',
    state,
  })
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://github.com/login/oauth/authorize?${params}`,
      'Set-Cookie': `dsh_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`,
    },
  })
}

const getStateCookie = (request: Request): string | null => {
  const cookie = request.headers.get('Cookie')
  if (!cookie) {
    return null
  }
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'dsh_oauth_state') {
      return rest.join('=')
    }
  }
  return null
}

const redirect = (location: string, extraHeaders?: Record<string, string>) =>
  new Response(null, {
    status: 302,
    headers: { Location: location, ...extraHeaders },
  })

interface GitHubUser {
  id?: number
  login?: string
  name?: string | null
  avatar_url?: string
}

export const handleAuthCallback = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const savedState = getStateCookie(request)

  // 清除 state Cookie 的头部（单独返回，避免覆盖会话 Cookie）
  const clearStateHeader = 'dsh_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0'

  if (!code || !state || !savedState || state !== savedState) {
    return redirect('/?login_error=github', { 'Set-Cookie': clearStateHeader })
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })
  if (!tokenResponse.ok) {
    return redirect('/?login_error=github', { 'Set-Cookie': clearStateHeader })
  }
  const tokenBody = (await tokenResponse.json()) as { access_token?: string }
  if (!tokenBody.access_token) {
    return redirect('/?login_error=github', { 'Set-Cookie': clearStateHeader })
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenBody.access_token}`,
      'User-Agent': 'chat-worker',
    },
  })
  if (!userResponse.ok) {
    return redirect('/?login_error=github', { 'Set-Cookie': clearStateHeader })
  }
  const ghUser = (await userResponse.json()) as GitHubUser
  if (!ghUser.id || !ghUser.login) {
    return redirect('/?login_error=github', { 'Set-Cookie': clearStateHeader })
  }

  const now = Date.now()
  const name = ghUser.name ?? ghUser.login
  const avatarUrl = ghUser.avatar_url ?? ''
  const isAdmin = String(ghUser.id) === env.ADMIN_GITHUB_ID ? 1 : 0

  const existing = await env.DB.prepare('SELECT github_id FROM users WHERE github_id = ?')
    .bind(ghUser.id)
    .first<{ github_id: number }>()

  if (existing) {
    await env.DB.prepare(
      'UPDATE users SET login = ?, name = ?, avatar_url = ?, is_admin = ?, last_login_at = ? WHERE github_id = ?'
    )
      .bind(ghUser.login, name, avatarUrl, isAdmin, now, ghUser.id)
      .run()
  } else if (isAdmin) {
    await env.DB.prepare(
      'INSERT INTO users (github_id, login, name, avatar_url, is_admin, created_at, last_login_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    )
      .bind(ghUser.id, ghUser.login, name, avatarUrl, now, now)
      .run()
  } else {
    return redirect('/?login_error=denied', { 'Set-Cookie': clearStateHeader })
  }

  const token = await signSession(env, {
    githubId: ghUser.id,
    login: ghUser.login,
    name,
    avatarUrl,
    isAdmin: isAdmin === 1,
  })
  const headers = new Headers({
    Location: '/',
    'Set-Cookie': clearStateHeader,
  })
  headers.append('Set-Cookie', setSessionCookie(token))
  return new Response(null, { status: 302, headers })
}

export const handleAuthSession = async (request: Request, env: Env): Promise<Response> => {
  const token = getSessionToken(request)
  const user = token ? await verifySession(env, token) : null
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const row = await env.DB.prepare('SELECT api_key FROM users WHERE github_id = ?')
    .bind(user.githubId)
    .first<{ api_key: string | null }>()
  return new Response(
    JSON.stringify({
      githubId: user.githubId,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isAdmin: user.isAdmin,
      hasApiKey: Boolean(row?.api_key),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

export const handleAuthLogout = (): Response =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() },
  })

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

const error = (status: number, message: string) => json({ error: message }, { status })

/** 当前用户已设置过 Key 时只回显存在标志，不回传 Key 本体。 */
export const handleGetApiKey = async (user: SessionUser, env: Env): Promise<Response> => {
  const row = await env.DB.prepare('SELECT api_key FROM users WHERE github_id = ?')
    .bind(user.githubId)
    .first<{ api_key: string | null }>()
  return json({ hasApiKey: Boolean(row?.api_key) })
}

export const handleSetApiKey = async (request: Request, user: SessionUser, env: Env): Promise<Response> => {
  const payload = (await request.json()) as { apiKey?: string }
  if (typeof payload.apiKey !== 'string' || !payload.apiKey.trim()) {
    return error(400, 'invalid api key')
  }
  await env.DB.prepare('UPDATE users SET api_key = ? WHERE github_id = ?')
    .bind(payload.apiKey.trim(), user.githubId)
    .run()
  return json({ ok: true })
}

export const handleClearApiKey = async (user: SessionUser, env: Env): Promise<Response> => {
  await env.DB.prepare('UPDATE users SET api_key = NULL WHERE github_id = ?')
    .bind(user.githubId)
    .run()
  return json({ ok: true })
}
