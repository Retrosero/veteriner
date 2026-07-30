/**
 * @file Portal pets domain tipleri.
 * @module apps/api/modules/portal-pets/portal-pets.types
 *
 * @description GOAL-034 hasta sahibi portal — kendi hayvanlarını
 * listeleme ve detayını görme domain modeli. Personel panelindeki
 * `Patient` DTO'sundan farklıdır: PII alanları (klinik notları,
 * fatura) dahil edilmez; yalnızca sahibin kendi verisini
 * görmesi gereken alanlar + aktif uyarı sayısı + sıradaki aşı
 * tarihi.
 *
 * @security Bu tipler yalnızca `archive=null` (aktif) hastalar
 *   için kullanılır. Cross-owner erişim 404 ile maskelenir.
 *
 * @since GOAL-034 (FAZ-3) portal hayvan listesi ve detayı
 */

import type { PortalPetDetail, PortalPetSummary } from "@vetniva/contracts";

/** Service-layer DTO: portal hayvan listesi öğesi. */
export type { PortalPetSummary, PortalPetDetail };
