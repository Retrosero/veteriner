/**
 * @file Sağlık durumu kartı.
 * @module @vetniva/web/components/health-card
 *
 * @description API'nin `/api/v1/ready` endpoint'inden dönen
 * `ReadinessResponse`'i görüntüler. Üç durumu (ok / degraded / down)
 * renkli bir rozet ile gösterir; DB latency ve sürüm bilgisini
 * kullanıcıya sunar.
 *
 * @security Bilgiler teknik tanı bilgisi içerir; PII taşımaz.
 * Correlation ID görüntülenir ki destek ekibi aynı isteği loglardan
 * bulabilsin.
 */

import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@vetniva/ui";

import { type ReadinessResponse } from "@vetniva/contracts";

const STATUS_LABEL_KEY: Record<"ok" | "degraded" | "down", string> = {
  ok: "health.ok",
  degraded: "health.degraded",
  down: "health.down",
};

const STATUS_BADGE_CLASS: Record<"ok" | "degraded" | "down", string> = {
  ok: "bg-success-50 text-success-700 ring-1 ring-inset ring-success-500/20",
  degraded: "bg-warn-50 text-warn-700 ring-1 ring-inset ring-warn-500/20",
  down: "bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-500/20",
};

const COMPONENT_LABEL_KEY: Record<"db", string> = {
  db: "health.db",
};

export type HealthCardProps = {
  data: ReadinessResponse | null;
  error: string | null;
  correlationId: string | null;
  labels: {
    title: string;
    description: string;
    version: string;
    statusOk: string;
    statusDegraded: string;
    statusDown: string;
    db: string;
    latency: string;
    correlation: string;
    errorTitle: string;
    noData: string;
  };
};

function getStatusLabelKey(status: "ok" | "degraded" | "down"): string {
  return STATUS_LABEL_KEY[status];
}

function getStatusBadgeClass(status: "ok" | "degraded" | "down"): string {
  return STATUS_BADGE_CLASS[status];
}

/**
 * Readiness yanıtını ve varsa hatayı tek bir kartta gösterir. Loading
 * durumu server-side fetch nedeniyle bu bileşene ulaşmaz; sayfa
 * düzeyinde suspense ile yönetilir.
 */
export function HealthCard({
  data,
  error,
  correlationId,
  labels,
}: HealthCardProps): JSX.Element {
  if (error !== null) {
    return (
      <Card data-testid="health-card-error">
        <CardHeader>
          <CardTitle>{labels.errorTitle}</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        {correlationId !== null && (
          <CardBody>
            <p className="text-xs text-gray-500">
              {labels.correlation}:{" "}
              <span className="font-mono">{correlationId}</span>
            </p>
          </CardBody>
        )}
      </Card>
    );
  }

  if (data === null) {
    return (
      <Card data-testid="health-card-empty">
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          <CardDescription>{labels.noData}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const db = data.components.db;
  const statusLabel =
    data.status === "ok"
      ? labels.statusOk
      : data.status === "degraded"
        ? labels.statusDegraded
        : labels.statusDown;

  return (
    <Card data-testid="health-card" aria-live="polite">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{labels.title}</CardTitle>
            <CardDescription>{labels.description}</CardDescription>
          </div>
          <span
            data-testid="health-status-badge"
            data-status={data.status}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              getStatusBadgeClass(data.status),
            )}
          >
            {statusLabel}
          </span>
        </div>
      </CardHeader>
      <CardBody>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">{labels.version}</dt>
            <dd className="font-mono text-gray-900">
              {data.version.name}@{data.version.version}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-500">{labels.db}</dt>
            <dd className="flex items-center gap-2">
              <span
                data-testid="db-status"
                data-status={db.status}
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-xs",
                  getStatusBadgeClass(db.status),
                )}
              >
                {db.status}
              </span>
              {db.latency_ms !== undefined && (
                <span className="text-xs text-gray-500">
                  {labels.latency}: {db.latency_ms}ms
                </span>
              )}
            </dd>
          </div>
          {db.message !== undefined && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">Message</dt>
              <dd className="text-gray-700">{db.message}</dd>
            </div>
          )}
          {correlationId !== null && (
            <div className="sm:col-span-2">
              <dt className="text-gray-500">{labels.correlation}</dt>
              <dd className="font-mono text-xs text-gray-700">
                {correlationId}
              </dd>
            </div>
          )}
        </dl>
      </CardBody>
    </Card>
  );
}

// İleride i18n anahtarlarıyla dinamik çözümleme için referans olarak
// dışa aktarılır. Şu an HealthCard etiketleri props ile alıyor; ancak
// tip güvenliği için anahtarlar dışa aktarılmaya hazır.
export const HEALTH_I18N_KEYS = {
  ...STATUS_LABEL_KEY,
  ...COMPONENT_LABEL_KEY,
} as const;
