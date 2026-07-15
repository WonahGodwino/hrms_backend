-- Virtual meetings (video conferencing). Two tables: a meeting room record and
-- its participants. Media is handled by an external SFU (LiveKit, managed now /
-- self-hostable later); these rows are our own record + access control. Additive.

CREATE TABLE "meetings" (
  "id"                    TEXT NOT NULL,
  "companyId"             TEXT NOT NULL,
  "title"                 TEXT NOT NULL,
  "purpose"               TEXT NOT NULL DEFAULT 'WORK_MEETING',
  "provider"              TEXT NOT NULL DEFAULT 'livekit',
  "roomName"              TEXT NOT NULL,
  "scheduledAt"           TIMESTAMP(3),
  "durationMins"          INTEGER,
  "status"                TEXT NOT NULL DEFAULT 'SCHEDULED',
  "createdBy"             TEXT,
  "candidateAssessmentId" TEXT,
  "recordingUrl"          TEXT,
  "recordingRequested"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meetings_roomName_key" ON "meetings"("roomName");
CREATE UNIQUE INDEX "meetings_candidateAssessmentId_key" ON "meetings"("candidateAssessmentId");
CREATE INDEX "meetings_companyId_status_idx" ON "meetings"("companyId", "status");
CREATE INDEX "meetings_scheduledAt_idx" ON "meetings"("scheduledAt");

ALTER TABLE "meetings"
  ADD CONSTRAINT "meetings_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "meeting_participants" (
  "id"            TEXT NOT NULL,
  "meetingId"     TEXT NOT NULL,
  "staffId"       TEXT,
  "externalName"  TEXT,
  "externalEmail" TEXT,
  "role"          TEXT NOT NULL DEFAULT 'ATTENDEE',
  "joinedAt"      TIMESTAMP(3),
  "leftAt"        TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meeting_participants_meetingId_idx" ON "meeting_participants"("meetingId");

ALTER TABLE "meeting_participants"
  ADD CONSTRAINT "meeting_participants_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
