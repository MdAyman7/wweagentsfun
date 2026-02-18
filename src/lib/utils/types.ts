/** Unique entity identifier. */
export type EntityId = number;

/** Simulation frame number (monotonically increasing). */
export type Frame = number;

/** PRNG seed value. */
export type Seed = number;

/** Component type identifier string. */
export type ComponentType = string;

/** System execution phase. */
export type Phase = 'input' | 'ai' | 'sim' | 'psychology' | 'cinematic' | 'presentation';

/** 3D vector tuple. */
export type Vec3 = [number, number, number];

/** Quaternion tuple [x, y, z, w]. */
export type Quat = [number, number, number, number];

/** Match outcome method. */
export type WinMethod = 'pinfall' | 'submission' | 'knockout' | 'dq' | 'countout' | 'escape' | 'elimination';

/** Combat state phases. */
export type CombatPhase = 'idle' | 'windup' | 'active' | 'recovery' | 'stun' | 'grounded' | 'grappled';

/** Body region for targeted damage. */
export type BodyRegion = 'head' | 'body' | 'legs';

/** Wrestler alignment. */
export type Alignment = 'face' | 'heel' | 'tweener';

/** Move category. */
export type MoveCategory = 'strike' | 'grapple' | 'aerial' | 'submission' | 'signature' | 'finisher';
