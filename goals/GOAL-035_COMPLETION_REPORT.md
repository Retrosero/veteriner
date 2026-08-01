# GOAL-035 Completion Report — Online randevu talebi

- Goal no: GOAL-035
- Başlık: Online randevu talebi
- Faz: FAZ-3 (Randevu + portal)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: bdfdb16

## Yapılan işler (core, bdfdb16)

**PortalAppointmentsService**
(`apps/api/src/modules/portal-appointments/portal-appointments.service.ts`)
— 5 public metot + 1 helper. (1) `create(tenantId, portalUserId,
input, actor)`: `PortalUser.findById` ile `ownerId` çözümü
(bulunamazsa 404 `VET-CLINIC-0001`); `PatientsService.findById` +
`patient.ownerId === ownerId` (cross-owner/cross-tenant → 404);
`preferredDate > now()` (değilse 422 `VET-VALIDATION-0009`);
in-memory `byId` Map'e `pending` kayıt; 2 in-app bildirim
best-effort (`portal.appointment.requested` sahibine +
`clinic.appointment.requested` personele); audit
`audit:portal.appointment.request` (info). (2) `list`: `ownerId`
filtresi zorunlu, `tenantId` actor'dan; portal user yoksa boş
liste; `requestedAt` desc. (3) `cancel`: yalnızca talep sahibi;
`pending → cancelled`; zaten `cancelled` no-op; `approved|rejected`
→ 422 `VET-PORTAL-0006`; audit `audit:portal.appointment.cancel`
(info). (4) `approve(decidedBy)`: yalnızca `pending`; 30dk default
randevu `AppointmentsService.create` ile oluşturulur
(`preferredVeterinarianId` yoksa `PLACEHOLDER_VETERINARIAN_ID`
stub); slot çakışması veya `preferredDate` artık geçmişse hata
propagate (talep `pending` kalır); audit
`audit:portal.appointment.approve` (info); in-app onay bildirimi.
(5) `reject(decidedBy, reason)`: yalnızca `pending`; `reason` 1-500
zorunlu; audit `audit:portal.appointment.reject` (**warning**);
in-app red bildirimi. (6) `findAppointmentById` cross-module helper
(approve sonrası response için).

**PortalAppointmentsController** (`.controller.ts`), iki sınıf:

- `PortalAppointmentsPortalController` (`@UseGuards(PortalSessionGuard)`)
  — `POST /requests` (201, `AppointmentRequest`); `GET /requests`
  (200, `AppointmentRequestListResponse`); `POST /requests/:id/cancel`
  (200, `{cancelled: true}`). `:id` `ParseUUIDPipe` (FAZ-0 stub;
  record ID `pareq-...` formatında).
- `PortalAppointmentsClinicController`
  (`@UseGuards(PermissionsGuard)` + `@RequirePermissions("clinic:appointment:create")`)
  — `POST /api/v1/clinic/portal-appointments/requests/:id/approve`
  (200, `{request, appointment}`); `POST /:id/reject` (200,
  `{rejected: true}`). Body Zod `appointmentRequestRejectInputSchema`.

**Sözleşme** (`packages/contracts/src/portal-appointment-request.ts`)
— Zod şemalar: `appointmentRequestStatusSchema` (pending | approved
| rejected | cancelled | auto_scheduled),
`contactPreferenceSchema` (phone | email | sms),
`appointmentRequestCreateInputSchema` (patientId, preferredDate,
preferredVeterinarianId?, type, reason, contactPreference),
`appointmentRequestRejectInputSchema` ({ reason }),
`appointmentRequestSchema` (id/tenantId/patientId/ownerId/status/
preferredDate/preferredVeterinarianId/type/reason/contactPreference/
requestedAt/decidedAt?/decidedBy?/rejectionReason?/approvedAppointmentId?),
`appointmentRequestListResponseSchema` ({items, total}).

**11 yeni test** (`portal-appointments.service.spec.ts`):
(1) create happy — 1 audit + 2 notification; (2) cross-tenant
patient → 404; (3) geçmiş `preferredDate` → 422; (4) başka owner'ın
hastası → 404; (5) list yalnızca kendi `ownerId`'si; (6) cancel
pending → cancelled; (7) cancel idempotent; (8) approve pending →
approved + `appointments.create` çağrıldı; (9) approve zaten
approved → 422; (10) reject pending → rejected + reason; (11)
audit event coverage (create + approve flow).

## Tasarım kararları

- **Talep ≠ randevu:** Portal action'lar doğrudan `Appointment`
  oluşturmaz; her zaman personel kararı gerekir.
