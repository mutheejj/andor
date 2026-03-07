-- ============================================================
-- ANDOR LEARNING SYSTEM — SUPABASE SCHEMA
-- Run this in Supabase SQL Editor to set up the database
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- TABLE 1: response_feedback
CREATE TABLE IF NOT EXISTS response_feedback (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          TEXT NOT NULL,
  model_id            TEXT NOT NULL,
  provider            TEXT NOT NULL,
  task_type           TEXT NOT NULL,
  language            TEXT,
  framework           TEXT,
  accepted            BOOLEAN NOT NULL,
  files_modified      INT DEFAULT 0,
  response_tokens     INT,
  time_to_response_ms INT,
  had_errors_before   BOOLEAN DEFAULT false,
  errors_resolved     BOOLEAN,
  andor_version       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 2: error_solutions
CREATE TABLE IF NOT EXISTS error_solutions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  error_pattern       TEXT NOT NULL,
  error_code          TEXT,
  error_source        TEXT,
  language            TEXT NOT NULL,
  framework           TEXT,
  fix_strategy        TEXT,
  model_used          TEXT NOT NULL,
  solution_accepted   BOOLEAN NOT NULL,
  attempts_needed     INT DEFAULT 1,
  vote_count          INT DEFAULT 1,
  success_count       INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 3: model_performance
CREATE TABLE IF NOT EXISTS model_performance (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id            TEXT NOT NULL,
  provider            TEXT NOT NULL,
  task_type           TEXT NOT NULL,
  language            TEXT NOT NULL DEFAULT 'any',
  framework           TEXT NOT NULL DEFAULT 'any',
  total_uses          INT DEFAULT 0,
  accepted_count      INT DEFAULT 0,
  rejected_count      INT DEFAULT 0,
  acceptance_rate     FLOAT GENERATED ALWAYS AS (
                        CASE WHEN total_uses > 0
                        THEN accepted_count::float / total_uses
                        ELSE 0 END
                      ) STORED,
  avg_response_ms     INT DEFAULT 0,
  avg_tokens          INT DEFAULT 0,
  last_updated        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, task_type, language, framework)
);

-- TABLE 4: usage_patterns
CREATE TABLE IF NOT EXISTS usage_patterns (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id          TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  task_type           TEXT,
  language            TEXT,
  framework           TEXT,
  model_used          TEXT,
  provider            TEXT,
  files_count         INT DEFAULT 0,
  commands_count      INT DEFAULT 0,
  duration_ms         INT,
  success             BOOLEAN,
  andor_version       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 5: framework_patterns
CREATE TABLE IF NOT EXISTS framework_patterns (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework           TEXT NOT NULL,
  language            TEXT NOT NULL,
  pattern_type        TEXT NOT NULL,
  pattern_description TEXT NOT NULL,
  confidence_score    FLOAT DEFAULT 0.5,
  vote_count          INT DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 6: model_recommendations
CREATE TABLE IF NOT EXISTS model_recommendations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_type           TEXT NOT NULL,
  language            TEXT NOT NULL DEFAULT 'any',
  framework           TEXT NOT NULL DEFAULT 'any',
  recommended_model   TEXT NOT NULL,
  provider            TEXT NOT NULL,
  acceptance_rate     FLOAT NOT NULL,
  sample_count        INT NOT NULL,
  confidence          TEXT NOT NULL,
  runner_up_model     TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_type, language, framework)
);

-- TABLE 7: andor_versions
CREATE TABLE IF NOT EXISTS andor_versions (
  version             TEXT PRIMARY KEY,
  first_seen          TIMESTAMPTZ DEFAULT NOW(),
  last_seen           TIMESTAMPTZ DEFAULT NOW(),
  active_sessions     INT DEFAULT 1
);
