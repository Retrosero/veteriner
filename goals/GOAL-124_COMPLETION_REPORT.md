# GOAL-124 — Yedekleme + Restore (Completion Report)

## Faz
FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet
PostgreSQL + object storage için otomatik yedekleme ve
restore prosedürü. RPO/RTO hedefleri tier bazında
tanımlandı; aylık restore testi planlandı.

## Çıktılar

### Döküman (bu commit)
- `docs/operations/BACKUP_RESTORE.md` — PostgreSQL +
  object storage stratejisi, RPO/RTO tablosu, restore
  prosedürü (3 senaryo), aylık test script.

### Yedekleme Stratejisi

#### PostgreSQL
- `pg_dump` + WAL streaming (PITR).
- Full backup: günlük 03:00 UTC.
- WAL archiving: sürekli (5 dakika).
- Retention: 7 günlük + 4 haftalık + 12 aylık.
- AES-256 at-rest (S3 SSE-S3 + Azure SSE).

#### Object Storage
- S3 cross-region + Azure GRS.
- Realtime replication.
- Versioning aktif.

### RPO/RTO Hedefleri

| Tier | RPO | RTO | Strateji |
|------|-----|-----|----------|
| Pilot (10 tenant) | 5 dk | 1 saat | Günlük + WAL |
| Production (100 tenant) | 1 dk | 30 dk | Streaming + standby |
| Critical (KVKK) | 0 | 15 dk | Sync replica + multi-region |

## Yapılmayanlar / Bilinçli Atlamalar
- **Multi-region active-active** → Faz 13+ (100+ tenant).
- **S3 Glacier Deep Archive** → Faz 12+ (7 yıl tıbbi
  kayıt).
- **Client-side backup encryption** → Faz 12+.
- **WORM storage** → Faz 13+ (KVKK audit log).

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- Aylık restore testi (`test-restore.sh`): cron job
  her ayın ilk Pazar günü 04:00 UTC.
- Audit: `audit:backup.completed` (info),
  `audit:backup.test_passed` (info).

## Commit
- Docs: (bu commit) — `docs(operations): GOAL-124 yedekleme + restore prosedürü`
