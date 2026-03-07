-- ============================================================
-- SEED: Initial model recommendations before real data exists
-- ============================================================

INSERT INTO model_recommendations
  (task_type, language, framework, recommended_model, provider,
   acceptance_rate, sample_count, confidence, runner_up_model)
VALUES
  ('debug',    'typescript', 'any',    'qwen/qwen2.5-coder-32b-instruct', 'nvidia',  0.78, 0, 'low', 'deepseek-ai/deepseek-coder-v2'),
  ('debug',    'python',     'any',    'deepseek-ai/deepseek-r1',          'nvidia',  0.75, 0, 'low', 'qwen/qwen2.5-coder-32b-instruct'),
  ('refactor', 'typescript', 'react',  'gemini-2.5-pro',                  'google',  0.80, 0, 'low', 'qwen/qwen2.5-coder-32b-instruct'),
  ('refactor', 'typescript', 'any',    'qwen/qwen2.5-coder-32b-instruct', 'nvidia',  0.77, 0, 'low', 'gemini-2.5-pro'),
  ('create',   'typescript', 'any',    'llama-3.3-70b-versatile',         'groq',    0.72, 0, 'low', 'qwen/qwen2.5-coder-32b-instruct'),
  ('explain',  'any',        'any',    'gemini-2.5-pro',                  'google',  0.85, 0, 'low', 'llama-3.3-70b-versatile'),
  ('test',     'typescript', 'any',    'deepseek-ai/deepseek-coder-v2',   'nvidia',  0.74, 0, 'low', 'qwen/qwen2.5-coder-32b-instruct'),
  ('review',   'any',        'any',    'qwen/qwen3-235b-a22b',            'nvidia',  0.76, 0, 'low', 'gemini-2.5-pro')
ON CONFLICT (task_type, language, framework) DO NOTHING;
