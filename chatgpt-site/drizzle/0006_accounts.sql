CREATE TABLE accounts (
 id TEXT PRIMARY KEY NOT NULL,
 value TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE account_runs (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 scheduled_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'blocked',
 output_material_id TEXT,
 error TEXT,
 UNIQUE(account_id, scheduled_at)
);
INSERT INTO accounts VALUES ('hedgy','{"id":"hedgy","name":"hedgy","platform":"instagram","topic":"Simple quantitative finance and market explainers","postsPerDay":1,"postingTime":"18:00","timezone":"Europe/Zurich","enabled":true,"brand":{"style":"black and white pixelart with heatmap accents","mascot":"naturally coloured brown pixelart hedgehog"}}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
