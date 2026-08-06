-- =============================================================================
-- @file 4 yeni model için FAZ-10 (GOAL-103/104) migration.
-- @module apps/api/prisma/migrations/20260805000000_init_error_event_extended_models
--
-- @description ErrorEvent ile ilişkili 4 append-only yardımcı tablo:
--   - error_event_notes               (GOAL-104 çözüm notları)
--   - error_event_support_links       (GOAL-104 JIRA/Linear/Zendesk/GitHub
--                                      bağlantıları)
--   - error_event_assignments         (GOAL-104 atama geçmişi)
--   - error_event_status_transitions  (GOAL-103 status state machine log)
--
-- `fingerprint` string referansıdır (ErrorEvent.fingerprint ile eşleşir);
-- FK uygulama katmanında zorunlu kılınır (append-only izolasyon).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- error_event_notes
-- -----------------------------------------------------------------------------
CREATE TABLE "error_event_notes" (
    "id" UUID NOT NULL,
    "fingerprint" CHAR(16) NOT NULL,
    "author_id" VARCHAR(100) NOT NULL,
    "author_type" VARCHAR(20) NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_event_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_event_notes_fingerprint_created_at_idx"
    ON "error_event_notes"("fingerprint", "created_at");

-- -----------------------------------------------------------------------------
-- error_event_support_links
-- -----------------------------------------------------------------------------
CREATE TABLE "error_event_support_links" (
    "id" UUID NOT NULL,
    "fingerprint" CHAR(16) NOT NULL,
    "system" VARCHAR(30) NOT NULL,
    "external_id" VARCHAR(100),
    "url" VARCHAR(500),
    "title" VARCHAR(200),
    "created_by_id" VARCHAR(100) NOT NULL,
    "created_by_type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_event_support_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_event_support_links_fingerprint_created_at_idx"
    ON "error_event_support_links"("fingerprint", "created_at");

-- -----------------------------------------------------------------------------
-- error_event_assignments
-- -----------------------------------------------------------------------------
CREATE TABLE "error_event_assignments" (
    "id" UUID NOT NULL,
    "fingerprint" CHAR(16) NOT NULL,
    "assignee_id" VARCHAR(100),
    "unassigned" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" VARCHAR(100) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(500),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_event_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_event_assignments_fingerprint_assigned_at_idx"
    ON "error_event_assignments"("fingerprint", "assigned_at");

-- -----------------------------------------------------------------------------
-- error_event_status_transitions
-- -----------------------------------------------------------------------------
CREATE TABLE "error_event_status_transitions" (
    "id" UUID NOT NULL,
    "fingerprint" CHAR(16) NOT NULL,
    "from_status" VARCHAR(20) NOT NULL,
    "to_status" VARCHAR(20) NOT NULL,
    "actor_id" VARCHAR(100) NOT NULL,
    "actor_type" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_event_status_transitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_event_status_transitions_fingerprint_occurred_at_idx"
    ON "error_event_status_transitions"("fingerprint", "occurred_at");
