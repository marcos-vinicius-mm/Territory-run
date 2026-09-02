import { create } from 'zustand'
import type { Territory, Profile } from '../types'

interface GameState {
  currentUser: Profile | null
  territories: Territory[]
  setCurrentUser: (user: Profile | null) => void
  setTerritories: (territories: Territory[]) => void
  upsertTerritory: (territory: Territory) => void
  removeTerritory: (id: string) => void
}

export const useGameStore = create<GameState>((set) => ({
  currentUser: null,
  territories: [],
  setCurrentUser: (user) => set({ currentUser: user }),
  setTerritories: (territories) => set({ territories }),
  upsertTerritory: (territory) =>
    set((state) => ({
      territories: [
        ...state.territories.filter((t) => t.owner_id !== territory.owner_id),
        territory,
      ],
    })),
  removeTerritory: (ownerId) =>
    set((state) => ({
      territories: state.territories.filter((t) => t.owner_id !== ownerId),
    })),
}))
