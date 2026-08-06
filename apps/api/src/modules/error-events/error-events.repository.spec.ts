/**
 * @file ErrorEventsRepository kalıcı snapshot testleri.
 * @module apps/api/modules/error-events/error-events.repository.spec
 * @description GOAL-100 hata aggregate'inin Prisma transaction'ı ve tenant
 * RLS bağlamı üzerinden kalıcılaştırılmasını doğrular.
 * @security Tenant kaydı yazılmadan önce `app.tenant_id` bağlamı aynı
 * transaction içinde kurulmalıdır; aksi halde RLS cross-tenant yazımı
 * engellemek için yeterli kanıt üretemez.
 *
 * GOAL-104 (FAZ-10) ile birlikte 4 yeni append-only tablo (notes,
 * support links, assignments, status transitions) için Prisma
 * persistence testleri eklendi.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 * @updated GOAL-104 (FAZ-10) 4 yeni modelin Prisma persistence testleri
 */

import { describe, expect, it, vi } from "vitest";

import { ErrorEventsRepository } from "./error-events.repository.js";

import type {
  ErrorEventNoteRecord,
  ErrorEventSupportLinkRecord,
  ErrorEventAssignmentRecordInternal,
  ErrorEventStatusTransitionRecord,
  ErrorEventRecord,
} from "../../common/error-events/error-event.types.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

const record: ErrorEventRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  requestId: "req-1",
  tenantId: "22222222-2222-2222-2222-222222222222",
  branchId: "33333333-3333-3333-3333-333333333333",
  userId: "44444444-4444-4444-4444-444444444444",
  actorType: "user",
  module: "patient",
  route: "GET /api/v1/patient/1",
  release: "0.1.0",
  severity: "error",
  fingerprint: "0123456789abcdef",
  errorCode: "VET-COMMON-0001",
  message: "Beklenmeyen sunucu hatası",
  statusCode: 500,
  stack: "Error: test",
  context: { method: "GET" },
  country: "TR",
  occurredAt: "2026-08-02T00:00:00.000Z",
  firstSeenAt: "2026-08-02T00:00:00.000Z",
  lastSeenAt: "2026-08-02T00:00:00.000Z",
  occurrenceCount: 1,
  status: "new",
  assignedToUserId: null,
};

const note: ErrorEventNoteRecord = {
  id: "55555555-5555-5555-5555-555555555555",
  fingerprint: record.fingerprint,
  authorId: "usr-author",
  authorType: "user",
  body: "Çözüm önerisi: input validation ekle.",
  visibility: "internal",
  createdAt: "2026-08-02T00:00:00.000Z",
};

const supportLink: ErrorEventSupportLinkRecord = {
  id: "66666666-6666-6666-6666-666666666666",
  fingerprint: record.fingerprint,
  system: "jira",
  externalId: "VNP-123",
  url: "https://example.atlassian.net/browse/VNP-123",
  title: "Bug: validation missing",
  createdById: "usr-author",
  createdByType: "user",
  createdAt: "2026-08-02T00:00:00.000Z",
};

const assignment: ErrorEventAssignmentRecordInternal = {
  id: "77777777-7777-7777-7777-777777777777",
  fingerprint: record.fingerprint,
  assigneeId: "usr-engineer-1",
  assignedById: "usr-author",
  assignedByType: "user",
  reason: "Initial triage",
  assignedAt: "2026-08-02T00:00:00.000Z",
};

const transition: ErrorEventStatusTransitionRecord = {
  id: "88888888-8888-8888-8888-888888888888",
  fingerprint: record.fingerprint,
  fromStatus: "new",
  toStatus: "investigating",
  actorId: "usr-author",
  actorType: "user",
  reason: "Investigation started",
  occurredAt: "2026-08-02T00:00:00.000Z",
};

/** Tenant-id'li transaction mock'u üretir. */
interface MockTx {
  $executeRaw: ReturnType<typeof vi.fn>;
  errorEvent: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  errorEventNote: { upsert: ReturnType<typeof vi.fn> };
  errorEventSupportLink: { upsert: ReturnType<typeof vi.fn> };
  errorEventAssignment: { upsert: ReturnType<typeof vi.fn> };
  errorEventStatusTransition: { upsert: ReturnType<typeof vi.fn> };
}

function makePrismaMock(overrides?: {
  errorEventNote?: { upsert: ReturnType<typeof vi.fn> };
  errorEventSupportLink?: { upsert: ReturnType<typeof vi.fn> };
  errorEventAssignment?: { upsert: ReturnType<typeof vi.fn> };
  errorEventStatusTransition?: { upsert: ReturnType<typeof vi.fn> };
}): {
  tx: MockTx;
  prisma: { $transaction: ReturnType<typeof vi.fn> };
} {
  const tx: MockTx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    errorEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    errorEventNote: {
      upsert:
        overrides?.errorEventNote?.upsert ?? vi.fn().mockResolvedValue({}),
    },
    errorEventSupportLink: {
      upsert:
        overrides?.errorEventSupportLink?.upsert ??
        vi.fn().mockResolvedValue({}),
    },
    errorEventAssignment: {
      upsert:
        overrides?.errorEventAssignment?.upsert ??
        vi.fn().mockResolvedValue({}),
    },
    errorEventStatusTransition: {
      upsert:
        overrides?.errorEventStatusTransition?.upsert ??
        vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: MockTx) => unknown) =>
      callback(tx),
    ),
  };
  return { tx, prisma };
}

