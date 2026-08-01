/**
 * @file NotificationsService unit testleri.
 * @module apps/api/modules/notifications/notifications.service.spec
 *
 * @description Template render, consent, idempotency, retry, provider
 * seçimi, in-app inbox ve cross-tenant senaryoları. AuditService
 * mock'lanır; queue ve provider'lar izole instantiate edilir.
 *
 * @since GOOL-015 (FAZ-2) bildirim altyapısı temeli
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsService } from "./notifications.service.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import { IdempotencyService } from "../../common/notifications/idempotency.service.js";
import { InboxStore } from "../../common/notifications/providers/in-app.provider.js";
import {
  MAX_ATTEMPTS,
  NotificationQueue,
  type QueueProcessOutcome,
} from "../../common/notifications/queue.js";
import { TemplateService } from "../../common/notifications/template.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { InboxItem } from "../../common/notifications/notification.types.js";
import type {
  NotificationProvider,
  ProviderSendPayload,
  ProviderSendResult,
} from "../../common/notifications/provider.interface.js";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationLocale,
} from "@vetniva/contracts";

/** Testlerde başarılı dönen noop provider. İn_app kanalında
 *  ayrıca test InboxStore'una yazar (in-app davranışını simüle
 *  etmek için). */
class StubProvider implements NotificationProvider {
  public readonly channel: NotificationChannel;
  public callCount = 0;
  constructor(
    channel: NotificationChannel,
    private readonly inboxStore?: InboxStore,
  ) {
    this.channel = channel;
  }
  public async send(
    payload: ProviderSendPayload & {
      userId?: string;
      category?: string;
      templateKey?: string;
    },
  ): Promise<ProviderSendResult> {
    this.callCount += 1;
    if (
      this.inboxStore &&
      payload.userId &&
      payload.category &&
      payload.templateKey
    ) {
      this.inboxStore.add(payload.userId, {
        id: `stub-${this.callCount}`,
        category: payload.category as InboxItem["category"],
        templateKey: payload.templateKey,
        body: payload.body,
        createdAt: new Date().toISOString(),
        readAt: null,
      });
    }
    return {
      externalId: `stub-${this.channel}-${this.callCount}`,
      status: "sent",
    };
  }
}

/** Her çağrıda hata fırlatan provider (retry testleri için). */
class FailingProvider implements NotificationProvider {
  public readonly channel: NotificationChannel;
  public callCount = 0;
  constructor(channel: NotificationChannel) {
    this.channel = channel;
  }
  public async send(
    _payload: ProviderSendPayload,
  ): Promise<ProviderSendResult> {
    this.callCount += 1;
    throw new Error("provider boom");
  }
}

function makeAuditStub(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({
      eventId: "evt-1",
      timestamp: new Date().toISOString(),
    }),
  } as unknown as AuditService;
}

function makeActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    actorId: "user-1",
    actorType: "user",
    role: "OWNER",
    tenantId: "tenant-1",
    branchId: null,
    isSuperadmin: false,
    correlationId: "req-test-001",
    ipAddress: null,
    userAgentHash: null,
    source: "header",
    ...overrides,
  };
}

const BASE_REQUEST = {
  tenantId: "tenant-1",
  userId: "user-1",
  channel: "in_app" as NotificationChannel,
  category: "appointment_reminder" as NotificationCategory,
  templateKey: "appointment_reminder",
  locale: "tr-TR" as NotificationLocale,
  data: {
    ownerName: "Ahmet",
    petName: "Karabaş",
    clinicName: "Pati Vet",
    date: "2026-01-15",
    time: "10:00",
  },
};

