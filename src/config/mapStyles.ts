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
    label: 'Padrão OSM',
    icon: '🗺️',
    description: 'Mapa vetorial urbano com malha viária nítida e nomes de ruas',
  },
  {
    id: 'satellite',
    label: 'Satélite Aéreo',
    icon: '🛰️',
    description: 'Imagens aéreas de alta resolução com relevo viário',
  },
  {
    id: 'terrain',
    label: 'Topográfico / Relevo',
    icon: '⛰️',
    description: 'Relevo, curvas de nível e estradas regionais',
  },
];

export const MAP_THEMES: { id: MapTheme; label: string; icon: string; description: string }[] = [
  {
    id: 'classic',
    label: 'Navegação / Trânsito',
    icon: '🏙️',
    description: 'Estilo de alta visibilidade otimizado para entregas',
  },
  {
    id: 'apple',
    label: 'Urbano Liberty',
    icon: '🍏',
    description: 'Estilo urbano detalhado com bairros e avenidas',
  },
  {
    id: 'minimal',
    label: 'Light / Minimalista',
    icon: '⚪',
    description: 'Foco total na rota azul sem poluição visual',
  },
  {
    id: 'dark',
    label: 'Noturno / Dark',
    icon: '🌙',
    description: 'Modo noturno de alto contraste',
  },
];

export function getSafeToken(): string {
  return '';
}

/**
 * Retorna a URL de estilo vetorial 100% livre e aberta (OpenFreeMap / OpenStreetMap / Esri).
 * Não depende de nenhuma chave Mapbox nem gera custos/limites.
 */
export function getMapStyleUrl(mapType: MapType = 'standard', mapTheme: MapTheme = 'classic'): string {
  if (mapType === 'satellite') {
    return JSON.stringify({
      version: 8,
      name: 'Esri-Satellite',
      sources: {
        'esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '© Esri © OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'esri-satellite-layer',
          type: 'raster',
          source: 'esri-satellite',
          minzoom: 0,
          maxzoom: 20,
        },
      ],
    });
  }

  if (mapType === 'terrain') {
    return 'https://tiles.openfreemap.org/styles/liberty';
  }

  switch (mapTheme) {
    case 'dark':
    case 'minimal':
      return 'https://tiles.openfreemap.org/styles/positron';
    case 'apple':
      return 'https://tiles.openfreemap.org/styles/liberty';
    case 'classic':
    default:
      return 'https://tiles.openfreemap.org/styles/bright';
  }
}

export function getMapboxStyleHttpsUrl(mapType: MapType = 'standard', mapTheme: MapTheme = 'classic'): string {
  return getMapStyleUrl(mapType, mapTheme);
}
