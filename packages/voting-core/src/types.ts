export type VotingMethod = 'plurality' | 'ranked'

export type ElectionStatus = 'draft' | 'open' | 'closed' | 'published'

export type Election = {
  id: string
  name: string
  status: ElectionStatus
  opensAt?: string
  closesAt?: string
}

export type Category = {
  id: string
  electionId: string
  name: string
  votingMethod: VotingMethod
  order: number
}

export type Nominee = {
  id: string
  categoryId: string
  name: string
  description?: string
  imageUrl?: string
}

export type User = {
  id: string
  displayName: string
  role: 'voter' | 'admin'
}

export type Group = {
  id: string
  name: string
}

export type GroupMembership = {
  groupId: string
  userId: string
}

type BallotBase = {
  electionId: string
  categoryId: string
  userId: string
  submittedAt: string
  updatedAt: string
}

export type PluralityBallot = BallotBase & { nomineeId: string }

// ranking: ids de nominados en orden de preferencia
export type RankedBallot = BallotBase & { ranking: string[] }

export type Ballot = PluralityBallot | RankedBallot
