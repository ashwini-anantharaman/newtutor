-- Persist studio generation job state (required for serverless — in-memory jobs do not survive requests).
alter table courses
  add column if not exists studio_generation jsonb;
