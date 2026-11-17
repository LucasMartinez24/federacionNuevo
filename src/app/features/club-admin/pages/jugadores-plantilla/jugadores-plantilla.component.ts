import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
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

  protected readonly serverUrl = environment.serverUrl;
  protected readonly currentUser = this.authService.currentUser;

  // Estado del Club
  protected readonly club = signal<Club | null>(null);
  protected readonly jugadores = signal<Jugador[]>([]);
  protected readonly loading = signal<boolean>(true);

  // Filtros
  protected readonly searchTerm = signal<string>('');
  protected readonly selectedCategory = signal<string>('ALL');
  protected readonly selectedStatus = signal<string>('ALL');

  // Modal de Confirmación de Baja
  protected readonly athleteToDelete = signal<Jugador | null>(null);
  protected readonly isDeleting = signal<boolean>(false);
  protected readonly actionMessage = signal<string | null>(null);

  // Modal Alta / Solicitud Rápida
  protected readonly showAddModal = signal<boolean>(false);

  // Identificador del club (soporta clubId en URL queryParams o club actual)
  protected readonly clubId = computed(
    () => this.route.snapshot.queryParams['clubId'] || this.currentUser()?.id || ''
  );

  // KPIs
  protected readonly totalAthletes = computed(() => this.jugadores().length);
  protected readonly enabledAthletes = computed(() =>
    this.jugadores().filter((j) => j.estado === 'Aprobado' || j.estado === 'Habilitado').length
  );
  protected readonly enabledPercentage = computed(() => {
    const total = this.totalAthletes();
    if (total === 0) return '100';
    return ((this.enabledAthletes() / total) * 100).toFixed(0);
  });
  protected readonly observedAthletes = computed(() =>
    this.jugadores().filter((j) => j.estado === 'Observado' || j.estado === 'Pendiente' || j.estado === 'Rechazado').length
  );

  // Lista Filtrada
  protected readonly filteredAthletes = computed(() => {
    const list = this.jugadores();
    const term = this.searchTerm().toLowerCase().trim();
    const cat = this.selectedCategory();
    const stat = this.selectedStatus();

    return list.filter((j) => {
      // 1. Filtro de búsqueda
      if (term) {
        const matchName = (j.nombreCompleto || '').toLowerCase().includes(term);
        const matchDni = (j.dni || '').includes(term);
        if (!matchName && !matchDni) return false;
      }

      // 2. Filtro de categoría
      if (cat !== 'ALL') {
        const jCat = (j.categoria || '').toLowerCase();
        const jEsp = (j.categoriaEspecial || '').toLowerCase();
        if (cat === 'PRIMERA' && !jCat.includes('primera') && !jEsp.includes('primera')) return false;
        if (cat === 'JUVENILES' && !jCat.includes('juvenil') && !jEsp.includes('juvenil')) return false;
        if (cat === 'CADETES' && !jCat.includes('cadete') && !jEsp.includes('cadete')) return false;
        if (cat === 'MENORES' && !jCat.includes('menor') && !jEsp.includes('menor')) return false;
      }

      // 3. Filtro de estado
      if (stat !== 'ALL') {
        if (stat === 'HABILITADO' && j.estado !== 'Aprobado' && j.estado !== 'Habilitado') return false;
        if (stat === 'REVISION' && j.estado !== 'Pendiente') return false;
        if (stat === 'OBSERVADO' && j.estado !== 'Observado' && j.estado !== 'Rechazado' && j.estado !== 'Sancionado') return false;
      }

      return true;
    });
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

    this.clubesService
      .getClub(cid)
      .pipe(catchError(() => of(null)))
      .subscribe((c: Club | null) => {
        if (c) this.club.set(c);
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
  }

  setCategory(cat: string): void {
    this.selectedCategory.set(cat);
  }

  setStatusFilter(status: string): void {
    this.selectedStatus.set(status);
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
    if (player.fechaNacimiento) {
      const birth = new Date(player.fechaNacimiento);
      if (!isNaN(birth.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age < 18;
      }
    }
    return false;
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
