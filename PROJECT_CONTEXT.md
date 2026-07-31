# Proje Bağlamı
    konfigürabləşdirməsi.
  - GOAL-074 ✅ Kasa ve gün sonu (tamamlandı — 2026-07-30, core: d18d45a, docs/i18n: bu commit). 8 endpoint (POST sessions/GET list/GET current/GET :id/POST :id/close/POST :id/reopen/GET :id/movements/GET :id/summary); tenant başına tek aktif session; expectedBalance = opening + in - out; difference (negatif ise notes zorunlu VET-CASH-0003); hareketler payment (in) + payment_reversal (out) + manual. Audit udit:cash_register.session.{open,close,reopen}. Faz 7 tahsilat (GOAL-072) + ters kayıt (GOAL-073) entegrasyonu.
  - GOAL-070 ✅ Fiyat listeleri ve hizmet ücretleri (tamamlandı — 2026-07-30, core: 32ceb6c, docs/i18n: bu commit). 11 endpoint (6 list + 4 item + 1 product price resolve); 3 liste türü (standard/promotional/contract); aktif liste zincirleme (aynı type+currency deaktive); müşteri-özel fiyat (ownerId) + miktar kademeli (minQuantity); çözümleme sırası contract_owner → standard/promotional → product default. Audit udit:price_list.* + udit:price_list_item.*. KDV/GST ülke adaptörü Faz 7'de.
  - GOAL-071 ✅ Klinik satış taslağı (tamamlandı — 2026-07-30, core: 1e6bf50, docs/i18n: bu commit). 6 endpoint (POST/GET list/GET :id/PATCH/POST complete/POST cancel); state draft→completed|cancelled; 6 sourceType (examination/prescription/lab_test/imaging/surgery/order) + sourceId zorunlu; line item (productId × quantity × unitPrice + priceListItemId ref); complete ile Faz 7 Payment (GOAL-072, paymentMethod); cancel ile Faz 7 PaymentReversal (GOAL-073). Stok düşümü YOK (GOAL-066 ayrı akış). Audit udit:clinic_sale.{create,update,complete,cancel}. Tam iade Faz 7+ clinic-sale-returns.
  - GOAL-072 ✅ Tahsilat (tamamlandı — 2026-07-30, core: 564dff3, docs/i18n: bu commit). 4 ana endpoint (POST/GET list/GET :id/POST :id/reverse); 2 sourceType (clinic_sale/petshop_sale) + 4 method (cash/card/bank_transfer/other); kısmi tahsilat (toplam > sale → 422 VET-PAYMENT-0002); ters kayıt (PaymentReversal — GOAL-073 docs ayrı). Audit udit:payment.{create,reverse}. Kasa etkisi Faz 8 (GOAL-074).
  - GOAL-073 ✅ Tahsilat iptal ve ters kayıt (tamamlandı — 2026-07-30, core: d18d45a, docs/i18n: bu commit). 3 reversal endpoint (GET reversals list/GET :id/GET :id/summary); 5 reasonCode (refund/customer_request/error/duplicate/other); çoklu ters kayıt (kısmi düzeltme, totalReversed <= paymentAmount); kasa etkisi 'out' (Faz 7 cash-register entegrasyonu). Audit udit:payment.reverse (warning). Ters kayıt oluşturma POST /payments/{id}/reverse (GOAL-072).
  - GOAL-075 ✅ Müşteri borç ve alacak görünümü (tamamlandı — 2026-07-30, core: 903870b, docs/i18n: bu commit). 2 endpoint (GET owner balance/GET owner transactions); atomic hesaplama (cache'lenmez); totalDebit (tahsil edilmemiş), totalCredit (refund credit + manuel), netBalance (negatif = kredi bakiye); 6 transaction source. Faz 7 tahsilat (GOAL-072) + ters kayıt (GOAL-073) + petshop refund credit (GOAL-065) + manuel dahil. Audit yok (salt okunur).
  - GOAL-077 ✅ e-SMM adaptör sözleşmesi (tamamlandı — 2026-07-30, core: de5b8e4, docs/i18n: bu commit). 6 endpoint (POST/GET list/GET :id/POST :id/submit/POST :id/retry/POST :id/cancel); 3 documentType (invoice/dispatch/receipt); state machine draft→pending→submitted→accepted|rejected|failed; pilot/mock (Faz 13 GOAL-130 gerçek GİB); Audit udit:esmm.document.{create,submit,retry,cancel}. FAZ-7 KAPANDI.
  - GOAL-072 (not) — başka session tarafından payments modülü
    genişletildi (reversedAmount + effectiveAmount alanları
    eklendi; kısmi ters kayıt / etkin tutar mantığı). Bu
    tick'te yazdığım payments modülü çakışma nedeniyle trash'e
    gönderildi; mevcut payments modülü kullanılıyor.

  - GOAL-076 ✅ Temel finans raporları (tamamlandı — 2026-07-30, core: d0a58f1, docs/i18n: bu commit). 4 endpoint (GET daily-sales/GET payment-methods/GET open-balances/POST export); 3 read + 1 async export (PDF/CSV). Günlük satış source dağılımı, ödeme yöntemi toplam, açık bakiyeler totalDebit DESC. Audit udit:report.export (info). Faz 10 BullMQ + custom report builder sonra.
  - GOAL-075 ⏳ partial — core: müşteri borç/alacak görünümü.
    customer-balances modülü (2 endpoint: summary/
    transactions) + 6/6 yeni test + 973/973 api testi geçti.
    Owner (sahip) bazında toplam satış + toplam tahsilat
    (reversedAmount hariç) + net + açık bakiye + son işlem
    tarihleri. Transactions: satış + tahsilat karışık
    liste; tarih sıralı; type filtresi. Cross-module:
    ClinicSalesService + PetshopSalesService + PaymentsService
    (read-only). Mevcut permission clinic:payment:read
    kullanıldı. Audit üretmez (read-only). Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    branch scope filtresi (branchId) + patient bazlı bakiye
    (sahipten bağımsız) + iade (refund) transaction tipi
    için destek.

  - GOAL-080 ⏳ partial — core: ameliyat planlama. surgery-plans
    modülü (7 endpoint: create/list/get/update/start/
    complete/cancel) + 4 durum (scheduled/in_progress/
    completed/cancelled) + scheduledAt gelecekte olmalı
    (422 VET-SURGERY-0006) + 17/17 yeni test + 990/990 api
    testi geçti. Hasta (patient) + sorumlu veteriner
    (leadSurgeonUserId) + operasyon türü + scheduledAt +
    randevu (appointmentId) opsiyonel + notes (ön hazırlık +
    risk). Audit audit:surgery_plan.create/update/start/
    complete/cancel. Hata kodları VET-SURGERY-0001/0002/
    0003/0004/0005/0006/0007. Mevcut permission'lar
    kullanıldı: clinic:surgery:create/read/start/complete/
    cancel. Sonraki tick: docs/RAG chunk/i18n key parity
    + DB migration (Prisma) + ekip (assistant) listesi +
    oda (room) + ön hazırlık kalemleri ayrı tablo + risk
    skoru + GOAL-081 onam formları entegrasyonu + Faz 6
    klinik tüketim (GOAL-066) ile malzeme kullanım
    bağlantısı.

## GOAL-081 onam formları ⏳ partial

- Yeni modul: apps/api/src/modules/consents/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/consents/consent.types.ts
- Yeni contract: packages/contracts/src/consent.ts (exported via index)
- Endpointler: POST/GET /api/v1/clinic/consents, GET :id, POST :id/sign, POST :id/revoke
- 3 templateType: surgery / anesthesia / procedure
- 3 status: draft / signed / revoked
- 2 signatureMethod: manual / electronic
- 4 audit event: consent.create / consent.sign / consent.revoke (signed only) / gerekirse revoke deny
- Hata kodları: VET-CONSENT-0001 (not found, 404) / -0002 (already signed, 409) / -0003 (already revoked, 409) / -0004 (cannot revoke draft, 409)
- Permissions: clinic:consent:read + clinic:consent:sign (mevcut catalog'a eklendi)
- Cross-tenant idor → 404, cross-tenant create → 403 VET-AUTHZ-0001
- Test: 10 yeni spec (10/10 geçti), full api regression 1000/1000 testler geçti, 0 hata, tsc temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-082 anestezi takip ⏳ partial

- Yeni modul: apps/api/src/modules/anesthesia/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/anesthesia/anesthesia.types.ts
- Yeni contract: packages/contracts/src/anesthesia.ts (exported via index)
- Cross-module: SurgeryPlansModule (plan in_progress kontrolü)
- Endpointler: POST/GET /api/v1/clinic/anesthesia, GET :id, POST :id/medications, POST :id/vitals, POST :id/complications, POST :id/staff, POST :id/finalize
- 2 status: draft → finalized (locked, append-only)
- 3 medication route, 8 vital kind, 3 complication severity, 4 staff role enum
- 6 audit event: anesthesia.create / medication_add / vital_add / complication_add / staff_assign / finalize
- Hata kodları: VET-ANESTHESIA-0001 (not found, 404), -0002 (already finalized, 409), -0003 (plan not in_progress, 422), -0004 (duplicate anesthesia, 409)
- Permissions: clinic:anesthesia:read + create + update (mevcut catalog'da zaten var)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001, plan patient mismatch 422
- Test: 16 yeni spec (16/16 geçti), anesthesia modül testleri yeşil
- Build fix: packages/contracts/src/consent.ts Zod nullable() sentaks hatası düzeltildi (önceki build kırıktı)
- Full api regression: anesthesia + diğer tüm modüller 1036/1036 yeşil; cash-register spec hataları PARALEL agent'a ait, bu commit kapsamında değil
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-084 yatış ve kafes yönetimi ⏳ partial

- Yeni modul: apps/api/src/modules/hospitalization/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/hospitalization/hospitalization.types.ts
- Yeni contract: packages/contracts/src/hospitalization.ts (exported via index)
- 3 varlık tek modülde: Cage + Hospitalization + CageAssignment
- Endpointler: POST/GET /api/v1/clinic/cages, GET/PATCH :id; POST/GET /api/v1/clinic/hospitalizations, GET/PATCH :id, POST :id/admit|discharge|cancel, POST :id/cage-assignments, POST cage-assignments/:id/end
- 5 status: planned → admitted → active → discharged | cancelled
- 8 cage kind: dog_small/medium/large, cat, exotic, isolation, icu, recovery, other
- Zaman çakışması: aynı cageId için [from, to] aralıkları kesişen iki CageAssignment olamaz (409 VET-HOSP-0009); ayrıca aynı yatış için açık assignment yalnız bir tane (VET-HOSP-0011)
- Taburcu: tüm açık cage assignment'lar to set edilerek sonlandırılır
- 8 audit event: cage.create/update, hospitalization.create/update/admit/discharge/cancel, cage_assign/cage_end
- 13 hata kodu: VET-HOSP-0001/0002/0003/0004/0005/0006/0007/0008/0009/0010/0011/0012/0013
- Permissions: clinic:hospitalization:read + admit + discharge (mevcut catalog'da)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001
- Test: 20/20 yeni spec geçti
- Full api regression: 1074/1074 yeşil, 8 skipped, 0 hata
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-085 yatış order ve uygulama kayıtları ⏳ partial

- Yeni modul: apps/api/src/modules/hospitalization-orders/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/hospitalization-orders/hospitalization-order.types.ts
- Yeni contract: packages/contracts/src/hospitalization-order.ts (exported via index)
- Cross-module: HospitalizationModule (yatış varlık kontrolü)
- 2 varlık: HospitalizationOrder + HospitalizationOrderSchedule
- Endpointler: POST/GET /api/v1/clinic/hospitalization-orders, GET/PATCH :id, POST :id/cancel|schedules; GET /schedules (status filtresi: pending/applied/skipped/overdue), POST schedules/:id/apply|skip
- 6 order type: medication / feeding / measurement / care / check / other
- 3 order status: active → cancelled (endsAt set edilir)
- 4 priority: low / medium / high / critical
- Schedule status: pending (henüz appliedAt/skippedAt yok) / applied / skipped / overdue (asOf filtresiyle)
- Append-only: iptal status=cancelled; uygulama appliedAt set; skip skippedAt set. Schedule'lar fiziksel silinmez
- 7 audit event: order.create/update/cancel, schedule.add/apply/skip
- 7 hata kodu: VET-HORD-0001/0002/0003/0004/0005/0006/0007
- Permissions: clinic:hospitalization:read + add_note + admit (mevcut catalog'da)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001
- Test: 19/19 yeni spec geçti
- Full api regression: 1093/1093 yeşil, 8 skipped, 0 hata
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-086 gözlem ve taburcu özeti ⏳ partial

- Yeni modul: apps/api/src/modules/discharge-summaries/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/discharge-summaries/discharge-summary.types.ts
- Yeni contract: packages/contracts/src/discharge-summary.ts (exported via index)
- Cross-module: HospitalizationModule (yatış var mı + status kontrolü)
- 2 varlık: Observation (append-only gözlem) + DischargeSummary (draft → finalized → amended)
- Endpointler: POST/GET /api/v1/clinic/hospitalizations/:id/observations, GET :id; POST/GET /api/v1/clinic/discharge-summaries, GET :id, PATCH :id, POST :id/finalize|amend|portal-share
- 7 observation kind: vital / exam / behavior / intake / output / treatment / note
- 3 discharge status: draft (düzenlenebilir) → finalized (locked) → amended (yeni revision)
- Append-only: Observation (silme/düzeltme yok); DischargeSummary amendment ile yeni draft revision oluşur (parentId)
- Portal share: finalized özet portalShared=true yapılabilir (VET-DSUM-0007 yanlış durumda red)
- 8 audit event: observation.create/update, discharge_summary.create/update/finalize/amend/portal/share
- 14 hata kodu: VET-DSUM-0001/0002/0003/0004/0005/0006/0007/0008/0009/0010/0011/0012/0013/0014
- Permissions: clinic:hospitalization:read + add_note + discharge (mevcut katalog)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001
- Test: 14/14 yeni spec geçti
- Full api regression: 1107/1107 yeşil, 8 skipped, 0 hata
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-090 laboratuvar test kataloğu ⏳ partial
- Contract: packages/contracts/src/lab-test.ts (11 schema/type) + index export.
- Domain: pps/api/src/common/lab-tests/lab-test.types.ts (LabTestRecord + toLabTest).
- Repository: pps/api/src/modules/lab-tests/lab-tests.repository.ts (in-memory Map; tenant-scoped code unique, case-insensitive).
- Service: pps/api/src/modules/lab-tests/lab-tests.service.ts (createLabTest / listLabTests / getLabTestDetail / updateLabTest).
- Controller: pps/api/src/modules/lab-tests/lab-tests.controller.ts (POST/GET list/GET :id/PATCH :id — POST ve PATCH clinic:lab:order; GET clinic:lab:read).
- Module: LabTestsModule pp.module.ts içinde kablolu.
- Testler: lab-tests.service.spec.ts 19/19 yeşil; full regression 1126/1126 api testleri (1107 → 1126, +19).
- Error kodları: VET-LABTEST-0001 (not found 404), VET-LABTEST-0002 (duplicate code 409), VET-AUTHZ-0001 (cross-tenant 403).
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).

## GOAL-091 laboratuvar isteği ve numune ⏳ partial
- Contract: packages/contracts/src/lab-order.ts (18 schema/type) + index export.
- Domain: pps/api/src/common/lab-orders/lab-order.types.ts (LabOrderRecord + toLabOrder).
- Repository: pps/api/src/modules/lab-orders/lab-orders.repository.ts (in-memory Map; state machine: ordered → collected → processing → completed; ordered|collected → cancelled).
- Service: pps/api/src/modules/lab-orders/lab-orders.service.ts (createLabOrder/collectSample/startProcessing/completeLabOrder/cancelLabOrder).
  - Cross-module: LabTestsService.getLabTestDetail ile katalog snapshot alınır (katalog sonradan değişse bile order'ın snapshot'ı sabit kalır).
- Controller: pps/api/src/modules/lab-orders/lab-orders.controller.ts (POST/GET list/GET :id/POST :id/collect /start /complete /cancel).
- Module: LabOrdersModule LabTestsModule import eder, pp.module.ts içinde kablolu.
- Testler: lab-orders.service.spec.ts 23/23 yeşil; full regression 1149/1149 api testleri (1126 → 1149, +23).
- Error kodları: VET-LABORD-0001 (not found 404), VET-LABORD-0002 (invalid state transition 409), VET-LABORD-0003 (labtest not found 422), VET-LABORD-0004 (labtest inactive 422), VET-AUTHZ-0001 (cross-tenant 403).
- Permissions: POST/GET list/:id clinic:lab:read|order; POST :id/collect clinic:lab:collect_sample; POST :id/complete clinic:lab:enter_result; POST :id/cancel clinic:lab:order.
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).

## GOAL-092 laboratuvar sonuçları ⏳ partial
- Contract: packages/contracts/src/lab-result.ts (13 schema/type) + index export.
- Domain: pps/api/src/common/lab-results/lab-result.types.ts (LabResultRecord + toLabResult + toLabResultRevision).
- Repository: pps/api/src/modules/lab-results/lab-results.repository.ts (in-memory Map; revision counter; activeByOrder).
- Service: pps/api/src/modules/lab-results/lab-results.service.ts (createLabResult / updateLabResult / submitForReview / approveLabResult / amendLabResult).
  - Cross-module: LabOrdersService.getLabOrderDetail ile order guard + unit/referenceRange snapshot.
- Controller: lab-results.controller.ts — POST/GET/PATCH /api/v1/clinic/lab-orders/:orderId/result + /history, /submit, /approve, /amend.
- Module: LabResultsModule LabOrdersModule import eder, pp.module.ts içinde kablolu.
- Testler: lab-results.service.spec.ts 23/23 yeşil; full regression 1172/1172 api testleri (1149 → 1172, +23).
- Error kodları: VET-LABRES-0001 (not found 404), VET-LABRES-0002 (invalid state 409), VET-LABRES-0003 (already exists 409), VET-LABRES-0004 (order not processing/completed 422), VET-LABRES-0005 (cancelled order 422), VET-AUTHZ-0001 (cross-tenant 403).
- State machine: draft → pending_review → approved; approved → amended + yeni draft revision (her amendment revision++).
- Permissions: create/update/submit/approve clinic:lab:enter_result; read/history clinic:lab:read; amend clinic:lab:amend.
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).

## GOAL-093 görüntüleme isteği ve raporu ⏳ partial
- Contract: packages/contracts/src/imaging-order.ts (12 schema/type) + index export.
- Domain: apps/api/src/common/imaging-orders/imaging-order.types.ts (ImagingOrderRecord + ImagingReportRecord + toImagingOrder + toImagingReport).
- Repository: apps/api/src/modules/imaging-orders/imaging-orders.repository.ts (in-memory Map; tenant-scoped; reportRevisions append-only).
- Service: apps/api/src/modules/imaging-orders/imaging-orders.service.ts (createImagingOrder / scheduleImagingOrder / performImagingOrder / reportImagingOrder / approveReport / amendReport / completeImagingOrder / cancelImagingOrder).
  - Dahili görüntüleme kataloğu (11 varsayılan test: XR-THX, XR-ABD, XR-EXT, US-ABD, US-CARD, CT-THX, CT-ABD, MRI-BRAIN, MRI-SPINE, ENDO-GI + 1 pasif); tenant-scoped genişletme sonraki tick'te `imaging-tests` modülüne taşınacak.
  - Katalog snapshot (code, name, modality, bodyPart, price) order üzerinde dondurulur.
  - Rapor: append-only revision listesi, onaylanmış rapor değiştirilemez, amend ile yeni revision oluşur. portalVisible flag'i ile portal görünürlüğü ayrıca kontrol edilir.
- Controller: imaging-orders.controller.ts — 11 endpoint (POST/GET list/GET :id + POST :id/schedule|perform|report|approve-report|amend-report|complete|cancel) Zod validation + PermissionsGuard ile.
- Module: ImagingOrdersModule app.module.ts içinde kablolu.
- Testler: imaging-orders.service.spec.ts 23/23 yeşil; full regression 1195/1195 api testleri (1172 → 1195, +23).
- State machine: ordered → scheduled → performed → reported/amended → completed; ordered|scheduled → cancelled.
- Error kodları: VET-IMG-0001 (not found 404), VET-IMG-0002 (invalid state transition 409), VET-IMG-0003 (katalog yok 422), VET-IMG-0004 (katalog pasif 422), VET-IMG-0006 (rapor onayı yanlış durum 409), VET-IMG-0007 (rapor yok 422), VET-IMG-0008 (zaten onaylı 409), VET-IMG-0009 (rapor düzeltme yanlış durum 409), VET-AUTHZ-0001 (cross-tenant 403).
- Permissions: create/schedule/complete/cancel clinic:imaging:order; read clinic:imaging:read; perform clinic:imaging:perform; report/amend/approve clinic:imaging:report|amend.
- 8 audit event: audit:imgorder.{create,schedule,perform,report,approve_report,amend_report,complete,cancel}.
- Cross-module: AuditService (global modül).
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).

## GOAL-094 cihaz ve dış laboratuvar adapter altyapısı ⏳ partial
- Yeni modül: apps/api/src/modules/lab-adapters/ (controller, service, repository, module, spec, index).
- Yeni tipler: apps/api/src/common/lab-adapters/lab-adapter.types.ts (LabAdapter interface + LabAdapterExportRecord + LabAdapterImportRecord + toLabAdapterExport / toLabAdapterImport).
- Yeni contract: packages/contracts/src/lab-adapter.ts (20+ Zod şema/tip + index export).
- 2 mock adapter: MockLabDeviceAdapter (in_clinic_device) + MockExternalLabAdapter (external_lab). Her ikisi idempotencyKey ile duplicate order üretmez; simulateFailure=true ile rejected simülasyonu (test/ops).
- Endpointler (9 REST):
  - POST /api/v1/clinic/lab-orders/:labOrderId/adapter-exports (exportOrder)
  - GET /api/v1/clinic/lab-adapter-exports (listExports)
  - GET /api/v1/clinic/lab-adapter-exports/:id (getExport)
  - POST /api/v1/clinic/lab-adapter-exports/:id/retry (retryExport)
  - POST /api/v1/clinic/lab-adapter-exports/:id/cancel (cancelExport)
  - POST /api/v1/clinic/lab-orders/:labOrderId/adapter-imports (importResult)
  - GET /api/v1/clinic/lab-adapter-imports (listImports)
  - GET /api/v1/clinic/lab-adapter-imports/:id (getImport)
  - GET /api/v1/clinic/lab-adapters (listAdapters)
- İş kuralları: exportOrder idempotency (aynı key → mevcut kayıt döner HTTP idempotency); accepted sonrası aynı adapterType ile yeni export 409 VET-LABADAPTER-0006; retry yalnız failed/rejected (409 VET-LABADAPTER-0007); cancel accepted iptal edilemez (409 VET-LABADAPTER-0008); importResult rawPayload içinde readings + value varsa otomatik labResult mapping (status=applied + mappedResultId), aksi received veya rejected.
- Hata kodları: 10 yeni — VET-LABADAPTER-0001 (export not found 404) / -0002 (unknown adapter 422) / -0003 (lab order not found 404) / -0004 (cancelled order export 422) / -0005 (import not found 404) / -0006 (accepted exists 409) / -0007 (only failed/rejected retry 409) / -0008 (accepted cancel 409) / -0009 (cancelled order import 422) / VET-AUTHZ-0001 (cross-tenant 403 mevcut).
- 4 audit event: audit:lab_adapter_export.create / .retry / .cancel + audit:lab_adapter_import.create.
- Permissions: mevcut katalogdan — clinic:lab:order (export/retry/cancel), clinic:lab:read (list/get), clinic:lab:enter_result (import). Yeni permission eklenmedi.
- Cross-tenant IDOR → null/404. Cross-tenant create → 403 VET-AUTHZ-0001.
- Test: 29/29 yeni spec yeşil (1 placeholder skipped). Full api regression 1224/1224 yeşil, 9 skipped, 0 hata. tsc --noEmit temiz.
- Docs/i18n/RAG chunk/field glossary/cross-ref: sonraki tick'lere ertelendi.
- Sonraki: docs/RAG chunk/i18n key parity + DB migration (Prisma) + Faz 13+ gerçek provider entegrasyonu (Idexx/Heska/Reflab/...) + tenant-bazlı adapter konfigürasyonu + Faz 8 React UI + adapter auto-discovery (heartbeat/health check).

- **Faz 10 — Hata merkezi** ⏳ sırada
  - GOAL-100 ⏳ partial — core: merkezi backend hata yakalama.
    error-events modülü (4 endpoint: list/summary/
    byFingerprint/:id) + AllExceptionsFilter entegrasyonu (5xx
    + critical; 4xx kayıt dışı) + ErrorEvent sözleşmesi
    (request_id/tenant/branch/user/module/route/release/
    severity/fingerprint/sanitized context) + 37 modül enum
    (auth/clinic/lab/inventory/...) + fingerprint üretimi
    (errorCode + module + normalizeMessage) + duplicate
    gruplama (occurrenceCount) + SUPERADMIN yetkisi
    (`audit:log:read`) + moduleFromRoute helper (path →
    modül) + PII mask context'ten geçer + 4xx için stack null.
    32/32 yeni test + 1256/1256 api regresyon geçti.
    Cross-module: AllExceptionsFilter (5xx + critical hata
    olaylarını ErrorEventsService.recordError'a yönlendirir).
    Sonraki tick: docs/RAG chunk/i18n key parity + DB
    migration (Prisma) + atama/çözüm notları (GOAL-104) +
    güvenlik alarm kuralları (GOAL-105) + tenant bazlı hata
    filtresi iyileştirmesi + frontend hata yakalama
    (GOAL-101) entegrasyonu + severity=kayıt kuralı
    konfigürabləşdirməsi.
  - GOAL-101 ⏳ partial — core: frontend hata yakalama.
    Next.js error boundary'leri (route [locale]/error.tsx +
    global-error.tsx) + error-reporter (PII sanitizer:
    email/TCKN/telefon/CC mask; maxQueueSize 50; dedup window
    1 sn; flush interval 2 sn; sendBeacon sayfa unload'ında) +
    api-error-integration (apiRequest failure otomatik raporlama
    + severity mapping 5xx→error, 4xx→warning) + backend
    SystemErrorEventsController (POST /api/v1/system/error-events
    — auth placeholder, oturum açmış tüm kullanıcılar) +
    ErrorEventsService.recordClientError (actor bağlamından
    tenant/branch/userId/actorType türetir; istemciye güvenmez)
    + clientErrorReportInputSchema sözleşmesi (severity/
    errorCode/message/stack/context/route/occurredAt/release/
    country) + clientErrorReportResponseSchema (id + fingerprint
    korelasyon) + 41/41 frontend yeni test (error-reporter
    24, api-error-integration 9, error boundary 4+4) +
    error-events backend 42/42 (önceki 32 + 10 yeni
    recordClientError testi: tenant/branch/userId türetme,
    default errorCode TR_FE_0001, actorType portal_user,
    info/critical stack, PII mask'lı context, occurredAt/release
    override) + 1266/1266 api regresyon + 46/46 web
    regresyon. SendBeacon sayfa kapatma anında sync flush
    yapar; navigator yoksa atlanır. Reporter hiçbir koşulda
    throw etmez. Cross-module: ErrorEventsService + repository
    paylaşılır. Sonraki tick: docs/RAG chunk/i18n key parity +
    Next.js client instrumentation.ts hook (unhandledrejection
    global yakalama) + sentry/otel adapter opsiyonel +
    SUPERADMIN panel frontend (GOAL-103) + rate limit
    (token bucket per user) + retry/backoff stratejisi.
