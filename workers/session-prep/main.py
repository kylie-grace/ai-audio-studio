"""session-prep worker — stub. See tasks/ for implementation spec."""
from fastapi import FastAPI

app = FastAPI(title="session-prep")

@app.get("/health")
async def health():
    return {"status": "ok"}
