# app/api_uploads.py
import shutil
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api_auth import get_current_user
from app.db import get_session
from app.models import UploadJob

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOADS_ROOT = Path("/data/uploads")

SUPPORTED_LANGUAGES = [
    {"code": "rus_Cyrl", "name": "Русский"},
    {"code": "eng_Latn", "name": "English"},
    {"code": "deu_Latn", "name": "Deutsch"},
    {"code": "fra_Latn", "name": "Français"},
    {"code": "spa_Latn", "name": "Español"},
    {"code": "ita_Latn", "name": "Italiano"},
    {"code": "por_Latn", "name": "Português"},
    {"code": "tur_Latn", "name": "Türkçe"},
]


@router.get("/languages")
async def get_languages():
    return SUPPORTED_LANGUAGES


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    allowed_ext = {"mp3", "wav", "m4a", "mp4", "webm", "mov"}
    ext = (file.filename.split(".")[-1] if file.filename else "").lower()
    if ext not in allowed_ext:
        raise HTTPException(
            400, f"Неподдерживаемый формат. Разрешены: {', '.join(sorted(allowed_ext))}"
        )

    job = UploadJob(
        user_id=user.id,
        filename=file.filename or "upload",
        content_type=file.content_type or "application/octet-stream",
        status="uploaded",
        stage="uploaded",
        progress=0,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    base = UPLOADS_ROOT / str(job.id)
    base.mkdir(parents=True, exist_ok=True)

    input_path = base / f"input.{ext}"
    with input_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return {"id": job.id, "status": job.status, "progress": job.progress}


@router.post("/{job_id}/start")
async def start_job(
    job_id: int,
    payload: dict,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    target_language = payload.get("target_language")
    if not target_language:
        raise HTTPException(422, "target_language is required")

    if target_language not in {x["code"] for x in SUPPORTED_LANGUAGES}:
        raise HTTPException(400, "Неподдерживаемый язык перевода")

    res = await session.execute(
        select(UploadJob).where(UploadJob.id == job_id, UploadJob.user_id == user.id)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    if job.status == "processing":
        return {"ok": True}

    job.status = "processing"
    job.stage = "extract"
    job.progress = 1
    job.target_language = target_language
    job.error_message = None
    await session.commit()

    from app.uploads_worker import process_upload_job

    background.add_task(process_upload_job, job_id)

    return {"ok": True}


@router.get("/{job_id}/status")
async def get_status(
    job_id: int,
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(UploadJob).where(UploadJob.id == job_id, UploadJob.user_id == user.id)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    return {
        "id": job.id,
        "status": job.status,
        "stage": job.stage,
        "progress": job.progress,
        "error_message": job.error_message,
    }


@router.get("/{job_id}/download")
async def download_result(
    job_id: int,
    format: str = Query(..., pattern="^(docx|pdf)$"),
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(UploadJob).where(UploadJob.id == job_id, UploadJob.user_id == user.id)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    if job.status != "done":
        raise HTTPException(400, "Перевод еще не готов")

    base = UPLOADS_ROOT / str(job.id)
    path = base / f"result.{format}"
    if not path.exists():
        raise HTTPException(404, "File not found")

    out_name = f"translation_{job.id}.{format}"
    return FileResponse(str(path), filename=out_name)


@router.post("/{job_id}/save-note")
async def save_note_stub(
    job_id: int,
    session: AsyncSession = Depends(get_session),
    user=Depends(get_current_user),
):
    res = await session.execute(
        select(UploadJob).where(UploadJob.id == job_id, UploadJob.user_id == user.id)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "done":
        raise HTTPException(400, "Перевод еще не готов")

    return {"ok": True, "message": "Заглушка: позже сохраним в конспекты"}
