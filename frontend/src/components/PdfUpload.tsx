import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

type PdfUploadProps = {
  file: File | null
  onFileChange: (file: File | null) => void
}

export default function PdfUpload({ file, onFileChange }: PdfUploadProps) {
  const [error, setError] = useState('')

    function selectFile(selectedFile?: File) {
    if (!selectedFile) return

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      onFileChange(null)
      setError('PDF 파일을 선택해 주세요.')
      return
    }

    onFileChange(selectedFile)
    setError('')
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()

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
        className="upload-area"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="upload-area__icon" aria-hidden="true">
          ↑
        </span>

        <h2>PDF 파일을 여기에 끌어다 놓으세요</h2>
        <p>또는 내 기기에서 파일을 선택하세요.</p>

        <label className="file-picker">
          <span>PDF 파일 선택</span>
          <input
            className="file-picker__input"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
          />
        </label>

        <p className="upload-area__hint">PDF 형식 지원</p>
      </div>

      {error && (
        <p className="upload-error" role="alert">
          {error}
        </p>
      )}

      {file && (
        <div className="selected-file" role="status">
          <p className="selected-file__name">{file.name}</p>
          <p className="selected-file__size">
            {(file.size / 1024 / 1024).toFixed(1)}MB · 선택 완료
          </p>
        </div>
      )}
    </section>
  )
}
