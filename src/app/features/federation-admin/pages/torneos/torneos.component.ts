import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Torneo, TorneosService } from '../../../../core/services/torneos.service';

@Component({
  selector: 'app-torneos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './torneos.component.html',
  styleUrl: './torneos.component.css',
})
export class TorneosComponent implements OnInit {
  private readonly torneosService = inject(TorneosService);

  // Estado de Datos
  readonly torneos = signal<Torneo[]>([]);
  readonly loading = signal<boolean>(true);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filtros: El primer filtro es "activos"
  readonly activeStatusTab = signal<'activos' | 'todos' | 'proximos' | 'finalizados' | 'historico'>('activos');
  readonly selectedSeason = signal<string>('todas');
  readonly selectedRama = signal<string>('todas');
  readonly selectedCategoria = signal<string>('todas');
  readonly searchTerm = signal<string>('');

  // Modales
  readonly showStatusModal = signal<boolean>(false);
  readonly torneoForStatus = signal<Torneo | null>(null);
  readonly selectedNewStatus = signal<string>('In Progress');

  readonly showDeleteModal = signal<boolean>(false);
  readonly torneoForDelete = signal<Torneo | null>(null);
  readonly isDeleting = signal<boolean>(false);

  readonly showCreateModal = signal<boolean>(false);
  readonly isCreating = signal<boolean>(false);
  readonly createForm = signal<{
    nombre: string;
    categoria: string;
    rama: string;
    formato: string;
    idaVuelta: boolean;
    fechaInicio: string;
    estado: string;
  }>({
    nombre: '',
    categoria: 'Primera División',
    rama: 'Masculino',
    formato: 'liga',
    idaVuelta: true,
    fechaInicio: new Date().toISOString().substring(0, 10),
    estado: 'In Progress',
  });

  ngOnInit(): void {
    this.cargarTorneos();
  }

  cargarTorneos(): void {
    this.loading.set(true);
    this.torneosService.getTorneos().subscribe({
      next: (data) => {
        this.torneos.set(data || []);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar torneos:', err);
        this.loading.set(false);
        this.mostrarFeedback('error', 'No se pudieron sincronizar los torneos con el servidor.');
      },
    });
  }

  // Conteo de torneos para los tabs
  readonly countActivos = computed(() =>
    this.torneos().filter((t) => t.estado === 'In Progress' || t.estado === 'ACTIVO').length
  );
  readonly countTodos = computed(() => this.torneos().length);
  readonly countProximos = computed(() =>
    this.torneos().filter((t) => t.estado === 'Upcoming' || t.estado === 'PROXIMO').length
  );
  readonly countFinalizados = computed(() =>
    this.torneos().filter((t) => t.estado === 'Finalizado' || t.estado === 'Archive').length
  );

  // Lista filtrada reactiva
  readonly torneosFiltrados = computed<Torneo[]>(() => {
    const list = this.torneos();
    const tab = this.activeStatusTab();
    const season = this.selectedSeason();
    const rama = this.selectedRama();
    const cat = this.selectedCategoria();
    const search = this.searchTerm().toLowerCase().trim();

    return list.filter((t) => {
      // Filtro por Tab de Estado
      if (tab === 'activos' && !(t.estado === 'In Progress' || t.estado === 'ACTIVO')) return false;
      if (tab === 'proximos' && !(t.estado === 'Upcoming' || t.estado === 'PROXIMO')) return false;
      if (tab === 'finalizados' && !(t.estado === 'Finalizado' || t.estado === 'Archive')) return false;
      if (tab === 'historico' && t.estado !== 'Archive') return false;

      // Filtro por Rama
      if (rama !== 'todas' && t.rama && t.rama.toLowerCase() !== rama.toLowerCase()) return false;

      // Filtro por Categoría
      if (cat !== 'todas') {
        if (!t.categoria || !t.categoria.toLowerCase().includes(cat.toLowerCase())) return false;
      }

      // Filtro por Temporada (año de fechaInicio o createdAt)
      if (season !== 'todas') {
        const dateStr = t.fechaInicio || t.createdAt || '';
        if (!dateStr.startsWith(season)) return false;
      }

      // Filtro de búsqueda
      if (search) {
        const matchNombre = (t.nombre || '').toLowerCase().includes(search);
        const matchCat = (t.categoria || '').toLowerCase().includes(search);
        const matchRama = (t.rama || '').toLowerCase().includes(search);
        const matchFormato = (t.formato || '').toLowerCase().includes(search);
        if (!matchNombre && !matchCat && !matchRama && !matchFormato) return false;
      }

      return true;
    });
  });

  setStatusTab(tab: 'activos' | 'todos' | 'proximos' | 'finalizados' | 'historico'): void {
    this.activeStatusTab.set(tab);
  }

