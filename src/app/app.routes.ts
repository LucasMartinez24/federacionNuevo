import { Routes } from '@angular/router';

export const routes: Routes = [
  // Rutas públicas (sin el sidebar de navegación)
  // {
  //   path: '',
  //   loadComponent: () => import('./shared/components/principal/principal').then((m) => m.Principal),
  //   title: 'FJH - Federación Jujeña de Handball',
  // },
  // {
  //   path: 'login',
  //   component: LoginComponent,
  //   title: 'FJH - Login Institucional',
  // },
  // {
  //   path: 'galeria',
  //   loadComponent: () =>
  //     import('./shared/components/galeria-component/galeria-component').then(
  //       (m) => m.GaleriaComponent,
  //     ),
  //   title: 'Galería - FJH',
  // },

  // Rutas autenticadas (se incorporaran dentro del shell cuando exista la primera vista)
  {
    path: '',
    children: [
      // {
      //   path: 'dashboard',
      //   loadComponent: () =>
      //     import('./shared/components/dashboard/dashboard.component').then(
      //       (m) => m.DashboardComponent,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'user'] },
      //   title: 'Panel Club - FJH',
      // },
      // {
      //   path: 'clubes',
      //   loadComponent: () =>
      //     import('./shared/components/club-list/club-list').then((m) => m.ClubList),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'REP_FEDERACION'] },
      //   title: 'Instituciones - FJH',
      // },
      // {
      //   path: 'club-create',
      //   loadComponent: () =>
      //     import('./shared/components/club-create/club-create').then((m) => m.ClubCreate),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin'] },
      //   title: 'Nuevo Club',
      // },
      // {
      //   path: 'jugador-form',
      //   loadComponent: () =>
      //     import('./shared/components/jugador-form/jugador-form.component').then(
      //       (m) => m.JugadorFormComponent,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'user'] },
      //   title: 'Ficha Jugador',
      // },
      // {
      //   path: 'jugador-form/:id',
      //   loadComponent: () =>
      //     import('./shared/components/jugador-form/jugador-form.component').then(
      //       (m) => m.JugadorFormComponent,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'user'] },
      // },
      // {
      //   path: 'torneos',
      //   loadComponent: () => import('./shared/components/torneos/torneos').then((m) => m.Torneos),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'REP_FEDERACION', 'OFICIAL_MESA', 'JEFE_ARBITROS', 'user'] },
      //   title: 'Torneos Oficiales',
      // },
      // {
      //   path: 'torneo-create',
      //   loadComponent: () =>
      //     import('./shared/components/torneos-form/torneos-form').then((m) => m.TorneosForm),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'REP_FEDERACION', 'OFICIAL_MESA'] },
      //   title: 'Nuevo Torneo',
      // },
      // {
      //   path: 'fixture-generator/:id',
      //   loadComponent: () =>
      //     import('./shared/components/fixture-generator/fixture-generator').then(
      //       (m) => m.FixtureGenerator,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'REP_FEDERACION', 'OFICIAL_MESA'] },
      //   title: 'Generador Fixture',
      // },
      // {
      //   path: 'fixture-management/:id',
      //   loadComponent: () =>
      //     import('./shared/components/fixture-management/fixture-management').then(
      //       (m) => m.FixtureManagement,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin', 'REP_FEDERACION', 'OFICIAL_MESA', 'JEFE_ARBITROS', 'user'] },
      //   title: 'Acta de Partido',
      // },
      // {
      //   path: 'support',
      //   loadComponent: () =>
      //     import('./shared/components/support-admin-component/support-admin-component').then(
      //       (m) => m.SupportAdminComponent,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['admin'] },
      //   title: 'Tickets Federación',
      // },
      // {
      //   path: 'support-club',
      //   loadComponent: () =>
      //     import('./shared/components/support-club-component/support-club-component').then(
      //       (m) => m.SupportClubComponent,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['user', 'REP_FEDERACION', 'OFICIAL_MESA', 'JEFE_ARBITROS'] },
      //   title: 'Soporte Club',
      // },
      // {
      //   path: 'calendarioCompleto',
      //   loadComponent: () =>
      //     import('./shared/components/club-dashboard/club-dashboard').then((m) => m.ClubDashboard),
      //   canActivate: [roleGuard],
      //   data: { roles: ['user', 'admin'] },
      //   title: 'Mi Agenda',
      // },
      // {
      //   path: 'formGaleria',
      //   loadComponent: () =>
      //     import('./shared/components/admin-galeria-component/admin-galeria-component').then(
      //       (m) => m.AdminGaleriaComponent,
      //     ),
      //   canActivate: [roleGuard],
      //   data: { roles: ['CM', 'admin'] },
      //   title: 'Formulario Galería - FJH',
      // },
    ],
  },
  { path: '**', redirectTo: '' },
];
