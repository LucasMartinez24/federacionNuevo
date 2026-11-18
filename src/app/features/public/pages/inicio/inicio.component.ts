import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { GaleriaService, FotoGaleria } from '../../../../core/services/galeria.service';
import { PartidosService, PartidoItem } from '../../../../core/services/partidos.service';
import { TorneosService, Torneo, PosicionClub } from '../../../../core/services/torneos.service';
import { ClubesService } from '../../../../core/services/clubes.service';
import { environment } from '../../../../../environments/environment';
import { PublicNavbarComponent } from '../../../../shared/components/public-navbar/public-navbar.component';

export interface MatchDisplay {
  id: string;
  torneoId?: string;
  torneoEstado?: string;
  competition: string;
  category: string;
  rama: string;
  status: string;
  statusTone: 'live' | 'scheduled' | 'finished';
  home: string;
  away: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeSiglas?: string;
  awaySiglas?: string;
  score: string;
  golesLocal: number;
  golesVisitante: number;
  venue: string;
  detail: string;
  date?: string | null;
  hora?: string | null;
  jornada?: number;
}

export interface GoleadorItem {
  pos: number;
  jugadorId?: string;
  nombre: string;
  club: string;
  clubLogo?: string | null;
  clubSiglas?: string;
  categoria?: string;
  pj: number;
  goles: number;
}

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [RouterModule, PublicNavbarComponent],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.css',
})
export class InicioComponent {
  private readonly torneosService = inject(TorneosService);
  private readonly partidosService = inject(PartidosService);
  private readonly galeriaService = inject(GaleriaService);
  private readonly clubesService = inject(ClubesService);

  protected readonly serverUrl = environment.serverUrl;
  protected readonly menuOpen = signal(false);

  // Filtros Match Center: Categoría Principal + Rama
  protected readonly matchCategories = [
    { label: 'Todas', value: 'Todas' },
    { label: 'Primera División', value: 'Primera' },
    { label: 'Juveniles', value: 'Juveniles' },
    { label: 'Cadetes', value: 'Cadetes' },
    { label: 'Menores', value: 'Menores' },
  ];

  protected readonly matchCategory = signal<string>('Todas');
  protected readonly matchGender = signal<'Ambas' | 'Masc' | 'Fem'>('Ambas');

  // Filtros Top Goleadores
  protected readonly activeGender = signal<'Masc' | 'Fem'>('Masc');
  protected readonly activeScorerCategory = signal<string>('Todas');
  protected readonly activeScorerTorneoId = signal<string>('all'); // 'all' para ranking global o ID específico del torneo

  // Datos principales reactivos
  protected readonly torneos = signal<Torneo[]>([]);
  // Torneos válidos para el Top Goleadores (excluye estrictamente torneos +35 / Maxi)
  protected readonly torneosGoleadores = computed(() =>
    this.torneos().filter((t) => {
      const info = `${t.categoria || ''} ${t.nombre || ''}`.toLowerCase();
      return !info.includes('+35') && !info.includes('maxi') && !info.includes('veteran') && !/\b35\b/.test(info);
    })
  );
  protected readonly activeTorneo = signal<Torneo | null>(null);
  protected readonly allMatches = signal<MatchDisplay[]>([]);
  protected readonly tablaPosiciones = signal<PosicionClub[]>([]);
  protected readonly goleadores = signal<GoleadorItem[]>([]);
  protected readonly galleryItems = signal<FotoGaleria[]>([]);
  protected readonly totalClubesCount = signal<number>(14);

  // Estadísticas y computados
  protected readonly liveMatches = computed(() =>
    this.allMatches().filter((m) => m.statusTone === 'live')
  );

  protected readonly scheduledMatches = computed(() =>
    this.allMatches().filter((m) => m.statusTone === 'scheduled')
  );

  protected readonly recentFinishedMatches = computed(() =>
    this.allMatches().filter((m) => m.statusTone === 'finished')
  );

  // Lista de filtros para el Match Center: Todas las categorías federadas con femenino y masculino
  protected readonly filterPills = [
    { label: 'Todos', value: 'Todos' },
    { label: 'Primera Masc', value: 'Primera Masc' },
    { label: 'Primera Fem', value: 'Primera Fem' },
    { label: 'Juveniles Masc', value: 'Juveniles Masc' },
    { label: 'Juveniles Fem', value: 'Juveniles Fem' },
    { label: 'Cadetes Masc', value: 'Cadetes Masc' },
    { label: 'Cadetes Fem', value: 'Cadetes Fem' },
    { label: 'Menores Masc', value: 'Menores Masc' },
    { label: 'Menores Fem', value: 'Menores Fem' },
  ];

  // Opciones de categoría oficial FJH para el Top Goleadores (desde Menores hasta Primera)
  protected readonly scorerCategories = [
    { label: 'Todas las Cat.', value: 'Todas' },
    { label: 'Primera', value: 'Primera' },
    { label: 'Juveniles', value: 'Juveniles' },
    { label: 'Cadetes', value: 'Cadetes' },
    { label: 'Menores', value: 'Menores' },
  ];

