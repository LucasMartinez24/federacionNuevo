import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Rutas públicas
  {
    path: '',
    loadComponent: () =>
      import('./features/public/pages/inicio/inicio.component').then((m) => m.InicioComponent),
    title: 'FJH - Federación Jujeña de Handball',
  },
  {
    path: 'inicio',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/login/login.component').then((m) => m.LoginComponent),
    title: 'FJH - Login Institucional',
  },
  {
    path: 'fixture',
    loadComponent: () =>
      import('./features/public/pages/fixture/fixture.component').then((m) => m.FixtureComponent),
    title: 'FJH - Fixture & Planilla en Vivo',
  },
  {
    path: 'fixture/gestion',
    redirectTo: 'admin/fixture',
    pathMatch: 'full',
  },
  {
    path: 'fixtures-y-resultados',
    redirectTo: 'fixture',
    pathMatch: 'full',
  },
  {
    path: 'calendario',
    loadComponent: () =>
      import('./features/public/pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
    title: 'FJH - Página no disponible',
  },
  {
    path: 'boletin-resoluciones',
    redirectTo: 'admin/boletin-resoluciones',
    pathMatch: 'full',
  },
  {
    path: 'galeria',
    loadComponent: () =>
      import('./features/public/pages/galeria/galeria.component').then((m) => m.GaleriaComponent),
    title: 'FJH - Galería',
  },
  {
    path: 'galeria/admin',
    redirectTo: 'admin/galeria',
    pathMatch: 'full',
  },
  {
    path: 'tabla-goleadores',
    loadComponent: () =>
      import('./features/public/pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
    title: 'FJH - Página no disponible',
  },
  {
    path: 'soporte',
    loadComponent: () =>
      import('./features/public/pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
    title: 'FJH - Página no disponible',
  },

  // Rutas protegidas de la Federación con Sidebar (FederationLayout)
  {
    path: 'admin',
    loadComponent: () =>
      import('./layouts/federation-layout/federation-layout.component').then(
        (m) => m.FederationLayoutComponent,
      ),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'jugadores',
        pathMatch: 'full',
      },
      {
        path: 'jugadores',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/jugadores/jugadores-auditoria.component'
          ).then((m) => m.JugadoresAuditoriaComponent),
        title: 'FJH - Auditoría de Jugadores',
      },
      {
        path: 'jugadores/crear',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/jugadores/jugador-crear/jugador-crear.component'
          ).then((m) => m.JugadorCrearComponent),
        title: 'FJH - Nuevo Atleta Federado',
      },
      {
        path: 'jugadores/editar/:id',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/jugadores/jugador-crear/jugador-crear.component'
          ).then((m) => m.JugadorCrearComponent),
        title: 'FJH - Expediente y Edición de Atleta',
      },
      {
        path: 'clubes/crear',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/clubes/club-crear/club-crear.component'
          ).then((m) => m.ClubCrearComponent),
        title: 'FJH - Nuevo Club Afiliado',
      },
      {
        path: 'clubes/editar/:id',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/clubes/club-crear/club-crear.component'
          ).then((m) => m.ClubCrearComponent),
        title: 'FJH - Editar Club Afiliado',
      },
      {
        path: 'torneos',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/torneos/torneos.component'
          ).then((m) => m.TorneosComponent),
        title: 'FJH - Torneos & Competencias',
      },
      {
        path: 'torneos/crear',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/torneos/torneo-form/torneo-form.component'
          ).then((m) => m.TorneoFormComponent),
        title: 'FJH - Configuración de Torneo',
      },
      {
        path: 'torneos/editar/:id',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/torneos/torneo-form/torneo-form.component'
          ).then((m) => m.TorneoFormComponent),
        title: 'FJH - Editar Torneo',
      },
      {
        path: 'torneos/gestionar/:id',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/torneos/torneo-gestionar/torneo-gestionar.component'
          ).then((m) => m.TorneoGestionarComponent),
        title: 'FJH - Gestión Operativa de Torneo',
      },
      {
        path: 'galeria',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/galeria/galeria-admin.component'
          ).then((m) => m.GaleriaAdminComponent),
        title: 'FJH - Galería Multimedia & Prensa',
      },
      {
        path: 'galeria/admin',
        redirectTo: 'galeria',
        pathMatch: 'full',
      },
      {
        path: 'fixture',
        loadComponent: () =>
          import('./features/public/pages/fixture/fixture.component').then(
            (m) => m.FixtureComponent,
          ),
        title: 'FJH - Fixture & Planilla en Vivo',
      },
      {
        path: 'boletin-resoluciones',
        loadComponent: () =>
          import(
            './features/federation-admin/pages/boletin-resoluciones/boletin-resoluciones.component'
          ).then((m) => m.BoletinResolucionesComponent),
        title: 'FJH - Boletín Oficial & Resoluciones',
      },
      {
        path: 'dashboard',
        redirectTo: 'jugadores',
        pathMatch: 'full',
      },
    ],
  },

  // Rutas de Portal de Club (ClubLayout)
  {
    path: 'club',
    loadComponent: () =>
      import('./layouts/club-layout/club-layout.component').then((m) => m.ClubLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'fixture',
        pathMatch: 'full',
      },
      {
        path: 'fixture',
        loadComponent: () =>
          import(
            './features/club-admin/pages/partidos-posiciones/partidos-posiciones.component'
          ).then((m) => m.PartidosPosicionesComponent),
        title: 'FJH - Agenda, Partidos & Posiciones del Club',
      },
      {
        path: 'jugadores',
        loadComponent: () =>
          import(
            './features/club-admin/pages/jugadores-plantilla/jugadores-plantilla.component'
          ).then((m) => m.JugadoresPlantillaComponent),
        title: 'FJH - Gestión de Plantilla del Club',
      },
      {
        path: 'resoluciones',
        loadComponent: () =>
          import(
            './features/club-admin/pages/resoluciones-club/resoluciones-club.component'
          ).then((m) => m.ResolucionesClubComponent),
        title: 'FJH - Resoluciones del Tribunal de Penas',
      },
      {
        path: 'mesa-ayuda',
        loadComponent: () =>
          import(
            './features/club-admin/pages/mesa-ayuda-club/mesa-ayuda-club.component'
          ).then((m) => m.MesaAyudaClubComponent),
        title: 'FJH - Mesa de Entradas & Soporte de Club',
      },
    ],
  },

  // Alias directos de conveniencia
  {
    path: 'torneos/crear',
    redirectTo: 'admin/torneos/crear',
    pathMatch: 'full',
  },
  {
    path: 'torneos/editar/:id',
    redirectTo: 'admin/torneos/editar/:id',
    pathMatch: 'full',
  },
  {
    path: 'torneos/gestionar/:id',
    redirectTo: 'admin/torneos/gestionar/:id',
    pathMatch: 'full',
  },
  {
    path: 'torneos',
    redirectTo: 'admin/torneos',
    pathMatch: 'full',
  },
  {
    path: 'clubes/crear',
    redirectTo: 'admin/clubes/crear',
    pathMatch: 'full',
  },
  {
    path: 'clubes',
    redirectTo: 'admin/clubes/crear',
    pathMatch: 'full',
  },
  {
    path: 'jugadores/crear',
    redirectTo: 'admin/jugadores/crear',
    pathMatch: 'full',
  },
  {
    path: 'jugadores/editar/:id',
    redirectTo: 'admin/jugadores/editar/:id',
    pathMatch: 'full',
  },
  {
    path: 'jugadores',
    redirectTo: 'admin/jugadores',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    redirectTo: 'admin/jugadores',
    pathMatch: 'full',
  },

  {
    path: '404',
    loadComponent: () =>
      import('./features/public/pages/not-found/not-found.component').then((m) => m.NotFoundComponent),
    title: 'FJH - Página no encontrada',
  },
  { path: '**', redirectTo: '404' },
];
