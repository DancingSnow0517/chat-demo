import { useAuth } from './auth.js'

export interface AdminUser {
  githubId: number
  login: string
  name: string
  avatarUrl: string
  isAdmin: boolean
  hasApiKey: boolean
  createdAt: number
  lastLoginAt: number
}

const request = async (url: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(url, init)
  if (!response.ok) {
    if (response.status === 401) {
      useAuth.setState({ state: 'unauthenticated', user: null })
    }
    throw new Error(`Admin request failed: ${response.status} ${response.statusText}`)
  }
  return response
}

export const listUsers = async (): Promise<AdminUser[]> => {
  const response = await request('/api/admin/users')
  const users = (await response.json()) as AdminUser[]
  // 从未登录的用户在 D1 里没有 login/name/avatar，实时从 GitHub 拉取补全
  await Promise.all(
    users.map(async (user) => {
      if (!user.login) {
        try {
          const ghResponse = await fetch(`https://api.github.com/user/${user.githubId}`, {
            headers: { Accept: 'application/vnd.github+json' },
          })
          if (ghResponse.ok) {
            const data = (await ghResponse.json()) as {
              login?: string
              name?: string | null
              avatar_url?: string
            }
            user.login = data.login ?? String(user.githubId)
            user.name = data.name ?? data.login ?? String(user.githubId)
            user.avatarUrl = data.avatar_url ?? ''
          } else {
            user.login = String(user.githubId)
            user.name = String(user.githubId)
          }
        } catch {
          user.login = String(user.githubId)
          user.name = String(user.githubId)
        }
      }
    })
  )
  return users
}

/** 先用 GitHub 公开 API 拿到用户资料，再发给 Worker 落库。 */
export const addUser = async (login: string): Promise<void> => {
  const username = login.trim().replace(/^@/, '')
  if (!username) {
    throw new Error('empty login')
  }
  const ghResponse = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!ghResponse.ok) {
    throw new Error(`GitHub user not found: ${ghResponse.status}`)
  }
  const ghUser = (await ghResponse.json()) as { id?: number }
  if (!ghUser.id) {
    throw new Error('unexpected github response')
  }
  await request('/api/admin/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ githubId: ghUser.id }),
  })
}

export const deleteUser = async (githubId: number): Promise<void> => {
  await request(`/api/admin/users/${githubId}`, { method: 'DELETE' })
}
