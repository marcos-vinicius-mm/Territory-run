export type LngLat = [number, number] // [longitude, latitude] — ordem padrão GeoJSON/MapLibre

export interface TrackPoint {
  coords: LngLat
  timestamp: number
  accuracy: number | null
}

export interface Territory {
  owner_id: string
  owner_name: string
  color: string
  /** Polígono GeoJSON (sempre MultiPolygon — pode ter áreas desconexas) */
  geom: GeoJSON.MultiPolygon
  area_m2: number
  updated_at: string
}

export interface Profile {
  id: string
  username: string
  color: string
  total_area_m2: number
  rank: number
}
