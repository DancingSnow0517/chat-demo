import type { Session, SessionSummary } from './types.js'
import { useAuth } from '../auth.js'

export type StoredFile = {
  id: string
  blob: Blob
}

const API = '/api/storage'

const request = async (url: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(url, init)
  if (!response.ok) {
    // /api/llm 的 401 代表用户没配 API Key，不是登录失效
    if (response.status === 401 && !url.startsWith('/api/llm')) {
      useAuth.setState({ state: 'unauthenticated', user: null })
    }
    throw new Error(`Storage request failed: ${response.status} ${response.statusText}`)
  }
  return response
}

const json = async <T>(response: Response): Promise<T> => (await response.json()) as T

export const loadSessionSummaries = async (): Promise<SessionSummary[]> => {
  const rows = await json<{ id: string; title: string; created_at: number; updated_at: number }[]>(
    await request(`${API}/sessions`)
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export const loadSession = async (id: string): Promise<Session | undefined> => {
  const response = await request(`${API}/sessions/${encodeURIComponent(id)}`)
  if (response.status === 404) {
    return undefined
  }
  const payload = await json<{ body: string }>(response)
  const session = JSON.parse(payload.body) as Session
  savedVersions.set(session.id, session.updatedAt)
  return session
}

/** 每个会话上一次成功保存时的 updatedAt，用于乐观写 */
const savedVersions = new Map<string, number>()

export const saveSession = async (session: Session, files: StoredFile[] = []): Promise<void> => {
  // 先把原件传到服务端，再写会话元数据，保证 fileIds 引用的记录存在
  await Promise.all(
    files.map(async (file) => {
      const form = new FormData()
      form.append('id', file.id)
      form.append('file', file.blob, file.id)
      await request(`${API}/files`, { method: 'POST', body: form })
    })
  )
  const fileIds = [
    ...new Set(
      session.messages.flatMap((message) =>
        message.role === 'user' ? message.files.map((file) => file.id) : []
      )
    ),
  ]
  const response = await request(`${API}/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      baseUpdatedAt: savedVersions.get(session.id) ?? null,
      body: JSON.stringify(session),
      fileIds,
    }),
  })
  if (response.ok) {
    savedVersions.set(session.id, session.updatedAt)
  }
}

/** 未打开的会话也可重命名，只读取该会话，原子更新详情和列表。 */
export const renameSession = async (id: string, title: string): Promise<void> => {
  const session = await loadSession(id)
  await request(`${API}/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, baseUpdatedAt: session?.updatedAt ?? 0 }),
  })
}

/** 删除会话，仅清理已无会话引用的本地原件；远端文件不删。 */
export const deleteSession = async (sessionId: string): Promise<void> => {
  await request(`${API}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

export const saveFiles = async (files: StoredFile[]): Promise<void> => {
  await Promise.all(
    files.map(async (file) => {
      const form = new FormData()
      form.append('id', file.id)
      form.append('file', file.blob, file.id)
      await request(`${API}/files`, { method: 'POST', body: form })
    })
  )
}

export const loadFile = async (id: string): Promise<Blob | undefined> => {
  const response = await fetch(`${API}/files/${encodeURIComponent(id)}`)
  if (response.status === 404) {
    return undefined
  }
  if (!response.ok) {
    throw new Error(`Storage request failed: ${response.status} ${response.statusText}`)
  }
  return response.blob()
}

/** 清空导入暂存：开始导入前清除上次中断（如关闭页面）遗留的数据，导入失败后清除本次写入。 */
export const clearStaging = async (): Promise<void> => {
  await request(`${API}/staging/clear`, { method: 'POST' })
}

export const addStagingSession = async (session: Session): Promise<void> => {
  await request(`${API}/staging/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: session.id, data: JSON.stringify(session) }),
  })
}

export const saveStagingFiles = async (files: StoredFile[]): Promise<void> => {
  const form = new FormData()
  for (const file of files) {
    form.append('file', file.blob, file.id)
  }
  await request(`${API}/staging/files`, { method: 'POST', body: form })
}

/** 图片位于会话 JSON 之后；全部读完后回填具体 MIME，保留归档给出的 isImage 标识。 */
export const updateStagingFileTypes = async (
  types: ReadonlyMap<string, string>
): Promise<void> => {
  await request(`${API}/staging/types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(types)),
  })
}

/**
 * 导入完成后用暂存替换正式数据：同一事务中替换会话、摘要和原件，并清空暂存。
 * 逐条游标复制，同一时间只读取一条记录；事务失败时整体回滚，正式数据不变。
 */
export const commitStaging = async (): Promise<SessionSummary[]> => {
  const response = await request(`${API}/staging/commit`, { method: 'POST' })
  const rows = await json<{ id: string; title: string; created_at: number; updated_at: number }[]>(response)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/** 本地存储失败不打断对话，只在控制台留痕 */
export const reportStorageError = (action: string) => (error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[storage] ${action} failed`, error)
}
