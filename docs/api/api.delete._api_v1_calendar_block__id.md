# DELETE /api/v1/calendar/block/{id}

Engellenmiş slot'u kaldırır. Cross-tenant `id` → 404 `VET-APPT-0002`
(bilgi sızdırmaz). İdempotent: aynı id ile tekrar çağrı yine 404
döner; audit `audit:calendar.unblock` yalnızca başarılı kaldırmada
yayınlanır.

- **Modül:** calendar
- **Yetki:** `tenant:tenant:update` (OWNER)
- **Audit:** `audit:calendar.unblock` (severity: info) — blockId,
  veterinarianId, start, end payload ile.

**Path parametreleri:**

| Ad   | Tip    | Zorunlu | Açıklama                                                                |
| ---- | ------ | ------- | ----------------------------------------------------------------------- |
| `id` | string | evet    | Block ID (ör. `blk-<uuid>`). Yanlış tenant ID'si → 404 `VET-APPT-0002`. |

**Response 200:**

```json
{ "unblocked": true }
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-APPT-0002` (404) — Block bulunamadı veya farklı tenant'a ait.

**Tenant izolasyonu:** `actor.tenantId` ile eşleşmeyen block ID'si
bilgi sızdırmamak için 404 döner. Bu davranış IDOR denemelerine
karşı koruma sağlar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/calendar.ts`
- Block oluşturma: `POST /api/v1/calendar/block`
- AI chunk: `calendar-overview`
