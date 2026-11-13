import { ApiRequestError, ensureSampleMode, preparationDelay, request } from './preparation.ts'
import type { LearningMode } from '../data/learningModes.ts'
export type { LearningMode } from '../data/learningModes.ts'
export type OutlineClip = { id: string; order: number; title: string; sourcePages: number[]; status: 'pending' | 'running' | 'completed' | 'failed'; message: string; jobId: string | null; stage: string }
export type Outline = { id: string; mode: LearningMode; status: 'pending' | 'planning' | 'ready' | 'failed'; jobId: string | null; clips: OutlineClip[] }
export type OutlineSnapshot = { outline: Outline; stage: string; message: string }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const errorText = (value: unknown) => record(value) && typeof value.message === 'string' ? value.message : ''
function path(lectureId: string, mode: LearningMode) {
  if (!['intro','review','exam'].includes(mode)) throw new Error('지원하지 않는 학습 모드예요.')
  return `/lectures/${encodeURIComponent(lectureId)}/outlines/${mode}`
}
export async function loadOutline(lectureId: string, mode: LearningMode, signal: AbortSignal): Promise<Outline | null> {
  let data: unknown
  try { data = await request(path(lectureId, mode), signal) }
  catch (cause) { if (cause instanceof ApiRequestError && cause.status === 404 && cause.code === 'OUTLINE_NOT_FOUND') return null; throw cause }
  if (!record(data) || typeof data.id !== 'string' || data.mode !== mode || !['pending','planning','ready','failed'].includes(String(data.status)) || !Array.isArray(data.clips)) throw new Error('클립 목록 응답 형식을 확인해 주세요.')
  const clips = data.clips.map((clip): OutlineClip => {
    if (!record(clip) || typeof clip.id !== 'string' || typeof clip.title !== 'string' || !Number.isInteger(clip.order) || Number(clip.order) < 0 || !Array.isArray(clip.sourcePages) || clip.sourcePages.some((page) => !Number.isInteger(page) || Number(page) < 1) || !['pending','running','completed','failed'].includes(String(clip.status))) throw new Error('클립 항목 형식을 확인해 주세요.')
    return { id: clip.id, order: Number(clip.order), title: clip.title, sourcePages: clip.sourcePages as number[], status: clip.status as OutlineClip['status'], message: errorText(clip.error), jobId: typeof clip.jobId === 'string' ? clip.jobId : null, stage: clip.status === 'pending' ? 'queued' : '' }
  })
  if (new Set(clips.map((clip) => clip.id)).size !== clips.length) throw new Error('클립 ID가 중복됐어요.')
  return { id: data.id, mode, status: data.status as Outline['status'], jobId: typeof data.jobId === 'string' ? data.jobId : null, clips: clips.sort((a,b) => a.order - b.order) }
}
export async function createOutline(lectureId: string, mode: LearningMode, signal: AbortSignal) {
  path(lectureId, mode)
  await ensureSampleMode(signal)
  const data = await request(`/lectures/${encodeURIComponent(lectureId)}/outlines`, signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) })
  if (!record(data) || typeof data.outlineId !== 'string' || typeof data.jobId !== 'string') throw new Error('요청 응답을 확인하지 못했어요. 기존 계획부터 다시 조회해 주세요.')
  return { outlineId: data.outlineId, jobId: data.jobId, reused: data.reused === true }
}
export async function watchOutline(lectureId: string, mode: LearningMode, onUpdate: (snapshot: OutlineSnapshot) => void, signal: AbortSignal, wait = preparationDelay): Promise<Outline | null> {
  while (true) {
    signal.throwIfAborted()
    const outline = await loadOutline(lectureId, mode, signal)
    if (!outline) return null
    let stage = '', message = ''
    if (outline.status !== 'ready' && outline.jobId) {
      const job = await request(`/jobs/${encodeURIComponent(outline.jobId)}`, signal)
      if (!record(job) || job.id !== outline.jobId) throw new Error('분할 작업 응답을 확인해 주세요.')
      stage = typeof job.stage === 'string' ? job.stage : ''
      message = errorText(job.error)
      if (job.status === 'failed') outline.status = 'failed'
    }
    for (const clip of outline.clips) {
      if (outline.status !== 'ready' || clip.status !== 'running' || !clip.jobId) continue
      const job = await request(`/jobs/${encodeURIComponent(clip.jobId)}`, signal)
      if (!record(job) || job.id !== clip.jobId || !['pending','running','completed','failed'].includes(String(job.status))) throw new Error('클립 작업 응답을 확인해 주세요.')
      clip.stage = job.status === 'completed' ? '' : typeof job.stage === 'string' ? job.stage : ''
      if (job.status === 'failed') { clip.status = 'failed'; clip.message = errorText(job.error) || '클립 준비에 실패했어요.' }
    }
    signal.throwIfAborted()
    onUpdate({ outline, stage, message })
    if (outline.status === 'failed' || (outline.status === 'ready' && outline.clips.every((clip) => clip.status === 'completed' || clip.status === 'failed'))) return outline
    await wait(3000, signal)
  }
}