  // Partidos destacados filtrados por categoría y rama seleccionadas limpiamente
  protected readonly filteredMatches = computed(() => {
    const selectedCat = this.matchCategory();
    const selectedGender = this.matchGender();
    const list = this.allMatches();

    return list
      .filter((m) => {
        const cat = (m.category || '').toLowerCase();
        const rama = (m.rama || '').toLowerCase();
        const comp = (m.competition || '').toLowerCase();

        // 1. Filtro de Categoría
        let matchCat = true;
        if (selectedCat !== 'Todas') {
          const cLower = selectedCat.toLowerCase();
          matchCat = cat.includes(cLower) || comp.includes(cLower);
        }

        // 2. Filtro de Rama / Género
        let matchGender = true;
        if (selectedGender === 'Masc') {
          matchGender = rama.includes('masc') || comp.includes('masc');
        } else if (selectedGender === 'Fem') {
          matchGender = rama.includes('fem') || comp.includes('fem');
        }

        return matchCat && matchGender;
      })
      .slice(0, 6);
  });

  // Próximos partidos para la columna de fixture
  protected readonly upcomingFixture = computed(() => {
    const scheduled = this.scheduledMatches();
    if (scheduled.length > 0) return scheduled.slice(0, 5);
    return this.allMatches().slice(0, 5);
  });

  // Top scorer #1
  protected readonly topScorer = computed(() => {
    const list = this.goleadores();
    return list.length > 0 ? list[0] : null;
  });

  // Ranking restante (posiciones 2 a 5)
  protected readonly runnersUpScorers = computed(() => {
    const list = this.goleadores();
    return list.length > 1 ? list.slice(1, 6) : [];
  });

  protected readonly sponsors = [
    { name: 'Kempa', image: '/img/sponsors/kempa.webp', light: false },
    { name: 'Waxola', image: '/img/sponsors/WAXOLA.png', light: false },
    { name: 'Consultorio', image: '/img/sponsors/Consultorio.jpeg', light: false },
    { name: 'YPF', image: '/img/sponsors/ypf.png', light: false },
    { name: 'Gran Monarca', image: '/img/sponsors/granmonarca.png', light: true },
    { name: 'Sushi Express', image: '/img/sponsors/sushiExpress.jpeg', light: false },
    { name: 'Muebles Norteñita', image: '/img/sponsors/muebles.png', light: true },
  ];

