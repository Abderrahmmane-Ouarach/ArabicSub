import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from app.jobs import create_job, get_job, list_jobs
from app import queue as Q

UPLOADS = "uploads"
OUTPUTS = "outputs"
os.makedirs(UPLOADS, exist_ok=True)
os.makedirs(OUTPUTS, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background worker thread once when the app boots
    Q.start_worker()
    yield


app = FastAPI(title="Arabic Subtitle Pipeline", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    with open("static/index.html") as f:
        return HTMLResponse(f.read())


# ── Queue info ─────────────────────────────────────────────────────────────────
@app.get("/queue-status")
def queue_status():
    """
    Frontend polls this to show the user their position.
    Returns how many jobs are waiting + which job is currently running.
    """
    return {
        "waiting": Q.queue_size(),
        "current_job": Q.current_job()
    }


# ── Transcribe ─────────────────────────────────────────────────────────────────
@app.post("/transcribe")
async def transcribe(
    video: UploadFile = File(...),
    max_chars: int = Form(35),
    model: str = Form("medium")
):
    if not video.filename.lower().endswith((".mp4", ".mkv", ".mov", ".avi")):
        raise HTTPException(400, detail="Only mp4/mkv/mov/avi supported")

    job_id = create_job()
    video_path = f"{UPLOADS}/{job_id}_{video.filename}"
    srt_path   = f"{OUTPUTS}/{job_id}.srt"

    # Save file to disk immediately — the queue worker will pick it up
    with open(video_path, "wb") as f:
        f.write(await video.read())

    # Push to queue — returns instantly
    Q.enqueue({
        "type":       "transcribe",
        "job_id":     job_id,
        "video_path": video_path,
        "srt_path":   srt_path,
        "model":      model,
        "max_chars":  max_chars
    })

    # Tell the client: here's your job_id, now poll /job/{job_id}
    return {
        "job_id":    job_id,
        "status":    "queued",
        "position":  Q.queue_size()   # rough position in queue
    }


# ── Job status (frontend polls this) ──────────────────────────────────────────
@app.get("/job/{job_id}")
def job_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


# ── Video stream ───────────────────────────────────────────────────────────────
@app.get("/video/{job_id}")
def stream_video(job_id: str):
    for f in os.listdir(UPLOADS):
        if f.startswith(job_id):
            return FileResponse(f"{UPLOADS}/{f}", media_type="video/mp4")
    raise HTTPException(404, "Video not found")


# ── Burn ───────────────────────────────────────────────────────────────────────
@app.post("/burn")
async def burn(
    job_id:        str   = Form(...),
    video_filename: str  = Form(...),
    srt_content:   str   = Form(...),
    font_name:     str   = Form("Cairo"),
    font_size:     int   = Form(32),
    primary_color: str   = Form("&H00FFFFFF"),
    outline_color: str   = Form("&H00000000"),
    back_color:    str   = Form("&H00000000"),
    bold:          str   = Form("-1"),
    outline:       float = Form(3),
    shadow:        float = Form(0),
    margin_v:      int   = Form(30),
):
    video_path = None
    for f in os.listdir(UPLOADS):
        if f.startswith(job_id):
            video_path = f"{UPLOADS}/{f}"
            break
    if not video_path:
        raise HTTPException(404, "Original video not found")

    srt_path = f"{OUTPUTS}/{job_id}_edited.srt"
    ass_path = f"{OUTPUTS}/{job_id}.ass"
    out_path = f"{OUTPUTS}/{job_id}_final.mp4"

    # Save the edited SRT from the frontend
    with open(srt_path, "w") as f:
        f.write(srt_content)

    # Mark job as queued for burning
    from app.jobs import update_job
    update_job(job_id, status="queued_burn")

    Q.enqueue({
        "type":          "burn",
        "job_id":        job_id,
        "video_path":    video_path,
        "srt_path":      srt_path,
        "ass_path":      ass_path,
        "out_path":      out_path,
        "font_name":     font_name,
        "font_size":     font_size,
        "primary_color": primary_color,
        "outline_color": outline_color,
        "back_color":    back_color,
        "bold":          bold,
        "outline":       outline,
        "shadow":        shadow,
        "margin_v":      margin_v
    })

    return {"job_id": job_id, "status": "queued_burn"}


# ── Download ───────────────────────────────────────────────────────────────────
@app.get("/download/{job_id}")
def download(job_id: str):
    path = f"{OUTPUTS}/{job_id}_final.mp4"
    if not os.path.exists(path):
        raise HTTPException(404, "Not ready")
    return FileResponse(path, filename="subtitled.mp4", media_type="video/mp4")


@app.get("/download-srt/{job_id}")
def download_srt(job_id: str):
    for name in [f"{job_id}_edited.srt", f"{job_id}.srt"]:
        path = f"{OUTPUTS}/{name}"
        if os.path.exists(path):
            return FileResponse(path, filename="subtitles.srt")
    raise HTTPException(404, "SRT not found")
