"""inbox-triage worker — stub. See tasks/ for implementation spec."""
from fastapi import FastAPI

app = FastAPI(title="inbox-triage")

@app.get("/health")
async def health():
    return {"status": "ok"}
