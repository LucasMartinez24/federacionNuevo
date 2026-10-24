import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NavigationService } from '../../core/navigation/navigation.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-federation-layout',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './federation-layout.component.html',
  styleUrl: './federation-layout.component.css',
})
export class FederationLayoutComponent {
  private readonly navigationService = inject(NavigationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Estado del Sidebar (móvil y colapso)
  protected readonly sidebarOpen = signal(false);
  protected readonly sidebarCollapsed = signal(false);

  // Usuario actual
  protected readonly currentUser = this.authService.currentUser;
  protected readonly userRole = this.authService.role;
  protected readonly userName = computed(() => {
    const u = this.currentUser();
    return u?.nombre || u?.username || 'Oficial FJH';
  });

  protected readonly roleDisplay = computed(() => {
    const r = this.userRole();
    switch (r) {
      case 'admin':
        return 'Administrador General';
      case 'REP_FEDERACION':
        return 'Representante FJH';
      case 'OFICIAL_MESA':
        return 'Oficial de Mesa';
      case 'JEFE_ARBITROS':
        return 'Colegio de Árbitros';
      case 'CM':
        return 'Prensa & Difusión';
      default:
        return 'Staff Federativo';
    }
  });

  // Navegación según rol
  protected readonly navGroups = computed(() => {
    const role = this.userRole() || 'REP_FEDERACION';
    return this.navigationService.getNavigationForRole(role);
  });

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected closeMobileSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
