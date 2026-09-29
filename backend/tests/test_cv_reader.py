import io

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from backend.services import cv_reader
from backend.services.cv_reader import (
    MAX_CV_BYTES,
    MAX_CV_PAGES,
    CvError,
    clean_text,
    read_cv,
)


def make_pdf(*pages: str, password: str | None = None) -> bytes:
    # a real PDF built in memory, one line of text per page ("" = a page without text, like a scan)
    writer = PdfWriter()
    for text in pages:
        page = writer.add_blank_page(612, 792)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        content = DecodedStreamObject()
        content.set_data(f"BT /F1 12 Tf 72 712 Td ({text}) Tj ET".encode())
        page.replace_contents(content)
    if password:
        writer.encrypt(password)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def test_reads_the_text_of_every_page():
    assert read_cv(make_pdf("Jane Doe, Python developer", "Projects")) == (
        "Jane Doe, Python developer\nProjects"
    )


def test_turns_ligatures_back_into_letters():
    # "\ufb01" is the single "ﬁ" character many fonts use for "fi". Tested on clean_text:
    # make_pdf's built-in font can't hold it (the sample CVs cover real fonts)
    assert clean_text("lena.\ufb01scher@example.com") == "lena.fischer@example.com"


def test_collapses_repeated_spaces():
    assert read_cv(make_pdf("6 years of   experience")) == "6 years of experience"


def test_opens_a_pdf_with_an_empty_password():
    assert read_cv(make_pdf("Jane Doe", password="")) == "Jane Doe"


def test_cuts_very_long_text(monkeypatch):
    monkeypatch.setattr(cv_reader, "MAX_CV_CHARS", 4)
    assert read_cv(make_pdf("Jane Doe")) == "Jane"


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"Jane Doe, Python developer", "doesn't look like a PDF"),
        # an image renamed to .pdf
        (b"\x89PNG\r\n\x1a\n...", "doesn't look like a PDF"),
        (b"%PDF-" + b"0" * MAX_CV_BYTES, "too big"),
        (make_pdf(*["page"] * (MAX_CV_PAGES + 1)), "more than 5 pages"),
        (make_pdf("Jane Doe", password="secret"), "password-protected"),
        (make_pdf(""), "Is it a scan?"),
        (b"%PDF-1.7 this is not really a PDF", "couldn't read"),
    ],
)
def test_rejects_unusable_uploads(data, message):
    with pytest.raises(CvError, match=message):
        read_cv(data)
