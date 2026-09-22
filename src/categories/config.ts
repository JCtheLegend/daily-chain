import type { CategoryId } from '../engine/types'

export interface CategoryMeta {
  id: CategoryId
  title: string
  emoji: string
  personLabel: string
  workLabel: string
  tagline: string
  /** Prompt when the chain ends on a person: asks for one of their works. */
  personToWorkPrompt: (person: string) => string
  /** Prompt when the chain ends on a work: asks for someone else on it. */
  workToPersonPrompt: (work: string, previousPerson: string) => string
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  'actors-movies': {
    id: 'actors-movies',
    title: 'Actors & Movies',
    emoji: '🎬',
    personLabel: 'actor',
    workLabel: 'movie',
    tagline: 'Link two actors through the movies they were cast in.',
    personToWorkPrompt: (person) => `Name a movie ${person} was in`,
    workToPersonPrompt: (work, prev) => `Name an actor in ${work} with ${prev}`,
  },
  'artists-songs': {
    id: 'artists-songs',
    title: 'Artists & Songs',
    emoji: '🎵',
    personLabel: 'artist',
    workLabel: 'song',
    tagline: 'Link two artists through songs they are credited on together.',
    personToWorkPrompt: (person) => `Name a song ${person} is credited on with another artist`,
    workToPersonPrompt: (work, prev) => `Name another artist on ${work} besides ${prev}`,
  },
  'athletes-teams': {
    id: 'athletes-teams',
    title: 'Athletes & Teams',
    emoji: '🏆',
    personLabel: 'player',
    workLabel: 'team',
    tagline: 'Link two NBA, NFL, MLB or NHL players through teammates from the same season.',
    personToWorkPrompt: (person) => `Name a team ${person} played for`,
    workToPersonPrompt: (work, prev) => `Name a player on the ${work} at the same time as ${prev}`,
  },
}

export const CATEGORY_ORDER: CategoryId[] = ['actors-movies', 'artists-songs', 'athletes-teams']
