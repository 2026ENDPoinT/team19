import ProcessingStatus from './ProcessingStatus'
import FileSummary from './FileSummary'
import type { usePreparation } from './usePreparation'

type Props = { fileName: string; preparation: ReturnType<typeof usePreparation>; onBack: () => void; onContinue: () => void }
export default function PreparationPanel({ fileName, preparation: data, onBack, onContinue }: Props) {
  const busy = data.phase === 'uploading' || data.phase === 'polling'
  const aiMode = data.ticket?.aiMode ?? (data.phase === 'confirm-upload' ? 'real' : null)
  const queryError = data.phase === 'query-error'
  return <main className="mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
    <section aria-labelledby="preparing-title" className="mx-auto w-full max-w-[820px]">
      <button type="button" className="mb-8 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={onBack}>← 파일 선택으로</button>
      <div className="mb-4 inline-flex rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">강의자료 준비</div>
      <h1 id="preparing-title" className="text-[30px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]">{data.phase === 'confirm-upload' ? '실제 AI로 자료를 분석할까요?' : data.phase === 'ready' ? '자료 준비가 완료됐어요' : busy ? '강의자료를 준비하고 있어요' : '자료 준비를 확인해 주세요'}</h1>
      <p className="mt-3 text-[15px] leading-7 text-slate-500 sm:text-base">업로드한 PDF를 확인하고 학습에 사용할 페이지 정보를 정리해요.</p>
      <div className="mt-7"><FileSummary file={{ name: fileName }} /></div>
      {data.phase === 'confirm-upload' && <section aria-label="실제 AI 분석 비용 확인" className="mt-4 rounded-3xl border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
        <h2 className="font-bold text-slate-900">실제 AI 분석 · 비용 발생 가능</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">PDF를 전송하면 페이지 분석에 외부 AI API가 사용될 수 있어요. 화면을 나가도 접수된 서버 작업은 계속될 수 있어요. 아직 PDF는 전송하지 않았어요.</p>
        <button type="button" className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={data.confirm}>비용 안내 확인 · 자료 분석 시작</button>
      </section>}
      {busy && <ProcessingStatus stage={data.job?.status === 'pending' ? 'queued' : data.job?.stage} message={data.phase === 'uploading' ? 'PDF를 서버에 전송하는 중' : undefined} />}
      {data.message && <div role="alert" className={`mt-4 rounded-3xl border p-5 sm:p-6 ${queryError ? 'border-amber-200 bg-amber-50/60' : 'border-red-100 bg-red-50/60'}`}>
        <p className={`text-xs font-semibold ${queryError ? 'text-amber-700' : 'text-red-700'}`}>{queryError ? '상태 조회 오류' : data.phase === 'upload-error' ? '업로드 확인 오류' : '처리 실패'}</p>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-slate-900">{queryError ? '작업 상태를 불러오지 못했어요' : 'PDF 준비 상태를 확인해 주세요'}</h2>
        <p className="mt-2 break-words text-sm leading-6 text-slate-600">{data.message}</p>
        {data.phase === 'upload-error' && <p className="mt-3 text-sm leading-6 text-slate-600">업로드는 자동 재전송하지 않아요. 응답을 받기 전에 연결이 끊겼다면 서버에 접수됐을 수 있어요.</p>}
        {queryError && <button type="button" className="mt-5 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500" onClick={data.resume}>같은 작업 상태 다시 확인</button>}
        {data.phase === 'failed' && <button type="button" className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={onBack}>파일 선택으로 돌아가기</button>}
      </div>}
      {data.lecture && <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5 sm:p-6">
        <p className="text-xs font-semibold text-emerald-700">준비 완료</p>
        <h2 className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-slate-900">{data.lecture.pageCount}쪽의 강의자료를 확인했어요</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">이제 학습 단계를 선택하고 클립 구성을 요청할 수 있어요.</p>
        <button type="button" className="mt-6 h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto" onClick={onContinue}>학습 모드 선택하기 →</button>
      </div>}
      <p className="mt-5 text-center text-xs leading-5 text-slate-400">화면을 나가면 상태 조회를 멈춰요. 이미 접수된 서버 작업을 취소하는 것은 아니에요.</p>
      <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500"><strong className="text-slate-600">{aiMode === 'real' ? '실제 AI 모드' : aiMode === 'sample' ? '샘플 모드' : '서버 연결 안내'}</strong> · {aiMode === 'real' ? 'AI가 자료를 분석해요. 작업 실패 시 오류를 확인하며, 생성은 자동으로 재요청하지 않아요.' : aiMode === 'sample' ? 'PDF 발췌·대체 페이지 이미지·무음 음성을 사용하는 개발용 결과예요.' : '요청 전에 서버 실행 모드를 확인해요. 실제 모드에서는 비용 확인 후 전송해요.'}</div>
    </section>
  </main>
}
