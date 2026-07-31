#!/usr/bin/env python3
"""
GOAL-118 (FAZ-11) pilot temizliği.

docs-check raporundaki eksik alanları okur, mevcut fields.yaml'dan
var olan alanları çıkarır, eksik olanları stub formatında ekler.

Kullanım:
    python tools/docs-check/scripts/bulk-add-fields.py

Çıktı: docs/fields/fields.yaml güncellenir.
"""

from __future__ import annotations

import re
import sys
from collections import OrderedDict
from pathlib import Path

# Repo kökü (scriptin bulunduğu yerin 3 üstü).
ROOT = Path(__file__).resolve().parents[3]
REPORT_FILE = ROOT / "docs-check-report.txt"
FIELDS_FILE = ROOT / "docs/fields/fields.yaml"

# VET- formatı hata kodu kalıbı (alan hatası değil).
HATA_KODU_RE = re.compile(r"^\x1b\[31m\[HATA\]\x1b\[0m field:([a-zA-Z0-9_.]+)\b")
# Field id kalıbı: <entity>.<field> (entity tekil isim).
FIELD_ID_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*$")

# Türkçe/İngilizce isimlendirme için field name → okunabilir form.
CAMEL_SPLIT_RE = re.compile(r"(?<!^)(?=[A-Z])")


def humanize(name: str) -> str:
    """camelCase / snake_case → Title Case okunabilir form."""
    s = name.replace("_", " ")
    s = CAMEL_SPLIT_RE.sub(" ", s)
    return s.strip().lower()


def infer_type(name: str) -> str:
    """Alan adından tip çıkarımı (heuristic)."""
    n = name.lower()
    if n in {"id", "tenantid", "branchid", "ownerid", "patientid", "userid"}:
        return "uuid"
    if n.endswith("id") or n.endswith("idlist") or n.endswith("ids"):
        return "uuid"
    if n.endswith("at") or n.endswith("date") and "due" not in n and "birth" not in n:
        return "datetime"
    if n.endswith("date") or n.endswith("duedate") or n.endswith("birthdate"):
        return "date"
    if n.endswith("amount") or n.endswith("price") or n.endswith("total") or n.endswith("balance"):
        return "decimal"
    if n.startswith("is") or n.startswith("has") or n.startswith("can") or n.startswith("should") or n == "enabled" or n == "active" or n == "reversed" or n == "include" or n == "cancelled" or n == "available" or n == "voided" or n == "invert" or n == "suppress" or n == "global" or n == "composed":
        return "boolean"
    if n.endswith("count") or n.endswith("quantity") or n.endswith("qty") or n.endswith("number") or n.endswith("step") or n.endswith("limit") or n.endswith("offset"):
        return "number"
    if n.endswith("code") or n.endswith("type") or n.endswith("status") or n.endswith("mode") or n.endswith("severity") or n.endswith("level") or n.endswith("channel") or n.endswith("locale") or n.endswith("country") or n.endswith("currency"):
        return "enum"
    if n.endswith("json") or n.endswith("metadata") or n.endswith("details") or n.endswith("context") or n.endswith("payload") or n.endswith("config") or n.endswith("settings") or n.endswith("filters"):
        return "json"
    if n.endswith("list") or n.endswith("items") or n.endswith("lines") or n.endswith("entries"):
        return "array"
    return "string"


def infer_required(name: str) -> bool:
    """Tipik zorunlu alanlar."""
    n = name.lower()
    if n == "id":
        return True
    if n in {"tenantid", "branchid", "createdat", "updatedat"}:
        return False
    if n.endswith("id") and not n.startswith("optional"):
        return True
    if n in {"type", "status"}:
        return True
    return False


def infer_pii(name: str) -> bool:
    """PII kapsamındaki alanlar (maskeleme uygulanır)."""
    n = name.lower()
    pii_keywords = [
        "email", "phone", "name", "surname", "taxid", "tcno", "tckimlik",
        "address", "iban", "passport", "idcard", "license", "ip", "agent",
        "useragent", "deviceid", "firstname", "lastname", "fullname",
        "displayname", "birthdate", "birthyear", "national",
    ]
    return any(k in n for k in pii_keywords)


