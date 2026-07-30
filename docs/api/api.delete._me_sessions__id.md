# DELETE /api/v1/me/sessions/:id

> **Modül:** identity
> **Yetki:** authenticated (kendi session'ı)
> **Auth:** Session cookie veya `Authorization: Bearer <token>`
> **Hata kodları:** `VET-AUTH-0001` (404 — başka kullanıcının session'ı)

Belirli bir oturumu uzaktan iptal eder (logout-remote). Başka
kullanıcının session'ı iptal edilemez (404 döner — bilgi
sızdırmaz).

**Path parametreleri:**
- `id` (UUID, zorunlu) — iptal edilecek oturum ID'si

**Response 200:** `{ "revoked": true }`

**Audit:** `audit:auth.session.revoke` (severity: info)

**Kullanım senaryoları:**
- Şüpheli oturum tespit edildiğinde (tanımadığınız cihaz/konum)
- Eski cihazlardaki oturumları temizleme
- Güvenlik ihlali durumunda müdahale

**İlgili dokümanlar:**
- API sözleşmesi: `packages/contracts/src/auth.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (UserSession)
