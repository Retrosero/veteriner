/**
 * @file prisma-data-source.test.ts — Prisma-backed TenantDataSource
 *   entegrasyon testleri.
 * @module @vetniva/tenant-export/tests/prisma-data-source
 *
 * @description Pilot (Hafta 2) kapsamında gerçek izole PG
 * (`vetniva-iso-pg:55432`) üzerinde 2 tenant seed edip
 * aşağıdakileri doğrular:
 *   - Tenant A export çağrısı yalnızca Tenant A satırlarını
 *     döner (cross-tenant izolasyon).
 *   - PII `strict` modda maskelenir; `permissive` modda
 *     maskelenmeden geçer.
 *   - JSON ve CSV formatlarının ikisi de doğru üretilir.
 *   - Audit event zorunlu alanları içerir.
 *
 * Test izole DB'ye (vetniva-iso-pg) bağlanır; DATABASE_URL
 * environment değişkeni veya default
 * `postgresql://vetniva:vetniva@localhost:55432/vetniva?schema=public`
 * kullanılır. Test sonrası seed edilen tenant'lar temizlenir
 * (cleanup) — diğer testleri veya geliştirici verisini
 * kirletmemek için.
 *
 * @since GOAL-125 (FAZ-12) tenant veri dışa aktarma — pilot
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { exportTenantData } from "../src/export.js";
import { StandardPiiMasker } from "../src/pii-masker.js";
import { PrismaTenantDataSource } from "../src/prisma-data-source.js";
import type { ExportRequest } from "../src/types.js";

// Skip guard — DB yoksa lint/type-check/test gate'lerini kırmadan skip.
// Bu test izole PG (vetniva-iso-pg:55432) veya başka bir gerçek
// Prisma-erişilebilir veritabanı gerektirir. DATABASE_URL env
// değişkeni set edilmediğinde tüm senaryolar skip olur; CI'da
// izole PG servisi ayakta iken DATABASE_URL sağlanarak tam
// çalıştırılır. Default URL'i kaldırdık çünkü port 55432'deki
// servis local stack'te (docker-compose 5432) yok.
const runtimeDatabaseUrl = process.env["DATABASE_URL"];
const dbSkip = !runtimeDatabaseUrl;
const describeDb = dbSkip ? describe.skip : describe;
if (dbSkip) {
  console.warn(
    "[prisma-data-source] DATABASE_URL yok; 10 senaryo skip edilecek.",
  );
}

// Prisma Client lazy connection kullanır; STUB URL bile nesne
// oluşumunu engellemez. describeDb.skip aktifken sorgu çalışmadığı
// için STUB URL güvenli.
const STUB_DATABASE_URL = "postgresql://stub:stub@localhost:55432/stub";
const DATABASE_URL = runtimeDatabaseUrl ?? STUB_DATABASE_URL;

const prisma = new PrismaClient({
  datasources: { db: { url: DATABASE_URL } },
});

/** Bu test paketi tarafından oluşturulan tenant'lar; cleanup için izlenir. */
const createdTenantIds: string[] = [];

let workdir: string;
let tenantA: string;
let tenantB: string;
let ownerAId: string;
let patientAId: string;
let examAId: string;
let ownerBId: string;
let patientBId: string;

