import { jobStageLabel } from '../services/jobStages'

type Props = { stage?: string | null; message?: string; progress?: { completed: number; total: number } }
export default function ProcessingStatus({ stage, message, progress }: Props) {
  const percent = progress && progress.total > 0 ? Math.min(100, Math.max(0, Math.floor(progress.completed / progress.total * 100))) : null
  return <div className="mt-4 grid gap-4">
    <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6" role="status">
      <div className="flex items-start gap-4">
        <div role="progressbar" aria-label="클립 생성 완료율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} className="relative mt-0.5 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
          <span aria-hidden="true" className="absolute inset-1 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600 motion-reduce:animate-none" />
          {percent !== null && <span aria-hidden="true" className="relative text-sm font-bold tabular-nums text-blue-600">{percent}%</span>}
        </div>
        <div><p className="text-xs font-semibold text-blue-600">현재 처리 단계</p>
          <p className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-slate-900">{message ?? jobStageLabel(stage)}</p>
          {percent !== null && <p className="mt-2 text-sm text-slate-500">전체 {progress!.total}개 중 {progress!.completed}개 클립 완성</p>}
        </div>
      </div>
    </div>
    <aside aria-label="학습 팁" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm font-bold text-slate-800">학습 팁</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">클립을 본 뒤 핵심 개념을 한 문장으로 설명해 보세요.</p>
    </aside>
  </div>
}
