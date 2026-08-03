# @vetniva/backup (GOAL-124, FAZ-12)

PostgreSQL yedekleme + restore test araçları. Pilot,
production ve critical tier'ları için RPO/RTO hedefleri
ve prosedür dokümanı.

## Bileşenler

| Dosya                        | Açıklama                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `backup-postgres.ps1`        | PostgreSQL `pg_dump` custom-format yedek alır. Container içinde geçici dosya; PowerShell ikili yönlendirme yok. |
| `restore-test.ps1`           | Yedeği geçici `vetniva_restore_test_*` veritabanına restore eder; 3 tablo sayar; temizler.                      |
| `src/backup-types.ts`        | RPO/RTO tier matrisi, BackupRequest/Result tipleri.                                                             |
| `src/validate.ts`            | Tier tutarlılık doğrulama CLI.                                                                                  |
| `tests/backup-types.test.ts` | Tier matris testleri (8 test).                                                                                  |

## RPO/RTO Tier'ları

| Tier           | RPO (veri kaybı) | RTO (kurtarma süresi) | Strateji                                  |
| -------------- | ---------------- | --------------------- | ----------------------------------------- |
| **pilot**      | 5 dakika         | 1 saat                | Günlük full + 5dk WAL streaming           |
| **production** | 1 dakika         | 30 dakika             | Günlük full + 1dk WAL streaming + standby |
| **critical**   | 0 (sıfır kayıp)  | 15 dakika             | Sync replica + multi-region               |

> KVKK/UK GDPR uyumu: critical tier için RPO 0 (zero
> data loss). Pilot/production tier'lar makul kabul
> edilebilir veri kaybı sürelerini hedefler.

## Çalıştırma

### Manuel Yedek (PowerShell)

```powershell
# 1. Local Docker stack hazir olmali
pnpm docker:up

# 2. Yedek al
$backup = .\tools\backup\backup-postgres.ps1 | ConvertFrom-Json
Write-Host "Yedek: $($backup.backupFile) ($($backup.bytes) bytes)"

# 3. Restore testi (canli DB'ye dokunmaz)
.\tools\backup\restore-test.ps1 -BackupFile $backup.backupFile
```

### Tier Doğrulama (TypeScript)

```bash
pnpm --filter @vetniva/backup type-check
pnpm --filter @vetniva/backup test       # 8 test
pnpm --filter @vetniva/backup validate
```

## Güvenlik

- **Şifreleme:** Yedek dosyaları AES-256 at-rest
  (S3 SSE-S3 + Azure Storage Service Encryption).
  Client-side encryption FAZ-12+ planlanmıştır.
- **Parola:** Komut satırına yazılmaz; secret manager
  (production) veya local default (development).
- **Tenant izolasyonu:** Restore testi yalnızca
  `vetniva_restore_test_*` önekli geçici DB'ye yazar;
  canlı `vetniva` DB'ye asla dokunmaz.
- **Audit:** Her yedek `audit:backup.completed` event'i
  üretir; restore testi `audit:backup.restore_tested`
  event'i.

## Retention Policy

- **Günlük:** 7 gün
- **Haftalık:** 4 hafta
- **Aylık:** 12 ay
- **Eskiyen yedekler:** S3 Glacier'a taşınır (maliyet
  optimizasyonu)

## Monitoring

- Yedekleme başarısızlığı alarmı: her yedekleme job
  sonrası `audit:backup.completed` event'i.
- Restore test alarmı: aylık test başarısızsa P2 alert.
- WAL lag: replica WAL lag > 60 saniye → P3 alert.

## Sınırlamalar / Sonraki Adımlar

- **Multi-region active-active** → Faz 13+ (100+ tenant için)
- **S3 Glacier Deep Archive** → Faz 12+ (7 yıl tıbbi kayıt saklama)
- **Client-side encryption** → Faz 12+ (tenant tarafında encrypt)
- **WORM (Write Once Read Many) storage** → Faz 13+ (KVKK audit log)
- **Backup integrity verification (checksum/sha256)** → Faz 12+

## İlgili Dokümanlar

- `docs/operations/BACKUP_RESTORE.md` — prosedür ve runbook
- `docs/security/KVKK_DATA_LIFECYCLE.md` — veri yaşam döngüsü
- `docs/operations/PRODUCTION_RELEASE.md` — release gate
