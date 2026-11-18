import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { PartidosService } from '../../../../core/services/partidos.service';
import { Torneo, TorneosService } from '../../../../core/services/torneos.service';
import { PublicNavbarComponent } from '../../../../shared/components/public-navbar/public-navbar.component';

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
  exclusionRestanteSegundos?: number;
}

export interface AccionHistorial {
  id: string;
  minutoTexto: string;
  periodo: 1 | 2;
  tipo: 'GOL' | '7M_GOL' | '7M_ERRADO' | '2MIN' | 'AMARILLA' | 'ROJA' | 'AZUL';
  jugador: JugadorPlanilla;
  equipo: 'local' | 'visitante';
  equipoNombre: string;
  descripcion: string;
}

@Component({
  selector: 'app-fixture',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PublicNavbarComponent],
  templateUrl: './fixture.component.html',
  styleUrl: './fixture.component.css',
})
export class FixtureComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly torneosService = inject(TorneosService);
  private readonly partidosService = inject(PartidosService);
  private readonly clubesService = inject(ClubesService);
  protected readonly authService = inject(AuthService);

  readonly isAdminContext = computed(() => this.router.url.startsWith('/admin'));

  // Es usuario con permisos para operar mesa/planillaje
  readonly canEdit = computed(() => {
    return this.authService.canManagePlanilla();
  });

  readonly actaEditable = computed(() => {
    return this.canEdit() && this.partidoSeleccionado()?.estado !== 'Finalizado';
  });

  // Estado del menú móvil para la cabecera pública
  readonly mobileMenuOpen = signal<boolean>(false);

  // Torneos y Clubes
  readonly torneos = signal<Torneo[]>([]);
  readonly torneoSeleccionado = signal<Torneo | null>(null);
  readonly todosLosClubes = signal<Club[]>([]);
  readonly isLoading = signal<boolean>(false);

  // Filtros de Categoría y Rama para Torneos
  readonly filtroCategoria = signal<string>('Todas');
  readonly filtroRama = signal<'Todas' | 'Masculino' | 'Femenino'>('Todas');

  readonly categoriasOficiales = [
    { label: 'Todas las Categorías', value: 'Todas' },
    { label: 'Primera División', value: 'Primera' },
    { label: 'Juveniles (Sub-18)', value: 'Juveniles' },
    { label: 'Cadetes (Sub-16)', value: 'Cadetes' },
    { label: 'Menores (Sub-14)', value: 'Menores' },
  ];

  // Torneos filtrados según Categoría y Rama
  readonly torneosFiltrados = computed(() => {
    const list = this.torneos();
    const cat = this.filtroCategoria().toLowerCase();
    const rama = this.filtroRama().toLowerCase();

    return list.filter((t) => {
      const tCat = (t.categoria || '').toLowerCase();
      const tRama = (t.rama || '').toLowerCase();
      const tNom = (t.nombre || '').toLowerCase();

      const matchCat =
        cat === 'todas' || tCat.includes(cat) || tNom.includes(cat);
      const matchRama =
        rama === 'todas' ||
        (rama === 'masculino' && (tRama.includes('masc') || tNom.includes('masc'))) ||
        (rama === 'femenino' && (tRama.includes('fem') || tNom.includes('fem')));

      return matchCat && matchRama;
    });
  });

  // Vistas / Tabs principales
  readonly currentTab = signal<'fixture' | 'playoffs' | 'posiciones'>('fixture');
  readonly currentFase = signal<'Fase Grupos' | 'Fase Final'>('Fase Grupos');

  // Jornadas & Partidos
  readonly jornadasIds = signal<number[]>([]);
  readonly jornadaSeleccionada = signal<number>(1);
  readonly partidos = signal<any[]>([]);
  readonly todosLosPartidosTorneo = signal<any[]>([]);

  // Filtros operativos de la jornada
  readonly filtroSede = signal<string>('Todas las Sedes');
  readonly filtroEstado = signal<string>('Todos los Estados');
  readonly filtroTexto = signal<string>('');
  readonly grupoPosiciones = signal<'A' | 'B'>('A');

  // Tabla Posiciones
  readonly tablaPosiciones = signal<any[]>([]);

  // Modal Acta Digital / Mesa de Control en Vivo
  readonly showModalActa = signal<boolean>(false);
  readonly partidoSeleccionado = signal<any | null>(null);
  readonly equipoActivoActa = signal<'local' | 'visitante'>('local');

  // Tipo de Carga: 'en_vivo' (mesa interactiva con botonera directa) | 'post_partido' (carga de planilla física)
  readonly tipoCarga = signal<'en_vivo' | 'post_partido'>('en_vivo');

  // Paso del flujo: 'dorsales' (chequeo rápido pre-partido) | 'acta' (mesa principal en juego)
  readonly pasoActa = signal<'dorsales' | 'acta'>('acta');

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

  // Historial cronológico de acciones (Feed en vivo + Deshacer)
  readonly historialAcciones = signal<AccionHistorial[]>([]);

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
  equipoInvitadoDestino: 'local' | 'visitante' = 'local';
  nuevoInvitadoNombre = '';
  nuevoInvitadoNumero: number | null = null;

  // Modal Crear / Programar Partido de Playoffs
  readonly showModalPlayoff = signal<boolean>(false);
  playoffFase = 'Semifinales';
  playoffLlave = 'Ida';
  playoffLocalId = '';
  playoffVisitanteId = '';
  playoffFecha = '';
  playoffHora = '18:00';
  playoffLugar = 'Polideportivo Cuyaya';

  // Modal 7 Metros (¿Fue gol o fue errado?)
  readonly showModal7Metros = signal<boolean>(false);
  jugador7mSeleccionado: JugadorPlanilla | null = null;
  equipo7mSeleccionado: 'local' | 'visitante' = 'local';

  // Estado de acción rápida seleccionada en la Consola Táctica de Camisetas
  readonly accionRapida = signal<'GOL' | '7M_GOL' | '7M_ERRADO' | '7M' | '2MIN' | 'AMARILLA' | 'ROJA' | 'AZUL'>('GOL');

  // Modo edición rápida de números de camiseta (dorsales)
  readonly modoEditarCamisetas = signal<boolean>(false);

  // Mensaje / Feedback flotante
  readonly feedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Partidos filtrados de la jornada regular
  readonly partidosFiltrados = computed(() => {
    const list = this.partidos();
    const sede = this.filtroSede();
    const estado = this.filtroEstado();
    const q = this.filtroTexto().trim().toLowerCase();

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

      let matchTexto = true;
      if (q) {
        const local = (p.local?.nombre || '').toLowerCase();
        const visita = (p.visitante?.nombre || '').toLowerCase();
        const lugar = (p.lugar || '').toLowerCase();
        const fase = (p.fase || '').toLowerCase();
        matchTexto = local.includes(q) || visita.includes(q) || lugar.includes(q) || fase.includes(q);
      }

      return matchSede && matchEstado && matchTexto;
    });
  });

  // Estadísticas rápidas de la jornada actual
  readonly statsJornada = computed(() => {
    const list = this.partidos();
    const total = list.length;
    const enVivo = list.filter((p) => p.estado === 'En Vivo' || p.estado === 'En disputa').length;
    const finalizados = list.filter((p) => p.estado === 'Finalizado').length;
    const programados = total - enVivo - finalizados;
    return { total, enVivo, finalizados, programados };
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

  // Estado y progreso de la Fase Regular (para saber si ya es la última fecha o sigue en disputa)
  readonly estadoFaseRegular = computed(() => {
    const regulares = this.todosLosPartidosTorneo().filter((p) => (p.jornada || 1) < 90);
    const total = regulares.length;
    const finalizados = regulares.filter((p) => p.estado === 'Finalizado').length;
    const pendientes = total - finalizados;
    const completa = total > 0 && finalizados === total;
    const progresoPct = total > 0 ? Math.round((finalizados / total) * 100) : 0;
    return { total, finalizados, pendientes, completa, progresoPct };
  });

  // Configuración de la fase eliminatoria inicial según `faseInicial` del torneo y cantidad de clubes
  readonly configuracionPlayoff = computed(() => {
    const t = this.torneoSeleccionado();
    const tabla = this.tablaPosiciones();
    const faseRaw = (t?.faseInicial || 'semifinales').toLowerCase();
    const totalClubes = tabla.length;

    if (faseRaw.includes('cuartos') && totalClubes >= 8) {
      return {
        codigo: 'cuartos' as const,
        faseNombre: 'Cuartos de Final',
        cupos: 8,
        descripcion: 'Clasifican los primeros 8 clubes (1° vs 8°, 4° vs 5°, 2° vs 7°, 3° vs 6°)',
      };
    }
    if ((faseRaw.includes('semi') || faseRaw.includes('cuartos')) && totalClubes >= 4) {
      return {
        codigo: 'semifinales' as const,
        faseNombre: 'Semifinales',
        cupos: 4,
        descripcion: 'Clasifican los primeros 4 clubes (1° vs 4° y 2° vs 3°)',
      };
    }
    return {
      codigo: 'final' as const,
      faseNombre: 'Gran Final',
      cupos: 2,
      descripcion: 'Clasifican los primeros 2 clubes (1° vs 2°)',
    };
  });

  // Cruces proyectados en tiempo real según la tabla de posiciones actual (solo la fase inicial configurada)
  readonly crucesProyectados = computed(() => {
    const tabla = this.tablaPosiciones();
    const cfg = this.configuracionPlayoff();
    if (tabla.length < 2) return [];

    const armarCruce = (titulo: string, pLocal: number, pVisita: number) => {
      const filaL = tabla[pLocal - 1];
      const filaV = tabla[pVisita - 1];
      return {
        titulo,
        criterio: `${pLocal}° Clasificado vs ${pVisita}° Clasificado`,
        puestoLocal: pLocal,
        puestoVisitante: pVisita,
        local: filaL?.club || { nombre: `${pLocal}° Tabla General`, siglas: `${pLocal}°` },
        visitante: filaV?.club || { nombre: `${pVisita}° Tabla General`, siglas: `${pVisita}°` },
        puntosLocal: filaL?.puntos ?? 0,
        puntosVisitante: filaV?.puntos ?? 0,
        dgLocal: filaL?.dg ?? 0,
        dgVisitante: filaV?.dg ?? 0,
        pjLocal: filaL?.pj ?? 0,
        pjVisitante: filaV?.pj ?? 0,
      };
    };

    if (cfg.codigo === 'cuartos') {
      return [
        armarCruce('Cuartos de Final 1', 1, 8),
        armarCruce('Cuartos de Final 2', 4, 5),
        armarCruce('Cuartos de Final 3', 2, 7),
        armarCruce('Cuartos de Final 4', 3, 6),
      ];
    }
    if (cfg.codigo === 'semifinales') {
      return [
        armarCruce('Semifinal 1', 1, 4),
        armarCruce('Semifinal 2', 2, 3),
      ];
    }
    return [armarCruce('Gran Final', 1, 2)];
  });

  // Estructura completa de Árbol de Eliminatorias (conecta Cuartos -> Semifinales -> Gran Final + Campeón)
  readonly arbolPlayoffs = computed(() => {
    const tabla = this.tablaPosiciones();
    const oficiales = this.partidosPlayoffs();
    const cfg = this.configuracionPlayoff();
    const regCompleta = this.estadoFaseRegular().completa;

    const getClubFromTabla = (puesto: number) => {
      const f = tabla[puesto - 1];
      if (f?.club) {
        return { ...f.club, puesto: `${puesto}°`, puntos: f.puntos ?? 0, esPlaceholder: false };
      }
      return { id: null, nombre: `${puesto}° Clasificado`, siglas: `${puesto}°`, logoUrl: null, puesto: `${puesto}°`, esPlaceholder: true };
    };

    const crearPlaceholder = (nombre: string, siglas: string) => ({
      id: null,
      nombre,
      siglas,
      logoUrl: null,
      puesto: '',
      esPlaceholder: true,
    });

    const construirNodo = (
      idNodo: string,
      titulo: string,
      subtitulo: string,
      partidoDB: any | undefined,
      fallbackLocal: any,
      fallbackVisitante: any,
      esFaseInicial: boolean,
    ) => {
      const local = partidoDB?.local
        ? { ...partidoDB.local, puesto: fallbackLocal?.puesto || '', esPlaceholder: false }
        : fallbackLocal;
      const visitante = partidoDB?.visitante
        ? { ...partidoDB.visitante, puesto: fallbackVisitante?.puesto || '', esPlaceholder: false }
        : fallbackVisitante;

      const estado = partidoDB
        ? partidoDB.estado || 'Programado'
        : esFaseInicial && !regCompleta
          ? 'Proyectado'
          : 'Por Definir';

      const gL = partidoDB ? Number(partidoDB.golesLocal ?? 0) : null;
      const gV = partidoDB ? Number(partidoDB.golesVisitante ?? 0) : null;

      let ganador: any = null;
      let perdedor: any = null;
      if (partidoDB && partidoDB.estado === 'Finalizado') {
        if ((gL ?? 0) >= (gV ?? 0)) {
          ganador = local;
          perdedor = visitante;
        } else {
          ganador = visitante;
          perdedor = local;
        }
      }

      return {
        idNodo,
        titulo,
        subtitulo,
        partidoOficial: partidoDB || null,
        local,
        visitante,
        golesLocal: gL,
        golesVisitante: gV,
        estado,
        lugar: partidoDB?.lugar || 'Sede Oficial FJH',
        fecha: partidoDB?.fecha || null,
        ganador,
        perdedor,
        ganadorEsLocal: Boolean(ganador && local?.id && ganador.id === local.id),
        ganadorEsVisitante: Boolean(ganador && visitante?.id && ganador.id === visitante.id),
      };
    };

    // Buscar partidos oficiales por instancia
    const cuartosDB = oficiales.filter(
      (p) => (p.fase || '').toLowerCase().includes('cuartos') || p.jornada === 91,
    );
    const semisDB = oficiales.filter(
      (p) => (p.fase || '').toLowerCase().includes('semi') || p.jornada === 92,
    );
    const terceroDB = oficiales.find(
      (p) => (p.fase || '').toLowerCase().includes('tercer') || p.jornada === 98,
    );
    const finalDB = oficiales.find((p) => {
      const f = (p.fase || '').toLowerCase();
      return (f.includes('final') && !f.includes('semi') && !f.includes('cuartos')) || p.jornada === 99;
    });

    // 1. Cuartos de Final (si aplica)
    const tieneCuartos = cfg.codigo === 'cuartos' || cuartosDB.length > 0;
    const cuartos = tieneCuartos
      ? [
          construirNodo('C1', 'Cuartos 1', '1° vs 8°', cuartosDB[0], getClubFromTabla(1), getClubFromTabla(8), true),
          construirNodo('C2', 'Cuartos 2', '4° vs 5°', cuartosDB[1], getClubFromTabla(4), getClubFromTabla(5), true),
          construirNodo('C3', 'Cuartos 3', '2° vs 7°', cuartosDB[2], getClubFromTabla(2), getClubFromTabla(7), true),
          construirNodo('C4', 'Cuartos 4', '3° vs 6°', cuartosDB[3], getClubFromTabla(3), getClubFromTabla(6), true),
        ]
      : [];

    // 2. Semifinales (si aplica)
    const tieneSemis = cfg.codigo === 'cuartos' || cfg.codigo === 'semifinales' || semisDB.length > 0;
    const s1Match = semisDB.find((p) => (p.fase || '').includes('1')) || semisDB[0];
    const s2Match = semisDB.find((p) => (p.fase || '').includes('2')) || (semisDB.length > 1 ? semisDB[1] : undefined);

    const semifinals = tieneSemis
      ? [
          construirNodo(
            'S1',
            'Semifinal 1',
            tieneCuartos ? 'Ganador C1 vs C2' : '1° vs 4° Clasificado',
            s1Match,
            tieneCuartos
              ? cuartos[0]?.ganador || crearPlaceholder('Ganador Cuartos 1', 'C1')
              : getClubFromTabla(1),
            tieneCuartos
              ? cuartos[1]?.ganador || crearPlaceholder('Ganador Cuartos 2', 'C2')
              : getClubFromTabla(4),
            !tieneCuartos,
          ),
          construirNodo(
            'S2',
            'Semifinal 2',
            tieneCuartos ? 'Ganador C3 vs C4' : '2° vs 3° Clasificado',
            s2Match,
            tieneCuartos
              ? cuartos[2]?.ganador || crearPlaceholder('Ganador Cuartos 3', 'C3')
              : getClubFromTabla(2),
            tieneCuartos
              ? cuartos[3]?.ganador || crearPlaceholder('Ganador Cuartos 4', 'C4')
              : getClubFromTabla(3),
            !tieneCuartos,
          ),
        ]
      : [];

    // 3. Gran Final
    const finalMatch = construirNodo(
      'FINAL',
      'Gran Final',
      tieneSemis ? 'Ganador Semifinal 1 vs Semifinal 2' : '1° vs 2° Clasificado',
      finalDB,
      tieneSemis
        ? semifinals[0]?.ganador || crearPlaceholder('Ganador Semifinal 1', 'GS1')
        : getClubFromTabla(1),
      tieneSemis
        ? semifinals[1]?.ganador || crearPlaceholder('Ganador Semifinal 2', 'GS2')
        : getClubFromTabla(2),
      !tieneSemis,
    );

    // 4. Tercer Puesto
    const tercerPuestoMatch =
      tieneSemis && this.torneoSeleccionado()?.tercerPuesto !== false
        ? construirNodo(
            'TERCERO',
            'Tercer Puesto',
            'Perdedor Semifinal 1 vs Semifinal 2',
            terceroDB,
            semifinals[0]?.perdedor || crearPlaceholder('Perdedor Semifinal 1', 'PS1'),
            semifinals[1]?.perdedor || crearPlaceholder('Perdedor Semifinal 2', 'PS2'),
            false,
          )
        : null;

    return {
      tieneCuartos,
      tieneSemis,
      cuartos,
      semifinales: semifinals,
      final: finalMatch,
      tercerPuesto: tercerPuestoMatch,
      campeon: finalMatch.ganador,
    };
  });

  // Sedes únicas disponibles en la jornada
  readonly sedesDisponibles = computed(() => {
    const s = new Set<string>();
    for (const p of this.partidos()) {
      if (p.lugar) s.add(p.lugar);
    }
    return Array.from(s);
  });

  // Formato MM:SS del cronómetro
  readonly timerClockOnly = computed(() => {
    const total = this.matchSeconds();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  readonly timerDisplay = computed(() => {
    const p = this.matchPeriod();
    const prefix = p === 1 ? '1T' : '2T';
    return `${prefix} • ${this.timerClockOnly()}`;
  });

  ngOnInit(): void {
    this.cargarClubes();
    this.route.queryParams.subscribe((params) => {
      const tabParam = params['tab'];
      if (tabParam === 'posiciones' || tabParam === 'playoffs' || tabParam === 'fixture') {
        this.currentTab.set(tabParam);
      }
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
        this.torneos.set(list || []);
        if (list && list.length > 0) {
          const match = initialTorneoId
            ? list.find((t) => t.id === initialTorneoId)
            : list.find((t) => t.estado === 'In Progress' || t.estado === 'En Curso') || list[0];
          this.seleccionarTorneo(match || list[0]);
        } else {
          this.isLoading.set(false);
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.mostrarFeedback('error', 'No se pudieron cargar los torneos oficiales');
      },
    });
  }

  setFiltroCategoria(cat: string): void {
    this.filtroCategoria.set(cat);
    this.sincronizarTorneoConFiltros();
  }

  setFiltroRama(rama: 'Todas' | 'Masculino' | 'Femenino'): void {
    this.filtroRama.set(rama);
    this.sincronizarTorneoConFiltros();
  }

  private sincronizarTorneoConFiltros(): void {
    const filtrados = this.torneosFiltrados();
    const actual = this.torneoSeleccionado();
    if (filtrados.length > 0) {
      if (!actual || !filtrados.some((t) => t.id === actual.id)) {
        this.seleccionarTorneo(filtrados[0]);
      }
    } else {
      this.torneoSeleccionado.set(null);
      this.partidos.set([]);
      this.tablaPosiciones.set([]);
    }
  }

  seleccionarTorneoPorId(id: string): void {
    const found = this.torneos().find((t) => t.id === id) || this.torneosFiltrados()[0];
    if (found) {
      this.seleccionarTorneo(found);
    }
  }

  seleccionarTorneo(t: Torneo): void {
    this.torneoSeleccionado.set(t);
    this.cargarJornadas(t.id);
    this.cargarTabla(t.id);
    this.cargarTodosLosPartidos(t.id);
  }

  cargarTodosLosPartidos(torneoId: string, permitirAutoSync: boolean = true): void {
    this.partidosService.getFixtureByTorneo(torneoId).subscribe({
      next: (list) => {
        const todos = list || [];
        this.todosLosPartidosTorneo.set(todos);

        // Si todos los partidos de fase regular finalizaron y aún no hay llaves eliminatorias registradas
        // (o si finalizó una fase eliminatoria completa), sincronizar automáticamente
        if (permitirAutoSync) {
          const regulares = todos.filter((p: any) => (p.jornada || 1) < 90);
          const playoffs = todos.filter((p: any) => (p.jornada || 1) >= 90);
          const regularCompleta =
            regulares.length > 0 && regulares.every((p: any) => p.estado === 'Finalizado');

          const cuartos = playoffs.filter(
            (p: any) => (p.fase || '').toLowerCase().includes('cuartos') || p.jornada === 91,
          );
          const semis = playoffs.filter(
            (p: any) => (p.fase || '').toLowerCase().includes('semi') || p.jornada === 92,
          );
          const finales = playoffs.filter((p: any) => {
            const f = (p.fase || '').toLowerCase();
            return (f.includes('final') && !f.includes('semi') && !f.includes('cuartos')) || p.jornada === 99;
          });

          const faltaFaseInicial = regularCompleta && playoffs.length === 0;
          const faltaSemis =
            cuartos.length >= 4 &&
            cuartos.every((p: any) => p.estado === 'Finalizado') &&
            semis.length === 0;
          const faltaFinal =
            semis.length >= 2 &&
            semis.every((p: any) => p.estado === 'Finalizado') &&
            finales.length === 0;

          if (faltaFaseInicial || faltaSemis || faltaFinal) {
            this.partidosService.sincronizarPlayoffs(torneoId).subscribe({
              next: (res) => {
                if (res && res.creados > 0) {
                  this.cargarTodosLosPartidos(torneoId, false);
                }
              },
              error: () => {},
            });
          }
        }
      },
      error: () => this.todosLosPartidosTorneo.set([]),
    });
  }

  cargarJornadas(torneoId: string): void {
    this.partidosService.getJornadasDisponibles(torneoId).subscribe({
      next: (ids) => {
        this.jornadasIds.set(ids || []);
        if (ids && ids.length > 0) {
          this.cargarPartidosJornada(torneoId, ids[0]);
        } else {
          this.partidos.set([]);
          this.isLoading.set(false);
        }
      },
      error: () => {
        this.partidos.set([]);
        this.isLoading.set(false);
      },
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

  // ==========================================================
  // MESA DE CONTROL EN VIVO & ACTA DIGITAL HOMOLOGADA
  // ==========================================================

  abrirActa(partido: any, modo: 'en_vivo' | 'post_partido' = 'en_vivo'): void {
    this.partidoSeleccionado.set(partido);
    const esFinalizado = partido.estado === 'Finalizado';
    this.tipoCarga.set(esFinalizado ? 'post_partido' : modo);

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
    this.historialAcciones.set([]);

    // En la nueva UX, abrimos directamente la mesa de control integrada ('acta')
    // y permitimos editar dorsales in-situ o con el tab de dorsales si lo desean
    this.pasoActa.set('acta');

    // Cargar listas de jugadores de ambos clubes
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

  // --- CONTROL DEL TIEMPO & EXCLUSIONES DE 2 MINUTOS ---

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
      this.actualizarContadoresExclusiones();
    }, 1000);
  }

  detenerCronometro(): void {
    this.isTimerRunning.set(false);
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  ajustarTiempoSegundos(delta: number): void {
    this.matchSeconds.update((s) => Math.max(0, s + delta));
  }

  cambiarPeriodo(periodo: 1 | 2): void {
    // Si pasamos del 1T al 2T y aún no se copió el parcial HT, guardarlo automáticamente
    if (this.matchPeriod() === 1 && periodo === 2 && this.htLocal === 0 && this.htVisitante === 0) {
      this.htLocal = this.gLocal;
      this.htVisitante = this.gVisitante;
    }
    this.matchPeriod.set(periodo);
    this.matchSeconds.set(0);
    this.detenerCronometro();
  }

  private actualizarContadoresExclusiones(): void {
    const descontar = (lista: JugadorPlanilla[]) => {
      for (const j of lista) {
        if (j.exclusionRestanteSegundos && j.exclusionRestanteSegundos > 0) {
          j.exclusionRestanteSegundos--;
        }
      }
    };
    descontar(this.jugadoresLocal);
    descontar(this.jugadoresVisitante);
  }

  formatearExclusion(segundos?: number): string {
    if (!segundos || segundos <= 0) return '';
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  solicitarTiempoMuerto(equipo: 'local' | 'visitante'): void {
    const lista = equipo === 'local' ? this.tiemposMuertosLocal : this.tiemposMuertosVisitante;
    const nombreEquipo =
      equipo === 'local'
        ? this.partidoSeleccionado()?.local?.nombre
        : this.partidoSeleccionado()?.visitante?.nombre;

    if (lista.length >= 3) {
      this.mostrarFeedback(
        'error',
        `${nombreEquipo} ya utilizó sus 3 tiempos muertos reglamentarios.`,
      );
      return;
    }

    const enEstePeriodo = lista.filter((t) => t.startsWith(`${this.matchPeriod()}T`)).length;
    if (enEstePeriodo >= 2) {
      this.mostrarFeedback(
        'error',
        `Límite IHF: ${nombreEquipo} ya utilizó 2 tiempos muertos en este ${this.matchPeriod()}º Tiempo.`,
      );
      return;
    }

    this.detenerCronometro();
    const timeStamp = `${this.matchPeriod()}T (${this.timerClockOnly()})`;
    lista.push(timeStamp);
    this.mostrarFeedback(
      'success',
      `Tiempo muerto concedido a ${nombreEquipo} a los ${timeStamp}.`,
    );
  }

  tiemposMuertosEnPeriodo(equipo: 'local' | 'visitante'): number {
    const lista = equipo === 'local' ? this.tiemposMuertosLocal : this.tiemposMuertosVisitante;
    return lista.filter((tiempo) => tiempo.startsWith(`${this.matchPeriod()}T`)).length;
  }

  // --- CARGA DE JUGADORES Y EVENTOS ---

  private cargarJugadoresEquipo(clubId: string, lado: 'local' | 'visitante', eventos: any[]): void {
    this.clubesService.getJugadoresByClub(clubId).subscribe({
      next: (jugadoresFederados) => {
        const torneo = this.torneoSeleccionado();
        const catTorneo = torneo?.categoria?.toLowerCase().trim() || '';
        const ramaTorneo = torneo?.rama?.toLowerCase().trim() || '';

        const oficiales = (jugadoresFederados || [])
          .filter((j: any) => {
            const catEsp = j.categoriaEspecial?.toLowerCase().trim() || '';
            const gen = j.genero?.toLowerCase().trim() || '';

            if (ramaTorneo && gen && !gen.includes(ramaTorneo.slice(0, 4))) return false;
            if (catTorneo.includes('+35')) return catEsp.includes('+35');
            return true;
          })
          .map((j: any, index: number) => this.mapearJugador(j, eventos, clubId, index));

        // Jugadores invitados guardados en los eventos del partido
        const invitadosMap = new Map<string, JugadorPlanilla>();
        (eventos || [])
          .filter((e) => e.equipoId === clubId && !e.jugadorId)
          .forEach((e) => {
            const key = `${e.nombreInvitado || 'Invitado'}-${e.numeroInvitado || 0}`;
            if (!invitadosMap.has(key)) {
              invitadosMap.set(key, {
                id: null,
                nombreCompleto: e.nombreInvitado || 'Invitado',
                numero: Number(e.numeroInvitado) || 0,
                goles: 0,
                am: 0,
                excl: 0,
                roja: false,
                azul: false,
                goles7m: 0,
                errados7m: 0,
              });
            }
            const item = invitadosMap.get(key)!;
            if (e.tipo === 'GOL') item.goles++;
            else if (e.tipo === 'AMARILLA') item.am++;
            else if (e.tipo === 'DOS_MINUTOS') item.excl++;
            else if (e.tipo === 'ROJA') item.roja = true;
            else if (e.tipo === 'AZUL') item.azul = true;
          });

        const list = [...oficiales, ...Array.from(invitadosMap.values())].sort(
          (a, b) => (a.numero || 999) - (b.numero || 999),
        );

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

  private mapearJugador(j: any, eventos: any[], clubId: string, index: number): JugadorPlanilla {
    const ev = eventos || [];
    const evJugador = ev.filter((e) => e.jugadorId === j.id && e.equipoId === clubId);
    const dorsalActa = evJugador.find((e) => e.numeroInvitado && e.numeroInvitado > 0)?.numeroInvitado;

    return {
      id: j.id,
      nombreCompleto: j.nombreCompleto,
      numero: dorsalActa ?? (index + 1),
      goles: evJugador.filter((e) => e.tipo === 'GOL').length,
      am: evJugador.filter((e) => e.tipo === 'AMARILLA').length,
      excl: evJugador.filter((e) => e.tipo === 'DOS_MINUTOS').length,
      roja: evJugador.some((e) => e.tipo === 'ROJA'),
      azul: evJugador.some((e) => e.tipo === 'AZUL'),
      goles7m: 0,
      errados7m: 0,
    };
  }

  // --- ACCIONES DIRECTAS DE PLANILLA EN VIVO ---

  registrarAccionDirecta(
    j: JugadorPlanilla,
    equipo: 'local' | 'visitante',
    accion: 'GOL' | '7M' | '7M_GOL' | '7M_ERRADO' | '2MIN' | 'AMARILLA' | 'ROJA' | 'AZUL',
  ): void {
    if (!this.actaEditable()) return;
    this.equipoActivoActa.set(equipo);
    const esLocal = equipo === 'local';
    const equipoNombre = esLocal
      ? this.partidoSeleccionado()?.local?.nombre || 'Local'
      : this.partidoSeleccionado()?.visitante?.nombre || 'Visita';

    const agregarAlHistorial = (
      tipo: AccionHistorial['tipo'],
      descripcion: string,
    ) => {
      const nuevoEvento: AccionHistorial = {
        id: `${Date.now()}-${Math.random()}`,
        minutoTexto: this.timerClockOnly(),
        periodo: this.matchPeriod(),
        tipo,
        jugador: j,
        equipo,
        equipoNombre,
        descripcion,
      };
      this.historialAcciones.update((prev) => [nuevoEvento, ...prev]);
    };

    switch (accion) {
      case 'GOL':
        j.goles++;
        if (esLocal) this.gLocal++;
        else this.gVisitante++;
        agregarAlHistorial('GOL', `⚽ GOL de #${j.numero || 'S/N'} ${j.nombreCompleto}`);
        break;

      case '7M_GOL':
        j.goles++;
        j.goles7m++;
        if (esLocal) this.gLocal++;
        else this.gVisitante++;
        this.mostrarFeedback(
          'success',
          `🎯 GOL de 7 Metros convertido por #${j.numero} ${j.nombreCompleto}`,
        );
        agregarAlHistorial('7M_GOL', `🎯 Penal 7m (GOL) de #${j.numero || 'S/N'} ${j.nombreCompleto}`);
        break;

      case '7M_ERRADO':
        j.errados7m++;
        this.mostrarFeedback(
          'error',
          `🧤 Penal de 7 Metros atajado / errado por #${j.numero} ${j.nombreCompleto}`,
        );
        agregarAlHistorial('7M_ERRADO', `❌ Penal 7m (Errado) por #${j.numero || 'S/N'} ${j.nombreCompleto}`);
        break;

      case '7M':
        this.jugador7mSeleccionado = j;
        this.equipo7mSeleccionado = equipo;
        this.showModal7Metros.set(true);
        break;

      case '2MIN':
        j.excl++;
        j.exclusionRestanteSegundos = 120; // 2 minutos (120 segs)
        const teniaRojaPrevia = j.roja;
        if (j.excl >= 3) {
          j.roja = true;
          this.mostrarFeedback(
            'error',
            `¡DESCALIFICACIÓN AUTOMÁTICA! #${j.numero} ${j.nombreCompleto} acumuló 3 exclusiones de 2'. Tarjeta Roja.`,
          );
        } else {
          this.mostrarFeedback(
            'success',
            `⏱️ 2 minutos para #${j.numero} ${j.nombreCompleto} (${j.excl}/3)`,
          );
        }
        agregarAlHistorial(
          '2MIN',
          `⏱️ Exclusión 2' a #${j.numero || 'S/N'} ${j.nombreCompleto} ${!teniaRojaPrevia && j.roja ? '(3ra -> ROJA)' : ''}`,
        );
        break;

      case 'AMARILLA':
        j.am = j.am > 0 ? 0 : 1;
        this.mostrarFeedback(
          'success',
          `🟨 Tarjeta Amarilla registrada a #${j.numero} ${j.nombreCompleto}`,
        );
        agregarAlHistorial(
          'AMARILLA',
          `🟨 Tarjeta Amarilla a #${j.numero || 'S/N'} ${j.nombreCompleto}`,
        );
        break;

      case 'ROJA':
        j.roja = !j.roja;
        this.mostrarFeedback(
          'error',
          `🟥 Tarjeta Roja registrada a #${j.numero} ${j.nombreCompleto}`,
        );
        agregarAlHistorial(
          'ROJA',
          `🟥 Tarjeta Roja (Descalificación) a #${j.numero || 'S/N'} ${j.nombreCompleto}`,
        );
        break;

      case 'AZUL':
        j.azul = !j.azul;
        if (j.azul) {
          j.roja = true;
          this.mostrarFeedback(
            'error',
            `🟦 TARJETA AZUL a #${j.numero} ${j.nombreCompleto}. Se generará expediente en el Tribunal de Penas al cerrar el acta.`,
          );
        }
        agregarAlHistorial(
          'AZUL',
          `🟦 Tarjeta Azul (Informe Disciplinario) a #${j.numero || 'S/N'} ${j.nombreCompleto}`,
        );
        break;
    }
  }

  // Compatibilidad con método anterior si se invoca
  aplicarAccionAJugador(j: JugadorPlanilla): void {
    this.registrarAccionDirecta(j, this.equipoActivoActa(), this.accionRapida());
  }

  // Acción instantánea al tocar la camiseta grande en el tablero superior
  tocarCamisetaEnConsola(j: JugadorPlanilla, equipo: 'local' | 'visitante'): void {
    const accionActual = this.accionRapida();
    this.registrarAccionDirecta(j, equipo, accionActual);
    // Si aplicó una tarjeta, exclusión o penal 7m, vuelve automáticamente a modo GOL para seguir anotando rápido
    if (accionActual !== 'GOL') {
      this.accionRapida.set('GOL');
    }
  }

  // Anotar gol rápido directo tocando el botón de camiseta/dorsal
  anotarGolRapidoPorDorsal(j: JugadorPlanilla, equipo: 'local' | 'visitante'): void {
    this.tocarCamisetaEnConsola(j, equipo);
  }

  // Auto-numerar camisetas del 1 al N en un toque
  autoNumerarPlantel(equipo: 'local' | 'visitante'): void {
    const lista = equipo === 'local' ? this.jugadoresLocal : this.jugadoresVisitante;
    lista.forEach((j, idx) => {
      j.numero = idx + 1;
    });
    this.mostrarFeedback('success', `Camisetas numeradas del #1 al #${lista.length} automáticamente.`);
  }

  // Ordenar plantel de menor a mayor número de camiseta
  ordenarPlantelesPorCamiseta(): void {
    this.jugadoresLocal = [...this.jugadoresLocal].sort((a, b) => (Number(a.numero) || 999) - (Number(b.numero) || 999));
    this.jugadoresVisitante = [...this.jugadoresVisitante].sort((a, b) => (Number(a.numero) || 999) - (Number(b.numero) || 999));
    this.modoEditarCamisetas.set(false);
    this.mostrarFeedback('success', 'Camisetas confirmadas y ordenadas para el partido.');
  }

  getApellidoCorto(nombreCompleto: string): string {
    if (!nombreCompleto) return 'JUGADOR';
    const partes = nombreCompleto.split(',');
    return partes[0].trim().substring(0, 12).toUpperCase();
  }

  resolver7Metros(convertido: boolean): void {
    const j = this.jugador7mSeleccionado;
    if (!j) return;
    const equipo = this.equipo7mSeleccionado;
    const esLocal = equipo === 'local';
    const equipoNombre = esLocal
      ? this.partidoSeleccionado()?.local?.nombre || 'Local'
      : this.partidoSeleccionado()?.visitante?.nombre || 'Visita';

    if (convertido) {
      j.goles++;
      j.goles7m++;
      if (esLocal) this.gLocal++;
      else this.gVisitante++;
      this.mostrarFeedback(
        'success',
        `🎯 Gol de 7 Metros convertido por #${j.numero} ${j.nombreCompleto}`,
      );
      this.historialAcciones.update((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          minutoTexto: this.timerClockOnly(),
          periodo: this.matchPeriod(),
          tipo: '7M_GOL',
          jugador: j,
          equipo,
          equipoNombre,
          descripcion: `🎯 Penal 7m (GOL) de #${j.numero} ${j.nombreCompleto}`,
        },
        ...prev,
      ]);
    } else {
      j.errados7m++;
      this.mostrarFeedback(
        'error',
        `❌ Lanzamiento de 7 Metros fallado por #${j.numero} ${j.nombreCompleto}`,
      );
      this.historialAcciones.update((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          minutoTexto: this.timerClockOnly(),
          periodo: this.matchPeriod(),
          tipo: '7M_ERRADO',
          jugador: j,
          equipo,
          equipoNombre,
          descripcion: `❌ Penal 7m (Atajado/Desviado) de #${j.numero} ${j.nombreCompleto}`,
        },
        ...prev,
      ]);
    }

    this.showModal7Metros.set(false);
    this.jugador7mSeleccionado = null;
  }

  // Deshacer la acción más reciente o una acción específica del feed
  deshacerUltimaAccion(accionEspecifica?: AccionHistorial): void {
    const actualList = this.historialAcciones();
    if (actualList.length === 0) {
      this.mostrarFeedback('error', 'No hay acciones registradas en el historial para deshacer.');
      return;
    }

    const objetivo = accionEspecifica || actualList[0];
    this.historialAcciones.set(actualList.filter((item) => item.id !== objetivo.id));

    const j = objetivo.jugador;
    const esLocal = objetivo.equipo === 'local';

    switch (objetivo.tipo) {
      case 'GOL':
        if (j.goles > 0) j.goles--;
        if (esLocal && this.gLocal > 0) this.gLocal--;
        if (!esLocal && this.gVisitante > 0) this.gVisitante--;
        this.mostrarFeedback('success', `Se revirtió el gol de #${j.numero} ${j.nombreCompleto}`);
        break;

      case '7M_GOL':
        if (j.goles > 0) j.goles--;
        if (j.goles7m > 0) j.goles7m--;
        if (esLocal && this.gLocal > 0) this.gLocal--;
        if (!esLocal && this.gVisitante > 0) this.gVisitante--;
        this.mostrarFeedback('success', `Se revirtió el gol de 7m de #${j.numero} ${j.nombreCompleto}`);
        break;

      case '7M_ERRADO':
        if (j.errados7m > 0) j.errados7m--;
        this.mostrarFeedback('success', `Se revirtió el 7m errado de #${j.numero} ${j.nombreCompleto}`);
        break;

      case '2MIN':
        if (j.excl > 0) j.excl--;
        j.exclusionRestanteSegundos = 0;
        if (j.excl < 3 && j.roja) {
          j.roja = false;
        }
        this.mostrarFeedback('success', `Se anuló la exclusión de 2' de #${j.numero} ${j.nombreCompleto}`);
        break;

      case 'AMARILLA':
        j.am = 0;
        this.mostrarFeedback('success', `Se anuló la amarilla de #${j.numero} ${j.nombreCompleto}`);
        break;

      case 'ROJA':
        j.roja = false;
        this.mostrarFeedback('success', `Se anuló la tarjeta roja de #${j.numero} ${j.nombreCompleto}`);
        break;

      case 'AZUL':
        j.azul = false;
        this.mostrarFeedback('success', `Se anuló la tarjeta azul de #${j.numero} ${j.nombreCompleto}`);
        break;
    }
  }

  // Sincronizar marcador automáticamente cuando editan goles en modo post-partido
  recalcularMarcadorDesdePlanilla(): void {
    if (this.tipoCarga() === 'post_partido') {
      this.gLocal = this.jugadoresLocal.reduce((acc, j) => acc + (Number(j.goles) || 0), 0);
      this.gVisitante = this.jugadoresVisitante.reduce((acc, j) => acc + (Number(j.goles) || 0), 0);
    }
  }

  // Invitados manuales
  abrirModalInvitado(equipo?: 'local' | 'visitante'): void {
    if (equipo) {
      this.equipoInvitadoDestino = equipo;
      this.equipoActivoActa.set(equipo);
    } else {
      this.equipoInvitadoDestino = this.equipoActivoActa();
    }
    this.nuevoInvitadoNombre = '';
    this.nuevoInvitadoNumero = null;
    this.showModalInvitado.set(true);
  }

  confirmarInvitado(): void {
    if (!this.nuevoInvitadoNombre.trim()) {
      this.mostrarFeedback('error', 'Ingresa el apellido y nombre del jugador invitado');
      return;
    }
    const inv: JugadorPlanilla = {
      id: null,
      nombreCompleto: this.nuevoInvitadoNombre.toUpperCase().trim(),
      numero: Number(this.nuevoInvitadoNumero) || 99,
      goles: 0,
      am: 0,
      excl: 0,
      roja: false,
      azul: false,
      goles7m: 0,
      errados7m: 0,
    };
    if (this.equipoInvitadoDestino === 'local') {
      this.jugadoresLocal = [...this.jugadoresLocal, inv];
    } else {
      this.jugadoresVisitante = [...this.jugadoresVisitante, inv];
    }
    this.showModalInvitado.set(false);
    this.mostrarFeedback('success', `Jugador #${inv.numero} ${inv.nombreCompleto} agregado a la planilla.`);
  }

  removerInvitado(lista: JugadorPlanilla[], idx: number): void {
    if (!this.canEdit()) return;
    lista.splice(idx, 1);
  }

  // Guardar Parcial ("En Vivo") o Finalizar Acta ("Finalizado")
  guardarActa(finalizar: boolean = false): void {
    if (!this.actaEditable()) {
      this.mostrarFeedback(
        'error',
        'El partido ya se encuentra finalizado y homologado.',
      );
      return;
    }
    const partido = this.partidoSeleccionado();
    if (!partido) return;

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
    ].filter((j) => Number(j.numero) > 0 || j.goles > 0 || j.am > 0 || j.excl > 0 || j.roja || j.azul || j.id === null);

    let obsCompleta = this.observaciones || '';
    if (this.tiemposMuertosLocal.length > 0 && !obsCompleta.includes('TM Local')) {
      obsCompleta += ` | TM Local: ${this.tiemposMuertosLocal.join(', ')}`;
    }
    if (this.tiemposMuertosVisitante.length > 0 && !obsCompleta.includes('TM Visita')) {
      obsCompleta += ` | TM Visita: ${this.tiemposMuertosVisitante.join(', ')}`;
    }

    const payload = {
      golesLocal: Number(this.gLocal) || 0,
      golesVisitante: Number(this.gVisitante) || 0,
      golesLocalHT: Number(this.htLocal) || 0,
      golesVisitanteHT: Number(this.htVisitante) || 0,
      arbitro1: this.arbitro1,
      arbitro2: this.arbitro2,
      cronometrista: this.cronometrista,
      observaciones: obsCompleta.trim(),
      detallesJugadores: planillaFinal,
      estado: finalizar ? 'Finalizado' : 'En Vivo',
    };

    this.partidosService.updateResultado(partido.id, payload).subscribe({
      next: () => {
        this.mostrarFeedback(
          'success',
          finalizar
            ? '¡Acta oficial homologada y cerrada con éxito! Tabla de posiciones actualizada.'
            : 'Avance en vivo guardado y transmitido al Match Center.',
        );
        if (finalizar) {
          this.detenerCronometro();
          this.showModalActa.set(false);
        } else {
          // Mantener el modal abierto si es guardado parcial en vivo, actualizando el estado local
          partido.estado = 'En Vivo';
          partido.golesLocal = payload.golesLocal;
          partido.golesVisitante = payload.golesVisitante;
        }

        const t = this.torneoSeleccionado();
        if (t) {
          this.cargarPartidosJornada(t.id, this.jornadaSeleccionada());
          this.cargarTabla(t.id);
          this.cargarTodosLosPartidos(t.id);
        }
      },
      error: (err) => {
        this.mostrarFeedback('error', err?.error?.error || 'Error al guardar el acta en el servidor');
      },
    });
  }

  imprimirActa(): void {
    window.print();
  }

  // --- ESTADO DE CLASIFICACIÓN EN TABLA Y CONTROL AUTOMÁTICO DE PLAYOFFS ---

  getEstadoClasificacionClub(idx: number): {
    enZona: boolean;
    confirmado: boolean;
    texto: string;
    detalleCruce: string;
  } {
    const cfg = this.configuracionPlayoff();
    const reg = this.estadoFaseRegular();
    const tabla = this.tablaPosiciones();
    const enZona = idx < cfg.cupos;
    const confirmado = reg.completa;

    let detalleCruce = '';
    if (enZona) {
      if (cfg.codigo === 'cuartos') {
        const rivales = [8, 7, 6, 5, 4, 3, 2, 1];
        detalleCruce = `Cruce ${idx + 1}° vs ${rivales[idx]}°`;
      } else if (cfg.codigo === 'semifinales') {
        const rivales = [4, 3, 2, 1];
        detalleCruce = `Cruce ${idx + 1}° vs ${rivales[idx]}°`;
      } else {
        detalleCruce = 'Cruce 1° vs 2°';
      }
    } else if (tabla.length >= cfg.cupos) {
      const ptsCorte = Number(tabla[cfg.cupos - 1]?.puntos ?? 0);
      const ptsActual = Number(tabla[idx]?.puntos ?? 0);
      const diff = Math.max(0, ptsCorte - ptsActual);
      detalleCruce = diff > 0 ? `A ${diff} pts del ${cfg.cupos}° puesto` : `Igualado en pts con el ${cfg.cupos}° (Dif. Gol)`;
    }

    if (enZona) {
      return {
        enZona: true,
        confirmado,
        texto: confirmado
          ? `CLASIFICADO A ${cfg.faseNombre.toUpperCase()}`
          : `EN ZONA DE ${cfg.faseNombre.toUpperCase()}`,
        detalleCruce,
      };
    }

    return {
      enZona: false,
      confirmado,
      texto: confirmado ? 'ELIMINADO EN FASE REGULAR' : 'FUERA DE ZONA DE PLAYOFFS',
      detalleCruce,
    };
  }

  cambiarFaseInicialTorneo(nuevaFase: 'cuartos' | 'semifinales' | 'final'): void {
    const t = this.torneoSeleccionado();
    if (!t || !this.canEdit()) return;

    this.torneoSeleccionado.set({ ...t, faseInicial: nuevaFase });
    this.partidosService
      .sincronizarPlayoffs(t.id, { faseInicial: nuevaFase, regenerarNoJugados: true })
      .subscribe({
        next: (res) => {
          this.mostrarFeedback(
            'success',
            res?.creados > 0
              ? `Fase inicial actualizada a ${res.faseGenerada} y cruces generados automáticamente.`
              : `Fase eliminatoria inicial configurada en ${nuevaFase.toUpperCase()}.`,
          );
          this.cargarTodosLosPartidos(t.id, false);
        },
        error: () => {
          this.mostrarFeedback('error', 'No se pudo actualizar la fase inicial del torneo');
        },
      });
  }

  sincronizarPlayoffsManual(): void {
    const t = this.torneoSeleccionado();
    if (!t) return;
    this.partidosService.sincronizarPlayoffs(t.id, { regenerarNoJugados: true }).subscribe({
      next: (res) => {
        if (res?.creados > 0) {
          this.mostrarFeedback(
            'success',
            `¡Se definieron automáticamente los cruces de ${res.faseGenerada} según la Tabla de Posiciones!`,
          );
        } else if (!res?.regularCompleta) {
          this.mostrarFeedback(
            'error',
            `Aún restan partidos de Fase Regular (${res?.regularesJugados || 0}/${res?.regularesTotales || 0}). Los cruces oficiales se registrarán al finalizar la última fecha.`,
          );
        } else {
          this.mostrarFeedback('success', 'Las llaves eliminatorias ya están sincronizadas con la tabla.');
        }
        this.cargarTodosLosPartidos(t.id, false);
      },
      error: () => {
        this.mostrarFeedback('error', 'Error al sincronizar los playoffs automáticos');
      },
    });
  }

  // --- CREACIÓN / PROGRAMACIÓN DE PARTIDOS DE PLAYOFFS ---

  abrirCrearPlayoff(faseSugerida: string = 'Semifinales'): void {
    this.playoffFase = faseSugerida;
    this.playoffLlave = 'Ida';
    this.playoffLocalId = '';
    this.playoffVisitanteId = '';
    this.playoffFecha = '';
    this.playoffHora = '18:00';
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

    const nombreLlave = this.playoffLlave ? ` (${this.playoffLlave})` : '';
    const payload = {
      torneoId: t.id,
      jornada: 99,
      fase: `${this.playoffFase}${nombreLlave}`,
      localId: this.playoffLocalId,
      visitanteId: this.playoffVisitanteId,
      fecha: this.playoffFecha ? this.playoffFecha : null,
      hora: this.playoffHora || '18:00',
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

  getClubLogoUrl(logoUrl: string | null | undefined): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }
    return `${environment.serverUrl}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
  }

  getClubInitials(club?: { siglas?: string; nombre?: string } | null): string {
    if (!club) return 'CLB';
    if (club.siglas) return club.siglas.toUpperCase();
    return (club.nombre || 'CLB').substring(0, 3).toUpperCase();
  }

  mostrarFeedback(type: 'success' | 'error', message: string): void {
    this.feedback.set({ type, message });
    setTimeout(() => this.feedback.set(null), 4000);
  }
}
