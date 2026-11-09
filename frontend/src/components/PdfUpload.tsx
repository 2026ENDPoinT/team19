import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

type PdfUploadProps = {
  file: File | null
  onFileChange: (file: File | null) => void
}

export default function PdfUpload({ file, onFileChange }: PdfUploadProps) {
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)

  function selectFile(selectedFile?: File) {
    if (!selectedFile) return

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      onFileChange(null)
      setError('PDF 파일을 선택해 주세요.')
      return
    }

    if (selectedFile.size === 0) {
      onFileChange(null)
      setError('내용이 없는 파일이에요. 다른 PDF를 선택해 주세요.')
      return
    }

    onFileChange(selectedFile)
    setError('')
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  function removeFile() {
    onFileChange(null)
    setError('')
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    dragDepth.current += 1
    setIsDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()

    dragDepth.current = 0
    setIsDragging(false)

    if (event.dataTransfer.files.length !== 1) {
      onFileChange(null)
      setError('PDF 파일을 한 개씩 올려 주세요.')
      return
    }

    selectFile(event.dataTransfer.files[0])
  }

  return (
    <section className="upload-card" aria-label="강의 PDF 선택">
      <div
        className={`upload-area${isDragging ? ' upload-area--dragging' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        <span className="upload-area__icon" aria-hidden="true">
          ↑
        </span>

        <h2>PDF 파일을 여기에 끌어다 놓으세요</h2>
        <p>또는 내 기기에서 파일을 선택하세요.</p>

        <label className="file-picker">
          <span>{file ? 'PDF 파일 교체' : 'PDF 파일 선택'}</span>
          <input
            className="file-picker__input"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'pdf-error' : undefined}
          />
        </label>

        <p className="upload-area__hint">PDF 형식 지원</p>
      </div>

      {error && (
        <p id="pdf-error" className="upload-error" role="alert">
          {error}
        </p>
      )}

      {file && (
        <div className="selected-file">
          <p className="selected-file__name" role="status">{file.name}</p>
          <p className="selected-file__size">
            {file.size < 1024 * 1024
              ? `${Math.max(1, Math.ceil(file.size / 1024))}KB`
              : `${(file.size / 1024 / 1024).toFixed(1)}MB`} · 선택 완료
          </p>
          <button className="secondary-button remove-file" type="button" onClick={removeFile}>
            파일 제거
          </button>
        </div>
      )}
    </section>
  )
}