describe("ErrorEventsRepository.persistSnapshot", () => {
  it("tenant kaydını aynı transaction içinde RLS bağlamıyla yazar", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistSnapshot(record);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.errorEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Vitest'in asymmetric matcher tipi `any` döndürür; assertion sınırı
        // dışında bu değer kullanılmaz.

        data: expect.objectContaining({
          id: record.id,
          tenantId: record.tenantId,
          fingerprint: record.fingerprint,
        }),
      }),
    );
  });

  it("paralel fingerprint create çakışmasında oluşan aggregate'i günceller", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      errorEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: record.id }),
        create: vi.fn().mockRejectedValue(new Error("unique conflict")),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistSnapshot(record);

    expect(tx.errorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: record.id } }),
    );
  });
});

describe("ErrorEventsRepository.onModuleInit", () => {
  it("kalıcı aggregate'leri tenant kapsamlı hızlı indekse yükler", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      errorEvent: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...record,
            occurredAt: new Date(record.occurredAt),
            firstSeenAt: new Date(record.firstSeenAt),
            lastSeenAt: new Date(record.lastSeenAt),
          },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.onModuleInit();

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(
      repository.findByFingerprint(record.fingerprint, record.tenantId),
    ).toEqual(record);
  });
});

/* --------------------------------------------------------------------------
 * GOAL-104 (FAZ-10) — 4 yeni model Prisma persistence testleri.
 * --------------------------------------------------------------------------
 */

describe("ErrorEventsRepository.persistNoteSnapshot", () => {
  it("tenant bağlamı ile errorEventNote.upsert çağrısı yapar", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistNoteSnapshot(note, record.tenantId);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.errorEventNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: note.id },
        create: expect.objectContaining({
          id: note.id,
          fingerprint: note.fingerprint,
          authorId: note.authorId,
          visibility: note.visibility,
        }),
      }),
    );
  });

  it("tenantId=null → system-write bağlamı kurar", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistNoteSnapshot(note, null);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.errorEventNote.upsert).toHaveBeenCalledOnce();
  });
});

describe("ErrorEventsRepository.persistSupportLinkSnapshot", () => {
  it("errorEventSupportLink.upsert çağrısı yapar", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistSupportLinkSnapshot(supportLink, record.tenantId);

    expect(tx.errorEventSupportLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: supportLink.id },
        create: expect.objectContaining({
          id: supportLink.id,
          system: supportLink.system,
          externalId: supportLink.externalId,
          url: supportLink.url,
        }),
      }),
    );
  });
});

describe("ErrorEventsRepository.persistAssignmentSnapshot", () => {
  it("UNASSIGNED sentetik assigneeId null + unassigned=true olarak yazılır", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    const unassignRecord: ErrorEventAssignmentRecordInternal = {
      ...assignment,
      id: "99999999-9999-9999-9999-999999999999",
      assigneeId: "unassigned",
    };

    await repository.persistAssignmentSnapshot(unassignRecord, record.tenantId);

    expect(tx.errorEventAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assigneeId: null,
          unassigned: true,
        }),
      }),
    );
  });

  it("normal atamada unassigned=false + assigneeId set edilir", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistAssignmentSnapshot(assignment, record.tenantId);

    expect(tx.errorEventAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assigneeId: assignment.assigneeId,
          unassigned: false,
        }),
      }),
    );
  });
});

describe("ErrorEventsRepository.persistStatusTransitionSnapshot", () => {
  it("errorEventStatusTransition.upsert çağrısı yapar", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    await repository.persistStatusTransitionSnapshot(
      transition,
      record.tenantId,
    );

    expect(tx.errorEventStatusTransition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: transition.id },
        create: expect.objectContaining({
          id: transition.id,
          fromStatus: transition.fromStatus,
          toStatus: transition.toStatus,
          actorId: transition.actorId,
        }),
      }),
    );
  });
});

/* --------------------------------------------------------------------------
 * In-memory + Prisma karma stratejisi (best-effort).
 * --------------------------------------------------------------------------
 */

