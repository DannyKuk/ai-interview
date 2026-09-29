"""Run the CV reader on the sample PDFs and show what comes out.

uv run python scripts/sample_cvs/make_sample_cvs.py   # build the PDFs first
uv run python scripts/try_cvs.py                      # short result per CV
uv run python scripts/try_cvs.py --full 02            # whole text of the CVs matching "02"

"""

import argparse
import asyncio
import time
from pathlib import Path

from backend.guard.jev import check_cv
from backend.services.cv_reader import CvError, read_cv

CVS = Path(__file__).parent / "out" / "cvs"
PREVIEW_LINES = 4


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "match", nargs="?", default="", help="only CVs whose name has this"
    )
    parser.add_argument("--full", action="store_true", help="print the whole text")
    args = parser.parse_args()

    pdfs = sorted(p for p in CVS.glob("*.pdf") if args.match in p.name)
    if not pdfs:
        print(f"No PDFs in {CVS}. Run scripts/sample_cvs/make_sample_cvs.py first.")
        return

    for pdf in pdfs:
        print(f"\n=== {pdf.name} ({pdf.stat().st_size // 1024} KB)")
        start = time.perf_counter()
        try:
            text = read_cv(pdf.read_bytes())
        except CvError as error:
            print(f"rejected: {error}")
            continue
        ms = (time.perf_counter() - start) * 1000
        lines = [line for line in text.splitlines() if line.strip()]
        print(f"ok: {len(text)} chars, {len(lines)} lines, {ms:.0f} ms")
        shown = lines if args.full else lines[:PREVIEW_LINES] + ["…"] + lines[-2:]
        for line in shown:
            print(f"  | {line}")

        start = time.perf_counter()
        verdict = asyncio.run(check_cv(text))
        ms = (time.perf_counter() - start) * 1000
        print(
            f"guard: {verdict.blocked or 'passed'} "
            f"(P(injection) {verdict.injection}, P(is_cv) {verdict.is_cv}, {ms:.0f} ms)"
        )


if __name__ == "__main__":
    main()
