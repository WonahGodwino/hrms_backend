// Assessment Plans — 9 endpoints
// 1. GET  /api/recruitment/assessment-plans         — list all plans (paginated)
// 2. POST /api/recruitment/assessment-plans         — create draft plan
// 3. GET  /api/recruitment/assessment-plans/stats   — KPI metrics
// 4. GET  /api/recruitment/assessment-plans/:id     — plan detail with rounds
// 5. POST /api/recruitment/assessment-plans/:id/rounds — add round
// 6. PATCH  /api/recruitment/assessment-plans/:id/rounds/:roundId — update round
// 7. DELETE /api/recruitment/assessment-plans/:id/rounds/:roundId — delete round
// 8. POST /api/recruitment/assessment-plans/:id/publish  — DRAFT → ACTIVE
// 9. POST /api/recruitment/assessment-plans/:id/archive  — ACTIVE/DRAFT → ARCHIVED
