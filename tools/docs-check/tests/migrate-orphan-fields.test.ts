#!/usr/bin/env node
/**
 * @file migrate-orphan-fields.mjs unit test.
 * @module tools/docs-check/tests/migrate-orphan-fields
 * @description GOAL-128 dry-run migration script icin temel
 *   davranis testleri. Uretim raporunda calismasi onemli olan
 *   uc fonksiyon: parseOrphanList, classifyOrphans, renderMarkdown.
 *
 * @author GOAL-128 (FAZ-12) orphan field fix
 * @since 2026-08-07
 */

import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  parseOrphanList,
  classifyOrphans,
  renderMarkdown,
} from "../scripts/migrate-orphan-fields.mjs";

describe("migrate-orphan-fields", () => {
  describe("parseOrphanList", () => {
    it("parses standard docs:check warning lines", () => {
      const stdout = `
[UYARI] field:order.actorId — Alan sozlugunde tanimli ancak kodda referansi yok (orphan): docs/fields/fields.yaml
[UYARI] field:event.eventName — Alan sozlugunde tanimli ancak kodda referansi yok (orphan): docs/fields/fields.yaml
[UYARI] field:tenant.branchCount — Alan sozlugunde tanimli ancak kodda referansi yok (orphan): docs/fields/fields.yaml
      `.trim();
      const result = parseOrphanList(stdout);
      assert.equal(result.length, 3);
      assert.deepEqual(result[0], {
        entity: "order",
        field: "actorId",
        fieldId: "order.actorId",
      });
      assert.deepEqual(result[1], {
        entity: "event",
        field: "eventName",
        fieldId: "event.eventName",
      });
      assert.deepEqual(result[2], {
        entity: "tenant",
        field: "branchCount",
        fieldId: "tenant.branchCount",
      });
    });

    it("returns empty array for stdout without orphan lines", () => {
      assert.deepEqual(parseOrphanList(""), []);
      assert.deepEqual(parseOrphanList("[HATA] unrelated error"), []);
    });

    it("ignores lines that don't match orphan pattern", () => {
      const stdout = `
Some random text
field without colon
[UYARI] unrelated warning
      `.trim();
      assert.deepEqual(parseOrphanList(stdout), []);
    });
  });

  describe("classifyOrphans", () => {
    const testMapping = {
      mappings: {
        order: "audit_event",
        event: "audit_event",
        job: "job_run",
        cash: "kasa",
      },
      categoryB: { entities: ["audit_event", "security_event"] },
      keepAsIs: { ownership_history: "audit trail" },
    };

    it("Kategori A: yanlis entity → target entity", () => {
      const orphans = [
        { entity: "order", field: "actorId", fieldId: "order.actorId" },
        { entity: "event", field: "eventName", fieldId: "event.eventName" },
        { entity: "job", field: "startedAt", fieldId: "job.startedAt" },
      ];
      const { categories } = classifyOrphans(orphans, testMapping);
      assert.equal(categories.A.length, 3);
      assert.equal(categories.A[0].targetEntity, "audit_event");
      assert.equal(categories.A[1].targetEntity, "audit_event");
      assert.equal(categories.A[2].targetEntity, "job_run");
    });

    it("Kategori B: dynamic reflection (categoryB.entities)", () => {
      const orphans = [
        {
          entity: "audit_event",
          field: "fingerprint",
          fieldId: "audit_event.fingerprint",
        },
        {
          entity: "security_event",
          field: "ipAddress",
          fieldId: "security_event.ipAddress",
        },
      ];
      const { categories } = classifyOrphans(orphans, testMapping);
      assert.equal(categories.B.length, 2);
      assert.equal(categories.B[0].action, "scanner-pattern-needed");
    });

    it("Kategori C: keepAsIs (kullanilmiyor)", () => {
      // ownership_history 35 alanla keepAsIs + count > 30
      const orphans = Array.from({ length: 35 }, (_, i) => ({
        entity: "ownership_history",
        field: `field${i}`,
        fieldId: `ownership_history.field${i}`,
      }));
      const { categories } = classifyOrphans(orphans, testMapping);
      assert.equal(categories.C.length, 35);
    });

    it("Unmapped: bilinmeyen entity, manuel review gerekli", () => {
      const orphans = [
        { entity: "weird_entity", field: "foo", fieldId: "weird_entity.foo" },
      ];
      const { categories } = classifyOrphans(orphans, testMapping);
      assert.equal(categories.unmapped.length, 1);
      assert.equal(categories.unmapped[0].action, "manual-review");
    });

    it("entityCount dogru hesaplanir", () => {
      const orphans = [
        { entity: "order", field: "a", fieldId: "order.a" },
        { entity: "order", field: "b", fieldId: "order.b" },
        { entity: "event", field: "x", fieldId: "event.x" },
      ];
      const { entityCount } = classifyOrphans(orphans, testMapping);
      assert.equal(entityCount.get("order"), 2);
      assert.equal(entityCount.get("event"), 1);
    });
  });

  describe("renderMarkdown", () => {
    it("toplam orphan ve kategori dagilimi icerir", () => {
      const orphans = [
        { entity: "order", field: "actorId", fieldId: "order.actorId" },
        {
          entity: "ownership_history",
          field: "oldOwner",
          fieldId: "ownership_history.oldOwner",
        },
      ];
      const classification = {
        categories: {
          A: [
            {
              ...orphans[0],
              targetEntity: "audit_event",
              targetFieldId: "audit_event.actorId",
              action: "migrate",
            },
          ],
          B: [],
          C: [{ ...orphans[1], action: "review-remove-or-keep" }],
          D: [],
          unmapped: [],
        },
        entityCount: new Map([
          ["order", 1],
          ["ownership_history", 1],
        ]),
      };
      const projected = { afterA: 1, afterB: 1, afterC: 0, afterD: 0 };
      const md = renderMarkdown({ orphans, classification, projected });
      assert.match(md, /Toplam orphan field.*2/);
      assert.match(md, /Yanlis entity/);
      assert.match(md, /1 alan tasindi/);
      assert.match(md, /Kullanilmiyor/);
      assert.match(md, /audit_event \(1 alan\)/);
    });
  });
});
