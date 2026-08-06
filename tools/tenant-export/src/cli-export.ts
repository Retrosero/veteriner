/**
 * @file Tenant veri disa aktarma CLI.
 * @module @vetniva/tenant-export/cli-export
 *
 * @description In-memory data source ile tenant verisini JSON
 * formatinda disa aktarir. Production'da gercek data source
 * inject edilir. Tenant izolasyonu, PII ve audit kurallarina
 * uyar.
 *
 * Kullanim:
 *   pnpm --filter @vetniva/tenant-export export -- \
 *     --tenant=tnt-pilot --exported-by=usr-admin \
 *     --datasets=owners,patients,examinations \
 *     --format=json --pii=strict \
 *     --out=./tenant-export.json --dry-run
 *
 * Pilot senaryosu icin gercek Prisma veri kaynagi:
 *   pnpm --filter @vetniva/tenant-export export -- \
 *     --tenant=<uuid> --exported-by=<user-id> \
 *     --datasets=owners,patients,examinations \
 *     --format=json --pii=strict \
 *     --out=./temp/tenant-export.json --with-prisma
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  exportTenantData,
  InMemoryTenantDataSource,
  ALL_DATASETS,
} from "./export.js";
import { StandardPiiMasker } from "./pii-masker.js";
import { PrismaTenantDataSource } from "./prisma-data-source.js";
import type { ExportDataset, PiiCheckLevel } from "./types.js";

interface Args {
  tenantId: string;
  exportedBy: string;
  tenantSlug?: string;
  datasets: ReadonlyArray<ExportDataset>;
  format: "json" | "csv";
  piiCheck: PiiCheckLevel;
  outFile: string;
  country?: "TR" | "GB";
  release?: string;
  dryRun: boolean;
  /** Demo data toggle: bos liste yerine sentetik demo veri. */
  withDemoData: boolean;
  /** Prisma data source toggle: gercek DB'ye baglanir. */
  withPrisma: boolean;
}

function parseArgs(argv: ReadonlyArray<string>): Args {
  const args: Args = {
    tenantId: "",
    exportedBy: "",
    datasets: [...ALL_DATASETS],
    format: "json",
    piiCheck: "strict",
    outFile: "./tenant-export.json",
    dryRun: false,
    withDemoData: false,
    withPrisma: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    const next = (): string | undefined => {
      const v = argv[++i];
      return typeof v === "string" ? v : undefined;
    };
    if (a === "--tenant") {
      const v = next();
      if (v) args.tenantId = v;
    } else if (a.startsWith("--tenant=")) {
      const v = a.split("=")[1];
      if (v) args.tenantId = v;
    } else if (a === "--exported-by") {
      const v = next();
      if (v) args.exportedBy = v;
    } else if (a.startsWith("--exported-by=")) {
      const v = a.split("=")[1];
      if (v) args.exportedBy = v;
    } else if (a === "--tenant-slug") {
      const v = next();
      if (v) args.tenantSlug = v;
    } else if (a === "--datasets") {
      const v = next();
      if (v) {
        args.datasets = v.split(",").map((s) => s.trim()) as ExportDataset[];
      }
    } else if (a.startsWith("--datasets=")) {
      const v = a.split("=")[1];
      if (v) {
        args.datasets = v.split(",").map((s) => s.trim()) as ExportDataset[];
      }
    } else if (a === "--format") {
      const v = next();
      if (v === "json" || v === "csv") args.format = v;
    } else if (a.startsWith("--format=")) {
      const v = a.split("=")[1];
      if (v === "json" || v === "csv") args.format = v;
    } else if (a === "--pii") {
      const v = next();
      if (v === "strict" || v === "permissive") args.piiCheck = v;
    } else if (a.startsWith("--pii=")) {
      const v = a.split("=")[1];
      if (v === "strict" || v === "permissive") args.piiCheck = v;
    } else if (a === "--out") {
      const v = next();
      if (v) args.outFile = v;
    } else if (a.startsWith("--out=")) {
      const v = a.split("=")[1];
      if (v) args.outFile = v;
    } else if (a === "--country") {
      const v = next();
      if (v === "TR" || v === "GB") args.country = v;
    } else if (a === "--release") {
      const v = next();
      if (v) args.release = v;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--with-demo-data") {
      args.withDemoData = true;
    } else if (a === "--with-prisma") {
      args.withPrisma = true;
    }
  }
  return args;
}

/** Demo sentetik veri (kimliksiz placeholder). */
function buildDemoData(): Map<string, ReadonlyArray<Record<string, unknown>>> {
  return new Map<string, ReadonlyArray<Record<string, unknown>>>([
    [
      "owners",
      [
        {
          id: "own-demo-1",
          firstName: "Demo",
          lastName: "Owner",
          email: "demo@vetniva.local",
          phone: "+905550000000",
        },
      ],
    ],
    [
      "patients",
      [
        {
          id: "pat-demo-1",
          name: "Karabas",
          species: "dog",
          microchip: "TR-DEMO-CHIP-1",
          ownerId: "own-demo-1",
        },
      ],
    ],
    [
      "examinations",
      [
        {
          id: "exm-demo-1",
          patientId: "pat-demo-1",
          kind: "general",
          startedAt: "2026-08-01T10:00:00Z",
        },
      ],
    ],
  ]);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenantId) {
    process.stderr.write("HATA: --tenant zorunlu.\n");
    process.exitCode = 2;
    return;
  }
  if (!args.exportedBy) {
    process.stderr.write("HATA: --exported-by zorunlu.\n");
    process.exitCode = 2;
    return;
  }
  if (args.datasets.length === 0) {
    process.stderr.write("HATA: --datasets en az 1 dataset icermeli.\n");
    process.exitCode = 2;
    return;
  }
  if (args.withDemoData && args.withPrisma) {
    process.stderr.write(
      "HATA: --with-demo-data ve --with-prisma ayni anda kullanilamaz.\n",
    );
    process.exitCode = 2;
    return;
  }

  let dataSource;
  let prismaClient: PrismaClient | null = null;
  if (args.withPrisma) {
    prismaClient = new PrismaClient();
    dataSource = new PrismaTenantDataSource(prismaClient);
  } else if (args.withDemoData) {
    dataSource = new InMemoryTenantDataSource(buildDemoData());
  } else {
    dataSource = new InMemoryTenantDataSource(new Map());
  }

  try {
    const result = await exportTenantData(
      {
        tenantId: args.tenantId,
        exportedBy: args.exportedBy,
        ...(args.tenantSlug ? { tenantSlug: args.tenantSlug } : {}),
        datasets: args.datasets,
        format: args.format,
        piiCheck: args.piiCheck,
        ...(args.country ? { country: args.country } : {}),
        ...(args.release ? { release: args.release } : {}),
      },
      {
        dataSource,
        piiMasker: new StandardPiiMasker(),
        outputFile: resolve(args.outFile),
        dryRun: args.dryRun,
      },
    );

    process.stdout.write(
      JSON.stringify(
        {
          exportId: result.exportId,
          tenantId: result.tenantId,
          exportedAt: result.exportedAt,
          totalRows: result.totalRows,
          rowsPerDataset: result.rowsPerDataset,
          outputFile: result.outputFile,
          piiCheck: result.piiCheck,
          piiFieldsDetected: result.piiFieldsDetected,
          piiMasked: result.piiMasked,
          auditEvent: result.auditEvent,
          dryRun: args.dryRun,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    if (prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

main().catch((err) => {
  process.stderr.write(`export hatasi: ${(err as Error).message}\n`);
  process.exitCode = 1;
});
