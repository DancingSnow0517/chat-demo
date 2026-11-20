import { SignJWT, jwtVerify } from 'jose'

export interface Env {
  DB: D1Database
  BUCKET: R2Bucket
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  ALLOWED_GITHUB_ID: string
  SESSION_SECRET: string
  DEEPSEEK_API_KEY: string
}

const secretKey = (env: Env) => {
  const hex = env.SESSION_SECRET
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('SESSION_SECRET must be a 64-character hex string')
  }
  return new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
}

export const signSession = async (env: Env): Promise<string> => {
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  return new SignJWT({ exp }).setProtectedHeader({ alg: 'HS256' }).sign(secretKey(env))
}

export const verifySession = async (env: Env, token: string): Promise<boolean> => {
  try {
    await jwtVerify(token, secretKey(env))
    return true
  } catch {
    return false
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

export const requireAuth = async (request: Request, env: Env): Promise<Response | null> => {
  const token = getSessionToken(request)
  if (!token || !(await verifySession(env, token))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
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

const redirect = (location: string, headers?: HeadersInit) =>
  new Response(null, { status: 302, headers: { Location: location, ...headers } })

export const handleAuthCallback = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const savedState = getStateCookie(request)
  const clearState = { 'Set-Cookie': 'dsh_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=0' }

  if (!code || !state || !savedState || state !== savedState) {
    return redirect('/?login_error=github', clearState)
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
    return redirect('/?login_error=github', clearState)
  }
  const tokenBody = (await tokenResponse.json()) as { access_token?: string }
  if (!tokenBody.access_token) {
    return redirect('/?login_error=github', clearState)
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenBody.access_token}`,
      'User-Agent': 'chat-worker',
    },
  })
  if (!userResponse.ok) {
    return redirect('/?login_error=github', clearState)
  }
  const user = (await userResponse.json()) as { id?: number }
  if (!user.id || String(user.id) !== env.ALLOWED_GITHUB_ID) {
    return redirect('/?login_error=denied', clearState)
  }

  const token = await signSession(env)
  return redirect('/', {
    ...clearState,
    'Set-Cookie': setSessionCookie(token),
  })
}

export const handleAuthSession = async (request: Request, env: Env): Promise<Response> => {
  const token = getSessionToken(request)
  if (!token || !(await verifySession(env, token))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const handleAuthLogout = (): Response =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie() },
  })
