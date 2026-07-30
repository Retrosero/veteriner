# DELETE /api/v1/clinic/shares/{shareId}

Paylaşım kaydını soft-delete yapar (`revokedAt` set). **İdempotent** —
zaten iptal edilmiş kayıt için no-op döner. Tenant-scoped;
cross-tenant → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).

- **Modül:** clinical-records
- **Yetki:** `clinic:report:export` (STAFF / VETERINARIAN)
- **Audit:** `audit:clinical-record.revoke` (severity: warning) —
  shareId, examinationId, fileId, revokedAt.
- **Response:** `204 No Content`.

**Path params:**

- `shareId` (string, zorunlu) — `crshare-<tenant8>-<uuid8>`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Share kaydı bulunamadı / cross-tenant.

**İş kuralları:**

- `revokeShare(tenantId, shareId, actor)` tenant-scoped; share
  kaydı aynı tenant'ta değilse 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- İdempotent: `existing.revokedAt !== null` ise no-op (ek audit
  yazılmaz, response yine 204).
- `revokedAt = now` set edilir; `audit:clinical-record.revoke`
  (warning) yazılır — paylaşım iptali KVKK uyumu açısından görünür
  bir aksiyon olmalı.
- Paylaşım iptal edildiğinde ilişkili dosya (`fileId`) silinmez;
  `visibility: "portal"` kapsamında arşivde kalır. Signed URL
  mekanizması devreye girdiğinde (FAZ-10+) revoke durumunda link
  geçersiz sayılır.
- Append-only politika: share kaydı fiziksel silinmez; `revokedAt`
  ile soft delete yapılır. Listeleme endpoint'leri iptal
  edilmişleri de döner (geçmiş takibi).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinical-record-share.ts`
- Paylaşım oluştur: `POST /api/v1/clinic/examinations/{id}/share`
- Paylaşım listesi: `GET /api/v1/clinic/examinations/{id}/shares`
- PDF render: `GET /api/v1/clinic/examinations/{id}/pdf`
- AI chunk: `clinical-record-share`
