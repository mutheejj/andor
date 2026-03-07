-- ============================================================
-- FUNCTION: Update model_performance when feedback inserted
-- ============================================================
CREATE OR REPLACE FUNCTION update_model_performance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO model_performance (
    model_id, provider, task_type, language, framework,
    total_uses, accepted_count, rejected_count, avg_response_ms
  )
  VALUES (
    NEW.model_id,
    NEW.provider,
    NEW.task_type,
    COALESCE(NEW.language, 'any'),
    COALESCE(NEW.framework, 'any'),
    1,
    CASE WHEN NEW.accepted THEN 1 ELSE 0 END,
    CASE WHEN NOT NEW.accepted THEN 1 ELSE 0 END,
    COALESCE(NEW.time_to_response_ms, 0)
  )
  ON CONFLICT (model_id, task_type, language, framework)
  DO UPDATE SET
    total_uses     = model_performance.total_uses + 1,
    accepted_count = model_performance.accepted_count +
                     CASE WHEN NEW.accepted THEN 1 ELSE 0 END,
    rejected_count = model_performance.rejected_count +
                     CASE WHEN NOT NEW.accepted THEN 1 ELSE 0 END,
    avg_response_ms = (model_performance.avg_response_ms +
                      COALESCE(NEW.time_to_response_ms, 0)) / 2,
    last_updated   = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_model_performance
  AFTER INSERT ON response_feedback
  FOR EACH ROW EXECUTE FUNCTION update_model_performance();

-- ============================================================
-- FUNCTION: Refresh model recommendations
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_model_recommendations()
RETURNS void AS $$
BEGIN
  DELETE FROM model_recommendations;

  INSERT INTO model_recommendations (
    task_type, language, framework,
    recommended_model, provider,
    acceptance_rate, sample_count, confidence,
    runner_up_model
  )
  SELECT DISTINCT ON (task_type, language, framework)
    task_type,
    language,
    framework,
    model_id as recommended_model,
    provider,
    acceptance_rate,
    total_uses as sample_count,
    CASE
      WHEN total_uses >= 100 THEN 'high'
      WHEN total_uses >= 20  THEN 'medium'
      ELSE 'low'
    END as confidence,
    LEAD(model_id) OVER (
      PARTITION BY task_type, language, framework
      ORDER BY acceptance_rate DESC
    ) as runner_up_model
  FROM model_performance
  WHERE total_uses >= 5
  ORDER BY task_type, language, framework, acceptance_rate DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Increment error solution vote
-- ============================================================
CREATE OR REPLACE FUNCTION increment_error_vote(
  p_error_pattern TEXT,
  p_language TEXT,
  p_solution_accepted BOOLEAN
)
RETURNS void AS $$
BEGIN
  UPDATE error_solutions
  SET
    vote_count    = vote_count + 1,
    success_count = success_count + CASE WHEN p_solution_accepted THEN 1 ELSE 0 END,
    updated_at    = NOW()
  WHERE error_pattern = p_error_pattern
    AND language = p_language;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get best model for a task (main query Andor uses)
-- ============================================================
CREATE OR REPLACE FUNCTION get_best_model(
  p_task_type TEXT,
  p_language  TEXT DEFAULT 'any',
  p_framework TEXT DEFAULT 'any'
)
RETURNS TABLE (
  model_id        TEXT,
  provider        TEXT,
  acceptance_rate FLOAT,
  sample_count    INT,
  confidence      TEXT,
  runner_up       TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    recommended_model,
    mr.provider,
    mr.acceptance_rate,
    mr.sample_count,
    mr.confidence,
    runner_up_model
  FROM model_recommendations mr
  WHERE mr.task_type = p_task_type
    AND mr.language  = p_language
    AND mr.framework = p_framework
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      recommended_model,
      mr.provider,
      mr.acceptance_rate,
      mr.sample_count,
      mr.confidence,
      runner_up_model
    FROM model_recommendations mr
    WHERE mr.task_type = p_task_type
      AND mr.language  = p_language
      AND mr.framework = 'any'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      recommended_model,
      mr.provider,
      mr.acceptance_rate,
      mr.sample_count,
      mr.confidence,
      runner_up_model
    FROM model_recommendations mr
    WHERE mr.task_type = p_task_type
      AND mr.language  = 'any'
      AND mr.framework = 'any'
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql;
