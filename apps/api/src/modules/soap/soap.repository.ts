/**
 * @file SOAP repository (in-memory).
 * @module apps/api/modules/soap/soap.repository
 *
 * @description SOAP notu + SoapAmend veri erişim katmanı. GOAL-041
 * kapsamında DB migration sonraya bırakıldı; tenant-scoped in-memory
 * Map kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * İki ayrı store:
 * - `SoapNotesRepository`: SOAP notu kayıtları (status state machine)
 * - `SoapAmendsRepository`: amendment (düzeltme) kayıtları;
 *   append-only politika; her amendment eski imza zamanını/imzacısını
 *   saklar.
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type {
  SoapNote as PrismaSoapNote,
  SoapAmend as PrismaSoapAmend,
  Prisma,
} from "@prisma/client";

import type { SoapNote, SoapStatus } from "@vetniva/contracts";

/** Persist edilmiş SOAP amend (düzeltme) record. */
export interface SoapAmendRecord {
  id: string;
  tenantId: string;
  originalSoapId: string;
  examinationId: string;
  reason: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  amendedBy: string;
  amendedAt: string;
  previousSignedAt: string | null;
  previousSignedBy: string | null;
}

/** Persist edilmiş SOAP notu record. */
export interface SoapNoteRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: SoapStatus;
  createdAt: string;
  createdBy: string;
  signedAt: string | null;
  signedBy: string | null;
  amendedAt: string | null;
}

