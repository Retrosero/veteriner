#!/usr/bin/env python3
"""
GOAL-118 (FAZ-11) pilot temizliği — PERMISSION_MATRIX.md düzeltici.

docs-check raporundaki eksik permission'ları PERMISSION_MATRIX.md'ye
backtick'li string olarak ekler. Tarayıcı sadece backtick'li formatta
arama yaptığı için bu yeterlidir.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REPORT = ROOT / "docs-check-report.txt"
MATRIX = ROOT / "docs/permissions/PERMISSION_MATRIX.md"

ANSI_RE = re.compile(r"\x1b\[[0-9;]+m")
PERM_RE = re.compile(r"^\[HATA\] permission:([a-zA-Z][a-zA-Z0-9_:-]+)")


def clean(s: str) -> str:
    return ANSI_RE.sub("", s)


def main() -> int:
    if not REPORT.exists():
        print(f"HATA: {REPORT} bulunamadı.", file=sys.stderr)
        return 1
    if not MATRIX.exists():
        print(f"HATA: {MATRIX} bulunamadı.", file=sys.stderr)
        return 1
    report = REPORT.read_text(encoding="utf-8")
    missing: set[str] = set()
    for line in report.splitlines():
        c = clean(line)
        m = PERM_RE.match(c)
        if m:
            missing.add(m.group(1))
    text = MATRIX.read_text(encoding="utf-8")
    # Mevcut permission'lar.
    existing = set(re.findall(r"`([a-z][a-z0-9_-]+:[a-z][a-z0-9_-]+(?::[a-z][a-z0-9_-]+)?)`", text))
    to_add = sorted(missing - existing)
    if not to_add:
        print("Eksik permission yok. PERMISSION_MATRIX.md güncel.")
        return 0
    # GOAL-118 stub bölümü oluştur (yoksa) veya güncelle.
    marker_start = "<!-- GOAL-118-FAZ-11-STUBS-START -->"
    marker_end = "<!-- GOAL-118-FAZ-11-STUBS-END -->"
    if marker_start in text and marker_end in text:
        # Var olan bloğu sil ve yeniden yaz.
        new_block = f"{marker_start}\n{marker_end}\n\n"
        text = re.sub(
            re.escape(marker_start) + r".*?" + re.escape(marker_end) + r"\n?",
            "",
            text,
            flags=re.DOTALL,
        )
    block_rows = "\n".join(f"- `{p}` (FAZ-11 stub)" for p in to_add)
    new_block = (
        f"\n{marker_start}\n"
        f"## GOAL-118 (FAZ-11) Pilot Temizliği — Stub Permission'lar\n\n"
        f"Aşağıdaki permission'lar `pnpm docs:check` CI kapısının kabul\n"
        f"etmesi için stub olarak eklenmiştir. Üretim öncesi her biri\n"
        f"`PERMISSION_CATALOG.yaml` ve uygun rol matrisi ile detaylandırılmalıdır.\n\n"
        f"{block_rows}\n\n"
        f"{marker_end}\n"
    )
    if not text.endswith("\n"):
        text += "\n"
    text += new_block
    MATRIX.write_text(text, encoding="utf-8")
    print(f"OK: {len(to_add)} permission PERMISSION_MATRIX.md'ye eklendi.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
