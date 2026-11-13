// 쇼츠처럼 전체를 조금 빠르게(Q-AI-36). 화면의 "1.0x"가 실제로는 1.25배다. 음성은 다시 만들지 않는다.
export const BASE_SPEED = 1.25

// 화면에 보이는 속도 → 실제 audio.playbackRate
export const toPlaybackRate = (shown: number) => shown * BASE_SPEED
// 실제 audio.playbackRate → 화면에 보이는 속도(소수점 오차를 지운다)
export const toShownRate = (actual: number) => Math.round(actual / BASE_SPEED * 1000) / 1000
