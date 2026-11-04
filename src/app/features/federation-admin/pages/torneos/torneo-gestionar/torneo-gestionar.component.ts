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
  readonly countJornadas = computed(() => this.jornadas().length);
  readonly countPartidosTotales = computed(() =>
    this.jornadas().reduce((acc, j) => acc + j.partidos.length, 0)
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
        this.clubesDisponibles.set(clubes || []);
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
    if (t.tablaPosiciones && t.tablaPosiciones.length > 0) {
      const clubesTorneo = t.tablaPosiciones
        .map((p) => p.club)
        .filter((c): c is Club => !!c);
      if (clubesTorneo.length > 0) {
        this.clubesSeleccionados.set(clubesTorneo);
      }
    }

    // 2. Si todavía no hay clubes seleccionados, seleccionamos los primeros disponibles
    if (this.clubesSeleccionados().length === 0 && this.clubesDisponibles().length > 0) {
      this.clubesSeleccionados.set(this.clubesDisponibles().slice(0, 8));
    }

    // 3. Cargar partidos existentes si los hubiera
    if (t.partidos && t.partidos.length > 0) {
      this.reconstruirJornadasDesdePartidos(t.partidos);
    } else {
      // Buscar via partidosService
      this.partidosService.getFixtureByTorneo(t.id).subscribe({
        next: (partidos) => {
          if (partidos && partidos.length > 0) {
            this.reconstruirJornadasDesdePartidos(partidos);
          } else {
            // Generar fixture inicial automático con los clubes disponibles
            this.generarRoundRobin(false);
          }
        },
        error: () => {
          this.generarRoundRobin(false);
        },
      });
    }
  }

  private reconstruirJornadasDesdePartidos(partidos: any[]): void {
    const mapaJornadas = new Map<number, PartidoItem[]>();

    for (const p of partidos) {
      const jNum = p.jornada || 1;
      if (!mapaJornadas.has(jNum)) {
        mapaJornadas.set(jNum, []);
      }

      let horaStr = '--:-- hs';
      let fechaStr: string | null = null;
      if (p.fecha) {
        try {
          const d = new Date(p.fecha);
          horaStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} hs`;
          fechaStr = d.toISOString().substring(0, 10);
        } catch {}
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
        fase: p.fase || 'Fase Regular',
        grupo: p.grupo,
        arbitro1: p.arbitro1 || '',
        arbitro2: p.arbitro2 || '',
        cronometrista: p.cronometrista || '',
        observaciones: p.observaciones || '',
        showDesignaciones: false,
      });
    }

    const jornadasResult: JornadaItem[] = [];
    const numerosOrdenados = Array.from(mapaJornadas.keys()).sort((a, b) => a - b);

    for (const n of numerosOrdenados) {
      const items = mapaJornadas.get(n)!;
      const primerFecha = items.find((x) => x.fecha)?.fecha;
      const primerSede = items[0]?.lugar || 'Polideportivo Cuyaya';

      jornadasResult.push({
        numero: n,
        nombre: `Jornada ${n}${n === 1 ? ' • Fecha Inaugural' : ''}`,
        fechaDefault: primerFecha || undefined,
        sedeDefault: primerSede,
        isExpanded: n <= 2,
        partidos: items,
      });
    }

    this.jornadas.set(jornadasResult);
  }

  // --- GENERACIÓN ROUND ROBIN BERGER ---
  generarRoundRobin(mostrarToast: boolean = true): void {
    const clubes = this.clubesSeleccionados();
    if (clubes.length < 2) {
      if (mostrarToast) {
        this.mostrarFeedback('error', 'Selecciona al menos 2 clubes en el padrón para generar el fixture.');
      }
      return;
    }

    this.isGenerating.set(true);
    const idaVuelta = this.torneo()?.idaVuelta ?? true;
    const sedes = this.sedesList();

    const nuevasJornadas = this.partidosService.generarFixture(clubes, idaVuelta, sedes);
    this.jornadas.set(nuevasJornadas);
    this.isGenerating.set(false);

    if (mostrarToast) {
      this.mostrarFeedback('success', `Round Robin generado: ${nuevasJornadas.length} jornadas y ${this.countPartidosTotales()} partidos.`);
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
  }

  // --- ACCIONES EN PARTIDOS ---
  invertirLocalia(partido: PartidoItem): void {
    const tempLocal = partido.local;
    const tempLocalId = partido.localId;
    partido.local = partido.visitante;
    partido.localId = partido.visitanteId;
    partido.visitante = tempLocal;
    partido.visitanteId = tempLocalId;
  }

  invertirLocaliasJornada(jornada: JornadaItem): void {
    for (const p of jornada.partidos) {
      this.invertirLocalia(p);
    }
    this.mostrarFeedback('success', `Localías invertidas para la ${jornada.nombre}.`);
  }

  toggleDesignaciones(partido: PartidoItem): void {
    partido.showDesignaciones = !partido.showDesignaciones;
  }

  setArbitroRapido(partido: PartidoItem, campo: 'arbitro1' | 'arbitro2' | 'cronometrista', nombre: string): void {
    partido[campo] = nombre;
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
    this.mostrarFeedback('success', `Horarios escalonados (+${intervaloMin} min) aplicados a la ${jornada.nombre}.`);
  }

  aplicarSedeATodos(jornada: JornadaItem, sede: string): void {
    jornada.sedeDefault = sede;
    for (const p of jornada.partidos) {
      p.lugar = sede;
    }
  }

  aplicarFechaATodos(jornada: JornadaItem, fecha: string): void {
    jornada.fechaDefault = fecha;
    for (const p of jornada.partidos) {
      p.fecha = fecha;
    }
  }

  agregarPartidoManual(jornada: JornadaItem): void {
    const clubes = this.clubesSeleccionados();
    if (clubes.length < 2) return;

    const nuevo: PartidoItem = {
      jornada: jornada.numero,
      localId: clubes[0].id,
      visitanteId: clubes[1].id,
      local: clubes[0],
      visitante: clubes[1],
      fecha: jornada.fechaDefault || null,
      hora: '15:00 hs',
      lugar: jornada.sedeDefault || this.sedesList()[0] || 'Polideportivo Cuyaya',
      estado: 'Programado',
      fase: 'Fase Regular',
      arbitro1: '',
      arbitro2: '',
      cronometrista: '',
      observaciones: '',
      showDesignaciones: false,
    };

    jornada.partidos.push(nuevo);
  }

  eliminarPartido(jornada: JornadaItem, index: number): void {
    jornada.partidos.splice(index, 1);
  }

  agregarNuevaJornada(): void {
    const nuevoNum = this.jornadas().length + 1;
    const nueva: JornadaItem = {
      numero: nuevoNum,
      nombre: `Jornada ${nuevoNum}`,
      sedeDefault: this.sedesList()[0] || 'Polideportivo Cuyaya',
      isExpanded: true,
      partidos: [],
    };
    this.jornadas.update((list) => [...list, nueva]);
    this.mostrarFeedback('success', `Jornada ${nuevoNum} añadida.`);
  }

  eliminarJornada(index: number): void {
    this.jornadas.update((list) => list.filter((_, i) => i !== index));
    this.mostrarFeedback('success', 'Jornada eliminada.');
  }

  toggleJornada(jornada: JornadaItem): void {
    jornada.isExpanded = !jornada.isExpanded;
  }

  expandirTodas(expand: boolean): void {
    for (const j of this.jornadas()) {
      j.isExpanded = expand;
    }
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
        // Limpiar hora del formato "15:00 hs" a "15:00"
        let horaClean = p.hora || '15:00';
        horaClean = horaClean.replace('hs', '').trim();
        if (!horaClean.includes(':')) horaClean = '15:00';

        return {
          id: p.id,
          localId: p.localId,
          visitanteId: p.visitanteId,
          fecha: p.fecha || null,
          hora: horaClean,
          lugar: p.lugar || 'Polideportivo Cuyaya',
          estado: p.estado || 'Programado',
          fase: p.fase || 'Fase Regular',
          grupo: p.grupo || null,
          arbitro1: p.arbitro1 || null,
          arbitro2: p.arbitro2 || null,
          cronometrista: p.cronometrista || null,
          observaciones: p.observaciones || null,
        };
      }),
    }));

    this.partidosService.saveFixture(t.id, payload as any).subscribe({
      next: () => {
        this.isPublishing.set(false);
        this.mostrarFeedback('success', '¡Fixture y designaciones publicadas con éxito en el servidor oficial FJH!');
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
}
