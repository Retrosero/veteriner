/**
 * @file Superadmin hata olayı detay ve çözüm bileşeni.
 * @module @vetniva/web/components/superadmin/error-event-detail
 * @description Seçilen hata olayının ayrıntısını, durum geçişini,
 * append-only çözüm notlarını, destek bağlantısını, atamayı ve
 * birleşik audit timeline'ı yetkili API üzerinden yönetir.
 * @security Tenant, aktör veya atanan kullanıcı bilgisi tarayıcıdan
 * türetilmez. Tüm çağrılar yalnız oturum çereziyle yapılır; backend
 * `audit:log:read` kontrolünü uygular ve notları PII açısından maskeler.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { getLabels, type Locale } from "../../lib/labels";
import { safeLabelLookup } from "../../lib/safe-lookup";

type ErrorStatus = "new" | "investigating" | "resolved" | "reopened";

type ErrorEventDetailRecord = {
  id: string;
  errorCode: string;
  message: string;
  module: string;
  severity: string;
  status: ErrorStatus;
  fingerprint: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  route: string;
  release: string;
  stack?: string | null;
  assignedToUserId?: string | null;
};

type ErrorNote = {
  id: string;
  body: string;
  visibility: "internal" | "shared";
  createdAt: string;
};

type NoteList = { items: ErrorNote[]; total: number };

/* --------------------------------------------------------------------------
 * Audit timeline tipleri — GOAL-104 next-tick
 * --------------------------------------------------------------------------
 */

type AuditAction =
  | "status_transition"
  | "note_added"
  | "support_link_added"
  | "assignment_changed"
  | "occurrence_recorded";

type AuditEntry = {
  id: string;
  fingerprint: string;
  action: AuditAction;
  occurredAt: string;
  actorId: string;
  actorType: string;
  details: Record<string, unknown>;
};

type AuditList = { items: AuditEntry[]; total: number; fingerprint: string };

export type ErrorEventDetailProps = {
  eventId: string;
  locale: Locale;
};

/**
 * `details: Record<string, unknown>` içinden belirli bir anahtarı
 * `string` olarak güvenli okur. Doğrudan `d[key]` erişimi
 * `security/detect-object-injection` kuralını tetiklediğinden
 * `Object.entries` + `find` deseni ile anahtar eşleştirmesi yapılır.
 * `typeof` daraltması `no-base-to-string` kuralını bypass eder; değer
 * string değilse `fallback` döner.
 * @param d
 * @param key
 * @param fallback
 */
function detailString(
  d: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const entry = Object.entries(d).find(([k]) => k === key);
  if (!entry) return fallback;
  const v = entry[1];
  return typeof v === "string" ? v : fallback;
}

/**
 * `details` içinden opsiyonel string okur; boş string'ler de yok
 * sayılır. JSX koşullu render için uygundur.
 * @param d
 * @param key
 */