  // Visual Helper para Badges de Estado
  getEstadoVisual(estado: string): {
    label: string;
    sublabel: string;
    claseBadge: string;
    icono: string;
    ping: boolean;
    gradient: string;
  } {
    switch (estado) {
      case 'In Progress':
      case 'ACTIVO':
        return {
          label: 'ACTIVO / EN DISPUTA',
          sublabel: 'En Juego',
          claseBadge: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
          icono: 'play_circle',
          ping: true,
          gradient: 'from-[#0b3c5d] via-court-card to-surface-container',
        };
      case 'Upcoming':
      case 'PROXIMO':
        return {
          label: 'PRÓXIMO / INSCRIPCIÓN',
          sublabel: 'Fase Previa',
          claseBadge: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
          icono: 'schedule',
          ping: false,
          gradient: 'from-amber-950/60 via-court-card to-surface-container',
        };
      case 'PAUSA':
        return {
          label: 'EN PAUSA / RECESO',
          sublabel: 'Suspendido',
          claseBadge: 'bg-rose-500/20 border-rose-500/40 text-rose-400',
          icono: 'pause_circle',
          ping: false,
          gradient: 'from-rose-950/60 via-court-card to-surface-container',
        };
      case 'Finalizado':
      case 'Archive':
        return {
          label: 'TORNEO CONCLUIDO',
          sublabel: 'Cerrado',
          claseBadge: 'bg-slate-700/40 border-slate-600/40 text-slate-300',
          icono: 'verified',
          ping: false,
          gradient: 'from-slate-900 via-court-card to-surface-container',
        };
      default:
        return {
          label: estado || 'EN DISPUTA',
          sublabel: 'Oficial',
          claseBadge: 'bg-primary/20 border-primary/40 text-primary',
          icono: 'emoji_events',
          ping: false,
          gradient: 'from-cyan-950/70 via-court-card to-surface-container',
        };
    }
  }

  formatearFecha(fecha: string | undefined): string {
    if (!fecha) return 'A definir';
    try {
      const d = new Date(fecha);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return fecha;
    }
  }

  // --- MODAL CAMBIO DE ESTADO (ADMIN) ---
  openStatusModal(torneo: Torneo): void {
    this.torneoForStatus.set(torneo);
    this.selectedNewStatus.set(torneo.estado || 'In Progress');
    this.showStatusModal.set(true);
  }

  closeStatusModal(): void {
    this.showStatusModal.set(false);
    this.torneoForStatus.set(null);
  }

  saveStatusModal(): void {
    const torneo = this.torneoForStatus();
    const nuevoEstado = this.selectedNewStatus();
    if (!torneo || !nuevoEstado) return;

    this.torneosService.updateTorneo(torneo.id, { estado: nuevoEstado }).subscribe({
      next: (actualizado) => {
        this.torneos.update((prev) =>
          prev.map((t) => (t.id === actualizado.id ? { ...t, estado: actualizado.estado } : t))
        );
        this.closeStatusModal();
        this.mostrarFeedback('success', `El estado del torneo "${torneo.nombre}" se actualizó exitosamente.`);
      },
      error: (err) => {
        console.error('Error al actualizar estado:', err);
        this.mostrarFeedback('error', 'Error al guardar el nuevo estado federativo.');
      },
    });
  }

  // --- MODAL ELIMINACIÓN (ADMIN) ---
  openDeleteModal(torneo: Torneo): void {
    this.torneoForDelete.set(torneo);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.torneoForDelete.set(null);
  }

  confirmDelete(): void {
    const torneo = this.torneoForDelete();
    if (!torneo) return;

    this.isDeleting.set(true);
    this.torneosService.deleteTorneo(torneo.id).subscribe({
      next: () => {
        this.torneos.update((prev) => prev.filter((t) => t.id !== torneo.id));
        this.isDeleting.set(false);
        this.closeDeleteModal();
        this.mostrarFeedback('success', `El torneo "${torneo.nombre}" y todos sus fixtures fueron eliminados.`);
      },
      error: (err) => {
        console.error('Error al eliminar torneo:', err);
        this.isDeleting.set(false);
        this.mostrarFeedback('error', 'No fue posible eliminar el torneo. Verifique si existen dependencias bloqueadas.');
      },
    });
  }

  // --- MODAL CREACIÓN DE TORNEO (ADMIN) ---
  openCreateModal(): void {
    this.createForm.set({
      nombre: '',
      categoria: 'Primera División',
      rama: 'Masculino',
      formato: 'liga',
      idaVuelta: true,
      fechaInicio: new Date().toISOString().substring(0, 10),
      estado: 'In Progress',
    });
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  saveNewTorneo(): void {
    const f = this.createForm();
    if (!f.nombre.trim()) {
      this.mostrarFeedback('error', 'Ingrese el nombre de la competencia.');
      return;
    }

    this.isCreating.set(true);
    const payload = {
      nombre: f.nombre.trim(),
      categoria: f.categoria,
      rama: f.rama,
      formato: f.formato,
      idaVuelta: f.idaVuelta,
      fechaInicio: f.fechaInicio,
      estado: f.estado,
      progreso: 0,
      colorClase: 'from-[#0b3c5d] via-court-card to-surface-container',
    };

    this.torneosService.crearTorneo(payload).subscribe({
      next: () => {
        this.isCreating.set(false);
        this.closeCreateModal();
        this.cargarTorneos();
        this.mostrarFeedback('success', `Torneo "${payload.nombre}" creado exitosamente.`);
      },
      error: (err) => {
        console.error('Error al crear torneo:', err);
        this.isCreating.set(false);
        this.mostrarFeedback('error', 'Ocurrió un error al registrar el nuevo torneo en la base de datos.');
      },
    });
  }

  // Helper para mensajes de feedback transitorios
  mostrarFeedback(type: 'success' | 'error', message: string): void {
    this.actionFeedback.set({ type, message });
    setTimeout(() => {
      this.actionFeedback.set(null);
    }, 4500);
  }
}
