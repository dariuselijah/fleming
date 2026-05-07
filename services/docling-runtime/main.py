"""
Docling HTTP service: POST /parse — consumed by Supabase Edge Function docling-parse.

Expects JSON: fileName, mimeType, and either contentBase64 or fileUrl, plus options (optional).
Returns JSON with sourceUnits[] compatible with lib/media/docling-client.ts normalizers.
"""

from __future__ import annotations

import base64
import io
import os
import tempfile
import urllib.request
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
    contentBase64: str | None = None
    fileUrl: str | None = None
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


def _kind_from_suffix(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return "pdf"
    if suffix == ".pptx":
        return "pptx"
    if suffix == ".docx":
        return "docx"
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return "image"
    return "other"


def _pil_image_to_base64(pil_image: Any) -> str:
    buffer = io.BytesIO()
    pil_image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _normalize_caption(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, (list, tuple)):
        parts = [_normalize_caption(item) for item in value]
        joined = " ".join(part for part in parts if part)
        return joined.strip() or None
    text = str(value).strip()
    return text or None


def _extract_page_number(element: Any) -> int | None:
    prov = getattr(element, "prov", None)
    if isinstance(prov, (list, tuple)):
        for item in prov:
            page_no = getattr(item, "page_no", None)
            if isinstance(page_no, int) and page_no > 0:
                return page_no
    page_no = getattr(element, "page_no", None)
    if isinstance(page_no, int) and page_no > 0:
        return page_no
    return None


def _extract_bbox(element: Any) -> list[float] | None:
    prov = getattr(element, "prov", None)
    if not isinstance(prov, (list, tuple)):
        return None
    for item in prov:
        bbox = getattr(item, "bbox", None)
        if bbox is None:
            continue
        left = getattr(bbox, "l", None)
        top = getattr(bbox, "t", None)
        right = getattr(bbox, "r", None)
        bottom = getattr(bbox, "b", None)
        if all(isinstance(value, (int, float)) for value in (left, top, right, bottom)):
            return [float(left), float(top), float(right), float(bottom)]
    return None


def _classify_figure(image: Any, caption: str | None) -> str | None:
    """Lightweight heuristic classification of figure type for downstream ranking."""
    width = getattr(image, "width", 0) or 0
    height = getattr(image, "height", 0) or 0
    aspect = width / max(height, 1)

    cap = (caption or "").lower()
    if any(kw in cap for kw in ("forest plot", "funnel plot", "meta-analysis")):
        return "forest_plot"
    if any(kw in cap for kw in ("kaplan", "survival", "km curve")):
        return "survival_plot"
    if any(kw in cap for kw in ("flowchart", "flow chart", "consort", "prisma", "study selection")):
        return "flowchart"
    if any(kw in cap for kw in ("table", "characteristics", "demographics")):
        return "table"
    if any(kw in cap for kw in ("ct ", "mri ", "x-ray", "xray", "radiograph", "ultrasound", "echocardiogram")):
        return "medical_image"
    if any(kw in cap for kw in ("histolog", "patholog", "microscop", "stain", "biopsy")):
        return "histology"
    if any(kw in cap for kw in ("bar chart", "bar graph", "histogram")):
        return "chart"
    if any(kw in cap for kw in ("scatter", "correlation", "regression")):
        return "chart"
    if any(kw in cap for kw in ("mechanism", "pathway", "schematic", "diagram")):
        return "schematic"

    # Aspect ratio heuristic: very wide images are likely charts/plots
    if aspect > 2.0:
        return "chart"
    if width < 120 and height < 120:
        return "icon"

    return None


def _extract_tables(result: Any) -> dict[int, list[dict[str, Any]]]:
    """Extract structured tables from the document and group by page number."""
    tables_by_page: dict[int, list[dict[str, Any]]] = {}
    try:
        from docling_core.types.doc import TableItem
    except ImportError:
        return tables_by_page

    table_counter = 0
    for element, _level in result.document.iterate_items():
        if not isinstance(element, TableItem):
            continue
        table_counter += 1
        page_no = _extract_page_number(element) or 1

        caption = (
            _normalize_caption(getattr(element, "caption_text", None))
            or _normalize_caption(getattr(element, "captions", None))
        )

        md_table = ""
        try:
            export_fn = getattr(element, "export_to_markdown", None)
            if callable(export_fn):
                md_table = export_fn()
        except Exception:
            pass

        if not md_table:
            text = _normalize_caption(getattr(element, "text", None)) or ""
            md_table = text

        if not md_table:
            continue

        tables_by_page.setdefault(page_no, []).append({
            "label": _normalize_caption(getattr(element, "label", None)) or f"Table {table_counter}",
            "caption": caption,
            "markdown": md_table.strip(),
            "pageNumber": page_no,
        })

    return tables_by_page


def _convert_pdf_with_docling(path: Path, options: ParseOptions) -> dict[str, Any]:
    try:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter
        from docling.document_converter import PdfFormatOption
        from docling.utils.export import generate_multimodal_pages
        from docling_core.types.doc import PictureItem
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="docling package not installed in this image",
        ) from exc

    pipeline_options = PdfPipelineOptions()
    pipeline_options.images_scale = 2.0
    pipeline_options.generate_page_images = bool(options.extractPreview)
    pipeline_options.generate_picture_images = bool(options.extractFigures)
    # Enable OCR for scanned / image-heavy pages
    try:
        pipeline_options.do_ocr = True
    except Exception:
        pass

    converter = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
    )
    result = converter.convert(str(path))
    markdown = result.document.export_to_markdown()
    meta: dict[str, Any] = {
        "provider": "docling-python",
        "markdownChars": len(markdown),
        "pageCount": len(getattr(result.document, "pages", {}) or {}),
    }

    page_units: dict[int, dict[str, Any]] = {}
    pages = getattr(result.document, "pages", {}) or {}
    for page_no, page in pages.items():
        normalized_page_no = int(getattr(page, "page_no", page_no) or page_no)
        preview = None
        page_image = getattr(page, "image", None)
        pil_image = getattr(page_image, "pil_image", None)
        if options.extractPreview and pil_image is not None:
            preview = {
                "assetType": "preview",
                "label": f"Page {normalized_page_no}",
                "mimeType": "image/png",
                "dataBase64": _pil_image_to_base64(pil_image),
                "width": getattr(pil_image, "width", None),
                "height": getattr(pil_image, "height", None),
                "pageNumber": normalized_page_no,
            }
        page_units[normalized_page_no] = {
            "unitType": "page",
            "unitNumber": normalized_page_no,
            "title": f"Page {normalized_page_no}",
            "extractedText": "",
            "figures": [],
            "tables": [],
            "preview": preview,
            "ocrStatus": "pending",
        }

    for content_text, content_md, _content_dt, _page_cells, _page_segments, page in generate_multimodal_pages(result):
        page_no = int(getattr(page, "page_no", 0) or 0)
        if page_no <= 0:
            continue
        page_unit = page_units.setdefault(
            page_no,
            {
                "unitType": "page",
                "unitNumber": page_no,
                "title": f"Page {page_no}",
                "extractedText": "",
                "figures": [],
                "tables": [],
                "preview": None,
                "ocrStatus": "pending",
            },
        )
        # Prefer markdown output (preserves structure) over plain text
        extracted_text = (content_md or content_text or "").strip()
        page_unit["extractedText"] = extracted_text
        page_unit["ocrStatus"] = "completed" if extracted_text else "pending"

    # Extract figures
    figure_counter = 0
    if options.extractFigures:
        for element, _level in result.document.iterate_items():
            if not isinstance(element, PictureItem):
                continue
            try:
                image = element.get_image(result.document)
            except Exception:
                continue
            if image is None:
                continue
            page_no = _extract_page_number(element) or 1
            page_unit = page_units.setdefault(
                page_no,
                {
                    "unitType": "page",
                    "unitNumber": page_no,
                    "title": f"Page {page_no}",
                    "extractedText": "",
                    "figures": [],
                    "tables": [],
                    "preview": None,
                    "ocrStatus": "pending",
                },
            )
            if len(page_unit["figures"]) >= options.maxFiguresPerUnit:
                continue
            figure_counter += 1
            caption = (
                _normalize_caption(getattr(element, "caption_text", None))
                or _normalize_caption(getattr(element, "captions", None))
                or _normalize_caption(getattr(element, "text", None))
            )
            bbox = _extract_bbox(element)
            figure: dict[str, Any] = {
                "assetType": "figure",
                "label": _normalize_caption(getattr(element, "label", None)) or f"Figure {figure_counter}",
                "caption": caption,
                "mimeType": "image/png",
                "dataBase64": _pil_image_to_base64(image),
                "width": getattr(image, "width", None),
                "height": getattr(image, "height", None),
                "pageNumber": page_no,
            }
            if bbox is not None:
                figure["boundingBox"] = bbox

            # Classify the figure type based on image content heuristics
            classification = _classify_figure(image, caption)
            if classification:
                figure["classification"] = classification

            page_unit["figures"].append(figure)

    # Extract structured tables
    tables_by_page = _extract_tables(result)
    for page_no, tables in tables_by_page.items():
        page_unit = page_units.get(page_no)
        if page_unit:
            page_unit["tables"] = tables
            # Append table markdown to extracted text so it's searchable
            for table in tables:
                table_block = f"\n\n{table.get('label', 'Table')}"
                if table.get("caption"):
                    table_block += f": {table['caption']}"
                table_block += f"\n{table['markdown']}"
                page_unit["extractedText"] += table_block

    meta["doclingFigureCount"] = sum(len(unit["figures"]) for unit in page_units.values())
    meta["doclingTableCount"] = sum(len(unit.get("tables", [])) for unit in page_units.values())
    units = [page_units[key] for key in sorted(page_units.keys())]
    if units:
        return {"kind": _kind_from_suffix(path), "metadata": meta, "sourceUnits": units}

    return {
        "kind": "pdf",
        "metadata": meta,
        "sourceUnits": [
            {
                "unitType": "page",
                "unitNumber": 1,
                "title": path.stem or "Document",
                "extractedText": markdown,
                "figures": [],
                "tables": [],
                "preview": None,
                "ocrStatus": "completed" if markdown.strip() else "pending",
            }
        ],
    }


def _convert_with_docling(path: Path, options: ParseOptions) -> dict[str, Any]:
    if path.suffix.lower() == ".pdf":
        return _convert_pdf_with_docling(path, options)

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
    return {"kind": _kind_from_suffix(path), "metadata": meta, "sourceUnits": units}


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

    data: bytes | None = None
    if body.fileUrl and body.fileUrl.strip():
        try:
            with urllib.request.urlopen(body.fileUrl.strip(), timeout=60) as response:
                data = response.read()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="invalid or unreachable fileUrl") from exc
    elif body.contentBase64 and body.contentBase64.strip():
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
        return _convert_with_docling(tmp_path, body.options or ParseOptions())
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
