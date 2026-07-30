# DELETE /api/v1/clinic/alerts/:id

Bir klinik uyarısını arşivler (soft delete). `archivedAt` set edilir;
kayıt fiziksel olarak silinmez. İdempotent: zaten arşivliyse no-op.

- **Modül:** clinic (alerts)
- **Yetki:** `clinic:examination:create` (STAFF, VETERINARIAN)
- **Audit:** `audit:alert.archive` (info) — before/after
  `archivedAt`, metadata: `patientId`, `category`.
- **Idempotency:** Var (aynı istek defalarca gönderilebilir;
  yalnızca ilk çağrı audit üretir).
- **Yan etki:** In-memory `byId` Map'te ilgili kaydın
  `archivedAt` alanı güncellenir; sonraki `activeOnly=true`
  listelerinde yer almaz.

## Request

**Path params:**

- `id` (UUID formatında `alt-<tenant8>-<uuid8>`, zorunlu) — uyarı ID.
  Tenant-scoped.

**Body:** Yok.

## Response

**204 No Content:** Başarılı arşivleme (idempotent).

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-CLINIC-0010` (404) — Uyarı bulunamadı (farklı tenant veya
  geçersiz ID).
- `VET-TENANT-0001` (400) — Tenant bağlamı zorunlu.

## Kullanım senaryoları

- Alerji/kronik durum bilgisi güncellendiğinde eski uyarının
  arşivlenmesi (yeni uyarı eklenir).
- Yanlışlıkla eklenen uyarının geri alınması.
- Süreli uyarının manuel olarak devre dışı bırakılması (normal
  akış `expiresAt` ile olur).

## Dikkat edilecek noktalar

- **Soft delete:** Klinik kayıtlar append-only; fiziksel silme
  yok. Arşivleme geri alınamaz — yeniden aktif etmek için yeni
  uyarı oluşturulmalıdır.
- **İdempotent:** İkinci kez arşivleme isteği 204 döner; audit
  tekrar yayınlanmaz. Bu, network retry için güvenli davranış
  sağlar.
- **Audit before/after:** `before.archivedAt = null`,
  `after.archivedAt = <ISO>`. KVKK kapsamında hasta sahibi PII'si
  audit payload'ında yer almaz.
- **Cross-tenant:** Farklı tenant'a ait uyarı ID'si 404
  `VET-CLINIC-0010` döner (bilgi sızdırmaz); 403 yerine 404
  tercih edilir.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/alert.ts` (`alertSchema`)
- Akış: `docs/ai/AI_CHUNKS.yaml` → `flow-allergy-warning`
- Modül: `apps/api/src/modules/alerts/alerts.service.ts`
- Liste: `api.get._api_v1_clinic_patients__patientId_alerts.md`
- Hata: `error-VET-CLINIC-0010`
