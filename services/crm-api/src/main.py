"""CRM API — lead and project records."""
from fastapi import FastAPI

app = FastAPI(title="CRM API")


@app.get("/health")
async def health():
    return {"status": "ok"}

# TODO Task 010: implement /leads and /projects endpoints
