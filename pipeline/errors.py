"""AI 파이프라인 오류. 코드 목록은 contracts/pipeline.md."""


class PipelineError(Exception):
    """BE가 Job error({code, message, retryable})로 바꿔 쓰는 오류."""

    def __init__(self, code: str, message: str, retryable: bool):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.retryable = retryable

    def to_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "retryable": self.retryable}


def raise_if_no_credit(e: Exception) -> None:
    """크레딧 소진이면 다시 시도해도 소용없으므로 따로 알린다."""
    # shortcut: 제공사 오류 문구로 판별한다(실제 소진 응답은 받아 보지 못함). 문구가 바뀌면 일반 오류로 나오니 그때 SDK의 오류 코드 칸으로 바꾼다.
    text = str(e).lower()
    if any(k in text for k in ("insufficient_quota", "exceeded your current quota", "credit balance", "billing_error")):
        raise PipelineError("PROVIDER_NO_CREDIT", "지금은 AI 사용 한도가 소진되어 영상을 만들 수 없습니다.", False) from e
