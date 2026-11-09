import { learningModes } from '../data/learningModes'
import type { LearningMode } from '../data/learningModes'

type ModeSelectionProps = {
  file: File
  selectedMode: LearningMode | null
  onSelect: (mode: LearningMode) => void
  onBack: () => void
  onStart: () => void
}

export default function ModeSelection({ file, selectedMode, onSelect, onBack, onStart }: ModeSelectionProps) {
  return (
    <section className="mode-selection" aria-labelledby="mode-title">
      <button className="secondary-button" type="button" onClick={onBack}>
        ← 파일 선택으로 돌아가기
      </button>
      <h1 id="mode-title">어떤 단계로 학습할까요?</h1>
      <p>현재 학습 단계에 맞는 모드를 선택해 주세요.</p>
      <div className="selected-file">
        <p className="selected-file__name">{file.name}</p>
        <p className="selected-file__size">{(file.size / 1024 / 1024).toFixed(1)}MB · 아직 서버에 전송하지 않았어요</p>
      </div>
      <fieldset className="mode-options">
        <legend>학습 모드</legend>
        {learningModes.map((mode) => (
          <label className="mode-option" key={mode.id}>
            <input
              type="radio"
              name="learning-mode"
              value={mode.id}
              checked={selectedMode === mode.id}
              onChange={() => onSelect(mode.id)}
            />
            <span>
              <strong>{mode.name}</strong>
              <span className="mode-option__description">{mode.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p role="status">
        {selectedMode
          ? `${learningModes.find((mode) => mode.id === selectedMode)?.name} 모드를 선택했어요.`
          : '학습 모드를 하나 선택해 주세요.'}
      </p>
      <p className="mode-notice">모드 이름과 설명은 초안이에요. 다음 화면은 실제 PDF 분석이 아닌 개발용 샘플입니다.</p>
      <button className="primary-button" type="button" disabled={!selectedMode} onClick={onStart}>학습 클립 구성하기 (샘플)</button>
    </section>
  )
}