def build_stub(entity: str, field: str) -> str:
    """Yeni alan için stub YAML girdisi."""
    name_h = humanize(field)
    type_ = infer_type(field)
    required = infer_required(field)
    pii = infer_pii(field)
    desc_tr = f"{entity.capitalize()} {name_h} alanı."
    desc_en = f"{entity.capitalize()} {name_h} field."
    if type_ == "uuid":
        desc_tr = f"{entity.capitalize()} {name_h} FK bağlantısı."
        desc_en = f"{entity.capitalize()} {name_h} FK reference."
    elif type_ == "datetime":
        desc_tr = f"{entity.capitalize()} {name_h} zaman damgası."
        desc_en = f"{entity.capitalize()} {name_h} timestamp."
    elif type_ == "date":
        desc_tr = f"{entity.capitalize()} {name_h} tarih bilgisi."
        desc_en = f"{entity.capitalize()} {name_h} date."
    elif type_ == "decimal":
        desc_tr = f"{entity.capitalize()} {name_h} parasal/nümerik değer."
        desc_en = f"{entity.capitalize()} {name_h} monetary/numeric value."
    elif type_ == "boolean":
        desc_tr = f"{entity.capitalize()} {name_h} boolean bayrağı."
        desc_en = f"{entity.capitalize()} {name_h} boolean flag."
    pii_yes = "true" if pii else "false"
    return (
        f"      - id: {entity}.{field}\n"
        f"        name: {field}\n"
        f"        type: {type_}\n"
        f"        required: {'true' if required else 'false'}\n"
        f"        unique: false\n"
        f"        pii: {pii_yes}\n"
        f"        description_tr: \"{desc_tr}\"\n"
        f"        description_en: \"{desc_en}\"\n"
        f"        validation: \"auto-generated; refine in follow-up\"\n"
        f"        version: \"1.0.0\"\n"
    )


def parse_existing_field_ids(text: str) -> set[str]:
    """Mevcut fields.yaml içindeki tüm <entity>.<field> id'lerini döner."""
    ids: set[str] = set()
    # Hem `- id: foo.bar` formatını hem de `chunk_id: foo.bar` formatını yakala.
    for m in re.finditer(r"^\s*-?\s*id:\s*([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*)", text, re.M):
        ids.add(m.group(1))
    return ids


def parse_missing_field_ids(report: str) -> list[str]:
    """Rapordan eksik field id'lerini toplar (unique, sıralı)."""
    seen: set[str] = set()
    out: list[str] = []
    for line in report.splitlines():
        # Renk kodu temizle.
        clean = re.sub(r"\x1b\[[0-9;]+m", "", line)
        m = re.match(r"^\[HATA\] field:([a-zA-Z0-9_.]+)", clean)
        if not m:
            continue
        fid = m.group(1)
        if not FIELD_ID_RE.match(fid):
            continue
        if fid in seen:
            continue
        seen.add(fid)
        out.append(fid)
    return out


