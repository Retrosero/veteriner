/**
 * @file Mock e-SMM provider adapter.
 * @module apps/api/common/esmm/mock-esmm-adapter
 * @description GOAL-077 (FAZ-7) e-SMM provider mock
 *   implementasyonu. Gerçek provider entegrasyonu (Faz 13+)
 *   olmadığı için bu adapter:
 *   - `submitDocument`: payload'a bakarak mock belge numarası
 *     üretir ve `accepted` durumunu döner.
 *   - `queryDocument`: önceki yanıtı sakladığı map'ten döner
 *     (idempotency benzeri).
 *   - `cancelDocument`: `cancelled` durumunu döner.
 *
 *   Operatör ayrıca `manualDocumentNumber` ile kayıt açabilir
 *   (provider'a göndermeden).
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import { Injectable } from "@nestjs/common";

import type { EsmmAdapter } from "./esmm.types.js";
import type { EsmmSubmitRequest, EsmmSubmitResponse } from "@vetniva/contracts";

@Injectable()
export class MockEsmmAdapter implements EsmmAdapter {
  public readonly providerName = "mock";
  /** Idempotency key → önceki yanıt. */
  private readonly responses = new Map<string, EsmmSubmitResponse>();
  /** ProviderDocumentId → yanıt. */
  private readonly byId = new Map<string, EsmmSubmitResponse>();
  /** Her tenant için sayaç (mock fatura no üretimi). */
  private readonly counters = new Map<string, number>();

  public async submitDocument(
    request: EsmmSubmitRequest,
  ): Promise<EsmmSubmitResponse> {
    // Idempotent: aynı key ile önceki yanıtı döner.
    const existing = this.responses.get(request.idempotencyKey);
    if (existing) {
      return existing;
    }

    const tenantKey = `${request.type}:${this.extractTenantKey(request)}`;
    const n = (this.counters.get(tenantKey) ?? 0) + 1;
    this.counters.set(tenantKey, n);

    const providerDocumentId = `mock-${request.documentId}`;
    const providerDocumentNumber = `MOCK-${request.type.toUpperCase()}-${String(
      n,
    ).padStart(8, "0")}`;
    const respondedAt = new Date().toISOString();
    const response: EsmmSubmitResponse = {
      status: "accepted",
      providerDocumentId,
      providerDocumentNumber,
      providerMessage: "mock provider accepted (no real integration)",
      respondedAt,
    };
    this.responses.set(request.idempotencyKey, response);
    this.byId.set(providerDocumentId, response);
    return response;
  }

  public async queryDocument(
    providerDocumentId: string,
  ): Promise<EsmmSubmitResponse> {
    const existing = this.byId.get(providerDocumentId);
    if (existing) return existing;
    return {
      status: "failed",
      providerDocumentId,
      providerDocumentNumber: null,
      providerMessage: "mock provider: unknown document",
      respondedAt: new Date().toISOString(),
    };
  }

  public async cancelDocument(
    providerDocumentId: string,
  ): Promise<EsmmSubmitResponse> {
    const respondedAt = new Date().toISOString();
    const response: EsmmSubmitResponse = {
      status: "cancelled",
      providerDocumentId,
      providerDocumentNumber: null,
      providerMessage: "mock provider cancelled",
      respondedAt,
    };
    this.byId.set(providerDocumentId, response);
    return response;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.responses.clear();
    this.byId.clear();
    this.counters.clear();
  }

  private extractTenantKey(req: EsmmSubmitRequest): string {
    // Payload içinde tenantId olabilir; yoksa documentId'den
    // türet (mock için yeterli).
    const t = req.payload["tenantId"];
    if (typeof t === "string" && t.length > 0) return t;
    return req.documentId.slice(0, 8);
  }
}
