"""lead-intake worker — stub. See tasks/ for implementation spec."""
from fastapi import FastAPI

app = FastAPI(title="lead-intake")

@app.get("/health")
async def health():
    return {"status": "ok"}
