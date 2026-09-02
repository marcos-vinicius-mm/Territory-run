import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// Necessário no MapLibre GL v6+: ele agora é ESM puro e o worker interno
// precisa ser registrado manualmente. Sem isso, o dep optimizer do Vite
// tenta pré-empacotar o worker como um módulo comum e quebra com o erro
// "The file does not exist at .../maplibre-gl-worker.mjs".
// Importante usar "?worker&url" (não só "?url"): o worker importa um
// arquivo irmão (maplibre-gl-shared.mjs) que só é resolvido corretamente
// dessa forma.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { LngLat, Territory } from '../types'

maplibregl.setWorkerUrl(workerUrl)

interface GameMapProps {
  currentPath: LngLat[]
  territories: Territory[]
  center?: LngLat
}

const CURRENT_PATH_SOURCE = 'current-path'
const TERRITORIES_SOURCE = 'territories'

// OpenFreeMap: tiles vetoriais gratuitos, sem limite de uso e sem precisar
// de API key (https://openfreemap.org). O estilo "liberty" mostra ruas,
// prédios e nomes de lugares — ideal pra um jogo de corrida por território.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export function GameMap({ currentPath, territories, center = [-38.99, -3.71] }: GameMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  // Inicializa o mapa uma única vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: 15,
      pitch: 0,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    )

    map.on('load', () => {
      map.addSource(CURRENT_PATH_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: CURRENT_PATH_SOURCE,
        type: 'line',
        source: CURRENT_PATH_SOURCE,
        paint: { 'line-color': '#22d3ee', 'line-width': 4 },
      })

      map.addSource(TERRITORIES_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: `${TERRITORIES_SOURCE}-fill`,
        type: 'fill',
        source: TERRITORIES_SOURCE,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 },
      })
      map.addLayer({
        id: `${TERRITORIES_SOURCE}-outline`,
        type: 'line',
        source: TERRITORIES_SOURCE,
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      })
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Atualiza o traçado do percurso atual
  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(CURRENT_PATH_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!source) return
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: currentPath },
    })
  }, [currentPath])

  // Atualiza os territórios conquistados
  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(TERRITORIES_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (!source) return
    source.setData({
      type: 'FeatureCollection',
      features: territories.map((t) => ({
        type: 'Feature',
        properties: { color: t.color, owner: t.owner_name, id: t.owner_id },
        geometry: t.geom,
      })),
    })
  }, [territories])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
