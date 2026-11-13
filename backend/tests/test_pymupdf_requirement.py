"""BUG-FE-01 recurrence: a PC that installed only backend/requirements.txt silently fell back to pypdf."""
import importlib
import logging
import re
import sys
from pathlib import Path

from backend import pdf_text_fallback
from test_api import client  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]


def test_backend_requirements_install_pymupdf_before_the_pypdf_fallback():
    names = [re.split(r"[<>=!~\[ #]", line.strip(), maxsplit=1)[0].lower()
             for line in (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8").splitlines()
             if line.strip() and not line.startswith("#")]
    assert "pymupdf" in names and "pypdf" in names


def test_pymupdf_available_checks_installation_without_importing(monkeypatch):
    import importlib.util
    monkeypatch.delitem(sys.modules, "pymupdf", raising=False)
    before = "pymupdf" in sys.modules
    assert pdf_text_fallback.pymupdf_available() is True
    assert ("pymupdf" in sys.modules) == before  # no import, so no DLL load at server start
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: None)
    assert pdf_text_fallback.pymupdf_available() is False


def reload_app(monkeypatch, tmp_path, available):
    monkeypatch.setenv("TEAM19_DATA_DIR", str(tmp_path / "server"))
    monkeypatch.setenv("AI_MODE", "sample")
    monkeypatch.setattr(pdf_text_fallback, "pymupdf_available", lambda: available)
    if "backend.app" in sys.modules:
        sys.modules["backend.app"]._executor.shutdown(wait=True)
    module = importlib.reload(sys.modules["backend.app"]) if "backend.app" in sys.modules else importlib.import_module("backend.app")
    module._executor.shutdown(wait=True)


def test_server_start_warns_loudly_only_when_pymupdf_is_missing(client, monkeypatch, tmp_path, caplog):
    with caplog.at_level(logging.WARNING, logger="backend"):
        reload_app(monkeypatch, tmp_path / "a", False)
    assert any("PyMuPDF" in r.message and "한글" in r.message for r in caplog.records)
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="backend"):
        reload_app(monkeypatch, tmp_path / "b", True)
    assert not [r for r in caplog.records if "PyMuPDF" in r.message]
