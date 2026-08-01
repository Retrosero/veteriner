/**
 * @file FilesService unit testleri.
 * @module apps/api/modules/files/files.service.spec
 *
 * @description MIME whitelist, boyut limiti, antivirus, tenant
 * izolasyonu, arşiv davranışı ve audit event yayını için temel
 * testler. Storage ve antivirus driver'ları mock'lanır; servis
 * saf iş kuralları seviyesinde sınanır.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilesService } from "./files.service.js";
import { FILE_LIMITS, type FileUpload } from "../../common/files/file.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { AntivirusDriver } from "../../common/files/antivirus.interface.js";
import type { StorageDriver } from "../../common/files/storage.interface.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_B: ActorContext = {
  actorId: "usr-staff-b",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const SUPERADMIN: ActorContext = {
  actorId: "usr-super",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeStorage(overrides: Partial<StorageDriver> = {}): StorageDriver {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from("hello")),
    delete: vi.fn().mockResolvedValue(undefined),
    signedUrl: vi
      .fn()
      .mockImplementation(async (p) => `https://signed.example/${p}`),
    ...overrides,
  } as unknown as StorageDriver;
}

function makeAntivirus(
  result: "clean" | "infected" | "error" = "clean",
): AntivirusDriver {
  return {
    scan: vi.fn().mockResolvedValue(result),
  } as unknown as AntivirusDriver;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({}),
  } as unknown as AuditService;
}

function jpegUpload(overrides: Partial<FileUpload> = {}): FileUpload {
  return {
    category: "patient_photo",
    mimeType: "image/jpeg",
    originalName: "photo.jpg",
    sizeBytes: 1024,
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
    ...overrides,
  };
}

describe("FilesService", () => {
  let service: FilesService;
  let storage: StorageDriver;
  let antivirus: AntivirusDriver;
  let audit: AuditService;

  beforeEach(() => {
    storage = makeStorage();
    antivirus = makeAntivirus();
    audit = makeAudit();
    service = new FilesService(audit, storage, antivirus);
  });

  describe("upload — MIME whitelist", () => {
    it("jpeg kabul edilir", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      expect(meta.id).toBeDefined();
      expect(meta.mimeType).toBe("image/jpeg");
      expect(storage.put).toHaveBeenCalledTimes(1);
    });

    it("png kabul edilir", async () => {
      const meta = await service.upload(
        TENANT_A,
        jpegUpload({ mimeType: "image/png", originalName: "x.png" }),
        STAFF_A,
      );
      expect(meta.mimeType).toBe("image/png");
    });

    it("pdf kabul edilir", async () => {
      const meta = await service.upload(
        TENANT_A,
        jpegUpload({
          mimeType: "application/pdf",
          originalName: "lab.pdf",
          category: "lab_report",
        }),
        STAFF_A,
      );
      expect(meta.mimeType).toBe("application/pdf");
    });

    it("exe gibi whitelist dışı MIME reddedilir (415 VET-FILE-0002)", async () => {
      await expect(
        service.upload(
          TENANT_A,
          jpegUpload({
            mimeType: "application/x-msdownload" as unknown as "image/jpeg",
            originalName: "evil.exe",
          }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0002" });
      expect(storage.put).not.toHaveBeenCalled();
    });
  });

  describe("upload — boyut limiti", () => {
    it("50 MB üstü → VET-FILE-0001 (415)", async () => {
      await expect(
        service.upload(
          TENANT_A,
          jpegUpload({ sizeBytes: FILE_LIMITS.MAX_SIZE_BYTES + 1 }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0001" });
      expect(storage.put).not.toHaveBeenCalled();
    });
  });

  describe("upload — antivirus", () => {
    it("infected → VET-FILE-0004 (422), storage yazılmaz", async () => {
      antivirus = makeAntivirus("infected");
      service = new FilesService(audit, storage, antivirus);
      await expect(
        service.upload(TENANT_A, jpegUpload(), STAFF_A),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0004" });
      expect(storage.put).not.toHaveBeenCalled();
    });

    it("clean → driver.put çağrılır, meta döner, audit yayınlanır", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      expect(meta.path).toMatch(/^tenants\//);
      expect(meta.archivedAt).toBeNull();
      expect(storage.put).toHaveBeenCalledWith(
        expect.stringContaining("tenants/"),
        expect.any(Buffer),
        "image/jpeg",
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:file.upload" }),
      );
    });
  });

  describe("download — tenant izolasyonu", () => {
    it("kendi tenant'ından okur", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      const data = await service.download(TENANT_A, meta.id, STAFF_A);
      expect(data).toBeInstanceOf(Buffer);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:file.download" }),
      );
    });

    it("cross-tenant → 404 (bilgi sızdırmaz)", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      await expect(
        service.download(TENANT_B, meta.id, STAFF_B),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0003" });
    });

    it("SUPERADMIN cross-tenant okuyabilir", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      const data = await service.download(TENANT_A, meta.id, SUPERADMIN);
      expect(data).toBeInstanceOf(Buffer);
    });
  });

  describe("archive", () => {
    it("archivedAt set edilir, storage.delete çağrılmaz", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      await service.archive(TENANT_A, meta.id, STAFF_A);
      const after = service.getMeta(meta.id);
      expect(after?.archivedAt).not.toBeNull();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "audit:file.archive" }),
      );
    });

    it("zaten arşivli meta ikinci kez arşivlenirse idempotent", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      await service.archive(TENANT_A, meta.id, STAFF_A);
      const firstArchivedAt = service.getMeta(meta.id)?.archivedAt;
      await service.archive(TENANT_A, meta.id, STAFF_A);
      expect(service.getMeta(meta.id)?.archivedAt).toBe(firstArchivedAt);
    });
  });

  describe("getSignedUrl", () => {
    it("yetkili kullanıcı URL alır", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      const url = await service.getSignedUrl(TENANT_A, meta.id, STAFF_A, 300);
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    });

    it("cross-tenant → 404", async () => {
      const meta = await service.upload(TENANT_A, jpegUpload(), STAFF_A);
      await expect(
        service.getSignedUrl(TENANT_B, meta.id, STAFF_B, 300),
      ).rejects.toMatchObject({ errorCode: "VET-FILE-0003" });
    });
  });
});
