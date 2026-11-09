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
