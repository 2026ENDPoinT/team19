"""FastAPI service for team19: durable lecture/outline/clip jobs and AI module calls."""
from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .pipeline import Pipeline, PipelineError, check_blueprint, get_ai_mode, validate_result
from . import pdf_text_fallback, stored_sample

AI_MODE = get_ai_mode()  # Reject typos before creating a data directory, DB or executor.
ROOT = Path(os.getenv("TEAM19_DATA_DIR", "./backend/local-data")).resolve()
DB = ROOT / "team19.sqlite3"
MAX_BYTES = int(os.getenv("MAX_PDF_MB", "20")) * 1024 * 1024
WORKERS = max(1, min(3 if AI_MODE == "real" else 4,
                     int(os.getenv("BE_WORKERS", "3" if AI_MODE == "real" else "1"))))
ROOT.mkdir(parents=True, exist_ok=True)
_executor = ThreadPoolExecutor(max_workers=WORKERS, thread_name_prefix="team19-job")


def ident(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


@contextmanager
def conn():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA busy_timeout=30000")
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def setup() -> None:
    with conn() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS lectures (id TEXT PRIMARY KEY, title TEXT, pdf_path TEXT, page_count INTEGER, status TEXT NOT NULL, error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS pages (lecture_id TEXT NOT NULL REFERENCES lectures(id), number INTEGER NOT NULL, text TEXT, image_path TEXT, description TEXT, PRIMARY KEY(lecture_id, number));
        CREATE TABLE IF NOT EXISTS outlines (id TEXT PRIMARY KEY, lecture_id TEXT NOT NULL REFERENCES lectures(id), mode TEXT NOT NULL, status TEXT NOT NULL, sections TEXT NOT NULL DEFAULT '[]', job_id TEXT, UNIQUE(lecture_id, mode));
        CREATE TABLE IF NOT EXISTS clips (id TEXT PRIMARY KEY, outline_id TEXT NOT NULL REFERENCES outlines(id), plan_id TEXT NOT NULL, position INTEGER NOT NULL, title TEXT NOT NULL, plan_json TEXT NOT NULL, status TEXT NOT NULL, job_id TEXT, result_json TEXT, error TEXT);
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, target_id TEXT NOT NULL, status TEXT NOT NULL, stage TEXT, error TEXT, retry_of TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, path TEXT NOT NULL, mime TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS job_usage (
            job_id TEXT NOT NULL REFERENCES jobs(id),
            stage TEXT NOT NULL CHECK(stage IN ('describing','planning','blueprint','audio')),
            status TEXT NOT NULL CHECK(status IN ('started','recorded','unavailable')),
            usage_json TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(job_id, stage),
            CHECK((status='recorded' AND usage_json IS NOT NULL) OR (status!='recorded' AND usage_json IS NULL))
        );
        """)
        # D-50: lecture owner for the personal list. Added in place so existing databases and rows are kept;
        # lectures that predate it keep owner_id NULL and are never listed for anyone.
        if "owner_id" not in {c["name"] for c in db.execute("PRAGMA table_info(lectures)")}:
            db.execute("ALTER TABLE lectures ADD COLUMN owner_id TEXT")
        db.execute("CREATE INDEX IF NOT EXISTS idx_lectures_owner ON lectures(owner_id)")
        # Never automatically rerun a charged call after a process restart. Show the same
        # error on every record the FE reads (job, lecture, clip); outlines use 'planning' while running.
        restarted = json.dumps({"code": "SERVER_RESTARTED", "message": "서버 재시작으로 중단되었습니다. 다시 시도해 주세요.", "retryable": True}, ensure_ascii=False)
        states = "'pending','running'" if AI_MODE == "real" else "'running'"
        # A job can be claimed just before a crash, while its target is still pending.
        db.execute(f"UPDATE lectures SET status='failed',error=? WHERE status='running' OR id IN (SELECT target_id FROM jobs WHERE type='prepare' AND status IN ({states}))", (restarted,))
        db.execute(f"UPDATE outlines SET status='failed' WHERE status IN ('running','planning') OR id IN (SELECT target_id FROM jobs WHERE type='outline' AND status IN ({states}))")
        db.execute(f"UPDATE clips SET status='failed',error=? WHERE status='running' OR id IN (SELECT target_id FROM jobs WHERE type='clip' AND status IN ({states}))", (restarted,))
        db.execute(f"UPDATE jobs SET status='failed',stage='interrupted',error=?,updated_at=CURRENT_TIMESTAMP WHERE status IN ({states})", (restarted,))
        db.execute("UPDATE job_usage SET status='unavailable',updated_at=CURRENT_TIMESTAMP WHERE status='started' AND job_id IN (SELECT id FROM jobs WHERE status='failed' AND stage='interrupted')")


def resume_pending() -> int:
    """Only sample jobs resume automatically; real jobs need an explicit retry (D-44)."""
    if AI_MODE != "sample":
        return 0
    with conn() as db:
        ids = [r["id"] for r in db.execute("SELECT id FROM jobs WHERE status='pending' ORDER BY rowid")]
    for jid in ids:
        dispatch(jid)
    return len(ids)


def fail(code: str, message: str, status: int, retryable: bool = False):
    raise HTTPException(status_code=status, detail={"code": code, "message": message, "retryable": retryable})


OWNER_ID = re.compile(r"[A-Za-z0-9_-]{16,64}")


def owner_of(header: str | None) -> str | None:
    """X-Owner-Id (D-50): None when absent; a present but malformed value is rejected, never ignored.
    This is a device label, not authentication."""
    if header is None:
        return None
    if not OWNER_ID.fullmatch(header):
        fail("INVALID_REQUEST", "X-Owner-Id 형식이 올바르지 않습니다.", 422)
    return header


def row(db: sqlite3.Connection, table: str, key: str):
    if table not in ("lectures", "outlines", "clips", "jobs", "assets"):
        raise ValueError("Invalid table")
    return db.execute(f"SELECT * FROM {table} WHERE id=?", (key,)).fetchone()


def pack_error(exc: Exception) -> dict:
    if isinstance(exc, PipelineError):
        return {"code": exc.code, "message": exc.message, "retryable": exc.retryable}
    # Never leak local file paths/API keys to the client.
    return {"code": "INTERNAL_ERROR", "message": "처리 중 오류가 발생했습니다. 서버 로그를 확인해 주세요.", "retryable": True}


def job_create(db: sqlite3.Connection, typ: str, target: str, retry_of: str | None = None) -> str:
    jid = ident("job")
    db.execute("INSERT INTO jobs(id,type,target_id,status,stage,retry_of) VALUES(?,?,?,'pending','queued',?)", (jid, typ, target, retry_of))
    return jid


def stage(db: sqlite3.Connection, jid: str, label: str):
    db.execute("UPDATE jobs SET stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (label, jid))


def call_with_usage(jid: str, label: str, fn, *args):
    """Commit each returned usage list before validation or another paid stage can fail."""
    with conn() as db:
        # The unique key also rejects an accidental second call for the same job/stage.
        db.execute("INSERT INTO job_usage(job_id,stage,status) VALUES(?,?,'started')", (jid, label))
        stage(db, jid, label)
    try:
        result = fn(*args)
    except Exception:
        with conn() as db:
            db.execute("UPDATE job_usage SET status='unavailable',updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND stage=?", (jid, label))
        raise

    usage = result.get("usage") if isinstance(result, dict) else None
    payload = None
    if isinstance(usage, list) and all(isinstance(item, dict) for item in usage):
        try:
            payload = json.dumps(usage, ensure_ascii=False, allow_nan=False)
        except (TypeError, ValueError):
            pass  # Missing/unserializable usage is unknown, never a fabricated zero cost.
    with conn() as db:
        db.execute("UPDATE job_usage SET status=?,usage_json=?,updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND stage=?",
                   ("recorded" if payload is not None else "unavailable", payload, jid, label))
    return result


def add_asset(db: sqlite3.Connection, path: Path, mime: str) -> str:
    resolved = path.resolve()
    if not resolved.is_file() or not resolved.is_relative_to(ROOT):
        raise PipelineError("OUTPUT_MISSING", "출력 파일이 없거나 저장 폴더 밖에 있습니다.")
    aid = ident("asset")
    db.execute("INSERT INTO assets(id,path,mime) VALUES(?,?,?)", (aid, str(resolved), mime))
    return f"/assets/{aid}"


def dispatch(jid: str):
    _executor.submit(execute, jid)


def execute(jid: str):
    with conn() as db:
        updated = db.execute("UPDATE jobs SET status='running',stage='starting',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", (jid,))
        if updated.rowcount == 0:
            return
        job = dict(row(db, "jobs", jid))
    try:
        pipeline = Pipeline()
        if job["type"] == "prepare":
            do_prepare(job, pipeline)
        elif job["type"] == "outline":
            do_outline(job, pipeline)
        elif job["type"] == "clip":
            do_clip(job, pipeline)
        else:
            raise PipelineError("INVALID_JOB", "지원되지 않는 작업입니다.")
        with conn() as db:
            db.execute("UPDATE jobs SET status='completed',stage='finished',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?", (jid,))
    except Exception as exc:
        error = json.dumps(pack_error(exc), ensure_ascii=False)
        with conn() as db:
            db.execute("UPDATE job_usage SET status='unavailable',updated_at=CURRENT_TIMESTAMP WHERE job_id=? AND status='started'", (jid,))
            db.execute("UPDATE jobs SET status='failed',stage='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (error, jid))
            if job["type"] == "prepare":
                db.execute("UPDATE lectures SET status='failed',error=? WHERE id=?", (error, job["target_id"]))
            elif job["type"] == "outline":
                db.execute("UPDATE outlines SET status='failed' WHERE id=?", (job["target_id"],))
            elif job["type"] == "clip":
                db.execute("UPDATE clips SET status='failed',error=? WHERE id=?", (error, job["target_id"]))
        # Additional detail is in stderr, never API responses.
        import traceback
        traceback.print_exc()


def do_prepare(job: dict, pipe: Pipeline):
    lid, jid = job["target_id"], job["id"]
    with conn() as db:
        db.execute("UPDATE lectures SET status='running' WHERE id=?", (lid,))
        stage(db, jid, "extracting")
        lecture = row(db, "lectures", lid)
        pdf_path = Path(lecture["pdf_path"])
    out = ROOT / "lectures" / lid / "pages"
    result = pipe.extract_pdf(pdf_path, out)
    pages = result["pages"]
    if not pages:
        raise PipelineError("INVALID_PDF", "PDF 페이지 추출 결과가 비어 있습니다.")
    described = call_with_usage(jid, "describing", pipe.describe_pages, pages)
    lookup = {int(p["number"]): p.get("description", "") for p in described.get("pages", [])}
    with conn() as db:
        for p in pages:
            image = Path(p["imagePath"])
            add_asset(db, image, "image/png")  # record physical output; stable read URL queried below
            db.execute("INSERT OR REPLACE INTO pages(lecture_id,number,text,image_path,description) VALUES(?,?,?,?,?)", (lid, p["number"], p.get("text", ""), str(image.resolve()), lookup.get(int(p["number"]), "")))
        db.execute("UPDATE lectures SET status='ready',page_count=?,error=NULL WHERE id=?", (result["pageCount"], lid))


def do_outline(job: dict, pipe: Pipeline):
    oid, jid = job["target_id"], job["id"]
    with conn() as db:
        outline = row(db, "outlines", oid)
        db.execute("UPDATE outlines SET status='planning' WHERE id=?", (oid,))
        lecture = row(db, "lectures", outline["lecture_id"])
        if lecture["status"] != "ready":
            raise PipelineError("LECTURE_NOT_READY", "강의 분석이 완료되지 않았습니다.")
        pages = [dict(p) for p in db.execute("SELECT * FROM pages WHERE lecture_id=? ORDER BY number", (lecture["id"],))]
    result = call_with_usage(jid, "planning", pipe.plan_outline, outline["mode"], [{"number": p["number"], "text": p["text"], "imagePath": p["image_path"], "description": p["description"]} for p in pages], [{"number": p["number"], "description": p["description"]} for p in pages])
    plans = result.get("clipPlans", [])
    if not isinstance(plans, list) or not plans:
        raise PipelineError("NO_CLIPS", "생성할 클립 계획이 없습니다.")
    if len(plans) > 30:
        raise PipelineError("TOO_MANY_CLIPS", "한 번에 만들 수 있는 클립 수를 초과했습니다.")
    scheduled = []
    with conn() as db:
        db.execute("UPDATE outlines SET status='ready',sections=? WHERE id=?", (json.dumps(result.get("sections", []), ensure_ascii=False), oid))
        for pos, plan in enumerate(plans):
            cid, pid = ident("clip"), ident("plan")
            db.execute("INSERT INTO clips(id,outline_id,plan_id,position,title,plan_json,status) VALUES(?,?,?,?,?,?,'pending')", (cid, oid, pid, pos, str(plan.get("title") or f"클립 {pos+1}"), json.dumps(plan, ensure_ascii=False)))
            cj = job_create(db, "clip", cid)
            db.execute("UPDATE clips SET job_id=? WHERE id=?", (cj, cid))
            scheduled.append(cj)
    for cj in scheduled:
        dispatch(cj)


def do_clip(job: dict, pipe: Pipeline):
    cid, jid = job["target_id"], job["id"]
    with conn() as db:
        db.execute("UPDATE clips SET status='running',error=NULL WHERE id=?", (cid,))
        clip = row(db, "clips", cid)
        outline = row(db, "outlines", clip["outline_id"])
        lecture = row(db, "lectures", outline["lecture_id"])
        pages = [dict(p) for p in db.execute("SELECT * FROM pages WHERE lecture_id=? ORDER BY number", (lecture["id"],))]
    plan = json.loads(clip["plan_json"])
    relevant_pages = [{"number": p["number"], "text": p["text"], "imagePath": p["image_path"], "description": p["description"]} for p in pages if p["number"] in plan.get("sourcePages", [])]
    generated = call_with_usage(jid, "blueprint", pipe.make_blueprint, plan, relevant_pages, lecture["page_count"])
    blueprint = generated.get("blueprint", generated)
    check_blueprint(blueprint, lecture["page_count"])
    out = ROOT / "clips" / cid / jid
    audio = call_with_usage(jid, "audio", pipe.make_audio, blueprint, out)
    validate_result(blueprint, audio, lecture["page_count"])
    # Dev-only MP4 before publishing completion; optional and never a substitute for AI output.
    preview = None
    if pipe.sample and os.getenv("SAMPLE_MP4", "1") == "1":
        try:
            from .preview_video import render_preview
            preview = render_preview(blueprint, audio["captions"], Path(audio["audioPath"]), out)
        except Exception:
            import traceback
            traceback.print_exc()  # Preview failure never blocks blueprint + audio.
    with conn() as db:
        path = Path(audio["audioPath"])
        mime = "audio/mpeg" if path.suffix.lower() == ".mp3" else "audio/wav" if path.suffix.lower() == ".wav" else "audio/ogg"
        url = add_asset(db, path, mime)
        result = {"resultId": ident("res"), "durationSec": audio["durationSec"], "audioUrl": url, "blueprint": blueprint, "captions": audio["captions"], "sample": pipe.sample}
        if preview is not None:
            result["previewVideoUrl"] = add_asset(db, preview, "video/mp4")
        db.execute("UPDATE clips SET status='completed',result_json=?,error=NULL WHERE id=?", (json.dumps(result, ensure_ascii=False), cid))


setup()
if AI_MODE == "sample" and not pdf_text_fallback.pymupdf_available():
    # BUG-FE-01: without PyMuPDF the sample extractor uses pypdf, which can garble Korean text.
    logging.getLogger("backend").warning("PyMuPDF를 불러올 수 없습니다. 샘플 업로드는 pypdf로 대체되어 한글이 깨질 수 있습니다. "
                                         "`pip install -r backend/requirements.txt`로 PyMuPDF를 설치하세요.")
resume_pending()
app = FastAPI(title="team19 BE", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_credentials=False, allow_methods=["GET", "HEAD", "POST"], allow_headers=["*"], expose_headers=["Accept-Ranges", "Content-Range", "Content-Length", "ETag", "Last-Modified"])


@app.exception_handler(HTTPException)
async def custom_http_error(request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "HTTP_ERROR", "message": str(exc.detail), "retryable": False}
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc: RequestValidationError):
    # Same error shape as every other error (contracts/api.md), instead of FastAPI's {"detail": [...]}.
    return JSONResponse(status_code=422, content={"error": {"code": "INVALID_REQUEST", "message": "요청 형식이 올바르지 않습니다.", "retryable": False}})


@app.get("/demo", include_in_schema=False)
def demo_page():
    return FileResponse(Path(__file__).with_name("demo.html"), media_type="text/html")


@app.get("/health")
def health():
    return {"status": "ok", "aiMode": AI_MODE}


@app.post("/lectures", status_code=202)
async def upload(file: UploadFile = File(...), x_owner_id: str | None = Header(None)):
    owner = owner_of(x_owner_id)
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        fail("UNSUPPORTED_FILE_TYPE", "PDF 파일만 업로드할 수 있습니다.", 415)
    lid = ident("lec")
    directory = ROOT / "lectures" / lid
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "original.pdf"
    amount = 0
    try:
        with path.open("wb") as dst:
            while chunk := await file.read(1024 * 1024):
                amount += len(chunk)
                if amount > MAX_BYTES:
                    fail("FILE_TOO_LARGE", "PDF 파일이 크기 제한을 초과했습니다.", 413)
                dst.write(chunk)
        with path.open("rb") as src:
            if src.read(5) != b"%PDF-":
                fail("INVALID_PDF", "올바른 PDF 파일이 아닙니다.", 422)
        with conn() as db:
            db.execute("INSERT INTO lectures(id,title,pdf_path,status,owner_id) VALUES(?,?,?,'pending',?)", (lid, Path(file.filename).name, str(path), owner))
            jid = job_create(db, "prepare", lid)
        dispatch(jid)
        return {"lectureId": lid, "jobId": jid, "status": "pending"}
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@app.get("/lectures")
def lectures(x_owner_id: str | None = Header(None)):
    owner = owner_of(x_owner_id)
    if owner is None:
        return []  # no device ID, no list (D-50); old lectures without an owner are never listed
    with conn() as db:
        return [{"id": r["id"], "title": r["title"], "status": r["status"], "pageCount": r["page_count"]} for r in db.execute("SELECT * FROM lectures WHERE owner_id=? ORDER BY created_at DESC, rowid DESC", (owner,))]


@app.get("/lectures/{lecture_id}")
def lecture(lecture_id: str):
    with conn() as db:
        l = row(db, "lectures", lecture_id)
        if l is None:
            fail("LECTURE_NOT_FOUND", "강의를 찾을 수 없습니다.", 404)
        pages = []
        for p in db.execute("SELECT * FROM pages WHERE lecture_id=? ORDER BY number", (lecture_id,)):
            asset = db.execute("SELECT id FROM assets WHERE path=? LIMIT 1", (p["image_path"],)).fetchone()
            pages.append({"number": p["number"], "imageUrl": f"/assets/{asset['id']}" if asset else None})
        # Latest preparation job: after a retry the FE must follow the new job, not the failed one.
        j = db.execute("SELECT id FROM jobs WHERE target_id=? AND type='prepare' ORDER BY rowid DESC LIMIT 1", (lecture_id,)).fetchone()
        return {"id": l["id"], "title": l["title"], "status": l["status"], "pageCount": l["page_count"], "preparationJobId": j["id"] if j else None, "pages": pages}


class OutlineRequest(BaseModel):
    mode: str


@app.post("/lectures/{lecture_id}/outlines")
def create_outline(lecture_id: str, payload: OutlineRequest):
    if payload.mode not in ("intro", "review", "exam"):
        fail("INVALID_MODE", "지원하지 않는 학습 모드입니다.", 422)
    with conn() as db:
        # Take the write lock first so simultaneous duplicate requests see each other's outline
        # (otherwise the second INSERT violates UNIQUE(lecture_id, mode) and returns HTTP 500).
        db.execute("BEGIN IMMEDIATE")
        lec = row(db, "lectures", lecture_id)
        if lec is None:
            fail("LECTURE_NOT_FOUND", "강의를 찾을 수 없습니다.", 404)
        if lec["status"] != "ready":
            fail("LECTURE_NOT_READY", "PDF 분석이 아직 완료되지 않았습니다.", 409, True)
        existing = db.execute("SELECT * FROM outlines WHERE lecture_id=? AND mode=?", (lecture_id, payload.mode)).fetchone()
        if existing:
            j = row(db, "jobs", existing["job_id"])
            return JSONResponse(status_code=200 if existing["status"] == "ready" else 202, content={"outlineId": existing["id"], "jobId": j["id"], "status": j["status"], "reused": True})
        oid = ident("out")
        jid = job_create(db, "outline", oid)
        db.execute("INSERT INTO outlines(id,lecture_id,mode,status,job_id) VALUES(?,?,?,'pending',?)", (oid, lecture_id, payload.mode, jid))
    dispatch(jid)
    return JSONResponse(status_code=202, content={"outlineId": oid, "jobId": jid, "status": "pending", "reused": False})


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    with conn() as db:
        j = row(db, "jobs", job_id)
        if not j:
            fail("JOB_NOT_FOUND", "작업을 찾을 수 없습니다.", 404)
        return {"id": j["id"], "type": j["type"], "status": j["status"], "stage": j["stage"], "progress": None, "error": json.loads(j["error"]) if j["error"] else None}


@app.get("/lectures/{lecture_id}/outlines/{mode}")
def get_outline(lecture_id: str, mode: str):
    if mode not in ("intro", "review", "exam"):
        fail("INVALID_MODE", "지원하지 않는 학습 모드입니다.", 422)
    with conn() as db:
        if not row(db, "lectures", lecture_id):
            fail("LECTURE_NOT_FOUND", "강의를 찾을 수 없습니다.", 404)
        o = db.execute("SELECT * FROM outlines WHERE lecture_id=? AND mode=?", (lecture_id, mode)).fetchone()
        if not o:
            fail("OUTLINE_NOT_FOUND", "분할 계획을 찾을 수 없습니다.", 404)
        clips = []
        for c in db.execute("SELECT * FROM clips WHERE outline_id=? ORDER BY position", (o["id"],)):
            plan = json.loads(c["plan_json"])
            clips.append({"id": c["id"], "planId": c["plan_id"], "order": c["position"], "title": c["title"], "kind": plan.get("kind", "concept"), "sourcePages": plan.get("sourcePages", []), "status": c["status"], "jobId": c["job_id"], "error": json.loads(c["error"]) if c["error"] else None})
        return {"id": o["id"], "mode": o["mode"], "status": o["status"], "jobId": o["job_id"], "clips": clips}


@app.get("/clips/{clip_id}")
def get_clip(clip_id: str):
    if clip_id in stored_sample.SAMPLES:
        try:
            return stored_sample.SAMPLES[clip_id].load_clip()
        except PipelineError as exc:
            fail(exc.code, exc.message, 503 if exc.code == "SAMPLE_UNAVAILABLE" else 500)
    with conn() as db:
        c = row(db, "clips", clip_id)
        if not c:
            fail("CLIP_NOT_FOUND", "클립을 찾을 수 없습니다.", 404)
        return {"id": c["id"], "planId": c["plan_id"], "status": c["status"], "error": json.loads(c["error"]) if c["error"] else None, "result": json.loads(c["result_json"]) if c["result_json"] else None}


@app.post("/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: str):
    with conn() as db:
        db.execute("BEGIN IMMEDIATE")  # a double click must not start two (possibly charged) runs
        j = row(db, "jobs", job_id)
        if not j:
            fail("JOB_NOT_FOUND", "작업을 찾을 수 없습니다.", 404)
        if j["status"] != "failed":
            fail("RETRY_NOT_ALLOWED", "실패한 작업만 다시 실행할 수 있습니다.", 409)
        newest = db.execute("SELECT id FROM jobs WHERE target_id=? AND type=? ORDER BY rowid DESC LIMIT 1", (j["target_id"], j["type"])).fetchone()
        if newest["id"] != j["id"]:
            fail("RETRY_NOT_ALLOWED", "이미 다시 실행한 작업입니다. 새 작업의 상태를 확인해 주세요.", 409)
        target = j["target_id"]
        if j["type"] == "outline":
            if db.execute("SELECT COUNT(*) FROM clips WHERE outline_id=?", (target,)).fetchone()[0]:
                fail("RETRY_NOT_ALLOWED", "이미 클립이 만들어진 분할 계획입니다.", 409)
            db.execute("UPDATE outlines SET status='pending' WHERE id=?", (target,))
        elif j["type"] == "clip":
            db.execute("UPDATE clips SET status='pending',error=NULL WHERE id=?", (target,))
        elif j["type"] == "prepare":
            db.execute("UPDATE lectures SET status='pending',error=NULL WHERE id=?", (target,))
            db.execute("DELETE FROM pages WHERE lecture_id=?", (target,))
        else:
            fail("RETRY_NOT_ALLOWED", "다시 실행할 수 없습니다.", 409)
        new_id = job_create(db, j["type"], target, j["id"])
        if j["type"] == "outline":
            db.execute("UPDATE outlines SET job_id=? WHERE id=?", (new_id, target))
        if j["type"] == "clip":
            db.execute("UPDATE clips SET job_id=? WHERE id=?", (new_id, target))
    dispatch(new_id)
    return {"jobId": new_id, "retryOf": job_id, "status": "pending"}


@app.api_route("/assets/{asset_id}", methods=["GET", "HEAD"])
def asset(asset_id: str):
    page = stored_sample.PAGE_ASSETS.get(asset_id)
    if page is not None:
        path = page.png_path()
        if path is None:
            fail("ASSET_NOT_FOUND", "파일을 찾을 수 없습니다.", 404)
        return FileResponse(path, media_type="image/png", filename=path.name, content_disposition_type="inline")
    sample = next((s for s in stored_sample.SAMPLES.values() if s.audio_id == asset_id), None)
    if sample is not None:
        path = sample.audio_path()
        if path is None:
            fail("ASSET_NOT_FOUND", "파일을 찾을 수 없습니다.", 404)
        try:
            # A truncated MP3 can still decode; compare it with this result's
            # duration/captions before serving it, including direct Range calls.
            sample.load_clip()
        except PipelineError as exc:
            fail(exc.code, exc.message, 503 if exc.code == "SAMPLE_UNAVAILABLE" else 500)
        return FileResponse(path, media_type=sample.media_type, filename=path.name, content_disposition_type="inline")
    with conn() as db:
        a = row(db, "assets", asset_id)
        if not a:
            fail("ASSET_NOT_FOUND", "파일을 찾을 수 없습니다.", 404)
        path = Path(a["path"]).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            fail("ASSET_NOT_FOUND", "파일을 찾을 수 없습니다.", 404)
        # Starlette FileResponse handles browser range requests on recent versions.
        return FileResponse(path, media_type=a["mime"], filename=path.name, content_disposition_type="inline")