beforeAll(async () => {
  // DB yoksa seed atlamak gerek; STUB URL ile sorgu patlar.
  if (dbSkip) return;
  workdir = await mkdtemp(join(tmpdir(), "tenant-export-prisma-"));

  // Tenant A: tam set (1 owner + 1 patient + 1 examination).
  tenantA = randomUUID();
  await prisma.tenant.create({
    data: {
      id: tenantA,
      slug: `pilot-test-a-${Date.now()}`,
      name: "Pilot Test Tenant A",
      country: "TR",
    },
  });
  createdTenantIds.push(tenantA);

  ownerAId = randomUUID();
  await prisma.owner.create({
    data: {
      id: ownerAId,
      tenantId: tenantA,
      firstName: "Ayse",
      lastName: "Yilmaz",
      phone: "+905551111111",
      email: "ayse.a@pilot.local",
    },
  });
  patientAId = randomUUID();
  await prisma.patient.create({
    data: {
      id: patientAId,
      tenantId: tenantA,
      ownerId: ownerAId,
      name: "Karabas",
      species: "dog",
      gender: "male",
      neutered: true,
    },
  });
  examAId = `exm-${randomUUID()}`;
  await prisma.examination.create({
    data: {
      id: examAId,
      tenantId: tenantA,
      patientId: patientAId,
      veterinarianId: "vet-test-1",
      status: "completed",
      type: "general",
      chiefComplaint: "Routine check",
      startedAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // Tenant B: izolasyon kontrolu (1 owner + 1 patient, examination yok).
  tenantB = randomUUID();
  await prisma.tenant.create({
    data: {
      id: tenantB,
      slug: `pilot-test-b-${Date.now()}`,
      name: "Pilot Test Tenant B",
      country: "TR",
    },
  });
  createdTenantIds.push(tenantB);

  ownerBId = randomUUID();
  await prisma.owner.create({
    data: {
      id: ownerBId,
      tenantId: tenantB,
      firstName: "Mehmet",
      lastName: "Demir",
      phone: "+905552222222",
      email: "mehmet.b@pilot.local",
    },
  });
  patientBId = randomUUID();
  await prisma.patient.create({
    data: {
      id: patientBId,
      tenantId: tenantB,
      ownerId: ownerBId,
      name: "Pamuk",
      species: "cat",
      gender: "female",
      neutered: false,
    },
  });
});

afterAll(async () => {
  // DB yoksa cleanup yok; STUB URL disconnect'i başarısız olur.
  if (dbSkip) return;
  // Cleanup: createdTenantIds'teki tüm tenant'lara bağlı verileri sil,
  // sonra tenant'ları sil. Sıralama FK kısıtlarına dikkat eder.
  try {
    if (createdTenantIds.length > 0) {
      await prisma.examination.deleteMany({
        where: { tenantId: { in: createdTenantIds } },
      });
      await prisma.patient.deleteMany({
        where: { tenantId: { in: createdTenantIds } },
      });
      await prisma.owner.deleteMany({
        where: { tenantId: { in: createdTenantIds } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: createdTenantIds } },
      });
    }
  } finally {
    await prisma.$disconnect();
    await rm(workdir, { recursive: true, force: true });
  }
});

describeDb("PrismaTenantDataSource — pilot izolasyon ve PII", () => {
  it("veritabanina baglanir ve schema dogru", async () => {
    // Connectivity smoke test: izole PG'ye baglanip tablo sayisini al.
    const tables = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    expect(tables.length).toBe(1);
    const tableCount = Number(tables[0]!.count);
    expect(tableCount).toBeGreaterThan(0);
  });

  it("Tenant A icin export, yalnizca Tenant A satirlarini doner", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "a-isolation.json");
    const req: ExportRequest = {
      tenantId: tenantA,
      exportedBy: "usr-pilot",
      datasets: ["owners", "patients", "examinations"],
      format: "json",
      piiCheck: "strict",
      country: "TR",
      release: "0.1.0",
    };
    const r = await exportTenantData(req, {
      dataSource,
      outputFile: out,
    });
    expect(r.totalRows).toBe(3); // 1 owner + 1 patient + 1 examination
    expect(r.rowsPerDataset["owners"]).toBe(1);
    expect(r.rowsPerDataset["patients"]).toBe(1);
    expect(r.rowsPerDataset["examinations"]).toBe(1);

    // Cross-tenant kacak yok: Tenant B'nin telefonu (+905552222222)
    // ve emaili export dosyasinda olmamali.
    const onDisk = await readFile(out, "utf8");
    expect(onDisk).not.toContain("+905552222222");
    expect(onDisk).not.toContain("mehmet.b@pilot.local");
    expect(onDisk).not.toContain("Mehmet");
    expect(onDisk).not.toContain("Demir");
    expect(onDisk).not.toContain("Pamuk");

    // Tenant A'nin PII'si strict modda mask'lenmis olmali.
    expect(onDisk).not.toContain("+905551111111");
    expect(onDisk).not.toContain("ayse.a@pilot.local");
    expect(onDisk).toContain("***");
  });

  it("Tenant B icin export, yalnizca Tenant B satirlarini doner", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "b-isolation.json");
    const r = await exportTenantData(
      {
        tenantId: tenantB,
        exportedBy: "usr-pilot",
        datasets: ["owners", "patients", "examinations"],
        format: "json",
        piiCheck: "strict",
      },
      { dataSource, outputFile: out },
    );
    expect(r.rowsPerDataset["owners"]).toBe(1);
    expect(r.rowsPerDataset["patients"]).toBe(1);
    // Tenant B'de examination yok; 0 olmali.
    expect(r.rowsPerDataset["examinations"]).toBe(0);
    expect(r.totalRows).toBe(2);

    const onDisk = await readFile(out, "utf8");
    expect(onDisk).not.toContain("+905551111111");
    expect(onDisk).not.toContain("ayse.a@pilot.local");
    expect(onDisk).not.toContain("Karabas");
    // Tenant B'nin PII'si mask'lenmis olmali.
    expect(onDisk).not.toContain("+905552222222");
  });

  it("strict modda PII alanlari mask'lenir", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "strict.json");
    const r = await exportTenantData(
      {
        tenantId: tenantA,
        exportedBy: "usr-pilot",
        datasets: ["owners"],
        format: "json",
        piiCheck: "strict",
      },
      { dataSource, outputFile: out },
    );
    expect(r.piiMasked).toBe(true);
    expect(r.piiFieldsDetected).toBeGreaterThan(0);
    const onDisk = await readFile(out, "utf8");
    // Owner tablosunda PII alanlari: firstName, lastName, email, phone.
    // Bunlarin hepsi mask'lenmis olmali; *** gecmeli.
    expect(onDisk).toContain("***");
    expect(onDisk).not.toContain("Ayse");
    expect(onDisk).not.toContain("Yilmaz");
    expect(onDisk).not.toContain("ayse.a@pilot.local");
    expect(onDisk).not.toContain("+905551111111");
  });

  it("permissive modda PII alanlari olduigu gibi kalir ama audit'te flaglenir", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "permissive.json");
    const r = await exportTenantData(
      {
        tenantId: tenantA,
        exportedBy: "usr-pilot",
        datasets: ["owners"],
        format: "json",
        piiCheck: "permissive",
      },
      { dataSource, outputFile: out },
    );
    expect(r.piiMasked).toBe(false);
    expect(r.piiFieldsDetected).toBeGreaterThan(0);
    const onDisk = await readFile(out, "utf8");
    // PII olduigu gibi duruyor.
    expect(onDisk).toContain("Ayse");
    expect(onDisk).toContain("Yilmaz");
    expect(onDisk).toContain("ayse.a@pilot.local");
    expect(onDisk).toContain("+905551111111");
  });

  it("CSV formatinda basit CSV uretir (cross-tenant temiz)", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "export.csv");
    await exportTenantData(
      {
        tenantId: tenantA,
        exportedBy: "usr-pilot",
        datasets: ["owners", "patients", "examinations"],
        format: "csv",
        piiCheck: "strict",
      },
      { dataSource, outputFile: out },
    );
    const onDisk = await readFile(out, "utf8");
    expect(onDisk).toContain("## owners");
    expect(onDisk).toContain("## patients");
    expect(onDisk).toContain("## examinations");
    // Cross-tenant kacak yok.
    expect(onDisk).not.toContain("Mehmet");
    expect(onDisk).not.toContain("+905552222222");
  });

  it("audit event zorunlu alanlari icerir", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "audit.json");
    const r = await exportTenantData(
      {
        tenantId: tenantA,
        exportedBy: "usr-pilot",
        datasets: ["owners", "patients", "examinations"],
        format: "json",
        piiCheck: "strict",
        country: "TR",
        release: "0.1.0",
      },
      { dataSource, outputFile: out, correlationId: "req-pilot-1" },
    );
    expect(r.auditEvent.eventName).toBe("audit:tenant.export.created");
    expect(r.auditEvent.tenantId).toBe(tenantA);
    expect(r.auditEvent.actorId).toBe("usr-pilot");
    expect(r.auditEvent.actorType).toBe("user");
    expect(r.auditEvent.format).toBe("json");
    expect(r.auditEvent.datasets).toEqual([
      "owners",
      "patients",
      "examinations",
    ]);
    expect(r.auditEvent.totalRows).toBe(3);
    expect(r.auditEvent.piiMasked).toBe(true);
    expect(r.auditEvent.correlationId).toBe("req-pilot-1");
    expect(r.auditEvent.country).toBe("TR");
    expect(r.auditEvent.release).toBe("0.1.0");
    expect(typeof r.auditEvent.occurredAt).toBe("string");
  });

  it("dry-run modunda dosya yazilmaz", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "dryrun.json");
    const r = await exportTenantData(
      {
        tenantId: tenantA,
        exportedBy: "usr-pilot",
        datasets: ["owners"],
        format: "json",
        piiCheck: "strict",
      },
      { dataSource, outputFile: out, dryRun: true },
    );
    expect(r.totalRows).toBe(1);
    await expect(stat(out)).rejects.toThrow();
  });

  it("gecersiz tenantId hata firlatir (tenant bulunamaz, 0 satir)", async () => {
    const dataSource = new PrismaTenantDataSource(prisma);
    const out = join(workdir, "empty.json");
    const ghostTenant = randomUUID();
    const r = await exportTenantData(
      {
        tenantId: ghostTenant,
        exportedBy: "usr-pilot",
        datasets: ["owners", "patients"],
        format: "json",
        piiCheck: "strict",
      },
      { dataSource, outputFile: out },
    );
    // Hata firlatmak yerine bos set donmek de kabul edilebilir bir
    // davranis; burada pilot kontrati "0 satir, basarili export" olarak
    // belirlenmistir.
    expect(r.totalRows).toBe(0);
    expect(r.rowsPerDataset["owners"]).toBe(0);
    expect(r.rowsPerDataset["patients"]).toBe(0);
  });
});

describeDb("StandardPiiMasker + Prisma kaynakli PII", () => {
  it("Prisma'dan gelen owner satirini dogru mask'ler", () => {
    const masker = new StandardPiiMasker();
    const owner = {
      id: "own-1",
      tenantId: tenantA,
      firstName: "Ayse",
      lastName: "Yilmaz",
      phone: "+905551111111",
      email: "ayse.a@pilot.local",
    };
    const masked = masker.maskObject(owner);
    expect(masked["firstName"]).not.toBe("Ayse");
    expect(masked["lastName"]).not.toBe("Yilmaz");
    expect(masked["phone"]).not.toBe("+905551111111");
    expect(masked["email"]).not.toBe("ayse.a@pilot.local");
    // firstName en azindan *** icermeli; internal maske formatinin
    // tam dogrulanmasi unit testte (pii-masker.test.ts) yapiliyor.
    expect(masked["firstName"]).toContain("***");
  });
});
