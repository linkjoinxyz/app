# LinkJoin Service Level Agreement

**Version:** 1.0  
**Effective:** July 11, 2026

---

## 1. Uptime Commitment

Provider commits to **99.5% monthly uptime** for the LinkJoin web application and API, measured per calendar month.

Excluded from downtime calculation:
- Scheduled maintenance (see §4)
- Third-party outages (Zoom, Google Meet, MongoDB Atlas, Azure, Twilio)
- Force majeure events
- Customer-caused outages

---

## 2. Recovery Objectives

| Objective | Target |
|-----------|--------|
| Recovery Time Objective (RTO) | 2 hours for P0/P1 incidents |
| Recovery Point Objective (RPO) | 24 hours (automated daily backups) |

---

## 3. Incident Response

| Severity | Definition | Acknowledge | Update Cadence |
|----------|-----------|-------------|----------------|
| P0 — Critical | Service down | 15 minutes | Every 30 min |
| P1 — High | Major feature unavailable | 1 hour | Every 2 hours |
| P2 — Medium | Degraded performance | 4 hours | Daily |
| P3 — Low | Minor issue | 1 business day | As resolved |

Status: [linkjoin.xyz/status](https://linkjoin.xyz/status)

---

## 4. Maintenance Windows

Scheduled maintenance: **Sundays 02:00–04:00 UTC**  
Notice required: 48 hours in advance for outages > 5 minutes

---

## 5. Service Credits

| Actual Monthly Uptime | Credit |
|-----------------------|--------|
| 99.0% – 99.49% | 10% of monthly fee |
| 95.0% – 98.99% | 25% of monthly fee |
| Below 95.0% | 50% of monthly fee |

Credits must be requested within 30 days of the affected month. Email: support@linkjoin.xyz

---

## 6. Support

- **Email:** support@linkjoin.xyz  
- **Hours:** Monday–Friday, 9:00 AM–6:00 PM PT

---

## 7. Modifications

30 days' written notice for any SLA changes.
