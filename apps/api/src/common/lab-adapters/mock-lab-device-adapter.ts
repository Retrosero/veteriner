/**
 * @file Klinik içi cihaz mock adapter'ı.
 * @module apps/api/common/lab-adapters/mock-lab-device-adapter
 *
 * @description GOAL-094 (FAZ-9) in_clinic_device mock
 *   implementasyonu. Gerçek cihaz (Idexx ProCyte/Heska HT5/...)
 *   entegrasyonu Faz 13+ kapsamında.
 *
 *   Mock davranışı:
 *   - `exportOrder`: aynı `idempotencyKey` ile tekrar gelirse önceki
 *     yanıtı döner (duplicate cihaz kaydı önlenir). payload'da
 *     `simulateFailure=true` gelirse rejected yanıtı üretir.
 *     Provider reference: `dev-{orderId}` deterministik.
 *   - `importResult`: cihaz tarafında "sonuç geldi" simülasyonu;
 *     verilen providerReference ile aynı payload'ı döner.
 *     payload içinde `rawPayload` (cihazın okuduğu değerler) yer
 *     alır.
 *
 *   Operatör ayrıca `importResult` ile dışarıdan gelen sonucu
 *   (ör. manuel girilmiş) de sisteme alabilir.
 *
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import { Injectable } from "@nestjs/common";

import type {
  LabAdapterExportRequest,
  LabAdapterExportResponse,
  LabAdapterImportResult,
} from "@vetniva/contracts";

import type { LabAdapter } from "./lab-adapter.types.js";

@Injectable()
export class MockLabDeviceAdapter implements LabAdapter {
  public readonly adapterType = "in_clinic_device" as const;
  public readonly providerName = "mock-device";

  /** idempotencyKey → önceki export yanıtı. */
  private readonly exportResponses = new Map<
    string,
    LabAdapterExportResponse
  >();
  /** providerReference → simulated raw payload. */
  private readonly simulatedResults = new Map<string, LabAdapterImportResult>();

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
      const failed: LabAdapterExportResponse = {
        status: "rejected",
        providerReference: null,
        providerMessage: "mock device: simulated failure",
        rawResponse: {
          code: "SIMULATED_FAILURE",
          idempotencyKey: request.idempotencyKey,
        },
        respondedAt: new Date().toISOString(),
      };
      this.exportResponses.set(request.idempotencyKey, failed);
      return failed;
    }

    const providerReference = `dev-${request.labOrderId}`;
    const respondedAt = new Date().toISOString();
    const response: LabAdapterExportResponse = {
      status: "accepted",
      providerReference,
      providerMessage: "mock device: order accepted",
      rawResponse: {
        code: "ACCEPTED",
        deviceSerial: "MOCK-DEV-001",
        idempotencyKey: request.idempotencyKey,
      },
      respondedAt,
    };
    this.exportResponses.set(request.idempotencyKey, response);
    // Import simülasyonu için raw payload sakla.
    this.simulatedResults.set(providerReference, {
      providerReference,
      receivedAt: respondedAt,
      rawPayload: this.synthesizeResultPayload(request),
    });
    return response;
  }

  public async importResult(
    request: LabAdapterImportResult,
  ): Promise<LabAdapterImportResult> {
    const existing = this.simulatedResults.get(request.providerReference);
    if (existing) {
      return existing;
    }
    // Yeni referans ise payload'ı sakla.
    this.simulatedResults.set(request.providerReference, request);
    return request;
  }

  /**
   * Test yardımcısı: importResult çağrılmadan önce bir sonucu
   * "gelmiş gibi" hazırlar (deterministik test).
   */
  public seedResult(result: LabAdapterImportResult): void {
    this.simulatedResults.set(result.providerReference, result);
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.exportResponses.clear();
    this.simulatedResults.clear();
  }

  /** Mock için deterministik sonuç payload'ı üretir. */
  private synthesizeResultPayload(
    request: LabAdapterExportRequest,
  ): Record<string, unknown> {
    // payload içinde test kodu varsa (snapshot'tan) değer üret.
    const code = String(request.payload["labTestCode"] ?? "GEN");
    const base: Record<string, unknown> = {
      deviceSerial: "MOCK-DEV-001",
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
    return base;
  }

  private fakeValueFor(code: string): string {
    // Çok basit deterministik değer (test için).
    let h = 0;
    for (let i = 0; i < code.length; i++) {
      h = (h * 31 + code.charCodeAt(i)) >>> 0;
    }
    const v = (h % 1000) / 10;
    return v.toFixed(2);
  }
}
