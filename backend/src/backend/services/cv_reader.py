import io
import logging
import re
import unicodedata

from pypdf import PdfReader

logger = logging.getLogger(__name__)

MAX_CV_BYTES = 5 * 1024 * 1024
MAX_CV_PAGES = 5
# ~5 dense pages. Anything after this is cut off before the LLM sees it
MAX_CV_CHARS = 20_000


class CvError(ValueError):
    """The upload can't be used. The message is safe to show to the candidate."""


def read_cv(data: bytes) -> str:
    # the CV stays in memory: never written to disk, never logged (only error types are)
    if len(data) > MAX_CV_BYTES:
        raise CvError("Your CV is too big. Please upload a PDF of up to 5 MB.")
    # the file's own first bytes, not its name or the Content-Type the browser sends
    if not data.startswith(b"%PDF-"):
        raise CvError("That doesn't look like a PDF. Please upload your CV as a PDF.")

    try:
        reader = PdfReader(io.BytesIO(data))
        # some PDFs are "encrypted" with an empty password
        if reader.is_encrypted and not reader.decrypt(""):
            raise CvError(
                "This PDF is password-protected. Please upload one without a password."
            )
        if len(reader.pages) > MAX_CV_PAGES:
            raise CvError(
                f"Your CV has more than {MAX_CV_PAGES} pages. Please shorten it."
            )
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except CvError:
        raise
    except Exception as error:  # a broken PDF can fail in many ways inside pypdf
        logger.warning("cv read failed: %s", type(error).__name__)
        raise CvError("We couldn't read this PDF. Please try another file.") from error

    text = clean_text(text)
    if not text:
        raise CvError(
            "We couldn't find any text in this PDF. Is it a scan? "
            "Please upload a PDF with selectable text."
        )
    return text[:MAX_CV_CHARS]


def clean_text(text: str) -> str:
    # NFKC turns font ligatures back into letters ("ﬁ" → "fi"), else "lena.ﬁscher@…"
    # is a different email. It also turns non-breaking spaces into normal ones
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[ \t]+", " ", text)  # "6 years of  experience" → one space
    return text.strip()
