import { newChat, selectSession, useChatStore } from './store.js'

/** 解析 #/{sessionId} 形式的锚点，其他锚点视为无会话 */
const readHashId = (): string | null => {
  const match = /^#\/([^/]+)$/.exec(window.location.hash)
  const id = match?.[1]
  return id === undefined ? null : decodeURIComponent(id)
}

const writeHash = (id: string | null) => {
  const url = id === null ? `${location.pathname}${location.search}` : `#/${encodeURIComponent(id)}`
  // replaceState 不触发 hashchange，既避免与订阅回环，也不堆积历史记录
  window.history.replaceState(null, '', url)
}

/** 地址栏锚点 ⇄ 当前会话 的双向同步。返回解绑函数。 */
export const bindHashRoute = (): (() => void) => {
  // 会话变化 → 更新地址
  let lastActiveId = useChatStore.getState().activeId
  const unsubscribe = useChatStore.subscribe((state) => {
    if (state.activeId !== lastActiveId) {
      lastActiveId = state.activeId
      writeHash(state.activeId)
    }
  })
  // 地址变化（粘贴链接、前进后退）→ 切换会话
  const onHashChange = () => {
    const id = readHashId()
    if (id === null) {
      if (useChatStore.getState().activeId !== null) {
        newChat()
      }
    } else {
      // 会话不存在时 selectSession 自行忽略，地址留待下次切换修正
      selectSession(id)
    }
  }
  window.addEventListener('hashchange', onHashChange)
  return () => {
    unsubscribe()
    window.removeEventListener('hashchange', onHashChange)
  }
}

/** 会话列表就绪后按当前地址打开对应会话；锚点为空或会话不存在时不动 */
export const openHashSession = (): void => {
  const id = readHashId()
  if (id !== null) {
    selectSession(id)
  }
}
