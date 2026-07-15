-- Waiting-room / lobby: when true, guests wait for a host to admit them before
-- they can publish/subscribe (additive, defaults false — existing rooms behave
-- exactly as before).
ALTER TABLE "meetings" ADD COLUMN "lobbyEnabled" BOOLEAN NOT NULL DEFAULT false;
