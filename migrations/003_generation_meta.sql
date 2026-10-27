-- 003_generation_meta: AI enrichment for finished generations.
-- virality_score: 1-100 LLM estimate of the prompt's short-form potential (real GPT output).
-- meta: { description, hashtags[] } produced by the same call. Null when enrichment unavailable.
alter table generations add column if not exists virality_score integer;
alter table generations add column if not exists meta jsonb;
