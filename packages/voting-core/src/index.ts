export type * from './types'
export { tallyPlurality } from './plurality'
export type { PluralityResult } from './plurality'
export { tallyInstantRunoff } from './instantRunoff'
export type { RunoffResult, RunoffRound, TieBreakRule } from './instantRunoff'
export {
  ELECTION_CODE_PATTERN,
  MAX_CATEGORIES,
  MIN_CATEGORIES,
  getElectionStatus,
  isValidElectionCode,
  normalizeElectionCode,
  snapshotAnswers,
  validateAnswerChoice,
  validateNewElection,
} from './election'
export type { NewElectionInput } from './election'
export { tallyElection } from './results'
export type { CategoryResult } from './results'
