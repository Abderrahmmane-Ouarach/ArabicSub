"""
Single-worker queue using Python's threading module.

Why threading and not multiprocessing?
- We only need ONE worker running at a time.
- Threading shares memory with the main process, so the Queue object
  is accessible from both the FastAPI routes and the worker thread
  without any IPC overhead.
- stable-ts/whisper release the GIL during heavy computation (C extensions),
  so threading doesn't block the FastAPI event loop.

Why not Celery/Redis?
- Overkill for a single-server personal tool.
- Celery needs a broker (Redis/RabbitMQ), a separate worker process,
  and result backend config. That's 3 moving parts for a problem
  one thread solves fine.
"""

import threading
from queue import Queue as ThreadQueue
from app.jobs import update_job
from app.worker import transcribe_video, burn_subtitles

# The global FIFO queue — holds task dicts
_q: ThreadQueue = ThreadQueue()

# Tracks the job_id currently being processed (None = idle)
_current: dict = {"job_id": None}
_lock = threading.Lock()


def queue_size() -> int:
    return _q.qsize()


def current_job() -> str | None:
    return _current["job_id"]


def enqueue(task: dict):
    """
    Push a task onto the queue.
    task must have: {"type": "transcribe"|"burn", "job_id": str, ...params}
    """
    _q.put(task)


def _worker_loop():
    """Runs forever in a background thread, processing one job at a time."""
    while True:
        task = _q.get()  # blocks until a task arrives
        job_id = task["job_id"]

        with _lock:
            _current["job_id"] = job_id

        try:
            if task["type"] == "transcribe":
                update_job(job_id, status="transcribing")
                transcribe_video(
                    task["video_path"],
                    task["srt_path"],
                    model=task["model"],
                    max_chars=task["max_chars"]
                )
                # Read result and store in job state so the client can poll it
                with open(task["srt_path"]) as f:
                    srt_content = f.read()
                update_job(job_id, status="done_transcribe", srt_content=srt_content)

            elif task["type"] == "burn":
                update_job(job_id, status="burning")
                burn_subtitles(
                    task["video_path"], task["srt_path"],
                    task["ass_path"],   task["out_path"],
                    font_name=task["font_name"],
                    font_size=task["font_size"],
                    primary_color=task["primary_color"],
                    outline_color=task["outline_color"],
                    back_color=task["back_color"],
                    bold=task["bold"],
                    outline=task["outline"],
                    shadow=task["shadow"],
                    margin_v=task["margin_v"]
                )
                update_job(job_id, status="done_burn", output=task["out_path"])

        except Exception as e:
            update_job(job_id, status="failed", error=str(e))

        finally:
            with _lock:
                _current["job_id"] = None
            _q.task_done()


def start_worker():
    """Called once at app startup. Daemon=True so it dies with the main process."""
    t = threading.Thread(target=_worker_loop, daemon=True)
    t.start()
