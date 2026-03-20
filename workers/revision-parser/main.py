"""revision-parser worker — stub. See tasks/ for implementation spec."""
from fastapi import FastAPI

app = FastAPI(title="revision-parser")

@app.get("/health")
async def health():
    return {"status": "ok"}
