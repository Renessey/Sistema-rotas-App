import { getMapboxAccessToken, MAPBOX_ACCESS_TOKEN } from './env';

export type MapType = 'standard' | 'satellite' | 'terrain';
export type MapTheme = 'classic' | 'apple' | 'minimal' | 'dark';

export interface MapStyleConfig {
  id: string;
  name: string;
  description: string;
  styleUrl: string;
  previewBg: string;
  previewAccent: string;
}

export const MAP_TYPES: { id: MapType; label: string; icon: string; description: string }[] = [
  {
    id: 'standard',
    label: 'Padrão Mapbox',
    icon: '🗺️',
    description: 'Mapa vetorial urbano oficial Mapbox Streets v12 com vias nítidas',
  },
  {
    id: 'satellite',
    label: 'Satélite Mapbox',
    icon: '🛰️',
    description: 'Imagens aéreas de altíssima resolução com overlay viário',
  },
  {
    id: 'terrain',
    label: 'Topográfico Mapbox',
    icon: '⛰️',
    description: 'Relevo, curvas de nível e estradas (Mapbox Outdoors v12)',
  },
];

export const MAP_THEMES: { id: MapTheme; label: string; icon: string; description: string }[] = [
  {
    id: 'classic',
    label: 'Navegação / Trânsito',
    icon: '🏙️',
    description: 'Estilo Mapbox Navigation Day otimizado para entregas',
  },
  {
    id: 'apple',
    label: 'Streets v12',
    icon: '🍏',
    description: 'Estilo urbano clássico Mapbox com nomes de bairros e avenidas',
  },
  {
    id: 'minimal',
    label: 'Light / Minimalista',
    icon: '⚪',
    description: 'Foco total na rota azul sem poluição visual (Mapbox Light v11)',
  },
  {
    id: 'dark',
    label: 'Noturno / Dark',
    icon: '🌙',
    description: 'Modo noturno de alto contraste (Mapbox Navigation Night v1)',
  },
];

function getSafeToken(): string {
  try {
    return getMapboxAccessToken();
  } catch {
    return MAPBOX_ACCESS_TOKEN || '';
  }
}

/**
 * Retorna o objeto de especificação de estilo MapLibre contendo os tiles
 * oficiais do Mapbox em alta resolução (@2x Retina).
 *
 * Esta abordagem é 100% compatível com o MapLibre Native, garantindo que o mapa
 * seja renderizado pelo motor GPU sem nenhum erro de protocolo 'mapbox://'.
 */
export function getMapStyleUrl(mapType: MapType = 'standard', mapTheme: MapTheme = 'classic'): string {
  const token = getSafeToken();
  let styleId = 'navigation-day-v1';

  if (mapType === 'satellite') {
    styleId = 'satellite-streets-v12';
  } else if (mapType === 'terrain') {
    styleId = 'outdoors-v12';
  } else {
    switch (mapTheme) {
      case 'dark':
        styleId = 'navigation-night-v1';
        break;
      case 'minimal':
        styleId = 'light-v11';
        break;
      case 'apple':
        styleId = 'streets-v12';
        break;
      case 'classic':
      default:
        styleId = 'navigation-day-v1';
        break;
    }
  }

  const tileUrl = `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`;

  return JSON.stringify({
    version: 8,
    name: `Mapbox-${styleId}`,
    sources: {
      'mapbox-source': {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: '© Mapbox © OpenStreetMap',
      },
    },
    layers: [
      {
        id: 'mapbox-layer',
        type: 'raster',
        source: 'mapbox-source',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  });
}
