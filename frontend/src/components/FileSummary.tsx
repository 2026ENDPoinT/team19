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

type Props = { file: { name: string; size?: number }; onReplace?: () => void }
export default function FileSummary({ file, onReplace }: Props) {
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><DocumentIcon /></div>
    <div className="min-w-0 flex-1 text-left">
      <p className="text-xs font-medium text-slate-400">선택한 파일</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">{file.name}</p>
      {typeof file.size === 'number' && <p className="mt-1 text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)}MB · PDF</p>}
    </div>
    {onReplace && <button className="shrink-0 rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" onClick={onReplace} type="button">파일 교체</button>}
  </div>
}
