import { useEffect, useRef, useState } from 'react'
import SampleClipFlow from './components/SampleClipFlow'
import Header from './components/Header'
import UploadIntro from './components/UploadIntro'
import PdfUpload from './components/PdfUpload'
import ModeSelection from './components/ModeSelection'
import type { LearningMode } from './data/learningModes'
import './App.css'

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [screen, setScreen] = useState<'upload' | 'mode' | 'samples'>('upload')
  const [selectedMode, setSelectedMode] = useState<LearningMode | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    mainRef.current?.focus()
  }, [screen, sessionKey])

  function goHome() {
    setScreen('upload')
  }

  function startNewPdf() {
    setFile(null)
    setSelectedMode(null)
    setScreen('upload')
    setSessionKey((value) => value + 1)
  }

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile)
    setSelectedMode(null)
  }

  function openModeSelection() {
    if (file) setScreen('mode')
  }

  return (
    <>
      <Header onHome={goHome} onReset={startNewPdf} canReset={file !== null || screen !== 'upload'} />
      <main className="page-content" ref={mainRef} tabIndex={-1} key={sessionKey} aria-label="학습 화면">
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
        ) : screen === 'samples' && selectedMode ? (
          <SampleClipFlow mode={selectedMode} onBack={() => setScreen('mode')} />
        ) : file ? (
          <ModeSelection file={file} selectedMode={selectedMode} onSelect={setSelectedMode} onBack={() => setScreen('upload')} onStart={() => { if (selectedMode) setScreen('samples') }} />
        ) : null}
      </main>
    </>
  )
}
