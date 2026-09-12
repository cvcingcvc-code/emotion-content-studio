CREATE TABLE strategy_memory (
  id uuid PRIMARY KEY,
  account text NOT NULL CHECK (account IN ('growth','english','emotion')),
  strategy_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','inactive','superseded')),
  payload jsonb NOT NULL,
  CHECK (payload->>'id' = id::text AND payload->>'account' = account
    AND payload->>'key' = strategy_key AND payload->>'status' = status)
);
CREATE INDEX strategy_memory_lookup_idx ON strategy_memory(account, strategy_key, status);
CREATE UNIQUE INDEX strategy_memory_active_key_idx ON strategy_memory(account, strategy_key) WHERE status = 'active';
