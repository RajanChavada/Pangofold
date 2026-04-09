# Pangofold

Turn your messy Google Doc trip plan into a beautiful, browsable trip guide.

## Architecture

Turborepo monorepo with shared packages:

| Package | Description | Status |
|---------|-------------|--------|
| `apps/web` | Vite + React 19 + Tailwind v4 + React Router v7 | Active |
| `apps/mobile` | Expo SDK 52 + Expo Router (placeholder) | Scaffold only |
| `packages/shared` | TypeScript types, Supabase client, utilities | Active |
| `packages/ui` | Cross-platform components (future NativeWind) | Empty |
| `supabase/` | Edge functions + DB migrations | Active |

## Getting Started

```bash
# Install dependencies
pnpm install

# Run the web app
pnpm dev:web

# Run all apps
pnpm dev
```

## Environment Variables

Copy `.env.example` to `.env.local` in `apps/web/`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Edge function secrets (set via Supabase CLI or dashboard):
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
