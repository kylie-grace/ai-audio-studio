"""social-drafting worker — stub. See tasks/ for implementation spec."""
from fastapi import FastAPI

app = FastAPI(title="social-drafting")

@app.get("/health")
async def health():
    return {"status": "ok"}
