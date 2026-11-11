import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { PartidosService } from '../../../../core/services/partidos.service';
import { Torneo, TorneosService } from '../../../../core/services/torneos.service';

export interface JugadorPlanilla {
  id: string | null;
  nombreCompleto: string;
  numero: number;
  goles: number;
  am: number;
  excl: number;
  roja: boolean;
  azul: boolean;
  goles7m: number;
  errados7m: number;
}

export interface AccionHistorial {
  tipo: 'GOL' | '7M_GOL' | '7M_ERRADO' | '2MIN' | 'AMARILLA' | 'ROJA' | 'AZUL';
  jugador: JugadorPlanilla;
  equipo: 'local' | 'visitante';
  descripcion: string;
}

@Component({
  selector: 'app-fixture',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './fixture.component.html',
  styleUrl: './fixture.component.css',
})
export class FixtureComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly torneosService = inject(TorneosService);
  private readonly partidosService = inject(PartidosService);
  private readonly clubesService = inject(ClubesService);
  protected readonly authService = inject(AuthService);

  // Torneo actual y lista
  readonly torneos = signal<Torneo[]>([]);
  readonly torneoSeleccionado = signal<Torneo | null>(null);
  readonly todosLosClubes = signal<Club[]>([]);
  readonly isLoading = signal<boolean>(false);

  // Vistas / Tabs principales
  readonly currentTab = signal<'fixture' | 'playoffs' | 'posiciones'>('fixture');
  readonly currentFase = signal<'Fase Grupos' | 'Fase Final'>('Fase Grupos');

  // Jornadas & Partidos
  readonly jornadasIds = signal<number[]>([]);
  readonly jornadaSeleccionada = signal<number>(1);
  readonly partidos = signal<any[]>([]);
  readonly todosLosPartidosTorneo = signal<any[]>([]);

  // Filtros
  readonly filtroSede = signal<string>('Todas las Sedes');
  readonly filtroEstado = signal<string>('Todos los Estados');
  readonly grupoPosiciones = signal<'A' | 'B'>('A');

  // Tabla Posiciones
  readonly tablaPosiciones = signal<any[]>([]);

  // Modal Acta Digital
  readonly showModalActa = signal<boolean>(false);
  readonly partidoSeleccionado = signal<any | null>(null);
  readonly equipoActivoActa = signal<'local' | 'visitante'>('local');

  // Tipo de Carga: 'en_vivo' (mesa oficial en tiempo real) | 'post_partido' (carga simple de planilla física)
  readonly tipoCarga = signal<'en_vivo' | 'post_partido'>('en_vivo');

  // Paso del flujo de planilla: 'dorsales' (revisar/editar camisetas antes de iniciar) | 'acta' (partido en juego / planilla)
  readonly pasoActa = signal<'dorsales' | 'acta'>('dorsales');

  // Formulario Acta & Marcador
  gLocal = 0;
  gVisitante = 0;
  htLocal = 0;
  htVisitante = 0;
  arbitro1 = '';
  arbitro2 = '';
  cronometrista = '';
  observaciones = '';
  jugadoresLocal: JugadorPlanilla[] = [];
  jugadoresVisitante: JugadorPlanilla[] = [];

  // Historial de acciones para DESHACER CUALQUIER ACCIÓN (no solo goles)
  private readonly historialAcciones: AccionHistorial[] = [];

  // CONTROL DEL TIEMPO / CRONÓMETRO DIGITAL
  readonly matchPeriod = signal<1 | 2>(1);
  readonly matchSeconds = signal<number>(0);
  readonly isTimerRunning = signal<boolean>(false);
  private timerInterval: any = null;

  // TIEMPOS MUERTOS (TIME-OUTS DE EQUIPO)
  tiemposMuertosLocal: string[] = [];
  tiemposMuertosVisitante: string[] = [];

  // Modal Invitado
  readonly showModalInvitado = signal<boolean>(false);
  nuevoInvitadoNombre = '';
  nuevoInvitadoNumero: number | null = null;

  // Modal Crear / Programar Partido de Playoffs
  readonly showModalPlayoff = signal<boolean>(false);
  playoffFase = 'Semifinales';
  playoffLlave = 'Semifinal 1 (Ida)';
  playoffLocalId = '';
  playoffVisitanteId = '';
  playoffFecha = '';
  playoffHora = '18:00 hs';
  playoffLugar = 'Polideportivo Cuyaya';

  // Modal 7 Metros (¿Fue gol o fue errado?)
  readonly showModal7Metros = signal<boolean>(false);
  jugador7mSeleccionado: JugadorPlanilla | null = null;

  // Estado de acción rápida seleccionada en modal
  readonly accionRapida = signal<'GOL' | '7M' | '2MIN' | 'AMARILLA' | 'ROJA' | 'AZUL'>('GOL');

  // Mensaje / Feedback flotante
  readonly feedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Can control / edit the sheet (arbitro, oficial, admin)
  readonly canEdit = computed(() => {
    return this.authService.canManagePlanilla();
  });

  // Partidos filtrados de la jornada regular
  readonly partidosFiltrados = computed(() => {
    const list = this.partidos();
    const sede = this.filtroSede();
    const estado = this.filtroEstado();

    return list.filter((p) => {
      const matchSede =
        sede === 'Todas las Sedes' ||
        (p.lugar && p.lugar.toLowerCase().includes(sede.toLowerCase()));

      let matchEstado = true;
      if (estado === '● En Vivo Ahora') {
        matchEstado = p.estado === 'En Vivo' || p.estado === 'En disputa';
      } else if (estado === 'Finalizados') {
        matchEstado = p.estado === 'Finalizado';
      } else if (estado === 'Próximos') {
        matchEstado = p.estado === 'Programado' || p.estado === 'Pendiente';
      }

      return matchSede && matchEstado;
    });
  });

  // Partidos de Playoffs asignados a este torneo
  readonly partidosPlayoffs = computed(() => {
    const todos = this.todosLosPartidosTorneo();
    return todos.filter((p) => {
      const fase = (p.fase || '').toLowerCase();
      return (
        fase.includes('cuartos') ||
        fase.includes('semi') ||
        fase.includes('final') ||
        fase.includes('playoff') ||
        fase.includes('tercer') ||
        p.jornada >= 90
      );
    });
  });

  // Sedes únicas disponibles en la jornada
  readonly sedesDisponibles = computed(() => {
    const s = new Set<string>();
    for (const p of this.partidos()) {
      if (p.lugar) s.add(p.lugar);
    }
    return Array.from(s);
  });

  // Formato mm:ss del cronómetro
  readonly timerDisplay = computed(() => {
    const total = this.matchSeconds();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const p = this.matchPeriod();
    const prefix = p === 1 ? '1T' : '2T';
    return `${prefix} • ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  ngOnInit(): void {
    this.cargarClubes();
    this.route.queryParams.subscribe((params) => {
      const tId = params['torneoId'];
      this.cargarTorneos(tId);
    });
  }

  ngOnDestroy(): void {
    this.detenerCronometro();
  }

  cargarClubes(): void {
    this.clubesService.getClubes().subscribe({
      next: (list) => this.todosLosClubes.set(list || []),
      error: () => {},
    });
  }

  cargarTorneos(initialTorneoId?: string): void {
    this.isLoading.set(true);
    this.torneosService.getTorneos().subscribe({
      next: (list) => {
        this.torneos.set(list);
        if (list.length > 0) {
          const match = initialTorneoId
            ? list.find((t) => t.id === initialTorneoId)
            : list.find((t) => t.estado === 'In Progress') || list[0];
          this.seleccionarTorneo(match || list[0]);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.mostrarFeedback('error', 'No se pudieron cargar los torneos');
      },
    });
  }

  seleccionarTorneo(t: Torneo): void {
    this.torneoSeleccionado.set(t);
    this.cargarJornadas(t.id);
    this.cargarTabla(t.id);
    this.cargarTodosLosPartidos(t.id);
  }

  cargarTodosLosPartidos(torneoId: string): void {
    this.partidosService.getFixtureByTorneo(torneoId).subscribe({
      next: (list) => this.todosLosPartidosTorneo.set(list || []),
      error: () => this.todosLosPartidosTorneo.set([]),
    });
  }

  cargarJornadas(torneoId: string): void {
    this.partidosService.getJornadasDisponibles(torneoId).subscribe({
      next: (ids) => {
        this.jornadasIds.set(ids);
        if (ids.length > 0) {
          this.cargarPartidosJornada(torneoId, ids[0]);
        } else {
          this.partidos.set([]);
        }
      },
      error: () => this.partidos.set([]),
    });
  }

  cargarPartidosJornada(torneoId: string, jornadaNum: number): void {
    this.jornadaSeleccionada.set(jornadaNum);
    this.isLoading.set(true);
    this.partidosService.getPartidosByJornada(torneoId, jornadaNum).subscribe({
      next: (data) => {
        this.partidos.set(data || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.partidos.set([]);
        this.isLoading.set(false);
      },
    });
  }

  cargarTabla(torneoId: string, grupo?: string): void {
    this.partidosService.getTablaPosiciones(torneoId, grupo).subscribe({
      next: (data) => this.tablaPosiciones.set(data || []),
      error: () => this.tablaPosiciones.set([]),
    });
  }

  cambiarGrupoPosiciones(grupo: 'A' | 'B'): void {
    this.grupoPosiciones.set(grupo);
    const t = this.torneoSeleccionado();
    if (t) this.cargarTabla(t.id, grupo);
  }

  // --- MODAL PLANILLA EN VIVO / ACTA DIGITAL ---

  abrirActa(partido: any, modo: 'en_vivo' | 'post_partido' = 'en_vivo'): void {
    this.partidoSeleccionado.set(partido);
    this.tipoCarga.set(modo);
    this.gLocal = Number(partido.golesLocal) || 0;
    this.gVisitante = Number(partido.golesVisitante) || 0;
    this.htLocal = Number(partido.golesLocalHT) || 0;
    this.htVisitante = Number(partido.golesVisitanteHT) || 0;
    this.arbitro1 = partido.arbitro1 || '';
    this.arbitro2 = partido.arbitro2 || '';
    this.cronometrista = partido.cronometrista || '';
    this.observaciones = partido.observaciones || '';
    this.equipoActivoActa.set('local');
    this.tiemposMuertosLocal = [];
    this.tiemposMuertosVisitante = [];
    this.historialAcciones.length = 0;

    // Si es post-partido o ya está finalizado, va directo a la planilla/tabla
    if (modo === 'post_partido' || partido.estado === 'Finalizado') {
      this.pasoActa.set('acta');
    } else {
      this.pasoActa.set('dorsales');
    }

    // Cargar listas de jugadores
    this.cargarJugadoresEquipo(partido.localId, 'local', partido.eventos || []);
    this.cargarJugadoresEquipo(partido.visitanteId, 'visitante', partido.eventos || []);

    this.showModalActa.set(true);
  }

  cerrarActa(): void {
    this.detenerCronometro();
    this.showModalActa.set(false);
    this.partidoSeleccionado.set(null);
  }

  pasarAPlanillaEnVivo(): void {
    this.pasoActa.set('acta');
  }

  // --- CONTROL DEL TIEMPO (CRONÓMETRO) ---

  toggleCronometro(): void {
    if (this.isTimerRunning()) {
      this.detenerCronometro();
    } else {
      this.iniciarCronometro();
    }
  }

  iniciarCronometro(): void {
    this.isTimerRunning.set(true);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.matchSeconds.update((s) => s + 1);
    }, 1000);
  }

  detenerCronometro(): void {
    this.isTimerRunning.set(false);
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  cambiarPeriodo(periodo: 1 | 2): void {
    this.matchPeriod.set(periodo);
    this.matchSeconds.set(0);
    this.detenerCronometro();
  }

  solicitarTiempoMuerto(equipo: 'local' | 'visitante'): void {
    const lista = equipo === 'local' ? this.tiemposMuertosLocal : this.tiemposMuertosVisitante;
    const nombreEquipo =
      equipo === 'local'
        ? this.partidoSeleccionado()?.local?.nombre
        : this.partidoSeleccionado()?.visitante?.nombre;

    if (lista.length >= 3) {
      this.mostrarFeedback('error', `${nombreEquipo} ya utilizó sus 3 tiempos muertos reglamentarios.`);
      return;
    }

    // Regla IHF: máximo 2 por periodo
    const enEstePeriodo = lista.filter((t) => t.startsWith(`${this.matchPeriod()}T`)).length;
    if (enEstePeriodo >= 2) {
      this.mostrarFeedback(
        'error',
        `Límite alcanzado: ${nombreEquipo} ya utilizó los 2 tiempos muertos permitidos en este ${this.matchPeriod()}º Tiempo.`
      );
      return;
    }

    this.detenerCronometro();
    const timeStamp = `${this.matchPeriod()}T (${Math.floor(this.matchSeconds() / 60)}'${this.matchSeconds() % 60}")`;
    lista.push(timeStamp);
    this.mostrarFeedback('success', `Tiempo muerto concedido a ${nombreEquipo} a los ${timeStamp}.`);
  }

  // --- JUGADORES Y EVENTOS ---

  private cargarJugadoresEquipo(clubId: string, lado: 'local' | 'visitante', eventos: any[]): void {
    this.clubesService.getJugadoresByClub(clubId).subscribe({
      next: (jugadoresFederados) => {
        const torneo = this.torneoSeleccionado();
        const catTorneo = torneo?.categoria?.toLowerCase().trim() || '';
        const ramaTorneo = torneo?.rama?.toLowerCase().trim() || '';

        const oficiales = (jugadoresFederados || [])
          .filter((j: any) => {
            const catBase = j.categoria?.toLowerCase().trim() || '';
            const catEsp = j.categoriaEspecial?.toLowerCase().trim() || '';
            const gen = j.genero?.toLowerCase().trim() || '';

            if (ramaTorneo && !gen.includes(ramaTorneo)) return false;
            if (catTorneo.includes('+35')) return catEsp.includes('+35');
            return true;
          })
          .map((j: any) => this.mapearJugador(j, eventos, clubId));

        const invitados = (eventos || [])
          .filter((e) => e.equipoId === clubId && !e.jugadorId && e.tipo === 'PRESENCIA')
          .map((e) => ({
            id: null,
            nombreCompleto: e.nombreInvitado || 'Invitado',
            numero: Number(e.numeroInvitado) || 0,
            goles: eventos.filter(
              (ev) => ev.nombreInvitado === e.nombreInvitado && ev.tipo === 'GOL'
            ).length,
            am: eventos.filter(
              (ev) => ev.nombreInvitado === e.nombreInvitado && ev.tipo === 'AMARILLA'
            ).length,
            excl: eventos.filter(
              (ev) => ev.nombreInvitado === e.nombreInvitado && ev.tipo === 'DOS_MINUTOS'
            ).length,
            roja: eventos.some(
              (ev) => ev.nombreInvitado === e.nombreInvitado && ev.tipo === 'ROJA'
            ),
            azul: eventos.some(
              (ev) => ev.nombreInvitado === e.nombreInvitado && ev.tipo === 'AZUL'
            ),
            goles7m: 0,
            errados7m: 0,
          }));

        const list = [...oficiales, ...invitados];
        if (lado === 'local') {
          this.jugadoresLocal = list;
        } else {
          this.jugadoresVisitante = list;
        }
      },
      error: () => {
        if (lado === 'local') this.jugadoresLocal = [];
        else this.jugadoresVisitante = [];
      },
    });
  }

  private mapearJugador(j: any, eventos: any[], clubId: string): JugadorPlanilla {
    const ev = eventos || [];
    const dorsalActa = ev.find(
      (e) => e.jugadorId === j.id && e.tipo === 'PRESENCIA' && e.equipoId === clubId
    )?.numeroInvitado;

    return {
      id: j.id,
      nombreCompleto: j.nombreCompleto,
      numero: dorsalActa || 0,
      goles: ev.filter((e) => e.jugadorId === j.id && e.tipo === 'GOL').length,
      am: ev.filter((e) => e.jugadorId === j.id && e.tipo === 'AMARILLA').length,
      excl: ev.filter((e) => e.jugadorId === j.id && e.tipo === 'DOS_MINUTOS').length,
      roja: ev.some((e) => e.jugadorId === j.id && e.tipo === 'ROJA'),
      azul: ev.some((e) => e.jugadorId === j.id && e.tipo === 'AZUL'),
      goles7m: 0,
      errados7m: 0,
    };
  }

  // --- ACCIONES DE PLANILLA SOBRE JUGADORES (CON HISTORIAL DESHACER) ---

  aplicarAccionAJugador(j: JugadorPlanilla): void {
    if (!this.canEdit()) return;
    const accion = this.accionRapida();
    const esLocal = this.equipoActivoActa() === 'local';

    switch (accion) {
      case 'GOL':
        j.goles++;
        if (esLocal) this.gLocal++;
        else this.gVisitante++;
        this.historialAcciones.push({
          tipo: 'GOL',
          jugador: j,
          equipo: this.equipoActivoActa(),
          descripcion: `Gol de #${j.numero} ${j.nombreCompleto}`,
        });
        break;

      case '7M':
        this.jugador7mSeleccionado = j;
        this.showModal7Metros.set(true);
        break;

      case '2MIN':
        j.excl++;
        const teniaRojaPrevia = j.roja;
        if (j.excl >= 3) {
          j.roja = true;
          this.mostrarFeedback(
            'error',
            `¡DESCALIFICACIÓN AUTOMÁTICA! #${j.numero} ${j.nombreCompleto} acumuló 3 exclusiones de 2'. Se asignó Tarjeta Roja.`
          );
        } else {
          this.mostrarFeedback('success', `2 minutos asignados a #${j.numero} ${j.nombreCompleto} (${j.excl}/3)`);
        }
        this.historialAcciones.push({
          tipo: '2MIN',
          jugador: j,
          equipo: this.equipoActivoActa(),
          descripcion: `2' para #${j.numero} ${j.nombreCompleto} ${!teniaRojaPrevia && j.roja ? '(provocó Roja)' : ''}`,
        });
        break;

      case 'AMARILLA':
        j.am = j.am > 0 ? 0 : 1;
        this.historialAcciones.push({
          tipo: 'AMARILLA',
          jugador: j,
          equipo: this.equipoActivoActa(),
          descripcion: `Amarilla a #${j.numero} ${j.nombreCompleto}`,
        });
        break;

      case 'ROJA':
        j.roja = !j.roja;
        this.historialAcciones.push({
          tipo: 'ROJA',
          jugador: j,
          equipo: this.equipoActivoActa(),
          descripcion: `Tarjeta Roja a #${j.numero} ${j.nombreCompleto}`,
        });
        break;

      case 'AZUL':
        j.azul = !j.azul;
        if (j.azul) {
          j.roja = true;
          this.mostrarFeedback(
            'error',
            `TARJETA AZUL ASIGNADA a #${j.numero} ${j.nombreCompleto}. El jugador pasa automáticamente a revisión del Tribunal de Penas.`
          );
        }
        this.historialAcciones.push({
          tipo: 'AZUL',
          jugador: j,
          equipo: this.equipoActivoActa(),
          descripcion: `Tarjeta Azul a #${j.numero} ${j.nombreCompleto}`,
        });
        break;
    }
  }

  resolver7Metros(convertido: boolean): void {
    const j = this.jugador7mSeleccionado;
    if (!j) return;
    const esLocal = this.equipoActivoActa() === 'local';

    if (convertido) {
      j.goles++;
      j.goles7m++;
      if (esLocal) this.gLocal++;
      else this.gVisitante++;
      this.mostrarFeedback('success', `Gol de 7 Metros anotado por #${j.numero} ${j.nombreCompleto}`);
      this.historialAcciones.push({
        tipo: '7M_GOL',
        jugador: j,
        equipo: this.equipoActivoActa(),
        descripcion: `7 Metros (Gol) de #${j.numero} ${j.nombreCompleto}`,
      });
    } else {
      j.errados7m++;
      this.mostrarFeedback('error', `Lanzamiento de 7 Metros fallado por #${j.numero} ${j.nombreCompleto}`);
      this.historialAcciones.push({
        tipo: '7M_ERRADO',
        jugador: j,
        equipo: this.equipoActivoActa(),
        descripcion: `7 Metros (Fallado) de #${j.numero} ${j.nombreCompleto}`,
      });
    }

    this.showModal7Metros.set(false);
    this.jugador7mSeleccionado = null;
  }

  // DESHACER LA ÚLTIMA ACCIÓN CUALQUIERA SEA (Gol, 2 Minutos, Amarilla, Roja, Azul, etc.)
  deshacerUltimaAccion(): void {
    if (this.historialAcciones.length === 0) {
      this.mostrarFeedback('error', 'No hay acciones registradas en el historial para deshacer.');
      return;
    }

    const ultima = this.historialAcciones.pop()!;
    const j = ultima.jugador;
    const esLocal = ultima.equipo === 'local';

    switch (ultima.tipo) {
      case 'GOL':
        if (j.goles > 0) j.goles--;
        if (esLocal && this.gLocal > 0) this.gLocal--;
        if (!esLocal && this.gVisitante > 0) this.gVisitante--;
        this.mostrarFeedback('success', `Se deshizo el gol de #${j.numero} ${j.nombreCompleto}`);
        break;

      case '7M_GOL':
        if (j.goles > 0) j.goles--;
        if (j.goles7m > 0) j.goles7m--;
        if (esLocal && this.gLocal > 0) this.gLocal--;
        if (!esLocal && this.gVisitante > 0) this.gVisitante--;
        this.mostrarFeedback('success', `Se deshizo el gol de 7m de #${j.numero} ${j.nombreCompleto}`);
        break;

      case '7M_ERRADO':
        if (j.errados7m > 0) j.errados7m--;
        this.mostrarFeedback('success', `Se deshizo el 7m fallado de #${j.numero} ${j.nombreCompleto}`);
        break;

      case '2MIN':
        if (j.excl > 0) j.excl--;
        if (j.excl < 3 && j.roja) {
          // Si la roja se la dio la 3ra exclusión, se revierte
          j.roja = false;
        }
        this.mostrarFeedback('success', `Se removió la exclusión de 2' de #${j.numero} ${j.nombreCompleto}`);
        break;

      case 'AMARILLA':
        j.am = j.am > 0 ? 0 : 1;
        this.mostrarFeedback('success', `Se deshizo la tarjeta amarilla de #${j.numero} ${j.nombreCompleto}`);
        break;

      case 'ROJA':
        j.roja = !j.roja;
        this.mostrarFeedback('success', `Se revirtió la tarjeta roja de #${j.numero} ${j.nombreCompleto}`);
        break;

      case 'AZUL':
        j.azul = false;
        this.mostrarFeedback('success', `Se canceló la tarjeta azul de #${j.numero} ${j.nombreCompleto}`);
        break;
    }
  }

  // Invitados manuales
  abrirModalInvitado(): void {
    this.nuevoInvitadoNombre = '';
    this.nuevoInvitadoNumero = null;
    this.showModalInvitado.set(true);
  }

  confirmarInvitado(): void {
    if (!this.nuevoInvitadoNombre.trim()) {
      this.mostrarFeedback('error', 'Ingresa el nombre del jugador invitado');
      return;
    }
    const inv: JugadorPlanilla = {
      id: null,
      nombreCompleto: this.nuevoInvitadoNombre.toUpperCase().trim(),
      numero: Number(this.nuevoInvitadoNumero) || 0,
      goles: 0,
      am: 0,
      excl: 0,
      roja: false,
      azul: false,
      goles7m: 0,
      errados7m: 0,
    };
    if (this.equipoActivoActa() === 'local') {
      this.jugadoresLocal.push(inv);
    } else {
      this.jugadoresVisitante.push(inv);
    }
    this.showModalInvitado.set(false);
  }

  removerInvitado(lista: JugadorPlanilla[], idx: number): void {
    if (!this.canEdit()) return;
    lista.splice(idx, 1);
  }

  // Guardar Parcial o Finalizar Acta
  guardarActa(finalizar: boolean = false): void {
    if (!this.canEdit()) return;
    const partido = this.partidoSeleccionado();
    if (!partido) return;

    // Si es modo post-partido y las sumas individuales se ingresaron en la tabla, sincronizamos marcador total si estaba en cero
    if (this.tipoCarga() === 'post_partido') {
      const sumL = this.jugadoresLocal.reduce((acc, j) => acc + (Number(j.goles) || 0), 0);
      const sumV = this.jugadoresVisitante.reduce((acc, j) => acc + (Number(j.goles) || 0), 0);
      if (this.gLocal === 0 && sumL > 0) this.gLocal = sumL;
      if (this.gVisitante === 0 && sumV > 0) this.gVisitante = sumV;
    }

    const planillaFinal = [
      ...this.jugadoresLocal.map((j) => ({
        ...j,
        equipoId: partido.localId,
        jugadorId: j.id,
        nombreCompleto: j.nombreCompleto,
      })),
      ...this.jugadoresVisitante.map((j) => ({
        ...j,
        equipoId: partido.visitanteId,
        jugadorId: j.id,
        nombreCompleto: j.nombreCompleto,
      })),
    ].filter((j) => Number(j.numero) > 0 || j.id === null);

    let obsCompleta = this.observaciones || '';
    if (this.tiemposMuertosLocal.length > 0) {
      obsCompleta += ` | TM ${partido.local?.nombre || 'Local'}: ${this.tiemposMuertosLocal.join(', ')}`;
    }
    if (this.tiemposMuertosVisitante.length > 0) {
      obsCompleta += ` | TM ${partido.visitante?.nombre || 'Visita'}: ${this.tiemposMuertosVisitante.join(', ')}`;
    }

    const payload = {
      golesLocal: Number(this.gLocal) || 0,
      golesVisitante: Number(this.gVisitante) || 0,
      golesLocalHT: Number(this.htLocal) || 0,
      golesVisitanteHT: Number(this.htVisitante) || 0,
      arbitro1: this.arbitro1,
      arbitro2: this.arbitro2,
      cronometrista: this.cronometrista,
      observaciones: obsCompleta,
      detallesJugadores: planillaFinal,
      estado: finalizar ? 'Finalizado' : 'En Vivo',
    };

    this.partidosService.updateResultado(partido.id, payload).subscribe({
      next: () => {
        this.mostrarFeedback(
          'success',
          finalizar
            ? '¡Acta homologada y cerrada con éxito!'
            : 'Planilla parcial guardada correctamente'
        );
        this.detenerCronometro();
        this.showModalActa.set(false);
        const t = this.torneoSeleccionado();
        if (t) {
          this.cargarPartidosJornada(t.id, this.jornadaSeleccionada());
          this.cargarTabla(t.id);
          this.cargarTodosLosPartidos(t.id);
        }
      },
      error: (err) => {
        this.mostrarFeedback('error', err?.error?.error || 'Error al guardar el acta');
      },
    });
  }

  // --- CREACIÓN / PROGRAMACIÓN DE PARTIDOS DE PLAYOFFS ---

  abrirCrearPlayoff(faseSugerida: string = 'Semifinales'): void {
    this.playoffFase = faseSugerida;
    this.playoffLlave = `${faseSugerida} (Ida)`;
    this.playoffLocalId = '';
    this.playoffVisitanteId = '';
    this.playoffFecha = '';
    this.playoffHora = '18:00 hs';
    this.playoffLugar = 'Polideportivo Cuyaya';
    this.showModalPlayoff.set(true);
  }

  guardarPartidoPlayoff(): void {
    const t = this.torneoSeleccionado();
    if (!t) return;
    if (!this.playoffLocalId || !this.playoffVisitanteId) {
      this.mostrarFeedback('error', 'Selecciona ambos equipos para el cruce de playoffs');
      return;
    }
    if (this.playoffLocalId === this.playoffVisitanteId) {
      this.mostrarFeedback('error', 'El equipo local y visitante no pueden ser el mismo');
      return;
    }

    const payload = {
      torneoId: t.id,
      jornada: 99,
      fase: `${this.playoffFase} • ${this.playoffLlave}`,
      localId: this.playoffLocalId,
      visitanteId: this.playoffVisitanteId,
      fecha: this.playoffFecha || null,
      hora: this.playoffHora || '18:00 hs',
      lugar: this.playoffLugar || 'Sede a definir',
      estado: 'Programado',
    };

    this.partidosService.crearPartidoPlayoff(payload).subscribe({
      next: () => {
        this.mostrarFeedback('success', '¡Partido de playoffs programado exitosamente!');
        this.showModalPlayoff.set(false);
        this.cargarTodosLosPartidos(t.id);
      },
      error: (err) => {
        this.mostrarFeedback('error', err?.error?.error || 'No se pudo crear el partido');
      },
    });
  }

  // --- Helper de Logo Oficial ---
  getClubLogoUrl(logoUrl: string | null | undefined): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }
    return `${environment.serverUrl}${logoUrl}`;
  }

  mostrarFeedback(type: 'success' | 'error', message: string): void {
    this.feedback.set({ type, message });
    setTimeout(() => this.feedback.set(null), 4000);
  }
}
