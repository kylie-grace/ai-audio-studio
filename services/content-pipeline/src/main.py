"""Content Pipeline — social media draft generation."""
from fastapi import FastAPI

app = FastAPI(title="Content Pipeline")


@app.get("/health")
async def health():
    return {"status": "ok"}

# TODO Task 030: implement /draft-social endpoint
# See tasks/030-social-draft-pipeline.md for full spec
