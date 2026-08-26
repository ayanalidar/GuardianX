# Task: innovations — Predictive Forecast + Quantum Scanner + 3D Threat Constellation

**Agent:** full-stack-developer
**Scope:** GuardianX web app at `/home/z/GuardianX-web`.

## What I'm building

3 new self-contained Command-Center tab components + 3 backing API routes:

1. **Predictive Threat Forecast**
   - `src/components/sentinel/predictive-forecast.tsx` (client)
   - `src/app/api/predictive-forecast/route.ts` (LLM-backed, 60s cache)

2. **Quantum-Readiness Scanner**
   - `src/components/sentinel/quantum-scanner.tsx` (client)
   - `src/app/api/quantum-scan/route.ts` (regex scan over codebase.sourceCode)

3. **3D Threat Constellation**
   - `src/components/sentinel/threat-constellation.tsx` (client, @react-three/fiber)
   - `src/app/api/threat-constellation/route.ts` (Prisma aggregations)

## Key conventions followed (from reading existing code)

- Auth: `requireAuth(req)` from `@/lib/auth` — returns `{ok:true,user}` or `{ok:false,response}`.
- DB: `import { db } from "@/lib/db"`; lowercase accessors: `db.scan`, `db.finding`, `db.codebase`, `db.client`, `db.patch`.
- LLM: pattern from `src/lib/sentinel/engine/ai.ts`:
  - `import ZAI from "z-ai-web-dev-sdk"`
  - `const z = await ZAI.create()`
  - `await z.chat.completions.create({ messages, thinking: { type: "disabled" } })`
  - Strip ```json fences via the same `extractJson` heuristic.
- Client API helper: `localStorage.getItem("guardianx-token")` + `Authorization: Bearer` header, `credentials: "same-origin"` (see `src/lib/sentinel/api.ts:756`).
- Design tokens: `holo-card-sharp`, `hud-corners`, `neon-emerald`, `pulse-dot`, `bg-zinc-950`, emerald/cyan/amber accents only — NO indigo/blue.
- `@react-three/fiber@9` + `@react-three/drei@10` + `three@0.185` installed.

## DO NOT TOUCH

- `src/app/page.tsx`, `src/components/sentinel/command-center.tsx`, war-room files, `src/lib/db.ts`, `src/components/sentinel/landing/features-data.ts`, `src/components/sentinel/modules-overview.tsx`, `src/components/sentinel/command-center-voice.tsx`.

## Files created

- `src/app/api/predictive-forecast/route.ts` — LLM-backed forecast, 60s cache, heuristic fallback
- `src/app/api/quantum-scan/route.ts` — regex scan over codebase.sourceCode for RSA/ECC/AES-128/SHA-1/SHA-256/MD5/DH/ECDH
- `src/app/api/threat-constellation/route.ts` — Prisma aggregation (clients/codebases/findings/patches) + node/edge builder
- `src/components/sentinel/predictive-forecast.tsx` — Recharts radar chart, animated count-up, top-3 prose, 60s auto-refresh
- `src/components/sentinel/quantum-scanner.tsx` — codebase selector + scan button + score gauge + 4 category cards + findings list, matrix rain backdrop while scanning
- `src/components/sentinel/threat-constellation.tsx` — R3F Canvas + drei OrbitControls/Stars/Line, spring-force simulation in useFrame, hover + click + camera-zoom

## Lint / tsc result

- `bun run lint`: **0 errors** in our files (5 unrelated pre-existing warnings in `contributors-panel.tsx` + `service-launcher.tsx`).
- `bunx tsc --noEmit | grep predictive-forecast|quantum-scan|threat-constellation`: **0 errors** in our files. (Project-wide 175 errors all in pre-existing files I didn't touch — `src/lib/siem/retention.ts`, `src/app/api/2fa/*`, etc.)

## Key decisions

1. **Predictive Forecast fallback**: If the LLM returns malformed JSON (or the SDK throws), the route derives scores from finding-category regex matching (web/api/auth/crypto/infra/supply_chain) weighted by severity. Confidence is `min(85, 40 + findings.length * 2)`. So the component always shows something useful even if the LLM is having a bad day.
2. **Quantum Scan**: pure regex, no LLM. Severity weights match the spec exactly (Critical -15, High -8, Medium -3). One finding per line max to avoid double-counting (an AES-128 line that also says MD5 → 1 finding, not 2).
3. **Threat Constellation**: Spring simulation is O(N²) repulsion + O(E) spring attraction, with damping + max-radius clamp. Runs in a single Scene-level `useFrame` callback. Positions stored in `positionsRef.current: Vector3[]` (refs, not state — avoids re-renders). Node meshes lerp toward their target position each frame for smoothness. Edge Line2 geometries are updated via `geometry.setPositions([x1,y1,z1, x2,y2,z2])` each frame.
4. **Camera-zoom-on-click**: We lerp `camera.position` and `OrbitControls.target` toward the clicked node + an offset along the node's normalized direction. Auto-rotate pauses when hovering or selecting (tracked via `autoRotateRef`, toggled in `CameraAutoRotate`'s `useFrame`).
5. **Three.js installed**: `three@0.185`, `@react-three/fiber@9.7`, `@react-three/drei@10.7`, `@types/three@0.185` — all installed via `bun add`.
6. **Auth**: every route uses `requireAuth(req)` from `@/lib/auth`; clients pass `Authorization: Bearer <jwt>` (read from `localStorage.getItem("guardianx-token")`).
7. **No indigo/blue**: All accents are emerald (#10b981), cyan (#06b6d4), amber (#f59e0b), rose (#f43f5e). Verified across all 6 files.
