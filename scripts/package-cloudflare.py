"""Zip the built site for Cloudflare Pages dashboard Direct Upload."""
from pathlib import Path
from sys import argv
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
output = Path(argv[1]).resolve() if len(argv) == 2 else root / "artifacts/Mizu-Web-Cloudflare-Pages.zip"
for required in ("index.html", "games.html", "_headers", "firestore.rules", "wordpacks/LICENSE-ECDICT.txt"):
    if not (dist / required).is_file():
        raise SystemExit(f"Missing {required}. Run npm run build first.")
files = [file for file in sorted(dist.rglob("*")) if file.is_file()]
if len(files) > 1_000 or any(file.stat().st_size > 25 * 1024 * 1024 for file in files):
    raise SystemExit("Output exceeds the Cloudflare Pages dashboard upload limits.")
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        archive.write(file, file.relative_to(dist).as_posix())
with ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise SystemExit("Cloudflare ZIP integrity check failed.")
print(f"{output} ({len(files)} files, {output.stat().st_size:,} bytes)")
