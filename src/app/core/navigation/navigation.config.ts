import { NavigationGroup, UserRole } from './navigation.types';

const federationStaff: readonly UserRole[] = ['admin', 'REP_FEDERACION'];
const federationContent: readonly UserRole[] = ['admin', 'CM'];
const clubUsers: readonly UserRole[] = ['user'];
const refereeUsers: readonly UserRole[] = ['ARBITRO', 'OFICIAL_MESA', 'JEFE_ARBITROS'];
const competitionUsers: readonly UserRole[] = [
  'admin',
  'REP_FEDERACION',
  'user',
  'CM',
  'ARBITRO',
  'OFICIAL_MESA',
  'JEFE_ARBITROS',
];

export const publicNavigation: readonly NavigationGroup[] = [
  {
    label: 'Federación',
    audience: 'public',
    items: [
      { label: 'Inicio', route: '/', icon: 'home' },
      { label: 'Galería', route: '/galeria', icon: 'photo_library' },
    ],
  },
  {
    label: 'Competencias',
    audience: 'public',
    items: [
      { label: 'Fixture', route: '/fixture', icon: 'calendar_month' },
      { label: 'Tabla de goleadores', route: '/tabla-goleadores', icon: 'leaderboard' },
    ],
  },
];

export const authenticatedNavigation: readonly NavigationGroup[] = [
  {
    label: 'Competición & Eventos',
    items: [
      {
        label: 'Torneos & Fixture',
        route: '/torneos',
        icon: 'emoji_events',
        roles: competitionUsers,
        badge: '2026',
        badgeTone: 'info',
      },
      {
        label: 'Calendario',
        route: '/calendario',
        icon: 'calendar_month',
        roles: [...clubUsers, ...refereeUsers, 'admin'],
      },
      {
        label: 'Mesa y planilla en vivo',
        route: '/fixture/gestion',
        icon: 'sports_handball',
        roles: [...refereeUsers, 'admin'],
        badge: 'LIVE',
        badgeTone: 'live',
      },
    ],
  },
  {
    label: 'Gestión Institucional',
    items: [
      {
        label: 'Directorio & Auditoría',
        route: '/clubes',
        icon: 'apartment',
        roles: federationStaff,
        badge: '8 clubes',
        badgeTone: 'accent',
      },
      {
        label: 'Mis Jugadores / Fichas',
        route: '/jugadores',
        icon: 'groups',
        roles: clubUsers,
        badge: '64 Atletas',
        badgeTone: 'info',
      },
      {
        label: 'Padrón de Jugadores',
        route: '/jugadores',
        icon: 'badge',
        roles: federationStaff,
        badge: '64 Atletas',
        badgeTone: 'info',
      },
      {
        label: 'Boletín & Resoluciones',
        route: '/boletin-resoluciones',
        icon: 'campaign',
        roles: [...federationStaff, ...clubUsers, ...refereeUsers],
        badge: '3 nuevos',
        badgeTone: 'accent',
      },
    ],
  },
  {
    label: 'Prensa & Contenido',
    items: [
      {
        label: 'Galería Multimedia',
        route: '/galeria/admin',
        icon: 'photo_library',
        roles: federationContent,
        children: [
          {
            label: 'Ver Galería Pública',
            route: '/galeria',
            icon: 'photo_library',
            roles: federationContent,
          },
          {
            label: 'Subir & Gestionar Fotos',
            route: '/galeria/admin',
            icon: 'add_a_photo',
            roles: federationContent,
          },
        ],
      },
    ],
  },
  {
    label: 'Mesa de Ayuda & Soporte',
    items: [
      {
        label: 'Expedientes & Trámites',
        route: '/soporte',
        icon: 'confirmation_number',
        roles: federationStaff,
        badge: '2 pend.',
        badgeTone: 'warning',
      },
      {
        label: 'Mesa de Entradas Digital',
        route: '/soporte',
        icon: 'support_agent',
        roles: clubUsers,
      },
    ],
  },
];
