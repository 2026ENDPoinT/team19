import LibraryPanel from "./components/LibraryPanel"
import FileSummary from './components/FileSummary'
import SiteHeader from './components/SiteHeader'
import OutlineFlow from './components/OutlineFlow'
import PreparationPanel from './components/PreparationPanel'
import { usePreparation } from './components/usePreparation'
import ActualClipPreview from './components/ActualClipPreview'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import './figma-design.css'
import './brand-design.css'
import { learningModes } from './data/learningModes'
import type { LearningMode } from './data/learningModes'
import { useRef, useState } from "react"

const modeIcons: Record<LearningMode, ReactNode> = {
  intro: (
      <svg
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 6.5A2.5 2.5 0 0 1 6.5 4H10a2 2 0 0 1 2 2v14a2.5 2.5 0 0 0-2.5-2.5H4v-11ZM20 6.5A2.5 2.5 0 0 0 17.5 4H14a2 2 0 0 0-2 2v14a2.5 2.5 0 0 1 2.5-2.5H20v-11Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    ),
  review: (
      <svg
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M19.5 8.5A8 8 0 1 0 20 14M19.5 8.5V4.5m0 4h-4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M12 8v4.5l3 1.8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    ),
  exam: (
      <svg
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M8 4.5h8M9 3v3M15 3v3M6.5 5h11A2.5 2.5 0 0 1 20 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-11A2.5 2.5 0 0 1 6.5 5Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="m8 13 2.2 2.2L16 9.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    ),
}

type Screen = "upload" | "preparing" | "mode" | "outline" | "library"

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function ArrowIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path
        d={direction === "right" ? "m7.5 5 5 5-5 5" : "m12.5 5-5 5 5 5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  )
}

function ModeCard({
  description,
  icon,
  isSelected,
  name,
  onSelect,
}: {
  description: string
  icon: ReactNode
  isSelected: boolean
  name: string
  onSelect: () => void
}) {
  return (
    <button
      aria-pressed={isSelected}
      className={`brand-mode-card group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition sm:p-5 ${
        isSelected
          ? "border-blue-500 bg-blue-50/70 shadow-[0_8px_24px_rgba(37,99,235,0.10)]"
          : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
      } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
      onClick={onSelect}
      type="button"
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
          isSelected
            ? "bg-blue-600 text-white"
            : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-[17px] font-bold tracking-[-0.02em] text-slate-900">
          {name}
        </span>
        <span className="mt-1.5 block text-sm leading-6 text-slate-500">
          {description}
        </span>
      </span>
      <span
        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
          isSelected
            ? "border-blue-600 bg-blue-600"
            : "border-slate-300 bg-white"
        }`}
      >
        {isSelected && (
          <svg
            aria-hidden="true"
            className="h-3 w-3 text-white"
            fill="none"
            viewBox="0 0 12 12"
          >
            <path
              d="m2.5 6 2.2 2.2 4.8-4.7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        )}
      </span>
    </button>
  )
}

export default function App() {
  const [showActualClip, setShowActualClip] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [screen, setScreen] = useState<Screen>("upload")
  const preparation = usePreparation(screen === "preparing" && !showActualClip)
  const [selectedMode, setSelectedMode] = useState<LearningMode | null>(null)
  // 내 강의함에서 연 강의의 제목. 새 파일을 고르면 지운다.
  const [libraryTitle, setLibraryTitle] = useState<string | null>(null)
  const sourceFile = file ?? (libraryTitle ? { name: libraryTitle } : null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedModeData = learningModes.find(
    (mode) => mode.id === selectedMode,
  )
  const validateAndSetFile = (selectedFile?: File) => {
    if (!selectedFile) return

    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf")

    if (!isPdf) {
      setError("PDF 파일만 업로드할 수 있어요. 파일 형식을 확인해 주세요.")
      return
    }

    preparation.reset()
    setScreen("upload")
    setSelectedMode(null)
    setLibraryTitle(null)
    setFile(selectedFile)
    setError("")
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    validateAndSetFile(event.target.files?.[0])
    event.target.value = ""
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    validateAndSetFile(event.dataTransfer.files?.[0])
  }

  const openFilePicker = () => fileInputRef.current?.click()

  if (showActualClip) return <div className="brand-site"><SiteHeader examples onLibrary={() => { setShowActualClip(false); setScreen('library') }} onHome={() => { setShowActualClip(false); setScreen('upload') }} onExamples={() => setShowActualClip(true)} /><ActualClipPreview onBack={() => setShowActualClip(false)} /></div>

  return (
    <div className="brand-site min-h-screen bg-white text-slate-950">
      <SiteHeader library={screen === 'library'} onLibrary={() => setScreen('library')} onHome={() => setScreen('upload')} onExamples={() => setShowActualClip(true)} />

      <input
        accept=".pdf,application/pdf"
        aria-label="PDF 파일 선택"
        className="sr-only"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      {screen === "upload" && (
        <main className="brand-page brand-upload mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-16 pt-16 sm:px-8 sm:pt-24 lg:pt-28">
          <section className="brand-hero w-full text-center" aria-labelledby="page-title">
            <div className="mb-5 inline-flex items-center rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">
              내 강의자료로 만드는 학습 피드
            </div>
            <h1
              className="mx-auto max-w-2xl text-[32px] font-bold leading-[1.25] tracking-[-0.045em] text-slate-950 sm:text-[42px]"
              id="page-title"
            >
              강의는 길어도,<br />이해는 짧고 선명하게.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-slate-500 sm:text-base">
              PDF를 올리고 학습 단계를 선택하면,
              <br className="hidden sm:block" /> 개념과 예시를 나누어 시각적으로
              설명해드려요.
            </p>
          </section>

          <section className="mt-10 w-full max-w-[680px] sm:mt-12">
            <div className="brand-upload-card rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.07)] sm:p-6">
              {!file && (
              <div
                aria-label="PDF 파일 드래그 앤 드롭 영역"
                data-dragging={isDragging}
                data-invalid={Boolean(error)}
                className={`brand-dropzone flex min-h-[255px] flex-col items-center justify-center rounded-[18px] border border-dashed px-6 py-10 text-center transition-colors ${
                  isDragging
                    ? "border-blue-500 bg-blue-50/80"
                    : error
                      ? "border-red-300 bg-red-50/30"
                      : "border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/40"
                }`}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  ) {
                    setIsDragging(false)
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="brand-upload-icon mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                  <UploadIcon />
                </div>
                <p className="text-[17px] font-semibold tracking-[-0.02em] text-slate-800">
                  PDF 파일을 여기에 끌어다 놓으세요
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  또는 내 기기에서 파일을 선택하세요
                </p>
                <button
                  className="mt-6 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  onClick={openFilePicker}
                  type="button"
                >
                  PDF 파일 선택
                </button>
                <p className="mt-4 text-xs text-slate-400">PDF 형식</p>
              </div>
              )}

              {error && (
                <div
                  className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
                  role="alert"
                >
                  <svg
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 20 20"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="7.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M10 6.5v4"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.5"
                    />
                    <circle cx="10" cy="13.5" fill="currentColor" r=".8" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {file && <FileSummary file={file} onReplace={openFilePicker} />}

              <button
                className="mt-5 flex h-13 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                disabled={!file}
                onClick={() => {
                  if (!file) return
                  setScreen("preparing")
                  if (preparation.ticket) preparation.resume()
                  else void preparation.start(file)
                }}
                type="button"
              >
                {preparation.lecture ? '자료 준비 결과 보기' : '자료 준비 시작'}
                <span className="ml-2">
                  <ArrowIcon />
                </span>
              </button>
            </div>
          </section>
        </main>
      )}

      {screen === 'upload' && <div className="brand-steps" aria-label="이용 순서">{[['01', '자료 올리기', '익숙한 강의 PDF 한 장에서 시작해요.'], ['02', '학습 모드 선택', '지금 내 공부에 맞는 깊이를 골라요.'], ['03', '짧게 보고 이해하기', '움직이는 개념을 보고 원본과 함께 익혀요.']].map(([number,title,description]) => <div key={number}><span>{number}</span><h2>{title}</h2><p>{description}</p></div>)}</div>}

      {screen === "preparing" && file && <PreparationPanel fileName={file.name} preparation={preparation} onBack={() => setScreen("upload")} onContinue={() => setScreen("mode")} />}

      {screen === "library" && <div className="brand-library"><LibraryPanel onBack={() => setScreen("upload")} onOpen={(lecture, title) => {
        preparation.open(lecture); setFile(null); setLibraryTitle(title); setSelectedMode(null); setScreen("mode")
      }} /></div>}

      {screen === "mode" && sourceFile && (
        <main className="brand-page brand-mode mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-16 pt-12 sm:px-8 sm:pt-18">
          <section
            aria-labelledby="mode-title"
            className="w-full max-w-[720px]"
          >
            <button
              className="mb-7 flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={() => setScreen("upload")}
              type="button"
            >
              <ArrowIcon direction="left" />
              뒤로
            </button>

            <div className="text-center">
              <div className="mb-5 inline-flex items-center rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">
                학습 단계 선택
              </div>
              <h1
                className="text-[30px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]"
                id="mode-title"
              >
                지금 나에게 맞는 학습 모드는?
              </h1>
              <p className="mt-4 text-[15px] leading-7 text-slate-500 sm:text-base">
                모드를 선택하면 강의자료의 학습 클립을 바로 만들어요.
              </p>
            </div>

            <div className="mt-8">
              <FileSummary file={sourceFile} onReplace={openFilePicker} />
            </div>

            {error && (
              <div
                className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
                role="alert"
              >
                <svg
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 20 20"
                >
                  <circle
                    cx="10"
                    cy="10"
                    r="7.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M10 6.5v4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                  />
                  <circle cx="10" cy="13.5" fill="currentColor" r=".8" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="mt-5 grid gap-3">
              {learningModes.map((mode) => (
                <ModeCard
                  description={mode.description}
                  icon={modeIcons[mode.id]}
                  isSelected={selectedMode === mode.id}
                  key={mode.id}
                  name={mode.name}
                  onSelect={() => {
                    setSelectedMode(mode.id)
                  }}
                />
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-5">
              <button
                className="brand-primary flex h-13 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                disabled={!selectedMode || !preparation.lecture}
                onClick={() => setScreen("outline")}
                type="button"
              >
                선택한 모드로 계속
                <span className="ml-2">
                  <ArrowIcon />
                </span>
              </button>
            </div>
          </section>
        </main>
      )}

      {screen === "outline" && preparation.lecture && selectedModeData && <OutlineFlow key={`${preparation.lecture.id}:${selectedMode}`} lecture={preparation.lecture} mode={selectedModeData.id} modeName={selectedModeData.name} fileName={sourceFile?.name} onBack={() => setScreen("mode")} />}

    </div>
  )
}
