export class LccnHeuristic {
  static serialize(heuristic: LccnHeuristicInput): number {
    let score = 0
    if (heuristic.Verified) {
      score += 1000000
    }
    if (heuristic.Matches?.Title) {
      score += 100000
    }
    if (heuristic.Matches?.Author) {
      score += 10000
    }
    if (heuristic.Matches?.Date) {
      score += 1000
    }
    if (heuristic.Index) {
      score += heuristic.Index
    }
    return score
  }

  static deserialize(score: number): LccnHeuristicInput {
    const heuristic: LccnHeuristicInput = {
      Verified: false,
      Matches: {
        Title: false,
        Author: false,
        Date: false,
      },
      Index: 0,
    }
    if (score >= 1000000) {
      heuristic.Verified = true
      score - +1000000
    }
    if (score >= 100000) {
      heuristic.Matches.Title = true
      score -= 100000
    }
    if (score >= 10000) {
      heuristic.Matches.Author = true
      score -= 10000
    }
    if (score >= 1000) {
      heuristic.Matches.Date = true
      score -= 1000
    }
    heuristic.Index = score
    return heuristic
  }

  static update({
    existing,
    newVerified,
    newMatches,
    newIndex,
  }: {
    existing: number
    newVerified?: boolean
    newMatches?: Matches
    newIndex?: number
  }): number {
    const heuristic = LccnHeuristic.deserialize(existing)
    if (newVerified !== undefined) {
      heuristic.Verified = newVerified
    }
    if (newMatches?.Title !== undefined) {
      heuristic.Matches.Title = newMatches.Title
    }
    if (newMatches?.Author !== undefined) {
      heuristic.Matches.Author = newMatches.Author
    }
    if (newMatches?.Date !== undefined) {
      heuristic.Matches.Date = newMatches.Date
    }
    if (newIndex !== undefined) {
      heuristic.Index = newIndex
    }
    return LccnHeuristic.serialize(heuristic)
  }
}

export type LccnHeuristicInput = {
  Verified: boolean
  Matches: Matches
  Index: number
}

export type Matches = {
  Title: boolean
  Author: boolean
  Date: boolean
}
