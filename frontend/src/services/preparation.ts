export type UploadTicket = { lectureId: string; jobId: string }
export type PreparationJob = { id: string; status: 'pending' | 'running' | 'completed' | 'failed'; stage: string | null; error: { message: string } | null }
export type PreparedLecture = { id: string; pageCount: number }
export class PreparationFailed extends Error {}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const base = () => import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

async function request(path: string, signal: AbortSignal, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(new URL(path, base()), { ...options, signal }).catch((cause: unknown) => {
    if (signal.aborted || (cause instanceof Error && cause.name === 'AbortError')) throw cause
    throw new Error('서버에 연결하지 못했어요. 백엔드 실행 상태와 연결 주소를 확인해 주세요.')
  })
  const data: unknown = await response.json().catch(() => null)
  signal.throwIfAborted()
  if (!response.ok) {
    const message = record(data) && record(data.error) && typeof data.error.message === 'string' ? data.error.message : `서버 요청을 처리하지 못했어요 (${response.status})`
    throw new Error(message)
  }
  return data
}

export async function uploadPdf(file: File, signal: AbortSignal): Promise<UploadTicket> {
  const health = await request('/health', signal)
  if (!record(health) || health.aiMode !== 'sample') throw new Error('이번 연결 확인은 샘플 모드 서버에서 진행해 주세요. 파일은 전송하지 않았어요.')
  const form = new FormData()
  form.append('file', file)
  const data = await request('/lectures', signal, { method: 'POST', body: form })
  if (!record(data) || typeof data.lectureId !== 'string' || !data.lectureId || typeof data.jobId !== 'string' || !data.jobId) throw new Error('업로드 응답을 확인하지 못했어요. 서버에 접수됐을 수 있으므로 자동으로 재전송하지 않아요.')
  return { lectureId: data.lectureId, jobId: data.jobId }
}

export function preparationDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function watchPreparation(ticket: UploadTicket, onJob: (job: PreparationJob) => void, signal: AbortSignal, wait = preparationDelay): Promise<PreparedLecture> {
  while (true) {
    signal.throwIfAborted()
    const data = await request(`/jobs/${encodeURIComponent(ticket.jobId)}`, signal)
    if (!record(data) || data.id !== ticket.jobId || !['pending','running','completed','failed'].includes(String(data.status))) throw new Error('준비 작업 응답 형식을 확인해 주세요.')
    const job: PreparationJob = {
      id: ticket.jobId, status: data.status as PreparationJob['status'], stage: typeof data.stage === 'string' ? data.stage : null,
      error: record(data.error) && typeof data.error.message === 'string' ? { message: data.error.message } : null,
    }
    onJob(job)
    if (job.status === 'failed') throw new PreparationFailed(job.error?.message || '자료 준비에 실패했어요. PDF를 확인해 주세요.')
    if (job.status === 'completed') {
      const lecture = await request(`/lectures/${encodeURIComponent(ticket.lectureId)}`, signal)
      if (!record(lecture) || lecture.id !== ticket.lectureId || lecture.preparationJobId !== ticket.jobId || lecture.status !== 'ready' || !Number.isInteger(lecture.pageCount) || Number(lecture.pageCount) <= 0) throw new Error('준비 완료 자료를 아직 확인하지 못했어요. 같은 작업의 결과를 다시 조회해 주세요.')
      return { id: ticket.lectureId, pageCount: Number(lecture.pageCount) }
    }
    await wait(3000, signal)
  }
}
