export type LandingSceneTone = 'terracotta' | 'sand' | 'olive' | 'charcoal' | 'cream'
export type LandingSceneContentKey = 'welcome' | 'neighbors' | 'promotions' | 'consorcio' | 'infrastructure'

export interface LandingVector3 {
  x: number
  y: number
  z: number
}

export interface LandingSceneDefinition {
  id: string
  label: string
  eyebrow: string
  headline: string
  body: string
  contentKey: LandingSceneContentKey
  tone: LandingSceneTone
  desktopCameraPath: LandingVector3[]
  desktopCameraTargetPath: LandingVector3[]
  mobileCameraPath: LandingVector3[]
  mobileCameraTargetPath: LandingVector3[]
}

export interface LandingStat {
  label: string
  value: string
}

export interface LandingFeature {
  icon: 'tag' | 'building' | 'barChart' | 'shield' | 'users' | 'zap'
  title: string
  description: string
}

export const landingStats: LandingStat[] = [
  { label: 'Edificios que activan comunidad', value: '500+' },
  { label: 'Comercios que se acercan a vecinos', value: '120+' },
  { label: 'Personas conectadas por edificio', value: '12,000+' },
  { label: 'Beneficios usados en la vida real', value: '85,000+' },
]

export const landingFeatures: LandingFeature[] = [
  {
    icon: 'tag',
    title: 'Beneficios que se sienten cerca',
    description: 'Descuentos, promos y oportunidades pensadas para quienes viven y se mueven alrededor del edificio.',
  },
  {
    icon: 'building',
    title: 'Mas vida para cada edificio',
    description: 'Countrify convierte al edificio en un punto de encuentro entre comunidad, consumo local y experiencias compartidas.',
  },
  {
    icon: 'barChart',
    title: 'Ahorro y movimiento real',
    description: 'Los vecinos descubren propuestas utiles y los comercios ganan visibilidad donde realmente importa.',
  },
  {
    icon: 'shield',
    title: 'Experiencia simple para todos',
    description: 'Vecinos, comercios y consorcios encuentran lo que necesitan dentro de un mismo ecosistema claro.',
  },
  {
    icon: 'users',
    title: 'Comunidad mas conectada',
    description: 'La vida del edificio gana orden, participacion y una forma mas cercana de estar al dia.',
  },
  {
    icon: 'zap',
    title: 'Sumarse es facil',
    description: 'Countrify invita a descubrir, participar y aprovechar mejor todo lo que pasa dentro y alrededor del edificio.',
  },
]

