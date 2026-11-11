# Account automation worker contract

`tickAccounts(container, env)` creates one durable queue row for the next upcoming account posting slot, within 24 hours. `(account_id, scheduled_at)` is unique, so repeated ticks are safe. Disabled accounts are skipped. Scheduling uses each account's IANA timezone and configured `postingTime`.

`claimAccountJob(container)` atomically leases one due pending job () and returns `{job:{id,lease,account:{id,name,topic,platform},scheduledAt}|null}`. A lease is exclusive and must accompany every subsequent operation. `heartbeatAccountJob(container,id,lease)` renews it. Expired paid work is marked for attention; generation is not automatically repeated after an uncertain operation.

The worker uploads the completed MP4 through the media route, then calls `completeAccountJob(container,id,lease,{materialId,spec,provenance})`. Completion binds that material to the durable account job; the account worker tick publishes it at the scheduled time through the scoped adapter. It never represents the post as published. `failAccountJob(container,id,lease,{code,message})` records a failure for inspection. Ambiguous publishing is marked for attention to prevent duplicate posts.

The durable queue is `account_automation_jobs`; `account_runs` remains the existing account-slot record. Health integrations should persist worker heartbeat under settings key `account_worker`.
