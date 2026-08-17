"""Extract {camera_id, address} pairs from the CCTV PDF via Gemini vision OCR,
then geocode each address to WGS84 lat/lng with the Google Geocoding API.

The PDF's embedded font has no usable ToUnicode CMap, so pdfplumber/PyMuPDF
text extraction returns garbage for the Chinese address column (camera IDs,
being ASCII, extract fine). Rendering each page to an image and reading it
back with Gemini vision sidesteps that — the text is vector-rendered, not a
scan, so OCR accuracy is high.

Usage:
    cd backend
    python scripts/extract_cctv_pdf.py --pages 1-3          # pilot run
    python scripts/extract_cctv_pdf.py --pages all          # full 336 pages
"""
import argparse
import base64
import json
import os
import sys
import time

import pymupdf
from google import genai

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import settings  # noqa: E402

PDF_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "上傳-115上本局錄影監視統設置區位.pdf")
OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "cctv_extracted.json")
MODEL = "gemini-3.7-flash"

PROMPT = (
    "這是台北市監視器安裝清單的一頁，兩欄：攝影機編號、安裝地址。"
    "把每一列轉成 JSON 陣列，每筆物件有 id 和 address 兩個欄位，address 保留完整原文。"
    "只輸出 JSON 陣列，不要其他文字。"
)

RESPONSE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"id": {"type": "string"}, "address": {"type": "string"}},
        "required": ["id", "address"],
    },
}


def extract_page(client: genai.Client, page: pymupdf.Page) -> list[dict]:
    pix = page.get_pixmap(dpi=200)
    b64_png = base64.b64encode(pix.tobytes("png")).decode("ascii")
    interaction = client.interactions.create(
        model=MODEL,
        input=[
            {
                "type": "user_input",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image", "data": b64_png, "mime_type": "image/png"},
                ],
            }
        ],
        response_format={"type": "text", "mime_type": "application/json", "schema": RESPONSE_SCHEMA},
        timeout=60,  # a hung call with no bound stalls the whole 336-page run
    )
    return json.loads(interaction.output_text)


def parse_pages_arg(arg: str, total: int) -> range:
    if arg == "all":
        return range(total)
    start, end = arg.split("-") if "-" in arg else (arg, arg)
    return range(int(start) - 1, int(end))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", default="1-2", help='e.g. "1-3" or "all"')
    args = parser.parse_args()

    client = genai.Client(api_key=settings.gemini_api_key)
    doc = pymupdf.open(PDF_PATH)
    page_range = parse_pages_arg(args.pages, doc.page_count)

    results: list[dict] = []
    for i in page_range:
        for attempt in range(3):
            try:
                rows = extract_page(client, doc[i])
                results.extend(rows)
                print(f"page {i + 1}: {len(rows)} 筆", flush=True)
                break
            except Exception as e:  # noqa: BLE001
                print(f"page {i + 1} 失敗 (attempt {attempt + 1}): {e}", flush=True)
                time.sleep(2)
        else:
            print(f"page {i + 1}: 放棄，跳過", flush=True)

        # 每頁都寫一次，中途失敗也不會全部白費，也讓進度即時可查
        with open(OUT_PATH, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n共 {len(results)} 筆，輸出至 {OUT_PATH}", flush=True)


if __name__ == "__main__":
    main()
