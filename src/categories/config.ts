import type { CategoryId } from '../engine/types'

export interface CategoryMeta {
  id: CategoryId
  title: string
  emoji: string
  personLabel: string
  workLabel: string
  tagline: string
  /** Prompt shown when the current chain node is a person (asks for the next work). */
  personToWorkPrompt: (name: string) => string
  /** Prompt shown when the current chain node is a work (asks for the next person). */
  workToPersonPrompt: (name: string) => string
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  'actors-movies': {
    id: 'actors-movies',
    title: 'Actors & Movies',
    emoji: '🎬',
    personLabel: 'actor',
    workLabel: 'movie',
    tagline: 'Connect two actors through the movies they were cast in.',
    personToWorkPrompt: (name) => `Name a movie ${name} was cast in`,
    workToPersonPrompt: (name) => `Name an actor also cast in ${name}`,
  },
  'artists-songs': {
    id: 'artists-songs',
    title: 'Artists & Songs',
    emoji: '🎵',
    personLabel: 'artist',
    workLabel: 'song',
    tagline: 'Connect two artists through songs they were featured on together.',
    personToWorkPrompt: (name) => `Name a song ${name} was featured on`,
    workToPersonPrompt: (name) => `Name an artist also featured on ${name}`,
  },
  'athletes-teams': {
    id: 'athletes-teams',
    title: 'Athletes & Teams',
    emoji: '🏀',
    personLabel: 'athlete',
    workLabel: 'team',
    tagline: 'Connect two NBA players through teams they were teammates on.',
    personToWorkPrompt: (name) => `Name a team ${name} played a season for`,
    workToPersonPrompt: (name) => `Name a player also on ${name}`,
  },
}

export const CATEGORY_ORDER: CategoryId[] = ['actors-movies', 'artists-songs', 'athletes-teams']
