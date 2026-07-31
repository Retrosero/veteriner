/**
 * @file Tedarikçi (supplier) domain tipleri.
 * @module apps/api/common/suppliers/supplier.types
 *
 * @description GOAL-062 (FAZ-6) tedarikçi kataloğu domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma `Supplier`
 * tablosu ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Tedarikçi 3 türde olabilir:
 * - `clinic`  — klinik sarf malzemesi / ilaç tedarikçisi.
 * - `petshop` — petshop ürün tedarikçisi.
 * - `general` — her iki türde de ürün sağlayan tedarikçi.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Tedarikçi üzerinde fiziksel
 *   silme yoktur; arşivleme `archivedAt` alanı ile yapılır (soft
 *   delete, klinik + finansal kayıt politikası). Geçmiş satın
 *   alma siparişleri tedarikçi silinse bile audit trail'de korunur.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import type {
  Supplier,
  SupplierType,
} from "@vetniva/contracts";

/**
 * Persist edilmiş supplier record. API sözleşmesinden (public
 * Supplier) ek olarak `active` alanı tutulur.
 */
export interface SupplierRecord {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  type: SupplierType;
  taxId: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
}

export type { Supplier, SupplierType };

/** Record → public Supplier (API response). */
export function toSupplier(rec: SupplierRecord): Supplier {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    name: rec.name,
    code: rec.code,
    type: rec.type,
    taxId: rec.taxId,
    contactName: rec.contactName,
    email: rec.email,
    phone: rec.phone,
    address: rec.address,
    notes: rec.notes,
    active: rec.active,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
    archivedBy: rec.archivedBy,
    archiveReason: rec.archiveReason,
  };
}
