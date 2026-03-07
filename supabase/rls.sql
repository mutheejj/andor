-- ============================================================
-- ROW LEVEL SECURITY — ANDOR LEARNING SYSTEM
-- Anonymous users can INSERT but never SELECT individual rows
-- Only aggregate queries are allowed publicly
-- ============================================================

ALTER TABLE response_feedback    ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_solutions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_performance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_patterns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE framework_patterns   ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_recommendations ENABLE ROW LEVEL SECURITY;

-- Anyone can insert feedback (anonymous)
CREATE POLICY "anon_insert_feedback" ON response_feedback
  FOR INSERT TO anon WITH CHECK (true);

-- Anyone can insert usage events
CREATE POLICY "anon_insert_usage" ON usage_patterns
  FOR INSERT TO anon WITH CHECK (true);

-- Anyone can insert error solutions
CREATE POLICY "anon_insert_errors" ON error_solutions
  FOR INSERT TO anon WITH CHECK (true);

-- Anyone can READ model_performance (aggregate, safe to expose)
CREATE POLICY "public_read_model_performance" ON model_performance
  FOR SELECT TO anon USING (true);

-- Anyone can READ recommendations (this is what Andor queries)
CREATE POLICY "public_read_recommendations" ON model_recommendations
  FOR SELECT TO anon USING (true);

-- No one can read individual rows of sensitive tables
CREATE POLICY "no_public_read_feedback" ON response_feedback
  FOR SELECT TO anon USING (false);

CREATE POLICY "no_public_read_usage" ON usage_patterns
  FOR SELECT TO anon USING (false);
