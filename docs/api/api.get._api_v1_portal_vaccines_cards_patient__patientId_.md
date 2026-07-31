# GET /api/v1/portal/vaccines/cards/patient/{patientId}

Hasta sahibi portalı için bir hayvanın aşı kartını getirir. Personel
kökünden farklı olarak `PortalSessionGuard` ile korunur; tenant
bilgisi session'dan alınır. Tenant ayarı
`portalVaccineCardEnabled=false` ise 403 `VET-AUTHZ-0002` döner.

- **Modül:** vaccines (vaccine-cards, portal kökü)
- **Yetki:** Portal session (yetişi: hasta sahibi kendi
  `pet.owners[].id` eşleşmesi)
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `patientId` (string, 1-100) zorunlu.

**Hesaplama kuralları:**

- Tenant ayarı `portalVaccineCardEnabled` `false` → 403
  `VET-AUTHZ-0002`.
- Cross-tenant `patientId` → 404 `VET-CLINIC-0001`.
- `VaccineCard` personel kökü ile birebir aynı hesaplanır
  (bkz. `GET /api/v1/clinic/vaccines/cards/patient/{patientId}`).

**Response 200 (`VaccineCard`):**

Personel kökü ile aynı `VaccineCard` şeması. `portalVisible`
alanı her zaman `true` (bu kökten erişim için anlamlı değil).

**Hata kodları:**

- `VET-AUTH-PORTAL-0001` (401) — Portal session geçersiz /
  süresi dolmuş.
- `VET-AUTHZ-0002` (403) — Tenant portal aşı kartı
  görünürlüğünü kapatmış.
- `VET-CLINIC-0001` (404) — Hayvan bulunamadı (cross-tenant
  dahil).

**Tenant izolasyonu:** `request.portalSession.tenantId`
zorunlu; service bu tenantId ile sorgular. Cross-tenant patientId
→ 404 (bilgi sızdırmaz). Süper admin için bu kök anlamsız
(superadmin portal kullanmaz).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine-card.ts`
- Personel kökü: `GET /api/v1/clinic/vaccines/cards/patient/{patientId}`
- Ayar: `GET/PUT /api/v1/clinic/vaccines/cards/portal-setting`
- AI chunk: `flow-vaccine-card`
- Audit event: yok (salt okunur)
