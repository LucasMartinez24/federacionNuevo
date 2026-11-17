import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Club, ClubesService } from '../../../../../core/services/clubes.service';
import { JornadaItem, PartidoItem, PartidosService } from '../../../../../core/services/partidos.service';
import { Torneo, TorneosService } from '../../../../../core/services/torneos.service';
import { environment } from '../../../../../../environments/environment';

@Component({
  selector: 'app-torneo-gestionar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './torneo-gestionar.component.html',
  styleUrl: './torneo-gestionar.component.css',
})
export class TorneoGestionarComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly torneosService = inject(TorneosService);
  private readonly clubesService = inject(ClubesService);
  private readonly partidosService = inject(PartidosService);

  // Estado del Torneo
  readonly torneoId = signal<string | null>(null);
  readonly torneo = signal<Torneo | null>(null);
  readonly loading = signal<boolean>(true);
  readonly isPublishing = signal<boolean>(false);
  readonly isGenerating = signal<boolean>(false);
  readonly jsonCopied = signal<boolean>(false);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sedes Habilitadas
  readonly sedesList = computed<string[]>(() => {
    const t = this.torneo();
    if (!t || !t.sedes) return ['Polideportivo Cuyaya', 'Estadio Federación', 'Club Gorriti'];
    try {
      const parsed = typeof t.sedes === 'string' ? JSON.parse(t.sedes) : t.sedes;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [parsed];
    } catch {
      const list = String(t.sedes).split(',').map((s) => s.trim()).filter(Boolean);
      return list.length > 0 ? list : ['Polideportivo Cuyaya', 'Estadio Federación', 'Club Gorriti'];
    }
  });

  // Padrón de Clubes
  readonly clubesDisponibles = signal<Club[]>([]);
  readonly clubesSeleccionados = signal<Club[]>([]);
  readonly searchClubText = signal<string>('');
  readonly showAddClubDropdown = signal<boolean>(false);

  // Fixture y Jornadas
  readonly jornadas = signal<JornadaItem[]>([]);
  readonly isSyncingPlayoffs = signal<boolean>(false);
  readonly jornadaCreandoPartido = signal<number | null>(null);

  // Borrador rápido por jornada para agregar partido manual eligiendo clubes, fecha, hora y sede
  readonly draftPorJornada = signal<
    Record<
      number,
      {
        localId: string;
        visitanteId: string;
        fecha: string;
        hora: string;
        lugar: string;
        fase: string;
      }
    >
  >({});

  // Separación clara entre Fechas de Fase Regular (< 90) y Fase Eliminatoria / Final (>= 90)
  readonly jornadasRegulares = computed(() =>
    this.jornadas()
      .filter((j) => j.numero < 90)
      .sort((a, b) => a.numero - b.numero)
  );

  readonly jornadasPlayoffs = computed(() =>
    this.jornadas()
      .filter((j) => j.numero >= 90)
      .sort((a, b) => a.numero - b.numero)
  );

  // Lista de clubes disponible para los selectores de partidos manuales
  readonly clubesParaPartidos = computed<Club[]>(() => {
    const sel = this.clubesSeleccionados();
    const disp = this.clubesDisponibles();
    if (sel.length >= 2) {
      // Incluir también cualquier club disponible que ya esté en algún partido
      const map = new Map<string, Club>();
      for (const c of sel) map.set(c.id, c);
      for (const c of disp) {
        if (!map.has(c.id)) map.set(c.id, c);
      }
      return Array.from(map.values());
    }
    return disp;
  });

  // Árbitros Federativos Sugeridos para Designaciones Rápidas FJH
  readonly arbitrosSugeridos: string[] = [
    'Colque, F. (Árb. Nac. A)',
    'Tapia, M. (Árb. Prov.)',
    'Vargas, R. (Árb. Prov.)',
    'Mamaní, J. (Oficial Mesa)',
    'Álvarez, G. (Cronometrista)',
    'Ramos, L. (Árb. Prov.)',
    'Guzmán, D. (Planillero CAH)',
  ];

  // Métricas reactivas
  readonly countEquiposListos = computed(() => this.clubesSeleccionados().length);
  readonly countJornadas = computed(() => this.jornadasRegulares().length);
  readonly countFasesPlayoff = computed(() => this.jornadasPlayoffs().length);
  readonly countPartidosTotales = computed(() =>
    this.jornadas().reduce((acc, j) => acc + j.partidos.length, 0)
  );
  readonly countPartidosRegulares = computed(() =>
    this.jornadasRegulares().reduce((acc, j) => acc + j.partidos.length, 0)
  );
  readonly countPartidosPlayoffs = computed(() =>
    this.jornadasPlayoffs().reduce((acc, j) => acc + j.partidos.length, 0)
  );
  readonly countSinHorario = computed(() => {
    let count = 0;
    for (const j of this.jornadas()) {
      for (const p of j.partidos) {
        if (!p.hora || p.hora.includes('--') || !p.lugar || p.lugar.includes('definir')) {
          count++;
        }
      }
    }
    return count;
  });

  readonly clubesNoSeleccionados = computed(() => {
    const seleccionadosIds = new Set(this.clubesSeleccionados().map((c) => c.id));
    const term = this.searchClubText().toLowerCase().trim();
    return this.clubesDisponibles().filter(
      (c) => !seleccionadosIds.has(c.id) && (c.nombre.toLowerCase().includes(term) || c.siglas.toLowerCase().includes(term))
    );
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.torneoId.set(id);
      this.cargarClubes();
      this.cargarTorneoYFixture(id);
    }
  }

  cargarClubes(): void {
    this.clubesService.getClubes().subscribe({
      next: (clubes) => {
        const list = clubes || [];
        this.clubesDisponibles.set(list);
        if (this.clubesSeleccionados().length === 0 && list.length > 0) {
          this.clubesSeleccionados.set(list.slice(0, 8));
        }
      },
      error: (err) => console.error('Error al cargar clubes:', err),
    });
  }

  cargarTorneoYFixture(id: string): void {
    this.loading.set(true);
    this.torneosService.getTorneoEstructura(id).subscribe({
      next: (t) => {
        this.torneo.set(t);
        this.inicializarEquiposYFixture(t);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al recuperar estructura:', err);
        this.torneosService.getTorneoById(id).subscribe({
          next: (fallback) => {
            this.torneo.set(fallback);
            this.inicializarEquiposYFixture(fallback);
            this.loading.set(false);
          },
          error: (err2) => {
            console.error('Error en fallback torneo:', err2);
            this.loading.set(false);
            this.mostrarFeedback('error', 'No fue posible sincronizar el torneo con el servidor.');
          },
        });
      },
    });
  }

  private inicializarEquiposYFixture(t: Torneo): void {
    // 1. Si el torneo ya tiene posiciones o equipos configurados
    const clubesMap = new Map<string, Club>();
    if (t.tablaPosiciones && t.tablaPosiciones.length > 0) {
      for (const p of t.tablaPosiciones) {
        if (p.club && p.club.id) {
          clubesMap.set(p.club.id, p.club as unknown as Club);
        }
      }
    }
    if (t.partidos && t.partidos.length > 0) {
      for (const p of t.partidos) {
        if (p.local && p.local.id) clubesMap.set(p.local.id, p.local as unknown as Club);
        if (p.visitante && p.visitante.id) clubesMap.set(p.visitante.id, p.visitante as unknown as Club);
      }
    }

    if (clubesMap.size > 0) {
      this.clubesSeleccionados.set(Array.from(clubesMap.values()));
    } else if (this.clubesSeleccionados().length === 0 && this.clubesDisponibles().length > 0) {
      this.clubesSeleccionados.set(this.clubesDisponibles().slice(0, 8));
    }

    // 2. Cargar partidos existentes si los hubiera
    if (t.partidos && t.partidos.length > 0) {
      this.reconstruirJornadasDesdePartidos(t.partidos);
    } else {
      // Buscar via partidosService
      this.partidosService.getFixtureByTorneo(t.id).subscribe({
        next: (partidos) => {
          if (partidos && partidos.length > 0) {
            this.reconstruirJornadasDesdePartidos(partidos);
          } else {
            this.generarRoundRobin(false);
          }
        },
        error: () => {
          this.generarRoundRobin(false);
        },
      });
    }
  }

  private obtenerEtiquetaJornada(numero: number, maxRegular: number): string {
    if (numero === 91) return 'Cuartos de Final • Eliminación Directa';
    if (numero === 92) return 'Semifinales • Llaves de Clasificación a la Final';
    if (numero === 98) return 'Tercer y Cuarto Puesto • Definición Podio';
    if (numero === 99) return 'Gran Final del Torneo • Definición de Campeón';
    if (numero >= 90) return `Fase Eliminatoria (Instancia #${numero})`;

    if (numero === 1) return 'Fecha 1 • Fase Regular (Fecha Inaugural)';
    if (maxRegular > 1 && numero === maxRegular) {
      return `Fecha ${numero} • Fase Regular (Última Fecha Clasificatoria)`;
    }
    return `Fecha ${numero} • Fase Regular (Clasificación)`;
  }

  private obtenerFaseDefaultPorNumero(numero: number): string {
    if (numero === 91) return 'Cuartos de Final • Llave 1';
    if (numero === 92) return 'Semifinal 1 (1° vs 4°)';
    if (numero === 98) return 'Tercer y Cuarto Puesto';
    if (numero === 99) return 'Gran Final (1° Semifinal 1 vs 1° Semifinal 2)';
    return 'Fase Regular';
  }

  private reconstruirJornadasDesdePartidos(partidos: any[]): void {
    const mapaJornadas = new Map<number, PartidoItem[]>();

    // Detectar si la fase regular y semifinales ya finalizaron para eliminar finales prematuras que no correspondan
    const regularesList = partidos.filter((p) => {
      const j = Number(p.jornada) || 1;
      const f = String(p.fase || '').toLowerCase();
      return j < 90 && !f.includes('cuarto') && !f.includes('semifinal') && !f.includes('final') && !f.includes('tercer');
    });
    const faseRegularCompleta =
      regularesList.length > 0 && regularesList.every((p) => p.estado === 'Finalizado');

    const semisList = partidos.filter((p) => {
      const j = Number(p.jornada) || 1;
      const f = String(p.fase || '').toLowerCase();
      return j === 92 || f.includes('semifinal');
    });
    const semifinalesCompletas =
      semisList.length > 0 && semisList.every((p) => p.estado === 'Finalizado');

    for (const p of partidos) {
      let jNum = Number(p.jornada) || 1;
      const faseLower = String(p.fase || '').toLowerCase();
      if (jNum < 90) {
        if (faseLower.includes('cuarto')) jNum = 91;
        else if (faseLower.includes('semifinal')) jNum = 92;
        else if (faseLower.includes('tercer') || faseLower.includes('3°')) jNum = 98;
        else if (faseLower.includes('final')) jNum = 99;
      }

      // Si es una Final o 3° Puesto no jugada y las Semifinales aún no terminaron (o no existen), eliminarla porque no corresponde todavía
      if ((jNum === 98 || jNum === 99) && p.estado !== 'Finalizado' && (!faseRegularCompleta || !semifinalesCompletas)) {
        if (p.id) {
          this.partidosService.deletePartido(p.id).subscribe({ error: () => { } });
        }
        continue;
      }

      if (!mapaJornadas.has(jNum)) {
        mapaJornadas.set(jNum, []);
      }

      let horaStr = '15:00 hs';
      let fechaStr: string | null = null;
      if (p.fecha) {
        try {
          const d = new Date(p.fecha);
          if (!isNaN(d.getTime())) {
            horaStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} hs`;
            fechaStr = d.toISOString().substring(0, 10);
          }
        } catch { }
      }

      mapaJornadas.get(jNum)!.push({
        id: p.id,
        torneoId: p.torneoId,
        jornada: jNum,
        localId: p.localId,
        visitanteId: p.visitanteId,
        local: p.local,
        visitante: p.visitante,
        fecha: fechaStr,
        hora: horaStr,
        lugar: p.lugar || 'Polideportivo Cuyaya',
        estado: p.estado || 'Programado',
        fase: p.fase || this.obtenerFaseDefaultPorNumero(jNum),
        grupo: p.grupo,
        golesLocal: p.golesLocal ?? null,
        golesVisitante: p.golesVisitante ?? null,
        arbitro1: p.arbitro1 || '',
        arbitro2: p.arbitro2 || '',
        cronometrista: p.cronometrista || '',
        observaciones: p.observaciones || '',
        showDesignaciones: false,
      });
    }

    const jornadasResult: JornadaItem[] = [];
    const numerosOrdenados = Array.from(mapaJornadas.keys()).sort((a, b) => a - b);
    const regularesNums = numerosOrdenados.filter((n) => n < 90);
    const maxRegular = regularesNums.length > 0 ? Math.max(...regularesNums) : 1;

    for (const n of numerosOrdenados) {
      const items = mapaJornadas.get(n)!;
      if (items.length === 0) continue;
      const primerFecha = items.find((x) => x.fecha)?.fecha;
      const primerSede = items[0]?.lugar || this.sedesList()[0] || 'Polideportivo Cuyaya';

      jornadasResult.push({
        numero: n,
        nombre: this.obtenerEtiquetaJornada(n, maxRegular),
        fechaDefault: primerFecha || undefined,
        sedeDefault: primerSede,
        isExpanded: n <= 2 || n >= 90,
        partidos: items,
      });
    }

    this.jornadas.set(jornadasResult);
    this.inicializarDraftsJornadas(jornadasResult);
  }

  private inicializarDraftsJornadas(list: JornadaItem[]): void {
    const clubes = this.clubesParaPartidos();
    const c1 = clubes[0]?.id || '';
    const c2 = clubes[1]?.id || clubes[0]?.id || '';
    const current = { ...this.draftPorJornada() };

    for (const j of list) {
      if (!current[j.numero]) {
        current[j.numero] = {
          localId: c1,
          visitanteId: c2,
          fecha: j.fechaDefault || '',
          hora: '15:00 hs',
          lugar: j.sedeDefault || this.sedesList()[0] || 'Polideportivo Cuyaya',
          fase: this.obtenerFaseDefaultPorNumero(j.numero),
        };
      }
    }
    this.draftPorJornada.set(current);
  }

  getDraft(jornada: JornadaItem) {
    const map = this.draftPorJornada();
    if (map[jornada.numero]) return map[jornada.numero];
    const clubes = this.clubesParaPartidos();
    return {
      localId: clubes[0]?.id || '',
      visitanteId: clubes[1]?.id || clubes[0]?.id || '',
      fecha: jornada.fechaDefault || '',
      hora: '15:00 hs',
      lugar: jornada.sedeDefault || this.sedesList()[0] || 'Polideportivo Cuyaya',
      fase: this.obtenerFaseDefaultPorNumero(jornada.numero),
    };
  }

  updateDraft(
    numero: number,
    campo: 'localId' | 'visitanteId' | 'fecha' | 'hora' | 'lugar' | 'fase',
    valor: string
  ): void {
    const jornada = this.jornadas().find((j) => j.numero === numero);
    const base = jornada
      ? this.getDraft(jornada)
      : {
        localId: '',
        visitanteId: '',
        fecha: '',
        hora: '15:00 hs',
        lugar: this.sedesList()[0] || 'Polideportivo Cuyaya',
        fase: this.obtenerFaseDefaultPorNumero(numero),
      };
    this.draftPorJornada.update((prev) => ({
      ...prev,
      [numero]: {
        ...base,
        [campo]: valor,
      },
    }));
  }

  invertirDraft(jornada: JornadaItem): void {
    const actual = this.getDraft(jornada);
    this.draftPorJornada.update((prev) => ({
      ...prev,
      [jornada.numero]: {
        ...actual,
        localId: actual.visitanteId,
        visitanteId: actual.localId,
      },
    }));
  }

  // --- GENERACIÓN ROUND ROBIN BERGER ---
  generarRoundRobin(mostrarToast: boolean = true): void {
    const clubes = this.clubesParaPartidos();
    if (clubes.length < 2) {
      if (mostrarToast) {
        this.mostrarFeedback('error', 'Selecciona al menos 2 clubes en el padrón para generar el fixture.');
      }
      return;
    }

    if (this.clubesSeleccionados().length < 2) {
      this.clubesSeleccionados.set(clubes.slice(0, 8));
    }

    this.isGenerating.set(true);
    const idaVuelta = this.torneo()?.idaVuelta ?? true;
    const sedes = this.sedesList();

    const nuevasRegulares = this.partidosService.generarFixture(this.clubesSeleccionados(), idaVuelta, sedes);
    const maxReg = nuevasRegulares.length;
    const etiquetadas = nuevasRegulares.map((j) => ({
      ...j,
      nombre: this.obtenerEtiquetaJornada(j.numero, maxReg),
    }));

    // Conservar llaves de playoffs que ya existieran
    const playoffsActuales = this.jornadasPlayoffs();
    const combinadas = [...etiquetadas, ...playoffsActuales];

    this.jornadas.set(combinadas);
    this.inicializarDraftsJornadas(combinadas);
    this.isGenerating.set(false);

    if (mostrarToast) {
      this.mostrarFeedback(
        'success',
        `Calendario de Fase Regular generado: ${etiquetadas.length} fechas de clasificación (${this.countPartidosRegulares()} partidos).`
      );
    }
  }

  // --- GESTIÓN DE PADRÓN DE EQUIPOS ---
  agregarClub(club: Club): void {
    if (!this.clubesSeleccionados().some((c) => c.id === club.id)) {
      this.clubesSeleccionados.update((list) => [...list, club]);
      this.searchClubText.set('');
      this.showAddClubDropdown.set(false);
      this.mostrarFeedback('success', `Club ${club.nombre} agregado al padrón.`);
    }
  }

  removerClub(clubId: string): void {
    this.clubesSeleccionados.update((list) => list.filter((c) => c.id !== clubId));
    // Eliminar partidos no jugados donde figuraba ese club y limpiar fechas que queden vacías
    this.jornadas.update((list) => {
      const depuradas: JornadaItem[] = [];
      for (const j of list) {
        const restantes: PartidoItem[] = [];
        for (const p of j.partidos) {
          const involucrado = p.localId === clubId || p.visitanteId === clubId;
          if (involucrado && p.estado !== 'Finalizado') {
            if (p.id) {
              this.partidosService.deletePartido(p.id).subscribe({ error: () => { } });
            }
          } else {
            restantes.push(p);
          }
        }
        if (restantes.length > 0) {
          depuradas.push({ ...j, partidos: restantes });
        }
      }
      return depuradas;
    });
  }

  abrirCreadorPartido(jornada: JornadaItem): void {
    if (this.jornadaCreandoPartido() === jornada.numero) {
      this.jornadaCreandoPartido.set(null);
      return;
    }
    this.inicializarDraftsJornadas(this.jornadas());
    this.jornadaCreandoPartido.set(jornada.numero);
  }

  cancelarCreadorPartido(): void {
    this.jornadaCreandoPartido.set(null);
  }

  // --- ACCIONES EN PARTIDOS Y EDICIÓN MANUAL DE EQUIPOS ---
  cambiarClubPartido(partido: PartidoItem, rol: 'local' | 'visitante', clubId: string): void {
    const clubObj =
      this.clubesParaPartidos().find((c) => c.id === clubId) ||
      this.clubesDisponibles().find((c) => c.id === clubId);

    if (!clubObj) return;

    if (rol === 'local') {
      partido.localId = clubObj.id;
      partido.local = clubObj;
    } else {
      partido.visitanteId = clubObj.id;
      partido.visitante = clubObj;
    }

    // Asegurar que el club elegido forme parte del padrón del torneo
    if (!this.clubesSeleccionados().some((c) => c.id === clubObj.id)) {
      this.clubesSeleccionados.update((list) => [...list, clubObj]);
    }

    this.jornadas.update((list) => [...list]);
  }

  invertirLocalia(partido: PartidoItem): void {
    const tempLocal = partido.local;
    const tempLocalId = partido.localId;
    partido.local = partido.visitante;
    partido.localId = partido.visitanteId;
    partido.visitante = tempLocal;
    partido.visitanteId = tempLocalId;
    this.jornadas.update((list) => [...list]);
  }

  invertirLocaliasJornada(jornada: JornadaItem): void {
    for (const p of jornada.partidos) {
      this.invertirLocalia(p);
    }
    this.jornadas.update((list) => [...list]);
    this.mostrarFeedback('success', `Localías invertidas para ${jornada.nombre}.`);
  }

  toggleDesignaciones(partido: PartidoItem): void {
    partido.showDesignaciones = !partido.showDesignaciones;
    this.jornadas.update((list) => [...list]);
  }

  setArbitroRapido(partido: PartidoItem, campo: 'arbitro1' | 'arbitro2' | 'cronometrista', nombre: string): void {
    partido[campo] = nombre;
    this.jornadas.update((list) => [...list]);
  }

  // Batch Horarios Escalona (+75 min)
  aplicarOffsetJornada(jornada: JornadaItem, horaInicio: string = '15:00', intervaloMin: number = 75): void {
    let [hStr, mStr] = horaInicio.split(':');
    let minutes = (parseInt(hStr, 10) || 15) * 60 + (parseInt(mStr, 10) || 0);

    for (const p of jornada.partidos) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      p.hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} hs`;
      if (jornada.sedeDefault) {
        p.lugar = jornada.sedeDefault;
      }
      if (jornada.fechaDefault) {
        p.fecha = jornada.fechaDefault;
      }
      minutes += intervaloMin;
    }
    this.jornadas.update((list) => [...list]);
    this.mostrarFeedback('success', `Horarios escalonados (+${intervaloMin} min) aplicados a ${jornada.nombre}.`);
  }

  aplicarSedeATodos(jornada: JornadaItem, sede: string): void {
    jornada.sedeDefault = sede;
    for (const p of jornada.partidos) {
      p.lugar = sede;
    }
    this.updateDraft(jornada.numero, 'lugar', sede);
    this.jornadas.update((list) => [...list]);
  }

  aplicarFechaATodos(jornada: JornadaItem, fecha: string): void {
    jornada.fechaDefault = fecha;
    for (const p of jornada.partidos) {
      p.fecha = fecha;
    }
    this.updateDraft(jornada.numero, 'fecha', fecha);
    this.jornadas.update((list) => [...list]);
  }

  agregarPartidoManual(jornada: JornadaItem): void {
    const clubes = this.clubesParaPartidos();
    if (clubes.length < 2) {
      this.mostrarFeedback('error', 'No hay suficientes clubes cargados para crear un partido.');
      return;
    }

    const draft = this.getDraft(jornada);
    let localClub = clubes.find((c) => c.id === draft.localId) || clubes[0];
    let visitanteClub =
      clubes.find((c) => c.id === draft.visitanteId) ||
      clubes.find((c) => c.id !== localClub.id) ||
      clubes[1] ||
      clubes[0];

    if (localClub.id === visitanteClub.id && clubes.length > 1) {
      visitanteClub = clubes.find((c) => c.id !== localClub.id) || visitanteClub;
    }

    // Asegurar que ambos clubes estén en el padrón del torneo
    for (const c of [localClub, visitanteClub]) {
      if (!this.clubesSeleccionados().some((sel) => sel.id === c.id)) {
        this.clubesSeleccionados.update((list) => [...list, c]);
      }
    }

    const nuevo: PartidoItem = {
      jornada: jornada.numero,
      localId: localClub.id,
      visitanteId: visitanteClub.id,
      local: localClub,
      visitante: visitanteClub,
      fecha: draft.fecha || jornada.fechaDefault || null,
      hora: draft.hora || '15:00 hs',
      lugar: draft.lugar || jornada.sedeDefault || this.sedesList()[0] || 'Polideportivo Cuyaya',
      estado: 'Programado',
      fase: draft.fase || this.obtenerFaseDefaultPorNumero(jornada.numero),
      arbitro1: '',
      arbitro2: '',
      cronometrista: '',
      observaciones: '',
      showDesignaciones: false,
    };

    jornada.isExpanded = true;
    jornada.partidos = [...jornada.partidos, nuevo];
    this.jornadas.update((list) => [...list]);
    this.jornadaCreandoPartido.set(null);

    const etiquetaDestino =
      jornada.numero < 90 ? `Fecha ${jornada.numero} (Fase Regular)` : jornada.nombre || 'Fase Eliminatoria';
    this.mostrarFeedback(
      'success',
      `Partido ${localClub.nombre} vs ${visitanteClub.nombre} agregado a ${etiquetaDestino}. Recuerda "Publicar Fixture Oficial" para guardar.`
    );
  }

  eliminarPartido(jornada: JornadaItem, index: number): void {
    const partido = jornada.partidos[index];
    jornada.partidos = jornada.partidos.filter((_, i) => i !== index);
    this.jornadas.update((list) => [...list]);

    if (partido?.id) {
      this.partidosService.deletePartido(partido.id).subscribe({
        next: () => {
          this.mostrarFeedback('success', 'Partido eliminado de la fecha y del servidor.');
        },
        error: () => {
          this.mostrarFeedback('success', 'Partido quitado de la lista. Publica el fixture para confirmar.');
        },
      });
    }
  }

  agregarNuevaJornada(): void {
    const regulares = this.jornadasRegulares();
    const maxReg = regulares.length > 0 ? Math.max(...regulares.map((j) => j.numero)) : 0;
    const nuevoNum = maxReg + 1;

    const nueva: JornadaItem = {
      numero: nuevoNum,
      nombre: `Fecha ${nuevoNum} • Fase Regular (Clasificación)`,
      sedeDefault: this.sedesList()[0] || 'Polideportivo Cuyaya',
      isExpanded: true,
      partidos: [],
    };

    this.jornadas.update((list) => {
      const actualizadas = [...list, nueva].sort((a, b) => a.numero - b.numero);
      const maxR = Math.max(...actualizadas.filter((x) => x.numero < 90).map((x) => x.numero), 1);
      return actualizadas.map((j) => ({
        ...j,
        nombre: j.numero < 90 ? this.obtenerEtiquetaJornada(j.numero, maxR) : j.nombre,
      }));
    });
    this.inicializarDraftsJornadas(this.jornadas());
    this.jornadaCreandoPartido.set(nuevoNum);
    this.mostrarFeedback('success', `Fecha ${nuevoNum} de Fase Regular añadida. Selecciona los clubes para agregar partidos.`);
  }

  agregarInstanciaPlayoff(tipo: 'cuartos' | 'semifinales' | 'tercero' | 'final'): void {
    const mapaConfig: Record<
      'cuartos' | 'semifinales' | 'tercero' | 'final',
      { numero: number; nombre: string; faseDefault: string }
    > = {
      cuartos: {
        numero: 91,
        nombre: 'Cuartos de Final • Eliminación Directa',
        faseDefault: 'Cuartos de Final • Llave 1 (1° vs 8°)',
      },
      semifinales: {
        numero: 92,
        nombre: 'Semifinales • Llaves de Clasificación a la Final',
        faseDefault: 'Semifinal 1 (1° vs 4°)',
      },
      tercero: {
        numero: 98,
        nombre: 'Tercer y Cuarto Puesto • Definición Podio',
        faseDefault: 'Tercer y Cuarto Puesto',
      },
      final: {
        numero: 99,
        nombre: 'Gran Final del Torneo • Definición de Campeón',
        faseDefault: 'Gran Final (1° Semifinal 1 vs 1° Semifinal 2)',
      },
    };

    const cfg = mapaConfig[tipo];
    const existente = this.jornadas().find((j) => j.numero === cfg.numero);

    if (existente) {
      existente.isExpanded = true;
      this.jornadas.update((list) => [...list]);
      this.jornadaCreandoPartido.set(cfg.numero);
      return;
    }

    const nuevaInstancia: JornadaItem = {
      numero: cfg.numero,
      nombre: cfg.nombre,
      sedeDefault: this.sedesList()[0] || 'Polideportivo Cuyaya',
      isExpanded: true,
      partidos: [],
    };

    this.jornadas.update((list) => [...list, nuevaInstancia].sort((a, b) => a.numero - b.numero));
    this.inicializarDraftsJornadas(this.jornadas());
    this.updateDraft(cfg.numero, 'fase', cfg.faseDefault);
    this.jornadaCreandoPartido.set(cfg.numero);
  }

  sincronizarPlayoffsDesdeTabla(): void {
    const id = this.torneoId();
    if (!id) return;

    this.isSyncingPlayoffs.set(true);
    this.partidosService.sincronizarPlayoffs(id, { regenerarNoJugados: true }).subscribe({
      next: (res) => {
        this.isSyncingPlayoffs.set(false);
        this.partidosService.getFixtureByTorneo(id).subscribe({
          next: (partidos) => {
            this.reconstruirJornadasDesdePartidos(partidos || []);
            this.mostrarFeedback(
              'success',
              res?.mensaje || 'Fase eliminatoria sincronizada automáticamente según la Tabla de Posiciones.'
            );
          },
          error: () => {
            this.mostrarFeedback('success', 'Playoffs sincronizados.');
          },
        });
      },
      error: (err) => {
        console.error('Error sincronizando playoffs:', err);
        this.isSyncingPlayoffs.set(false);
        this.mostrarFeedback('error', 'No se pudo sincronizar automáticamente las llaves de playoffs.');
      },
    });
  }

  eliminarJornadaPorNumero(numero: number): void {
    const jornada = this.jornadas().find((j) => j.numero === numero);
    if (jornada && jornada.partidos.some((p) => !!p.id)) {
      for (const p of jornada.partidos) {
        if (p.id) {
          this.partidosService.deletePartido(p.id).subscribe({ error: () => { } });
        }
      }
    }
    this.jornadas.update((list) => list.filter((j) => j.numero !== numero));
    this.mostrarFeedback(
      'success',
      numero < 90 ? `Fecha ${numero} eliminada.` : 'Instancia eliminatoria eliminada.'
    );
  }

  eliminarJornada(index: number): void {
    const target = this.jornadas()[index];
    if (target) {
      this.eliminarJornadaPorNumero(target.numero);
    }
  }

  toggleJornada(jornada: JornadaItem): void {
    jornada.isExpanded = !jornada.isExpanded;
    this.jornadas.update((list) => [...list]);
  }

  expandirTodas(expand: boolean): void {
    for (const j of this.jornadas()) {
      j.isExpanded = expand;
    }
    this.jornadas.update((list) => [...list]);
  }

  // --- PERSISTENCIA & PUBLICACIÓN ---
  publicarFixture(): void {
    const t = this.torneo();
    if (!t) return;

    if (this.jornadas().length === 0) {
      this.mostrarFeedback('error', 'Genera o agrega partidos antes de publicar el fixture.');
      return;
    }

    this.isPublishing.set(true);

    // Normalizar partidos para enviar
    const payload = this.jornadas().map((j) => ({
      numero: j.numero,
      partidos: j.partidos.map((p) => {
        let horaClean = p.hora || '15:00';
        horaClean = horaClean.replace('hs', '').trim();
        if (!horaClean.includes(':') || horaClean.includes('--')) horaClean = '15:00';

        return {
          id: p.id,
          localId: p.localId,
          visitanteId: p.visitanteId,
          fecha: p.fecha || j.fechaDefault || null,
          hora: horaClean,
          lugar: p.lugar || j.sedeDefault || 'Polideportivo Cuyaya',
          estado: p.estado || 'Programado',
          fase: p.fase || this.obtenerFaseDefaultPorNumero(j.numero),
          grupo: p.grupo || null,
          arbitro1: p.arbitro1 || null,
          arbitro2: p.arbitro2 || null,
          cronometrista: p.cronometrista || null,
          observaciones: p.observaciones || null,
        };
      }),
    }));

    const clubesIds = this.clubesSeleccionados().map((c) => c.id);

    this.partidosService.saveFixture(t.id, payload as any, clubesIds).subscribe({
      next: () => {
        this.isPublishing.set(false);
        this.mostrarFeedback('success', '¡Fixture, fechas manuales y llaves publicadas con éxito en el servidor oficial FJH!');
        // Recargar los partidos desde el servidor para obtener los IDs asignados por Prisma
        this.partidosService.getFixtureByTorneo(t.id).subscribe({
          next: (partidos) => {
            if (partidos && partidos.length > 0) {
              this.reconstruirJornadasDesdePartidos(partidos);
            }
          },
        });
      },
      error: (err) => {
        console.error('Error al guardar fixture:', err);
        this.isPublishing.set(false);
        this.mostrarFeedback('error', 'Error al sincronizar el fixture con la base de datos.');
      },
    });
  }

  // --- COPIA BACKUP JSON ---
  copiarBackupJSON(): void {
    const exportData = {
      torneo: this.torneo()?.nombre,
      categoria: this.torneo()?.categoria,
      temporada: this.torneo()?.temporada,
      jornadas: this.jornadas(),
    };
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => {
      this.jsonCopied.set(true);
      setTimeout(() => this.jsonCopied.set(false), 2000);
      this.mostrarFeedback('success', 'Estructura JSON copiada al portapapeles.');
    });
  }

  mostrarFeedback(type: 'success' | 'error', message: string): void {
    this.actionFeedback.set({ type, message });
    setTimeout(() => {
      this.actionFeedback.set(null);
    }, 4500);
  }

  getClubLogoUrl(logoUrl: string | null | undefined): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }
    return `${environment.serverUrl}${logoUrl}`;
  }

  getClubInitials(club: any): string {
    if (!club) return 'FJH';
    if (club.siglas && String(club.siglas).trim().length > 0) {
      return String(club.siglas).trim().toUpperCase().substring(0, 4);
    }
    const nombre = String(club.nombre || '').trim();
    if (!nombre) return 'FJH';
    const partes = nombre.split(/\s+/).filter(Boolean);
    if (partes.length >= 2) {
      return partes
        .slice(0, 3)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
    }
    return nombre.substring(0, 3).toUpperCase();
  }
}
