#!/bin/bash

# Which upstream addresses may set X-Forwarded-For. Gunicorn's default of
# 127.0.0.1 means request.client.host is Azure's front end for every request, so
# the rate limiter (keyed on get_remote_address) buckets all users into a single
# counter and audit logs record the proxy instead of the caller.
#
# "*" is correct on Azure App Service specifically: the container port is only
# reachable through the platform's front end, so there is no path by which an
# outside caller can present their own X-Forwarded-For. Revisit this if the app is
# ever exposed directly, put behind a second proxy, or moved off App Service --
# trusting the header from an addressable origin lets a caller spoof their source
# IP and sidestep rate limiting entirely.
#
# Note this only works together with NormalizeClientIPMiddleware in app/main.py:
# Azure appends the source port to the client entry ("203.0.113.5:54321") and
# uvicorn forwards that verbatim, which would otherwise give every request its own
# rate-limit bucket.
exec gunicorn app.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind "0.0.0.0:${PORT:-8000}" \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}" \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
