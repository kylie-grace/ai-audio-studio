"""Async Ollama client for AI Audio Studio workers."""

from __future__ import annotations

import json
import logging
import os
import re

import httpx

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
PLANNER_MODEL = os.environ.get("PLANNER_MODEL", "qwen2.5:14b-instruct")
CLASSIFIER_MODEL = os.environ.get("CLASSIFIER_MODEL", "qwen2.5:3b")

logger = logging.getLogger(__name__)


async def generate(prompt: str, model: str = CLASSIFIER_MODEL, timeout: float = 60.0) -> str:
    """Generate text from an Ollama model. Returns empty string on any error."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False},
                timeout=timeout,
            )
            response.raise_for_status()
            return response.json()["response"]
    except Exception as exc:
        logger.warning("Ollama generate failed (model=%s): %s", model, exc)
        return ""


async def generate_json(
    prompt: str,
    model: str = PLANNER_MODEL,
    timeout: float = 90.0,
) -> dict | list | None:
    """Generate structured JSON from an Ollama model.

    Strips markdown code fences, tries JSON parse, then falls back to
    extracting the first {...} or [...] block from the response.
    Returns None on any parse failure.
    """
    text = await generate(prompt, model=model, timeout=timeout)
    if not text:
        return None
    text = text.strip()
    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    if text.startswith("```"):
        lines = text.split("\n")
        inner = lines[1:] if len(lines) > 1 else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    # Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Extract first JSON array
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    # Extract first JSON object
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    logger.warning("Ollama JSON parse failed. Response prefix: %.120s", text)
    return None


async def is_available(model: str = CLASSIFIER_MODEL) -> bool:
    """Check if Ollama is running and the model is loaded."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5.0)
            models = [m["name"] for m in response.json().get("models", [])]
            base = model.split(":")[0]
            return any(m.startswith(base) for m in models)
    except Exception:
        return False
