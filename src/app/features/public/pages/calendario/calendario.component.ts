import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import {
  CalendarioEventosService,
  EventoCalendarioFJH,
  TipoEventoCalendario,
} from '../../../../core/services/calendario-eventos.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { PartidosService } from '../../../../core/services/partidos.service';
import { Torneo, TorneosService } from '../../../../core/services/torneos.service';
import { PublicNavbarComponent } from '../../../../shared/components/public-navbar/public-navbar.component';

export interface CalendarioMatchItem {
  id: string;
  torneoId: string;
  torneoNombre: string;
  categoria: string;
  rama: string;
  jornada: number;
  fase: string;
  fechaISO: string | null; // YYYY-MM-DD
  hora: string;
  lugar: string;
  estado: string;
  localId: string;
  visitanteId: string;
  localNombre: string;
  localSiglas: string;
  localLogo: string | null;
  visitanteNombre: string;
  visitanteSiglas: string;
  visitanteLogo: string | null;
  golesLocal: number | null;
  golesVisitante: number | null;
  arbitro1: string;
  arbitro2: string;
  cronometrista: string;
  observaciones: string;
}

export interface CalendarDayCell {
  dateISO: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  matches: CalendarioMatchItem[];
  events: EventoCalendarioFJH[];
  hasLiveMatch: boolean;
}

