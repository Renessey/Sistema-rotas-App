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

const MAPTILER_KEY = 'gK1k9hgPpqK3yZo3UbrJ';

export const MAP_TYPES: { id: MapType; label: string; icon: string; description: string }[] = [
  {
    id: 'standard',
    label: 'Padrão',
    icon: '🗺️',
    description: 'Mapa vetorial urbano com nomes de ruas e vias',
  },
  {
    id: 'satellite',
    label: 'Satélite',
    icon: '🛰️',
    description: 'Imagens aéreas reais com overlay de rodovias',
  },
  {
    id: 'terrain',
    label: 'Topográfico',
    icon: '⛰️',
    description: 'Relevo, curvas de nível e estradas rurais',
  },
];

export const MAP_THEMES: { id: MapTheme; label: string; icon: string; description: string }[] = [
  {
    id: 'classic',
    label: 'Clássico',
    icon: '🏙️',
    description: 'Cores padrão vibrantes e vias bem destacadas',
  },
  {
    id: 'apple',
    label: 'Estilo Apple',
    icon: '🍏',
    description: 'Tons pastéis suaves, cinza elegante e verde sutil',
  },
  {
    id: 'minimal',
    label: 'Minimalista',
    icon: '⚪',
    description: 'Foco total nas rotas, sem poluição de comércios',
  },
  {
    id: 'dark',
    label: 'Noturno / Dark',
    icon: '🌙',
    description: 'Fundo escuro e alto contraste com vias iluminadas',
  },
];

export const MAP_STYLE_URLS: Record<MapType, Record<MapTheme, string>> = {
  standard: {
    classic: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
    apple: `https://api.maptiler.com/maps/voyager/style.json?key=${MAPTILER_KEY}`,
    minimal: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`,
    dark: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
  },
  satellite: {
    classic: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
    apple: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
    minimal: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
    dark: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
  },
  terrain: {
    classic: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`,
    apple: `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`,
    minimal: `https://api.maptiler.com/maps/toposhine/style.json?key=${MAPTILER_KEY}`,
    dark: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
  },
};

/**
 * Returns the appropriate MapLibre style JSON URL based on map type and theme.
 */
export function getMapStyleUrl(mapType: MapType = 'standard', mapTheme: MapTheme = 'classic'): string {
  const typeStyles = MAP_STYLE_URLS[mapType] || MAP_STYLE_URLS.standard;
  return typeStyles[mapTheme] || typeStyles.classic;
}
