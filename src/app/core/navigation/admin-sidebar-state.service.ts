import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { forkJoin, interval, Observable, of } from 'rxjs';
import { catchError, startWith, switchMap } from 'rxjs/operators';
import { PartidoItem, PartidosService } from '../services/partidos.service';
import { JugadoresService } from '../services/jugadores.service';
import { SancionesService } from '../services/sanciones.service';
import { TicketsService } from '../services/tickets.service';
import { TorneosService } from '../services/torneos.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface AdminSidebarState {
  totalAthletes: number | null;
  pendingAthletes: number | null;
  activeResolutions: number | null;
  liveMatches: number | null;
  pendingFiles: number | null;
  totalTournaments: number | null;
}

export interface AdminNotification {
  id: string;
  type: 'live' | 'athlete' | 'resolution' | 'tournament';
  title: string;
  message: string;
  time: string;
  route: string;
  icon: string;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminSidebarStateService {
  private readonly jugadoresService = inject(JugadoresService);
  private readonly sancionesService = inject(SancionesService);
  private readonly torneosService = inject(TorneosService);
  private readonly partidosService = inject(PartidosService);
  private readonly ticketsService = inject(TicketsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<AdminSidebarState>({
    totalAthletes: null,
    pendingAthletes: null,
    activeResolutions: null,
    liveMatches: null,
    pendingFiles: null,
    totalTournaments: null,
  });

  readonly notifications = signal<AdminNotification[]>([]);

  constructor() {
    // Polling reactivo cada 15 segundos para mantener actualizado el sidebar y las notificaciones en tiempo real
    interval(15_000)
      .pipe(
        startWith(0),
        switchMap(() =>
          forkJoin({
            athletes: this.jugadoresService.getJugadores().pipe(catchError(() => of(null))),
            resolutions: this.sancionesService.getSanciones().pipe(catchError(() => of(null))),
            tournaments: this.torneosService.getTorneos().pipe(catchError(() => of(null))),
            tickets: this.ticketsService.getTickets().pipe(catchError(() => of(null))),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ athletes, resolutions, tournaments, tickets }) => {
        const liveMatches$: Observable<PartidoItem[][] | null> = tournaments && tournaments.length > 0
          ? forkJoin(
              tournaments.map((torneo) =>
                this.partidosService
                  .getFixtureByTorneo(torneo.id)
                  .pipe(catchError(() => of([] as PartidoItem[]))),
              ),
            )
          : of(null);

        liveMatches$.subscribe((fixtures: PartidoItem[][] | null) => {
          const matches: PartidoItem[] = fixtures?.flat() || [];
          const pendingAthletesCount = athletes ? athletes.filter((j) => j.estado === 'Pendiente').length : 0;
          const activeResolutionsCount = resolutions
            ? resolutions.filter((s) => Number(s.totales) === 0 || Number(s.cumplidas) < Number(s.totales)).length
            : 0;
          const liveMatchesCount = fixtures ? matches.filter((p) => this.isLiveStatus(p.estado)).length : 0;
          const openTicketsCount = tickets
            ? tickets.filter((t) => t.status !== 'Resuelto' && t.status !== 'Cerrado').length
            : 0;

          this.state.set({
            totalAthletes: athletes ? athletes.length : null,
            pendingAthletes: pendingAthletesCount,
            activeResolutions: activeResolutionsCount,
            liveMatches: liveMatchesCount,
            pendingFiles: openTicketsCount,
            totalTournaments: tournaments ? tournaments.length : null,
          });

          // Actualizar notificaciones inteligentes
          this.generarNotificaciones({
            pendingAthletes: pendingAthletesCount,
            activeResolutions: activeResolutionsCount,
            liveMatches: liveMatchesCount,
            pendingFiles: openTicketsCount,
            athletesList: athletes || [],
            matchesList: matches,
          });
        });
      });
  }

  public markAsRead(id: string): void {
    this.notifications.update((list) =>
      list.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  public markAllAsRead(): void {
    this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
  }

  public reload(): void {
    // Dispara una actualización manual inmediata
    forkJoin({
      athletes: this.jugadoresService.getJugadores().pipe(catchError(() => of(null))),
      resolutions: this.sancionesService.getSanciones().pipe(catchError(() => of(null))),
      tournaments: this.torneosService.getTorneos().pipe(catchError(() => of(null))),
      tickets: this.ticketsService.getTickets().pipe(catchError(() => of(null))),
    }).subscribe(({ athletes, resolutions, tournaments, tickets }) => {
      if (tournaments) {
        forkJoin(
          tournaments.map((t) =>
            this.partidosService.getFixtureByTorneo(t.id).pipe(catchError(() => of([]))),
          ),
        ).subscribe((fixtures) => {
          const matches = fixtures.flat();
          const pAthletes = athletes ? athletes.filter((j) => j.estado === 'Pendiente').length : 0;
          const aRes = resolutions ? resolutions.filter((s) => Number(s.totales) === 0 || Number(s.cumplidas) < Number(s.totales)).length : 0;
          const lMat = matches.filter((p) => this.isLiveStatus(p.estado)).length;
          const openTickets = tickets ? tickets.filter((t) => t.status !== 'Resuelto' && t.status !== 'Cerrado').length : 0;

          this.state.set({
            totalAthletes: athletes ? athletes.length : null,
            pendingAthletes: pAthletes,
            activeResolutions: aRes,
            liveMatches: lMat,
            pendingFiles: openTickets,
            totalTournaments: tournaments.length,
          });
        });
      }
    });
  }

  private generarNotificaciones(data: {
    pendingAthletes: number;
    activeResolutions: number;
    liveMatches: number;
    pendingFiles: number;
    athletesList: any[];
    matchesList: PartidoItem[];
  }): void {
    const notifs: AdminNotification[] = [];

    // 1. Partidos en vivo
    if (data.liveMatches > 0) {
      const liveList = data.matchesList.filter((m) => this.isLiveStatus(m.estado));
      const firstLive = liveList[0];
      notifs.push({
        id: 'notif-live',
        type: 'live',
        title: `${data.liveMatches} Partido(s) En Vivo`,
        message: firstLive
          ? `${firstLive.local?.nombre || 'Local'} vs ${firstLive.visitante?.nombre || 'Visita'} en juego.`
          : 'Hay encuentros disputándose en este momento.',
        time: 'Ahora',
        route: '/admin/fixture',
        icon: 'sensors',
        read: false,
      });
    }

    // 2. Fichas de Jugadores pendientes
    if (data.pendingAthletes > 0) {
      notifs.push({
        id: 'notif-athletes-pending',
        type: 'athlete',
        title: `${data.pendingAthletes} Atleta(s) por auditar`,
        message: 'Nuevas inscripciones de jugadores requieren aprobación federativa.',
        time: 'Hoy',
        route: '/admin/jugadores',
        icon: 'badge',
        read: false,
      });
    }

    // 3. Consultas / Tickets pendientes en Soporte
    if (data.pendingFiles > 0) {
      notifs.push({
        id: 'notif-files-pending',
        type: 'athlete',
        title: 'Soporte & Mesa de Entradas',
        message: `${data.pendingFiles} consulta(s) o expediente(s) de clubes pendientes de respuesta.`,
        time: 'Atención',
        route: '/admin/soporte',
        icon: 'support_agent',
        read: false,
      });
    }

    // 4. Resoluciones activas en Tribunal
    if (data.activeResolutions > 0) {
      notifs.push({
        id: 'notif-resolutions',
        type: 'resolution',
        title: 'Tribunal de Penas',
        message: `${data.activeResolutions} sanción(es) disciplinarias vigentes en curso.`,
        time: 'Vigente',
        route: '/admin/boletin-resoluciones',
        icon: 'gavel',
        read: false,
      });
    }

    // Si no hay alertas críticas, incluir notificación de estado normal
    if (notifs.length === 0) {
      notifs.push({
        id: 'notif-status-ok',
        type: 'tournament',
        title: 'Sistema FJH Sincronizado',
        message: 'Todas las planillas y padrones federativos se encuentran al día.',
        time: 'Reciente',
        route: '/admin/torneos',
        icon: 'verified',
        read: true,
      });
    }

    this.notifications.set(notifs);
  }

  private isLiveStatus(status?: string): boolean {
    const normalized = status?.toLowerCase().trim();
    return normalized === 'en vivo' || normalized === 'en disputa';
  }
}