describe("ErrorEventsRepository addNote/addSupportLink/addAssignment karma", () => {
  it("addNote sonrası in-memory + Prisma persistence çağrı zinciri", async () => {
    const { tx, prisma } = makePrismaMock();
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );

    // Önce aggregate'i in-memory'ye yerleştir (findById çalışabilsin).
    repository.upsertByFingerprint({
      fingerprint: note.fingerprint,
      record: {
        requestId: record.requestId,
        tenantId: record.tenantId,
        branchId: record.branchId,
        userId: record.userId,
        actorType: record.actorType,
        module: record.module,
        route: record.route,
        release: record.release,
        severity: record.severity,
        errorCode: record.errorCode,
        message: record.message,
        statusCode: record.statusCode,
        stack: record.stack,
        context: record.context,
        country: record.country,
        occurredAt: record.occurredAt,
      },
    });

    const result = repository.addNote(
      {
        fingerprint: note.fingerprint,
        authorId: note.authorId,
        authorType: note.authorType,
        body: note.body,
        visibility: note.visibility,
      },
      record.tenantId,
    );

    expect(result.body).toBe(note.body);
    expect(
      repository.listNotesByFingerprint(note.fingerprint, record.tenantId),
    ).toHaveLength(1);

    // Best-effort persist microtask'ı çalışsın.
    await new Promise((r) => setImmediate(r));
    expect(tx.errorEventNote.upsert).toHaveBeenCalledOnce();
  });

  it("updateStatus sonrası status + transition persist çağrıları", async () => {
    const { tx, prisma } = makePrismaMock();
    // persistSnapshot findFirst → null → create yolunu izler; ancak
    // bu testte ana kaydın güncellenmesini doğrulamak istiyoruz.
    // findFirst'in null döndürmesi nedeniyle create çağrılır.
    const repository = new ErrorEventsRepository(
      prisma as unknown as PrismaService,
    );
    const created = repository.upsertByFingerprint({
      fingerprint: transition.fingerprint,
      record: {
        requestId: record.requestId,
        tenantId: record.tenantId,
        branchId: record.branchId,
        userId: record.userId,
        actorType: record.actorType,
        module: record.module,
        route: record.route,
        release: record.release,
        severity: record.severity,
        errorCode: record.errorCode,
        message: record.message,
        statusCode: record.statusCode,
        stack: record.stack,
        context: record.context,
        country: record.country,
        occurredAt: record.occurredAt,
      },
    });

    const result = repository.updateStatus(created.id, {
      toStatus: "investigating",
      actorId: transition.actorId,
      actorType: transition.actorType,
      reason: transition.reason,
    });
    expect(result?.record.status).toBe("investigating");
    expect(
      repository.listTransitionsByFingerprint(
        transition.fingerprint,
        record.tenantId,
      ),
    ).toHaveLength(1);

    // Best-effort persist çağrıları microtask olarak zamanlanır;
    // birden fazla tick beklemek gerekir.
    await new Promise((r) => setTimeout(r, 50));
    expect(tx.errorEventStatusTransition.upsert).toHaveBeenCalledOnce();
    // Ana kayıt persistSnapshot tarafından yazılır (findFirst=null
    // → create path).
    expect(tx.errorEvent.create).toHaveBeenCalled();
  });

  it("prisma yokken best-effort persist no-op olur", async () => {
    const repository = new ErrorEventsRepository();
    const created = repository.upsertByFingerprint({
      fingerprint: note.fingerprint,
      record: {
        requestId: record.requestId,
        tenantId: null,
        branchId: null,
        userId: null,
        actorType: record.actorType,
        module: record.module,
        route: record.route,
        release: record.release,
        severity: record.severity,
        errorCode: record.errorCode,
        message: record.message,
        statusCode: record.statusCode,
        stack: record.stack,
        context: record.context,
        country: record.country,
        occurredAt: record.occurredAt,
      },
    });
    const noteRec = repository.addNote(
      {
        fingerprint: note.fingerprint,
        authorId: note.authorId,
        authorType: note.authorType,
        body: note.body,
        visibility: note.visibility,
      },
      null,
    );
    expect(noteRec.id).toBeDefined();
    expect(
      repository.listNotesByFingerprint(note.fingerprint, null),
    ).toHaveLength(1);

    repository.addAssignment(
      {
        fingerprint: assignment.fingerprint,
        assigneeId: assignment.assigneeId,
        assignedById: assignment.assignedById,
        assignedByType: assignment.assignedByType,
        reason: assignment.reason,
      },
      null,
    );
    expect(
      repository.listAssignmentsByFingerprint(assignment.fingerprint, null),
    ).toHaveLength(1);

    repository.addSupportLink(
      {
        fingerprint: supportLink.fingerprint,
        system: supportLink.system,
        externalId: supportLink.externalId,
        url: supportLink.url,
        title: supportLink.title,
        createdById: supportLink.createdById,
        createdByType: supportLink.createdByType,
      },
      null,
    );
    expect(
      repository.listSupportLinksByFingerprint(supportLink.fingerprint, null),
    ).toHaveLength(1);

    repository.updateStatus(created.id, {
      toStatus: "investigating",
      actorId: transition.actorId,
      actorType: transition.actorType,
      reason: transition.reason,
    });
    expect(
      repository.listTransitionsByFingerprint(transition.fingerprint, null),
    ).toHaveLength(1);

    // Prisma yok: upsert çağrılmamalı.
    // (tx burada tanımsız; test sadece prisma yokken hata atmadığını doğrular)
  });
});