@Component({
  selector: 'app-calendario',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PublicNavbarComponent],
  templateUrl: './calendario.component.html',
  styleUrl: './calendario.component.css',
})
export class CalendarioComponent implements OnInit {
  private readonly torneosService = inject(TorneosService);
  private readonly partidosService = inject(PartidosService);
  private readonly clubesService = inject(ClubesService);
  private readonly eventosService = inject(CalendarioEventosService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Datos principales
  protected readonly torneos = signal<Torneo[]>([]);
  protected readonly clubes = signal<Club[]>([]);
  protected readonly allMatches = signal<CalendarioMatchItem[]>([]);
  protected readonly institutionalEvents = signal<EventoCalendarioFJH[]>([]);
  protected readonly loading = signal<boolean>(true);

  // Estado del Calendario (Mes actual, Día seleccionado, Modo de vista)
  protected readonly currentYear = signal<number>(new Date().getFullYear());
  protected readonly currentMonth = signal<number>(new Date().getMonth()); // 0 - 11
  protected readonly selectedDateISO = signal<string>(this.toISODate(new Date()));
  protected readonly viewMode = signal<'mes' | 'agenda'>('mes');

  // Filtros
  protected readonly selectedTorneoId = signal<string>('ALL');
  protected readonly selectedCategoria = signal<string>('ALL');
  protected readonly selectedClubId = signal<string>('ALL');
  protected readonly selectedSede = signal<string>('ALL');
  protected readonly filterOnlyMyClub = signal<boolean>(false);
  protected readonly searchQuery = signal<string>('');

  // Panel Admin: Bandeja de partidos sin fecha asignada
  protected readonly showUnscheduledDrawer = signal<boolean>(false);

  // Modal Admin: Reprogramar / Editar Partido
  protected readonly editingMatch = signal<CalendarioMatchItem | null>(null);
  protected readonly editMatchFecha = signal<string>('');
  protected readonly editMatchHora = signal<string>('15:00');
  protected readonly editMatchLugar = signal<string>('');
  protected readonly editMatchArbitro1 = signal<string>('');
  protected readonly editMatchArbitro2 = signal<string>('');
  protected readonly editMatchCronometrista = signal<string>('');
  protected readonly editMatchEstado = signal<string>('Programado');
  protected readonly isSavingMatch = signal<boolean>(false);

  // Modal Admin: Nuevo Evento / Hito Institucional FJH
  protected readonly showEventModal = signal<boolean>(false);
  protected readonly newEventTitulo = signal<string>('');
  protected readonly newEventFecha = signal<string>('');
  protected readonly newEventHora = signal<string>('19:00');
  protected readonly newEventSede = signal<string>('Sede Central FJH • San Salvador de Jujuy');
  protected readonly newEventTipo = signal<TipoEventoCalendario>('institucional');
  protected readonly newEventDescripcion = signal<string>('');
  protected readonly newEventDestacado = signal<boolean>(true);
  protected readonly isSavingEvent = signal<boolean>(false);

  // Toast en primer plano (z-[9999])
  protected readonly toastMessage = signal<string | null>(null);
  protected readonly toastType = signal<'success' | 'error' | 'info'>('success');

  private readonly logoErrors = signal<Set<string>>(new Set());

  protected readonly diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  protected readonly nombresMeses = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  // Contexto de Usuario y Layout
  protected readonly currentUser = this.authService.currentUser;
  protected readonly userRole = this.authService.role;

  protected readonly isEmbeddedInLayout = computed(() => {
    const url = this.router.url;
    return url.startsWith('/admin') || url.startsWith('/club');
  });

  protected readonly isAdmin = computed(() => {
    const r = this.userRole();
    return r === 'admin' || r === 'REP_FEDERACION' || r === 'JEFE_ARBITROS' || r === 'OFICIAL_MESA';
  });

  protected readonly isClubUser = computed(() => {
    const r = this.userRole();
    return r === 'user' || this.router.url.startsWith('/club');
  });

  protected readonly currentClubName = computed(() => {
    const u = this.currentUser();
    return u?.nombre || u?.siglas || 'Mi Club';
  });

  // Listas de opciones dinámicas para filtros
  protected readonly categoriasDisponibles = computed(() => {
    const set = new Set<string>();
    this.torneos().forEach((t) => {
      if (t.categoria) set.add(t.categoria);
    });
    this.allMatches().forEach((m) => {
      if (m.categoria) set.add(m.categoria);
    });
    return Array.from(set);
  });

  protected readonly sedesDisponibles = computed(() => {
    const set = new Set<string>([
      'Polideportivo Cuyaya',
      'Club Atlético Gorriti',
      'Club Sportivo Rivadavia',
      'Complejo Sandoval',
      'Federación Jujeña de Básquet',
    ]);
    this.allMatches().forEach((m) => {
      if (m.lugar && m.lugar.trim()) set.add(m.lugar.trim());
    });
    return Array.from(set);
  });

  // Partidos filtrados según criterios activos
  protected readonly filteredMatches = computed(() => {
    const list = this.allMatches();
    const tid = this.selectedTorneoId();
    const cat = this.selectedCategoria();
    const cid = this.selectedClubId();
    const sede = this.selectedSede();
    const onlyMine = this.filterOnlyMyClub();
    const myClubId = this.currentUser()?.id || '';
    const myClubName = (this.currentUser()?.nombre || '').toLowerCase().trim();
    const query = this.searchQuery().toLowerCase().trim();

    return list.filter((m) => {
      if (tid !== 'ALL' && m.torneoId !== tid) return false;
      if (cat !== 'ALL' && m.categoria !== cat) return false;
      if (sede !== 'ALL' && m.lugar !== sede) return false;

      if (onlyMine && myClubId) {
        const matchById = m.localId === myClubId || m.visitanteId === myClubId;
        const matchByName =
          myClubName &&
          (m.localNombre.toLowerCase().includes(myClubName) ||
            m.visitanteNombre.toLowerCase().includes(myClubName));
        if (!matchById && !matchByName) return false;
      } else if (cid !== 'ALL') {
        const targetClub = this.clubes().find((c) => c.id === cid);
        const targetName = (targetClub?.nombre || '').toLowerCase().trim();
        const matchId = m.localId === cid || m.visitanteId === cid;
        const matchName =
          targetName &&
          (m.localNombre.toLowerCase().includes(targetName) ||
            m.visitanteNombre.toLowerCase().includes(targetName));
        if (!matchId && !matchName) return false;
      }

      if (query) {
        const hay = `${m.localNombre} ${m.visitanteNombre} ${m.torneoNombre} ${m.categoria} ${m.lugar} ${m.fase}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }

      return true;
    });
  });

  // Partidos con fecha programada vs pendientes de fecha
  protected readonly scheduledMatches = computed(() =>
    this.filteredMatches().filter((m) => Boolean(m.fechaISO))
  );

  protected readonly unscheduledMatches = computed(() =>
    this.filteredMatches().filter((m) => !m.fechaISO)
  );

  // Próximo partido del Club logueado
  protected readonly nextClubMatch = computed(() => {
    if (!this.isClubUser()) return null;
    const myId = this.currentUser()?.id || '';
    const myName = (this.currentUser()?.nombre || '').toLowerCase().trim();
    const todayISO = this.toISODate(new Date());

    const upcoming = this.allMatches()
      .filter((m) => {
        const isMine =
          m.localId === myId ||
          m.visitanteId === myId ||
          (myName &&
            (m.localNombre.toLowerCase().includes(myName) ||
              m.visitanteNombre.toLowerCase().includes(myName)));
        return isMine && m.estado !== 'Finalizado' && (!m.fechaISO || m.fechaISO >= todayISO);
      })
      .sort((a, b) => (a.fechaISO || '9999-99-99').localeCompare(b.fechaISO || '9999-99-99'));

    return upcoming[0] || null;
  });

  // Construcción de la Grilla Mensual de 42 celdas (Lunes a Domingo)
  protected readonly calendarGrid = computed<CalendarDayCell[]>(() => {
    const year = this.currentYear();
    const month = this.currentMonth();
    const todayISO = this.toISODate(new Date());

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Ajustar para que la semana comience en Lunes (0 = Lun, ..., 6 = Dom)
    const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = lastDayOfMonth.getDate();

    const matchesByDate = new Map<string, CalendarioMatchItem[]>();
    for (const m of this.scheduledMatches()) {
      if (!m.fechaISO) continue;
      const arr = matchesByDate.get(m.fechaISO) || [];
      arr.push(m);
      matchesByDate.set(m.fechaISO, arr);
    }

    const eventsByDate = new Map<string, EventoCalendarioFJH[]>();
    for (const ev of this.institutionalEvents()) {
      if (!ev.fecha) continue;
      const arr = eventsByDate.get(ev.fecha) || [];
      arr.push(ev);
      eventsByDate.set(ev.fecha, arr);
    }

    const cells: CalendarDayCell[] = [];

    // Días del mes anterior para completar la primera semana
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const iso = this.toISODate(d);
      const dayMatches = matchesByDate.get(iso) || [];
      const wd = (d.getDay() + 6) % 7;
      cells.push({
        dateISO: iso,
        dayNumber: d.getDate(),
        isCurrentMonth: false,
        isToday: iso === todayISO,
        isWeekend: wd >= 5,
        matches: dayMatches,
        events: eventsByDate.get(iso) || [],
        hasLiveMatch: dayMatches.some((m) => this.isLive(m.estado)),
      });
    }

    // Días del mes actual
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const iso = this.toISODate(d);
      const dayMatches = matchesByDate.get(iso) || [];
      const wd = (d.getDay() + 6) % 7;
      cells.push({
        dateISO: iso,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: iso === todayISO,
        isWeekend: wd >= 5,
        matches: dayMatches,
        events: eventsByDate.get(iso) || [],
        hasLiveMatch: dayMatches.some((m) => this.isLive(m.estado)),
      });
    }

    // Días del mes siguiente hasta completar 35 o 42 celdas
    const totalCells = cells.length <= 35 ? 35 : 42;
    let nextDay = 1;
    while (cells.length < totalCells) {
      const d = new Date(year, month + 1, nextDay++);
      const iso = this.toISODate(d);
      const dayMatches = matchesByDate.get(iso) || [];
      const wd = (d.getDay() + 6) % 7;
      cells.push({
        dateISO: iso,
        dayNumber: d.getDate(),
        isCurrentMonth: false,
        isToday: iso === todayISO,
        isWeekend: wd >= 5,
        matches: dayMatches,
        events: eventsByDate.get(iso) || [],
        hasLiveMatch: dayMatches.some((m) => this.isLive(m.estado)),
      });
    }

    return cells;
  });

  // Partidos y Eventos del Día Seleccionado (Inspector Lateral)
  protected readonly selectedDayMatches = computed(() => {
    const iso = this.selectedDateISO();
    return this.scheduledMatches()
      .filter((m) => m.fechaISO === iso)
      .sort((a, b) => a.hora.localeCompare(b.hora));
  });

  protected readonly selectedDayEvents = computed(() => {
    const iso = this.selectedDateISO();
    return this.institutionalEvents().filter((e) => e.fecha === iso);
  });

  // Agrupación Cronológica para Vista Agenda
  protected readonly agendaGroups = computed(() => {
    const year = this.currentYear();
    const month = this.currentMonth();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    const datesSet = new Set<string>();
    this.scheduledMatches().forEach((m) => {
      if (m.fechaISO && m.fechaISO.startsWith(prefix)) datesSet.add(m.fechaISO);
    });
    this.institutionalEvents().forEach((e) => {
      if (e.fecha && e.fecha.startsWith(prefix)) datesSet.add(e.fecha);
    });

    const sortedDates = Array.from(datesSet).sort();
    return sortedDates.map((dateISO) => ({
      dateISO,
      label: this.formatFullDateLabel(dateISO),
      matches: this.scheduledMatches()
        .filter((m) => m.fechaISO === dateISO)
        .sort((a, b) => a.hora.localeCompare(b.hora)),
      events: this.institutionalEvents().filter((e) => e.fecha === dateISO),
    }));
  });

  // Contadores de Telemetría del Mes Activo
  protected readonly monthMatchesCount = computed(() => {
    const prefix = `${this.currentYear()}-${String(this.currentMonth() + 1).padStart(2, '0')}`;
    return this.scheduledMatches().filter((m) => m.fechaISO?.startsWith(prefix)).length;
  });

  protected readonly monthEventsCount = computed(() => {
    const prefix = `${this.currentYear()}-${String(this.currentMonth() + 1).padStart(2, '0')}`;
    return this.institutionalEvents().filter((e) => e.fecha?.startsWith(prefix)).length;
  });

  ngOnInit(): void {
    if (this.isClubUser()) {
      this.filterOnlyMyClub.set(true);
    }
    this.cargarCalendario();
  }

  cargarCalendario(): void {
    this.loading.set(true);

    forkJoin({
      torneos: this.torneosService.getTorneos().pipe(catchError(() => of([] as Torneo[]))),
      clubes: this.clubesService.getClubes().pipe(catchError(() => of([] as Club[]))),
      eventos: this.eventosService.getEventos().pipe(catchError(() => of([] as EventoCalendarioFJH[]))),
    }).subscribe({
      next: ({ torneos, clubes, eventos }) => {
        this.torneos.set(torneos || []);
        this.clubes.set((clubes || []).filter((c) => !c.esInvitado));
        this.institutionalEvents.set(eventos || []);

        if (!torneos || torneos.length === 0) {
          this.allMatches.set([]);
          this.loading.set(false);
          return;
        }

        const requests: Observable<any[]>[] = torneos.map((t) =>
          this.partidosService.getFixtureByTorneo(t.id).pipe(catchError(() => of([])))
        );

        forkJoin(requests).subscribe({
          next: (fixturesPerTorneo) => {
            const unified: CalendarioMatchItem[] = [];

            torneos.forEach((torneo, idx) => {
              const rawMatches = fixturesPerTorneo[idx] || [];
              rawMatches.forEach((p: any) => {
                const parsedDate = this.extractDateAndTime(p.fecha, p.hora);
                unified.push({
                  id: p.id,
                  torneoId: torneo.id,
                  torneoNombre: torneo.nombre,
                  categoria: torneo.categoria || 'Primera División',
                  rama: torneo.rama || 'Masculino',
                  jornada: p.jornada || 1,
                  fase: p.fase || `Fecha ${p.jornada || 1}`,
                  fechaISO: parsedDate.dateISO,
                  hora: parsedDate.hora,
                  lugar: p.lugar || 'Sede a confirmar',
                  estado: p.estado || 'Programado',
                  localId: p.localId,
                  visitanteId: p.visitanteId,
                  localNombre: p.local?.nombre || 'Local',
                  localSiglas: p.local?.siglas || this.getInitials(p.local?.nombre),
                  localLogo: p.local?.logoUrl || null,
                  visitanteNombre: p.visitante?.nombre || 'Visitante',
                  visitanteSiglas: p.visitante?.siglas || this.getInitials(p.visitante?.nombre),
                  visitanteLogo: p.visitante?.logoUrl || null,
                  golesLocal: p.golesLocal ?? null,
                  golesVisitante: p.golesVisitante ?? null,
                  arbitro1: p.arbitro1 || '',
                  arbitro2: p.arbitro2 || '',
                  cronometrista: p.cronometrista || '',
                  observaciones: p.observaciones || '',
                });
              });
            });

            this.allMatches.set(unified);
            this.loading.set(false);

            // Si el día de hoy no tiene eventos pero hay partidos programados en este mes, mantener hoy;
            // si hay un partido próximo, facilitar navegación
            const todayISO = this.toISODate(new Date());
            const hasToday = unified.some((m) => m.fechaISO === todayISO);
            if (!hasToday) {
              const prefix = `${this.currentYear()}-${String(this.currentMonth() + 1).padStart(2, '0')}`;
              const firstInMonth = unified
                .filter((m) => m.fechaISO?.startsWith(prefix))
                .sort((a, b) => (a.fechaISO || '').localeCompare(b.fechaISO || ''))[0];
              if (firstInMonth?.fechaISO) {
                this.selectedDateISO.set(firstInMonth.fechaISO);
              }
            }
          },
          error: () => {
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  // --- NAVEGACIÓN DE MESES ---

  mesAnterior(): void {
    if (this.currentMonth() === 0) {
      this.currentMonth.set(11);
      this.currentYear.update((y) => y - 1);
    } else {
      this.currentMonth.update((m) => m - 1);
    }
    this.sincronizarDiaSeleccionadoConMes();
  }

  mesSiguiente(): void {
    if (this.currentMonth() === 11) {
      this.currentMonth.set(0);
      this.currentYear.update((y) => y + 1);
    } else {
      this.currentMonth.update((m) => m + 1);
    }
    this.sincronizarDiaSeleccionadoConMes();
  }

  irAHoy(): void {
    const now = new Date();
    this.currentYear.set(now.getFullYear());
    this.currentMonth.set(now.getMonth());
    this.selectedDateISO.set(this.toISODate(now));
  }

  seleccionarDia(cell: CalendarDayCell): void {
    this.selectedDateISO.set(cell.dateISO);
    if (!cell.isCurrentMonth) {
      const [y, m] = cell.dateISO.split('-').map(Number);
      this.currentYear.set(y);
      this.currentMonth.set(m - 1);
    }
  }

  private sincronizarDiaSeleccionadoConMes(): void {
    const y = this.currentYear();
    const m = String(this.currentMonth() + 1).padStart(2, '0');
    this.selectedDateISO.set(`${y}-${m}-01`);
  }

  // --- FUNCIONES ADMIN: REPROGRAMAR / ASIGNAR FECHA A PARTIDOS ---

  abrirModalProgramarPartido(match: CalendarioMatchItem, defaultToSelectedDate = false): void {
    if (!this.isAdmin()) return;
    this.editingMatch.set(match);
    this.editMatchFecha.set(
      defaultToSelectedDate
        ? this.selectedDateISO()
        : match.fechaISO || this.selectedDateISO()
    );
    const cleanHora = (match.hora || '15:00').replace(/\s*hs$/i, '').trim();
    this.editMatchHora.set(/^\d{2}:\d{2}$/.test(cleanHora) ? cleanHora : '15:00');
    this.editMatchLugar.set(match.lugar && match.lugar !== 'Sede a confirmar' ? match.lugar : 'Polideportivo Cuyaya');
    this.editMatchArbitro1.set(match.arbitro1 || '');
    this.editMatchArbitro2.set(match.arbitro2 || '');
    this.editMatchCronometrista.set(match.cronometrista || '');
    this.editMatchEstado.set(match.estado || 'Programado');
  }

  cerrarModalProgramarPartido(): void {
    this.editingMatch.set(null);
  }

  guardarProgramacionPartido(): void {
    const target = this.editingMatch();
    if (!target) return;

    const fecha = this.editMatchFecha().trim();
    const hora = this.editMatchHora().trim() || '15:00';
    const lugar = this.editMatchLugar().trim() || 'Polideportivo Cuyaya';

    this.isSavingMatch.set(true);
    this.partidosService
      .updatePartido(target.id, {
        fecha: fecha || null,
        hora,
        lugar,
        estado: this.editMatchEstado(),
        arbitro1: this.editMatchArbitro1().trim(),
        arbitro2: this.editMatchArbitro2().trim(),
        cronometrista: this.editMatchCronometrista().trim(),
      })
      .subscribe({
        next: () => {
          this.isSavingMatch.set(false);
          this.editingMatch.set(null);

          const horaFormatted = `${hora} hs`;
          this.allMatches.update((list) =>
            list.map((m) =>
              m.id === target.id
                ? {
                    ...m,
                    fechaISO: fecha || null,
                    hora: horaFormatted,
                    lugar,
                    estado: this.editMatchEstado(),
                    arbitro1: this.editMatchArbitro1().trim(),
                    arbitro2: this.editMatchArbitro2().trim(),
                    cronometrista: this.editMatchCronometrista().trim(),
                  }
                : m
            )
          );

          if (fecha) {
            this.selectedDateISO.set(fecha);
          }
          this.mostrarToast(
            `Programación actualizada: ${target.localSiglas} vs ${target.visitanteSiglas}.`,
            'success'
          );
        },
        error: () => {
          this.isSavingMatch.set(false);
          this.mostrarToast('No se pudo actualizar la programación del partido.', 'error');
        },
      });
  }

  // --- FUNCIONES ADMIN: EVENTOS E HITOS INSTITUCIONALES FJH ---

  abrirModalNuevoEvento(dateISO?: string): void {
    if (!this.isAdmin()) return;
    this.newEventFecha.set(dateISO || this.selectedDateISO());
    this.newEventHora.set('19:00');
    this.newEventTitulo.set('');
    this.newEventSede.set('Sede Central FJH • San Salvador de Jujuy');
    this.newEventTipo.set('institucional');
    this.newEventDescripcion.set('');
    this.newEventDestacado.set(true);
    this.showEventModal.set(true);
  }

  cerrarModalNuevoEvento(): void {
    this.showEventModal.set(false);
  }

  guardarNuevoEventoInstitucional(): void {
    const titulo = this.newEventTitulo().trim();
    const fecha = this.newEventFecha().trim();
    if (!titulo || !fecha) {
      this.mostrarToast('Ingrese el título y la fecha del evento institucional.', 'error');
      return;
    }

    this.isSavingEvent.set(true);
    this.eventosService
      .crearEvento({
        titulo,
        fecha,
        hora: this.newEventHora().trim() || '19:00',
        sede: this.newEventSede().trim() || 'Sede Central FJH',
        tipo: this.newEventTipo(),
        descripcion: this.newEventDescripcion().trim(),
        destacado: this.newEventDestacado(),
      })
      .subscribe({
        next: (creado) => {
          this.isSavingEvent.set(false);
          this.showEventModal.set(false);
          this.institutionalEvents.update((prev) => [creado, ...prev]);
          this.selectedDateISO.set(creado.fecha);
          this.mostrarToast(`Hito "${creado.titulo}" agendado en el calendario oficial.`, 'success');
        },
        error: () => {
          this.isSavingEvent.set(false);
          this.mostrarToast('No se pudo agendar el evento institucional.', 'error');
        },
      });
  }

  eliminarEventoInstitucional(evento: EventoCalendarioFJH): void {
    if (!this.isAdmin()) return;
    this.eventosService.eliminarEvento(evento.id).subscribe({
      next: () => {
        this.institutionalEvents.update((prev) => prev.filter((e) => e.id !== evento.id));
        this.mostrarToast(`Evento "${evento.titulo}" eliminado.`, 'info');
      },
      error: () => {
        this.mostrarToast('No se pudo eliminar el evento.', 'error');
      },
    });
  }

  // --- NAVEGACIÓN A MATCH CENTER / GESTIÓN ---

  irAMatchCenter(match: CalendarioMatchItem): void {
    if (this.isAdmin()) {
      this.router.navigate(['/admin/fixture'], { queryParams: { torneoId: match.torneoId } });
    } else if (this.isClubUser()) {
      this.router.navigate(['/club/fixture']);
    } else {
      this.router.navigate(['/fixture'], { queryParams: { torneoId: match.torneoId } });
    }
  }

  irAGestionarTorneo(torneoId: string): void {
    this.router.navigate(['/admin/torneos/gestionar', torneoId]);
  }

  limpiarFiltros(): void {
    this.selectedTorneoId.set('ALL');
    this.selectedCategoria.set('ALL');
    this.selectedClubId.set('ALL');
    this.selectedSede.set('ALL');
    this.filterOnlyMyClub.set(false);
    this.searchQuery.set('');
  }

  // --- HELPERS DE FECHA Y LOGOS ---

  toISODate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private extractDateAndTime(rawFecha: any, rawHora: any): { dateISO: string | null; hora: string } {
    let horaStr = rawHora ? String(rawHora).trim() : '15:00 hs';
    if (horaStr && !horaStr.toLowerCase().endsWith('hs')) {
      horaStr = `${horaStr} hs`;
    }

    if (!rawFecha) {
      return { dateISO: null, hora: horaStr };
    }

    const str = String(rawFecha).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const dateISO = str.substring(0, 10);
      if (!rawHora && str.includes('T')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          if (hh !== '00' || mm !== '00') {
            horaStr = `${hh}:${mm} hs`;
          }
        }
      }
      return { dateISO, hora: horaStr };
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return { dateISO: this.toISODate(parsed), hora: horaStr };
    }

    return { dateISO: null, hora: horaStr };
  }

  formatFullDateLabel(dateISO: string): string {
    if (!dateISO) return '';
    const [y, m, d] = dateISO.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaNombre = dias[dateObj.getDay()];
    const mesNombre = this.nombresMeses[m - 1];
    return `${diaNombre} ${d} de ${mesNombre}, ${y}`;
  }

  isLive(estado?: string): boolean {
    const s = (estado || '').toLowerCase().trim();
    return s === 'en vivo' || s === 'en disputa' || s === 'live';
  }

  getLogoUrl(logoUrl: string | null | undefined, clubKey: string): string | null {
    if (!logoUrl || this.logoErrors().has(clubKey)) return null;
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) return logoUrl;
    return `${environment.serverUrl}${logoUrl}`;
  }

  onLogoError(clubKey: string): void {
    this.logoErrors.update((prev) => {
      const next = new Set(prev);
      next.add(clubKey);
      return next;
    });
  }

  getInitials(name?: string): string {
    if (!name) return 'CL';
    const parts = name
      .replace(/club|atlético|deportivo|handball/gi, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name.trim().slice(0, 3) || 'CL').toUpperCase();
  }

  private mostrarToast(msg: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set(msg);
    this.toastType.set(type);
    setTimeout(() => {
      if (this.toastMessage() === msg) {
        this.toastMessage.set(null);
      }
    }, 4000);
  }
}
