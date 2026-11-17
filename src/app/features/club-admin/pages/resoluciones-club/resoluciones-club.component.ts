import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../../../core/services/auth.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { SancionDisciplinaria, SancionesService } from '../../../../core/services/sanciones.service';

@Component({
  selector: 'app-resoluciones-club',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './resoluciones-club.component.html',
  styleUrl: './resoluciones-club.component.css',
})
export class ResolucionesClubComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly sancionesService = inject(SancionesService);
  private readonly clubesService = inject(ClubesService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly club = signal<Club | null>(null);
  protected readonly sanciones = signal<SancionDisciplinaria[]>([]);
  protected readonly loading = signal<boolean>(true);

  // Filtros
  protected readonly filterType = signal<'todas' | 'activas' | 'cumplidas'>('todas');
  protected readonly selectedSancion = signal<SancionDisciplinaria | null>(null);

  protected readonly clubId = computed(() => this.currentUser()?.id || '');

  // Sanciones asociadas a este club
  protected readonly misSanciones = computed(() => {
    const cid = this.clubId();
    const clubNom = (this.club()?.nombre || this.currentUser()?.nombre || '').toLowerCase();
    const clubSiglas = (this.club()?.siglas || this.currentUser()?.siglas || '').toLowerCase();

    return this.sanciones().filter((s) => {
      if (s.clubId && s.clubId === cid) return true;
      const inst = (s.institucion || '').toLowerCase();
      if (inst && (inst.includes(clubNom) || (clubSiglas && inst.includes(clubSiglas)))) return true;
      return false;
    });
  });

  // Lista Filtrada por Estado
  protected readonly filteredSanciones = computed(() => {
    const list = this.misSanciones();
    const f = this.filterType();

    if (f === 'activas') {
      return list.filter((s) => s.cumplidas < s.totales);
    }
    if (f === 'cumplidas') {
      return list.filter((s) => s.cumplidas >= s.totales);
    }
    return list;
  });

  // Conteo de casos activos que afectan la plantilla
  protected readonly activeSanctionsCount = computed(() => {
    return this.misSanciones().filter((s) => s.cumplidas < s.totales).length;
  });

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    const cid = this.clubId();
    this.loading.set(true);

    if (cid) {
      this.clubesService
        .getClub(cid)
        .pipe(catchError(() => of(null)))
        .subscribe((c: Club | null) => {
          if (c) this.club.set(c);
        });
    }

    this.sancionesService
      .getSanciones()
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (res) => {
          this.sanciones.set(res || []);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  setFilter(type: 'todas' | 'activas' | 'cumplidas'): void {
    this.filterType.set(type);
  }

  verDetalleExpediente(sancion: SancionDisciplinaria): void {
    this.selectedSancion.set(sancion);
  }

  cerrarDetalle(): void {
    this.selectedSancion.set(null);
  }
}
