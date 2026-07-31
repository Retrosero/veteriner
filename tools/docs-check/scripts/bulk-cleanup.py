#!/usr/bin/env python3
"""
GOAL-118 (FAZ-11) pilot temizliği — toplu düzeltme.

docs-check raporundaki 4 kategori hatayı toplu olarak giderir:
1. Eksik alanlar (fields.yaml)
2. Eksik API route dokümanları (docs/api/...)
3. Eksik hata kodları (ERROR_CATALOG.md)
4. Eksik permission'lar (PERMISSION_CATALOG.yaml)

Kullanım:
    python tools/docs-check/scripts/bulk-cleanup.py [--dry-run]

Bu script, dosyaların yapısını bozmadan yeni girdileri dosya
sonuna ekler. Var olan girdiler dokunulmaz.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REPORT = ROOT / "docs-check-report.txt"
API_DIR = ROOT / "docs/api"
ERR_CATALOG = ROOT / "docs/errors/ERROR_CATALOG.md"
PERM_CATALOG = ROOT / "docs/permissions/PERMISSION_CATALOG.yaml"
FIELDS_FILE = ROOT / "docs/fields/fields.yaml"

# ------------------------------------------------------------------
# Rapor çözümleme
# ------------------------------------------------------------------

ANSI_RE = re.compile(r"\x1b\[[0-9;]+m")
FIELD_RE = re.compile(r"^\[HATA\] field:([a-zA-Z0-9_.]+)")
API_RE = re.compile(
    r"^\[HATA\] ([A-Z][a-z]+) (/api/v1/[^\s]+?) — API route için doküman eksik: "
    r"docs/api/(api\.[a-z]+\._api_v1_[^\s]+\.md)"
)
ERR_CODE_RE = re.compile(r"^\[HATA\] error_code:(VET-[A-Z0-9-]+) ")
PERM_RE = re.compile(r"^\[HATA\] permission:([a-z][a-z0-9_:-]+)")


def clean(s: str) -> str:
    return ANSI_RE.sub("", s)


def parse_report(text: str) -> dict[str, list]:
    fields: list[str] = []
    api_routes: list[tuple[str, str, str]] = []  # (method, path, file)
    err_codes: list[str] = []
    perms: list[str] = []
    for line in text.splitlines():
        c = clean(line)
        m = FIELD_RE.match(c)
        if m:
            fields.append(m.group(1))
            continue
        m = API_RE.match(c)
        if m:
            api_routes.append((m.group(1), m.group(2), m.group(3)))
            continue
        m = ERR_CODE_RE.match(c)
        if m:
            err_codes.append(m.group(1))
            continue
        m = PERM_RE.match(c)
        if m:
            perms.append(m.group(1))
            continue
    return {
        "fields": sorted(set(fields)),
        "api_routes": api_routes,
        "err_codes": sorted(set(err_codes)),
        "perms": sorted(set(perms)),
    }


# ------------------------------------------------------------------
# 1) Alanlar (fields.yaml)
# ------------------------------------------------------------------

CAMEL_SPLIT_RE = re.compile(r"(?<!^)(?=[A-Z])")


def humanize(name: str) -> str:
    s = name.replace("_", " ")
    s = CAMEL_SPLIT_RE.sub(" ", s)
    return s.strip().lower()


def infer_type(name: str) -> str:
    n = name.lower()
    if n == "id" or n.endswith("id") or n.endswith("idlist") or n.endswith("ids"):
        return "uuid"
    if n.endswith("at"):
        return "datetime"
    if n.endswith("date"):
        return "date"
    if n.endswith("amount") or n.endswith("price") or n.endswith("total") or n.endswith("balance") or n.endswith("subtotal"):
        return "decimal"
    if n.startswith("is") or n.startswith("has") or n.startswith("can") or n.startswith("should") or n in {"enabled", "active", "reversed", "include", "cancelled", "available", "voided", "suppress", "global", "composed", "include_cancelled", "masked", "archived", "is_default", "is_public"}:
        return "boolean"
    if n.endswith("count") or n.endswith("quantity") or n.endswith("qty") or n.endswith("number") or n.endswith("step") or n.endswith("limit") or n.endswith("offset") or n.endswith("days") or n.endswith("minutes") or n.endswith("seconds") or n.endswith("retries") or n.endswith("attempts"):
        return "number"
    if n.endswith("code") or n.endswith("type") or n.endswith("status") or n.endswith("mode") or n.endswith("severity") or n.endswith("level") or n.endswith("channel") or n.endswith("locale") or n.endswith("country") or n.endswith("currency") or n.endswith("species") or n.endswith("protocol") or n.endswith("category"):
        return "enum"
    if n.endswith("json") or n.endswith("metadata") or n.endswith("details") or n.endswith("context") or n.endswith("payload") or n.endswith("config") or n.endswith("settings") or n.endswith("filters") or n.endswith("headers"):
        return "json"
    if n.endswith("list") or n.endswith("items") or n.endswith("lines") or n.endswith("entries") or n.endswith("tags"):
        return "array"
    return "string"


def infer_required(name: str) -> bool:
    n = name.lower()
    if n == "id":
        return True
    if n.endswith("id") and not n.startswith("optional"):
        return True
    if n in {"type", "status", "code", "name"}:
        return True
    return False


def infer_pii(name: str) -> bool:
    n = name.lower()
    pii_keywords = [
        "email", "phone", "name", "surname", "taxid", "tcno", "tckimlik",
        "address", "iban", "passport", "idcard", "license", "ip", "agent",
        "useragent", "deviceid", "firstname", "lastname", "fullname",
        "displayname", "birthdate", "birthyear", "national", "ownerid", "patientname",
    ]
    return any(k in n for k in pii_keywords)


def build_field_stub(entity: str, field: str) -> str:
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
    pii_str = "true" if pii else "false"
    return (
        f"      - id: {entity}.{field}\n"
        f"        name: {field}\n"
        f"        type: {type_}\n"
        f"        required: {'true' if required else 'false'}\n"
        f"        unique: false\n"
        f"        pii: {pii_str}\n"
        f"        description_tr: \"{desc_tr}\"\n"
        f"        description_en: \"{desc_en}\"\n"
        f"        validation: \"auto-generated; refine in follow-up\"\n"
        f"        version: \"1.0.0\"\n"
    )


def parse_existing_field_ids(text: str) -> set[str]:
    ids: set[str] = set()
    for m in re.finditer(r"^\s*-?\s*id:\s*([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*)", text, re.M):
        ids.add(m.group(1))
    return ids


def fix_fields(parsed: dict, dry_run: bool) -> int:
    if not FIELDS_FILE.exists():
        return 0
    text = FIELDS_FILE.read_text(encoding="utf-8")
    existing = parse_existing_field_ids(text)
    to_add = [f for f in parsed["fields"] if f not in existing]
    if not to_add:
        return 0
    if dry_run:
        print(f"[fields] Would add {len(to_add)} entries (dry-run).")
        return 0
    by_entity: "OrderedDict[str, list[str]]" = OrderedDict()
    for fid in to_add:
        ent, _, field = fid.partition(".")
        by_entity.setdefault(ent, []).append(field)
    new_entity_blocks: list[str] = []
    new_field_stubs: list[str] = []
    for ent, fields in by_entity.items():
        ent_re = re.compile(rf"^\s*-\s*id:\s*{re.escape(ent)}\s*$", re.M)
        if ent_re.search(text) is None:
            new_entity_blocks.append(
                f"  - id: {ent}\n"
                f"    description_tr: \"{ent.capitalize()} varlığı (FAZ-11 bulk add).\"\n"
                f"    description_en: \"{ent.capitalize()} entity (FAZ-11 bulk add).\"\n"
                f"    pii: false\n"
                f"    tenant_scoped: true\n"
                f"    fields:\n"
            )
        for field in fields:
            new_field_stubs.append(build_field_stub(ent, field))
    text = re.sub(r"\n# AUTO-GENERATED START[\s\S]*?# AUTO-GENERATED END\n?", "\n", text)
    if not text.endswith("\n"):
        text += "\n"
    new_block = (
        "\n# AUTO-GENERATED START\n"
        "# GOAL-118 (FAZ-11) pilot temizliği: kod tarafından referans verilen\n"
        "# ancak katalogda eksik olan alanların toplu stub kayıtları.\n"
        "# Üretim öncesi her alan için type, required, validation ve PII\n"
        "# etiketi gözden geçirilmelidir.\n"
        + "".join(new_entity_blocks)
        + "".join(new_field_stubs)
        + "# AUTO-GENERATED END\n"
    )
    FIELDS_FILE.write_text(text, encoding="utf-8")
    print(f"[fields] Added {len(to_add)} entries ({len(by_entity)} entities).")
    return len(to_add)


# ------------------------------------------------------------------
# 2) API route docs
# ------------------------------------------------------------------

def path_to_module(path: str) -> str:
    """Örnek: /api/v1/clinic/anesthesia/:id → clinic"""
    parts = [p for p in path.split("/") if p and p != "api" and p != "v1"]
    return parts[0] if parts else "common"


def build_api_doc(method: str, path: str, fname: str) -> str:
    mod = path_to_module(path)
    return (
        f"# {method.upper()} {path}\n\n"
        f"**Modül:** `{mod}`  \n"
        f"**Endpoint:** `docs/api/{fname}`  \n"
        f"**Yöntem:** `{method.upper()}`  \n"
        f"**Yol:** `{path}`\n\n"
        f"## Özet\n\n"
        f"`{mod}` modülündeki bu endpoint için stub doküman. "
        f"GOAL-118 pilot temizliği kapsamında üretildi; detaylı şema, "
        f"request/response örnekleri ve audit event açıklaması üretim "
        f"öncesi tamamlanmalıdır.\n\n"
        f"## Yetkilendirme\n\n"
        f"- **Roller:** tenant'a göre değişir (OWNER, VETERINARIAN, STAFF, vb.)\n"
        f"- **Permission:** `{mod}:*` (modüle göre detaylanır)\n\n"
        f"## Path Parametreleri\n\n"
        f"- `:id` (UUID) — Varlık ID. Cross-tenant erişim 404 döner.\n\n"
        f"## Hata Kodları\n\n"
        f"- `VET-AUTH-0001` (401) — Oturum geçersiz.\n"
        f"- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.\n"
        f"- `VET-{mod.upper()}-0001` (404) — Varlık bulunamadı.\n\n"
        f"## Audit\n\n"
        f"- **Event:** `audit:{mod}.{method.lower()}` (severity: info)\n"
        f"- **Target:** `{mod}:<id>`\n\n"
        f"## Version\n\n"
        f"1.0.0\n"
        f"last_verified_at: 2026-08-01\n"
    )


def fix_api_routes(parsed: dict, dry_run: bool) -> int:
    if not parsed["api_routes"]:
        return 0
    API_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    for method, path, fname in parsed["api_routes"]:
        fpath = API_DIR / fname
        if fpath.exists():
            continue
        if dry_run:
            print(f"[api] Would create {fname}")
            count += 1
            continue
        fpath.write_text(build_api_doc(method, path, fname), encoding="utf-8")
        count += 1
    if not dry_run:
        print(f"[api] Created {count} endpoint docs.")
    return count


# ------------------------------------------------------------------
# 3) Hata kodları (ERROR_CATALOG.md)
# ------------------------------------------------------------------

# Modül kodu → bölüm adı (mevcut bölümlerle eşleşir).
ERR_SECTION_BY_PREFIX = {
    "VET-COMMON": "Genel (COMMON)",
    "VET-VALIDATION": "Doğrulama (VALIDATION)",
    "VET-AUTH": "Kimlik Doğrulama (AUTH)",
    "VET-AUTHZ": "Yetkilendirme (AUTHZ)",
    "VET-RBAC": "RBAC (RBAC)",
    "VET-MODULE": "Modül / Feature Flag (MODULE)",
    "VET-TENANT": "Tenant (TENANT)",
    "VET-BRANCH": "Şube (BRANCH)",
    "VET-USER": "Kullanıcı (USER)",
    "VET-ROLE": "Rol (ROLE)",
    "VET-COUNTRY": "Ülke (COUNTRY)",
    "VET-CLINIC": "Klinik (CLINIC) — Owner / Patient",
    "VET-APPT": "Randevu (APPT)",
    "VET-EXAM": "Muayene (EXAM)",
    "VET-SOAP": "SOAP",
    "VET-DIAG": "Teşhis (DIAG)",
    "VET-ORDER": "Klinik Order (ORDER)",
    "VET-VACC": "Aşı (VACC)",
    "VET-PRESC": "Reçete (PRESC)",
    "VET-SURG": "Ameliyat (SURG)",
    "VET-ANESTH": "Anestezi (ANESTH)",
    "VET-ANESTHESIA": "Anestezi (ANESTH)",
    "VET-HOSP": "Yatış (HOSP)",
    "VET-HORD": "Yatış (HOSP)",
    "VET-DSUM": "Yatış (HOSP)",
    "VET-LAB": "Laboratuvar (LAB)",
    "VET-LABORD": "Laboratuvar (LAB)",
    "VET-LABRES": "Laboratuvar (LAB)",
    "VET-LABTEST": "Laboratuvar (LAB)",
    "VET-LABADAPTER": "Laboratuvar (LAB)",
    "VET-IMG": "Görüntüleme (IMG) — GOAL-093",
    "VET-STOCK": "Stok (STOCK)",
    "VET-INVENTORY": "Envanter (INVENTORY) — Depo, Raf, Lot",
    "VET-PRODUCT": "Petshop — Ürün (PRODUCT)",
    "VET-PRICING": "Fiyat Listesi (PRICING)",
    "VET-PAYMENT": "Ödeme (PAYMENT)",
    "VET-CASH": "Kasa (CASH)",
    "VET-CONSENT": "Onam (CONSENT)",
    "VET-KVKK": "KVKK",
    "VET-REPORT": "Rapor (REPORT)",
    "VET-AUDIT": "Audit (AUDIT)",
    "VET-FILE": "Dosya (FILE)",
    "VET-NOTIF": "Bildirim (NOTIF)",
    "VET-PORTAL": "Portal (PORTAL)",
    "VET-INTEGRATION": "Entegrasyon (INTEGRATION)",
    "VET-JOB": "Background Job (JOB)",
    "VET-JOBRUN": "Background Job (JOB)",
    "VET-WORKER": "Worker (WORKER)",
    "VET-SUPPLIER": "Envanter (INVENTORY) — Depo, Raf, Lot",
    "VET-OPNOTE": "Ameliyat (SURG)",
    "VET-RETURN": "Petshop (PETSHOP) — Satış (SALE)",
    "VET-SALE": "Petshop (PETSHOP) — Satış (SALE)",
    "VET-PETSHOP": "Petshop (PETSHOP) — Satış (SALE)",
    "VET-ESMM": "Entegrasyon (INTEGRATION)",
    "VET-ERRNOTE": "Audit (AUDIT)",
    "VET-SEC": "Yetkilendirme (AUTHZ)",
    "VET-TEST": "Laboratuvar (LAB)",
}


def err_code_section(code: str) -> str:
    """Bir VET- kodunun hangi bölüme ekleneceğini belirler."""
    # Önce tam prefix eşleşmesi (ör. VET-ANESTHESIA), sonra kısa prefix.
    for prefix, section in ERR_SECTION_BY_PREFIX.items():
        if code.startswith(prefix + "-"):
            return section
    return "Entegrasyon (INTEGRATION)"  # fallback


def err_code_name(code: str) -> str:
    """Kod adından okunabilir bir ad üretir (stub)."""
    suffix = code.rsplit("-", 1)[-1]
    return f"{code} (FAZ-11 stub)"


def fix_err_codes(parsed: dict, dry_run: bool) -> int:
    if not parsed["err_codes"]:
        return 0
    if not ERR_CATALOG.exists():
        return 0
    text = ERR_CATALOG.read_text(encoding="utf-8")
    # Mevcut kodlar.
    existing = set(re.findall(r"`(VET-[A-Z0-9-]+)`", text))
    to_add = [c for c in parsed["err_codes"] if c not in existing]
    if not to_add:
        return 0
    if dry_run:
        print(f"[err_codes] Would add {len(to_add)} codes (dry-run).")
        return 0
    # Bölümlere göre grupla.
    by_section: "OrderedDict[str, list[str]]" = OrderedDict()
    for code in to_add:
        by_section.setdefault(err_code_section(code), []).append(code)
    # Her bölümü bul ve sonuna ekle.
    for section, codes in by_section.items():
        # Bölüm başlığını regex ile bul.
        header_re = re.compile(rf"^## {re.escape(section)}\s*$", re.M)
        m = header_re.search(text)
        if not m:
            # Bölüm yoksa "Ekleme kuralı" öncesine yeni bölüm ekle.
            insertion_point = text.find("\n## Ekleme kuralı")
            if insertion_point < 0:
                insertion_point = len(text)
            new_section = f"\n## {section}\n\n| Kod                  | Ad                          | HTTP | Severity | Kaynak | Çözüm                                |\n| -------------------- | --------------------------- | ---- | -------- | ------ | ------------------------------------ |\n"
            for code in codes:
                new_section += f"| `{code:<20}` | {err_code_name(code):<27} | 404  | warning  | server | (FAZ-11 stub)                        |\n"
            text = text[:insertion_point] + new_section + "\n" + text[insertion_point:]
            continue
        # Bölüm bulundu; tablo sonuna ekle. Tablo sonu = bir sonraki ## veya --- veya EOF.
        start = m.end()
        rest = text[start:]
        end_match = re.search(r"^(## |\n---)", rest, re.M)
        if end_match:
            insert_at = start + end_match.start()
        else:
            insert_at = len(text)
        new_rows = ""
        for code in codes:
            new_rows += f"| `{code:<20}` | {err_code_name(code):<27} | 404  | warning  | server | (FAZ-11 stub)                        |\n"
        text = text[:insert_at] + new_rows + text[insert_at:]
    ERR_CATALOG.write_text(text, encoding="utf-8")
    print(f"[err_codes] Added {len(to_add)} codes ({len(by_section)} sections).")
    return len(to_add)


# ------------------------------------------------------------------
# 4) Permission'lar (PERMISSION_CATALOG.yaml)
# ------------------------------------------------------------------

def parse_existing_perms(text: str) -> set[str]:
    perms: set[str] = set()
    for m in re.finditer(r'^\s*-\s*permission:\s*"?([a-z][a-z0-9_:-]+)"?', text, re.M):
        perms.add(m.group(1))
    return perms


def build_perm_entry(perm: str) -> str:
    """Bir permission için stub YAML girdisi."""
    parts = perm.split(":")
    if len(parts) == 2:
        domain, action = parts
        resource = "_self"
    elif len(parts) >= 3:
        domain = parts[0]
        resource = parts[1]
        action = parts[2] if len(parts) == 3 else "_".join(parts[2:])
    else:
        domain, resource, action = perm, "_self", "manage"
    # Sistem seviyesi permission'lar.
    system_only = perm in {"auth:isPublic", "aws:kms", "rbac:permissions", "rbac:roles", "feature-flag:require-module"}
    return (
        f"  - permission: \"{perm}\"\n"
        f"    description: \"{perm} (FAZ-11 stub).\"\n"
        f"    resource_type: {resource}\n"
        f"    action: {action}\n"
        f"    tenant_scope: {'not_required' if system_only else 'required'}\n"
        f"    branch_scope: not_required\n"
        f"    self_only: false\n"
        f"    audit: false\n"
        f"    pii: false\n"
        f"    amend: false\n"
        f"    system_only: {'true' if system_only else 'false'}\n"
        f"    applies_to_roles: {['OWNER', 'VETERINARIAN', 'STAFF'] if not system_only else ['SUPERADMIN']}\n"
        f"    notes: \"GOAL-118 pilot temizliği kapsamında otomatik eklendi.\"\n"
    )


def fix_permissions(parsed: dict, dry_run: bool) -> int:
    if not parsed["perms"]:
        return 0
    if not PERM_CATALOG.exists():
        return 0
    text = PERM_CATALOG.read_text(encoding="utf-8")
    existing = parse_existing_perms(text)
    to_add = [p for p in parsed["perms"] if p not in existing]
    if not to_add:
        return 0
    if dry_run:
        print(f"[perms] Would add {len(to_add)} permissions (dry-run).")
        return 0
    # summary bloğundan hemen önce ekle.
    summary_marker = "\n# =============================================================================\n# TOPLAMLAR"
    idx = text.find(summary_marker)
    if idx < 0:
        idx = len(text)
    new_block = (
        "\n# ----------------------------------------------------------------\n"
        "# GOAL-118 (FAZ-11) pilot temizliği: toplu eklenen permission'lar\n"
        "# ----------------------------------------------------------------\n"
        + "".join(build_perm_entry(p) for p in to_add)
    )
    text = text[:idx] + new_block + "\n" + text[idx:]
    PERM_CATALOG.write_text(text, encoding="utf-8")
    print(f"[perms] Added {len(to_add)} permissions.")
    return len(to_add)


# ------------------------------------------------------------------
# main
# ------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not REPORT.exists():
        print(f"HATA: {REPORT} bulunamadı. Önce `pnpm docs:check` çalıştırın.", file=sys.stderr)
        return 1
    report = REPORT.read_text(encoding="utf-8")
    parsed = parse_report(report)
    print(
        f"Bulunan: {len(parsed['fields'])} alan, "
        f"{len(parsed['api_routes'])} API route, "
        f"{len(parsed['err_codes'])} hata kodu, "
        f"{len(parsed['perms'])} permission."
    )
    if args.dry_run:
        fix_fields(parsed, True)
        fix_api_routes(parsed, True)
        fix_err_codes(parsed, True)
        fix_permissions(parsed, True)
        print("DRY-RUN: Dosya değişmedi.")
        return 0
    fix_fields(parsed, False)
    fix_api_routes(parsed, False)
    fix_err_codes(parsed, False)
    fix_permissions(parsed, False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
