"""Build the sample CV PDFs from the HTML files next to this script, with headless Chrome.

    uv run python scripts/sample_cvs/make_sample_cvs.py

Output: scripts/out/cvs/*.pdf (git-ignored, not committed). All people are fictional.
Chrome is used because it embeds real fonts, like the PDFs CV builders and Word produce.
"""

import os
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent / "out" / "cvs"
CHROME = os.environ.get(
    "CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
)


def chrome(*args: str) -> None:
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer", *args],
        check=True,
        capture_output=True,
        timeout=60,
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # 07 is a "scan": first a screenshot of a CV, then a PDF that only holds that picture
    chrome(
        f"--screenshot={OUT / '07_scan.png'}",
        "--window-size=794,1123",  # A4 at 96 dpi
        "--force-device-scale-factor=2",  # sharper, like a 200 dpi scan
        "--hide-scrollbars",
        (HERE / "07_scan_source.html").as_uri(),
    )

    for html in sorted(HERE.glob("0*.html")):
        if html.stem == "07_scan_source":
            continue
        pdf = OUT / f"{html.stem}.pdf"
        chrome(f"--print-to-pdf={pdf}", html.as_uri())
        print(f"{pdf.name:28} {pdf.stat().st_size // 1024:5} KB")


if __name__ == "__main__":
    main()
