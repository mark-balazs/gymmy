---
id: hosting
status: current
decided: "Confluence 934379542; 5299745"
supersedes:
superseded_by:
appears:
  repo: ["README.md#deploying-to-vercel", "README.md#stack", "docs/data.md#migrations", "docs/data.md#dropping-a-table-takes-two-deploys", "docs/architecture.md#the-pieces-that-run", "apps/web/package.json"]
  copy: []
  tests: []
  confluence: ["934445098", "934445078", "934379542", "934379562", "934445158", "934608954", "934445138"]
---

Production runs on Vercel from main, with a preview per pull request, on Neon Postgres; each deploy runs migrations first over the unpooled URL, and a failed migration fails the deploy. Previews share the production database unless pointed elsewhere, and there is deliberately no queue, cache, cron, worker or separate API service.
