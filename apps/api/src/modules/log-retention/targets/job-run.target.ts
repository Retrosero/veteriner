/**
 * @file JobRun retention target.
 * @module apps/api/modules/log-retention/targets/job-run
 *
 * @description GOAL-106 (FAZ-10) JobRun log kayıtlarını retention
 * sweep'lerine dahil eder. `expireOlderThan` arşiv/sil işlemini
 * `JobRunsRepository.expireOlderThan` üzerinden yapar.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention core
 */

import { Injectable } from "@nestjs/common";

import { JobRunsRepository } from "../../job-runs/job-runs.repository.js";

import type {
  CountOlderThanArgs,
  ExpireOlderThanArgs,
  LogRetentionTarget,
} from "../log-retention.targets.js";

@Injectable()
export class JobRunRetentionTarget implements LogRetentionTarget {
  public readonly logType = "job_run" as const;

  public constructor(private readonly repo: JobRunsRepository) {}

  public listTenantIds(): Array<string | null> {
    const set = new Set<string | null>();
    for (const rec of this.repo.all()) {
      set.add(rec.tenantId);
    }
    return Array.from(set);
  }

  public expireOlderThan(args: ExpireOlderThanArgs): number {
    const repoArgs: { cutoff: string; tenantId?: string | null } = {
      cutoff: args.cutoff,
    };
    if (args.tenantId !== undefined) {
      repoArgs.tenantId = args.tenantId;
    }
    return this.repo.expireOlderThan(repoArgs);
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
