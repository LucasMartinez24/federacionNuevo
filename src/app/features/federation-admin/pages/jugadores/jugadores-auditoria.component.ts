import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { Jugador, JugadoresService } from '../../../../core/services/jugadores.service';
import { SancionDisciplinaria, SancionesService } from '../../../../core/services/sanciones.service';

export type { SancionDisciplinaria };

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
  private readonly router = inject(Router);
  private readonly sancionesService = inject(SancionesService);

  // URL sanitizada para el visor de PDFs
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

  // Pestañas del Sistema (fichajes / clubes / actas / tribunal)
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

  // Formulario Tribunal de Penas (Resolución de Tarjeta Azul)
  protected readonly mostrarFormTribunal = signal<boolean>(false);
  protected readonly tribunalFalloTipo = signal<'fechas' | 'dias' | 'apercibimiento'>('fechas');
  protected readonly tribunalCantidadFechas = signal<number>(2);
  protected readonly tribunalExpediente = signal<string>('');
  protected readonly tribunalDetalleInforme = signal<string>('');
  protected readonly tribunalGravedad = signal<'grave' | 'advertencia' | 'provisorio'>('grave');

  // Modal Profesional de Confirmación de Eliminación de Jugador
  protected readonly playerToDelete = signal<Jugador | null>(null);
  protected readonly isDeleting = signal<boolean>(false);

  // Modal Profesional de Confirmación de Eliminación de Sanción (Tribunal)
  protected readonly sancionToDelete = signal<SancionDisciplinaria | null>(null);
  protected readonly isDeletingSancion = signal<boolean>(false);

  // Modal Profesional de Confirmación de Eliminación de Club
  protected readonly clubToDelete = signal<Club | null>(null);
  protected readonly isDeletingClub = signal<boolean>(false);

  // Modal de Auditoría en Lote de Pendientes
  protected readonly isBatchAuditModalOpen = signal<boolean>(false);
  protected readonly batchClubFilter = signal<string>('todos');
  protected readonly batchSearchTerm = signal<string>('');
  protected readonly isBatchProcessing = signal<boolean>(false);
  protected readonly batchSelectedPlayerIds = signal<Set<string>>(new Set());

  // Modal de Carga de Fallos del Tribunal de Penas
  protected readonly isTribunalModalOpen = signal<boolean>(false);
  protected readonly tribunalModoSancionado = signal<'jugador' | 'manual'>('jugador');
  protected readonly tribunalJugadorSeleccionadoId = signal<string>('');
  protected readonly tribunalNombreManual = signal<string>('');
  protected readonly tribunalClubManual = signal<string>('');
  protected readonly tribunalCategoriaManual = signal<string>('Primera Masc.');
  protected readonly tribunalFalloTipoGeneral = signal<'fechas' | 'dias' | 'apercibimiento' | 'descalificacion'>('fechas');
  protected readonly tribunalCantidadFechasGeneral = signal<number>(2);
  protected readonly tribunalExpedienteGeneral = signal<string>('');
  protected readonly tribunalMotivoGeneral = signal<string>('Descalificación directa con informe escrito (Tarjeta Azul CAH 16:8)');
  protected readonly tribunalVigenciaGeneral = signal<string>('Torneo Apertura 2026');
  protected readonly tribunalGravedadGeneral = signal<'grave' | 'advertencia' | 'provisorio'>('grave');
  protected readonly tribunalInhabilitarJugadorGeneral = signal<boolean>(true);
  protected readonly isSavingTribunal = signal<boolean>(false);

  // Visor de Documentos Integrado
  protected readonly docViewer = signal<{
    url: string;
    titulo: string;
    tipo: 'pdf' | 'image' | 'unknown';
    nombreArchivo: string;
  } | null>(null);

  // Selección múltiple para aprobación en lote
  protected readonly selectedPlayerIds = signal<Set<string>>(new Set());

  // Tribunal de Penas - Expedientes Oficiales
  protected readonly sanciones = signal<SancionDisciplinaria[]>([]);

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

  // KPIs Generales
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

      // Filtro por Categoría considerando el Género y Especialidad
      if (cat !== 'Todas') {
        const jCat = (j.categoria || '').toLowerCase().trim();
        const jEsp = (j.categoriaEspecial || '').toLowerCase().trim();
        const jGen = (j.genero || '').toLowerCase().trim();

        const esMasculino = jGen === 'masculino' || jGen === 'm' || jCat.includes('masc') || jEsp.includes('masc');
        const esFemenino = jGen === 'femenino' || jGen === 'f' || jCat.includes('fem') || jEsp.includes('fem');

        if (cat === 'Primera Masc.') {
          const esPrimera = jCat === 'primera' || jCat.includes('primera') || jEsp.includes('primera');
          if (!esPrimera || !esMasculino) return false;
        } else if (cat === 'Primera Fem.') {
          const esPrimera = jCat === 'primera' || jCat.includes('primera') || jEsp.includes('primera');
          if (!esPrimera || !esFemenino) return false;
        } else if (cat === 'Juveniles') {
          const matches = jCat.includes('juvenil') || jEsp.includes('juvenil');
          if (!matches) return false;
        } else if (cat === 'Cadetes') {
          const matches = jCat.includes('cadete') || jEsp.includes('cadete');
          if (!matches) return false;
        } else if (cat === 'Menores') {
          const matches = jCat.includes('menor') || jEsp.includes('menor');
          if (!matches) return false;
        } else if (cat === 'Infantiles') {
          const matches = jCat.includes('infantil') || jCat.includes('mini') || jEsp.includes('infantil');
          if (!matches) return false;
        } else {
          const cleanCat = cat.toLowerCase().replace('.', '').trim();
          if (!jCat.includes(cleanCat) && !jEsp.includes(cleanCat)) {
            return false;
          }
        }
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

  // Lista computada de deportistas pendientes para Auditoría en Lote
  protected readonly pendingAthletesList = computed(() => {
    const clubFilter = this.batchClubFilter();
    const term = this.batchSearchTerm().toLowerCase().trim();

    return this.jugadores().filter((j) => {
      if (j.estado !== 'Pendiente') return false;

      if (clubFilter !== 'todos') {
        if (j.clubId !== clubFilter && j.club?.id !== clubFilter) {
          return false;
        }
      }

      if (term) {
        const matchName = (j.nombreCompleto || '').toLowerCase().includes(term);
        const matchDni = (j.dni || '').includes(term);
        const matchClub = (j.club?.nombre || '').toLowerCase().includes(term);
        if (!matchName && !matchDni && !matchClub) return false;
      }

      return true;
    });
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

        // Cargar sanciones desde el backend
        this.sancionesService.getSanciones().subscribe({
          next: (sanciones: SancionDisciplinaria[]) => this.sanciones.set(sanciones),
          error: (err: any) => console.error('Error al cargar sanciones:', err),
        });

        // Cargar jugadores
        this.jugadoresService.getJugadores().subscribe({
          next: (jugadores) => {
            this.jugadores.set(jugadores);
            this.loading.set(false);
          },
          error: (err) => {
            console.error('Error al cargar atletas:', err);
            this.loading.set(false);
          },
        });
      },
      error: (err) => {
        console.error('Error al cargar clubes:', err);
        this.loading.set(false);
      },
    });
  }

  setActiveTab(tab: 'fichajes' | 'clubes' | 'actas' | 'tribunal'): void {
    this.activeTab.set(tab);
  }

  selectClub(clubId: string | null): void {
    this.selectedClubId.set(clubId);
  }

  mostrarMensaje(mensaje: string): void {
    this.actionMessage.set(mensaje);
    setTimeout(() => {
      if (this.actionMessage() === mensaje) {
        this.actionMessage.set(null);
      }
    }, 3500);
  }

  filtrarPorUrgencia(tipo: string): void {
    if (tipo === 'arbitral') {
      this.selectedStatusFilter.set('Pendientes de Auditoría');
    }
  }

  abrirModal(player: Jugador): void {
    this.selectedPlayer.set(player);
    this.observationText.set('');
    this.provisionalEnabled.set(player.estado === 'Aprobado' || player.estado === 'Habilitado');
    this.isModalOpen.set(true);
  }

  cerrarModal(): void {
    this.isModalOpen.set(false);
    this.selectedPlayer.set(null);
  }

  openAthleteModal(player: Jugador): void {
    this.abrirModal(player);
  }

  closeAthleteModal(): void {
    this.cerrarModal();
  }

  isMinor(player: Jugador | null | undefined): boolean {
    if (!player) return false;

    const cat = (player.categoria || '').toLowerCase().trim();
    const esp = (player.categoriaEspecial || '').toLowerCase().trim();

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

    return (
      cat.includes('juvenil') ||
      cat.includes('cadete') ||
      cat.includes('menor') ||
      cat.includes('infantil') ||
      esp.includes('juvenil') ||
      esp.includes('cadete')
    );
  }

  cambiarEstado(player: Jugador, nuevoEstado: string): void {
    this.jugadoresService.cambiarEstado(player.id, nuevoEstado).subscribe({
      next: (actualizado) => {
        this.jugadores.update((lista) =>
          lista.map((j) => (j.id === actualizado.id ? { ...j, estado: actualizado.estado } : j)),
        );
        if (this.selectedPlayer()?.id === actualizado.id) {
          this.selectedPlayer.update((p) => (p ? { ...p, estado: actualizado.estado } : null));
        }
        this.mostrarMensaje(
          `El jugador ${player.nombreCompleto} ahora está ${nuevoEstado === 'Aprobado' || nuevoEstado === 'Habilitado' ? 'Habilitado' : nuevoEstado}.`,
        );
      },
      error: (err) => {
        console.error('Error al cambiar estado:', err);
        this.mostrarMensaje('Error al actualizar el estado administrativo.');
      },
    });
  }

  guardarObservacion(): void {
    const player = this.selectedPlayer();
    if (!player) return;
    this.cambiarEstado(player, 'Observado');
    this.cerrarModal();
  }

  verDocumento(urlRelativa: string | null | undefined, titulo: string): void {
    if (!urlRelativa) {
      this.mostrarMensaje('No se ha adjuntado ningún archivo para este registro.');
      return;
    }

    const fullUrl = this.jugadoresService.getFileUrl(urlRelativa);
    const cleanUrl = fullUrl.toLowerCase().split('?')[0];
    const isPdf = cleanUrl.endsWith('.pdf');
    const isImg = cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp');

    const nombreArchivo = urlRelativa.split('/').pop() || 'documento';

    this.docViewer.set({
      url: fullUrl,
      titulo,
      tipo: isPdf ? 'pdf' : isImg ? 'image' : 'unknown',
      nombreArchivo,
    });
  }

  openDocumentViewer(arg1: any, arg2?: any): void {
    if (typeof arg1 === 'string' && (arg1.startsWith('/') || arg1.startsWith('http') || arg1.includes('.'))) {
      this.verDocumento(arg1, arg2 || 'Documento');
    } else {
      // arg1 es título y arg2 es la url
      this.verDocumento(arg2, arg1 || 'Documento');
    }
  }

  cerrarVisorDoc(): void {
    this.docViewer.set(null);
  }

  closeDocumentViewer(): void {
    this.cerrarVisorDoc();
  }

  descargarDocumento(urlRelativa?: string | null): void {
    if (!urlRelativa) return;
    const fullUrl = this.jugadoresService.getFileUrl(urlRelativa);
    window.open(fullUrl, '_blank');
  }

  descargarDocumentoActual(): void {
    const doc = this.docViewer();
    if (doc) {
      window.open(doc.url, '_blank');
    }
  }

  toggleSelectAll(event?: any): void {
    if (event && event.target) {
      const checked = event.target.checked;
      if (checked) {
        const ids = new Set(this.filteredJugadores().map((j) => j.id));
        this.selectedPlayerIds.set(ids);
      } else {
        this.selectedPlayerIds.set(new Set());
      }
    } else {
      if (this.selectedPlayerIds().size === this.filteredJugadores().length && this.filteredJugadores().length > 0) {
        this.selectedPlayerIds.set(new Set());
      } else {
        const ids = new Set(this.filteredJugadores().map((j) => j.id));
        this.selectedPlayerIds.set(ids);
      }
    }
  }

  toggleSelectPlayer(id: string): void {
    const current = new Set(this.selectedPlayerIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedPlayerIds.set(current);
  }

  isPlayerSelected(id: string): boolean {
    return this.selectedPlayerIds().has(id);
  }

  togglePlayerSelect(id: string): void {
    this.toggleSelectPlayer(id);
  }

  aprobarSeleccionados(): void {
    this.aprobarLote();
  }

  observarSeleccionados(): void {
    this.rechazarLote();
  }

  aprobarLote(): void {
    const count = this.selectedPlayerIds().size;
    if (count === 0) return;
    this.mostrarMensaje(`Se han habilitado provisoriamente ${count} atleta(s).`);
    this.selectedPlayerIds.set(new Set());
  }

  rechazarLote(): void {
    const count = this.selectedPlayerIds().size;
    if (count === 0) return;
    this.mostrarMensaje(`Se han observado los fichajes de ${count} atleta(s).`);
    this.selectedPlayerIds.set(new Set());
  }

  getClubLogoUrl(logoUrl: string | null | undefined): string {
    if (!logoUrl) return '';
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      return logoUrl;
    }
    return `${environment.serverUrl}${logoUrl}`;
  }

  hasValidLogo(club: Club | null | undefined): boolean {
    return !!club && !!club.logoUrl && club.logoUrl.trim() !== '' && !club.logoUrl.includes('placeholder');
  }

  onClubLogoError(clubId?: string | null): void {
    if (!clubId) return;
    this.clubes.update((list) =>
      list.map((c) => (c.id === clubId ? { ...c, logoUrl: null } : c)),
    );
  }

  getClubInitials(club: Club | null | undefined): string {
    if (!club) return 'FJH';
    if (club.siglas && club.siglas.trim().length > 0) {
      return club.siglas.slice(0, 3).toUpperCase();
    }
    return (club.nombre || 'FJH').slice(0, 3).toUpperCase();
  }

  getPendingCountForClub(clubId: string): number {
    return this.jugadores().filter((j) => j.clubId === clubId && j.estado === 'Pendiente').length;
  }

  getAthletesCountForClub(clubId: string): number {
    return this.jugadores().filter((j) => j.clubId === clubId).length;
  }

  getEnabledCountForClub(clubId: string): number {
    return this.jugadores().filter((j) => j.clubId === clubId && (j.estado === 'Aprobado' || j.estado === 'Habilitado')).length;
  }

  abrirRegistroClub(): void {
    this.router.navigate(['/admin/clubes/crear']);
  }

  abrirRegistroJugador(clubId?: string): void {
    const targetClubId = clubId || this.activeClub()?.id;
    if (targetClubId) {
      this.router.navigate(['/admin/jugadores/crear'], {
        queryParams: { clubId: targetClubId },
      });
    } else {
      this.router.navigate(['/admin/jugadores/crear']);
    }
  }

  abrirCargaFalloTribunal(): void {
    this.abrirModalTribunalGeneral();
  }

  abrirModalAuditoriaLote(): void {
    this.batchClubFilter.set(this.selectedClubId() || 'todos');
    this.batchSearchTerm.set('');
    const allPendingIds = new Set(this.pendingAthletesList().map((a) => a.id));
    this.batchSelectedPlayerIds.set(allPendingIds);
    this.isBatchAuditModalOpen.set(true);
  }

  cerrarModalAuditoriaLote(): void {
    if (this.isBatchProcessing()) return;
    this.isBatchAuditModalOpen.set(false);
    this.batchSelectedPlayerIds.set(new Set());
  }

  toggleBatchSelectAll(event?: any): void {
    if (event && event.target && !event.target.checked) {
      this.batchSelectedPlayerIds.set(new Set());
    } else {
      const ids = new Set(this.pendingAthletesList().map((a) => a.id));
      this.batchSelectedPlayerIds.set(ids);
    }
  }

  toggleBatchSelectPlayer(id: string): void {
    const current = new Set(this.batchSelectedPlayerIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.batchSelectedPlayerIds.set(current);
  }

  toggleBatchSelect(id: string): void {
    this.toggleBatchSelectPlayer(id);
  }

  isBatchPlayerSelected(id: string): boolean {
    return this.batchSelectedPlayerIds().has(id);
  }

  aprobarLoteDesdeModal(): void {
    this.procesarAuditoriaLote('habilitar');
  }

  observarLoteDesdeModal(): void {
    this.procesarAuditoriaLote('observar');
  }

  aprobarUnicoEnLote(player: Jugador): void {
    this.cambiarEstado(player, 'Habilitado');
  }

  observarUnicoEnLote(player: Jugador): void {
    this.cambiarEstado(player, 'Observado');
  }

  procesarAuditoriaLote(accion: 'habilitar' | 'observar'): void {
    const selectedIds = Array.from(this.batchSelectedPlayerIds());
    if (selectedIds.length === 0) {
      this.mostrarMensaje('No hay deportistas seleccionados para auditar en lote.');
      return;
    }

    this.isBatchProcessing.set(true);
    const nuevoEstado = accion === 'habilitar' ? 'Habilitado' : 'Observado';

    const updates = selectedIds.map((id) =>
      this.jugadoresService.cambiarEstado(id, nuevoEstado).toPromise(),
    );

    Promise.all(updates)
      .then((results) => {
        const actualizadosMap = new Map(results.filter(Boolean).map((r: any) => [r.id, r.estado]));
        this.jugadores.update((lista) =>
          lista.map((j) => {
            if (actualizadosMap.has(j.id)) {
              return { ...j, estado: actualizadosMap.get(j.id) };
            }
            return j;
          }),
        );
        this.isBatchProcessing.set(false);
        this.cerrarModalAuditoriaLote();
        this.mostrarMensaje(
          `Auditoría en lote finalizada: ${selectedIds.length} deportistas ${accion === 'habilitar' ? 'habilitados oficialmente' : 'observados'}.`,
        );
      })
      .catch((err) => {
        console.error('Error al procesar lote:', err);
        this.isBatchProcessing.set(false);
        this.mostrarMensaje('Ocurrió un error al procesar algunos deportistas del lote.');
      });
  }

  abrirModalTribunalGeneral(): void {
    this.tribunalModoSancionado.set('jugador');
    this.tribunalJugadorSeleccionadoId.set('');
    this.tribunalNombreManual.set('');
    this.tribunalClubManual.set('');
    this.tribunalCategoriaManual.set('Primera Masc.');
    this.tribunalFalloTipoGeneral.set('fechas');
    this.tribunalCantidadFechasGeneral.set(2);
    this.tribunalExpedienteGeneral.set(`EXP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    this.tribunalMotivoGeneral.set('Descalificación directa con informe escrito (Tarjeta Azul CAH 16:8)');
    this.tribunalVigenciaGeneral.set('Torneo Apertura 2026');
    this.tribunalGravedadGeneral.set('grave');
    this.tribunalInhabilitarJugadorGeneral.set(true);
    this.isTribunalModalOpen.set(true);
  }

  cerrarModalTribunalGeneral(): void {
    if (this.isSavingTribunal()) return;
    this.isTribunalModalOpen.set(false);
  }

  cerrarCargaFalloTribunal(): void {
    this.cerrarModalTribunalGeneral();
  }

  onSeleccionarJugadorTribunal(id: string): void {
    this.tribunalJugadorSeleccionadoId.set(id);
    const j = this.jugadores().find((x) => x.id === id);
    if (j) {
      this.tribunalClubManual.set(j.club?.nombre || '');
      this.tribunalCategoriaManual.set(j.categoria || 'Primera Masc.');
    }
  }

  guardarNuevoFalloTribunal(): void {
    this.guardarFalloTribunalGeneral();
  }

  guardarFalloTribunalGeneral(): void {
    let sancionadoNombre = '';
    let clubNombre = '';
    let categoria = '';
    let jugadorRef: Jugador | undefined;

    if (this.tribunalModoSancionado() === 'jugador') {
      const jId = this.tribunalJugadorSeleccionadoId();
      if (!jId) {
        this.mostrarMensaje('Debe seleccionar un jugador de la lista federativa.');
        return;
      }
      jugadorRef = this.jugadores().find((j) => j.id === jId);
      if (!jugadorRef) {
        this.mostrarMensaje('Jugador no encontrado en el padrón.');
        return;
      }
      sancionadoNombre = jugadorRef.nombreCompleto;
      clubNombre = jugadorRef.club?.nombre || 'Club Federado';
      categoria = jugadorRef.categoria || 'Primera';
    } else {
      if (!this.tribunalNombreManual().trim()) {
        this.mostrarMensaje('Ingrese el nombre de la persona o cuerpo técnico sancionado.');
        return;
      }
      sancionadoNombre = this.tribunalNombreManual().trim();
      clubNombre = this.tribunalClubManual().trim() || 'Club Federado';
      categoria = this.tribunalCategoriaManual();
    }

    let falloTexto = '';
    let totalFechas = 0;
    if (this.tribunalFalloTipoGeneral() === 'fechas') {
      totalFechas = this.tribunalCantidadFechasGeneral();
      falloTexto = `${totalFechas} Fecha${totalFechas > 1 ? 's' : ''} de Suspensión Oficial`;
    } else if (this.tribunalFalloTipoGeneral() === 'dias') {
      totalFechas = this.tribunalCantidadFechasGeneral();
      falloTexto = `Suspensión Temporal de ${totalFechas} Días Corridos`;
    } else if (this.tribunalFalloTipoGeneral() === 'apercibimiento') {
      falloTexto = 'Apercibimiento Disciplinario Escrito';
    } else {
      falloTexto = 'Descalificación Directa con Informe CAH';
    }

    const payload = {
      sancionado: sancionadoNombre,
      institucion: clubNombre,
      categoria,
      fallo: falloTexto,
      cumplidas: 0,
      totales: totalFechas,
      vigencia: this.tribunalVigenciaGeneral(),
      expediente: this.tribunalExpedienteGeneral() || `EXP-${Date.now().toString().slice(-4)}`,
      estado: this.tribunalGravedadGeneral(),
      jugadorId: jugadorRef ? jugadorRef.id : undefined,
      clubId: jugadorRef ? jugadorRef.clubId : undefined,
      motivo: this.tribunalMotivoGeneral(),
    };

    this.isSavingTribunal.set(true);
    this.sancionesService.crearSancion(payload).subscribe({
      next: (nuevaSancion: SancionDisciplinaria) => {
        this.sanciones.update((lista) => [nuevaSancion, ...lista]);

        if (jugadorRef && this.tribunalInhabilitarJugadorGeneral()) {
          this.jugadoresService.cambiarEstado(jugadorRef.id, 'Rechazado').subscribe({
            next: (act) => {
              this.jugadores.update((lista) =>
                lista.map((j) => (j.id === act.id ? { ...j, estado: act.estado } : j)),
              );
            },
          });
        }

        this.isSavingTribunal.set(false);
        this.cerrarModalTribunalGeneral();
        this.setActiveTab('tribunal');
        this.mostrarMensaje(`Fallo disciplinario ${payload.expediente} registrado con éxito en el Tribunal.`);
      },
      error: (err: any) => {
        console.error('Error al guardar fallo:', err);
        this.isSavingTribunal.set(false);
        this.mostrarMensaje('Error al registrar la sanción en el Tribunal de Penas.');
      },
    });
  }

  toggleFormTribunal(): void {
    this.mostrarFormTribunal.update((v) => !v);
  }

  aplicarSancionTribunal(): void {
    const player = this.selectedPlayer();
    if (!player) return;

    const nuevaSancion = {
      sancionado: player.nombreCompleto,
      institucion: player.club?.nombre || 'Club Federado',
      categoria: player.categoria || 'Primera',
      fallo: this.tribunalFalloTipo() === 'fechas' ? `${this.tribunalCantidadFechas()} Fechas de Suspensión` : 'Apercibimiento Formal',
      cumplidas: 0,
      totales: this.tribunalCantidadFechas(),
      vigencia: 'Torneo Apertura 2026',
      expediente: this.tribunalExpediente() || `EXP-${Date.now().toString().slice(-4)}`,
      estado: this.tribunalGravedad(),
      jugadorId: player.id,
      clubId: player.clubId,
      motivo: this.tribunalDetalleInforme() || 'Fallo disciplinario aplicado por Tribunal',
    };

    this.sancionesService.crearSancion(nuevaSancion).subscribe({
      next: (created: SancionDisciplinaria) => {
        this.sanciones.update((list) => [created, ...list]);
        this.cambiarEstado(player, 'Rechazado');
        this.mostrarFormTribunal.set(false);
        this.mostrarMensaje(`Sanción aplicada a ${player.nombreCompleto} y registrada en el Tribunal.`);
      },
      error: () => this.mostrarMensaje('Error al registrar la sanción en el Tribunal.'),
    });
  }

  habilitarJugadorModal(player?: Jugador | null): void {
    const p = player || this.selectedPlayer();
    if (!p) return;
    this.cambiarEstado(p, 'Habilitado');
  }

  deshabilitarJugadorModal(player?: Jugador | null): void {
    const p = player || this.selectedPlayer();
    if (!p) return;
    this.cambiarEstado(p, 'Rechazado');
  }

  editarJugadorModal(player?: Jugador | null): void {
    const p = player || this.selectedPlayer();
    if (!p) return;
    this.router.navigate(['/admin/jugadores/editar', p.id]);
  }

  eliminarJugadorModal(player?: Jugador | null): void {
    const p = player || this.selectedPlayer();
    if (!p) return;
    this.solicitarEliminarJugador(p);
  }

  solicitarEliminarJugador(player: Jugador): void {
    this.playerToDelete.set(player);
  }

  cancelarEliminacion(): void {
    if (this.isDeleting()) return;
    this.playerToDelete.set(null);
  }

  confirmarEliminacion(): void {
    const p = this.playerToDelete();
    if (!p) return;
    this.isDeleting.set(true);
    this.jugadoresService.eliminarJugador(p.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.jugadores.update((list) => list.filter((j) => j.id !== p.id));
        if (this.selectedPlayer()?.id === p.id) {
          this.cerrarModal();
        }
        this.playerToDelete.set(null);
        this.mostrarMensaje(`Atleta ${p.nombreCompleto} eliminado exitosamente del padrón.`);
      },
      error: () => {
        this.isDeleting.set(false);
        this.mostrarMensaje('Error al eliminar el atleta del padrón.');
      },
    });
  }

  solicitarEliminarSancion(sancion: SancionDisciplinaria): void {
    this.sancionToDelete.set(sancion);
  }

  cancelarEliminacionSancion(): void {
    if (this.isDeletingSancion()) return;
    this.sancionToDelete.set(null);
  }

  confirmarEliminacionSancion(): void {
    const sancion = this.sancionToDelete();
    if (!sancion) return;

    this.isDeletingSancion.set(true);
    this.sancionesService.eliminarSancion(sancion.id).subscribe({
      next: () => {
        this.isDeletingSancion.set(false);
        this.sanciones.update((list) => list.filter((s) => s.id !== sancion.id));
        this.sancionToDelete.set(null);
        this.mostrarMensaje(`Sanción ${sancion.expediente} eliminada con éxito del Tribunal.`);
      },
      error: () => {
        this.isDeletingSancion.set(false);
        this.mostrarMensaje('Error al eliminar la sanción del Tribunal.');
      },
    });
  }

  eliminarSancionTribunal(sancion: SancionDisciplinaria): void {
    this.solicitarEliminarSancion(sancion);
  }

  editarClub(club?: Club | null): void {
    const target = club || this.activeClub();
    if (!target) return;
    this.router.navigate(['/admin/clubes/editar', target.id]);
  }

  solicitarEliminarClub(club?: Club | null): void {
    const target = club || this.activeClub();
    if (!target) return;
    this.clubToDelete.set(target);
  }

  cancelarEliminacionClub(): void {
    if (this.isDeletingClub()) return;
    this.clubToDelete.set(null);
  }

  confirmarEliminacionClub(): void {
    const club = this.clubToDelete();
    if (!club) return;

    this.isDeletingClub.set(true);
    this.clubesService.deleteClub(club.id).subscribe({
      next: () => {
        this.isDeletingClub.set(false);
        this.clubes.update((list) => list.filter((c) => c.id !== club.id));
        this.jugadores.update((list) => list.filter((j) => j.clubId !== club.id));
        if (this.selectedClubId() === club.id) {
          const remaining = this.clubes();
          this.selectedClubId.set(remaining.length > 0 ? remaining[0].id : null);
        }
        this.clubToDelete.set(null);
        this.mostrarMensaje(`Institución "${club.nombre}" eliminada exitosamente del padrón.`);
      },
      error: () => {
        this.isDeletingClub.set(false);
        this.mostrarMensaje('Error al eliminar la institución.');
      },
    });
  }

  // --- MÉTODOS AUXILIARES PARA EXPORTACIÓN A EXCEL / CSV ---

  private cleanField(val?: string | number | null): string {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""').trim();
    return `"${str}"`;
  }

  private formatearFecha(fechaStr?: string | null): string {
    if (!fechaStr) return 'S/D';
    const cleanFecha = fechaStr.includes('T') ? fechaStr.split('T')[0] : fechaStr;
    const parts = cleanFecha.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return fechaStr;
  }

  private calcularEdad(fechaNac?: string | null): string {
    if (!fechaNac) return 'S/D';
    const cleanFecha = fechaNac.includes('T') ? fechaNac.split('T')[0] : fechaNac;
    const parts = cleanFecha.split('-');
    let birth: Date;
    if (parts.length === 3 && parts[0].length === 4) {
      birth = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      birth = new Date(cleanFecha);
    }
    if (isNaN(birth.getTime())) return 'S/D';

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 && age < 120 ? `${age} años` : 'S/D';
  }

  private getCategoriaRank(cat?: string | null, genero?: string | null): number {
    const c = (cat || '').toLowerCase().trim();
    const g = (genero || '').toLowerCase().trim();
    const esMasc = g.startsWith('m') || c.includes('masc');
    const esFem = g.startsWith('f') || c.includes('fem');

    if (c.includes('primera') || c === 'primera') {
      return esMasc ? 10 : esFem ? 15 : 12;
    }
    if (c.includes('juvenil')) {
      return esMasc ? 20 : esFem ? 25 : 22;
    }
    if (c.includes('cadete')) {
      return esMasc ? 30 : esFem ? 35 : 32;
    }
    if (c.includes('menor')) {
      return esMasc ? 40 : esFem ? 45 : 42;
    }
    if (c.includes('infantil') || c.includes('mini')) {
      return esMasc ? 50 : esFem ? 55 : 52;
    }
    if (c.includes('+35') || c.includes('master') || c.includes('senior')) {
      return 60;
    }
    return 70;
  }

  private descargarCsv(contenido: string, nombreArchivo: string): void {
    const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', nombreArchivo);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(url), 2000);
  }

  // --- 1. EXPORTAR PADRÓN GENERAL (TODOS LOS CLUBES) ---
  exportarPadronGeneral(): void {
    const todosLosClubes = [...this.clubes()].sort((a, b) =>
      (a.nombre || '').localeCompare(b.nombre || '', 'es')
    );
    const todosLosAtletas = [...this.jugadores()];

    // Ordenamiento riguroso de atletas: 1° Club (alfabético A-Z), 2° Categoría jerárquica CAH, 3° Apellido y Nombre
    todosLosAtletas.sort((a, b) => {
      const clubObjA = a.club || this.clubes().find((c) => c.id === a.clubId);
      const clubObjB = b.club || this.clubes().find((c) => c.id === b.clubId);
      const clubA = (clubObjA?.nombre || '').toLowerCase();
      const clubB = (clubObjB?.nombre || '').toLowerCase();
      if (clubA !== clubB) {
        return clubA.localeCompare(clubB, 'es');
      }

      const rankA = this.getCategoriaRank(a.categoria, a.genero);
      const rankB = this.getCategoriaRank(b.categoria, b.genero);
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      const nombreA = (a.nombreCompleto || '').toLowerCase();
      const nombreB = (b.nombreCompleto || '').toLowerCase();
      return nombreA.localeCompare(nombreB, 'es');
    });

    const now = new Date();
    const fechaEmision = `${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    const totalClubes = todosLosClubes.length;
    const totalAtletas = todosLosAtletas.length;
    const totalHabilitados = todosLosAtletas.filter((a) => a.estado === 'Aprobado' || a.estado === 'Habilitado').length;
    const totalPendientes = todosLosAtletas.filter((a) => a.estado === 'Pendiente').length;
    const totalObservados = todosLosAtletas.filter((a) => a.estado === 'Rechazado' || a.estado === 'Observado').length;

    // Encabezado federativo oficial institucional
    const encabezadoMetadata = [
      ['FEDERACIÓN JUJEÑA DE HANDBALL (FJH) - REPORTE Y PADRÓN GENERAL CONSOLIDADO 2026', '', '', '', '', '', '', '', '', ''],
      ['TEMPORADA OFICIAL:', '2026 • Homologación Oficial CAH', 'FECHA Y HORA EMISIÓN:', fechaEmision, '', '', '', '', '', ''],
      ['TOTAL CLUBES REGISTRADOS:', `${totalClubes}`, 'TOTAL ATLETAS FEDERADOS:', `${totalAtletas}`, 'HABILITADOS:', `${totalHabilitados}`, 'PENDIENTES AUDITORÍA:', `${totalPendientes}`, 'OBSERVADOS:', `${totalObservados}`],
      ['', '', '', '', '', '', '', '', '', ''],
    ];

    // SECCIÓN 1: Directorio Institucional de TODOS los Clubes
    const seccionClubesTitulo = [
      ['--- SECCIÓN 1: DIRECTORIO INSTITUCIONAL Y ESTADO ADMINISTRATIVO DE TODOS LOS CLUBES ---', '', '', '', '', '', '', '', '', ''],
    ];

    const clubesHeaders = [
      'N°',
      'Institución Deportiva',
      'Siglas Oficiales',
      'Condición Federativa',
      'Delegado / Usuario',
      'Total Atletas',
      'Habilitados',
      'Pendientes Auditoría',
      'Observados / Inhabilitados',
      'Estado Administrativo',
    ];

    const clubesRows = todosLosClubes.map((c, index) => {
      const atletasClub = todosLosAtletas.filter((j) => j.clubId === c.id || j.club?.id === c.id);
      const habClub = atletasClub.filter((j) => j.estado === 'Aprobado' || j.estado === 'Habilitado').length;
      const pendClub = atletasClub.filter((j) => j.estado === 'Pendiente').length;
      const obsClub = atletasClub.filter((j) => j.estado === 'Rechazado' || j.estado === 'Observado').length;

      let estadoAdm = 'Activo - Padrón al día';
      if (atletasClub.length === 0) {
        estadoAdm = 'Registrado - Sin atletas cargados';
      } else if (pendClub > 0) {
        estadoAdm = `Pendiente (${pendClub} auditorías)`;
      }

      return [
        this.cleanField(index + 1),
        this.cleanField(c.nombre),
        this.cleanField(c.siglas),
        this.cleanField(c.esInvitado ? 'Club Invitado Provincial' : 'Afiliado Pleno CAH-FJH'),
        this.cleanField(c.username ? '@' + c.username : 'Sin usuario de acceso'),
        this.cleanField(atletasClub.length),
        this.cleanField(habClub),
        this.cleanField(pendClub),
        this.cleanField(obsClub),
        this.cleanField(estadoAdm),
      ];
    });

    // SECCIÓN 2: Padrón Nominal Consolidado de Atletas
    const seccionAtletasTitulo = [
      ['', '', '', '', '', '', '', '', '', ''],
      ['--- SECCIÓN 2: PADRÓN NOMINAL CONSOLIDADO DE ATLETAS (AGRUPADO POR CLUB Y CATEGORÍA) ---', '', '', '', '', '', '', '', '', ''],
    ];

    const atletasHeaders = [
      'N° Atleta',
      'Club / Institución',
      'Siglas',
      'Condición Club',
      'DNI',
      'Apellido y Nombre',
      'Categoría',
      'Rama / Género',
      'Fecha Nacimiento',
      'Edad',
      'Estado Federativo',
      'Apto Médico (Ficha)',
      'Ficha de Afiliación',
      'Autorización Tutor',
      'Mano Hábil',
      'WhatsApp / Teléfono',
      'Email',
    ];

    let atletasRows: string[][] = [];
    if (todosLosAtletas.length === 0) {
      atletasRows = [
        [
          this.cleanField(1),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('No se registran atletas cargados en el padrón provincial'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('Sin registros'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
        ],
      ];
    } else {
      atletasRows = todosLosAtletas.map((a, index) => {
        const clubObj = a.club || this.clubes().find((c) => c.id === a.clubId);
        const clubNombre = clubObj?.nombre || 'Club Federado';
        const clubSiglas = clubObj?.siglas || '-';
        const clubTipo = clubObj?.esInvitado ? 'Club Invitado' : 'Afiliado Pleno';

        const estadoLegible =
          a.estado === 'Aprobado' || a.estado === 'Habilitado'
            ? 'Habilitado'
            : a.estado === 'Rechazado'
            ? 'Inhabilitado'
            : a.estado === 'Pendiente'
            ? 'Pendiente de Auditoría'
            : a.estado || 'Pendiente';

        const aptoTxt = a.fichaMedicaUrl ? 'Presentado / Vigente' : 'Pendiente';
        const fichaTxt = a.fichaJugadorUrl ? 'Presentada' : 'Pendiente';
        const menor = this.isMinor(a);
        const tutorTxt = menor ? (a.autorizacionUrl ? 'Presentada' : 'Falta Autorización') : 'Mayor de Edad';

        return [
          this.cleanField(index + 1),
          this.cleanField(clubNombre),
          this.cleanField(clubSiglas),
          this.cleanField(clubTipo),
          this.cleanField(a.dni),
          this.cleanField(a.nombreCompleto),
          this.cleanField(a.categoria || 'Primera'),
          this.cleanField(a.genero || 'S/D'),
          this.cleanField(this.formatearFecha(a.fechaNacimiento)),
          this.cleanField(this.calcularEdad(a.fechaNacimiento)),
          this.cleanField(estadoLegible),
          this.cleanField(aptoTxt),
          this.cleanField(fichaTxt),
          this.cleanField(tutorTxt),
          this.cleanField(a.manoHabil || 'Derecha'),
          this.cleanField(a.whatsapp || 'S/D'),
          this.cleanField(a.email || 'S/D'),
        ];
      });
    }

    const csvLines = [
      ...encabezadoMetadata.map((line) => line.map((c) => this.cleanField(c)).join(';')),
      ...seccionClubesTitulo.map((line) => line.map((c) => this.cleanField(c)).join(';')),
      clubesHeaders.map((h) => this.cleanField(h)).join(';'),
      ...clubesRows.map((r) => r.join(';')),
      ...seccionAtletasTitulo.map((line) => line.map((c) => this.cleanField(c)).join(';')),
      atletasHeaders.map((h) => this.cleanField(h)).join(';'),
      ...atletasRows.map((r) => r.join(';')),
    ];

    const csvContent = csvLines.join('\r\n');
    this.descargarCsv(csvContent, 'Padron_General_FJH_Todos_Los_Clubes_2026.csv');
    this.mostrarMensaje(`Padrón general exportado con éxito: ${totalClubes} instituciones y ${totalAtletas} atletas federados.`);
  }

  // --- 2. EXPORTAR PADRÓN DE CLUB ESPECÍFICO ---
  exportarPadronClubActual(): void {
    this.exportarPadronDeClub(this.activeClub());
  }

  exportarPadronDeClub(targetClub?: Club | null): void {
    const club = targetClub || this.activeClub();
    if (!club) {
      this.mostrarMensaje('Seleccione un club para exportar su padrón.');
      return;
    }

    // FILTRADO ESTRICTO Y EXCLUSIVO: Solo atletas pertenecientes a ESTE club
    const athletes = this.jugadores().filter((j) => {
      return j.clubId === club.id || (j.club && j.club.id === club.id);
    });

    // Ordenamiento riguroso de atletas dentro del club: 1° Categoría oficial, 2° Rama/Género, 3° Apellido y Nombre
    athletes.sort((a, b) => {
      const rankA = this.getCategoriaRank(a.categoria, a.genero);
      const rankB = this.getCategoriaRank(b.categoria, b.genero);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      const nombreA = (a.nombreCompleto || '').toLowerCase();
      const nombreB = (b.nombreCompleto || '').toLowerCase();
      return nombreA.localeCompare(nombreB, 'es');
    });

    const now = new Date();
    const fechaEmision = `${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    const habilitados = athletes.filter((a) => a.estado === 'Aprobado' || a.estado === 'Habilitado').length;
    const pendientes = athletes.filter((a) => a.estado === 'Pendiente').length;
    const inhabilitados = athletes.filter((a) => a.estado === 'Rechazado' || a.estado === 'Observado').length;

    // Encabezado institucional con TODA la información del club seleccionado
    const encabezadoMetadata = [
      ['FEDERACIÓN JUJEÑA DE HANDBALL (FJH) - PADRÓN OFICIAL POR INSTITUCIÓN 2026', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['INSTITUCIÓN DEPORTIVA:', club.nombre, 'SIGLAS:', club.siglas, 'CONDICIÓN:', club.esInvitado ? 'Club Invitado Provincial' : 'Afiliado Pleno CAH-FJH', 'DELEGADO (USUARIO):', club.username ? '@' + club.username : 'Sin usuario asignado', '', '', '', '', '', ''],
      ['TOTAL PADRÓN CLUB:', `${athletes.length} atletas registrados`, 'HABILITADOS:', `${habilitados}`, 'PENDIENTES AUDITORÍA:', `${pendientes}`, 'OBSERVADOS / INHAB.:', `${inhabilitados}`, 'FECHA Y HORA EMISIÓN:', fechaEmision, '', '', '', '', ''],
      ['HOMOLOGACIÓN Y NORMATIVA:', 'Reglamento Oficial FJH • Temporada Oficial 2026 homologada por CAH', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];

    const columnHeaders = [
      'N°',
      'DNI',
      'Apellido y Nombre',
      'Categoría',
      'Rama / Género',
      'Fecha Nacimiento',
      'Edad',
      'Estado Federativo',
      'Apto Médico (Ficha)',
      'Ficha de Afiliación',
      'Autorización Tutor',
      'Mano Hábil',
      'WhatsApp / Teléfono',
      'Email',
    ];

    let rows: string[][] = [];
    if (athletes.length === 0) {
      rows = [
        [
          this.cleanField(1),
          this.cleanField('-'),
          this.cleanField('Sin deportistas registrados actualmente en esta institución'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('Pendiente de registro de atletas'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
          this.cleanField('-'),
        ],
      ];
    } else {
      rows = athletes.map((a, index) => {
        const estadoLegible =
          a.estado === 'Aprobado' || a.estado === 'Habilitado'
            ? 'Habilitado'
            : a.estado === 'Rechazado'
            ? 'Inhabilitado'
            : a.estado === 'Pendiente'
            ? 'Pendiente de Auditoría'
            : a.estado || 'Pendiente';

        const aptoTxt = a.fichaMedicaUrl ? 'Presentado / Vigente' : 'Pendiente';
        const fichaTxt = a.fichaJugadorUrl ? 'Presentada' : 'Pendiente';
        const menor = this.isMinor(a);
        const tutorTxt = menor ? (a.autorizacionUrl ? 'Presentada' : 'Falta Autorización') : 'Mayor de Edad';

        return [
          this.cleanField(index + 1),
          this.cleanField(a.dni),
          this.cleanField(a.nombreCompleto),
          this.cleanField(a.categoria || 'Primera'),
          this.cleanField(a.genero || 'S/D'),
          this.cleanField(this.formatearFecha(a.fechaNacimiento)),
          this.cleanField(this.calcularEdad(a.fechaNacimiento)),
          this.cleanField(estadoLegible),
          this.cleanField(aptoTxt),
          this.cleanField(fichaTxt),
          this.cleanField(tutorTxt),
          this.cleanField(a.manoHabil || 'Derecha'),
          this.cleanField(a.whatsapp || 'S/D'),
          this.cleanField(a.email || 'S/D'),
        ];
      });
    }

    const csvLines = [
      ...encabezadoMetadata.map((line) => line.map((cell) => this.cleanField(cell)).join(';')),
      columnHeaders.map((h) => this.cleanField(h)).join(';'),
      ...rows.map((r) => r.join(';')),
    ];
    const csvContent = csvLines.join('\r\n');

    const cleanSiglas = (club.siglas || club.nombre || 'CLUB').replace(/[^a-zA-Z0-9]/g, '_');
    this.descargarCsv(csvContent, `Padron_Oficial_${cleanSiglas}_2026.csv`);
    this.mostrarMensaje(`Padrón oficial de "${club.nombre}" exportado con éxito (${athletes.length} atletas).`);
  }

  // Compatibilidad hacia atrás
  exportarPadronExcel(): void {
    this.exportarPadronGeneral();
  }
}
