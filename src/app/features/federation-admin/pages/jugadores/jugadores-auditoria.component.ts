import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { Jugador, JugadoresService } from '../../../../core/services/jugadores.service';

export interface SancionDisciplinaria {
  id: string;
  sancionado: string;
  institucion: string;
  categoria: string;
  fallo: string;
  cumplidas: number;
  totales: number;
  vigencia: string;
  expediente: string;
  estado: 'grave' | 'advertencia' | 'provisorio';
}

export interface ActaPendiente {
  id: string;
  partido: string;
  fechaTorneo: string;
  sede: string;
  estado: string;
  mesa: string;
}

@Component({
  selector: 'app-jugadores-auditoria',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './jugadores-auditoria.component.html',
  styleUrl: './jugadores-auditoria.component.css',
})
export class JugadoresAuditoriaComponent implements OnInit {
  private readonly clubesService = inject(ClubesService);
  private readonly jugadoresService = inject(JugadoresService);
  private readonly sanitizer = inject(DomSanitizer);

  // URL sanitizada para el iframe del visor integrado de PDFs
  protected readonly safeDocUrl = computed<SafeResourceUrl | null>(() => {
    const doc = this.docViewer();
    if (!doc || doc.tipo !== 'pdf') return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(doc.url);
  });

  // Datos reales desde la API
  protected readonly clubes = signal<Club[]>([]);
  protected readonly jugadores = signal<Jugador[]>([]);
  protected readonly loading = signal(true);
  protected readonly actionMessage = signal<string | null>(null);

  // Pestañas del Sistema (Bandeja / Directorio / Actas / Tribunal)
  protected readonly activeTab = signal<'fichajes' | 'clubes' | 'actas' | 'tribunal'>('fichajes');

  // Filtros de Auditoría
  protected readonly selectedClubId = signal<string | null>(null);
  protected readonly selectedCategory = signal<string>('Todas');
  protected readonly selectedStatusFilter = signal<string>('Todos');
  protected readonly searchTerm = signal<string>('');

  // Atleta en Inspección / Modal de Legajo Digital
  protected readonly selectedPlayer = signal<Jugador | null>(null);
  protected readonly isModalOpen = signal<boolean>(false);
  protected readonly observationText = signal<string>('');
  protected readonly provisionalEnabled = signal<boolean>(false);

  // Visor de Documentos Integrado (In-App, sin abrir nueva pestaña)
  protected readonly docViewer = signal<{
    url: string;
    titulo: string;
    tipo: 'pdf' | 'image' | 'unknown';
    nombreArchivo: string;
  } | null>(null);

  // Selección múltiple para aprobación en lote
  protected readonly selectedPlayerIds = signal<Set<string>>(new Set());

  // Tribunal de Penas - Datos de Expedientes Oficiales
  protected readonly sanciones = signal<SancionDisciplinaria[]>([
    {
      id: 'SANC-01',
      sancionado: 'PEÑALOZA, GONZALO',
      institucion: 'San Salvador HC',
      categoria: 'Primera Masc.',
      fallo: '2 Fechas de Suspensión',
      cumplidas: 1,
      totales: 2,
      vigencia: '18/04/2026',
      expediente: 'Fallo #04-2026',
      estado: 'grave',
    },
    {
      id: 'SANC-02',
      sancionado: 'MAMANÍ, RODRIGO',
      institucion: 'Tiro y Gimnasia',
      categoria: 'Juveniles',
      fallo: '1 Fecha de Suspensión',
      cumplidas: 0,
      totales: 1,
      vigencia: '12/04/2026',
      expediente: 'Fallo #05-2026',
      estado: 'grave',
    },
    {
      id: 'SANC-03',
      sancionado: 'DT VACA, MARCOS',
      institucion: 'Minas Handball',
      categoria: 'Cuerpo Técnico',
      fallo: 'Inhabilitación Provisoria 15 días',
      cumplidas: 0,
      totales: 1,
      vigencia: 'Hasta resolución final',
      expediente: 'Exp. #12-T',
      estado: 'provisorio',
    },
    {
      id: 'SANC-04',
      sancionado: 'ROBLES, ENZO',
      institucion: 'C.A. Gorriti',
      categoria: 'Primera Masc.',
      fallo: 'Apercibimiento con Multa Institucional',
      cumplidas: 1,
      totales: 1,
      vigencia: 'Cumplido',
      expediente: 'Res. #02-2026',
      estado: 'advertencia',
    },
  ]);