@Injectable()
export class SoapNotesRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, SoapNoteRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /**
   * (tenantId, examinationId) → SOAP notu. Bir muayeneye en fazla
   * bir aktif SOAP notu bağlanabilir; amend'ler ayrı store'da.
   */
  private readonly byExamination = new Map<string, string>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  public async persist(r: SoapNoteRecord): Promise<SoapNoteRecord> {
    if (!this.prisma) return this.insert(r);
    this.insert(r);
    const x = await this.ctx(r.tenantId, (tx) =>
      tx.soapNote.create({
        data: {
          id: r.id,
          tenantId: r.tenantId,
          examinationId: r.examinationId,
          subjective: r.subjective,
          objective: r.objective,
          assessment: r.assessment,
          plan: r.plan,
          status: r.status,
          createdAt: new Date(r.createdAt),
          createdBy: r.createdBy,
          signedAt: r.signedAt ? new Date(r.signedAt) : null,
          signedBy: r.signedBy,
          amendedAt: r.amendedAt ? new Date(r.amendedAt) : null,
        },
      }),
    );
    return this.map(x);
  }
  public async persistedByExam(
    tenantId: string,
    examinationId: string,
  ): Promise<SoapNoteRecord | null> {
    if (!this.prisma) return this.findByExamination(tenantId, examinationId);
    const x = await this.ctx(tenantId, (tx) =>
      tx.soapNote.findUnique({
        where: { tenantId_examinationId: { tenantId, examinationId } },
      }),
    );
    return x ? this.map(x) : null;
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    p: Parameters<SoapNotesRepository["update"]>[2],
  ): Promise<SoapNoteRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, p);
    const data: Prisma.SoapNoteUpdateManyMutationInput = {
      ...(p.subjective !== undefined ? { subjective: p.subjective } : {}),
      ...(p.objective !== undefined ? { objective: p.objective } : {}),
      ...(p.assessment !== undefined ? { assessment: p.assessment } : {}),
      ...(p.plan !== undefined ? { plan: p.plan } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.signedAt !== undefined
        ? { signedAt: p.signedAt ? new Date(p.signedAt) : null }
        : {}),
      ...(p.signedBy !== undefined ? { signedBy: p.signedBy } : {}),
      ...(p.amendedAt !== undefined
        ? { amendedAt: p.amendedAt ? new Date(p.amendedAt) : null }
        : {}),
    };
    const c = await this.ctx(tenantId, (tx) =>
      tx.soapNote.updateMany({ where: { id, tenantId }, data }),
    );
    return c.count
      ? this.persistedByExam(
          tenantId,
          (await this.findIdTenant(tenantId, id))?.examinationId ?? "",
        )
      : null;
  }
  private async findIdTenant(
    tenantId: string,
    id: string,
  ): Promise<SoapNoteRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const x = await this.ctx(tenantId, (tx) =>
      tx.soapNote.findUnique({ where: { id } }),
    );
    return x ? this.map(x) : null;
  }
  private async ctx<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return fn(tx);
    });
  }
  private map(x: PrismaSoapNote): SoapNoteRecord {
    return {
      id: x.id,
      tenantId: x.tenantId,
      examinationId: x.examinationId,
      subjective: x.subjective,
      objective: x.objective,
      assessment: x.assessment,
      plan: x.plan,
      status: x.status as SoapStatus,
      createdAt: x.createdAt.toISOString(),
      createdBy: x.createdBy,
      signedAt: x.signedAt?.toISOString() ?? null,
      signedBy: x.signedBy,
      amendedAt: x.amendedAt?.toISOString() ?? null,
    };
  }

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `soap-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: SoapNoteRecord): SoapNoteRecord {
    this.byId.set(record.id, record);
    this.byExamination.set(
      `${record.tenantId}|${record.examinationId}`,
      record.id,
    );
    return record;
  }

  public findById(tenantId: string, id: string): SoapNoteRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findByExamination(
    tenantId: string,
    examinationId: string,
  ): SoapNoteRecord | null {
    const id = this.byExamination.get(`${tenantId}|${examinationId}`);
    if (!id) return null;
    return this.findById(tenantId, id);
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır (örn. `signedAt`).
   */
  public update(
    tenantId: string,
    id: string,
    patch: {
      subjective?: string | undefined;
      objective?: string | undefined;
      assessment?: string | undefined;
      plan?: string | undefined;
      status?: SoapStatus | undefined;
      signedAt?: string | null | undefined;
      signedBy?: string | null | undefined;
      amendedAt?: string | null | undefined;
    },
  ): SoapNoteRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byId.set(id, rec);
    return rec;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byExamination.clear();
    this.counters.clear();
  }

  public toRecord(args: SoapNoteRecord): SoapNoteRecord {
    return { ...args };
  }
}

@Injectable()
export class SoapAmendsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, SoapAmendRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  public async persist(r: SoapAmendRecord): Promise<SoapAmendRecord> {
    if (!this.prisma) return this.insert(r);
    this.insert(r);
    const x = await this.ctx(r.tenantId, (tx) =>
      tx.soapAmend.create({
        data: {
          id: r.id,
          tenantId: r.tenantId,
          originalSoapId: r.originalSoapId,
          examinationId: r.examinationId,
          reason: r.reason,
          subjective: r.subjective,
          objective: r.objective,
          assessment: r.assessment,
          plan: r.plan,
          amendedBy: r.amendedBy,
          amendedAt: new Date(r.amendedAt),
          previousSignedAt: r.previousSignedAt
            ? new Date(r.previousSignedAt)
            : null,
          previousSignedBy: r.previousSignedBy,
        },
      }),
    );
    return this.map(x);
  }
  public async persistedByExam(
    tenantId: string,
    examinationId: string,
  ): Promise<SoapAmendRecord[]> {
    if (!this.prisma) return this.findByExaminationId(tenantId, examinationId);
    const x = await this.ctx(tenantId, (tx) =>
      tx.soapAmend.findMany({
        where: { tenantId, examinationId },
        orderBy: { amendedAt: "asc" },
      }),
    );
    return x.map((y) => this.map(y));
  }
  private async ctx<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return fn(tx);
    });
  }
  private map(x: PrismaSoapAmend): SoapAmendRecord {
    return {
      id: x.id,
      tenantId: x.tenantId,
      originalSoapId: x.originalSoapId,
      examinationId: x.examinationId,
      reason: x.reason,
      subjective: x.subjective,
      objective: x.objective,
      assessment: x.assessment,
      plan: x.plan,
      amendedBy: x.amendedBy,
      amendedAt: x.amendedAt.toISOString(),
      previousSignedAt: x.previousSignedAt?.toISOString() ?? null,
      previousSignedBy: x.previousSignedBy,
    };
  }

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `soapamend-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: SoapAmendRecord): SoapAmendRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): SoapAmendRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findByExaminationId(
    tenantId: string,
    examinationId: string,
  ): SoapAmendRecord[] {
    const out: SoapAmendRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.examinationId === examinationId) out.push(rec);
    }
    out.sort((a, b) => a.amendedAt.localeCompare(b.amendedAt));
    return out;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}

/** Record → public SoapNote (API response). */
export function toSoapNote(rec: SoapNoteRecord): SoapNote {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    subjective: rec.subjective,
    objective: rec.objective,
    assessment: rec.assessment,
    plan: rec.plan,
    status: rec.status,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    signedAt: rec.signedAt,
    signedBy: rec.signedBy,
    amendedAt: rec.amendedAt,
  };
}
