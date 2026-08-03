# Hata Atama ve Çözüm Notu Kılavuzu (FAZ-10 / GOAL-104)

> Bu doküman SUPERADMIN hata merkezindeki (GOAL-103) operasyonel
> aksiyonları (atama, çözüm notu, destek bağlantısı, audit timeline)
> kapsar. Tüm aksiyonlar append-only log'a yazılır; silme yoktur.

## 1. Endpoint'ler ve Permission'lar

| Aksiyon          | Endpoint                                          | Permission                   | Not                          |
| ---------------- | ------------------------------------------------- | ---------------------------- | ---------------------------- |
| Durum güncelleme | `PATCH /:id/status`                               | `error:event:status:write`   | State machine doğrulanır.    |
| Atama            | `PATCH /:id/assignment`                           | `error:event:assign:write`   | Append-only kayıt.           |
| Atama geçmişi    | `GET  /:id/assignments`                           | `error:event:assign:write`   | Tarih sırası.                |
| Not ekleme       | `POST /:id/notes`                                 | `error:event:note:write`     | PII mask'lı.                 |
| Not listesi      | `GET  /:id/notes`                                 | `error:event:note:write`     | CreatedAt ASC.               |
| Destek bağlantısı| `POST /:id/support-links`                         | `error:event:support:write`  | En az 1 tanımlayıcı.         |
| Destek listesi   | `GET  /:id/support-links`                         | `error:event:support:write`  | CreatedAt ASC.               |
| Birleşik audit   | `GET  /:id/audit-log`                             | `error:event:audit:read`     | Tüm aksiyonlar.              |

Mevcut uygulamada SUPERADMIN tüm permission'lara sahiptir
(`applies_to_roles: [SUPERADMIN]`). Mevcut testler `audit:log:read`
permission'ı ile korunan endpoint'leri başarıyla geçer; granular
permission'lar ileride (FAZ-15+) rol ayrımı için kullanılabilir.

## 2. Atama İşlemleri

```http
PATCH /api/v1/superadmin/error-events/:id/assignment
Content-Type: application/json

{
  "assigneeId": "usr-dev-1",
  "reason": "Bu hata grafana alarmından geldi"
}
```

veya atamayı kaldırmak için:

```json
{ "unassign": true, "reason": "Çözüldü" }
```

`UNASSIGNED` sentetik assigneeId ile append-only kayıt düşer. Status
değişmez; sadece atama aksiyonu izlenir. Hata olayının
`assignedToUserId` alanı en son atamayı yansıtır.

## 3. Çözüm Notları

```http
POST /api/v1/superadmin/error-events/:id/notes
Content-Type: application/json

{
  "body": "Root cause: redis bağlantısı zaman aşımı. Fix: connection pool.",
  "visibility": "internal"
}
```

`visibility` `internal` (yalnızca SUPERADMIN) veya `shared` (ileride
tenant portal tarafı için). `body` PII mask'lı saklanır (email,
TCKN, telefon, IBAN regex ile maskelenir; max 4000 karakter).

## 4. Destek Bağlantıları

```http
POST /api/v1/superadmin/error-events/:id/support-links
Content-Type: application/json

{
  "system": "jira",
  "externalId": "VET-1234",
  "url": "https://vetniva.atlassian.net/browse/VET-1234",
  "title": "Hata: Redis bağlantı timeout"
}
```

`system`: jira, linear, zendesk, github, internal, other. En az bir
tanımlayıcı zorunlu (`system` + `externalId`/`url`/`title` kombinasyonu).

## 5. Birleşik Audit Timeline

`GET /:id/audit-log` tüm aksiyonları occurredAt artan sırada döner:

| Action                  | Tetikleyici                    | UI ipucu                |
| ----------------------- | ------------------------------ | ----------------------- |
| `status_transition`     | Manuel PATCH /:id/status       | From → To + reason      |
| `note_added`            | POST /:id/notes                | Visibility + preview    |
| `support_link_added`    | POST /:id/support-links        | System + externalId/url |
| `assignment_changed`    | PATCH /:id/assignment          | Assignee + reason       |
| `occurrence_recorded`   | resolved → reopened (sistem)    | Reason                  |

UI (`ErrorEventDetail`) bu timeline'ı `<ol>` içinde render eder; her
entry aksiyonuna göre `renderAuditDetails` ile özelleştirilmiş
içerik gösterir.

## 6. Frontend Component

`apps/web/src/components/superadmin/error-event-detail.tsx`:

- `error-event-list.tsx` filtresi + satır seçimi
- `ErrorEventDetail` mount edildiğinde üç paralel çağrı:
  - `GET /:id` (detay)
  - `GET /:id/notes` (not listesi)
  - `GET /:id/audit-log` (timeline)
- Status güncelleme, atama, not ekleme, destek bağlantısı ekleme
  aksiyonları backend'e yönlendirir; başarılı aksiyon sonrası `load()`
  ile tüm verileri yeniden çeker.

## 7. RBAC Granülerlik (next-tick)

Yeni granular permission'lar `docs/permissions/PERMISSION_CATALOG.yaml`'da
tanımlandı; SUPERADMIN için `applies_to_roles` ile eklendi. İleride
(FAZ-15+) tenant-side mühendis ekipleri bu permission'ları alabilir.

| Permission                  | Tipik kullanıcı              | Aksiyon kapsamı       |
| --------------------------- | ---------------------------- | --------------------- |
| `error:event:tenant:read`   | OWNER (kendi tenant'ı)       | Salt-okunur görüntüleme |
| `error:event:status:write`  | SUPERADMIN mühendis          | State transition     |
| `error:event:assign:write`  | SUPERADMIN mühendis          | Atama                |
| `error:event:note:write`    | SUPERADMIN mühendis          | Çözüm notu           |
| `error:event:support:write` | SUPERADMIN mühendis          | Destek bağlantısı    |
| `error:event:audit:read`    | SUPERADMIN mühendis + denetçi | Audit timeline       |

## 8. Test Coverage

| Dosya                                              | Testler | Konu                          |
| -------------------------------------------------- | ------- | ----------------------------- |
| `error-events.service.spec.ts` (assignment + note) | 18      | append-only, PII mask, IDOR  |
| `error-event-detail.test.tsx`                      | 2       | detay + audit timeline render |
| **Toplam (core + next-tick)**                       | 20+     |                               |

## 9. Operasyonel Kontrol Listesi

- [ ] Hata ataması yapıldığında `assignedToUserId` UI'da görünür.
- [ ] Atama/unassign her zaman append-only kayıt oluşturur.
- [ ] Çözüm notu PII mask'lı saklanır (raw metin değil).
- [ ] Destek bağlantısı sistemi + en az bir tanımlayıcı içerir.
- [ ] Birleşik audit timeline occurredAt artan sırada görünür.
- [ ] Sistem kaynaklı `reopened` aksiyonları timeline'da
      `occurrence_recorded` olarak işaretlenir.
