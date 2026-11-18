import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    const role = authService.role();
    if (role === 'CM') {
      // El Community Manager únicamente tiene acceso a la Galería Multimedia
      if (!state.url.startsWith('/admin/galeria') && !state.url.startsWith('/galeria')) {
        router.navigate(['/admin/galeria']);
        return false;
      }
      return true;
    }

    if (role === 'user') {
      // Los clubes operan exclusivamente dentro de /club/* y no acceden a /admin/*
      if (state.url.startsWith('/admin')) {
        router.navigate(['/club/fixture']);
        return false;
      }
      return true;
    }

    // El personal de la Federación opera en /admin/* y no accede a /club/*
    if (state.url.startsWith('/club')) {
      router.navigate(['/admin/jugadores']);
      return false;
    }

    return true;
  }

  router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
};
