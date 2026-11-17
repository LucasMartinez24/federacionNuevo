import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NavigationService } from '../../core/navigation/navigation.service';
import { AuthService } from '../../core/services/auth.service';
import {
  AdminNotification,
  AdminSidebarState,
  AdminSidebarStateService,
} from '../../core/navigation/admin-sidebar-state.service';

@Component({
  selector: 'app-federation-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './federation-layout.component.html',
  styleUrl: './federation-layout.component.css',
})
export class FederationLayoutComponent {
  private readonly navigationService = inject(NavigationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly sidebarStateService = inject(AdminSidebarStateService);

  // Estado del Sidebar (móvil y colapso)
  protected readonly sidebarOpen = signal(false);
  protected readonly sidebarCollapsed = signal(false);

  // Menú desplegable de notificaciones
  protected readonly notificationsOpen = signal(false);

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
      case 'ARBITRO':
        return 'Árbitro Oficial';
      case 'CM':
        return 'Prensa & Difusión';
      default:
        return 'Club Afiliado / Delegado';
    }
  });

  // Notificaciones reactivas y contador no leídas
  protected readonly notifications = computed<AdminNotification[]>(() => {
    if (this.userRole() === 'CM') {
      return [
        {
          id: 'notif-cm-gallery',
          type: 'tournament',
          title: 'Prensa & Galería FJH',
          message: 'Módulo de carga y gestión de álbumes fotográficos activo.',
          time: 'Activo',
          route: '/admin/galeria',
          icon: 'photo_library',
          read: true,
        },
      ];
    }
    return this.sidebarStateService.notifications();
  });
  protected readonly unreadNotificationsCount = computed(() =>
    this.notifications().filter((n) => !n.read).length
  );

  // Navegación según rol con badges 100% dinámicos
  protected readonly navGroups = computed(() => {
    const role = this.userRole() || 'REP_FEDERACION';
    const state = this.sidebarStateService.state();
    return this.navigationService.getNavigationForRole(role).map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        badge: this.getDynamicBadge(item.route, item.label, state) ?? item.badge,
        badgeTone: this.getDynamicBadgeTone(item.route, item.label, state) ?? item.badgeTone,
      })),
    }));
  });

  private getDynamicBadge(
    route: string,
    label: string,
    state: AdminSidebarState,
  ): string | undefined {
    if (route === '/admin/jugadores') {
      if (state.pendingAthletes !== null && state.pendingAthletes > 0) {
        return `${state.pendingAthletes} pend.`;
      }
      return state.totalAthletes !== null ? `${state.totalAthletes} atletas` : undefined;
    }
    if (route === '/admin/fixture') {
      return state.liveMatches !== null && state.liveMatches > 0
        ? `${state.liveMatches} LIVE`
        : undefined;
    }
    if (route === '/admin/torneos') {
      return state.totalTournaments !== null ? `${state.totalTournaments} activos` : '2026';
    }
    if (route === '/boletin-resoluciones' || route === '/admin/boletin-resoluciones') {
      return state.activeResolutions !== null && state.activeResolutions > 0
        ? `${state.activeResolutions} vigentes`
        : undefined;
    }
    if (route === '/soporte' || route === '/admin/soporte') {
      return state.pendingFiles !== null && state.pendingFiles > 0
        ? `${state.pendingFiles} pend.`
        : undefined;
    }
    return undefined;
  }

  private getDynamicBadgeTone(
    route: string,
    label: string,
    state: AdminSidebarState,
  ): 'info' | 'warning' | 'live' | 'accent' | undefined {
    if (route === '/admin/fixture' && state.liveMatches && state.liveMatches > 0) {
      return 'live';
    }
    if (route === '/admin/jugadores' && state.pendingAthletes && state.pendingAthletes > 0) {
      return 'warning';
    }
    if ((route === '/soporte' || route === '/admin/soporte') && state.pendingFiles && state.pendingFiles > 0) {
      return 'warning';
    }
    return undefined;
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  protected closeMobileSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected toggleNotifications(): void {
    this.notificationsOpen.update((open) => !open);
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  protected markNotificationAsRead(notif: AdminNotification): void {
    this.sidebarStateService.markAsRead(notif.id);
    this.closeNotifications();
    this.router.navigateByUrl(notif.route);
  }

  protected markAllNotificationsRead(): void {
    this.sidebarStateService.markAllAsRead();
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
