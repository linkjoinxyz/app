# Deployment Checklist

## Azure App Service (Backend)

Set these in **App Service > Configuration > Application settings**:

| Variable | Value |
|---|---|
| `FRONTEND_URL` | `https://your-vercel-domain.com` (or custom domain) |
| `REDIS_URL` | `rediss://your-cache.redis.cache.windows.net:6380,password=...,ssl=True` |
| `ENVIRONMENT` | `production` |

Set the **startup command** in App Service > Configuration > General settings:
```
bash startup.sh
```

Enable **WebSockets** in App Service > Configuration > General settings (toggle is off by default).

Provision **Azure Cache for Redis** if not already done. Use the connection string from its Access keys blade as `REDIS_URL`.

---

## Vercel (Frontend)

Set these in **Vercel project > Settings > Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-azure-backend.azurewebsites.net` |

The `vercel.json` rewrite rule for client-side routing is already committed — no further action needed there.

---

## After Both Are Live

- Verify CORS: the frontend origin must match `FRONTEND_URL` in Azure exactly (no trailing slash).
- Test WebSocket connection from the deployed frontend (`/ws/database` endpoint).
- Test a login, link open, and SMS reminder (if applicable) end-to-end.
