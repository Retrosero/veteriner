# Yedekleme ve Restore (GOAL-124)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Amaç

PostgreSQL ve object storage için otomatik yedekleme ve
restore prosedürü. Gerçek restore testi çalıştırılır.
RPO/RTO hedefleri dokümante edilir.

## Yedekleme Stratejisi

### PostgreSQL

- **Yöntem:** `pg_dump` + WAL streaming (PITR).
- **Sıklık:**
  - Full backup: günlük 03:00 UTC.
  - Incremental (WAL): sürekli (her 5 dakika).
- **Retention:**
  - Günlük: 7 gün.
  - Haftalık: 4 hafta.
  - Aylık: 12 ay.
- **Saklama:** S3 Glacier + Azure Blob Cool tier.
- **Şifreleme:** AES-256 at-rest (S3 SSE-S3 + Azure
  Storage Service Encryption).
- **Boyut tahmini (100 tenant):**
  - DB: ~10 GB.
  - Günlük delta: ~500 MB.
  - Aylık toplam: ~25 GB.

### Object Storage (dosyalar)

- **Yöntem:** S3 cross-region replication + Azure GRS.
- **Sıklık:** sürekli (realtime).
- **Retention:** tenant dosyaları silinmez (KVKK
  gereği); versioning aktif.

### Yedekleme Otomasyonu (cron)

```bash
# /etc/cron.d/vetniva-backup
# Günlük full backup (03:00 UTC)
0 3 * * * postgres /opt/vetniva/scripts/backup-full.sh
# WAL archiving (her 5 dakika)
*/5 * * * * postgres /opt/vetniva/scripts/backup-wal.sh
```

## RPO / RTO Hedefleri

| Tier                        | RPO (veri kaybı) | RTO (kurtarma süresi) | Strateji                         |
| --------------------------- | ---------------- | --------------------- | -------------------------------- |
| **Pilot (ilk 10 tenant)**   | 5 dakika         | 1 saat                | Günlük + WAL                     |
| **Production (100 tenant)** | 1 dakika         | 30 dakika             | Günlük + WAL streaming + standby |
| **Critical (KVKK/UK GDPR)** | 0 (sıfır kayıp)  | 15 dakika             | Sync replica + multi-region      |

## Restore Prosedürü

### Senaryo 1: Veri bozulması (yanlış update)

1. **Etki analizi:** Hangi saat aralığında bozulma
   olduğunu tespit et.
2. **PITR seç:** Bozulma öncesi son temiz WAL
   pozisyonunu belirle.
3. **Restore komutu:**
   ```bash
   # 1. Mevcut DB'yi yedekle (read-only)
   pg_dump -Fc vetniva > /tmp/before-restore.dump

   # 2. WAL replay ile PITR
   systemctl stop vetniva-api
   pg_ctlcluster 14 main stop
   # Base backup restore
   tar -xzf /backups/daily/2026-07-30.dump.tar.gz -C /var/lib/postgresql/data
   # Recovery configuration
   cat > /var/lib/postgresql/data/recovery.signal <<EOF
   EOF
   echo "restore_command = 'cp /backups/wal/%f %p'" >> postgresql.auto.conf
   echo "recovery_target_time = '2026-07-31 10:00:00 UTC'" >> postgresql.auto.conf
   pg_ctlcluster 14 main start
   # Verify
   psql -c "SELECT count(*) FROM patients"
   systemctl start vetniva-api
   ```
4. **Doğrulama:** Smoke test + tenant bazlı veri
   kontrolü.
5. **Post-mortem:** Olay raporu + iyileştirme aksiyonları.

### Senaryo 2: Tenant yanlışlıkla tenant'ı sildi

- Tenant hard delete YOK (soft delete + archive).
- Restore: tenant_id ile PITR.

### Senaryo 3: Disaster (bölge kaybı)

- Multi-region standby devreye alınır.
- DNS failover (< 5 dakika).

## Yedekleme Testi (Aylık)

