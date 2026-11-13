import { useEffect, useState } from 'react'
import { listLectures, loadLecture, serverMode } from '../services/preparation'
import type { LibraryLecture, PreparedLecture } from '../services/preparation'

type Props = { onBack: () => void; onOpen: (lecture: PreparedLecture, title: string) => void }

// 내 강의함(D-50): 이 브라우저에서 올린 강의만 보인다. 기기 구분일 뿐 로그인은 아니다.
export default function LibraryPanel({ onBack, onOpen }: Props) {
  const [items, setItems] = useState<LibraryLecture[] | null>(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setItems(null); setError('')
    listLectures(controller.signal).then(setItems).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '강의 목록을 불러오지 못했어요.')
    })
    return () => controller.abort()
  }, [retry])
  async function open(item: LibraryLecture) {
    if (opening) return
    setOpening(item.id); setError('')
    const controller = new AbortController()
    try {
      const mode = await serverMode(controller.signal)
      onOpen(await loadLecture(item.id, mode, controller.signal), item.title)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '강의를 열지 못했어요.')
    } finally { setOpening(null) }
  }
  return <main className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-12">
    <button type="button" className="mb-7 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100" onClick={onBack}>← 뒤로</button>
    <h1 className="text-[30px] font-bold tracking-[-0.04em]">내 강의함</h1>
    <p className="mt-3 text-sm text-slate-500">이 브라우저에서 올린 강의예요. 다른 기기나 브라우저에서 올린 강의는 보이지 않아요.</p>
    {error && <div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" className="ml-3 underline" onClick={() => setRetry((n) => n + 1)}>다시 불러오기</button></div>}
    {!items && !error && <p role="status" className="mt-8 text-slate-500">강의 목록을 불러오고 있어요…</p>}
    {items && items.length === 0 && <p className="mt-8 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">아직 올린 강의가 없어요. 업로드 화면에서 PDF를 올려 주세요.</p>}
    {items && items.length > 0 && <ul className="mt-8 space-y-3">
      {items.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold text-slate-800 [overflow-wrap:anywhere]">{item.title}</p>
          <p className="mt-1 text-xs text-slate-500">{item.pageCount}쪽 · {item.status === 'ready' ? '준비 완료' : item.status === 'failed' ? '준비 실패' : '준비 중'}</p>
        </div>
        <button type="button" disabled={item.status !== 'ready' || opening !== null} onClick={() => void open(item)}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {opening === item.id ? '여는 중…' : '열기'}
        </button>
      </li>)}
    </ul>}
  </main>
}
