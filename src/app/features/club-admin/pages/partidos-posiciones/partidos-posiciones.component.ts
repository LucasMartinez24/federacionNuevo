import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { PartidosService } from '../../../../core/services/partidos.service';
import { PosicionClub, Torneo, TorneosService } from '../../../../core/services/torneos.service';

export interface JugadorActaEvento {
  dorsal: number | string;
  nombre: string;
  goles: number;
  amarillas: number;
  dosMinutos: number;
  roja: boolean;
  azul: boolean;
  esInvitado: boolean;
}

export interface PartidoClubDisplay {
  id: string;
  torneoId: string;
  torneoNombre: string;
  torneoCat: string;
  torneoRama: string;
  jornada: number;
  esLocal: boolean;
  rivalNombre: string;
  rivalSiglas: string;
  rivalLogoUrl?: string | null;
  rivalEsInvitado?: boolean;
  clubLogoUrl?: string | null;
  clubNombre: string;
  clubSiglas: string;
  golesClub: number;
  golesRival: number;
  fechaStr: string;
  horaStr: string;
  cancha: string;
  estado: string; // 'Programado' | 'En Vivo' | 'Finalizado'
  resultadoTipo: 'victoria' | 'empate' | 'derrota' | 'pendiente';
  puntosSumados: number;
  goleadorDestacado?: string;
  duplaArbitral: string;
  cronometrista?: string;
  observaciones?: string;
  jugadoresClub: JugadorActaEvento[];
  jugadoresRival: JugadorActaEvento[];
}

