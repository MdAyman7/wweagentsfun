# WWEAgents.FUN — Architecture Rules

## Project Overview
AI-driven WWE-style wrestling simulation. SvelteKit + THREE.js + Rapier physics.
ECS (Entity-Component-System) architecture with deterministic fixed-timestep game loop.

## Tech Stack
- **Framework:** SvelteKit (Svelte 5 with runes)
- **3D Rendering:** THREE.js
- **Physics:** @dimforge/rapier3d-compat
- **Language:** TypeScript (strict mode)

## Architecture Rules — NEVER VIOLATE

### ECS Discipline
- **Components are pure data.** No methods, no logic. One interface per file.
- **Systems are pure logic.** Read components via Query, write via CommandBuffer, emit via EventBus.
- **Systems never import other systems.** Communication is through components and events only.
- **Systems never call each other.** The SystemScheduler controls execution order.
- **The World is the single source of truth.** No game state lives outside of ECS components or resources.

### Module Boundaries (Hard Walls)
- `rendering/` → NEVER imports from `ai/`, `combat/`, or `systems/`
- `ai/` → NEVER imports from `rendering/` or `physics/`
- `systems/` → NEVER imports from `state/` (Svelte stores)
- `state/` → NEVER writes to ECS. One-way sync via `syncEngine.ts` only
- `physics/` → NEVER imports from `rendering/`
- `replay/` → NEVER imports from `rendering/` (must work headless)

### Determinism
- ALL randomness goes through `SeededRandom` (from `utils/random.ts`). NEVER use `Math.random()`.
- NEVER use `Date.now()` or `performance.now()` in simulation code. Use `Clock.frame`.
- Fixed timestep (60Hz). Variable rendering is separate from simulation.
- Same seed + same inputs = identical outcome. Always.

### Event Bus
- Events are QUEUED, not dispatched immediately.
- Events flush between phases (controlled by GameLoop).
- Events emitted during handler execution queue for the NEXT flush.
- All event types must be defined in `events/index.ts` EventMap.

### State Management
- ECS World is authoritative. Svelte stores are read-only projections.
- `syncEngine.ts` runs once per tick after all systems, projects ECS → stores.
- UI writes to `settingsStore` only. Systems may read settings as config.

### File Conventions
- Component files: `src/lib/components/{category}/{Name}.ts` — export interface + factory fn
- System files: `src/lib/systems/{phase}/{Name}System.ts` — export class extending System
- Strategy files: `src/lib/ai/strategies/{Name}Strategy.ts` — implement Strategy interface
- Event files: `src/lib/events/{Category}Events.ts` — export interfaces only

### Game Loop Phases (in order)
1. **input** — External commands (debug, training API)
2. **ai** — Observation → Decision pipeline
3. **sim** — Physics, combat, grapple, damage, pin/submission, stamina, momentum, match rules
4. **psychology** — Crowd, drama, fatigue
5. **cinematic** — Camera, replay triggers, slow-motion
6. **presentation** — Animation, audio, VFX, render sync (SKIPPED in headless mode)

### Commands
- `npm run dev` — Start dev server
- `npm run build` — Build for production
- `npm run check` — TypeScript + Svelte check

### Key Patterns
- **CommandBuffer:** Systems defer entity creation/destruction. Buffer flushes between phases.
- **PhysicsAdapter:** Interface pattern. Swap Rapier ↔ Cannon by changing one import.
- **Strategy:** Pluggable AI. AgentBrain.strategyId points to a registered strategy.
- **FrameRecorder:** Ring buffer of world snapshots for replay/training.
- **Headless mode:** Set `headless: true` to skip presentation phase. Use `runHeadless(ticks)`.
