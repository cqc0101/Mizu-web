"""Build versioned exam packs from the pinned ECDICT CSV."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re

from cet_appendix import read_cet_appendix

ROOT = Path(__file__).resolve().parents[1]
REVISION = "39cfb9672c0906b63569e0453c2e6abfb9ab182a"
SOURCE_SHA256 = "d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc"
TITLES = {"cet4": "四级", "cet6": "六级", "ielts": "雅思", "toefl": "托福", "gre": "GRE"}
SOURCE = "https://github.com/skywind3000/ECDICT"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("csv", type=Path, help="Path to the pinned ecdict.csv")
parser.add_argument("--cet-pdf", type=Path, required=True, help="Path to the official 2016 CET syllabus PDF")
args = parser.parse_args()
with args.csv.open("rb") as file:
    if hashlib.file_digest(file, "sha256").hexdigest() != SOURCE_SHA256:
        raise SystemExit("Source checksum differs from the pinned ECDICT revision.")

appendix = read_cet_appendix(args.cet_pdf)
packs = {tag: {} for tag in TITLES}
tagged = {tag: set() for tag in TITLES}
with args.csv.open(encoding="utf-8-sig", newline="") as file:
    for row in csv.DictReader(file):
        word = row["word"].strip()
        if not word:
            continue
        meaning = row["translation"].strip().replace("\\n", "\n")
        key = word.casefold().replace("’", "'")
        direct = packs.keys() & set(row["tag"].split())
        selected = direct | {tag for tag, words in appendix.items() if meaning and key in words}
        for tag in selected:
            if tag in direct:
                tagged[tag].add(key)
            current = packs[tag].get(key)
            if current is None or (not current[1] and meaning):
                packs[tag][key] = (word, meaning)

output = ROOT / "public/wordpacks/data"
output.mkdir(parents=True, exist_ok=True)
manifest = {"source": SOURCE, "revision": REVISION, "packs": []}
manifest_path = ROOT / "src/wordpacks.json"
previous = json.loads(manifest_path.read_text(encoding="utf-8"))["packs"] if manifest_path.is_file() else []
for tag, entries in packs.items():
    pairs = [row for _, row in sorted(entries.items())]
    if not pairs:
        raise ValueError(f"Dictionary has no entries tagged {tag}")
    payload = json.dumps(pairs, ensure_ascii=False, separators=(",", ":")).encode()
    digest = hashlib.sha256(payload).hexdigest()[:12]
    file = f"{tag}-{digest}.json"
    (output / file).write_bytes(payload)
    book = {
        "id": tag, "name": TITLES[tag], "path": f"wordpacks/data/{file}", "count": len(pairs),
        "translated": sum(bool(meaning) for _, meaning in pairs), "tagged": len(tagged[tag])
    }
    if tag in appendix:
        book["appendixCount"] = len(appendix[tag])
        book["appendixMatched"] = sum(bool(entries[key][1]) for key in appendix[tag] & entries.keys())
    manifest["packs"].append(book)

manifest_path.write_bytes(
    (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
)
current = {book["path"] for book in manifest["packs"]}
for book in previous:
    path = book["path"]
    if path not in current and re.fullmatch(r"wordpacks/data/(cet4|cet6|ielts|toefl|gre)-[0-9a-f]{12}\.json", path):
        (ROOT / "public" / path).unlink(missing_ok=True)
print(json.dumps(manifest, ensure_ascii=False))
