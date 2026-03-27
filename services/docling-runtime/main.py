"""
Docling HTTP service: POST /parse — consumed by Supabase Edge Function docling-parse.

Expects JSON: fileName, mimeType, contentBase64, options (optional).
Returns JSON with sourceUnits[] compatible with lib/media/docling-client.ts normalizers.
"""

from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Docling runtime", version="1.0.0")


class ParseOptions(BaseModel):
    extractFigures: bool = True
    extractPreview: bool = True
    includeCaptions: bool = True
    maxFiguresPerUnit: int = Field(default=4, ge=0, le=24)


class ParseRequest(BaseModel):
    fileName: str
    mimeType: str
    contentBase64: str
    options: ParseOptions | None = None


def _guess_suffix(file_name: str, mime: str) -> str:
    lower = file_name.lower()
    for ext in (".pdf", ".docx", ".pptx", ".png", ".jpg", ".jpeg", ".webp", ".gif"):
        if lower.endswith(ext):
            return ext
    mt = mime.lower()
    if "pdf" in mt:
        return ".pdf"
    if "word" in mt or "officedocument.wordprocessingml" in mt:
        return ".docx"
    if "presentationml" in mt or "powerpoint" in mt:
        return ".pptx"
    if "png" in mt:
        return ".png"
    if "jpeg" in mt or "jpg" in mt:
        return ".jpg"
    if "webp" in mt:
        return ".webp"
    return ".bin"


def _convert_with_docling(path: Path) -> dict[str, Any]:
    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="docling package not installed in this image",
        ) from exc

    converter = DocumentConverter()
    result = converter.convert(str(path))
    md = result.document.export_to_markdown()
    meta: dict[str, Any] = {
        "provider": "docling-python",
        "markdownChars": len(md),
    }
    # Single aggregate unit; client splits/chunks downstream. Extend with per-page export as needed.
    units = [
        {
            "unitType": "page",
            "unitNumber": 1,
            "title": path.stem or "Document",
            "extractedText": md,
            "figures": [],
            "preview": None,
            "ocrStatus": "completed" if md.strip() else "pending",
        }
    ]
    return {"kind": "pdf", "metadata": meta, "sourceUnits": units}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse")
def parse(
    body: ParseRequest,
    x_runtime_secret: str | None = Header(default=None, alias="X-Runtime-Secret"),
) -> dict[str, Any]:
    expected = os.environ.get("DOC_RUNTIME_SECRET", "").strip()
    if expected and (x_runtime_secret or "").strip() != expected:
        raise HTTPException(status_code=401, detail="invalid runtime secret")

    raw = body.contentBase64.strip()
    if "," in raw[:120]:
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid base64") from exc

    if not data:
        raise HTTPException(status_code=400, detail="empty content")

    suffix = _guess_suffix(body.fileName, body.mimeType)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)

    try:
        return _convert_with_docling(tmp_path)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
