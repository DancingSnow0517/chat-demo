import type { Env } from './auth'

const LLM_BASE = 'https://api.deepseek.com'

export const handleLlmProxy = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/llm/, '')
  if (!path.startsWith('/')) {
    return new Response('bad path', { status: 400 })
  }

  const headers = new Headers(request.headers)
  headers.delete('Cookie')
  headers.delete('Authorization')
  headers.delete('x-api-key')
  headers.delete('Host')
  headers.delete('Content-Length')
  headers.set('x-api-key', env.DEEPSEEK_API_KEY)
  headers.set('Authorization', `Bearer ${env.DEEPSEEK_API_KEY}`)
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