@Component({
  selector: 'app-partidos-posiciones',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './partidos-posiciones.component.html',
  styleUrl: './partidos-posiciones.component.css',
})
export class PartidosPosicionesComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly clubesService = inject(ClubesService);
  private readonly partidosService = inject(PartidosService);
  private readonly torneosService = inject(TorneosService);

  protected readonly serverUrl = environment.serverUrl;
  protected readonly currentUser = this.authService.currentUser;

  // Estado del Club
  protected readonly club = signal<Club | null>(null);
  protected readonly loading = signal<boolean>(true);

  // Selector de vista
  protected readonly currentView = signal<'agenda' | 'standings' | 'fixture_general' | 'playoffs'>('agenda');

  // Filtros: Categoría y Rama oficiales
  protected readonly selectedCategory = signal<string>('TODAS');
  protected readonly selectedRama = signal<'TODAS' | 'Masc' | 'Fem'>('TODAS');

  // Datos reales
  protected readonly partidos = signal<any[]>([]);
  protected readonly todosPartidosTorneo = signal<any[]>([]);
  protected readonly torneos = signal<Torneo[]>([]);
  protected readonly tablaPosiciones = signal<PosicionClub[]>([]);
  protected readonly torneoActivo = signal<Torneo | null>(null);

  // Jornada seleccionada para la vista de Fixture General de Torneos
  protected readonly jornadaTorneoSeleccionada = signal<number>(1);
  protected readonly filtroTextoFixture = signal<string>('');
  protected readonly filtroEstadoFixture = signal<string>('TODOS');

  // Selector desplegable visual de torneos
  protected readonly selectorTorneosAbierto = signal<boolean>(false);

  // Torneos filtrados opcionalmente según categoría y rama
  protected readonly torneosDisponibles = computed(() => {
    const list = this.torneos();
    const cat = this.selectedCategory();
    const rama = this.selectedRama();

    return list.filter((t) => {
      const tCat = (t.categoria || '').toLowerCase();
      const tRama = (t.rama || '').toLowerCase();
      const tNom = (t.nombre || '').toLowerCase();

      let matchCat = true;
      if (cat !== 'TODAS') {
        if (cat === 'PRIMERA') matchCat = tCat.includes('primera') || tNom.includes('primera');
        else if (cat === 'JUVENILES') matchCat = tCat.includes('juvenil') || tNom.includes('juvenil');
        else if (cat === 'CADETES') matchCat = tCat.includes('cadete') || tNom.includes('cadete');
        else if (cat === 'MENORES') matchCat = tCat.includes('menor') || tNom.includes('menor');
      }

      let matchRama = true;
      if (rama === 'Masc') matchRama = tRama.includes('masc') || tNom.includes('masc');
      else if (rama === 'Fem') matchRama = tRama.includes('fem') || tNom.includes('fem');

      return matchCat && matchRama;
    });
  });

  // Modal Acta / Detalle
  protected readonly partidoActaSeleccionado = signal<PartidoClubDisplay | null>(null);

  // Categorías de filtro disponibles (Menores hasta Primera)
  protected readonly categoriasFiltro = [
    { label: 'Todas las Categorías', value: 'TODAS' },
    { label: 'Primera División', value: 'PRIMERA' },
    { label: 'Juveniles (Sub-18)', value: 'JUVENILES' },
    { label: 'Cadetes (Sub-16)', value: 'CADETES' },
    { label: 'Menores (Sub-14)', value: 'MENORES' },
  ];

  // Identificador del club
  protected readonly clubId = computed(() => this.currentUser()?.id || '');

  // Partidos procesados y adaptados para la vista del club
  protected readonly partidosProcesados = computed<PartidoClubDisplay[]>(() => {
    const cid = this.clubId();
    const rawList = this.partidos();
    const cat = this.selectedCategory();
    const rama = this.selectedRama();

    return rawList
      .filter((p) => {
        const torneoCat = (p.torneo?.categoria || '').toLowerCase();
        const torneoRama = (p.torneo?.rama || p.rama || '').toLowerCase();
        const comp = (p.torneo?.nombre || '').toLowerCase();

        // 1. Filtro de Categoría
        if (cat !== 'TODAS') {
          if (cat === 'PRIMERA' && !torneoCat.includes('primera') && !comp.includes('primera')) return false;
          if (cat === 'JUVENILES' && !torneoCat.includes('juvenil') && !comp.includes('juvenil')) return false;
          if (cat === 'CADETES' && !torneoCat.includes('cadete') && !comp.includes('cadete')) return false;
          if (cat === 'MENORES' && !torneoCat.includes('menor') && !comp.includes('menor')) return false;
        }

        // 2. Filtro de Rama (Masc / Fem)
        if (rama === 'Masc') {
          const isMasc = torneoRama.includes('masc') || comp.includes('masc');
          const isFem = torneoRama.includes('fem') || comp.includes('fem');
          if (isFem && !isMasc) return false;
        } else if (rama === 'Fem') {
          const isFem = torneoRama.includes('fem') || comp.includes('fem');
          if (!isFem) return false;
        }

        return true;
      })
      .map((p) => {
        const esLocal = p.localId === cid;
        const miClub = esLocal ? p.local : p.visitante;
        const rival = esLocal ? p.visitante : p.local;

        const golesClub = esLocal ? (p.golesLocal ?? 0) : (p.golesVisitante ?? 0);
        const golesRival = esLocal ? (p.golesVisitante ?? 0) : (p.golesLocal ?? 0);

        let resultadoTipo: 'victoria' | 'empate' | 'derrota' | 'pendiente' = 'pendiente';
        let puntosSumados = 0;

        if (p.estado === 'Finalizado') {
          if (golesClub > golesRival) {
            resultadoTipo = 'victoria';
            puntosSumados = 3;
          } else if (golesClub === golesRival) {
            resultadoTipo = 'empate';
            puntosSumados = 1;
          } else {
            resultadoTipo = 'derrota';
            puntosSumados = 0;
          }
        }

        // Formato de fecha
        let fechaStr = 'Fecha a definir';
        let horaStr = '16:00';
        if (p.fecha) {
          const d = new Date(p.fecha);
          if (!isNaN(d.getTime())) {
            const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
            const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
            fechaStr = `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
            horaStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          }
        }

        // Dupla arbitral
        const dupla = [p.arbitro1, p.arbitro2].filter(Boolean).join(' - ') || 'Mesa Oficial FJH';

        // Procesar información completa del acta: Goles, Tarjetas, Exclusiones y Camisetas por equipo
        const eventos = p.eventos || [];
        const parseEventosEquipo = (equipoId: string): JugadorActaEvento[] => {
          const mapa = new Map<string, JugadorActaEvento>();

          eventos.forEach((ev: any) => {
            if (ev.equipoId !== equipoId) return;
            const key = ev.jugadorId || `inv-${ev.nombreInvitado || 'Jugador'}-${ev.numeroInvitado || 0}`;

            if (!mapa.has(key)) {
              mapa.set(key, {
                dorsal: ev.numeroInvitado ?? (ev.jugador?.numero ?? '-'),
                nombre: ev.jugador?.nombreCompleto || ev.nombreInvitado || 'Atleta',
                goles: 0,
                amarillas: 0,
                dosMinutos: 0,
                roja: false,
                azul: false,
                esInvitado: !ev.jugadorId,
              });
            }

            const j = mapa.get(key)!;
            if (ev.tipo === 'GOL') j.goles++;
            else if (ev.tipo === 'AMARILLA') j.amarillas++;
            else if (ev.tipo === 'DOS_MINUTOS') j.dosMinutos++;
            else if (ev.tipo === 'ROJA') j.roja = true;
            else if (ev.tipo === 'AZUL') j.azul = true;
          });

          return Array.from(mapa.values()).sort((a, b) => {
            const numA = Number(a.dorsal) || 999;
            const numB = Number(b.dorsal) || 999;
            return numA - numB;
          });
        };

        const miEquipoId = esLocal ? p.localId : p.visitanteId;
        const rivalEquipoId = esLocal ? p.visitanteId : p.localId;
        const jugadoresClub = parseEventosEquipo(miEquipoId);
        const jugadoresRival = parseEventosEquipo(rivalEquipoId);

        // Goleador del partido para el club
        let goleadorDestacado = '';
        if (jugadoresClub.length > 0) {
          const topG = [...jugadoresClub].sort((a, b) => b.goles - a.goles)[0];
          if (topG && topG.goles > 0) {
            goleadorDestacado = `${topG.nombre} (#${topG.dorsal}) - ${topG.goles} goles`;
          }
        }

        return {
          id: p.id,
          torneoId: p.torneoId,
          torneoNombre: p.torneo?.nombre || 'Torneo Oficial',
          torneoCat: p.torneo?.categoria || 'Primera',
          torneoRama: p.torneo?.rama || 'Masc',
          jornada: p.jornada || 1,
          esLocal,
          rivalNombre: rival?.nombre || 'Equipo Rival',
          rivalSiglas: rival?.siglas || rival?.nombre?.substring(0, 3)?.toUpperCase() || 'RIV',
          rivalLogoUrl: rival?.logoUrl,
          rivalEsInvitado: rival?.esInvitado,
          clubLogoUrl: miClub?.logoUrl,
          clubNombre: miClub?.nombre || 'Mi Club',
          clubSiglas: miClub?.siglas || 'CAG',
          golesClub,
          golesRival,
          fechaStr,
          horaStr,
          cancha: p.lugar || 'Microestadio Polideportivo',
          estado: p.estado || 'Programado',
          resultadoTipo,
          puntosSumados,
          goleadorDestacado,
          duplaArbitral: dupla,
          cronometrista: p.cronometrista || 'Mesa Central FJH',
          observaciones: p.observaciones || '',
          jugadoresClub,
          jugadoresRival,
        };
      });
  });

  // Próximos encuentros (Programados / En Juego) del Club
  // REGLA: Si el torneo está concluido/finalizado, NO se muestran partidos pendientes inconclusos
  protected readonly proximosPartidos = computed(() => {
    const t = this.torneoActivo();
    const est = (t?.estado || '').toLowerCase().trim();
    if (est === 'finalizado' || est === 'concluido' || est === 'archive' || est === 'archivado') {
      return [];
    }
    return this.partidosProcesados().filter((p) => p.estado !== 'Finalizado');
  });

  // Resultados recientes (Finalizados)
  protected readonly resultadosRecientes = computed(() => {
    return this.partidosProcesados()
      .filter((p) => p.estado === 'Finalizado')
      .reverse();
  });

  // Jornadas únicas existentes en el torneo seleccionado
  protected readonly jornadasTorneo = computed<number[]>(() => {
    const list = this.todosPartidosTorneo();
    const nums = Array.from(new Set(list.map((p) => Number(p.jornada || 1))))
      .filter((n) => n < 90) // Fase regular
      .sort((a, b) => a - b);
    return nums.length > 0 ? nums : [1];
  });

  // Partidos de todas las fechas y clubes para la pestaña "Torneos & Fechas"
  protected readonly partidosJornadaTorneo = computed(() => {
    const all = this.todosPartidosTorneo();
    const jNum = this.jornadaTorneoSeleccionada();
    const txt = this.filtroTextoFixture().toLowerCase().trim();
    const est = this.filtroEstadoFixture();

    return all.filter((p) => {
      // 1. Jornada
      if (Number(p.jornada || 1) !== jNum) return false;

      // 2. Estado
      if (est !== 'TODOS') {
        const pEst = (p.estado || '').toLowerCase();
        if (est === 'FINALIZADOS' && !pEst.includes('final')) return false;
        if (est === 'EN_VIVO' && !pEst.includes('vivo') && !pEst.includes('juego')) return false;
        if (est === 'PROGRAMADOS' && (pEst.includes('final') || pEst.includes('vivo'))) return false;
      }

      // 3. Texto
      if (txt) {
        const loc = (p.local?.nombre || '').toLowerCase();
        const vis = (p.visitante?.nombre || '').toLowerCase();
        const cancha = (p.lugar || '').toLowerCase();
        if (!loc.includes(txt) && !vis.includes(txt) && !cancha.includes(txt)) return false;
      }

      return true;
    });
  });

  // Estadísticas del club en la tabla
  protected readonly clubStats = computed(() => {
    const cid = this.clubId();
    const posList = this.tablaPosiciones();
    const myPosIdx = posList.findIndex((p) => p.clubId === cid || p.club?.id === cid);

    if (myPosIdx >= 0) {
      const myRow = posList[myPosIdx];
      const pj = myRow.pj || 0;
      const pts = myRow.puntos || 0;
      const ptsMax = pj * 3;
      const eficacia = ptsMax > 0 ? ((pts / ptsMax) * 100).toFixed(1) + '%' : '100%';

      return {
        posicion: `${myPosIdx + 1}°`,
        puntos: `${pts} pts`,
        eficacia,
      };
    }

    // Si aún no está en la tabla, calcular desde los partidos finalizados
    const finalizados = this.resultadosRecientes();
    const pj = finalizados.length;
    let pts = 0;
    finalizados.forEach((f) => (pts += f.puntosSumados));
    const eficacia = pj > 0 ? ((pts / (pj * 3)) * 100).toFixed(1) + '%' : '100%';

    return {
      posicion: pj > 0 ? 'En disputa' : '1°',
      puntos: `${pts} pts`,
      eficacia,
    };
  });

  // Estado de la Fase Regular del torneo activo
  protected readonly estadoFaseRegular = computed(() => {
    const regulares = this.todosPartidosTorneo().filter((p) => (p.jornada || 1) < 90);
    const total = regulares.length;
    const finalizados = regulares.filter((p) => p.estado === 'Finalizado').length;
    const pendientes = total - finalizados;
    const completa = total > 0 && finalizados === total;
    return { total, finalizados, pendientes, completa };
  });

  // Configuración de Fase Eliminatoria Inicial del torneo activo
  protected readonly configuracionPlayoff = computed(() => {
    const t = this.torneoActivo();
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

  // Estado de clasificación del propio club logueado
  protected readonly miEstadoClasificacion = computed(() => {
    const cid = this.clubId();
    const tabla = this.tablaPosiciones();
    const idx = tabla.findIndex((p) => p.clubId === cid || p.club?.id === cid);
    if (idx === -1) return null;
    return this.getEstadoClasificacionClub(idx);
  });

  // Árbol visual de Playoffs para el Portal de Club
  protected readonly arbolPlayoffs = computed(() => {
    const tabla = this.tablaPosiciones();
    const todos = this.todosPartidosTorneo();
    const oficiales = todos.filter((p) => {
      const fase = (p.fase || '').toLowerCase();
      return (
        fase.includes('cuartos') ||
        fase.includes('semi') ||
        fase.includes('final') ||
        fase.includes('playoff') ||
        fase.includes('tercer') ||
        (p.jornada || 1) >= 90
      );
    });
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
        local,
        visitante,
        golesLocal: gL,
        golesVisitante: gV,
        estado,
        lugar: partidoDB?.lugar || 'Sede Oficial FJH',
        ganador,
        perdedor,
        ganadorEsLocal: Boolean(ganador && local?.id && ganador.id === local.id),
        ganadorEsVisitante: Boolean(ganador && visitante?.id && ganador.id === visitante.id),
        esMiClubLocal: Boolean(local?.id && local.id === this.clubId()),
        esMiClubVisitante: Boolean(visitante?.id && visitante.id === this.clubId()),
      };
    };

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

    const tieneCuartos = cfg.codigo === 'cuartos' || cuartosDB.length > 0;
    const cuartos = tieneCuartos
      ? [
          construirNodo('C1', 'Cuartos 1', '1° vs 8°', cuartosDB[0], getClubFromTabla(1), getClubFromTabla(8), true),
          construirNodo('C2', 'Cuartos 2', '4° vs 5°', cuartosDB[1], getClubFromTabla(4), getClubFromTabla(5), true),
          construirNodo('C3', 'Cuartos 3', '2° vs 7°', cuartosDB[2], getClubFromTabla(2), getClubFromTabla(7), true),
          construirNodo('C4', 'Cuartos 4', '3° vs 6°', cuartosDB[3], getClubFromTabla(3), getClubFromTabla(6), true),
        ]
      : [];

    const tieneSemis = cfg.codigo === 'cuartos' || cfg.codigo === 'semifinales' || semisDB.length > 0;
    const s1Match = semisDB.find((p) => (p.fase || '').includes('1')) || semisDB[0];
    const s2Match = semisDB.find((p) => (p.fase || '').includes('2')) || (semisDB.length > 1 ? semisDB[1] : undefined);

    const semifinales = tieneSemis
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

    const finalMatch = construirNodo(
      'FINAL',
      'Gran Final',
      tieneSemis ? 'Ganador Semifinal 1 vs Semifinal 2' : '1° vs 2° Clasificado',
      finalDB,
      tieneSemis
        ? semifinales[0]?.ganador || crearPlaceholder('Ganador Semifinal 1', 'GS1')
        : getClubFromTabla(1),
      tieneSemis
        ? semifinales[1]?.ganador || crearPlaceholder('Ganador Semifinal 2', 'GS2')
        : getClubFromTabla(2),
      !tieneSemis,
    );

    const tercerPuestoMatch =
      tieneSemis && this.torneoActivo()?.tercerPuesto !== false
        ? construirNodo(
            'TERCERO',
            'Tercer Puesto',
            'Perdedor Semifinal 1 vs Semifinal 2',
            terceroDB,
            semifinales[0]?.perdedor || crearPlaceholder('Perdedor Semifinal 1', 'PS1'),
            semifinales[1]?.perdedor || crearPlaceholder('Perdedor Semifinal 2', 'PS2'),
            false,
          )
        : null;

    return {
      tieneCuartos,
      tieneSemis,
      cuartos,
      semifinales,
      final: finalMatch,
      tercerPuesto: tercerPuestoMatch,
      campeon: finalMatch.ganador,
    };
  });

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    const cid = this.clubId();
    if (!cid) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);

    forkJoin({
      club: this.clubesService.getClub(cid).pipe(catchError(() => of(null))),
      partidos: this.clubesService.getAgendaCompleta(cid).pipe(catchError(() => of([]))),
      torneos: this.torneosService.getTorneos().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ club, partidos, torneos }) => {
        if (club) this.club.set(club);
        this.partidos.set(partidos || []);
        this.torneos.set(torneos || []);

        if (torneos && torneos.length > 0) {
          const activo = torneos.find((t) => t.estado === 'En Curso' || t.estado === 'Activo' || t.estado === 'In Progress') || torneos[0];
          this.torneoActivo.set(activo);
          this.cargarTablaTorneo(activo.id);
        } else {
          this.loading.set(false);
        }
      },
      error: (err) => {
        console.error('Error al cargar panel de club:', err);
        this.loading.set(false);
      },
    });
  }

  cargarTablaTorneo(torneoId: string): void {
    if (!torneoId) {
      this.tablaPosiciones.set([]);
      this.todosPartidosTorneo.set([]);
      this.loading.set(false);
      return;
    }

    // 1. Cargar fixture completo del torneo específico para playoffs y estadísticas
    this.partidosService
      .getFixtureByTorneo(torneoId)
      .pipe(catchError(() => of([])))
      .subscribe((list) => this.todosPartidosTorneo.set(list || []));

    // 2. Cargar tabla de posiciones estrictamente por ese torneoId
    this.partidosService
      .getTablaPosiciones(torneoId)
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (tabla) => {
          this.tablaPosiciones.set(tabla || []);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  toggleSelectorTorneos(): void {
    this.selectorTorneosAbierto.update((v) => !v);
  }

  seleccionarTorneo(t: Torneo): void {
    this.torneoActivo.set(t);
    this.selectorTorneosAbierto.set(false);

    // Sincronizar filtros de categoría y rama visuales
    const catLower = (t.categoria || '').toLowerCase();
    if (catLower.includes('primera')) this.selectedCategory.set('PRIMERA');
    else if (catLower.includes('juvenil')) this.selectedCategory.set('JUVENILES');
    else if (catLower.includes('cadete')) this.selectedCategory.set('CADETES');
    else if (catLower.includes('menor')) this.selectedCategory.set('MENORES');

    const ramaLower = (t.rama || '').toLowerCase();
    if (ramaLower.includes('masc')) this.selectedRama.set('Masc');
    else if (ramaLower.includes('fem')) this.selectedRama.set('Fem');

    this.cargarTablaTorneo(t.id);
  }

  seleccionarTorneoPorId(id: string): void {
    const found = this.torneos().find((t) => t.id === id);
    if (found) {
      this.seleccionarTorneo(found);
    }
  }

  getEstadoVisualTorneo(estado: string): { label: string; badgeClass: string; ping: boolean } {
    const est = (estado || '').toLowerCase().trim();
    if (est === 'in progress' || est === 'activo' || est === 'en curso') {
      return {
        label: 'En Disputa',
        badgeClass: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
        ping: true,
      };
    }
    if (est === 'upcoming' || est === 'proximo') {
      return {
        label: 'Próximo',
        badgeClass: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
        ping: false,
      };
    }
    if (est === 'pausa') {
      return {
        label: 'Receso',
        badgeClass: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
        ping: false,
      };
    }
    return {
      label: 'Concluido',
      badgeClass: 'bg-slate-700/40 border-slate-600/40 text-slate-300',
      ping: false,
    };
  }

  setView(view: 'agenda' | 'standings' | 'fixture_general' | 'playoffs'): void {
    this.currentView.set(view);
  }

  setJornadaTorneo(j: number): void {
    this.jornadaTorneoSeleccionada.set(j);
  }

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
      detalleCruce = diff > 0 ? `A ${diff} pts del ${cfg.cupos}° puesto` : `Igualado en pts con el ${cfg.cupos}°`;
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

  getClubInitials(club?: { siglas?: string; nombre?: string } | null): string {
    if (!club) return 'CLB';
    if (club.siglas) return club.siglas.toUpperCase();
    return (club.nombre || 'CLB').substring(0, 3).toUpperCase();
  }

  setCategory(cat: string): void {
    this.selectedCategory.set(cat);
    this.sincronizarTorneoSegunFiltro();
  }

  setRama(rama: 'TODAS' | 'Masc' | 'Fem'): void {
    this.selectedRama.set(rama);
    this.sincronizarTorneoSegunFiltro();
  }

  private sincronizarTorneoSegunFiltro(): void {
    const torneosList = this.torneos();
    const cat = this.selectedCategory();
    const rama = this.selectedRama();

    if (!torneosList || torneosList.length === 0) {
      this.cargarTablaTorneo('categoria');
      return;
    }

    // Buscar si hay un torneo específico para esa categoría y rama
    const match = torneosList.find((t) => {
      const tCat = (t.categoria || '').toLowerCase();
      const tRama = (t.rama || '').toLowerCase();
      const tNom = (t.nombre || '').toLowerCase();

      let matchCat = true;
      if (cat !== 'TODAS') {
        if (cat === 'PRIMERA') matchCat = tCat.includes('primera') || tNom.includes('primera');
        else if (cat === 'JUVENILES') matchCat = tCat.includes('juvenil') || tNom.includes('juvenil');
        else if (cat === 'CADETES') matchCat = tCat.includes('cadete') || tNom.includes('cadete');
        else if (cat === 'MENORES') matchCat = tCat.includes('menor') || tNom.includes('menor');
      }

      let matchRama = true;
      if (rama === 'Masc') matchRama = tRama.includes('masc') || tNom.includes('masc');
      else if (rama === 'Fem') matchRama = tRama.includes('fem') || tNom.includes('fem');

      return matchCat && matchRama;
    });

    if (match) {
      this.seleccionarTorneo(match);
    } else {
      // Si no hay torneo creado para esa categoría/rama específica, no inventar consolidado
      const firstAvailable = this.torneosDisponibles()[0];
      if (firstAvailable) {
        this.seleccionarTorneo(firstAvailable);
      } else {
        this.torneoActivo.set(null);
        this.tablaPosiciones.set([]);
        this.todosPartidosTorneo.set([]);
      }
    }
  }

  verActa(partido: PartidoClubDisplay): void {
    this.partidoActaSeleccionado.set(partido);
  }

  cerrarActa(): void {
    this.partidoActaSeleccionado.set(null);
  }

  descargarFixturePdf(): void {
    window.print();
  }

  getClubLogoUrl(logoUrl?: string | null): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) return logoUrl;
    return `${this.serverUrl}${logoUrl.startsWith('/') ? '' : '/'}${logoUrl}`;
  }

  hasValidLogo(logoUrl?: string | null): boolean {
    return !!logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('/uploads'));
  }
}

