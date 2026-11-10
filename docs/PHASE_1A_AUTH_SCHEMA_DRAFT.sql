-- REVIEW DRAFT ONLY — NOT APPLIED. Requires explicit migration approval.
-- Derived from server/prisma/schema.prisma using prisma migrate diff --from-empty.
-- Auth-only prerequisite: 3 public enums, public.User, and 3 indexes.
-- No changes to neon_auth or other application models; not a full schema baseline.
-- Intentionally fails and rolls back if any target object already exists.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE public."ChatRetentionPreference" AS ENUM ('EPHEMERAL_SESSION_ONLY', 'PERSISTENT_HISTORY');

CREATE TYPE public."UserRole" AS ENUM ('USER', 'CONTENT_MODERATOR', 'ADMIN', 'SUPER_ADMIN');

CREATE TYPE public."AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

CREATE TABLE public."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarKey" TEXT,
    "googleSub" TEXT,
    "chatRetentionPreference" public."ChatRetentionPreference" NOT NULL DEFAULT 'EPHEMERAL_SESSION_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" public."UserRole" NOT NULL DEFAULT 'USER',
    "status" public."AccountStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON public."User"("email");

CREATE UNIQUE INDEX "User_googleSub_key" ON public."User"("googleSub");

CREATE INDEX "User_role_status_idx" ON public."User"("role", "status");

COMMIT;
