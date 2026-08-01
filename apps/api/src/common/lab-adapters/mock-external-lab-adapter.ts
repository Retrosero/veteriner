/**
 * @file Dış laboratuvar mock adapter'ı.
 * @module apps/api/common/lab-adapters/mock-external-lab-adapter
 * @description GOAL-094 (FAZ-9) external_lab mock implementasyonu.
 *   Gerçek provider (Reflab/Ankara Lab/...) entegrasyonu Faz 13+
 *   kapsamında.
 *
 *   Mock davranışı:
 *   - `exportOrder`: aynı `idempotencyKey` ile tekrar gelirse önceki
 *     yanıtı döner (duplicate lab kaydı önlenir). payload'da
 *     `simulateFailure=true` gelirse rejected yanıtı üretir.
 *     Provider reference: `ext-{orderId}-{tenantHash}` deterministik.
 *   - `importResult`: aynı providerReference ile aynı payload'ı
 *     döner; yeni referans ise payload'ı saklar.
 *
 *   Klinik içi cihazdan farkı: provider reference format
 *   dış lab formatındadır (tenant bilgisi + uzun id); import
 *   genellikle dış lab'ın API'sinden asenkron gelir (mock için
 *   senkron simüle ediyoruz).
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import { Injectable } from "@nestjs/common";

import type { LabAdapter } from "./lab-adapter.types.js";
import type {
  LabAdapterExportRequest,
  LabAdapterExportResponse,
  LabAdapterImportResult,
} from "@vetniva/contracts";

@Injectable()
export class MockExternalLabAdapter implements LabAdapter {
  public readonly adapterType = "external_lab" as const;
  public readonly providerName = "mock-external-lab";

  /** IdempotencyKey → önceki export yanıtı. */
  private readonly exportResponses = new Map<
    string,
    LabAdapterExportResponse
  >();
  /** ProviderReference → result. */
  private readonly results = new Map<string, LabAdapterImportResult>();
  /** Sayaç (tenant bazlı mock lab no). */
  private readonly counters = new Map<string, number>();

  public async exportOrder(
    request: LabAdapterExportRequest,
  ): Promise<LabAdapterExportResponse> {
    // Idempotent: aynı key ile önceki yanıtı döner.
    const existing = this.exportResponses.get(request.idempotencyKey);
    if (existing) {
      return existing;
    }

    // payload içinde simulateFailure=true gelirse rejected üret.
    if (request.payload["simulateFailure"] === true) {
      const rejected: LabAdapterExportResponse = {
        status: "rejected",
        providerReference: null,
        providerMessage: "mock external lab: simulated rejection",
        rawResponse: {
          code: "SIMULATED_REJECTION",
          reason: "patient data incomplete",
        },
        respondedAt: new Date().toISOString(),
      };
      this.exportResponses.set(request.idempotencyKey, rejected);
      return rejected;
    }

    const tenantKey = toPrimitiveString(
      request.payload["tenantId"],
      request.labOrderId,
    );
    const n = (this.counters.get(tenantKey) ?? 0) + 1;
    this.counters.set(tenantKey, n);
    const tenantHash = this.simpleHash(tenantKey).toString(16).slice(0, 6);
    const providerReference = `ext-${request.labOrderId}-${tenantHash}-${String(
      n,
    ).padStart(5, "0")}`;
    const respondedAt = new Date().toISOString();
    const response: LabAdapterExportResponse = {
      status: "accepted",
      providerReference,
      providerMessage: "mock external lab: order accepted",
      rawResponse: {
        code: "ACCEPTED",
        labCode: "MOCK-EXT",
        queuePosition: n,
        idempotencyKey: request.idempotencyKey,
      },
      respondedAt,
    };
    this.exportResponses.set(request.idempotencyKey, response);
    this.results.set(providerReference, {
      providerReference,
      receivedAt: respondedAt,
      rawPayload: this.synthesizeResultPayload(request),
    });
    return response;
  }

  public async importResult(
    request: LabAdapterImportResult,
  ): Promise<LabAdapterImportResult> {
    const existing = this.results.get(request.providerReference);
    if (existing) return existing;
    this.results.set(request.providerReference, request);
    return request;
  }

  /**
   * Test yardımcısı.
   * @param result
   */
  public seedResult(result: LabAdapterImportResult): void {
    this.results.set(result.providerReference, result);
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.exportResponses.clear();
    this.results.clear();
    this.counters.clear();
  }

  private synthesizeResultPayload(
    request: LabAdapterExportRequest,
  ): Record<string, unknown> {
    const code = toPrimitiveString(request.payload["labTestCode"], "GEN");
    return {
      labCode: "MOCK-EXT",
      labOrderId: request.labOrderId,
      idempotencyKey: request.idempotencyKey,
      readings: [
        {
          code,
          value: this.fakeValueFor(code),
          unit: request.payload["unit"] ?? "",
          referenceRange: request.payload["referenceRange"] ?? null,
        },
      ],
    };
  }

  private simpleHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  private fakeValueFor(code: string): string {
    let h = 0;
    for (let i = 0; i < code.length; i++) {
      h = (h * 17 + code.charCodeAt(i)) >>> 0;
    }
    const v = (h % 2000) / 10;
    return v.toFixed(2);
  }
}

/** Adapter payloadundaki primitive degeri guvenli metne donusturur. */
function toPrimitiveString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return fallback;
}
