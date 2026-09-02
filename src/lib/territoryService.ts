import { supabase } from './supabase'
import type { Territory } from '../types'

export async function fetchTerritories(): Promise<Territory[]> {
  const { data, error } = await supabase.from('territories_view').select('*')
  if (error) throw error
  return (data ?? []) as Territory[]
}

/**
 * Assina mudanças na tabela territories em tempo real. Como o payload do
 * Realtime traz a geometria em formato bruto (WKB), o mais simples e robusto
 * é só usar o evento como gatilho pra re-buscar territories_view inteira —
 * o volume de dados é pequeno o suficiente pra isso ser tranquilo no MVP.
 */
export function subscribeToTerritories(onChange: () => void): () => void {
  const channel = supabase
    .channel('territories-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'territories' }, onChange)
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

interface ClaimResult {
  owner_id: string
  geom_geojson: GeoJSON.MultiPolygon
  area_m2: number
}

/**
 * Chama a função RPC claim_territory no banco, que valida o percurso
 * server-side e persiste a conquista. Lança erro se o Postgres rejeitar
 * (percurso curto demais, área insignificante, etc).
 */
export async function claimTerritory(
  coords: [number, number][],
  startedAt: string
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_territory', {
    coords,
    run_started_at: startedAt,
  })
  if (error) throw error
  return data[0] as ClaimResult
}