def main() -> int:
    if not REPORT_FILE.exists():
        print(f"HATA: {REPORT_FILE} bulunamadı. Önce `pnpm docs:check` çalıştırın.", file=sys.stderr)
        return 1
    if not FIELDS_FILE.exists():
        print(f"HATA: {FIELDS_FILE} bulunamadı.", file=sys.stderr)
        return 1

    report = REPORT_FILE.read_text(encoding="utf-8")
    existing_text = FIELDS_FILE.read_text(encoding="utf-8")

    existing_ids = parse_existing_field_ids(existing_text)
    missing_ids = parse_missing_field_ids(report)

    to_add = [fid for fid in missing_ids if fid not in existing_ids]
    if not to_add:
        print("Eksik alan yok. fields.yaml güncel.")
        return 0

    # Entity'lere göre grupla (entity.field → entity).
    by_entity: "OrderedDict[str, list[str]]" = OrderedDict()
    for fid in to_add:
        ent, _, field = fid.partition(".")
        by_entity.setdefault(ent, []).append(field)

    # Yeni entity bölümleri oluştur.
    # Her entity kendi field'larıyla birlikte yazılır (YAML yapısı
    # için zorunlu: `fields:` altındaki liste o entity'ye aittir).
    new_blocks: list[str] = []
    existing_field_stubs: list[str] = []  # mevcut entity'lere eklenecek
    for ent, fields in by_entity.items():
        # Bu entity zaten var mı?
        ent_re = re.compile(rf"^\s*-\s*id:\s*{re.escape(ent)}\s*$", re.M)
        ent_exists = ent_re.search(existing_text) is not None
        if ent_exists:
            # Mevcut entity: field stub'larını AUTO-GENERATED bloğunda
            # topla; sonra mevcut entity'nin `fields:` satırından
            # hemen sonra enjekte et.
            existing_field_stubs.append((ent, fields))
            continue
        ent_block = (
            f"  - id: {ent}\n"
            f"    description_tr: \"{ent.capitalize()} varlığı (FAZ-11 bulk add).\"\n"
            f"    description_en: \"{ent.capitalize()} entity (FAZ-11 bulk add).\"\n"
            f"    pii: false\n"
            f"    tenant_scoped: true\n"
            f"    fields:\n"
        )
        field_stubs = "".join(build_stub(ent, field) for field in fields)
        new_blocks.append(ent_block + field_stubs)

    # Mevcut dosyanın sonuna ekle; eğer zaten `auto_generated` bloğu varsa onu sil.
    # Önce mevcut `auto_generated` blok işaretini sil.
    text = existing_text
    text = re.sub(
        r"\n# AUTO-GENERATED START[\s\S]*?# AUTO-GENERATED END\n?",
        "\n",
        text,
    )

    # Mevcut entity'lere field stub'larını enjekte et.
    # Her `  - id: <ent>\n` bloğundan sonra, o entity'nin son
    # field'ından sonra stub'ları ekle. En basit yol: entity başlığı
    # + `fields:` satırını bul, hemen sonrasına stub'ları yapıştır.
    for ent, fields in existing_field_stubs:
        # Entity bloğu: `- id: <ent>` ... `fields:` ... sonraki
        # `- id:` veya dosya sonu. fields listesinin sonuna ekle.
        # Regex: `- id: <ent>\n` ... `fields:\n` ... capture body.
        pattern = re.compile(
            r"(^\s*-\s*id:\s*" + re.escape(ent) + r"\s*\n(?:.*\n)*?\s*fields:\n)",
            re.M,
        )
        m = pattern.search(text)
        if not m:
            continue
        insert_at = m.end()
        field_stubs = "".join(build_stub(ent, field) for field in fields)
        text = text[:insert_at] + field_stubs + text[insert_at:]

    new_block = (
        "\n# AUTO-GENERATED START\n"
        "# GOAL-118 (FAZ-11) pilot temizliği: kod tarafından referans verilen\n"
        "# ancak katalogda eksik olan alanların toplu stub kayıtları.\n"
        "# Üretim öncesi her alan için type, required, validation ve PII\n"
        "# etiketi gözden geçirilmelidir. Bu blok bulk-add-fields.py\n"
        "# tarafından yönetilir; manuel düzenleme yapılmamalıdır.\n"
        + "".join(new_blocks)
        + "# AUTO-GENERATED END\n"
    )

    # Eğer zaten son entity bloğu kapanmamışsa, dosya sonu \n ekle.
    if not text.endswith("\n"):
        text += "\n"
    text += new_block

    FIELDS_FILE.write_text(text, encoding="utf-8")
    print(f"OK: {len(to_add)} alan eklendi ({len(by_entity)} entity).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
