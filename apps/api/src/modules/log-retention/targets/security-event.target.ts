/**
 * @file SecurityEvent retention target.
 * @module apps/api/modules/log-retention/targets/security-event
 *
 * @description GOAL-106 (FAZ-10) SecurityEvent log kayıtlarını
 * retention sweep'lerine dahil eder. `expireOlderThan` arşiv/sil
 * işlemini `SecurityEventsRepository.expireOlderThan` üzerinden
 * yapar. Severity varsayılan olarak repository tarafından
 * korunur (tüm severity birlikte expire olur; severity bazlı
 * ek filtre gerekirse ayrı target tanımlanır).
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import { Injectable } from "@nestjs/common";

import { SecurityEventsRepository } from "../../security-events/security-events.repository.js";

import type {
  CountOlderThanArgs,
  ExpireOlderThanArgs,
  LogRetentionTarget,
} from "../log-retention.targets.js";

@Injectable()
export class SecurityEventRetentionTarget implements LogRetentionTarget {
  public readonly logType = "security_event" as const;

  public constructor(private readonly repo: SecurityEventsRepository) {}

  public listTenantIds(): Array<string | null> {
    const set = new Set<string | null>();
    for (const rec of this.repo.all()) {
      set.add(rec.tenantId);
    }
    return Array.from(set);
  }

  public async expireOlderThan(args: ExpireOlderThanArgs): Promise<number> {
    const repoArgs: { cutoff: string; tenantId?: string | null } = {
      cutoff: args.cutoff,
    };
    if (args.tenantId !== undefined) {
      repoArgs.tenantId = args.tenantId;
    }
    return this.repo.expirePersistedOlderThan(repoArgs);
  }

  public countOlderThan(args: CountOlderThanArgs): number {
    const repoArgs: { cutoff: string; tenantId?: string | null } = {
      cutoff: args.cutoff,
    };
    if (args.tenantId !== undefined) {
      repoArgs.tenantId = args.tenantId;
    }
    return this.repo.countOlderThan(repoArgs);
  }
}
