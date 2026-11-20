import {
  handleAuthCallback,
  handleAuthGithub,
  handleAuthLogout,
  handleAuthSession,
  requireAuth,
  type Env,
} from './auth'
import { handleLlmProxy } from './llm'
import {
  handleAddStagingSession,
  handleClearStaging,
  handleCommitStaging,
  handleDeleteSession,
  handleGetFile,
  handleGetSession,
  handleListSessions,
  handleRenameSession,
  handleSaveSession,
  handleSaveStagingFiles,
  handleUpdateStagingFileTypes,
  handleUploadFile,
} from './storage'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // OAuth 入口与回调不需要会话
    if (path === '/api/auth/github') {
      return handleAuthGithub(env)
    }
    if (path === '/api/auth/github/callback') {
      return handleAuthCallback(request, env)
    }

    // 会话验证（前端启动时探测）
    if (path === '/api/auth/session') {
      return handleAuthSession(request, env)
    }

    // 登出
    if (path === '/api/auth/logout') {
      return handleAuthLogout()
    }

    // 其余 /api/* 一律鉴权
    if (path.startsWith('/api/')) {
      const authError = await requireAuth(request, env)
      if (authError) {
        return authError
      }

      if (path === '/api/llm' || path.startsWith('/api/llm/')) {
        return handleLlmProxy(request, env)
      }

      if (path === '/api/storage/sessions') {
        if (request.method === 'GET') {
          return handleListSessions(env)
        }
      }
      const sessionMatch = path.match(/^\/api\/storage\/sessions\/([^/]+)$/)
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]!)
        if (request.method === 'GET') {
          return handleGetSession(id, env)
        }
        if (request.method === 'PUT') {
          return handleSaveSession(id, request, env)
        }
        if (request.method === 'PATCH') {
          return handleRenameSession(id, request, env)
        }
        if (request.method === 'DELETE') {
          return handleDeleteSession(id, env)
        }
      }

      if (path === '/api/storage/files') {
        if (request.method === 'POST') {
          return handleUploadFile(request, env)
        }
      }
      const fileMatch = path.match(/^\/api\/storage\/files\/([^/]+)$/)
      if (fileMatch) {
        const id = decodeURIComponent(fileMatch[1]!)
        if (request.method === 'GET') {
          return handleGetFile(id, env)
        }
      }

      if (path === '/api/storage/staging/sessions' && request.method === 'POST') {
        return handleAddStagingSession(request, env)
      }
      if (path === '/api/storage/staging/files' && request.method === 'POST') {
        return handleSaveStagingFiles(request, env)
      }
      if (path === '/api/storage/staging/types' && request.method === 'POST') {
        return handleUpdateStagingFileTypes(request, env)
      }
      if (path === '/api/storage/staging/clear' && request.method === 'POST') {
        return handleClearStaging(env)
      }
      if (path === '/api/storage/staging/commit' && request.method === 'POST') {
        return handleCommitStaging(env)
      }

      return new Response('not found', { status: 404 })
    }

    // 非 /api 路径不接管（由 Cloudflare 回源到 GitHub Pages）
    return new Response('not found', { status: 404 })
  },
}
