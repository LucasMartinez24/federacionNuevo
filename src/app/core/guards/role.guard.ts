import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../navigation/navigation.types';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const expectedRoles = (route.data?.['roles'] as UserRole[]) || [];
  const currentUser = authService.getCurrentUser();

  if (!currentUser) {
    router.navigate(['/login']);
    return false;
  }

  if (expectedRoles.length === 0 || expectedRoles.includes(currentUser.role)) {
    return true;
  }

  // Si no tiene el rol, redirigir al inicio o dashboard
  router.navigate(['/']);
  return false;
};