Yerel Docker ve CI öncesi doğrulama için çalıştırılabilir PowerShell
otomasyonu `tools/backup/` altında bulunur. Custom-format dump container
içinde üretildiği için ikili verinin PowerShell yönlendirmesiyle bozulması
engellenir. Restore testi canlı `vetniva` veritabanına yazmaz; yalnızca
`vetniva_restore_test_` önekli geçici bir veritabanı oluşturur, `tenants`,
`owners` ve `patients` tablolarını sayar ve işlem sonunda bu veritabanını
silerek temizliği doğrular.

```powershell
$backup = .\tools\backup\backup-postgres.ps1 | ConvertFrom-Json
.\tools\backup\restore-test.ps1 -BackupFile $backup.backupFile
```

2 Ağustos 2026 yerel Docker doğrulaması: restore başarılı; `tenants=1`,
`owners=13`, `patients=16`. Bu sayıların içeriği değil, geri yüklenen
şemada verinin erişilebilir olması kabul kanıtıdır.

### TypeScript Tier Doğrulama

`tools/backup/src/backup-types.ts` RPO/RTO tier matrisini
tutarken `validate` komutu tier tutarlılığını doğrular:

```bash
pnpm --filter @vetniva/backup validate
# {
#   "tiers": [
#     { "tier": "pilot", "rpoMinutes": 5, "rtoMinutes": 60, ... },
#     { "tier": "production", "rpoMinutes": 1, "rtoMinutes": 30, ... },
#     { "tier": "critical", "rpoMinutes": 0, "rtoMinutes": 15, ... }
#   ],
#   "issues": [],
#   "allOk": true
# }
```

Tier matrisi değişirse (örn. pilot RPO 5dk → 2dk) ilgili
test ve doküman senkron güncellenmelidir; CI bu kontrolü
PR gate'inde çalıştırır.

### Object Storage Sync

Object storage (S3 + Azure Blob) cross-region replication

- GRS ile **sürekli** senkronize olur. Tenant dosyaları
  silinmez (KVKK gereği); versioning aktiftir. Cross-tenant
  erişim denemeleri `audit:security_event.tenant_isolation_breach_attempt`
  event'i üretir.

### Audit

Tüm yedekleme aksiyonları audit log'a düşer:

- `audit:backup.completed` (info) — başarılı yedek
- `audit:backup.failed` (error) — yedek hatası
- `audit:backup.restore_tested` (info) — restore testi
  başarılı
- `audit:backup.restore_failed` (error) — restore testi
  başarısız

Tüm event'ler `request_id` + `tenant_id` + `actor_type`

- `correlation_id` + `app_version` alanlarını taşır;
  `actor_type` = "system" (scheduled) veya "user"
  (manual trigger).

Eski platformlar için örnek prosedür:

```bash
# /opt/vetniva/scripts/test-restore.sh
#!/bin/bash
set -e

echo "=== Restore test başlatıldı: $(date) ==="

# 1. Test ortamına restore
TEST_DB="vetniva_restore_test_$(date +%s)"
createdb "$TEST_DB"
gunzip -c /backups/daily/latest.dump.gz | pg_restore -d "$TEST_DB"

# 2. Smoke test
psql -d "$TEST_DB" -c "SELECT count(*) FROM tenants" > /tmp/restore-counts.log
psql -d "$TEST_DB" -c "SELECT count(*) FROM patients" >> /tmp/restore-counts.log
psql -d "$TEST_DB" -c "SELECT count(*) FROM examinations" >> /tmp/restore-counts.log

# 3. Cleanup
dropdb "$TEST_DB"
echo "=== Restore test tamamlandı ==="
```

## Monitoring

- **Yedekleme başarısızlığı alarmı:** her yedekleme job
  sonrası `audit:backup.completed` event'i.
- **Restore test alarmı:** aylık test başarısızsa P2 alert.
- **WAL lag:** replica WAL lag > 60 saniye → P3 alert.

## Yapılmayanlar / Bilinçli Atlamalar

- **Multi-region active-active** → Faz 13+ (100+ tenant
  için).
- **S3 Glacier Deep Archive** → Faz 12+ (7 yıl tıbbi
  kayıt saklama).
- **Backup encryption (client-side)** → Faz 12+ (tenant
  tarafında encrypt).
- **WORM (Write Once Read Many) storage** → Faz 13+
  (KVKK audit log).

## Commit

- Docs: (bu commit) — `docs(operations): GOAL-124 yedekleme + restore prosedürü`
