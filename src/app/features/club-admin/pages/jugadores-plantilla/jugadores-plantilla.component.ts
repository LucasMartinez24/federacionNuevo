import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { Jugador, JugadoresService } from '../../../../core/services/jugadores.service';

@Component({
  selector: 'app-jugadores-plantilla',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './jugadores-plantilla.component.html',
  styleUrl: './jugadores-plantilla.component.css',
})
export class JugadoresPlantillaComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly clubesService = inject(ClubesService);
  private readonly jugadoresService = inject(JugadoresService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly serverUrl = environment.serverUrl;
  protected readonly currentUser = this.authService.currentUser;

  // Estado del Club y Nómina
  protected readonly club = signal<Club | null>(null);
  protected readonly jugadores = signal<Jugador[]>([]);
  protected readonly loading = signal<boolean>(true);

  // Filtros Reactivos
  protected readonly searchTerm = signal<string>('');
  protected readonly selectedCategory = signal<string>('ALL');
  protected readonly selectedGender = signal<'ALL' | 'MASC' | 'FEM'>('ALL');
  protected readonly selectedStatus = signal<string>('ALL');
  protected readonly selectedTeam = signal<string>('ALL');

  // Modal de Confirmación de Baja
  protected readonly athleteToDelete = signal<Jugador | null>(null);
  protected readonly isDeleting = signal<boolean>(false);
  protected readonly actionMessage = signal<string | null>(null);

  // Visor de Documentos Integrado para el Delegado
  protected readonly docViewer = signal<{
    url: string;
    titulo: string;
    tipo: 'pdf' | 'image';
    jugadorNombre: string;
  } | null>(null);

  protected readonly safeDocUrl = computed<SafeResourceUrl | null>(() => {
    const doc = this.docViewer();
    if (!doc || doc.tipo !== 'pdf') return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(doc.url);
  });

  // Identificador del club (soporta queryParam clubId o sesión de club; null si es vista global admin)
  protected readonly activeClubId = signal<string | null>(null);

  // Equipos / Sub-planteles detectados dentro del club (ej: Equipo A, Equipo B)
  protected readonly availableTeams = computed(() => {
    const teams = new Set<string>();
    for (const j of this.jugadores()) {
      if (j.equipo && j.equipo.trim()) {
        teams.add(j.equipo.trim().toUpperCase());
      } else if (j.club?.nombre) {
        const match = j.club.nombre.match(/ ([BC])$/i);
        teams.add(match ? match[1].toUpperCase() : 'A');
      }
    }
    return Array.from(teams).sort();
  });

  // Indicador de filtros activos
  protected readonly hasActiveFilters = computed(
    () =>
      this.searchTerm().trim().length > 0 ||
      this.selectedCategory() !== 'ALL' ||
      this.selectedGender() !== 'ALL' ||
      this.selectedStatus() !== 'ALL' ||
      this.selectedTeam() !== 'ALL'
  );

  // KPIs de Plantilla
  protected readonly totalAthletes = computed(() => this.jugadores().length);
  protected readonly enabledAthletes = computed(() =>
    this.jugadores().filter((j) => j.estado === 'Aprobado' || j.estado === 'Habilitado').length
  );
  protected readonly pendingAthletes = computed(() =>
    this.jugadores().filter((j) => j.estado === 'Pendiente').length
  );
  protected readonly observedAthletes = computed(() =>
    this.jugadores().filter(
      (j) => j.estado === 'Observado' || j.estado === 'Rechazado' || j.estado === 'Sancionado'
    ).length
  );
  protected readonly enabledPercentage = computed(() => {
    const total = this.totalAthletes();
    if (total === 0) return '100';
    return ((this.enabledAthletes() / total) * 100).toFixed(0);
  });

  // Contadores por Categoría
  protected readonly categoryCounts = computed(() => {
    const list = this.jugadores();
    const countFor = (keyword: string) =>
      list.filter(
        (j) =>
          (j.categoria || '').toLowerCase().includes(keyword) ||
          (j.categoriaEspecial || '').toLowerCase().includes(keyword)
      ).length;

    return {
      ALL: list.length,
      PRIMERA: countFor('primera'),
      JUVENILES: countFor('juvenil'),
      CADETES: countFor('cadete'),
      MENORES: countFor('menor'),
      INFANTILES: countFor('infantil'),
    };
  });

  // Lista Filtrada
  protected readonly filteredAthletes = computed(() => {
    const list = this.jugadores();
    const term = this.searchTerm().toLowerCase().trim();
    const cat = this.selectedCategory();
    const gen = this.selectedGender();
    const stat = this.selectedStatus();
    const team = this.selectedTeam();

    return list.filter((j) => {
      // 1. Búsqueda por nombre, DNI o posición
      if (term) {
        const matchName = (j.nombreCompleto || '').toLowerCase().includes(term);
        const matchDni = (j.dni || '').includes(term);
        const matchPos = (j.posicion || '').toLowerCase().includes(term);
        const matchClub = (j.club?.nombre || '').toLowerCase().includes(term);
        if (!matchName && !matchDni && !matchPos && !matchClub) return false;
      }

      // 2. Filtro de categoría
      if (cat !== 'ALL') {
        const jCat = (j.categoria || '').toLowerCase();
        const jEsp = (j.categoriaEspecial || '').toLowerCase();
        if (cat === 'PRIMERA' && !jCat.includes('primera') && !jEsp.includes('primera')) return false;
        if (cat === 'JUVENILES' && !jCat.includes('juvenil') && !jEsp.includes('juvenil')) return false;
        if (cat === 'CADETES' && !jCat.includes('cadete') && !jEsp.includes('cadete')) return false;
        if (cat === 'MENORES' && !jCat.includes('menor') && !jEsp.includes('menor')) return false;
        if (cat === 'INFANTILES' && !jCat.includes('infantil') && !jEsp.includes('infantil')) return false;
      }

      // 3. Filtro de rama / género
      if (gen !== 'ALL') {
        const jGen = (j.genero || '').toLowerCase();
        const jCat = (j.categoria || '').toLowerCase();
        if (gen === 'MASC' && !jGen.startsWith('m') && !jCat.includes('masc')) return false;
        if (gen === 'FEM' && !jGen.startsWith('f') && !jCat.includes('fem')) return false;
      }

      // 4. Filtro de sub-equipo (A / B / C)
      if (team !== 'ALL') {
        const playerTeam = this.getPlayerTeamLetter(j);
        if (playerTeam !== team) return false;
      }

      // 5. Filtro de estado federativo
      if (stat !== 'ALL') {
        if (stat === 'HABILITADO' && j.estado !== 'Aprobado' && j.estado !== 'Habilitado') return false;
        if (stat === 'REVISION' && j.estado !== 'Pendiente') return false;
        if (
          stat === 'OBSERVADO' &&
          j.estado !== 'Observado' &&
          j.estado !== 'Rechazado' &&
          j.estado !== 'Sancionado'
        ) {
          return false;
        }
      }

      return true;
    });
  });

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const qClubId = params['clubId'];
      if (qClubId) {
        this.activeClubId.set(qClubId);
      } else if (this.authService.isClub()) {
        this.activeClubId.set(this.currentUser()?.id || null);
      } else {
        this.activeClubId.set(null);
      }
      this.cargarDatos();
    });
  }

  cargarDatos(): void {
    const cid = this.activeClubId();
    this.loading.set(true);

    if (cid) {
      this.clubesService
        .getClub(cid)
        .pipe(catchError(() => of(null)))
        .subscribe((c: Club | null) => {
          this.club.set(c);
        });

      this.jugadoresService
        .getJugadores(cid)
        .pipe(
          catchError(() =>
            this.clubesService.getJugadoresByClub(cid).pipe(catchError(() => of([])))
          )
        )
        .subscribe({
          next: (jugadores) => {
            this.jugadores.set(jugadores || []);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
    } else {
      // Si se accede sin club fijo (ej: vista global o "Ver Todos"), cargar todos los jugadores
      this.club.set(null);
      this.jugadoresService
        .getJugadores()
        .pipe(catchError(() => of([])))
        .subscribe({
          next: (jugadores) => {
            this.jugadores.set(jugadores || []);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
    }
  }

  setCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  setGenderFilter(gen: 'ALL' | 'MASC' | 'FEM'): void {
    this.selectedGender.set(gen);
  }

  setStatusFilter(status: string): void {
    this.selectedStatus.set(status);
  }

  setTeamFilter(team: string): void {
    this.selectedTeam.set(team);
  }

  resetAllFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set('ALL');
    this.selectedGender.set('ALL');
    this.selectedStatus.set('ALL');
    this.selectedTeam.set('ALL');
  }

  getPlayerTeamLetter(player: Jugador): string {
    if (player.equipo && player.equipo.trim()) {
      return player.equipo.trim().toUpperCase();
    }
    if (player.club?.nombre) {
      const match = player.club.nombre.match(/ ([BC])$/i);
      if (match) return match[1].toUpperCase();
    }
    return 'A';
  }

  getEdad(player: Jugador): number | null {
    if (!player.fechaNacimiento) return null;
    const birth = new Date(player.fechaNacimiento);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 0 && age < 100 ? age : null;
  }

  getInitials(name: string): string {
    if (!name) return 'AT';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  isMinor(player: Jugador): boolean {
    if (!player) return false;
    const cat = (player.categoria || '').toLowerCase();
    if (cat.includes('juvenil') || cat.includes('cadete') || cat.includes('menor') || cat.includes('infantil')) {
      return true;
    }
    const age = this.getEdad(player);
    return age !== null ? age < 18 : false;
  }

  verDocumentoJugador(urlRelativa: string | null | undefined, titulo: string, jugadorNombre: string): void {
    if (!urlRelativa) return;
    const fullUrl = this.jugadoresService.getFileUrl(urlRelativa);
    const cleanUrl = fullUrl.toLowerCase().split('?')[0];
    const isPdf = cleanUrl.endsWith('.pdf');
    this.docViewer.set({
      url: fullUrl,
      titulo,
      tipo: isPdf ? 'pdf' : 'image',
      jugadorNombre,
    });
  }

  cerrarVisorDoc(): void {
    this.docViewer.set(null);
  }

  openDeleteModal(player: Jugador): void {
    this.athleteToDelete.set(player);
  }

  closeDeleteModal(): void {
    this.athleteToDelete.set(null);
  }

  executeDelete(): void {
    const player = this.athleteToDelete();
    if (!player) return;

    this.isDeleting.set(true);
    this.jugadoresService.deleteJugador(player.id).subscribe({
      next: () => {
        this.jugadores.update((list) => list.filter((j) => j.id !== player.id));
        this.isDeleting.set(false);
        this.closeDeleteModal();
        this.mostrarMensaje(`Baja federativa procesada para ${player.nombreCompleto}.`);
      },
      error: (err: any) => {
        console.error('Error al dar de baja atleta:', err);
        this.isDeleting.set(false);
        this.mostrarMensaje(err?.error?.error || 'Error al procesar la baja del atleta.');
      },
    });
  }

  mostrarMensaje(msg: string): void {
    this.actionMessage.set(msg);
    setTimeout(() => {
      if (this.actionMessage() === msg) this.actionMessage.set(null);
    }, 4000);
  }

  descargarListaBuenaFe(): void {
    window.print();
  }
}
