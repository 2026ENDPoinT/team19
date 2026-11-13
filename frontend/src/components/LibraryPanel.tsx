import { useEffect, useRef, useState } from 'react'
import { listLectures, loadLecture, authorizeGeneration, deleteLecture } from '../services/preparation'
import type { LibraryLecture, PreparedLecture } from '../services/preparation'

type Props = { onBack: () => void; onOpen: (lecture: PreparedLecture, title: string) => void }

// 내 강의함(D-50): 이 브라우저에서 올린 강의만 보인다. 기기 구분일 뿐 로그인은 아니다.
export default function LibraryPanel({ onBack, onOpen }: Props) {
  const [items, setItems] = useState<LibraryLecture[] | null>(null)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeMessage, setRemoveMessage] = useState('')
  const removal = useRef<AbortController | null>(null)
  useEffect(()=>()=>removal.current?.abort(),[])
  function cancelSelection() { if (removal.current) return; setSelecting(false); setSelected([]); setConfirming(false) }
  async function removeSelected() {
    if (removal.current || !selected.length) return
    const controller=new AbortController()
    removal.current=controller; setRemoving(true); setRemoveMessage(''); setConfirming(false)
    const failed:string[]=[], messages:string[]=[]
    let removed=0
    try {
      for (const id of selected) {
        controller.signal.throwIfAborted()
        try {
          const result=await deleteLecture(id,controller.signal)
          removed++
          setItems(previous=>previous?.filter(item=>item.id!==id)??null)
          if(result==='cleanup-pending')messages.push('목록에서 제거됐고 남은 파일은 서버에서 정리할 예정이에요.')
        } catch(cause) {
          if(controller.signal.aborted)throw cause
          failed.push(id)
          messages.push(`${items?.find(item=>item.id===id)?.title??'강의'}: ${cause instanceof Error?cause.message:'제거 결과를 확인하지 못했어요.'}`)
        }
      }
      setSelected(failed); setSelecting(failed.length>0)
      try {
        const latest=await listLectures(controller.signal)
        setItems(latest); setSelected(failed.filter(id=>latest.some(item=>item.id===id)))
      } catch(cause) { if(controller.signal.aborted)throw cause; messages.push('최신 목록을 불러오지 못했어요. 다시 불러오기로 확인해 주세요.') }
      setRemoveMessage([`${removed}개 강의를 제거했어요.`,...messages].join(' '))
    } catch(cause) { if(!controller.signal.aborted)setRemoveMessage(cause instanceof Error?cause.message:'제거 결과를 확인해 주세요.') }
    finally { if(removal.current===controller)removal.current=null; if(!controller.signal.aborted)setRemoving(false) }
  }
  useEffect(() => {
    const controller = new AbortController()
    setItems(null); setError('')
    listLectures(controller.signal).then(setItems).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '강의 목록을 불러오지 못했어요.')
    })
    return () => controller.abort()
  }, [retry])
  // 여는 중에 화면을 떠나면 요청을 취소해, 늦게 도착한 응답이 다른 화면으로 넘기지 않게 한다.
  const openRequest = useRef<AbortController | null>(null)
  useEffect(() => () => openRequest.current?.abort(), [])
  async function open(item: LibraryLecture) {
    if (opening || selecting || removal.current) return
    setOpening(item.id); setError('')
    const controller = new AbortController()
    openRequest.current = controller
    try {
      const mode = await authorizeGeneration(controller.signal, true)
      const lecture = await loadLecture(item.id, mode, controller.signal)
      if (!controller.signal.aborted) onOpen(lecture, item.title)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '강의를 열지 못했어요.')
    } finally { if (!controller.signal.aborted) setOpening(null) }
  }
  return <main className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-12">
    <button type="button" className="mb-7 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100" disabled={removing} onClick={onBack}>← 뒤로</button>
    <h1 className="text-[30px] font-bold tracking-[-0.04em]">내 강의함</h1>
    <p className="mt-3 text-sm text-slate-500">이 브라우저에서 올린 강의예요. 다른 기기나 브라우저에서 올린 강의는 보이지 않아요.</p>

    {removeMessage && <p role="status" className="mt-5 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{removeMessage}</p>}
    {items && items.length>0 && <div className="mt-6 flex flex-wrap items-center gap-3">
      <button type="button" disabled={opening!==null||removing} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={()=>selecting?cancelSelection():setSelecting(true)}>{selecting?'취소':'선택'}</button>
      {selecting && <><span className="text-sm text-slate-500">{selected.length}개 선택</span><button type="button" disabled={!selected.length||removing} onClick={()=>setConfirming(true)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{removing?'제거 중…':'선택 항목 제거'}</button></>}
    </div>}
    {confirming && <section role="alertdialog" aria-modal="false" aria-labelledby="delete-title" aria-describedby="delete-description" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
      <h2 id="delete-title" className="font-bold">선택한 {selected.length}개 강의를 영구 삭제할까요?</h2>
      <p id="delete-description" className="mt-2 text-sm leading-6">선택한 PDF와 같은 PDF의 모든 기록·만든 영상·음성도 삭제돼요. 복구할 수 없어요.</p>
      <ul className="mt-2 list-inside list-disc text-sm">{items?.filter(item=>selected.includes(item.id)).map(item=><li key={item.id}>{item.title}</li>)}</ul>
      <div className="mt-4 flex gap-3"><button type="button" className="rounded-lg border bg-white px-4 py-2" onClick={()=>setConfirming(false)}>돌아가기</button><button type="button" className="rounded-lg bg-red-600 px-4 py-2 text-white" onClick={()=>void removeSelected()}>영구 삭제</button></div>
    </section>}
    {error && <div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" className="ml-3 underline" disabled={removing} onClick={() => setRetry((n) => n + 1)}>다시 불러오기</button></div>}
    {!items && !error && <p role="status" className="mt-8 text-slate-500">강의 목록을 불러오고 있어요…</p>}
    {items && items.length === 0 && <p className="mt-8 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">아직 올린 강의가 없어요. 업로드 화면에서 PDF를 올려 주세요.</p>}
    {items && items.length > 0 && <ul className="mt-8 space-y-3">
      {items.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        {selecting && <input type="checkbox" aria-label={`${item.title} 선택`} checked={selected.includes(item.id)} disabled={removing||confirming} onChange={()=>setSelected(previous=>previous.includes(item.id)?previous.filter(id=>id!==item.id):[...previous,item.id])} className="h-5 w-5 shrink-0 accent-blue-600" />}
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold text-slate-800 [overflow-wrap:anywhere]">{item.title}</p>
          <p className="mt-1 text-xs text-slate-500">{item.pageCount}쪽 · {item.status === 'ready' ? '준비 완료' : item.status === 'failed' ? '준비 실패' : '준비 중'}</p>
        </div>
        {!selecting && <button type="button" disabled={item.status !== 'ready' || opening !== null} onClick={() => void open(item)}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {opening === item.id ? '여는 중…' : '열기'}
        </button>}
      </li>)}
    </ul>}
  </main>
}
