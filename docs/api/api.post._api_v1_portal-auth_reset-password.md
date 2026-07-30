# POST /api/v1/portal-auth/reset-password

`forgot-password` ile alınan token + yeni parola ile hesap
parolasını sıfırlar. Token tek kullanımlık; 1 saat geçerli.
Başarıda `failedLoginCount=0`, `lockedUntil=null`, `status="active"`,
token consume edilir.

- **Modül:** portal-auth
- **Yetki:** public (`@Public()`)
- **Audit:** `audit:portal.auth.password.reset_success` (info).

**Request body (`PortalResetPasswordRequest`):**

```json
{
  "token": "fa8b3c...e7d2",
  "newPassword": "NewStrongPass456!"
}
```

- `token` — `forgot-password` response'undan; 32-128 char.
- `newPassword` — `passwordPolicySchema`: min 12, büyük+küçük harf
  +rakam.

**Response 200 (`PortalMessageResponse`):**

```json
{ "message": "Parola güncellendi" }
```

**Hata kodları:**

- `VET-VALIDATION-0001` (422) — Body parse hatası veya parola
  politikası ihlali.
- `VET-AUTH-0004` (400) — Token geçersiz, süresi dolmuş veya
  kullanılmış. Mesaj sabit: "Sıfırlama token'ı geçersiz veya
  süresi dolmuş" (token varlık bilgisi sızdırmaz).

**Güvenlik notları:**

- Token DB'de sha256 hash'lenmiş olarak aranır; plain token hiçbir
  zaman DB'ye yazılmaz.
- Başarıda `consumeResetToken` ile `usedAt` set edilir; aynı token
  tekrar kullanılamaz.
- Yeni parola bcrypt cost 12 ile hash'lenir; plain loglanmaz.
- Brute-force sayacı sıfırlanır; hesap kilitliyse otomatik açılır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-auth.ts`
- Forgot: `POST /api/v1/portal-auth/forgot-password`
- AI chunk: `flow-portal-auth`
