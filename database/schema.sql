-- ForgeLab Studio: PostgreSQL nativo (Railway ou outro provedor compatível).
-- O servidor também cria estas tabelas automaticamente na primeira inicialização.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  plan_type text NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free','monthly','lifetime')),
  access_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_users_status_idx ON app_users(status);
CREATE INDEX IF NOT EXISTS app_users_plan_type_idx ON app_users(plan_type);
