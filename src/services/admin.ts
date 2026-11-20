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
  return (await response.json()) as AdminUser[]
}

/** 先用 GitHub 公开 API 把 username 转成数字 ID，再发给 Worker。 */
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
    throw new Error('GitHub user missing id')
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
