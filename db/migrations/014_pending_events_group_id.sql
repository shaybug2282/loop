-- 014: group tag on events.
-- Events booked from a group's Scheduling Assistant chat are stamped with the
-- group, and the creator can add/remove the tag manually from the event popup.
-- ON DELETE SET NULL: deleting a group simply untags its events.

ALTER TABLE pending_events
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