  // Actas Digitales en Revisión
  protected readonly actasPendientes = signal<ActaPendiente[]>([
    {
      id: 'ACTA-01',
      partido: 'CIAF Jujuy vs C.A. Gorriti',
      fechaTorneo: 'Fecha 4 • Apertura 2026',
      sede: 'Polideportivo Cuyaya',
      estado: 'Planilla en Revisión Arbitral',
      mesa: 'Juez: Ramos / Crono: Farfán',
    },
    {
      id: 'ACTA-02',
      partido: 'Minas Handball vs San Salvador HC',
      fechaTorneo: 'Fecha 4 • Apertura 2026',
      sede: 'Polideportivo San Pedro',
      estado: 'Firma de Capitanes Pendiente',
      mesa: 'Juez: Vilca / Crono: Benítez',
    },
    {
      id: 'ACTA-03',
      partido: 'Tiro y Gimnasia vs Defensores de Palpalá',
      fechaTorneo: 'Fecha 4 • Apertura 2026',
      sede: 'Estadio Federación',
      estado: 'Informe de Tarjeta Azul Adjunto',
      mesa: 'Juez: Tolaba / Crono: Silvetti',
    },
  ]);

  // Club actualmente seleccionado
  protected readonly activeClub = computed(() => {
    const id = this.selectedClubId();
    if (!id) return this.clubes()[0] || null;
    return this.clubes().find((c) => c.id === id) || null;
  });

  // KPIs Generales Calculados Dinámicamente
  protected readonly totalClubs = computed(() => this.clubes().length);
  protected readonly fullClubsCount = computed(() => this.clubes().filter((c) => !c.esInvitado).length);
  protected readonly guestClubsCount = computed(() => this.clubes().filter((c) => c.esInvitado).length);

  protected readonly totalAthletes = computed(() => this.jugadores().length);
  protected readonly enabledAthletes = computed(() =>
    this.jugadores().filter((j) => j.estado === 'Aprobado' || j.estado === 'Habilitado').length,
  );
  protected readonly enabledPercentage = computed(() => {
    const total = this.totalAthletes();
    if (total === 0) return '100';
    return ((this.enabledAthletes() / total) * 100).toFixed(1);
  });
  protected readonly pendingAthletes = computed(() =>
    this.jugadores().filter((j) => j.estado === 'Pendiente').length,
  );
  protected readonly observedAthletes = computed(() =>
    this.jugadores().filter((j) => j.estado === 'Observado' || j.estado === 'Rechazado').length,
  );

  // Lista Filtrada de Jugadores
  protected readonly filteredJugadores = computed(() => {
    const clubId = this.selectedClubId();
    const cat = this.selectedCategory();
    const status = this.selectedStatusFilter();
    const term = this.searchTerm().toLowerCase().trim();

    return this.jugadores().filter((j) => {
      // Filtro por Club
      if (clubId && j.clubId !== clubId) {
        const clubObj = this.clubes().find((c) => c.id === clubId);
        if (!clubObj || !j.club?.nombre.toLowerCase().startsWith(clubObj.nombre.toLowerCase().replace(/ [bc]$/, ''))) {
          return false;
        }
      }

      // Filtro por Categoría
      if (cat !== 'Todas' && j.categoria && !j.categoria.toLowerCase().includes(cat.toLowerCase())) {
        return false;
      }

      // Filtro por Estado
      if (status === 'Pendientes de Auditoría' && j.estado !== 'Pendiente') return false;
      if (status === 'Solo Habilitados' && j.estado !== 'Aprobado' && j.estado !== 'Habilitado') return false;
      if (status === 'Documentación Incompleta' && j.estado !== 'Observado' && j.estado !== 'Rechazado') return false;

      // Filtro por Búsqueda (DNI o Nombre)
      if (term) {
        const matchesDni = j.dni.includes(term);
        const matchesName = j.nombreCompleto.toLowerCase().includes(term);
        if (!matchesDni && !matchesName) return false;
      }

      return true;
    });
  });

