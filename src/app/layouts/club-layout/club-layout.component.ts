import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ClubesService } from '../../core/services/clubes.service';
import { SancionesService } from '../../core/services/sanciones.service';
import { TicketsService } from '../../core/services/tickets.service';

interface ClubNavGroup {
  label: string;
  items: Array<{
    label: string;
    route: string;
    icon: string;
    badge?: string;
    badgeTone?: 'info' | 'warning' | 'live';
  }>;
}

@Component({
  selector: 'app-club-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './club-layout.component.html',
  styleUrl: './club-layout.component.css',
})
export class ClubLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly clubesService = inject(ClubesService);
  private readonly sancionesService = inject(SancionesService);
  private readonly ticketsService = inject(TicketsService);
  private readonly router = inject(Router);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly clubLogoUrl = signal<string | null>(null);
  protected readonly sidebarOpen = signal<boolean>(false);
  protected readonly notificationsOpen = signal<boolean>(false);
  protected readonly activeSanctionsCount = signal<number>(0);
  protected readonly openTicketsCount = signal<number>(0);

  // Registro de errores de carga de logos para fallback automático a iniciales
  private readonly logoErrorIds = signal<Set<string | number>>(new Set());

  ngOnInit(): void {
    const u = this.currentUser();
    if (u?.logoUrl) {
      this.clubLogoUrl.set(u.logoUrl);
    } else if (u?.id) {
      // Si el token almacenado previamente en localStorage no traía el logo, cargarlo desde el API
      this.clubesService
        .getClub(u.id)
        .pipe(catchError(() => of(null)))
        .subscribe((club) => {
          if (club?.logoUrl) {
            this.clubLogoUrl.set(club.logoUrl);
          }
        });
    }

    if (u?.id) {
      this.ticketsService
        .getTickets(u.id)
        .pipe(catchError(() => of([])))
        .subscribe((tickets) => {
          const open = (tickets || []).filter((t) => t.status !== 'Resuelto' && t.status !== 'Cerrado').length;
          this.openTicketsCount.set(open);
        });

      this.sancionesService
        .getSanciones()
        .pipe(catchError(() => of([])))
        .subscribe((sanciones) => {
          const nom = (u.nombre || '').toLowerCase();
          const sig = (u.siglas || '').toLowerCase();
          const mine = (sanciones || []).filter((s) => {
            const matchClub =
              (s.clubId && s.clubId === u.id) ||
              (nom && (s.institucion || '').toLowerCase().includes(nom)) ||
              (sig && (s.institucion || '').toLowerCase().includes(sig));
            const isActive = s.totales === 0 || (s.cumplidas ?? 0) < (s.totales ?? 1);
            return matchClub && isActive;
          });
          this.activeSanctionsCount.set(mine.length);
        });
    }
  }

  protected readonly clubLogo = computed(() => {
    return this.clubLogoUrl() || this.currentUser()?.logoUrl || null;
  });

  protected readonly clubName = computed(() => {
    const u = this.currentUser();
    return u?.siglas || u?.nombre || u?.username || 'Club Afiliado';
  });

  protected readonly delegateName = computed(() => {
    const u = this.currentUser();
    return u?.nombre || u?.username || 'Delegado Oficial';
  });

  protected readonly initials = computed(() => {
    const name = this.clubName();
    return name.substring(0, 3).toUpperCase();
  });

  protected readonly navGroups: ClubNavGroup[] = [
    {
      label: 'Competición & Torneo',
      items: [
        {
          label: 'Partidos & Posiciones',
          route: '/club/fixture',
          icon: 'sports_handball',
          badge: 'Oficial',
          badgeTone: 'info',
        },
        {
          label: 'Calendario Oficial',
          route: '/club/calendario',
          icon: 'calendar_month',
        },
        {
          label: 'Plantilla de Jugadores',
          route: '/club/jugadores',
          icon: 'groups',
        },
      ],
    },
    {
      label: 'Área Institucional',
      items: [
        {
          label: 'Resoluciones & Sanciones',
          route: '/club/resoluciones',
          icon: 'gavel',
        },
        {
          label: 'Mesa de Entradas & Tickets',
          route: '/club/mesa-ayuda',
          icon: 'support_agent',
        },
      ],
    },
  ];

  getClubLogoUrl(logoUrl: string | null | undefined): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }
    return `${environment.serverUrl}${logoUrl}`;
  }

  hasValidLogo(club: { id?: string | number; logoUrl?: string | null } | null | undefined): boolean {
    const url = this.clubLogo();
    if (!url) return false;
    const idKey = club?.id ?? 'current';
    return !this.logoErrorIds().has(idKey);
  }

  onClubLogoError(clubId?: string | number): void {
    const idKey = clubId ?? 'current';
    this.logoErrorIds.update(set => {
      const next = new Set(set);
      next.add(idKey);
      return next;
    });
  }

  getClubInitials(club: { siglas?: string; nombre?: string; username?: string } | null | undefined): string {
    const text = club?.siglas || club?.nombre || club?.username || 'CLB';
    return text.substring(0, 3).toUpperCase();
  }

  protected openSidebar(): void {
    this.sidebarOpen.set(true);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  protected toggleNotifications(): void {
    this.notificationsOpen.update(v => !v);
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
