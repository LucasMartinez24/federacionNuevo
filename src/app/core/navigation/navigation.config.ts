import { NavigationGroup, UserRole } from './navigation.types';

const federationStaff: readonly UserRole[] = ['admin', 'REP_FEDERACION'];
const federationContent: readonly UserRole[] = ['admin', 'CM'];
const clubUsers: readonly UserRole[] = ['user'];
const refereeUsers: readonly UserRole[] = ['ARBITRO', 'OFICIAL_MESA', 'JEFE_ARBITROS'];
const competitionUsers: readonly UserRole[] = [
  'admin',
  'REP_FEDERACION',
  'user',
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
      { label: 'Fixture', route: '/fixture', icon: 'sports_handball' },
      { label: 'Calendario', route: '/calendario', icon: 'calendar_month' },
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
        route: '/admin/torneos',
        icon: 'emoji_events',
        roles: competitionUsers,
      },
      {
        label: 'Calendario',
        route: '/admin/calendario',
        icon: 'calendar_month',
        roles: [...federationStaff, ...refereeUsers],
      },
      {
        label: 'Mesa y planilla en vivo',
        route: '/admin/fixture',
        icon: 'sports_handball',
        roles: [...refereeUsers, 'admin'],
      },
    ],
  },
  {
    label: 'Gestión Institucional',
    items: [
      {
        label: 'Mis Jugadores / Fichas',
        route: '/admin/jugadores',
        icon: 'groups',
        roles: clubUsers,
      },
      {
        label: 'Padrón de Jugadores',
        route: '/admin/jugadores',
        icon: 'badge',
        roles: federationStaff,
      },
      {
        label: 'Clubes Afiliados',
        route: '/admin/clubes',
        icon: 'shield',
        roles: federationStaff,
      },
      {
        label: 'Boletín & Resoluciones',
        route: '/admin/boletin-resoluciones',
        icon: 'campaign',
        roles: [...federationStaff, ...clubUsers, ...refereeUsers],
      },
    ],
  },
  {
    label: 'Prensa & Contenido',
    items: [
      {
        label: 'Galería Multimedia',
        route: '/admin/galeria',
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
            route: '/admin/galeria',
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
        label: 'Soporte',
        route: '/admin/soporte',
        icon: 'support_agent',
        roles: [...federationStaff, ...refereeUsers],
      },
      {
        label: 'Mesa de Entradas Digital',
        route: '/club/mesa-ayuda',
        icon: 'support_agent',
        roles: clubUsers,
      },
    ],
  },
];
