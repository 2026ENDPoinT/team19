import { useState } from 'react'
import Header from './components/Header'
import UploadIntro from './components/UploadIntro'
import PdfUpload from './components/PdfUpload'
import ModeSelection from './components/ModeSelection'
import type { LearningMode } from './data/learningModes'
import './App.css'

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [screen, setScreen] = useState<'upload' | 'mode'>('upload')
  const [selectedMode, setSelectedMode] = useState<LearningMode | null>(null)

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile)
    setSelectedMode(null)
  }

  function openModeSelection() {
    if (file) setScreen('mode')
  }

  return (
    <>
      <Header />
      <main className="page-content">
        {screen === 'upload' ? (
          <>
            <UploadIntro />
            <PdfUpload file={file} onFileChange={handleFileChange} />
            <div className="upload-actions">
              <button className="primary-button" type="button" disabled={!file} onClick={openModeSelection}>
                학습 모드 선택하기
              </button>
            </div>
          </>
        ) : file ? (
          <ModeSelection file={file} selectedMode={selectedMode} onSelect={setSelectedMode} onBack={() => setScreen('upload')} />
        ) : null}
      </main>
    </>
  )
}
