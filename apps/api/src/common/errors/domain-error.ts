/**
 * @file Domain hata sınıfı.
 * @module apps/api/common/errors/domain-error
 *
 * @description Tüm domain hatalarının türeyeceği temel sınıf. Hata kodu,
 * HTTP durumu, severity ve i18n anahtarı taşır. Exception filter bu
 * sınıfı yakalayarak standart `ErrorResponse` formatına dönüştürür.
 *
 * @security Klinik/finansal içerik gövdede taşınmaz; yalnızca
 * yapısal hata bilgisi (kod, alan) bulunur. PII maskeleme filter'da
 * yapılır.
 *
 * @since GOAL-004 (FAZ-0) audit + log + hata standardı
 */

import type { ErrorCode, ErrorSeverity } from "@vetniva/contracts";

export class DomainError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly httpStatus: number;
  public readonly severity: ErrorSeverity;
  public readonly i18nKey: string | undefined;
  public readonly details: Record<string, unknown> | undefined;
  public readonly actionUrl: string | undefined;

  constructor(args: {
    errorCode: ErrorCode;
    message: string;
    httpStatus?: number;
    severity?: ErrorSeverity;
    i18nKey?: string;
    details?: Record<string, unknown>;
    actionUrl?: string;
  }) {
    super(args.message);
    this.name = "DomainError";
    this.errorCode = args.errorCode;
    this.httpStatus = args.httpStatus ?? 500;
    this.severity = args.severity ?? "error";
    this.i18nKey = args.i18nKey;
    this.details = args.details;
    this.actionUrl = args.actionUrl;
  }
}
