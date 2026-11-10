import ActualClipPreview from './components/ActualClipPreview'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import './figma-design.css'
import {



  useEffect,
  useRef,
  useState,
} from "react"

const learningModes = [
  {
    id: "intro",
    name: "처음 보기",
    description: "큰 흐름과 직관을 중심으로 이해해요.",
    icon: (
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
  },
  {
    id: "review",
    name: "복습",
    description: "개념과 예시를 하나씩 다시 살펴봐요.",
    icon: (
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
  },
  {
    id: "exam",
    name: "시험 대비",
    description: "세부 조건과 헷갈리는 부분까지 확인해요.",
    icon: (
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
  },
]

type ClipStatus = "ready" | "generating" | "waiting" | "failed"

const sampleClips: Array<{
  id: string
  order: number
  title: string
  type: string
  pages: string
  status: ClipStatus
}> = [
  {
    id: "divide-and-conquer",
    order: 1,
    title: "분할정복은 어떤 방식일까?",
    type: "개념",
    pages: "원본 2~3쪽",
    status: "ready",
  },
  {
    id: "merge-sort",
    order: 2,
    title: "합병 정렬의 핵심 아이디어",
    type: "개념",
    pages: "원본 4~5쪽",
    status: "generating",
  },
  {
    id: "merge-process",
    order: 3,
    title: "두 배열이 하나로 합쳐지는 과정",
    type: "예시",
    pages: "원본 6~7쪽",
    status: "waiting",
  },
  {
    id: "quick-sort",
    order: 4,
    title: "퀵 정렬의 피벗과 분할",
    type: "과정",
    pages: "원본 8~10쪽",
    status: "failed",
  },
]

const statusStyles: Record<ClipStatus, {
  label: string
  className: string
  dotClassName: string
}> = {
  ready: {
    label: "준비 완료",
    className: "bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  generating: {
    label: "생성 중",
    className: "bg-blue-50 text-blue-700",
    dotClassName: "animate-pulse bg-blue-500",
  },
  waiting: {
    label: "대기",
    className: "bg-slate-100 text-slate-600",
    dotClassName: "bg-slate-400",
  },
  failed: {
    label: "실패",
    className: "bg-red-50 text-red-700",
    dotClassName: "bg-red-500",
  },
}

type Screen = "upload" | "mode" | "analyzing" | "clips" | "feed"

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

function DocumentIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14 3.5H7.5A2.5 2.5 0 0 0 5 6v12a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18V8.5L14 3.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M14 3.5v5h5M8.5 13h7M8.5 16.5h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
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

function FileSummary({
  file,
  onReplace,
}: {
  file: File
  onReplace: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 sm:p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
        <DocumentIcon />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold text-slate-800">
          {file.name}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {(file.size / 1024 / 1024).toFixed(1)}MB · PDF
        </p>
      </div>
      <button
        className="shrink-0 rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        onClick={onReplace}
        type="button"
      >
        파일 교체
      </button>
    </div>
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
      className={`group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition sm:p-5 ${
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

function ClipCard({
  clip,
  onOpen,
  onRetry,
  status,
}: {
  clip: typeof sampleClips[number]
  onOpen: () => void
  onRetry: () => void
  status: ClipStatus
}) {
  const isReady = status === "ready"
  const statusStyle = statusStyles[status]

  return (
    <div
      className={`rounded-2xl border bg-white p-4 transition sm:p-5 ${
        isReady
          ? "cursor-pointer border-blue-200 hover:border-blue-400 hover:shadow-[0_10px_28px_rgba(37,99,235,0.10)]"
          : "border-slate-200"
      }`}
      onClick={isReady ? onOpen : undefined}
      onKeyDown={
        isReady
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onOpen()
              }
            }
          : undefined
      }
      role={isReady ? "button" : undefined}
      tabIndex={isReady ? 0 : undefined}
    >
      <div className="flex items-start gap-3.5 sm:gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
            isReady ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {String(clip.order).padStart(2, "0")}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-[16px] font-bold leading-6 tracking-[-0.02em] text-slate-900 sm:text-[17px]">
                {clip.title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">
                  {clip.type}
                </span>
                <span className="text-slate-400">{clip.pages}</span>
              </div>
            </div>
            <span
              className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle.className}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotClassName}`}
              />
              {statusStyle.label}
            </span>
          </div>

          {isReady && (
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-700">
              눌러서 학습 시작
              <ArrowIcon />
            </p>
          )}

          {status === "failed" && (
            <button
              className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              onClick={(event) => {
                event.stopPropagation()
                onRetry()
              }}
              type="button"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [showActualClip, setShowActualClip] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [screen, setScreen] = useState<Screen>("upload")
  const [selectedMode, setSelectedMode] = useState("")
  const [selectedClip, setSelectedClip] = useState(sampleClips[0].id)
  const [clipStatuses, setClipStatuses] = useState<Record<string, ClipStatus>>(
    () =>
      Object.fromEntries(
        sampleClips.map((clip) => [clip.id, clip.status]),
      ) as Record<string, ClipStatus>,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedModeData = learningModes.find(
    (mode) => mode.id === selectedMode,
  )
  const selectedClipData = sampleClips.find((clip) => clip.id === selectedClip)

  useEffect(() => {
    if (screen !== "analyzing") return

    const timer = window.setTimeout(() => setScreen("clips"), 1800)
    return () => window.clearTimeout(timer)
  }, [screen])

  const validateAndSetFile = (selectedFile?: File) => {
    if (!selectedFile) return

    const isPdf =
      selectedFile.type === "application/pdf" ||
      selectedFile.name.toLowerCase().endsWith(".pdf")

    if (!isPdf) {
      setError("PDF 파일만 업로드할 수 있어요. 파일 형식을 확인해 주세요.")
      return
    }

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

  if (showActualClip) return <ActualClipPreview onBack={() => setShowActualClip(false)} />

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-17 w-full max-w-7xl items-center px-5 sm:px-8 lg:px-10">
          <button
            aria-label="강의 숏폼 홈"
            className="flex items-center gap-2.5"
            onClick={() => setScreen("upload")}
            type="button"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-blue-600 text-white shadow-sm shadow-blue-200">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-white" />
            </span>
            <span className="text-[19px] font-bold tracking-[-0.04em]">
              강의 숏폼
            </span>
          </button>
        </div>
      </header>

      <input
        accept=".pdf,application/pdf"
        aria-label="PDF 파일 선택"
        className="sr-only"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      <div className="mx-auto max-w-7xl px-5 pt-4"><button type="button" className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700" onClick={() => setShowActualClip(true)}>실제 클립 A/B 연결 확인</button></div>
      {screen === "upload" && (
        <main className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-16 pt-16 sm:px-8 sm:pt-24 lg:pt-28">
          <section className="w-full text-center" aria-labelledby="page-title">
            <div className="mb-5 inline-flex items-center rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">
              내 강의자료로 만드는 학습 피드
            </div>
            <h1
              className="mx-auto max-w-2xl text-[32px] font-bold leading-[1.25] tracking-[-0.045em] text-slate-950 sm:text-[42px]"
              id="page-title"
            >
              내 강의자료를 짧은 학습 클립으로
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-slate-500 sm:text-base">
              PDF를 올리고 학습 단계를 선택하면,
              <br className="hidden sm:block" /> 개념과 예시를 나누어 시각적으로
              설명해드려요.
            </p>
          </section>

          <section className="mt-10 w-full max-w-[680px] sm:mt-12">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.07)] sm:p-6">
              <div
                aria-label="PDF 파일 드래그 앤 드롭 영역"
                className={`flex min-h-[255px] flex-col items-center justify-center rounded-[18px] border border-dashed px-6 py-10 text-center transition-colors ${
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
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
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

              {file && (
                <div className="mt-4">
                  <FileSummary file={file} onReplace={openFilePicker} />
                </div>
              )}

              <button
                className="mt-5 flex h-13 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                disabled={!file}
                onClick={() => setScreen("mode")}
                type="button"
              >
                학습 모드 선택하기
                <span className="ml-2">
                  <ArrowIcon />
                </span>
              </button>
            </div>
          </section>
        </main>
      )}

      {screen === "mode" && file && (
        <main className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-16 pt-12 sm:px-8 sm:pt-18">
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
                선택한 단계에 맞춰 클립의 설명 깊이와 예시 구성을 달리해요.
              </p>
            </div>

            <div className="mt-8">
              <FileSummary file={file} onReplace={openFilePicker} />
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
                  icon={mode.icon}
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
                className="flex h-13 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                disabled={!selectedMode}
                onClick={() => setScreen("analyzing")}
                type="button"
              >
                학습 클립 구성하기
                <span className="ml-2">
                  <ArrowIcon />
                </span>
              </button>
            </div>
          </section>
        </main>
      )}

      {screen === "analyzing" && file && selectedModeData && (
        <main className="mx-auto flex min-h-[calc(100vh-68px)] w-full max-w-4xl flex-col items-center justify-center px-5 py-16 sm:px-8">
          <section
            aria-labelledby="analyzing-title"
            className="w-full max-w-[620px] text-center"
          >
            <div
              aria-label="강의 내용 분석 중"
              className="relative mx-auto mb-9 h-24 w-24"
              role="status"
            >
              <div className="absolute inset-0 rounded-full border-[3px] border-blue-100" />
              <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-transparent border-t-blue-600" />
              <div className="absolute inset-3 flex items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <DocumentIcon className="h-8 w-8" />
              </div>
            </div>

            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
              강의자료 분석 중
            </div>
            <h1
              className="text-[30px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]"
              id="analyzing-title"
            >
              강의 내용을 학습 클립으로 나누고 있어요
            </h1>
            <p className="mt-4 text-[15px] leading-7 text-slate-500 sm:text-base">
              개념과 예시의 흐름을 살펴보고 학습하기 좋은 순서로 정리하고
              있어요.
            </p>

            <div className="mx-auto mt-9 max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <DocumentIcon />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {file.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    학습 모드 · {selectedModeData.name}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {screen === "clips" && file && selectedModeData && (
        <main className="mx-auto flex w-full max-w-5xl flex-col items-center px-5 pb-16 pt-12 sm:px-8 sm:pt-18">
          <section
            aria-labelledby="clips-title"
            className="w-full max-w-[820px]"
          >
            <button
              className="mb-7 flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={() => setScreen("mode")}
              type="button"
            >
              <ArrowIcon direction="left" />
              학습 모드 다시 선택
            </button>

            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-4 inline-flex items-center rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">
                  예시 강의 · 분할정복
                </div>
                <h1
                  className="text-[30px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]"
                  id="clips-title"
                >
                  학습 클립 목록
                </h1>
                <p className="mt-3 text-[15px] leading-7 text-slate-500">
                  강의 흐름에 맞춰 4개의 짧은 클립으로 구성했어요.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {selectedModeData.name}
                </span>
                <span className="mx-2 text-slate-300">·</span>
                {file.name}
              </div>
            </div>

            <div className="mt-8 grid gap-3">
              {sampleClips.map((clip) => (
                <ClipCard
                  clip={clip}
                  key={clip.id}
                  onOpen={() => {
                    setSelectedClip(clip.id)
                    setScreen("feed")
                  }}
                  onRetry={() =>
                    setClipStatuses((statuses) => ({
                      ...statuses,
                      [clip.id]: "generating",
                    }))
                  }
                  status={clipStatuses[clip.id]}
                />
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-5">
              <button
                className="flex h-13 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                onClick={() => {
                  setSelectedClip(sampleClips[0].id)
                  setScreen("feed")
                }}
                type="button"
              >
                학습 시작하기
                <span className="ml-2">
                  <ArrowIcon />
                </span>
              </button>
            </div>

            <p className="mt-4 text-center text-xs leading-5 text-slate-400">
              화면 논의를 위한 샘플 데이터와 임시 생성 순서입니다. 실제 분석이나
              AI 생성은 진행되지 않습니다.
            </p>
          </section>
        </main>
      )}

      {screen === "feed" && selectedClipData && (
        <main className="mx-auto flex min-h-[calc(100vh-68px)] w-full max-w-5xl flex-col items-center px-5 py-10 sm:px-8">
          <section className="w-full max-w-[820px]">
            <button
              className="mb-6 flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={() => setScreen("clips")}
              type="button"
            >
              <ArrowIcon direction="left" />
              클립 목록으로
            </button>

            <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="mb-4 inline-flex items-center rounded-full bg-blue-50 px-3.5 py-1.5 text-[13px] font-semibold text-blue-700">
                  세로 학습 피드 · 샘플
                </div>
                <h1 className="text-[30px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[38px]">
                  {selectedClipData.title}
                </h1>
                <p className="mt-4 text-[15px] leading-7 text-slate-500">
                  준비된 클립에서 세로 학습 피드로 연결되는 시제품 화면입니다.
                  피드의 상세 구성은 다음 단계에서 이어집니다.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                    {selectedClipData.type}
                  </span>
                  <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
                    {selectedClipData.pages}
                  </span>
                </div>
              </div>

              <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-slate-950 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
                <div className="relative flex aspect-[9/16] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(37,99,235,0.45),transparent_52%)] px-6 text-center text-white">
                  <div>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                      <span className="text-lg font-bold">01</span>
                    </div>
                    <p className="mt-5 text-lg font-bold leading-7">
                      {selectedClipData.title}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-slate-300">
                      세로 학습 클립이 표시되는 영역
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  )
}
