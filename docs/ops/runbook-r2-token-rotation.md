# R2 Token Rotation Runbook

## When to rotate

- **Annual**: yearly rotation, last weekday of December
- **On suspected leak**: any time the token may have been exposed (logs, screenshots, public commits)
- **On employee offboarding**: if the offboarded engineer had dashboard access

## Procedure (zero-downtime)

1. Create a new R2 API token in the Cloudflare Dashboard:
   - Dashboard → R2 → Manage R2 API Tokens → Create API token
   - Token name: `getu-pdfs-rw-YYYYMMDD` (date-suffixed for traceability)
   - Permission: Object Read & Write
   - Specify bucket: `getu-pdfs`
   - TTL: 1 year
2. Copy the new Access Key ID + Secret Access Key (shown once).
3. Update wrangler secrets:
   ```bash
   cd apps/api
   pnpm exec wrangler secret put R2_ACCESS_KEY_ID
   # paste new Access Key ID
   pnpm exec wrangler secret put R2_SECRET_ACCESS_KEY
   # paste new Secret Access Key
   ```
4. Wrangler secrets propagate ~1 minute. New requests will use the new keys.
5. Wait 5 minutes, then verify by uploading a test PDF via the web UI and observing successful R2 PUT.
6. Revoke the old token: Dashboard → R2 → Manage R2 API Tokens → find old token → Revoke. Wait 24h before deleting in case rollback needed.

## Validation steps

After rotation, run the smoke test:

```bash
cd apps/api && pnpm smoke:prod
```

Expected: all checks pass, including `documentDownloadUrl` (which exercises presigned GET signing).

## Rollback

If the rotation breaks signing:
1. Re-fetch the old token's keys (if not yet revoked).
2. `wrangler secret put` them back.
3. Investigate why the new token failed (permission scope mismatch? typo?).
