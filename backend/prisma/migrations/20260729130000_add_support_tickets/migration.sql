-- Migration: support ticket system (topics in Telegram support group)

CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'CLOSED');
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "SupportTicket" (
    "id"           TEXT             NOT NULL,
    "userId"       TEXT,
    "telegramId"   TEXT,
    "guestEmail"   TEXT,
    "status"       "TicketStatus"   NOT NULL DEFAULT 'OPEN',
    "topicId"      INTEGER,
    "assigneeId"   TEXT,
    "assigneeName" TEXT,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportMessage" (
    "id"        TEXT               NOT NULL,
    "ticketId"  TEXT               NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "text"      TEXT               NOT NULL,
    "createdAt" TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_telegramId_idx" ON "SupportTicket"("telegramId");
CREATE INDEX "SupportTicket_topicId_idx" ON "SupportTicket"("topicId");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
