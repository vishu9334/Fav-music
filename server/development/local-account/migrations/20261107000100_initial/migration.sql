-- Local isolated runtime only. Never apply to Neon without separate review/approval.
BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChatRetentionPreference" AS ENUM ('EPHEMERAL_SESSION_ONLY', 'PERSISTENT_HISTORY');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'CONTENT_MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TrackPublishStatus" AS ENUM ('DRAFT', 'QUARANTINED', 'PROCESSING', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_ROLE_UPDATED', 'USER_STATUS_UPDATED', 'TRACK_QUARANTINED', 'TRACK_PUBLISHED', 'TRACK_DELETED', 'TRACK_METADATA_UPDATED', 'ROOM_TERMINATED', 'AFFINITY_ADJUSTED', 'SYSTEM_BOOTSTRAP', 'BREAK_GLASS_RECOVERY');

-- CreateEnum
CREATE TYPE "TimeAffinity" AS ENUM ('DAWN', 'MORNING', 'AFTERNOON', 'EVENING', 'LATE_NIGHT');

-- CreateEnum
CREATE TYPE "WeatherAffinity" AS ENUM ('CLEAR_SUNNY', 'RAINY', 'CLOUDY', 'STORMY', 'SNOW_COLD');

-- CreateEnum
CREATE TYPE "SeasonAffinity" AS ENUM ('SPRING', 'SUMMER', 'MONSOON', 'AUTUMN', 'WINTER');

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ReelMatchStatus" AS ENUM ('PENDING', 'MATCHED', 'UNMATCHED', 'EXTRACTION_FAILED');

-- CreateEnum
CREATE TYPE "RoomAccess" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "RoomChatPolicy" AS ENUM ('EPHEMERAL_SESSION_ONLY', 'PERSISTENT_LOG');

-- CreateEnum
CREATE TYPE "ControlRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarKey" TEXT,
    "googleSub" TEXT,
    "chatRetentionPreference" "ChatRetentionPreference" NOT NULL DEFAULT 'EPHEMERAL_SESSION_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "albumName" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "releaseYear" INTEGER,
    "moodTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "licenseReference" TEXT,
    "licenseAttribution" TEXT,
    "licenseVerifiedAt" TIMESTAMP(3),
    "licenseExpiresAt" TIMESTAMP(3),
    "publicStreamingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "audioKey" TEXT NOT NULL,
    "videoKey" TEXT,
    "artworkKey" TEXT NOT NULL,
    "timeAffinities" "TimeAffinity"[],
    "weatherAffinities" "WeatherAffinity"[],
    "seasonAffinities" "SeasonAffinity"[],
    "energyScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "tempoBpm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishStatus" "TrackPublishStatus" NOT NULL DEFAULT 'DRAFT',
    "uploadedById" TEXT,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseTrack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "listenCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstaMusTrack" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "originalTitle" TEXT NOT NULL,
    "originalArtist" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstaMusTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstaMusReel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reelUrl" TEXT NOT NULL,
    "status" "ReelMatchStatus" NOT NULL DEFAULT 'PENDING',
    "confidenceScore" DOUBLE PRECISION,
    "instaMusTrackId" TEXT,
    "extractedMetaJson" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstaMusReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passcodeHash" TEXT,
    "access" "RoomAccess" NOT NULL DEFAULT 'PUBLIC',
    "chatPolicy" "RoomChatPolicy" NOT NULL DEFAULT 'EPHEMERAL_SESSION_ONLY',
    "hostUserId" TEXT NOT NULL,
    "originalControllerId" TEXT,
    "activeControllerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hasConsented" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomControlRequest" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "ControlRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomControlRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomQueueItem" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "suggestedBy" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistentRoomMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersistentRoomMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonalCollectionDefinition" (
    "id" TEXT NOT NULL,
    "nameTemplate" TEXT NOT NULL,
    "seasonCondition" "SeasonAffinity" NOT NULL,
    "weatherCondition" "WeatherAffinity",
    "timeCondition" "TimeAffinity",
    "minEnergy" DOUBLE PRECISION,
    "maxEnergy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonalCollectionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSavedCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "definitionId" TEXT,
    "customName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSavedCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionTrackItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "CollectionTrackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListeningLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER NOT NULL,
    "wasSkipped" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "playbackContext" TEXT,

    CONSTRAINT "ListeningLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlatformMetric" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dauExact" INTEGER NOT NULL,
    "totalPlays" INTEGER NOT NULL,
    "totalListenSeconds" BIGINT NOT NULL,
    "uniqueTracksPlayed" INTEGER NOT NULL,
    "newRegistrations" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlatformMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackDailyMetric" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "trackId" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL,
    "uniqueListeners" INTEGER NOT NULL,
    "totalListenSeconds" BIGINT NOT NULL,
    "skipCount" INTEGER NOT NULL,
    "completionCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountLibrary" (
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountLibrary_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LibraryMutationReceipt" (
    "userId" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "appliedRevision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryMutationReceipt_pkey" PRIMARY KEY ("userId","mutationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "Track_title_artistName_idx" ON "Track"("title", "artistName");

-- CreateIndex
CREATE INDEX "Track_publishStatus_idx" ON "Track"("publishStatus");

-- CreateIndex
CREATE INDEX "Track_publishStatus_publicStreamingAllowed_id_idx" ON "Track"("publishStatus", "publicStreamingAllowed", "id");

-- CreateIndex
CREATE INDEX "WarehouseTrack_userId_status_idx" ON "WarehouseTrack"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseTrack_userId_trackId_key" ON "WarehouseTrack"("userId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "InstaMusTrack_trackId_key" ON "InstaMusTrack"("trackId");

-- CreateIndex
CREATE INDEX "InstaMusReel_userId_status_idx" ON "InstaMusReel"("userId", "status");

-- CreateIndex
CREATE INDEX "InstaMusReel_reelUrl_idx" ON "InstaMusReel"("reelUrl");

-- CreateIndex
CREATE INDEX "Room_hostUserId_idx" ON "Room"("hostUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomParticipant_roomId_userId_key" ON "RoomParticipant"("roomId", "userId");

-- CreateIndex
CREATE INDEX "RoomControlRequest_roomId_status_idx" ON "RoomControlRequest"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoomQueueItem_roomId_orderIndex_key" ON "RoomQueueItem"("roomId", "orderIndex");

-- CreateIndex
CREATE INDEX "PersistentRoomMessage_roomId_createdAt_idx" ON "PersistentRoomMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "UserSavedCollection_userId_idx" ON "UserSavedCollection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionTrackItem_collectionId_orderIndex_key" ON "CollectionTrackItem"("collectionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ListeningLog_eventId_key" ON "ListeningLog"("eventId");

-- CreateIndex
CREATE INDEX "ListeningLog_userId_playedAt_idx" ON "ListeningLog"("userId", "playedAt");

-- CreateIndex
CREATE INDEX "ListeningLog_trackId_playedAt_idx" ON "ListeningLog"("trackId", "playedAt");

-- CreateIndex
CREATE INDEX "ListeningLog_playedAt_idx" ON "ListeningLog"("playedAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlatformMetric_date_key" ON "DailyPlatformMetric"("date");

-- CreateIndex
CREATE INDEX "TrackDailyMetric_date_playCount_idx" ON "TrackDailyMetric"("date", "playCount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TrackDailyMetric_date_trackId_key" ON "TrackDailyMetric"("date", "trackId");

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseTrack" ADD CONSTRAINT "WarehouseTrack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseTrack" ADD CONSTRAINT "WarehouseTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstaMusTrack" ADD CONSTRAINT "InstaMusTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstaMusReel" ADD CONSTRAINT "InstaMusReel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstaMusReel" ADD CONSTRAINT "InstaMusReel_instaMusTrackId_fkey" FOREIGN KEY ("instaMusTrackId") REFERENCES "InstaMusTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_originalControllerId_fkey" FOREIGN KEY ("originalControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_activeControllerId_fkey" FOREIGN KEY ("activeControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomControlRequest" ADD CONSTRAINT "RoomControlRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomControlRequest" ADD CONSTRAINT "RoomControlRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomQueueItem" ADD CONSTRAINT "RoomQueueItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomQueueItem" ADD CONSTRAINT "RoomQueueItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersistentRoomMessage" ADD CONSTRAINT "PersistentRoomMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersistentRoomMessage" ADD CONSTRAINT "PersistentRoomMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedCollection" ADD CONSTRAINT "UserSavedCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedCollection" ADD CONSTRAINT "UserSavedCollection_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "SeasonalCollectionDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTrackItem" ADD CONSTRAINT "CollectionTrackItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "UserSavedCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionTrackItem" ADD CONSTRAINT "CollectionTrackItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningLog" ADD CONSTRAINT "ListeningLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeningLog" ADD CONSTRAINT "ListeningLog_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackDailyMetric" ADD CONSTRAINT "TrackDailyMetric_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountLibrary" ADD CONSTRAINT "AccountLibrary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMutationReceipt" ADD CONSTRAINT "LibraryMutationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
