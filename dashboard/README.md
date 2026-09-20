# Market Plus Command Center

This is a deliberately scoped Next.js + Tailwind dashboard for the command-center workstream. It uses a small Shadcn-style surface (bordered panels, compact typography, and utility classes) without adding a component framework or icon dependency.

Run it alongside the Express API:

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run dev
```

The API contract is served by `/api/command-center/status`, `/telemetry`, `/autonomous-control`, and `/live-log`.