- **`ownerId` yalnızca session:** URL/body ile override edilemez;
  cross-owner patient → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- **Tek 404 kodu:** Patient/talep/portal user bulunamadığında sabit
  `VET-CLINIC-0001`; 403 yerine 404 (varlık enumeration'a kapalı).
- **`approvedAppointmentId`:** Approve sonrası oluşan randevu ID'si
  response'da döner; frontend ayrıca `GET /clinic/appointments/{id}`
  ile detay alabilir.
- **`preferredVeterinarianId` opsiyonel:** FAZ-0 placeholder UUID;
  FAZ-3+'da round-robin/skill-match ataması.
- **Notification best-effort:** `notifications.send` hatası talebi
  durdurmaz; loglanır.
- **Audit trail:** 4 ayrı event
  (`request | cancel | approve | reject`); `actorType` portal vs
  personel için farklı (`portal_user` vs `user`).
- **In-memory `byId` Map:** FAZ-0 pilot; DB persistence FAZ-3+'da.
  `(tenantId, ownerId, requestedAt DESC)` index önerilir.
- **Idempotency:** Cancel idempotent; approve/reject tek seferlik
  (ikincisi 422 `VET-PORTAL-0006`).

## Değişen dosyalar

**Core (bdfdb16):**
`apps/api/src/modules/portal-appointments/{portal-appointments.module,
portal-appointments.controller,portal-appointments.service,
portal-appointments.service.spec,portal-appointments.types,index}.ts`,
`packages/contracts/src/portal-appointment-request.ts`,
`apps/api/src/app.module.ts`, migration yok.

**Docs & i18n (bu commit):**
`goals/GOAL-035_COMPLETION_REPORT.md` (bu dosya),
`PROJECT_CONTEXT.md` (⏳ → ✅), 5 API doc
(`docs/api/api.{post,get}._api_v1_{portal,clinic}_portal-appointments_requests*.md`),
`docs/ai/AI_CHUNKS.yaml` (+1 chunk: `flow-portal-appointment-request`).
Yeni hata kodu yok (`VET-CLINIC-0001`, `VET-VALIDATION-0009`,
`VET-AUTHZ-0001` zaten katalogda). Yeni i18n anahtarı yok
(error.XX mevcut).

## Veritabanı

Yok. In-memory `byId: Map<string, AppointmentRequestRecord>`.
Üretimde: `appointment_requests` tablosu (id, tenantId, patientId,
ownerId, status enum, preferredDate timestamptz, type enum,
reason text, contactPreference enum, requestedAt, decidedAt?,
decidedBy?, rejectionReason?, approvedAppointmentId?).
Indexler: `(tenantId, ownerId, requestedAt DESC)` (portal liste),
`(tenantId, status, requestedAt)` (personel inbox), partial index
`(tenantId, patientId)` (timeline).

## API

| Method | Path                                                    | Auth           | Kod |
| ------ | ------------------------------------------------------- | -------------- | --- |
| POST   | /api/v1/portal-appointments/requests                    | portal session | 201 |
| GET    | /api/v1/portal-appointments/requests                    | portal session | 200 |
| POST   | /api/v1/portal-appointments/requests/:id/cancel         | portal session | 200 |
| POST   | /api/v1/clinic/portal-appointments/requests/:id/approve | staff + perm   | 200 |
| POST   | /api/v1/clinic/portal-appointments/requests/:id/reject  | staff + perm   | 200 |

Hatalar: 401 `VET-AUTH-0001` (Guard), 403 `VET-AUTHZ-0001`
(cross-tenant), 400 `VET-VALIDATION-0001` (Zod parse), 422
`VET-VALIDATION-0009` (geçmiş `preferredDate`), 422
`VET-PORTAL-0006` (invalid state transition), 404 `VET-CLINIC-0001`
(patient/talep/portal user not found), 409 `VET-APPT-0005`
(approve slot çakışması).

## Test

11 yeni unit test. Create 4 (happy + cross-tenant + geçmiş tarih +
cross-owner); list 1 (sadece kendi `ownerId`); cancel 2 (pending +
idempotent); approve 2 (happy + already approved); reject 1
(reason set); audit coverage 1. Başarısız: 0.

## Bilinen riskler

- `VET-PORTAL-0006` katalogda/i18n'de mevcut değil (core'da 422
  state-transition kodu olarak kullanıldı); FAZ-3+'da katalog +
  tr/en parity eklenmeli.
- In-memory `byId` Map pilot; restart → state kaybolur. DB
  migration FAZ-3+'da.
- `preferredVeterinarianId` stub; round-robin/skill-match ataması
  FAZ-3+'da.
- Bildirim template'leri (`portal.appointment.requested`,
  `clinic.appointment.requested`, `portal.appointment.approved`,
  `portal.appointment.rejected`) henüz düz metin fallback; gerçek
  i18n template'leri notification modülü sonrası.
- `ParseUUIDPipe` `pareq-...` formatında hata verebilir; FAZ-3+'da
  custom pipe (`ParseRequestIdPipe`).

## Sıradaki

FAZ-3 portal devam. GOAL-036 (hatırlatma), VET-PORTAL-0006
kataloğa/i18n'e eklenmesi, DB migration. Portal UI (frontend pages)
bu commit sonrası ayrıca ele alınacak.