function detailOptString(
  d: Record<string, unknown>,
  key: string,
): string | undefined {
  const entry = Object.entries(d).find(([k]) => k === key);
  if (!entry) return undefined;
  const v = entry[1];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * `details` içinde belirli bir anahtar truthy olarak var mı? Direkt
 * `d[key]` erişimi `security/detect-object-injection` kuralını
 * tetiklediğinden `Object.entries` + `find` deseni ile kontrol edilir.
 * @param d
 * @param key
 */
function detailHas(
  d: Record<string, unknown>,
  key: string,
): boolean {
  const entry = Object.entries(d).find(([k]) => k === key);
  if (!entry) return false;
  return Boolean(entry[1]);
}

/** Tek bir audit entry'sini aksiyona göre render eder. */
function renderAuditDetails(
  entry: AuditEntry,
  labels: ReturnType<typeof getLabels>["errorCenter"]["detail"]["audit"],
): JSX.Element {
  const d = entry.details;
  switch (entry.action) {
    case "status_transition": {
      const reason = detailOptString(d, "reason");
      return (
        <span>
          <strong>{detailString(d, "fromStatus", "?")}</strong>
          {labels.fromToSeparator}
          <strong>{detailString(d, "toStatus", "?")}</strong>
          {reason ? (
            <span className="text-slate-600">
              {labels.reasonSeparator}
              {reason}
            </span>
          ) : null}
        </span>
      );
    }
    case "note_added": {
      const bodyPreview = detailOptString(d, "bodyPreview");
      return (
        <span>
          {labels.visibilityLabel}{" "}
          <strong>{detailString(d, "visibility", "internal")}</strong>
          {bodyPreview ? (
            <span className="block text-slate-600">{bodyPreview}</span>
          ) : null}
        </span>
      );
    }
    case "support_link_added": {
      const externalId = detailOptString(d, "externalId");
      const url = detailOptString(d, "url");
      return (
        <span>
          {labels.systemLabel}{" "}
          <strong>{detailString(d, "system", "?")}</strong>
          {externalId ? (
            <span className="ml-2 font-mono">{externalId}</span>
          ) : null}
          {url ? (
            <a
              className="ml-2 text-blue-700 underline"
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              {labels.actionLabels.support_link_added}
            </a>
          ) : null}
        </span>
      );
    }
    case "assignment_changed": {
      if (detailHas(d, "unassigned"))
        return <span>{labels.unassignedLabel}</span>;
      const reason = detailOptString(d, "reason");
      return (
        <span>
          {labels.assigneeLabel}{" "}
          <strong>{detailString(d, "assigneeId", "?")}</strong>
          {reason ? (
            <span className="text-slate-600">
              {labels.reasonSeparator}
              {reason}
            </span>
          ) : null}
        </span>
      );
    }
    case "occurrence_recorded":
      return <span>{detailString(d, "reason", "Yeni oluşum")}</span>;
    default:
      return <span className="text-slate-500">—</span>;
  }
}

/** Seçilen tek hata kaydının operasyonel çözüm görünümü. */
export function ErrorEventDetail({
  eventId,
  locale,
}: ErrorEventDetailProps): JSX.Element {
  const labels = getLabels(locale).errorCenter;
  const detailLabels = labels.detail;
  const statusLabels = labels.statusLabels;
  const auditLabels = detailLabels.audit;
  const [event, setEvent] = useState<ErrorEventDetailRecord | null>(null);
  const [notes, setNotes] = useState<ErrorNote[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [supportTitle, setSupportTitle] = useState("");
  const [status, setStatus] = useState<ErrorStatus>("new");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback((): void => {
    setError(null);
    void Promise.all([
      apiRequest<ErrorEventDetailRecord>(
        `/api/v1/superadmin/error-events/${eventId}`,
        { credentials: "include" },
      ),
      apiRequest<NoteList>(`/api/v1/superadmin/error-events/${eventId}/notes`, {
        credentials: "include",
      }),
      apiRequest<AuditList>(
        `/api/v1/superadmin/error-events/${eventId}/audit-log`,
        { credentials: "include" },
      ),
    ]).then(([eventResult, notesResult, auditResult]) => {
      if (!eventResult.ok || !notesResult.ok) {
        setError(detailLabels.errorLoad);
        return;
      }
      setEvent(eventResult.data);
      setStatus(eventResult.data.status);
      setNotes(notesResult.data.items);
      setAuditEntries(auditResult.ok ? auditResult.data.items : []);
    });
  }, [eventId, detailLabels.errorLoad]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    const result = await apiRequest<unknown>(
      `/api/v1/superadmin/error-events/${eventId}/status`,
      {
        method: "PATCH",
        credentials: "include",
        body: { toStatus: status },
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(detailLabels.statusUpdateError);
      return;
    }
    load();
  };

  const addNote = async (): Promise<void> => {
    const body = noteBody.trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    const result = await apiRequest<ErrorNote>(
      `/api/v1/superadmin/error-events/${eventId}/notes`,
      {
        method: "POST",
        credentials: "include",
        body: { body, visibility: "internal" },
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(detailLabels.notes.saveError);
      return;
    }
    setNoteBody("");
    setNotes((current) => [...current, result.data]);
  };

  const updateAssignment = async (unassign = false): Promise<void> => {
    if (!unassign && !assigneeId.trim()) return;
    setSaving(true);
    setError(null);
    const result = await apiRequest<unknown>(
      `/api/v1/superadmin/error-events/${eventId}/assignment`,
      {
        method: "PATCH",
        credentials: "include",
        body: unassign
          ? {
              unassign: true,
              reason: assignmentReason.trim() || undefined,
            }
          : {
              assigneeId: assigneeId.trim(),
              reason: assignmentReason.trim() || undefined,
            },
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(detailLabels.assignment.updateError);
      return;
    }
    setAssigneeId("");
    setAssignmentReason("");
    load();
  };

  const addSupportLink = async (): Promise<void> => {
    if (!supportUrl.trim() && !supportTitle.trim()) return;
    setSaving(true);
    setError(null);
    const result = await apiRequest<unknown>(
      `/api/v1/superadmin/error-events/${eventId}/support-links`,
      {
        method: "POST",
        credentials: "include",
        body: {
          system: "other",
          url: supportUrl.trim() || undefined,
          title: supportTitle.trim() || undefined,
        },
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(detailLabels.support.saveError);
      return;
    }
    setSupportUrl("");
    setSupportTitle("");
  };

  return (
    <aside
      aria-label={detailLabels.title}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-medium text-slate-900">{detailLabels.title}</h2>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {!event ? <p className="text-sm text-slate-500">{detailLabels.loading}</p> : null}
      {event ? (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{detailLabels.code}</dt>
              <dd className="font-mono">{event.errorCode}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{detailLabels.module}</dt>
              <dd>{event.module}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{detailLabels.fingerprint}</dt>
              <dd className="font-mono">{event.fingerprint}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{detailLabels.occurrence}</dt>
              <dd>{event.occurrenceCount}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{detailLabels.firstSeen}</dt>
              <dd>
                {new Date(event.firstSeenAt).toLocaleString()} /{" "}
                {new Date(event.lastSeenAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{detailLabels.release}</dt>
              <dd>{event.release}</dd>
            </div>
          </dl>
          <p className="rounded bg-slate-50 p-3 text-sm text-slate-800">
            {event.message}
          </p>
          <p className="text-xs text-slate-500">
            {detailLabels.route}: {event.route}
          </p>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <label className="text-sm text-slate-700">
              {detailLabels.changeStatus}
              <select
                className="ml-2 rounded border p-2"
                onChange={(input) =>
                  setStatus(input.target.value as ErrorStatus)
                }
                value={status}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={saving || status === event.status}
              onClick={() => void updateStatus()}
              type="button"
            >
              {detailLabels.saveStatus}
            </button>
          </div>
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-medium text-slate-900">
              {detailLabels.assignment.title}
            </h3>
            <p className="text-sm text-slate-600">
              {detailLabels.assignment.current}:{" "}
              {event.assignedToUserId ?? detailLabels.assignment.unassigned}
            </p>
            <label className="block text-sm text-slate-700">
              {detailLabels.assignment.userId}
              <input
                className="mt-1 w-full rounded border p-2"
                onChange={(input) => setAssigneeId(input.target.value)}
                value={assigneeId}
              />
            </label>
            <label className="block text-sm text-slate-700">
              {detailLabels.assignment.note}
              <input
                className="mt-1 w-full rounded border p-2"
                onChange={(input) => setAssignmentReason(input.target.value)}
                value={assignmentReason}
              />
            </label>
            <div className="flex gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                disabled={saving || !assigneeId.trim()}
                onClick={() => void updateAssignment()}
                type="button"
              >
                {detailLabels.assignment.assign}
              </button>
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                disabled={saving || !event.assignedToUserId}
                onClick={() => void updateAssignment(true)}
                type="button"
              >
                {detailLabels.assignment.unassign}
              </button>
            </div>
          </section>
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-medium text-slate-900">
              {detailLabels.notes.title}
            </h3>
            {notes.map((note) => (
              <article
                className="rounded bg-slate-50 p-3 text-sm"
                key={note.id}
              >
                <p>{note.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {safeLabelLookup(detailLabels.notes.visibility, note.visibility, note.visibility)}{" "}
                  · {new Date(note.createdAt).toLocaleString()}
                </p>
              </article>
            ))}
            <label className="block text-sm text-slate-700">
              {detailLabels.notes.add}
              <textarea
                className="mt-1 w-full rounded border p-2"
                onChange={(input) => setNoteBody(input.target.value)}
                value={noteBody}
              />
            </label>
            <button
              className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              disabled={saving || !noteBody.trim()}
              onClick={() => void addNote()}
              type="button"
            >
              {detailLabels.notes.addButton}
            </button>
          </section>
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-medium text-slate-900">
              {detailLabels.support.title}
            </h3>
            <label className="block text-sm text-slate-700">
              {detailLabels.support.url}
              <input
                className="mt-1 w-full rounded border p-2"
                onChange={(input) => setSupportUrl(input.target.value)}
                type="url"
                value={supportUrl}
              />
            </label>
            <label className="block text-sm text-slate-700">
              {detailLabels.support.titleField}
              <input
                className="mt-1 w-full rounded border p-2"
                onChange={(input) => setSupportTitle(input.target.value)}
                value={supportTitle}
              />
            </label>
            <button
              className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              disabled={saving || (!supportUrl.trim() && !supportTitle.trim())}
              onClick={() => void addSupportLink()}
              type="button"
            >
              {detailLabels.support.addButton}
            </button>
          </section>
          <section
            aria-label={auditLabels.title}
            className="space-y-3 border-t pt-4"
          >
            <h3 className="font-medium text-slate-900">{auditLabels.title}</h3>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-slate-500">{auditLabels.empty}</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {auditEntries.map((entry) => (
                  <li
                    className="rounded border border-slate-200 bg-slate-50 p-3"
                    key={entry.id}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{new Date(entry.occurredAt).toLocaleString()}</span>
                      <span>·</span>
                      <span>
                        {safeLabelLookup(auditLabels.actionLabels, entry.action, entry.action)}
                      </span>
                      <span>·</span>
                      <span>
                        {entry.actorType === "system"
                          ? auditLabels.actorSystem
                          : entry.actorId}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-800">
                      {renderAuditDetails(entry, auditLabels)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </aside>
  );
}
