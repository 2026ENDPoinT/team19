"""Serve registered AI-owned results without modifying them or calling AI APIs."""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path
import subprocess
import wave

from imageio_ffmpeg import get_ffmpeg_exe

from .pipeline import PipelineError, validate_result


@dataclass(frozen=True)
class StoredSample:
    clip_id: str
    directory: Path
    audio_name: str
    media_type: str
    page_count: int = 57

    @property
    def audio_id(self) -> str:
        return f"{self.clip_id}-audio"

    def audio_path(self) -> Path | None:
        # Only registered files are public; request IDs never become paths.
        try:
            path = (self.directory / self.audio_name).resolve()
            if path.is_relative_to(self.directory.resolve()) and path.is_file():
                return path
        except (OSError, RuntimeError):
            pass
        return None

    def _audio_duration(self, path: Path) -> float:
        try:
            if self.media_type == "audio/wav":
                with wave.open(str(path), "rb") as audio:
                    frames = audio.getnframes()
                    if len(audio.readframes(frames)) != frames * audio.getnchannels() * audio.getsampwidth():
                        raise ValueError("Truncated audio")
                    return frames / audio.getframerate()
            # Decode the whole MP3, rejecting truncated/corrupt frames too.
            # FFmpeg is already a BE dependency for the PDF/MP4 demo.
            audio = subprocess.run(
                [get_ffmpeg_exe(), "-v", "error", "-xerror", "-nostdin", "-i", str(path),
                 "-map", "0:a:0", "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"],
                capture_output=True, timeout=15, check=True,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            if not audio.stdout:
                raise ValueError("Empty audio")
            return len(audio.stdout) / (8000 * 2)
        except (OSError, EOFError, ValueError, RuntimeError, wave.Error, subprocess.SubprocessError) as exc:
            raise PipelineError("SAMPLE_INVALID", "샘플 음성 파일을 읽을 수 없습니다.") from exc

    def validated_audio_path(self, expected_duration: float | None = None) -> Path | None:
        path = self.audio_path()
        if path is None:
            return None
        duration = self._audio_duration(path)
        # MP3 adds encoder delay (~0.05s); captions describe the original PCM.
        tolerance = 0.1 if self.media_type == "audio/mpeg" else 0.05
        if duration <= 0 or (expected_duration is not None and abs(duration - expected_duration) > tolerance):
            raise PipelineError("SAMPLE_INVALID", "샘플 음성과 결과의 길이가 다릅니다.")
        return path

    def load_clip(self) -> dict:
        try:
            result = json.loads((self.directory / "result.json").read_text(encoding="utf-8"))
        except (OSError, ValueError, RecursionError) as exc:
            raise PipelineError("SAMPLE_UNAVAILABLE", "저장된 샘플 결과를 읽을 수 없습니다.") from exc
        if (not isinstance(result, dict)
                or set(result) != {"resultId", "durationSec", "audioUrl", "blueprint", "captions"}
                or not isinstance(result.get("resultId"), str) or not result["resultId"].strip()
                or result.get("audioUrl") != self.audio_name):
            raise PipelineError("SAMPLE_INVALID", "저장된 샘플 결과 형식이 올바르지 않습니다.")
        try:
            validate_result(result["blueprint"], result, self.page_count)
        except (TypeError, ValueError, KeyError, IndexError, AttributeError, RecursionError) as exc:
            raise PipelineError("SAMPLE_INVALID", "저장된 샘플 결과 형식이 올바르지 않습니다.") from exc
        path = self.validated_audio_path(result["durationSec"])
        if path is None:
            raise PipelineError("SAMPLE_UNAVAILABLE", "샘플 음성 파일을 찾을 수 없습니다.")
        result["audioUrl"] = f"/assets/{self.audio_id}"
        return {"id": self.clip_id, "planId": f"plan_{self.clip_id}", "status": "completed",
                "error": None, "result": result}


_ROOT = Path(__file__).resolve().parents[1] / "samples"
SAMPLES = {
    "parts-test": StoredSample("parts-test", _ROOT / "parts-test", "audio.wav", "audio/wav"),
    "clip-01": StoredSample("clip-01", _ROOT / "clip-01", "audio.mp3", "audio/mpeg"),
    "clip-01-b": StoredSample("clip-01-b", _ROOT / "clip-01" / "alt-terra", "audio.mp3", "audio/mpeg"),
}
