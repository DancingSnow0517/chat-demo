import type { Env, SessionUser } from './auth'

const LLM_BASE = 'https://api.deepseek.com'

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

export const handleLlmProxy = async (
  request: Request,
  env: Env,
  user: SessionUser
): Promise<Response> => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/llm/, '')
  if (!path.startsWith('/')) {
    return new Response('bad path', { status: 400 })
  }

  const row = await env.DB.prepare('SELECT api_key FROM users WHERE github_id = ?')
    .bind(user.githubId)
    .first<{ api_key: string | null }>()
  const apiKey = row?.api_key
  if (!apiKey) {
    return json({ error: 'api key not configured' }, { status: 401 })
  }

  const headers = new Headers(request.headers)
  headers.delete('Cookie')
  headers.delete('Authorization')
  headers.delete('x-api-key')
  headers.delete('Host')
  headers.delete('Content-Length')
  headers.set('x-api-key', apiKey)
  headers.set('Authorization', `Bearer ${apiKey}`)
  // 带文件块的消息需要 anthropic-beta 头；客户端在 body 里已决定，这里统一补上
  if (!headers.has('anthropic-beta')) {
    headers.set('anthropic-beta', 'files-api-2025-04-14')
  }

  const target = `${LLM_BASE}${path}${url.search}`
  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.body,
    //  duplex: 'half' 在 Node/Worker 上发送流式 body 必须
    ...(request.body ? { duplex: 'half' } : {}),
  }
  const response = await fetch(target, init)
  // 透传响应，包括 SSE 流；不修改 Content-Type / Content-Encoding
  return new Response(response.body, response)
}
