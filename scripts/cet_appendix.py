"""Read headword spellings from the published CET syllabus, pages 21 to 149."""
import hashlib
import re
import unicodedata

PDF_SHA256 = "9166d3c03b7bc43abd9d9df91bd2ef8085b4419286f1e5ca100dea68f3cfd1f1"
LATIN = "A-Za-zÀ-ÖØ-öø-ÿ"
WORD = re.compile(rf"[{LATIN}][{LATIN}'’\-]*\Z")
PART = re.compile(rf"[{LATIN}('’][{LATIN}'’()\-/.]*\Z")
JOINED = {"accordingto": "according to", "oughtto": "ought to", "owingto": "owing to"}


def forms(token):
    if token == "coup(d'état)":
        return ["coup", "coup d'état"]
    values = []
    base = ""
    for part in token.split("/"):
        part = part.removesuffix(".")
        if part.startswith("G") and base and part[1:].islower():
            # The PDF uses a private hyphen encoding for a replacement suffix.
            suffix = part[1:]
            part = base[:-len(suffix)] + suffix
        part = re.sub(r"(?<=[a-z])G(?=[a-z])", "-", part)
        if not base:
            base = part
        if "(" in part:
            if not re.fullmatch(rf"(?:[{LATIN}'’-]|\([{LATIN}]+\))+", part):
                continue
            variants = [re.sub(r"\([A-Za-z]+\)", "", part), part.replace("(", "").replace(")", "")]
        else:
            variants = [part]
        values.extend(JOINED.get(word.casefold(), word.casefold().replace("’", "'"))
                      for word in variants if WORD.fullmatch(word))
    return values


def read_cet_appendix(path):
    with path.open("rb") as file:
        if hashlib.file_digest(file, "sha256").hexdigest() != PDF_SHA256:
            raise ValueError("CET syllabus checksum differs from the published 2016 edition.")
    import pymupdf

    level4 = set()
    level6 = set()
    with pymupdf.open(path) as document:
        for page in document.pages(20, 149):
            for line in headword_lines(page):
                starred = line.startswith("★")
                parts = line.lstrip("★ ").replace("\U001001b3", "'").split()
                if not parts or any(not PART.fullmatch(part) for part in parts):
                    continue
                words = {word for part in parts for word in forms(part)}
                level6.update(words)
                if not starred:
                    level4.update(words)
    if not {"abandon", "zoology"} <= level4 or "zoom" not in level6:
        raise ValueError("CET syllabus markers were missing during extraction.")
    return {"cet4": level4, "cet6": level6}


def headword_lines(page):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = line["spans"]
            first_word = next((span for span in spans if span["font"] == "E-B4"), None)
            # The official layout lists derivative forms in adjacent columns.
            if first_word is not None and 76 <= first_word["bbox"][0] <= 90:
                yield unicodedata.normalize("NFKC", "".join(span["text"] for span in spans)).strip()
