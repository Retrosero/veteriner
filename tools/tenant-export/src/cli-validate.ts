/**
 * @file Tenant export dogrulama CLI.
 * @module @vetniva/tenant-export/cli-validate
 *
 * @description dataset adi, PII alan katalogu ve CSV/JSON
 * serilizasyon sanity kontrollerini yapar. Tenant izolasyonu
 * ve PII kurallarina uyar.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/tenant-export validate
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

import {
  ALL_DATASETS,
  emptyDataSource,
  exportTenantData,
  InMemoryTenantDataSource,
} from "./export.js";
import { StandardPiiMasker } from "./pii-masker.js";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main(): Promise<void> {
  const issues: string[] = [];
  const tmp = join(tmpdir(), `tenant-export-validate-${Date.now()}.json`);

  try {
    // 1) ALL_DATASETS 10 dataset icermeli
    if (ALL_DATASETS.length !== 10) {
      issues.push(`ALL_DATASETS 10 olmali, bulunan: ${ALL_DATASETS.length}`);
    }

    // 2) Standard PII masker 12+ PII alani tespit eder
    const sample = {
      firstName: "Demo",
      email: "demo@vetniva.local",
      phone: "+905550000000",
      vet_license_no: "VET-1234",
      notPii: "ok",
    };
    const masker = new StandardPiiMasker();
    const detected = masker.detectPiiFields(sample);
    if (detected.length < 4) {
      issues.push(`PII tespiti en az 4 olmali, bulunan: ${detected.length}`);
    }
    const masked = masker.maskObject(sample);
    if (masked["email"] === "demo@vetniva.local") {
      issues.push("email mask'lenmemis");
    }
    if (masked["firstName"] === "Demo") {
      issues.push("firstName mask'lenmemis");
    }

    // 3) empty data source ile export
    const emptyResult = await exportTenantData(
      {
        tenantId: "tnt-test",
        exportedBy: "usr-test",
        datasets: ["owners"],
        format: "json",
        piiCheck: "strict",
      },
      {
        dataSource: emptyDataSource(),
        outputFile: tmp,
        dryRun: true,
      },
    );
    if (emptyResult.totalRows !== 0) {
      issues.push(
        `empty data source totalRows 0 olmali, bulunan: ${emptyResult.totalRows}`,
      );
    }

    // 4) in-memory data source ile dolu export
    const demoData = new Map<string, ReadonlyArray<Record<string, unknown>>>([
      [
        "owners",
        [
          {
            id: "own-1",
            firstName: "A",
            lastName: "B",
            email: "a@b.c",
            phone: "+905551111111",
          },
        ],
      ],
    ]);
    const fullResult = await exportTenantData(
      {
        tenantId: "tnt-test",
        exportedBy: "usr-test",
        datasets: ["owners"],
        format: "json",
        piiCheck: "strict",
      },
      {
        dataSource: new InMemoryTenantDataSource(demoData),
        outputFile: tmp,
        dryRun: false,
      },
    );
    if (fullResult.totalRows !== 1) {
      issues.push(
        `dollu data source totalRows 1 olmali, bulunan: ${fullResult.totalRows}`,
      );
    }
    if (!fullResult.piiMasked) {
      issues.push("strict modda PII mask'lenmeli");
    }
    if (fullResult.piiFieldsDetected < 2) {
      issues.push(
        `strict modda en az 2 PII alani tespit edilmeli, bulunan: ${fullResult.piiFieldsDetected}`,
      );
    }
    // Dosyayi oku ve PII mask'li mi kontrol et
    const { readFile } = await import("node:fs/promises");
    const onDisk = await readFile(tmp, "utf8");
    if (onDisk.includes("a@b.c")) {
      issues.push("dosyada email mask'lenmemis (a@b.c mevcut)");
    }
    if (!onDisk.includes("***")) {
      issues.push("dosyada *** maski yok");
    }

    // 5) audit event name dogru
    if (fullResult.auditEvent.eventName !== "audit:tenant.export.created") {
      issues.push(
        `audit event name yanlis: ${fullResult.auditEvent.eventName}`,
      );
    }
    if (fullResult.auditEvent.tenantId !== "tnt-test") {
      issues.push("audit event tenantId yanlis");
    }
    if (fullResult.auditEvent.actorId !== "usr-test") {
      issues.push("audit event actorId yanlis");
    }
  } catch (err) {
    issues.push(`validate exception: ${(err as Error).message}`);
  } finally {
    try {
      await unlink(tmp);
    } catch {
      // ignore
    }
  }

  const summary = {
    totalDatasets: ALL_DATASETS.length,
    issues,
    allOk: issues.length === 0,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`validate hatasi: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