describe("NotificationsService", () => {
  let templates: TemplateService;
  let consent: ConsentService;
  let idempotency: IdempotencyService;
  let inbox: InboxStore;
  let audit: AuditService;
  let inAppProvider: StubProvider;
  let emailProvider: StubProvider;
  let smsProvider: StubProvider;
  let queue: NotificationQueue;
  let service: NotificationsService;

  beforeEach(() => {
    templates = new TemplateService();
    consent = new ConsentService();
    idempotency = new IdempotencyService();
    inbox = new InboxStore();
    audit = makeAuditStub();
    inAppProvider = new StubProvider("in_app", inbox);
    emailProvider = new StubProvider("email");
    smsProvider = new StubProvider("sms");
    queue = new NotificationQueue([inAppProvider, emailProvider, smsProvider]);
    service = new NotificationsService(
      templates,
      consent,
      idempotency,
      queue,
      inbox,
      audit,
    );
  });

  // ---------------------------------------------------------------------------
  // Template render
  // ---------------------------------------------------------------------------

  describe("template render", () => {
    it("`{{variable}}` substitution çalışır", async () => {
      const result = await service.send({
        ...BASE_REQUEST,
        data: {
          petName: "Karabaş",
          vaccineName: "Kuduz",
          dueDate: "2026-01-15",
        },
        category: "vaccination_due",
        templateKey: "vaccination_due",
      });
      // sent status + provider çağrıldı
      expect(result.status).toBe("sent");
      // inbox provider çağrıldı, body template render edildi
      expect(inbox.list("user-1")).toHaveLength(1);
      const item = inbox.list("user-1")[0];
      expect(item?.body).toContain("Karabaş");
      expect(item?.body).toContain("2026-01-15");
    });

    it("tr-TR template Türkçe döner", () => {
      const out = templates.render("appointment_reminder", "tr-TR", {
        ownerName: "Ayşe",
        petName: "Boncuk",
        clinicName: "Pati",
        date: "2026-02-01",
        time: "14:30",
      });
      expect(out.subject).toBe("Randevu Hatırlatması");
      expect(out.body).toContain("Sayın Ayşe");
      expect(out.body).toContain("Boncuk");
    });

    it("en-GB template İngilizce döner", () => {
      const out = templates.render("appointment_reminder", "en-GB", {
        ownerName: "John",
        petName: "Rex",
        clinicName: "Paws",
        date: "2026-02-01",
        time: "14:30",
      });
      expect(out.subject).toBe("Appointment Reminder");
      expect(out.body).toContain("Dear John");
    });
  });

  // ---------------------------------------------------------------------------
  // Consent
  // ---------------------------------------------------------------------------

  describe("consent", () => {
    it("opted_out → status opted_out, provider çağrılmaz", async () => {
      consent.optOut("user-1", "in_app", "appointment_reminder");
      const result = await service.send({ ...BASE_REQUEST });
      expect(result.status).toBe("opted_out");
      expect(result.lastError).toMatch(/opted out/i);
      expect(inAppProvider.callCount).toBe(0);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "warning" }),
      );
    });

    it("default: tüm kanallar izinli", async () => {
      const result = await service.send({ ...BASE_REQUEST });
      expect(result.status).toBe("sent");
    });
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  describe("idempotency", () => {
    it("aynı key ile ikinci çağrıda provider tekrar çağrılmaz", async () => {
      await service.send({ ...BASE_REQUEST, idempotencyKey: "key-abc-123" });
      const beforeCount = inAppProvider.callCount;
      const second = await service.send({
        ...BASE_REQUEST,
        idempotencyKey: "key-abc-123",
      });
      // FAZ-0 stub: lookupRecord() her zaman null döner → service
      // opted_out recordId döner. Önemli olan provider'ın ikinci
      // kez çağrılmadığıdır.
      expect(inAppProvider.callCount).toBe(beforeCount);
      expect(second.status).toBe("opted_out");
    });

    it("farklı key'ler → iki ayrı kayıt", async () => {
      const first = await service.send({
        ...BASE_REQUEST,
        idempotencyKey: "key-1",
      });
      const second = await service.send({
        ...BASE_REQUEST,
        idempotencyKey: "key-2",
      });
      expect(first.id).not.toBe(second.id);
      expect(inAppProvider.callCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Send başarı / retry
  // ---------------------------------------------------------------------------

  describe("send", () => {
    it("başarılı gönderim → status 'sent' + audit info", async () => {
      const result = await service.send({ ...BASE_REQUEST });
      expect(result.status).toBe("sent");
      expect(result.sentAt).toBeTruthy();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:notification.send",
          severity: "info",
        }),
      );
    });

    it("retry: 3 deneme sonra status 'failed' + audit warning", async () => {
      const failing = new FailingProvider("email");
      const localQueue = new NotificationQueue([failing]);
      const localService = new NotificationsService(
        templates,
        consent,
        idempotency,
        localQueue,
        inbox,
        audit,
      );
      const result = await localService.send({
        ...BASE_REQUEST,
        channel: "email",
      });
      expect(failing.callCount).toBe(MAX_ATTEMPTS);
      expect(result.status).toBe("failed");
      expect(result.lastError).toMatch(/boom/);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "warning" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Provider seçimi
  // ---------------------------------------------------------------------------

  describe("provider seçimi", () => {
    it("channel=email → email provider; channel=sms → sms provider", async () => {
      await service.send({ ...BASE_REQUEST, channel: "email" });
      expect(emailProvider.callCount).toBe(1);
      expect(smsProvider.callCount).toBe(0);
      expect(inAppProvider.callCount).toBe(0);

      await service.send({ ...BASE_REQUEST, channel: "sms" });
      expect(smsProvider.callCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // In-app
  // ---------------------------------------------------------------------------

  describe("in-app", () => {
    it("in-app provider her zaman başarılı + inbox'a yazar", async () => {
      const result = await service.send({ ...BASE_REQUEST, channel: "in_app" });
      expect(result.status).toBe("sent");
      const items = inbox.list("user-1");
      expect(items).toHaveLength(1);
      expect(items[0]?.templateKey).toBe("appointment_reminder");
      expect(items[0]?.body).toContain("Karabaş");
    });

    it("inbox() kullanıcının listesini döner", async () => {
      await service.send({ ...BASE_REQUEST, channel: "in_app" });
      const actor = makeActor({ actorId: "user-1", tenantId: "tenant-1" });
      const items = await service.inbox("user-1", "tenant-1", actor);
      expect(items).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-tenant
  // ---------------------------------------------------------------------------

  describe("cross-tenant", () => {
    it("farklı tenantId → 404 VET-AUTHZ-0002", async () => {
      const actor = makeActor({ tenantId: "tenant-A" });
      await expect(
        service.send({ ...BASE_REQUEST, tenantId: "tenant-B" }, actor),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0002",
        httpStatus: 404,
      });
    });

    it("inbox() farklı tenantId → 404 VET-AUTHZ-0002", async () => {
      const actor = makeActor({ tenantId: "tenant-A" });
      await expect(
        service.inbox("user-1", "tenant-B", actor),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0002" });
    });
  });

  // ---------------------------------------------------------------------------
  // Queue sözleşmesi
  // ---------------------------------------------------------------------------

  describe("queue", () => {
    it("processAll bilinmeyen kanal için hata fırlatır", () => {
      expect(() => queue.resolveProvider("whatsapp")).toThrowError(/provider/);
    });

    it("boş kuyruk → boş sonuç", async () => {
      const outcomes: QueueProcessOutcome[] = await queue.processAll();
      expect(outcomes).toHaveLength(0);
    });
  });
});
