-- Migration: gallery of user works (moderated publish, likes)

ALTER TABLE "GenerateJob" ADD COLUMN "modelId" TEXT;

CREATE TYPE "GalleryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "GalleryItem" (
    "id"            TEXT            NOT NULL,
    "userId"        TEXT            NOT NULL,
    "domain"        TEXT            NOT NULL,
    "modelId"       TEXT            NOT NULL,
    "prompt"        TEXT            NOT NULL,
    "mediaUrl"      TEXT            NOT NULL,
    "status"        "GalleryStatus" NOT NULL DEFAULT 'PENDING',
    "likesCount"    INTEGER         NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt"    TIMESTAMP(3),

    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GalleryLike" (
    "id"            TEXT            NOT NULL,
    "galleryItemId" TEXT            NOT NULL,
    "userId"        TEXT            NOT NULL,
    "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryLike_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GalleryItem_status_likesCount_idx" ON "GalleryItem"("status", "likesCount");
CREATE INDEX "GalleryItem_userId_createdAt_idx" ON "GalleryItem"("userId", "createdAt");
CREATE INDEX "GalleryLike_userId_idx" ON "GalleryLike"("userId");
CREATE UNIQUE INDEX "GalleryLike_galleryItemId_userId_key" ON "GalleryLike"("galleryItemId", "userId");

ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalleryLike" ADD CONSTRAINT "GalleryLike_galleryItemId_fkey"
    FOREIGN KEY ("galleryItemId") REFERENCES "GalleryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalleryLike" ADD CONSTRAINT "GalleryLike_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