export const landingScenes: LandingSceneDefinition[] = [
  {
    id: 'welcome',
    label: 'Bienvenida',
    eyebrow: 'Bienvenida',
    headline: 'Countrify conecta la vida del edificio con todo lo que pasa a su alrededor.',
    body: 'Vecinos, comercios y consorcios encuentran en Countrify una nueva forma de ahorrar, participar y sentirse parte de una comunidad mas conectada.',
    contentKey: 'welcome',
    tone: 'terracotta',
    desktopCameraPath: [
      { x: 2.66, y: 2.1, z: 2.62 },
      { x: 1.9, y: 1.94, z: 1.92 },
      { x: 1.18, y: 1.8, z: 1.32 },
    ],
    desktopCameraTargetPath: [
      { x: 2.08, y: 1.2, z: -1.52 },
      { x: 2.2, y: 1.16, z: -1.64 },
      { x: 2.28, y: 1.12, z: -1.7 },
    ],
    mobileCameraPath: [
      { x: 3.62, y: 2.36, z: 3.34 },
      { x: 2.76, y: 2.14, z: 2.66 },
      { x: 1.94, y: 1.96, z: 2.0 },
    ],
    mobileCameraTargetPath: [
      { x: 1.92, y: 1.18, z: -1.42 },
      { x: 2.06, y: 1.14, z: -1.58 },
      { x: 2.18, y: 1.1, z: -1.68 },
    ],
  },
  {
    id: 'neighbors',
    label: 'Vecinos',
    eyebrow: 'Vecinos',
    headline: 'Para los vecinos, Countrify hace que el edificio se sienta mas util, cercano y vivo.',
    body: 'Promociones, descubrimiento de comercios, comunidad y herramientas cotidianas se integran en una experiencia pensada para aprovechar mejor cada dia.',
    contentKey: 'neighbors',
    tone: 'sand',
    desktopCameraPath: [
      { x: -2.74, y: 1.94, z: 2.48 },
      { x: -3.74, y: 1.88, z: 2.08 },
      { x: -4.62, y: 1.82, z: 1.82 },
    ],
    desktopCameraTargetPath: [
      { x: -5.2, y: 1.12, z: 0.22 },
      { x: -5.36, y: 1.08, z: 0.1 },
      { x: -5.46, y: 1.04, z: -0.04 },
    ],
    mobileCameraPath: [
      { x: -1.72, y: 2.08, z: 3.0 },
      { x: -2.98, y: 1.98, z: 2.74 },
      { x: -4.08, y: 1.92, z: 2.46 },
    ],
    mobileCameraTargetPath: [
      { x: -5.08, y: 1.08, z: 0.3 },
      { x: -5.26, y: 1.04, z: 0.16 },
      { x: -5.4, y: 1.02, z: 0.02 },
    ],
  },
  {
    id: 'promotions',
    label: 'Promos',
    eyebrow: 'Comercios',
    headline: 'Los comercios llegan al edificio con propuestas relevantes y beneficios que invitan a volver.',
    body: 'Countrify acerca ofertas de cercania, ayuda a descubrir nuevos favoritos y crea una relacion mas directa entre los locales y quienes viven alrededor.',
    contentKey: 'promotions',
    tone: 'cream',
    desktopCameraPath: [
      { x: -5.0, y: 1.9, z: 2.08 },
      { x: -5.88, y: 1.84, z: 2.16 },
      { x: -6.56, y: 1.8, z: 2.18 },
    ],
    desktopCameraTargetPath: [
      { x: -6.1, y: 0.98, z: 1.52 },
      { x: -6.22, y: 0.98, z: 1.68 },
      { x: -6.28, y: 0.98, z: 1.82 },
    ],
    mobileCameraPath: [
      { x: -4.0, y: 1.96, z: 2.66 },
      { x: -5.04, y: 1.9, z: 2.74 },
      { x: -5.88, y: 1.86, z: 2.8 },
    ],
    mobileCameraTargetPath: [
      { x: -6.0, y: 0.98, z: 1.46 },
      { x: -6.16, y: 0.98, z: 1.62 },
      { x: -6.24, y: 0.98, z: 1.76 },
    ],
  },
  {
    id: 'consorcio',
    label: 'Consorcio',
    eyebrow: 'Consorcio',
    headline: 'Para el consorcio, Countrify ordena la convivencia y fortalece la comunidad.',
    body: 'La participacion gana contexto, el seguimiento se vuelve mas claro y el edificio encuentra una forma mas cercana de organizar lo importante.',
    contentKey: 'consorcio',
    tone: 'olive',
    desktopCameraPath: [
      { x: 1.58, y: 1.9, z: -1.08 },
      { x: 1.92, y: 1.84, z: -2.1 },
      { x: 2.02, y: 1.8, z: -3.02 },
    ],
    desktopCameraTargetPath: [
      { x: 2.12, y: 1.22, z: -2.8 },
      { x: 2.1, y: 1.18, z: -4.0 },
      { x: 2.08, y: 1.14, z: -5.0 },
    ],
    mobileCameraPath: [
      { x: 1.18, y: 1.94, z: -0.78 },
      { x: 1.58, y: 1.9, z: -1.9 },
      { x: 1.78, y: 1.86, z: -2.82 },
    ],
    mobileCameraTargetPath: [
      { x: 2.14, y: 1.18, z: -2.54 },
      { x: 2.1, y: 1.14, z: -3.52 },
      { x: 2.08, y: 1.1, z: -4.42 },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Sumate',
    eyebrow: 'Sumate',
    headline: 'Sumarte a Countrify es abrirle la puerta a una vida de edificio mas conectada.',
    body: 'Si queres acercar beneficios, comunidad y nuevas oportunidades a tu edificio, Countrify esta pensado para eso: hacer que todos ganen mas cerca de casa.',
    contentKey: 'infrastructure',
    tone: 'charcoal',
    desktopCameraPath: [
      { x: 4.54, y: 1.92, z: -2.3 },
      { x: 5.28, y: 1.88, z: -1.62 },
      { x: 5.88, y: 1.84, z: -1.04 },
    ],
    desktopCameraTargetPath: [
      { x: 6.02, y: 1.18, z: -1.04 },
      { x: 6.12, y: 1.14, z: -0.82 },
      { x: 6.18, y: 1.1, z: -0.64 },
    ],
    mobileCameraPath: [
      { x: 4.08, y: 1.96, z: -2.28 },
      { x: 4.86, y: 1.92, z: -1.68 },
      { x: 5.48, y: 1.88, z: -1.14 },
    ],
    mobileCameraTargetPath: [
      { x: 5.88, y: 1.16, z: -0.98 },
      { x: 6.0, y: 1.12, z: -0.78 },
      { x: 6.1, y: 1.08, z: -0.64 },
    ],
  },
]

export const landingModelAsset = {
  sourceFileName: 'modern_apartment.glb',
  optimizedDesktopPath: '/models/modern-apartment-landing.optimized.glb',
  optimizedMobilePath: '/models/modern-apartment-landing.mobile.glb',
  posterPath: '/placeholder.jpg',
}
