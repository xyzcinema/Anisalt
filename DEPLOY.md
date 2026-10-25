# Deploying AniSalt

## Vercel
1. Push this folder to a GitHub repo (or run `npx vercel` inside it).
2. Import it on vercel.com. Framework preset: "Other". No settings needed —
   the build auto-detects Vercel and outputs serverless functions.

## Render
1. Push to GitHub, then New > Blueprint (uses render.yaml), or New > Web Service with:
   - Build: `npm install && npm run build:render`
   - Start: `npm start`

## Local
npm install && npm run dev
