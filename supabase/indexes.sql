-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX idx_feedback_model_task
  ON response_feedback(model_id, task_type);

CREATE INDEX idx_feedback_language_framework
  ON response_feedback(language, framework);

CREATE INDEX idx_feedback_created
  ON response_feedback(created_at DESC);

CREATE INDEX idx_model_perf_task_lang
  ON model_performance(task_type, language, framework);

CREATE INDEX idx_model_perf_acceptance
  ON model_performance(acceptance_rate DESC);

CREATE INDEX idx_error_pattern_trgm
  ON error_solutions USING gin(error_pattern gin_trgm_ops);

CREATE INDEX idx_error_lang_framework
  ON error_solutions(language, framework);

CREATE INDEX idx_usage_created
  ON usage_patterns(created_at DESC);

CREATE INDEX idx_usage_session
  ON usage_patterns(session_id);

CREATE INDEX idx_recommendations_task
  ON model_recommendations(task_type, language, framework);
