// 개인별 강의함(D-50, Q-BE-06/07): 브라우저마다 무작위 기기 ID를 한 번 만들어 보관하고 X-Owner-Id 헤더로 보낸다.
// 기기 ID는 인증이 아니다. 목록만 나누며, 주소를 아는 사람은 자료를 열 수 있다.
const KEY = 'eidos-owner-id'
const VALID = /^[A-Za-z0-9_-]{16,64}$/
let memory: string | null = null

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function ownerId(store: Store | null = globalThis.localStorage ?? null, make = () => crypto.randomUUID().replace(/-/g, '')): string {
  try {
    const saved = store?.getItem(KEY)
    if (saved && VALID.test(saved)) return saved
  } catch { /* 저장소를 못 쓰면 이 탭 동안만 쓰는 ID로 대신한다 */ }
  const id = memory ?? make()
  memory = id
  try { store?.setItem(KEY, id) } catch { /* 위와 같음 */ }
  return id
}

export const ownerHeaders = () => ({ 'X-Owner-Id': ownerId() })
