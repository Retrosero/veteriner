/**
 * @file FileService unit testleri.
 * @module apps/api/modules/file/file.service.spec
 *
 * @description Upload (happy path, dup, MIME, soft limit, infected),
 * findById (cross-tenant 404, karantina 404, arşiv 404), list, archive
 * ve signed URL testleri.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileService } from "./file.service.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type { FileRepository } from "./file.repository.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { ScanAdapter } from "../../common/adapters/scan.adapter.js";
import type { StorageAdapter } from "../../common/adapters/storage.adapter.js";
import type { AuditService } from "../../common/audit/audit.service.js";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const BRANCH_A = "22222222-2222-2222-2222-222222222222";
const USER_A = "33333333-3333-3333-3333-333333333333";
const FILE_ID = "44444444-4444-4444-4444-444444444444";

const VET_OWNER: ActorContext = {
  actorId: USER_A,
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: BRANCH_A,
  isSuperadmin: false,
  correlationId: "req-test-1",
  ipAddress: "192.168.1.***",
  userAgentHash: null,
  source: "header",
};

const VET_OTHER_BRANCH: ActorContext = {
  actorId: USER_A,
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: "99999999-9999-9999-9999-999999999999",
  isSuperadmin: false,
  correlationId: "req-test-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const SUPERADMIN: ActorContext = {
  actorId: "usr-super",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-super",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeRepo(): FileRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByStorageKey: vi.fn().mockResolvedValue(null),
    findByChecksum: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    updateScanResult: vi.fn(),
    archive: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    buildStorageKey: vi
      .fn()
      .mockImplementation(
        (tenantId: string, fileId: string) =>
          `tenants/${tenantId}/files/${fileId}`,
      ),
  } as unknown as FileRepository;
}

function makeStorage(): StorageAdapter {
  return {
    name: "test",
    put: vi
      .fn()
      .mockImplementation(async (input: { key: string; body: Buffer }) => ({
        key: input.key,
        size: input.body.byteLength,
        contentType: "application/pdf",
        lastModified: new Date(),
        checksumSha256: "deadbeef".repeat(8),
      })),
    get: vi.fn().mockResolvedValue(null),
    getStream: vi.fn().mockResolvedValue(null),
    getSignedUrl: vi
      .fn()
      .mockResolvedValue("https://example.com/signed?token=abc"),
    archive: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as StorageAdapter;
}

function makeScan(
  outcome: "clean" | "skipped" | "infected" | "error" = "clean",
): ScanAdapter {
  return {
    name: "test-scan",
    scan: vi.fn().mockResolvedValue({
      outcome,
      details: outcome === "infected" ? "EICAR-Test-Signature" : "OK",
      durationMs: 5,
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as ScanAdapter;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;
}

function makeFileRecord(
  overrides: Partial<{
    id: string;
    tenantId: string;
    branchId: string | null;
    uploaderId: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    checksumSha256: string;
    scanStatus: string;
    visibility: string;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    archivedAt: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? FILE_ID,
    tenantId: overrides.tenantId ?? TENANT_A,
    branchId: overrides.branchId ?? BRANCH_A,
    uploaderId: overrides.uploaderId ?? USER_A,
    storageKey: overrides.storageKey ?? `tenants/${TENANT_A}/files/${FILE_ID}`,
    originalName: overrides.originalName ?? "rapor.pdf",
    mimeType: overrides.mimeType ?? "application/pdf",
    sizeBytes: overrides.sizeBytes ?? BigInt(2048),
    checksumSha256: overrides.checksumSha256 ?? "deadbeef".repeat(8),
    scanStatus: overrides.scanStatus ?? "clean",
    scanResult: null,
    scannedAt: new Date(),
    visibility: overrides.visibility ?? "branch",
    relatedEntityType: overrides.relatedEntityType ?? null,
    relatedEntityId: overrides.relatedEntityId ?? null,
    description: null,
    archivedAt: overrides.archivedAt ?? null,
    archivedBy: null,
    archiveReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("FileService", () => {
  let service: FileService;
  let repo: FileRepository;
  let storage: StorageAdapter;
  let scan: ScanAdapter;
  let audit: AuditService;

  beforeEach(() => {
    repo = makeRepo();
    storage = makeStorage();
    scan = makeScan("clean");
    audit = makeAudit();
    service = new FileService(repo, storage, scan, audit);
  });

  describe("upload", () => {
    it("happy path: VET, PDF, 2KB → clean → 201 meta döner", async () => {
      const record = makeFileRecord();
      (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(record);
      (repo.updateScanResult as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...record,
        scanStatus: "clean",
      });

      const result = await service.upload(
        {
          meta: {
            category: "lab_report",
            mimeType: "application/pdf",
            originalName: "rapor.pdf",
            sizeBytes: 2048,
            visibility: "branch",
          },
          body: Buffer.from("PDF-CONTENT"),
        },
        VET_OWNER,
      );

      expect(result.id).toBe(FILE_ID);
      expect(result.mimeType).toBe("application/pdf");
      expect(result.sizeBytes).toBe(2048);
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(scan.scan).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(1);
    });

    it("duplicate upload: mevcut kayıt döner, storage.put çağrılmaz", async () => {
      const existing = makeFileRecord({ originalName: "existing.pdf" });
      (repo.findByChecksum as ReturnType<typeof vi.fn>).mockResolvedValue(
        existing,
      );

      const result = await service.upload(
        {
          meta: {
            category: "lab_report",
            mimeType: "application/pdf",
            originalName: "yeni.pdf",
            sizeBytes: 2048,
            visibility: "branch",
          },
          body: Buffer.from("PDF-CONTENT"),
        },
        VET_OWNER,
      );

      expect(result.id).toBe(FILE_ID);
      expect(result.originalName).toBe("existing.pdf");
      expect(storage.put).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:file.duplicate" }),
      );
    });

    it("MIME whitelist dışı → VET-FILE-0002", async () => {
      await expect(
        service.upload(
          {
            meta: {
              category: "other",
              // MIME whitelist dışı; tip atlanır (runtime'da service reddeder).
              mimeType: "application/zip" as unknown as "image/jpeg",
              originalName: "x.zip",
              sizeBytes: 100,
              visibility: "branch",
            },
            body: Buffer.from("x"),
          },
          VET_OWNER,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0002" });
      expect(storage.put).not.toHaveBeenCalled();
    });

    it("soft size limit (25 MB) aşımı → VET-FILE-0008", async () => {
      await expect(
        service.upload(
          {
            meta: {
              category: "imaging",
              mimeType: "application/dicom",
              originalName: "big.dcm",
              sizeBytes: 30 * 1024 * 1024,
              visibility: "branch",
            },
            body: Buffer.alloc(30 * 1024 * 1024),
          },
          VET_OWNER,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0008" });
    });

    it("boyut 0 → VET-FILE-0007", async () => {
      await expect(
        service.upload(
          {
            meta: {
              category: "other",
              mimeType: "application/pdf",
              originalName: "x.pdf",
              sizeBytes: 0,
              visibility: "branch",
            },
            body: Buffer.alloc(0),
          },
          VET_OWNER,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0007" });
    });

    it("system actor upload yapamaz → VET-AUTH-0003", async () => {
      const sys: ActorContext = {
        ...VET_OWNER,
        actorType: "system",
        actorId: null,
        role: "SYSTEM",
      };
      await expect(
        service.upload(
          {
            meta: {
              category: "other",
              mimeType: "application/pdf",
              originalName: "x.pdf",
              sizeBytes: 100,
              visibility: "branch",
            },
            body: Buffer.from("x"),
          },
          sys,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTH-0003" });
    });

    it("tenant context olmadan → VET-TENANT-0003", async () => {
      const noTenant: ActorContext = {
        ...VET_OWNER,
        tenantId: null,
      };
      await expect(
        service.upload(
          {
            meta: {
              category: "other",
              mimeType: "application/pdf",
              originalName: "x.pdf",
              sizeBytes: 100,
              visibility: "branch",
            },
            body: Buffer.from("x"),
          },
          noTenant,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-TENANT-0003" });
    });

    it("infected scan sonucu → audit critical + karantina (yine de meta döner, indirme reddedilir)", async () => {
      scan = makeScan("infected");
      service = new FileService(repo, storage, scan, audit);
      const record = makeFileRecord({ scanStatus: "infected" });
      (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(record);
      (repo.updateScanResult as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...record,
        scanStatus: "infected",
      });

      const result = await service.upload(
        {
          meta: {
            category: "other",
            mimeType: "application/pdf",
            originalName: "evil.pdf",
            sizeBytes: 1024,
            visibility: "branch",
          },
          body: Buffer.from("EVIL"),
        },
        VET_OWNER,
      );

      expect(result.id).toBe(FILE_ID);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "critical" }),
      );
    });
  });

  describe("findById", () => {
    it("kendi tenant dosyası → döner", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord(),
      );
      const result = await service.findById(FILE_ID, VET_OWNER);
      expect(result.id).toBe(FILE_ID);
    });

    it("tenant mismatch → VET-FILE-0001 (404, bilgi sızdırmaz)", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(service.findById(FILE_ID, VET_OWNER)).rejects.toMatchObject({
        errorCode: "VET-FILE-0001",
      });
    });

    it("infected → VET-FILE-0003 (karantina)", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ scanStatus: "infected" }),
      );
      await expect(service.findById(FILE_ID, VET_OWNER)).rejects.toMatchObject({
        errorCode: "VET-FILE-0003",
      });
    });

    it("archived → VET-FILE-0004", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ archivedAt: new Date() }),
      );
      await expect(service.findById(FILE_ID, VET_OWNER)).rejects.toMatchObject({
        errorCode: "VET-FILE-0004",
      });
    });

    it("branch visibility: farklı branch user → 404", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ visibility: "branch" }),
      );
      await expect(
        service.findById(FILE_ID, VET_OTHER_BRANCH),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0001" });
    });

    it("private visibility: başka user → 404", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({
          visibility: "private",
          uploaderId: "another-user-id",
        }),
      );
      const otherUser: ActorContext = {
        ...VET_OWNER,
        actorId: "different-user",
      };
      await expect(service.findById(FILE_ID, otherUser)).rejects.toMatchObject({
        errorCode: "VET-FILE-0001",
      });
    });

    it("SUPERADMIN her dosyayı görebilir (bypass)", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ visibility: "private" }),
      );
      const result = await service.findById(FILE_ID, SUPERADMIN);
      expect(result.id).toBe(FILE_ID);
    });
  });

  describe("list", () => {
    it("tenant user infected olmayan dosyaları görür", async () => {
      const items = [
        makeFileRecord({ id: "f-1", scanStatus: "clean" }),
        makeFileRecord({ id: "f-2", scanStatus: "infected" }),
        makeFileRecord({ id: "f-3", scanStatus: "clean" }),
      ];
      (repo.list as ReturnType<typeof vi.fn>).mockResolvedValue({
        items,
        total: 3,
      });
      const result = await service.list(
        { page: 1, pageSize: 20, includeArchived: false },
        VET_OWNER,
      );
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe("archive", () => {
    it("happy path: storage.archive + repo.archive + audit", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord(),
      );
      (repo.archive as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ archivedAt: new Date() }),
      );
      const result = await service.archive(
        FILE_ID,
        { reason: "KVKK silme talebi" },
        VET_OWNER,
      );
      expect(result.archivedAt).toBeTruthy();
      expect(storage.archive).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:file.archive" }),
      );
    });

    it("zaten arşivlenmiş → VET-FILE-0005", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ archivedAt: new Date() }),
      );
      await expect(
        service.archive(FILE_ID, { reason: "tekrar" }, VET_OWNER),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0005" });
    });
  });

  describe("getSignedUrl", () => {
    it("clean dosya için URL üretir", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ scanStatus: "clean" }),
      );
      const result = await service.getSignedUrl(
        FILE_ID,
        { expiresInSec: 300 },
        VET_OWNER,
      );
      expect(result.url).toContain("https://example.com");
      expect(result.expiresInSec).toBe(300);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:file.signed_url" }),
      );
    });

    it("pending → VET-FILE-0006", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ scanStatus: "pending" }),
      );
      await expect(
        service.getSignedUrl(FILE_ID, { expiresInSec: 300 }, VET_OWNER),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0006" });
    });

    it("infected → VET-FILE-0006", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ scanStatus: "infected" }),
      );
      await expect(
        service.getSignedUrl(FILE_ID, { expiresInSec: 300 }, VET_OWNER),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0006" });
    });

    it("scan error → VET-FILE-0006 (fail closed)", async () => {
      (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeFileRecord({ scanStatus: "error" }),
      );
      await expect(
        service.getSignedUrl(FILE_ID, { expiresInSec: 300 }, VET_OWNER),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0006" });
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  it("scan adapter hata → outcome: error (yine de upload başarılı)", async () => {
    scan = {
      name: "fail",
      scan: vi.fn().mockRejectedValue(new Error("clamav timeout")),
      healthCheck: vi.fn().mockResolvedValue(false),
    } as unknown as ScanAdapter;
    service = new FileService(repo, storage, scan, audit);

    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeFileRecord(),
    );
    (repo.updateScanResult as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeFileRecord({ scanStatus: "error" }),
    );

    const result = await service.upload(
      {
        meta: {
          category: "other",
          mimeType: "application/pdf",
          originalName: "x.pdf",
          sizeBytes: 100,
          visibility: "branch",
        },
        body: Buffer.from("x"),
      },
      VET_OWNER,
    );

    expect(result.id).toBe(FILE_ID);
  });

  it("DomainError korunur (sarmalanmaz)", async () => {
    const err = new DomainError({
      errorCode: "VET-FILE-0001",
      message: "x",
      httpStatus: 404,
      severity: "warning",
      i18nKey: "error.VET-FILE-0001",
    });
    (repo.findById as ReturnType<typeof vi.fn>).mockRejectedValue(err);
    await expect(service.findById(FILE_ID, VET_OWNER)).rejects.toBe(err);
  });
});
