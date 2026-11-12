import type { usePreparation } from './usePreparation'
type Props = { fileName: string; preparation: ReturnType<typeof usePreparation>; onBack: () => void; onContinue: () => void }
export default function PreparationPanel({ fileName, preparation: data, onBack, onContinue }: Props) {
  const busy = data.phase === 'uploading' || data.phase === 'polling'
  const stage = data.job?.stage
  const detail = data.phase === 'uploading' ? 'PDF를 서버에 전송하고 있어요.'
    : data.job?.status === 'pending' ? '준비 작업이 대기 중이에요.'
    : stage === 'extracting' ? 'PDF의 글자와 페이지를 추출하고 있어요.'
    : stage === 'describing' ? '페이지 정보를 정리하고 있어요.' : '서버에서 자료를 준비하고 있어요.'
  return <main className="mx-auto max-w-xl px-5 py-12">
    <button type="button" className="rounded-lg border px-4 py-2" onClick={onBack}>← 파일 선택으로</button>
    <h1 className="mt-8 text-2xl font-bold">{data.phase === 'ready' ? '자료 준비가 완료됐어요' : busy ? '강의자료를 준비하고 있어요' : '자료 준비를 확인해 주세요'}</h1>
    <p className="mt-3 break-all text-slate-600">{fileName}</p>
    <p className="mt-3 text-sm text-slate-500">샘플 서버 연결 확인 단계예요. 실제 AI 영상 생성은 아직 요청하지 않아요.</p>
    {busy && <div className="mt-7 flex items-center gap-3 rounded-xl bg-blue-50 p-5" role="status"><span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />{detail}</div>}
    {data.message && <div role="alert" className="mt-7 rounded-xl bg-red-50 p-5 text-red-700"><p>{data.message}</p>{data.phase === 'upload-error' && <p className="mt-3 text-sm">업로드는 자동 재전송하지 않아요. 응답을 받기 전에 연결이 끊겼다면 서버에 접수됐을 수 있어요.</p>}</div>}
    {data.phase === 'query-error' && <button type="button" className="mt-5 rounded-lg border px-4 py-2" onClick={data.resume}>같은 작업 상태 다시 확인</button>}
    {data.lecture && <div className="mt-7 rounded-xl bg-blue-50 p-5"><p>PDF {data.lecture.pageCount}쪽을 준비했어요.</p><button type="button" className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white" onClick={onContinue}>학습 모드 선택하기</button></div>}
    <p className="mt-6 text-sm leading-6 text-slate-500">화면을 나가면 상태 조회를 멈춰요. 이미 접수된 서버 작업을 취소하는 것은 아니에요.</p>
  </main>
}
