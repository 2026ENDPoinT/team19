import { jobStageLabel } from '../services/jobStages'

type Props = { stage?: string | null; message?: string }
export default function ProcessingStatus({ stage, message }: Props) {
  return <div className="mt-4 grid gap-4">
    <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6" role="status">
      <div className="flex items-start gap-4">
        <div aria-hidden="true" className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          <span className="absolute inset-2 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600 motion-reduce:animate-none" />
        </div>
        <div><p className="text-xs font-semibold text-blue-600">현재 처리 단계</p>
          <p className="mt-1.5 text-xl font-bold tracking-[-0.03em] text-slate-900">{message ?? jobStageLabel(stage)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">서버에서 알려 준 상태예요. 빠르게 끝난 단계는 표시되지 않을 수 있어요.</p>
        </div>
      </div>
    </div>
    <aside aria-label="학습 팁" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm font-bold text-slate-800">학습 팁</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">클립을 본 뒤 핵심 개념을 한 문장으로 설명해 보세요.</p>
    </aside>
  </div>
}
