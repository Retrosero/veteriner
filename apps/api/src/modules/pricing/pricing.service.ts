/**
 * @file Fiyat listeleri ve fiyat satırları service.
 * @module apps/api/modules/pricing/pricing.service
 *
 * @description GOAL-070 (FAZ-7) tenant bazlı fiyat listesi altyapısı
 * iş kuralları. İki varlık:
 * - **PriceList** — fiyat listesi başlığı (status: draft/active/
 *   expired/archived).
 * - **PriceListItem** — fiyat satırı (append-only: düzeltme yeni
 *   satır oluşturur, eski satır `superseded` olur).
 *
 * İş kuralları:
 * - `createPriceList`: tenant içinde `name` benzersiz değildir
 *   (aynı isimde birden fazla liste olabilir; id farklıdır). `type`
 *   customer_specific ise `customerId` zorunlu.
 * - `updatePriceList`: yalnızca `status='draft'` iken değişiklik
 *   kabul edilir; aktif/expiry/archived listede 409 VET-PRICING-0006.
 * - `activatePriceList`: `status='draft' → 'active'`. Geçerlilik
 *   tarihleri (validFrom/validUntil) zorunlu değil; belirtilmemişse
 *   sınırsız geçerli.
 * - `archivePriceList`: `archivedAt` set edilir; soft delete. Zaten
 *   arşivli 409 VET-PRICING-0007.
 * - `addItem`: aynı ürün için aynı listede aktif satır varsa 409
 *   VET-PRICING-0003. Ürün arşivli 422 VET-PRICING-0009. Liste
 *   arşivli 409 VET-PRICING-0007. Fiyat 0 dahil pozitif (>=0
 *   izin verilir; ücretsiz ürün/hizmet olabilir).
 * - `updateItem`: append-only düzeltme. Yeni satır oluşturulur,
 *   eski `status='superseded'`. `supersedesId` ile zincir. Düzeltme
 *   sırasında liste `draft` olmalı (aktif listede item değişikliği
 *   yeni bir tarihçe oluşturur; bu Faz 8'de netleşecek).
 * - `cancelItem`: `status='active' → 'cancelled'`. `superseded`/
 *   `cancelled` zaten değiştirilemez (409 VET-PRICING-0007).
 * - `resolveProductPrice`: bir ürün için tüm aktif adayları getirir
 *   (liste adı, fiyat, vergi profili, geçerlilik aralığı). Frontend
 *   bu adaylardan kendi sıralamasını seçebilir; Faz 8'de default
 *   resolver (en yüksek tür önceliği + en yeni tarih) eklenecek.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Fiziksel silme YOKTUR;
 *   append-only + arşivleme.
 *
 * @since GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  PricingRepository,
  type PriceListPatch,
} from "./pricing.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  normalizePricingDecimal,
  toPriceList,
  toPriceListItem,
  type PriceListItemRecord,
  type PriceListRecord,
} from "../../common/pricing/pricing.types.js";
import { ProductsService } from "../products/products.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  PriceList,
  PriceListArchiveInput,
  PriceListCreateInput,
  PriceListFilters,
  PriceListItem,
  PriceListItemCreateInput,
  PriceListItemFilters,
  PriceListItemListResponse,
  PriceListItemUpdateInput,
  PriceListListResponse,
  PriceListUpdateInput,
  ProductPriceResolution,
} from "@vetniva/contracts";

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  public constructor(
    private readonly repo: PricingRepository,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // createPriceList
  // ===========================================================================

  public async createPriceList(
    tenantId: string,
    input: PriceListCreateInput,
    actor: ActorContext,
  ): Promise<PriceList> {
    this.requireTenantScope(actor, tenantId);

    // customer_specific için customerId zorunlu; standard/promotional
    // için customerId kabul edilmez. (Zod refine bu kontrolü yapar
    // ama service seviyesinde tekrar doğrulanır; testler service'i
    // doğrudan çağırır.)
    if (input.type === "customer_specific" && !input.customerId) {
      throw new DomainError({
        errorCode: "VET-PRICING-0005",
        message: "type='customer_specific' için customerId zorunludur",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0005",
        details: { type: input.type },
      });
    }
    if (input.type !== "customer_specific" && input.customerId !== undefined) {
      throw new DomainError({
        errorCode: "VET-PRICING-0005",
        message:
          "customerId yalnızca type='customer_specific' için kullanılabilir",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0005",
        details: { type: input.type, customerId: input.customerId },
      });
    }

    // Tarih aralığı kontrolü.
    if (
      input.validFrom !== undefined &&
      input.validUntil !== undefined &&
      new Date(input.validFrom).getTime() > new Date(input.validUntil).getTime()
    ) {
      throw new DomainError({
        errorCode: "VET-PRICING-0004",
        message: "Geçersiz tarih aralığı (validFrom > validUntil)",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0004",
        details: {
          validFrom: input.validFrom,
          validUntil: input.validUntil,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextListId(tenantId);
    const record: PriceListRecord = this.repo.toListRecord({
      id,
      tenantId,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      customerId: input.customerId ?? null,
      currency: input.currency,
      taxProfile: input.taxProfile ?? null,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      status: "draft",
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    });
    this.repo.insertList(record);

    await this.audit.recordSimple(
      "audit:price_list.create",
      "price_list",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        name: record.name,
        type: record.type,
        customerId: record.customerId,
        currency: record.currency,
        taxProfile: record.taxProfile,
        validFrom: record.validFrom,
        validUntil: record.validUntil,
      },
    );

    return toPriceList(record, 0);
  }

  // ===========================================================================
  // listPriceLists
  // ===========================================================================

  public async listPriceLists(
    tenantId: string,
    filters: PriceListFilters,
    actor: ActorContext,
  ): Promise<PriceListListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchLists(tenantId, {
      type: filters.type,
      status: filters.status,
      customerId: filters.customerId,
      effectiveAt: filters.effectiveAt
        ? new Date(filters.effectiveAt)
        : undefined,
      search: filters.search,
      includeArchived: filters.status === "archived",
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((rec) =>
        toPriceList(rec, this.repo.countActiveItemsForList(rec.id)),
      ),
      total: result.total,
    };
  }

  // ===========================================================================
  // getPriceList
  // ===========================================================================

  public async getPriceList(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<PriceList | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findListById(tenantId, id);
    if (!rec) return null;
    return toPriceList(rec, this.repo.countActiveItemsForList(rec.id));
  }

  // ===========================================================================
  // updatePriceList
  // ===========================================================================

  public async updatePriceList(
    tenantId: string,
    id: string,
    input: PriceListUpdateInput,
    actor: ActorContext,
  ): Promise<PriceList> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findListById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRICING-0007",
        message: "Arşivli fiyat listesi güncellenemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0007",
        details: { id },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-PRICING-0006",
        message: "Yalnızca taslak (draft) fiyat listesi güncellenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0006",
        details: { id, status: existing.status },
      });
    }

    const patch: PriceListPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.taxProfile !== undefined) patch.taxProfile = input.taxProfile;
    if (input.validFrom !== undefined) patch.validFrom = input.validFrom;
    if (input.validUntil !== undefined) patch.validUntil = input.validUntil;
    patch.updatedAt = new Date().toISOString();

    const updated = this.repo.updateList(tenantId, id, patch);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:price_list.update",
      "price_list",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        before: {
          name: existing.name,
          description: existing.description,
          taxProfile: existing.taxProfile,
          validFrom: existing.validFrom,
          validUntil: existing.validUntil,
        },
        after: {
          name: updated.name,
          description: updated.description,
          taxProfile: updated.taxProfile,
          validFrom: updated.validFrom,
          validUntil: updated.validUntil,
        },
      },
    );

    return toPriceList(updated, this.repo.countActiveItemsForList(updated.id));
  }

  // ===========================================================================
  // activatePriceList
  // ===========================================================================

  public async activatePriceList(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<PriceList> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findListById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRICING-0007",
        message: "Arşivli fiyat listesi aktifleştirilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0007",
        details: { id },
      });
    }
    if (existing.status === "active") {
      // Idempotent: zaten aktif.
      return toPriceList(
        existing,
        this.repo.countActiveItemsForList(existing.id),
      );
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-PRICING-0006",
        message: "Yalnızca taslak (draft) fiyat listesi aktifleştirilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0006",
        details: { id, status: existing.status },
      });
    }
    if (this.repo.countItemsForList(id) === 0) {
      throw new DomainError({
        errorCode: "VET-PRICING-0010",
        message: "Aktifleştirmek için en az bir fiyat satırı gerekli",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0010",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    const updated = this.repo.updateList(tenantId, id, {
      status: "active",
      updatedAt: nowIso,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:price_list.activate",
      "price_list",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      { name: updated.name, type: updated.type, action: "activate" },
    );

    return toPriceList(updated, this.repo.countActiveItemsForList(updated.id));
  }

  // ===========================================================================
  // archivePriceList
  // ===========================================================================

  public async archivePriceList(
    tenantId: string,
    id: string,
    input: PriceListArchiveInput,
    actor: ActorContext,
  ): Promise<PriceList> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findListById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { id },
      });
    }
    if (existing.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRICING-0007",
        message: "Fiyat listesi zaten arşivlenmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0007",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    const updated = this.repo.updateList(tenantId, id, {
      archivedAt: nowIso,
      archivedBy: actor.actorId ?? "system",
      archiveReason: input.reason,
      status: "archived",
      updatedAt: nowIso,
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { id },
      });
    }

    await this.audit.recordSimple(
      "audit:price_list.archive",
      "price_list",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      { name: existing.name, reason: input.reason },
    );

    return toPriceList(updated, this.repo.countActiveItemsForList(updated.id));
  }

  // ===========================================================================
  // addItem
  // ===========================================================================

  public async addItem(
    tenantId: string,
    listId: string,
    input: PriceListItemCreateInput,
    actor: ActorContext,
  ): Promise<PriceListItem> {
    this.requireTenantScope(actor, tenantId);

    const list = this.repo.findListById(tenantId, listId);
    if (!list) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { listId },
      });
    }
    if (list.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRICING-0007",
        message: "Arşivli listeye satır eklenemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0007",
        details: { listId },
      });
    }
    if (list.status !== "draft" && list.status !== "active") {
      throw new DomainError({
        errorCode: "VET-PRICING-0006",
        message: "Yalnızca draft veya aktif listeye satır eklenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0006",
        details: { listId, status: list.status },
      });
    }

    // Ürün varlık + arşiv kontrolü (cross-module).
    const product = await this.products.getProduct(
      tenantId,
      input.productId,
      actor,
    );
    if (!product) {
      throw new DomainError({
        errorCode: "VET-PRICING-0008",
        message: "Ürün bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0008",
        details: { productId: input.productId },
      });
    }
    if (product.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRICING-0009",
        message: "Arşivli ürüne fiyat satırı eklenemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0009",
        details: { productId: input.productId },
      });
    }

    // Fiyat normalize + validation.
    const price = this.normalizePriceOrThrow(input.price);

    // Item-level tarih aralığı kontrolü.
    if (
      input.validFrom !== undefined &&
      input.validUntil !== undefined &&
      new Date(input.validFrom).getTime() > new Date(input.validUntil).getTime()
    ) {
      throw new DomainError({
        errorCode: "VET-PRICING-0004",
        message: "Geçersiz tarih aralığı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0004",
        details: {
          validFrom: input.validFrom,
          validUntil: input.validUntil,
        },
      });
    }

    // Aynı ürün için aynı listede aktif satır varsa reddet.
    const existing = this.repo.findActiveItemByProductInList(
      tenantId,
      listId,
      input.productId,
    );
    if (existing) {
      throw new DomainError({
        errorCode: "VET-PRICING-0003",
        message:
          "Bu ürün için zaten aktif bir satır var (düzeltme için updateItem kullanın)",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0003",
        details: { listId, productId: input.productId, itemId: existing.id },
      });
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextItemId(tenantId);
    const record: PriceListItemRecord = this.repo.toItemRecord({
      id,
      tenantId,
      priceListId: listId,
      productId: input.productId,
      price,
      taxProfile: input.taxProfile ?? list.taxProfile,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      status: "active",
      supersedesId: null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    });
    this.repo.insertItem(record);

    await this.audit.recordSimple(
      "audit:price_list_item.create",
      "price_list_item",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        priceListId: listId,
        productId: record.productId,
        price: record.price,
        taxProfile: record.taxProfile,
        validFrom: record.validFrom,
        validUntil: record.validUntil,
      },
    );

    return toPriceListItem(record);
  }

  // ===========================================================================
  // listItems
  // ===========================================================================

  public async listItems(
    tenantId: string,
    listId: string,
    filters: PriceListItemFilters,
    actor: ActorContext,
  ): Promise<PriceListItemListResponse> {
    this.requireTenantScope(actor, tenantId);
    const list = this.repo.findListById(tenantId, listId);
    if (!list) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { listId },
      });
    }
    const result = this.repo.searchItems(tenantId, {
      productId: filters.productId,
      status: filters.status,
      limit: filters.limit,
      offset: filters.offset,
    });
    // Listeye ait satırları filtrele.
    const items = result.items.filter((r) => r.priceListId === listId);
    return {
      items: items.map((r) => toPriceListItem(r)),
      total: items.length,
    };
  }

  // ===========================================================================
  // updateItem (append-only)
  // ===========================================================================

  public async updateItem(
    tenantId: string,
    listId: string,
    itemId: string,
    input: PriceListItemUpdateInput,
    actor: ActorContext,
  ): Promise<PriceListItem> {
    this.requireTenantScope(actor, tenantId);

    const list = this.repo.findListById(tenantId, listId);
    if (!list) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { listId },
      });
    }
    if (list.archivedAt !== null) {
      throw new DomainError({
        errorCode: "VET-PRICING-0007",
        message: "Arşivli listede satır düzeltilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0007",
        details: { listId, itemId },
      });
    }
    if (list.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-PRICING-0006",
        message:
          "Yalnızca taslak (draft) listede satır düzeltilebilir; aktif listede yeni liste oluşturun",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0006",
        details: { listId, status: list.status },
      });
    }

    const existing = this.repo.findItemById(tenantId, itemId);
    if (!existing || existing.priceListId !== listId) {
      throw new DomainError({
        errorCode: "VET-PRICING-0008",
        message: "Fiyat satırı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0008",
        details: { listId, itemId },
      });
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-PRICING-0007",
        message: "Yalnızca aktif fiyat satırı düzeltilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0007",
        details: { listId, itemId, status: existing.status },
      });
    }

    // Item-level tarih aralığı kontrolü.
    const newValidFrom =
      input.validFrom !== undefined ? input.validFrom : existing.validFrom;
    const newValidUntil =
      input.validUntil !== undefined ? input.validUntil : existing.validUntil;
    if (
      newValidFrom !== null &&
      newValidUntil !== null &&
      new Date(newValidFrom).getTime() > new Date(newValidUntil).getTime()
    ) {
      throw new DomainError({
        errorCode: "VET-PRICING-0004",
        message: "Geçersiz tarih aralığı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0004",
        details: {
          validFrom: newValidFrom,
          validUntil: newValidUntil,
        },
      });
    }

    // Fiyat normalize.
    const price =
      input.price !== undefined
        ? this.normalizePriceOrThrow(input.price)
        : existing.price;

    // 1) Eski satırı superseded yap.
    const nowIso = new Date().toISOString();
    this.repo.updateItem(tenantId, itemId, {
      status: "superseded",
    });

    // 2) Yeni satır oluştur.
    const newId = this.repo.nextItemId(tenantId);
    const newRecord: PriceListItemRecord = this.repo.toItemRecord({
      id: newId,
      tenantId,
      priceListId: listId,
      productId: existing.productId,
      price,
      taxProfile:
        input.taxProfile !== undefined ? input.taxProfile : existing.taxProfile,
      validFrom: newValidFrom,
      validUntil: newValidUntil,
      status: "active",
      supersedesId: itemId,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    });
    this.repo.insertItem(newRecord);

    await this.audit.recordSimple(
      "audit:price_list_item.amend",
      "price_list_item",
      newId,
      "amend",
      this.actorToAuditActor(actor),
      "warning",
      {
        priceListId: listId,
        productId: newRecord.productId,
        supersedesId: itemId,
        before: { price: existing.price, taxProfile: existing.taxProfile },
        after: { price: newRecord.price, taxProfile: newRecord.taxProfile },
      },
    );

    return toPriceListItem(newRecord);
  }

  // ===========================================================================
  // cancelItem
  // ===========================================================================

  public async cancelItem(
    tenantId: string,
    listId: string,
    itemId: string,
    actor: ActorContext,
  ): Promise<PriceListItem> {
    this.requireTenantScope(actor, tenantId);
    const list = this.repo.findListById(tenantId, listId);
    if (!list) {
      throw new DomainError({
        errorCode: "VET-PRICING-0001",
        message: "Fiyat listesi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0001",
        details: { listId },
      });
    }
    const existing = this.repo.findItemById(tenantId, itemId);
    if (!existing || existing.priceListId !== listId) {
      throw new DomainError({
        errorCode: "VET-PRICING-0008",
        message: "Fiyat satırı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0008",
        details: { listId, itemId },
      });
    }
    if (existing.status === "cancelled") {
      // Idempotent.
      return toPriceListItem(existing);
    }
    if (existing.status !== "active") {
      throw new DomainError({
        errorCode: "VET-PRICING-0007",
        message: "Yalnızca aktif fiyat satırı iptal edilebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0007",
        details: { listId, itemId, status: existing.status },
      });
    }

    const updated = this.repo.updateItem(tenantId, itemId, {
      status: "cancelled",
    });
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PRICING-0008",
        message: "Fiyat satırı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0008",
        details: { listId, itemId },
      });
    }

    await this.audit.recordSimple(
      "audit:price_list_item.cancel",
      "price_list_item",
      itemId,
      "cancel",
      this.actorToAuditActor(actor),
      "warning",
      { listId, productId: updated.productId },
    );

    return toPriceListItem(updated);
  }

  // ===========================================================================
  // resolveProductPrice
  // ===========================================================================

  /**
   * Bir ürün için belirtilen tarihte geçerli olan tüm aktif fiyat
   * adaylarını döner. Resolver önceliği: customer_specific >
   * promotional > standard. Aynı türden birden fazla liste varsa
   * en yeni createdAt öncelikli. Hiç aday yoksa 404
   * VET-PRICING-0011.
   */
  public async resolveProductPrice(
    tenantId: string,
    productId: string,
    effectiveAt: Date,
    actor: ActorContext,
  ): Promise<ProductPriceResolution> {
    this.requireTenantScope(actor, tenantId);
    const items = this.repo.findActiveItemsByProduct(tenantId, productId);
    const candidates: ProductPriceResolution["candidates"] = [];
    for (const it of items) {
      const list = this.repo.findListById(tenantId, it.priceListId);
      if (!list) continue;
      if (list.archivedAt !== null) continue;
      if (list.status !== "active") continue;
      // Liste düzeyinde tarih kontrolü.
      if (
        list.validFrom !== null &&
        new Date(list.validFrom).getTime() > effectiveAt.getTime()
      )
        continue;
      if (
        list.validUntil !== null &&
        new Date(list.validUntil).getTime() < effectiveAt.getTime()
      )
        continue;
      // Item düzeyinde tarih kontrolü.
      if (
        it.validFrom !== null &&
        new Date(it.validFrom).getTime() > effectiveAt.getTime()
      )
        continue;
      if (
        it.validUntil !== null &&
        new Date(it.validUntil).getTime() < effectiveAt.getTime()
      )
        continue;
      candidates.push({
        priceListId: list.id,
        priceListName: list.name,
        priceListType: list.type,
        itemId: it.id,
        price: it.price,
        taxProfile: it.taxProfile,
        validFrom: it.validFrom,
        validUntil: it.validUntil,
      });
    }
    if (candidates.length === 0) {
      throw new DomainError({
        errorCode: "VET-PRICING-0011",
        message: "Geçerli fiyat bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0011",
        details: { productId },
      });
    }
    // Adayları tür önceliği + tarihe göre sırala.
    candidates.sort((a, b) => {
      const PRIORITY: Record<string, number> = {
        customer_specific: 3,
        promotional: 2,
        standard: 1,
      };
      const pa = PRIORITY[a.priceListType] ?? 0;
      const pb = PRIORITY[b.priceListType] ?? 0;
      if (pa !== pb) return pb - pa;
      const va = a.validFrom ?? "";
      const vb = b.validFrom ?? "";
      return vb.localeCompare(va);
    });
    return {
      productId,
      resolvedAt: effectiveAt.toISOString(),
      candidates,
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }

  private normalizePriceOrThrow(value: string): string {
    const normalized = normalizePricingDecimal(value);
    if (normalized === null) {
      throw new DomainError({
        errorCode: "VET-PRICING-0010",
        message: "Geçersiz fiyat formatı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PRICING-0010",
        details: { price: value },
      });
    }
    return normalized;
  }
}
