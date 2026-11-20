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

export const addUser = async (githubId: number): Promise<void> => {
  await request('/api/admin/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ githubId }),
  })
}

export const deleteUser = async (githubId: number): Promise<void> => {
  await request(`/api/admin/users/${githubId}`, { method: 'DELETE' })
}
