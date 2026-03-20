"""Audio QC Service — objective measurements on rendered audio files."""
from fastapi import FastAPI

app = FastAPI(title="Audio QC Service")


@app.get("/health")
async def health():
    return {"status": "ok"}

# TODO Task 060: implement /qc/run, /qc/reports endpoints
# See tasks/060-audio-qc.md for full spec
