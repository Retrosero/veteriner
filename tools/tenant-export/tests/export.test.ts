/**
 * @file export.test.ts — tenant export core testleri.
 * @module @vetniva/tenant-export/tests/export
 *
 * @description exportTenantData'nin tenant-scoped veri
 * cekmesini, PII kontrol modlarini, JSON serilizasyonunu,
 * audit event uretimini dogrular. In-memory data source
 * ile tenant izolasyonu kontrol edilir. Tenant izolasyonu
 * ve PII kurallarina uyar.
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  exportTenantData,
  InMemoryTenantDataSource,
  emptyDataSource,
  ALL_DATASETS,
} from "../src/export.js";
import { StandardPiiMasker, NoopPiiMasker } from "../src/pii-masker.js";
import type { ExportRequest, TenantDataSource } from "../src/types.js";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "tenant-export-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function makeDataSource(
  rows: Partial<
    Record<
      ExportRequest["datasets"][number],
      ReadonlyArray<Record<string, unknown>>
    >
  >,
): TenantDataSource {
  return new InMemoryTenantDataSource(
    new Map(Object.entries(rows)) as Map<
      string,
      ReadonlyArray<Record<string, unknown>>
    >,
  );
}

const baseRequest: ExportRequest = {
  tenantId: "tnt-test",
  exportedBy: "usr-test",
  tenantSlug: "pilot-test",
  datasets: ["owners", "patients"],
  format: "json",
  piiCheck: "strict",
  country: "TR",
  release: "0.1.0",
};

describe("ALL_DATASETS", () => {
  it("10 dataset tanimli", () => {
    expect(ALL_DATASETS.length).toBe(10);
  });
});

describe("exportTenantData", () => {
  it("tenantId olmadan hata firlatir", async () => {
    await expect(
      exportTenantData(
        { ...baseRequest, tenantId: "" },
        {
          dataSource: emptyDataSource(),
          outputFile: join(tmp, "out.json"),
        },
      ),
    ).rejects.toThrow(/tenantId/);
  });

  it("exportedBy olmadan hata firlatir", async () => {
    await expect(
      exportTenantData(
        { ...baseRequest, exportedBy: "" },
        {
          dataSource: emptyDataSource(),
          outputFile: join(tmp, "out.json"),
        },
      ),
    ).rejects.toThrow(/exportedBy/);
  });

  it("en az 1 dataset zorunlu", async () => {
    await expect(
      exportTenantData(
        { ...baseRequest, datasets: [] },
        {
          dataSource: emptyDataSource(),
          outputFile: join(tmp, "out.json"),
        },
      ),
    ).rejects.toThrow(/dataset/);
  });

  it("strict modda PII alanlari mask'lenir", async () => {
    const data = makeDataSource({
      owners: [{ id: "own-1", firstName: "Demo", email: "demo@vetniva.local" }],
      patients: [],
    });
    const out = join(tmp, "strict.json");
    const r = await exportTenantData(baseRequest, {
      dataSource: data,
      outputFile: out,
    });
    expect(r.piiMasked).toBe(true);
    expect(r.piiFieldsDetected).toBeGreaterThan(0);
    const onDisk = await readFile(out, "utf8");
    expect(onDisk).not.toContain("demo@vetniva.local");
    expect(onDisk).toContain("***");
  });

  it("permissive modda PII alanlari olduigu gibi kalir ama audit'te flaglenir", async () => {
    const data = makeDataSource({
      owners: [{ id: "own-1", firstName: "Demo", email: "demo@vetniva.local" }],
      patients: [],
    });
    const out = join(tmp, "permissive.json");
    const r = await exportTenantData(
      { ...baseRequest, piiCheck: "permissive" },
      { dataSource: data, outputFile: out },
    );
    expect(r.piiMasked).toBe(false);
    expect(r.piiFieldsDetected).toBeGreaterThan(0);
    const onDisk = await readFile(out, "utf8");
    expect(onDisk).toContain("demo@vetniva.local");
  });

  it("audit event dogru sekilde uretilir", async () => {
    const data = makeDataSource({
      owners: [{ id: "own-1", firstName: "A" }],
      patients: [],
    });
    const out = join(tmp, "audit.json");
    const r = await exportTenantData(baseRequest, {
      dataSource: data,
      outputFile: out,
    });
    expect(r.auditEvent.eventName).toBe("audit:tenant.export.created");
    expect(r.auditEvent.tenantId).toBe("tnt-test");
    expect(r.auditEvent.actorId).toBe("usr-test");
    expect(r.auditEvent.actorType).toBe("user");
    expect(r.auditEvent.country).toBe("TR");
    expect(r.auditEvent.release).toBe("0.1.0");
    expect(r.auditEvent.datasets).toEqual(["owners", "patients"]);
    expect(r.auditEvent.totalRows).toBe(1);
    expect(r.auditEvent.piiMasked).toBe(true);
  });

  it("dataset bazinda satir sayisi dogru hesaplanir", async () => {
    const data = makeDataSource({
      owners: [{ id: "o1" }, { id: "o2" }, { id: "o3" }],
      patients: [{ id: "p1" }],
    });
    const out = join(tmp, "rows.json");
    const r = await exportTenantData(baseRequest, {
      dataSource: data,
      outputFile: out,
    });
    expect(r.rowsPerDataset["owners"]).toBe(3);
    expect(r.rowsPerDataset["patients"]).toBe(1);
    expect(r.totalRows).toBe(4);
  });

  it("correlationId verilirse audit'e yansir", async () => {
    const data = makeDataSource({ owners: [{ id: "o1" }], patients: [] });
    const out = join(tmp, "corr.json");
    const r = await exportTenantData(baseRequest, {
      dataSource: data,
      outputFile: out,
      correlationId: "req-custom-123",
    });
    expect(r.auditEvent.correlationId).toBe("req-custom-123");
  });

  it("dryRun modunda dosya yazilmaz", async () => {
    const data = makeDataSource({ owners: [{ id: "o1" }], patients: [] });
    const out = join(tmp, "dryrun.json");
    await exportTenantData(baseRequest, {
      dataSource: data,
      outputFile: out,
      dryRun: true,
    });
    await expect(readFile(out, "utf8")).rejects.toThrow();
  });

  it("CSV formatinda basit CSV uretir", async () => {
    const data = makeDataSource({
      owners: [{ id: "o1", firstName: "A" }],
      patients: [],
    });
    const out = join(tmp, "out.csv");
    await exportTenantData(
      { ...baseRequest, format: "csv" },
      {
        dataSource: data,
        outputFile: out,
      },
    );
    const onDisk = await readFile(out, "utf8");
    expect(onDisk).toContain("## owners");
    expect(onDisk).toContain("id,firstName");
  });

  it("NoopPiiMasker ile PII tespit edilmez", async () => {
    const data = makeDataSource({
      owners: [{ id: "own-1", firstName: "Demo", email: "demo@vetniva.local" }],
      patients: [],
    });
    const out = join(tmp, "noop.json");
    const r = await exportTenantData(baseRequest, {
      dataSource: data,
      outputFile: out,
      piiMasker: new NoopPiiMasker(),
    });
    expect(r.piiFieldsDetected).toBe(0);
    expect(r.piiMasked).toBe(false);
  });
});
