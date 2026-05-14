import type { UserRole } from '@/lib/types'

export const CATEGORIES = [
  'Todas',
  'Gastronomia',
  'Compras',
  'Salud y Belleza',
  'Entretenimiento',
  'Viajes',
  'Tecnologia',
  'Deportes y Fitness',
  'Indumentaria',
] as const

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  negocio_admin: 'Admin Negocio',
  consorcio_admin: 'Admin Consorcio',
  propietario: 'Propietario',
  vecino: 'Vecino',
}

export const ROLE_HOME: Record<UserRole, string> = {
  super_admin: '/superadmin',
  negocio_admin: '/admin',
  consorcio_admin: '/iadmin',
  propietario: '/propietario',
  vecino: '/usuario',
}

export const IMAGE_RULES = {
  businessLogo: {
    label: 'Logo del negocio',
    maxSizeMb: 5,
    recommended: 'Ideal 512x512 px, formato cuadrado.',
    minWidth: 256,
    minHeight: 256,
  },
  promotion: {
    label: 'Imagen de promocion',
    maxSizeMb: 5,
    recommended: 'Ideal 1200x675 px, horizontal para destacadas.',
    minWidth: 800,
    minHeight: 450,
  },
  marketplace: {
    label: 'Imagen del articulo',
    maxSizeMb: 5,
    recommended: 'Ideal 800x800 px o proporcion 4:3.',
    minWidth: 600,
    minHeight: 600,
  },
} as const
