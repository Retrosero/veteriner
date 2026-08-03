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

const STATUS_LABELS: Record<ErrorStatus, string> = {
  new: "Yeni",
  investigating: "İnceleniyor",
  resolved: "Çözüldü",
  reopened: "Yeniden açıldı",
};

const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  status_transition: "Durum geçişi",
  note_added: "Not eklendi",
  support_link_added: "Destek bağlantısı eklendi",
  assignment_changed: "Atama değişti",
  occurrence_recorded: "Yeni oluşum kaydedildi",
};

/** Tek bir audit entry'sini aksiyona göre render eder. */
function renderAuditDetails(entry: AuditEntry): JSX.Element {
  const d = entry.details;
  switch (entry.action) {
    case "status_transition":
      return (
        <span>
          <strong>{String(d["fromStatus"] ?? "?")}</strong>
          {" → "}
          <strong>{String(d["toStatus"] ?? "?")}</strong>
          {d["reason"] ? (
            <span className="text-slate-600"> — {String(d["reason"])}</span>
          ) : null}
        </span>
      );
    case "note_added":
      return (
        <span>
          Görünürlük: <strong>{String(d["visibility"] ?? "internal")}</strong>
          {d["bodyPreview"] ? (
            <span className="block text-slate-600">
              {String(d["bodyPreview"])}
            </span>
          ) : null}
        </span>
      );
    case "support_link_added":
      return (
        <span>
          Sistem: <strong>{String(d["system"] ?? "?")}</strong>
          {d["externalId"] ? (
            <span className="ml-2 font-mono">{String(d["externalId"])}</span>
          ) : null}
          {d["url"] ? (
            <a
              className="ml-2 text-blue-700 underline"
              href={String(d["url"])}
              rel="noreferrer"
              target="_blank"
            >
              Bağlantı
            </a>
          ) : null}
        </span>
      );
    case "assignment_changed":
      return d["unassigned"] ? (
        <span>Atama kaldırıldı</span>
      ) : (
        <span>
          Atanan: <strong>{String(d["assigneeId"] ?? "?")}</strong>
          {d["reason"] ? (
            <span className="text-slate-600"> — {String(d["reason"])}</span>
          ) : null}
        </span>
      );
    case "occurrence_recorded":
      return <span>{String(d["reason"] ?? "Yeni oluşum")}</span>;
    default:
      return <span className="text-slate-500">—</span>;
  }
}

/** Seçilen tek hata kaydının operasyonel çözüm görünümü. */
export function ErrorEventDetail({
  eventId,
}: {
  eventId: string;
}): JSX.Element {
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
        setError("Hata ayrıntısı şu anda yüklenemiyor.");
        return;
      }
      setEvent(eventResult.data);
      setStatus(eventResult.data.status);
      setNotes(notesResult.data.items);
      setAuditEntries(auditResult.ok ? auditResult.data.items : []);
    });
  }, [eventId]);

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
      setError("Durum güncellenemedi; geçiş kuralını kontrol edin.");
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
      setError("Çözüm notu kaydedilemedi.");
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
      setError("Hata ataması güncellenemedi.");
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
      setError("Destek bağlantısı kaydedilemedi.");
      return;
    }
    setSupportUrl("");
    setSupportTitle("");
  };

  return (
    <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium text-slate-900">Hata ayrıntısı</h2>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {!event ? <p className="text-sm text-slate-500">Yükleniyor…</p> : null}
      {event ? (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Kod</dt>
              <dd className="font-mono">{event.errorCode}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Modül</dt>
              <dd>{event.module}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Fingerprint</dt>
              <dd className="font-mono">{event.fingerprint}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Tekrar</dt>
              <dd>{event.occurrenceCount}</dd>
            </div>
            <div>
              <dt className="text-slate-500">İlk / son görülme</dt>
              <dd>
                {new Date(event.firstSeenAt).toLocaleString()} /{" "}
                {new Date(event.lastSeenAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Release</dt>
              <dd>{event.release}</dd>
            </div>
          </dl>
          <p className="rounded bg-slate-50 p-3 text-sm text-slate-800">
            {event.message}
          </p>
          <p className="text-xs text-slate-500">Route: {event.route}</p>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <label className="text-sm text-slate-700">
              Durum
              <select
                className="ml-2 rounded border p-2"
                onChange={(input) =>
                  setStatus(input.target.value as ErrorStatus)
                }
                value={status}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
              Durumu kaydet
            </button>
          </div>
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-medium text-slate-900">Sorumlu atama</h3>
            <p className="text-sm text-slate-600">
              Mevcut atama: {event.assignedToUserId ?? "Atanmamış"}
            </p>
            <label className="block text-sm text-slate-700">
              Superadmin kullanıcı kimliği
              <input
                className="mt-1 w-full rounded border p-2"
                onChange={(input) => setAssigneeId(input.target.value)}
                value={assigneeId}
              />
            </label>
            <label className="block text-sm text-slate-700">
              Atama notu
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
                Ata
              </button>
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                disabled={saving || !event.assignedToUserId}
                onClick={() => void updateAssignment(true)}
                type="button"
              >
                Atamayı kaldır
              </button>
            </div>
          </section>
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-medium text-slate-900">Çözüm notları</h3>
            {notes.map((note) => (
              <article
                className="rounded bg-slate-50 p-3 text-sm"
                key={note.id}
              >
                <p>{note.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {note.visibility} ·{" "}
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </article>
            ))}
            <label className="block text-sm text-slate-700">
              Yeni not
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
              Not ekle
            </button>
          </section>
          <section className="space-y-3 border-t pt-4">
            <h3 className="font-medium text-slate-900">Destek bağlantısı</h3>
            <label className="block text-sm text-slate-700">
              URL
              <input
                className="mt-1 w-full rounded border p-2"
                onChange={(input) => setSupportUrl(input.target.value)}
                type="url"
                value={supportUrl}
              />
            </label>
            <label className="block text-sm text-slate-700">
              Başlık
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
              Bağlantı ekle
            </button>
          </section>
          <section
            aria-label="Audit timeline"
            className="space-y-3 border-t pt-4"
          >
            <h3 className="font-medium text-slate-900">Audit timeline</h3>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-slate-500">
                Bu olay için henüz audit kaydı yok.
              </p>
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
                      <span>{AUDIT_ACTION_LABELS[entry.action]}</span>
                      <span>·</span>
                      <span>
                        {entry.actorType === "system"
                          ? "Sistem"
                          : entry.actorId}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-800">
                      {renderAuditDetails(entry)}
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
