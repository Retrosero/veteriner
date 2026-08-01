/**
 * @file Timeline kaynak adaptör testleri.
 * @module apps/api/modules/timeline/sources/spec
 * @description Dosya zaman çizelgesi kaynağının aktif FileService üzerinden
 * tenant-scoped listeleme yaptığını ve sonuçları timeline olayına çevirdiğini
 * doğrular.
 * @security Eski in-memory FilesService yolu kullanılmaz; çağrıdaki actor
 * bağlamı FileService'e aynen aktarılır ve tenant izolasyonu korunur.
 */

import { describe, expect, it, vi } from "vitest";

import { FileTimelineSource } from "./timeline.sources.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { FileService } from "../file/file.service.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

const ACTOR: ActorContext = {
  actorId: "33333333-3333-3333-3333-333333333333",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_ID,
  branchId: "22222222-2222-2222-2222-222222222222",
  isSuperadmin: false,
  correlationId: "timeline-file-test",
  ipAddress: null,
  userAgentHash: null,
  source: "session",
};

describe("FileTimelineSource", () => {
  it("aktif FileService üzerinden hedef hastanın dosyalarını getirir", async () => {
    const files = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: "44444444-4444-4444-4444-444444444444",
            tenantId: TENANT_ID,
            category: "lab_report",
            mimeType: "application/pdf",
            originalName: "lab.pdf",
            sizeBytes: 42,
            path: "tenants/a/files/b",
            uploadedBy: ACTOR.actorId,
            uploadedAt: "2026-08-01T00:00:00.000Z",
            archivedAt: null,
            relatedEntityType: "patient",
            relatedEntityId: "55555555-5555-5555-5555-555555555555",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    } as unknown as FileService;
    const source = new FileTimelineSource(files);

    const events = await source.fetchForPatient({
      tenantId: TENANT_ID,
      patientId: "55555555-5555-5555-5555-555555555555",
      actor: ACTOR,
    });

    expect(files.list).toHaveBeenCalledWith(
      expect.objectContaining({
        relatedEntityType: "patient",
        relatedEntityId: "55555555-5555-5555-5555-555555555555",
        includeArchived: false,
      }),
      ACTOR,
    );
    expect(events).toMatchObject([
      {
        type: "file",
        relatedEntityId: "44444444-4444-4444-4444-444444444444",
      },
    ]);
  });
});