  // Estadísticas del club activo
  protected readonly activeClubStats = computed(() => {
    const club = this.activeClub();
    if (!club) return { total: 0, enabled: 0, pending: 0 };
    const clubAthletes = this.jugadores().filter(
      (j) => j.clubId === club.id || j.club?.nombre.toLowerCase().startsWith(club.nombre.toLowerCase().replace(/ [bc]$/, '')),
    );
    return {
      total: clubAthletes.length,
      enabled: clubAthletes.filter((j) => j.estado === 'Aprobado' || j.estado === 'Habilitado').length,
      pending: clubAthletes.filter((j) => j.estado === 'Pendiente').length,
    };
  });

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.loading.set(true);

    this.clubesService.getClubes().subscribe({
      next: (clubes) => {
        this.clubes.set(clubes);
        if (clubes.length > 0 && !this.selectedClubId()) {
          this.selectedClubId.set(clubes[0].id);
        }

        // Cargar jugadores
        this.jugadoresService.getJugadores().subscribe({
          next: (jugadores) => {
            this.jugadores.set(jugadores);
            this.loading.set(false);

            if (jugadores.length > 0 && !this.selectedPlayer()) {
              const pending = jugadores.find((j) => j.estado === 'Pendiente');
              this.selectedPlayer.set(pending || jugadores[0]);
            }
          },
          error: () => {
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  // Navegación de pestañas
  setActiveTab(tab: 'fichajes' | 'clubes' | 'actas' | 'tribunal'): void {
    this.activeTab.set(tab);
  }

  // Selección de club
  selectClub(clubId: string | null): void {
    this.selectedClubId.set(clubId);
  }

  // Modal de Verificación Documental / Legajo
  openAthleteModal(player: Jugador): void {
    this.selectedPlayer.set(player);
    this.observationText.set(
      player.estado === 'Observado'
        ? 'Se requiere subsanar documentación médica u autorización complementaria para habilitación en fecha oficial.'
        : 'Se requiere presentar certificado de apto médico y prueba ergométrica actualizada temporada 2026 emitida por centro de salud habilitado.',
    );
    this.provisionalEnabled.set(false);
    this.isModalOpen.set(true);
  }

  closeAthleteModal(): void {
    this.isModalOpen.set(false);
  }

  // Acciones en el modal
  aprobarFichajeModal(): void {
    const p = this.selectedPlayer();
    if (!p) return;
    this.cambiarEstado(p, 'Aprobado');
    this.closeAthleteModal();
  }

  requerirSubsanacionModal(): void {
    const p = this.selectedPlayer();
    if (!p) return;
    this.cambiarEstado(p, 'Observado');
    this.closeAthleteModal();
  }

  inhabilitarFichajeModal(): void {
    const p = this.selectedPlayer();
    if (!p) return;
    this.cambiarEstado(p, 'Rechazado');
    this.closeAthleteModal();
  }

  // Actualizar estado federativo
  cambiarEstado(player: Jugador, nuevoEstado: string): void {
    this.jugadoresService.cambiarEstado(player.id, nuevoEstado).subscribe({
      next: (actualizado) => {
        this.jugadores.update((list) =>
          list.map((j) => (j.id === actualizado.id ? { ...j, estado: actualizado.estado } : j)),
        );

        if (this.selectedPlayer()?.id === actualizado.id) {
          this.selectedPlayer.update((current) =>
            current ? { ...current, estado: actualizado.estado } : null,
          );
        }

        this.mostrarMensaje(`El atleta ${player.nombreCompleto} ahora está ${nuevoEstado}.`);
      },
      error: () => {
        this.mostrarMensaje('No se pudo actualizar el estado del atleta.');
      },
    });
  }

  // Aprobación en Lote
  aprobarSeleccionados(): void {
    const ids = Array.from(this.selectedPlayerIds());
    if (ids.length === 0) return;

    let count = 0;
    ids.forEach((id) => {
      this.jugadoresService.cambiarEstado(id, 'Aprobado').subscribe({
        next: (actualizado) => {
          count++;
          this.jugadores.update((list) =>
            list.map((j) => (j.id === actualizado.id ? { ...j, estado: actualizado.estado } : j)),
          );
          if (count === ids.length) {
            this.selectedPlayerIds.set(new Set());
            this.mostrarMensaje(`Se han aprobado ${count} atletas exitosamente.`);
          }
        },
      });
    });
  }

  observarSeleccionados(): void {
    const ids = Array.from(this.selectedPlayerIds());
    if (ids.length === 0) return;

    let count = 0;
    ids.forEach((id) => {
      this.jugadoresService.cambiarEstado(id, 'Observado').subscribe({
        next: (actualizado) => {
          count++;
          this.jugadores.update((list) =>
            list.map((j) => (j.id === actualizado.id ? { ...j, estado: actualizado.estado } : j)),
          );
          if (count === ids.length) {
            this.selectedPlayerIds.set(new Set());
            this.mostrarMensaje(`Se han observado ${count} legajos para subsanación.`);
          }
        },
      });
    });
  }

  // Checkbox de selección de jugador
  togglePlayerSelect(playerId: string): void {
    this.selectedPlayerIds.update((set) => {
      const next = new Set(set);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  toggleSelectAll(): void {
    const currentFiltered = this.filteredJugadores();
    if (this.selectedPlayerIds().size === currentFiltered.length) {
      this.selectedPlayerIds.set(new Set());
    } else {
      this.selectedPlayerIds.set(new Set(currentFiltered.map((j) => j.id)));
    }
  }

  isPlayerSelected(playerId: string): boolean {
    return this.selectedPlayerIds().has(playerId);
  }

  // Control de logos con error de carga
  protected readonly failedClubLogoIds = signal<Set<string>>(new Set());

  // Verificar si un club tiene logo válido cargado en base de datos
  hasValidLogo(club: Club | null | undefined): boolean {
    if (!club || !club.logoUrl || !club.logoUrl.trim()) {
      return false;
    }
    return !this.failedClubLogoIds().has(club.id);
  }

  // Resolver URL del logo cargado en base de datos
  getClubLogoUrl(logoUrl?: string | null): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }
    const cleanPath = logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;
    return `${environment.serverUrl}${cleanPath}`;
  }

  // Iniciales del club cuando no tiene logo o si falla su carga
  getClubInitials(club: Club | null | undefined): string {
    if (!club) return 'FJH';
    if (club.siglas && club.siglas.trim()) {
      return club.siglas.trim().toUpperCase();
    }
    if (club.nombre && club.nombre.trim()) {
      const words = club.nombre.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return club.nombre.slice(0, 3).toUpperCase();
    }
    return 'FJH';
  }

  // Si la imagen falla en cargarse (404, red), se conmuta automáticamente a las iniciales
  onClubLogoError(clubId?: string): void {
    if (clubId) {
      this.failedClubLogoIds.update((set) => {
        const next = new Set(set);
        next.add(clubId);
        return next;
      });
    }
  }

  // Detectar si el jugador es menor de edad (requiere autorización de tutores)
  isMinor(player: Jugador | null | undefined): boolean {
    if (!player) return false;

    const cat = (player.categoria || '').toLowerCase().trim();
    const esp = (player.categoriaEspecial || '').toLowerCase().trim();

    // Primera y mayores de edad nunca son menores
    if (
      cat.includes('primera') ||
      esp.includes('primera') ||
      cat.includes('+35') ||
      esp.includes('+35') ||
      cat === 'senior' ||
      cat === 'adultos'
    ) {
      return false;
    }

    // Si tiene fecha de nacimiento, calcular edad real
    if (player.fechaNacimiento) {
      const birth = new Date(player.fechaNacimiento);
      if (!isNaN(birth.getTime())) {
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        return age < 18;
      }
    }

    // Categorías formativas son menores de edad
    return (
      cat.includes('menor') ||
      cat.includes('cadete') ||
      cat.includes('juvenil') ||
      cat.includes('infantil') ||
      cat.includes('mini') ||
      cat.includes('mini-handball')
    );
  }

  // Visor integrado de documentos (PDF/imagen/desconocido)
  openDocumentViewer(titulo: string, relativePath?: string | null): void {
    if (!relativePath) {
      this.mostrarMensaje(`El atleta aún no tiene cargado: ${titulo}`);
      return;
    }
    const url = this.getDocumentUrl(relativePath);
    if (!url) {
      this.mostrarMensaje('No se pudo resolver la ruta del documento.');
      return;
    }
    const lower = url.toLowerCase().split('?')[0];
    let tipo: 'pdf' | 'image' | 'unknown' = 'pdf';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
      tipo = 'image';
    } else if (lower.endsWith('.pdf')) {
      tipo = 'pdf';
    }
    const nombreArchivo = relativePath.split('/').pop() || 'documento';
    this.docViewer.set({ url, titulo, tipo, nombreArchivo });
  }

  closeDocumentViewer(): void {
    this.docViewer.set(null);
  }

  descargarDocumentoActual(): void {
    const doc = this.docViewer();
    if (!doc) return;
    const a = document.createElement('a');
    a.href = doc.url;
    a.download = doc.nombreArchivo;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Resolver URL de documento
  getDocumentUrl(relativePath?: string | null): string {
    return this.jugadoresService.getFileUrl(relativePath);
  }

  openDocument(relativePath?: string | null): void {
    const url = this.getDocumentUrl(relativePath);
    if (url) {
      window.open(url, '_blank');
    }
  }

  // Conteo de pendientes por club
  getPendingCountForClub(clubId: string): number {
    return this.jugadores().filter((j) => j.clubId === clubId && j.estado === 'Pendiente').length;
  }

  getAthletesCountForClub(clubId: string): number {
    return this.jugadores().filter((j) => j.clubId === clubId).length;
  }

  // Acciones Rápidas Ejecutivas
  exportarPadronExcel(): void {
    const athletes = this.filteredJugadores();
    if (athletes.length === 0) {
      this.mostrarMensaje('No hay atletas en el filtro actual para exportar.');
      return;
    }

    const headers = ['DNI', 'Nombre Completo', 'Categoría', 'Equipo', 'Estado', 'Mano Hábil', 'Club'];
    const rows = athletes.map((a) => [
      a.dni,
      `"${a.nombreCompleto}"`,
      a.categoria || 'Primera',
      a.equipo || 'A',
      a.estado,
      a.manoHabil || 'Derecha',
      `"${a.club?.nombre || 'FJH'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Padron_FJH_${this.activeClub()?.siglas || 'General'}_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.mostrarMensaje('Planilla oficial Excel/CSV generada y descargada.');
  }

  abrirRegistroClub(): void {
    this.mostrarMensaje('Formulario de Inscripción Institucional Apertura 2026 habilitado.');
  }

  abrirCargaFalloTribunal(): void {
    this.setActiveTab('tribunal');
    this.mostrarMensaje('Modulo de Carga de Fallos del Tribunal de Penas activado.');
  }

  filtrarPorUrgencia(tipo: 'fichajes' | 'arbitral'): void {
    if (tipo === 'fichajes') {
      this.selectedStatusFilter.set('Pendientes de Auditoría');
      this.setActiveTab('fichajes');
      this.mostrarMensaje('Filtrado a 12 fichajes pendientes con vencimiento administrativo.');
    } else {
      this.setActiveTab('actas');
      this.mostrarMensaje('Redirigiendo a designaciones y monitoreo de partidos en 48hs.');
    }
  }

  protected mostrarMensaje(msg: string): void {
    this.actionMessage.set(msg);
    setTimeout(() => this.actionMessage.set(null), 4000);
  }
}
