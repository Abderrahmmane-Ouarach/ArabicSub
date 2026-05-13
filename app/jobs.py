import json, uuid, os
from datetime import datetime

JOBS_DIR = "jobs"
os.makedirs(JOBS_DIR, exist_ok=True)

def create_job() -> str:
    job_id = str(uuid.uuid4())
    _write(job_id, {
        "id": job_id,
        "status": "queued",
        "created": datetime.utcnow().isoformat()
    })
    return job_id

def update_job(job_id: str, **kwargs):
    data = get_job(job_id) or {}
    data.update(kwargs)
    _write(job_id, data)

def get_job(job_id: str) -> dict:
    path = f"{JOBS_DIR}/{job_id}.json"
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)

def list_jobs() -> list:
    jobs = []
    for f in sorted(os.listdir(JOBS_DIR)):
        if f.endswith(".json"):
            with open(f"{JOBS_DIR}/{f}") as fh:
                jobs.append(json.load(fh))
    return jobs

def _write(job_id: str, data: dict):
    with open(f"{JOBS_DIR}/{job_id}.json", "w") as f:
        json.dump(data, f)
