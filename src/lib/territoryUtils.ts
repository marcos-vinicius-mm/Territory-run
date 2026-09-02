import * as turf from '@turf/turf'
import type { Feature, Polygon, MultiPolygon } from 'geojson'
import type { LngLat, TrackPoint } from '../types'

/** Distância (metros) abaixo da qual consideramos que o corredor "fechou o laço" */
const LOOP_CLOSE_THRESHOLD_M = 30
/** Pontos mínimos pra formar um polígono válido (evita loops minúsculos por GPS ruim) */
const MIN_POINTS_FOR_LOOP = 4

export function distanceMeters(a: LngLat, b: LngLat): number {
  return turf.distance(turf.point(a), turf.point(b), { units: 'meters' })
}

/**
 * Verifica se o percurso atual já fechou um perímetro válido:
 * o corredor voltou perto o suficiente do ponto de partida.
 */
export function hasClosedLoop(path: TrackPoint[]): boolean {
  if (path.length < MIN_POINTS_FOR_LOOP) return false
  const start = path[0].coords
  const last = path[path.length - 1].coords
  return distanceMeters(start, last) <= LOOP_CLOSE_THRESHOLD_M
}

/**
 * Converte o percurso rastreado em um polígono GeoJSON fechado e válido.
 * Usa buffer(0) pra corrigir auto-interseções simples do traçado do GPS.
 */
export function pathToPolygon(path: TrackPoint[]): Feature<Polygon> | null {
  if (path.length < MIN_POINTS_FOR_LOOP) return null

  const coords = path.map((p) => p.coords)
  // Fecha o anel garantindo que o primeiro e último ponto sejam idênticos
  coords.push(coords[0])

  try {
    const line = turf.lineString(coords)
    const polygon = turf.lineToPolygon(line) as Feature<Polygon>
    // buffer(0) "limpa" self-intersections comuns em traçados de corrida real
    const cleaned = turf.buffer(polygon, 0, { units: 'meters' }) as Feature<Polygon>
    return cleaned ?? polygon
  } catch {
    return null
  }
}

/**
 * Aplica a conquista de um novo polígono sobre os territórios existentes:
 * - Territórios de OUTROS donos que se sobrepõem têm a área sobreposta subtraída
 * - O território do próprio dono (se houver) é unido ao novo polígono
 *
 * Retorna a lista de territórios atualizados (a persistência fica a cargo do backend/Supabase).
 */
export function applyTerritoryCapture(
  newClaim: Feature<Polygon>,
  ownerId: string,
  existingTerritories: { id: string; owner_id: string; geom: Feature<Polygon | MultiPolygon> }[]
): {
  updated: { id: string; geom: Feature<Polygon | MultiPolygon> | null }[]
  captured: Feature<Polygon | MultiPolygon>
} {
  const updated: { id: string; geom: Feature<Polygon | MultiPolygon> | null }[] = []
  let captured: Feature<Polygon | MultiPolygon> = newClaim

  for (const territory of existingTerritories) {
    const intersects = turf.booleanIntersects(newClaim, territory.geom)
    if (!intersects) continue

    if (territory.owner_id === ownerId) {
      // Mesmo dono: funde a área nova com a existente
      const merged = turf.union(turf.featureCollection([newClaim, territory.geom]))
      captured = merged ?? captured
      updated.push({ id: territory.id, geom: null }) // marca a antiga pra ser substituída pela merged
    } else {
      // Dono diferente: subtrai a parte invadida do território dele
      const remaining = turf.difference(turf.featureCollection([territory.geom, newClaim]))
      updated.push({ id: territory.id, geom: remaining ?? null })
    }
  }

  return { updated, captured }
}

export function areaSquareMeters(feature: Feature<Polygon | MultiPolygon>): number {
  return turf.area(feature)
}
