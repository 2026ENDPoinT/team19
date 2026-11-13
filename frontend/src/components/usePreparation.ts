import { useEffect, useRef, useState } from 'react'
import { PreparationFailed, RealGenerationConfirmationRequired, uploadPdf, watchPreparation } from '../services/preparation'
import type { PreparedLecture, PreparationJob, UploadTicket } from '../services/preparation'
export type PreparationPhase = 'idle' | 'confirm-upload' | 'uploading' | 'polling' | 'ready' | 'upload-error' | 'query-error' | 'failed'

export function usePreparation(active: boolean) {
  const [ticket, setTicket] = useState<UploadTicket | null>(null)
  const [job, setJob] = useState<PreparationJob | null>(null)
  const [lecture, setLecture] = useState<PreparedLecture | null>(null)
  const [phase, setPhase] = useState<PreparationPhase>('idle')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const pendingFile = useRef<File | null>(null)
  const uploading = useRef<AbortController | null>(null)
  const polling = useRef<AbortController | null>(null)
  useEffect(() => () => { uploading.current?.abort(); polling.current?.abort() }, [])
  useEffect(() => {
    if (active) return
    if (pendingFile.current) { pendingFile.current = null; setPhase('idle') }
    if (uploading.current) {
      uploading.current.abort(); uploading.current = null
      setPhase('upload-error'); setMessage('업로드 확인을 중단했어요. 서버에 접수됐을 수 있어 자동 재전송하지 않아요.')
    }
  }, [active])
  useEffect(() => {
    if (!active || !ticket || lecture) return
    const controller = new AbortController()
    polling.current = controller
    setPhase('polling'); setMessage('')
    watchPreparation(ticket, setJob, controller.signal).then((data) => {
      if (!controller.signal.aborted) { setLecture(data); setPhase('ready') }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setPhase(cause instanceof PreparationFailed ? 'failed' : 'query-error')
        setMessage(cause instanceof Error ? cause.message : '준비 상태를 조회하지 못했어요.')
      }
    })
    return () => { controller.abort(); if (polling.current === controller) polling.current = null }
  }, [active, ticket, attempt])
  async function start(file: File, allowReal = false) {
    if (uploading.current || ticket) return
    const controller = new AbortController()
    uploading.current = controller
    setPhase('uploading'); setMessage(''); setJob(null); setLecture(null)
    try {
      const data = await uploadPdf(file, controller.signal, allowReal)
      if (!controller.signal.aborted) { pendingFile.current = null; setTicket(data) }
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof RealGenerationConfirmationRequired) { pendingFile.current = file; setPhase('confirm-upload'); return }
        setPhase('upload-error')
        setMessage(cause instanceof Error ? cause.message : '업로드 응답을 확인하지 못했어요.')
      }
    } finally { if (uploading.current === controller) uploading.current = null }
  }
  function confirm() {
    if (pendingFile.current) void start(pendingFile.current, true)
  }
  function reset() {
    pendingFile.current = null
    uploading.current?.abort(); uploading.current = null; polling.current?.abort()
    setTicket(null); setJob(null); setLecture(null); setPhase('idle'); setMessage('')
  }
  return { ticket, job, lecture, phase, message, start, confirm, reset, resume: () => setAttempt((value) => value + 1) }
}
