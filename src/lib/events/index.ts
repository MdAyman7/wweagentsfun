import type * as CE from './CombatEvents';
import type * as ME from './MatchEvents';
import type * as AE from './AIEvents';
import type * as PE from './PhysicsEvents';
import type * as CinE from './CinematicEvents';
import type * as PsyE from './PsychologyEvents';
import type * as TE from './TournamentEvents';
import type * as SE from './SystemEvents';

/** Exhaustive typed event map for the EventBus. */
export interface EventMap {
	// Combat
	'combat:move_started': CE.MoveStarted;
	'combat:move_hit': CE.MoveHit;
	'combat:move_missed': CE.MoveMissed;
	'combat:move_blocked': CE.MoveBlocked;
	'combat:reversal': CE.Reversal;
	'combat:counter': CE.Counter;
	'combat:finisher_ready': CE.FinisherReady;
	'combat:finisher_hit': CE.FinisherHit;
	'combat:submission_lock': CE.SubmissionLock;
	'combat:rope_break': CE.RopeBreak;

	// Match
	'match:bell_ring': ME.BellRing;
	'match:pin_attempt': ME.PinAttempt;
	'match:pin_count': ME.PinCount;
	'match:nearfall': ME.NearFall;
	'match:elimination': ME.Elimination;
	'match:tag': ME.Tag;
	'match:dq': ME.DQ;
	'match:ended': ME.MatchEnded;

	// AI
	'ai:decision': AE.Decision;
	'ai:strategy_switch': AE.StrategySwitch;

	// Physics
	'physics:collision': PE.Collision;
	'physics:ring_exit': PE.RingExit;
	'physics:grounded': PE.Grounded;

	// Cinematic
	'cinematic:camera_cut': CinE.CameraCut;
	'cinematic:slow_motion': CinE.SlowMotion;
	'cinematic:replay_start': CinE.ReplayStart;
	'cinematic:replay_end': CinE.ReplayEnd;

	// Psychology
	'psych:crowd_pop': PsyE.CrowdPop;
	'psych:heat_change': PsyE.HeatChange;
	'psych:comeback': PsyE.Comeback;
	'psych:drama_peak': PsyE.DramaPeak;

	// Tournament
	'tournament:match_complete': TE.MatchComplete;
	'tournament:round_complete': TE.RoundComplete;
	'tournament:champion': TE.Champion;

	// System
	'system:tick': SE.Tick;
	'system:phase_change': SE.PhaseChange;
	'system:pause': SE.Pause;
	'system:resume': SE.Resume;
	'system:error': SE.SystemError;
}

export type { CE, ME, AE, PE, CinE, PsyE, TE, SE };