  constructor() {
    this.cargarDatos();
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected selectMatchCategory(cat: string): void {
    this.matchCategory.set(cat);
  }

  protected selectMatchGender(gender: 'Ambas' | 'Masc' | 'Fem'): void {
    this.matchGender.set(gender);
  }

  protected selectGender(gender: 'Masc' | 'Fem'): void {
    this.activeGender.set(gender);
    this.cargarGoleadores();
  }

  protected selectScorerCategory(cat: string): void {
    this.activeScorerCategory.set(cat);
    if (cat !== 'Todas' && this.activeScorerTorneoId() !== 'all') {
      const selectedT = this.torneosGoleadores().find((t) => t.id === this.activeScorerTorneoId());
      const tCat = `${selectedT?.categoria || ''} ${selectedT?.nombre || ''}`.toLowerCase();
      if (selectedT && !tCat.includes(cat.toLowerCase())) {
        this.activeScorerTorneoId.set('all');
      }
    }
    this.cargarGoleadores();
  }

  protected selectScorerTorneo(torneoId: string): void {
    this.activeScorerTorneoId.set(torneoId);
    if (torneoId !== 'all') {
      const selectedT = this.torneosGoleadores().find((t) => t.id === torneoId);
      const tCat = `${selectedT?.categoria || ''} ${selectedT?.nombre || ''}`.toLowerCase();
      if (tCat.includes('primera')) this.activeScorerCategory.set('Primera');
      else if (tCat.includes('juvenil')) this.activeScorerCategory.set('Juveniles');
      else if (tCat.includes('cadete')) this.activeScorerCategory.set('Cadetes');
      else if (tCat.includes('menor')) this.activeScorerCategory.set('Menores');
    }
    this.cargarGoleadores();
  }

  protected getInitials(name?: string, siglas?: string): string {
    if (siglas) return siglas.toUpperCase();
    if (!name) return 'CLB';
    return name.substring(0, 3).toUpperCase();
  }

  /**
   * Genera URL absoluta del logo del club
   */
  protected getClubLogoUrl(logoUrl: string | null | undefined): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }
    return `${this.serverUrl}${logoUrl}`;
  }

  protected photoUrl(photo: FotoGaleria): string {
    if (!photo || !photo.url) return '';
    return photo.url.startsWith('http') ? photo.url : `${this.serverUrl}${photo.url}`;
  }

  /**
   * Carga torneos, partidos, clubes, posiciones, goleadores y galería
   */
  private cargarDatos(): void {
    // 1. Clubes para contador
    this.clubesService.getClubes().pipe(catchError(() => of([]))).subscribe((clubs) => {
      if (clubs && clubs.length > 0) {
        this.totalClubesCount.set(clubs.length);
      }
    });

    // 2. Galería
    this.galeriaService.getFotos().pipe(catchError(() => of([]))).subscribe((photos) => {
      this.galleryItems.set(photos.slice(0, 3));
    });

    // 3. Torneos y fixtures
    this.torneosService.getTorneos().pipe(
      catchError(() => of([])),
      switchMap((tournaments) => {
        this.torneos.set(tournaments);

        const active = tournaments.find((t) => t.estado === 'In Progress') || tournaments[0] || null;
        this.activeTorneo.set(active);

        if (active) {
          this.partidosService.getTablaPosiciones(active.id).pipe(catchError(() => of([]))).subscribe((pos) => {
            this.tablaPosiciones.set(pos);
          });
        }

        if (tournaments.length === 0) return of([]);

        // Excluir partidos de torneos marcados como Finalizado o Archivados
        const torneosVigentes = tournaments.filter((t) => {
          const est = (t.estado || '').toLowerCase().trim();
          return est !== 'finalizado' && est !== 'concluido' && est !== 'archive' && est !== 'archivado';
        });

        if (torneosVigentes.length === 0) return of([]);

        return forkJoin(
          torneosVigentes.map((tournament) =>
            this.partidosService.getFixtureByTorneo(tournament.id).pipe(
              map((partidos) =>
                partidos.map((p) => this.transformarPartido(p, tournament))
              ),
              catchError(() => of([]))
            )
          )
        );
      })
    ).subscribe((groups) => {
      const flattened = groups.flat().filter((m): m is MatchDisplay => !!m);
      this.allMatches.set(flattened);
    });

    // 4. Goleadores
    this.cargarGoleadores();
  }

  private cargarGoleadores(): void {
    const generoFiltro = this.activeGender() === 'Fem' ? 'Femenino' : 'Masculino';
    const categoriaFiltro = this.activeScorerCategory();
    const torneoIdFiltro = this.activeScorerTorneoId() === 'all' ? undefined : this.activeScorerTorneoId();

    this.partidosService.getGoleadores(torneoIdFiltro, generoFiltro, categoriaFiltro).pipe(
      catchError(() => of([]))
    ).subscribe((gols) => {
      // Filtrar de forma segura cualquier registro que pudiera corresponder a +35
      const filtrados = (gols || []).filter((g: any) => {
        const catStr = `${g.categoria || ''} ${g.club || ''}`.toLowerCase();
        return !catStr.includes('+35') && !catStr.includes('maxi');
      });
      this.goleadores.set(
        filtrados.map((item: any, idx: number) => ({
          ...item,
          pos: idx + 1,
        }))
      );
    });
  }

  private transformarPartido(p: PartidoItem, torneo: Torneo): MatchDisplay | null {
    if (!p.id) return null;

    const home = p.local?.nombre || 'Equipo Local';
    const away = p.visitante?.nombre || 'Equipo Visitante';
    const estadoStr = (p.estado || 'Programado').trim();
    const estadoLower = estadoStr.toLowerCase();

    let statusTone: 'live' | 'scheduled' | 'finished' = 'scheduled';
    if (estadoLower.includes('final') || estadoLower.includes('terminado')) {
      statusTone = 'finished';
    } else if (
      estadoLower.includes('vivo') ||
      estadoLower.includes('juego') ||
      estadoLower.includes('disputa') ||
      estadoLower.includes('1t') ||
      estadoLower.includes('2t')
    ) {
      statusTone = 'live';
    }

    const gL = p.golesLocal ?? 0;
    const gV = p.golesVisitante ?? 0;
    const score = statusTone === 'scheduled' ? 'VS' : `${gL} : ${gV}`;

    let fechaFormateada = 'Fecha a confirmar';
    if (p.fecha) {
      const d = new Date(p.fecha);
      if (!isNaN(d.getTime())) {
        const dia = d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
        fechaFormateada = dia.toUpperCase();
      } else {
        fechaFormateada = String(p.fecha).substring(0, 10);
      }
    }

    const rama = torneo.rama || 'Masculino';
    const cat = torneo.categoria || 'Primera División';

    return {
      id: p.id,
      torneoId: p.torneoId || torneo.id,
      torneoEstado: torneo.estado,
      competition: `${torneo.nombre} · ${cat} (${rama})`,
      category: cat,
      rama,
      status: estadoStr,
      statusTone,
      home,
      away,
      homeLogo: p.local?.logoUrl || null,
      awayLogo: p.visitante?.logoUrl || null,
      homeSiglas: p.local?.siglas,
      awaySiglas: p.visitante?.siglas,
      score,
      golesLocal: gL,
      golesVisitante: gV,
      venue: p.lugar || 'Sede oficial a confirmar',
      detail: p.hora ? `${fechaFormateada} · ${p.hora}` : fechaFormateada,
      date: fechaFormateada,
      hora: p.hora || null,
      jornada: p.jornada,
    };
  }
}
