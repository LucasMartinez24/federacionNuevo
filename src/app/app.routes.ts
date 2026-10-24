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
        path: 'dashboard',
        redirectTo: 'jugadores',
        pathMatch: 'full',
      },
    ],
  },

  // Alias directos de conveniencia
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

  { path: '**', redirectTo: '' },
];
