import {
  handleAuthCallback,
  handleAuthGithub,
  handleAuthLogout,
  handleAuthSession,
  handleClearApiKey,
  handleGetApiKey,
  handleSetApiKey,
  requireAuth,
  type Env,
  type SessionUser,
} from './auth'
import { handleAddUser, handleDeleteUser, handleListUsers } from './admin'
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

const requireAdmin = (user: SessionUser): Response | null =>
  user.isAdmin
    ? null
    : new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })

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
      const auth = await requireAuth(request, env)
      if (auth instanceof Response) {
        return auth
      }
      const user = auth

      if (path === '/api/llm' || path.startsWith('/api/llm/')) {
        return handleLlmProxy(request, env, user)
      }

      if (path === '/api/auth/api-key') {
        if (request.method === 'GET') {
          return handleGetApiKey(user, env)
        }
        if (request.method === 'PUT') {
          return handleSetApiKey(request, user, env)
        }
        if (request.method === 'DELETE') {
          return handleClearApiKey(user, env)
        }
      }

      if (path === '/api/admin/users') {
        const adminError = requireAdmin(user)
        if (adminError) {
          return adminError
        }
        if (request.method === 'GET') {
          return handleListUsers(env)
        }
        if (request.method === 'PUT') {
          return handleAddUser(request, env)
        }
      }
      const adminUserMatch = path.match(/^\/api\/admin\/users\/(\d+)$/)
      if (adminUserMatch) {
        const adminError = requireAdmin(user)
        if (adminError) {
          return adminError
        }
        if (request.method === 'DELETE') {
          return handleDeleteUser(adminUserMatch[1]!, env)
        }
      }

      if (path === '/api/storage/sessions') {
        if (request.method === 'GET') {
          return handleListSessions(user.githubId, env)
        }
      }
      const sessionMatch = path.match(/^\/api\/storage\/sessions\/([^/]+)$/)
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]!)
        if (request.method === 'GET') {
          return handleGetSession(id, user.githubId, env)
        }
        if (request.method === 'PUT') {
          return handleSaveSession(id, user.githubId, request, env)
        }
        if (request.method === 'PATCH') {
          return handleRenameSession(id, user.githubId, request, env)
        }
        if (request.method === 'DELETE') {
          return handleDeleteSession(id, user.githubId, env)
        }
      }

      if (path === '/api/storage/files') {
        if (request.method === 'POST') {
          return handleUploadFile(user.githubId, request, env)
        }
      }
      const fileMatch = path.match(/^\/api\/storage\/files\/([^/]+)$/)
      if (fileMatch) {
        const id = decodeURIComponent(fileMatch[1]!)
        if (request.method === 'GET') {
          return handleGetFile(id, user.githubId, env)
        }
      }

      if (path === '/api/storage/staging/sessions' && request.method === 'POST') {
        return handleAddStagingSession(user.githubId, request, env)
      }
      if (path === '/api/storage/staging/files' && request.method === 'POST') {
        return handleSaveStagingFiles(user.githubId, request, env)
      }
      if (path === '/api/storage/staging/types' && request.method === 'POST') {
        return handleUpdateStagingFileTypes(user.githubId, request, env)
      }
      if (path === '/api/storage/staging/clear' && request.method === 'POST') {
        return handleClearStaging(user.githubId, env)
      }
      if (path === '/api/storage/staging/commit' && request.method === 'POST') {
        return handleCommitStaging(user.githubId, env)
      }

      return new Response('not found', { status: 404 })
    }

    // 非 /api 路径不接管（由 Cloudflare 回源到 GitHub Pages）
    return new Response('not found', { status: 404 })
  },
}
