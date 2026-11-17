import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AdminSidebarStateService } from '../../../../core/navigation/admin-sidebar-state.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { Jugador, JugadoresService } from '../../../../core/services/jugadores.service';
import { SancionDisciplinaria, SancionesService } from '../../../../core/services/sanciones.service';
import { TicketItem, TicketMessage, TicketsService } from '../../../../core/services/tickets.service';

export interface PlantillaRespuesta {
  id: string;
  titulo: string;
  categoria: string;
  icono: string;
  texto: string;
}

@Component({
  selector: 'app-soporte-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './soporte-admin.component.html',
  styleUrl: './soporte-admin.component.css',
})
export class SoporteAdminComponent implements OnInit {
  private readonly ticketsService = inject(TicketsService);
  private readonly clubesService = inject(ClubesService);
  private readonly jugadoresService = inject(JugadoresService);
  private readonly sancionesService = inject(SancionesService);
  private readonly authService = inject(AuthService);
  private readonly sidebarState = inject(AdminSidebarStateService);
  private readonly router = inject(Router);

  // Datos principales
  protected readonly tickets = signal<TicketItem[]>([]);
  protected readonly clubes = signal<Club[]>([]);
  protected readonly jugadores = signal<Jugador[]>([]);
  protected readonly sanciones = signal<SancionDisciplinaria[]>([]);

  // Estado de selección y carga
  protected readonly activeTicket = signal<TicketItem | null>(null);
  protected readonly messages = signal<TicketMessage[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly loadingMessages = signal<boolean>(false);

  // Filtros de bandeja de entrada
  protected readonly searchQuery = signal<string>('');
  protected readonly statusFilter = signal<'todos' | 'pendientes' | 'espera' | 'resueltos'>('todos');
  protected readonly categoryFilter = signal<string>('ALL');

  // Estado del Composer
  protected readonly composerMode = signal<'official' | 'internal'>('official');
  protected readonly replyText = signal<string>('');
  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly isSending = signal<boolean>(false);
  protected readonly showTemplatesMenu = signal<boolean>(false);
  protected readonly showStatusMenu = signal<boolean>(false);

  // Modal: Nuevo Expediente / Comunicado hacia un Club
  protected readonly showNewTicketModal = signal<boolean>(false);
  protected readonly newTicketClubId = signal<string>('');
  protected readonly newTicketCategoria = signal<string>('Fichajes y Reglamentos');
  protected readonly newTicketAsunto = signal<string>('');
  protected readonly newTicketDescripcion = signal<string>('');
  protected readonly newTicketFiles = signal<File[]>([]);
  protected readonly isCreatingTicket = signal<boolean>(false);

  // Modal: Confirmación de Eliminación
  protected readonly ticketToDelete = signal<TicketItem | null>(null);
  protected readonly isDeleting = signal<boolean>(false);

  // Toast en primer plano (z-[9999])
  protected readonly toastMessage = signal<string | null>(null);
  protected readonly toastType = signal<'success' | 'error' | 'info'>('success');

  // Registro de errores de logos
  private readonly logoErrors = signal<Set<string>>(new Set());

  // Plantillas rápidas oficiales FJH
  protected readonly plantillas: PlantillaRespuesta[] = [
    {
      id: 'ficha-ok',
      titulo: 'Homologación de Ficha / Apto Médico',
      categoria: 'Fichajes',
      icono: 'verified',
      texto:
        'Estimada Secretaría: Hemos verificado la documentación médica y administrativa remitida. Se ha procedido a actualizar y habilitar la ficha correspondiente en el Padrón Oficial FJH.',
    },
    {
      id: 'tesoreria-ok',
      titulo: 'Acuse de Recibo de Arancel / Pago',
      categoria: 'Tesorería',
      icono: 'payments',
      texto:
        'Se acusa recibo del comprobante de transferencia adjunto. Tesorería FJH ha imputado el pago en la cuenta corriente institucional del club.',
    },
    {
      id: 'reprogramacion',
      titulo: 'Elevación a Comisión Técnica (Fixture)',
      categoria: 'Competencias',
      icono: 'event_repeat',
      texto:
        'Su solicitud sobre programación de fecha ha sido registrada por Mesa de Control y elevada a la Comisión Técnica FJH para su evaluación reglamentaria.',
    },
    {
      id: 'tribunal-descargo',
      titulo: 'Incorporación de Descargo al Tribunal',
      categoria: 'Tribunal',
      icono: 'gavel',
      texto:
        'Se deja constancia de la recepción en tiempo y forma del descargo presentado. Las actuaciones han sido incorporadas al expediente disciplinario para dictamen del Tribunal de Penas.',
    },
    {
      id: 'doc-faltante',
      titulo: 'Requerimiento de Documentación Legible',
      categoria: 'Auditoría',
      icono: 'find_in_page',
      texto:
        'Para dar curso favorable a la solicitud, requerimos adjuntar por esta misma vía el documento respaldatorio completo, con firma y sello legible en formato PDF o imagen de alta resolución.',
    },
  ];

  // Usuario actual
  protected readonly currentUserName = computed(() => {
    const u = this.authService.currentUser();
    return u?.nombre || u?.username || 'Mesa de Control FJH';
  });

  // Contadores de Telemetría
  protected readonly totalTicketsCount = computed(() => this.tickets().length);
  protected readonly pendientesCount = computed(
    () => this.tickets().filter((t) => t.status !== 'Resuelto' && t.status !== 'Cerrado').length
  );
  protected readonly enEsperaCount = computed(
    () => this.tickets().filter((t) => t.status === 'En Espera').length
  );
  protected readonly resueltosCount = computed(
    () => this.tickets().filter((t) => t.status === 'Resuelto' || t.status === 'Cerrado').length
  );

  // Filtrado de Tickets en Bandeja de Entrada
  protected readonly filteredTickets = computed(() => {
    const list = this.tickets();
    const query = this.searchQuery().toLowerCase().trim();
    const statusF = this.statusFilter();
    const catF = this.categoryFilter();

    return list.filter((t) => {
      // 1. Filtro por Estado
      if (statusF === 'pendientes') {
        if (t.status === 'Resuelto' || t.status === 'Cerrado') return false;
      } else if (statusF === 'espera') {
        if (t.status !== 'En Espera') return false;
      } else if (statusF === 'resueltos') {
        if (t.status !== 'Resuelto' && t.status !== 'Cerrado') return false;
      }

      // 2. Filtro por Categoría
      if (catF !== 'ALL') {
        const catNorm = (t.categoria || '').toLowerCase();
        if (!catNorm.includes(catF.toLowerCase())) return false;
      }

      // 3. Filtro por Texto (Club, #ID, Asunto, Último mensaje)
      if (query) {
        const clubName = this.getClubName(t).toLowerCase();
        const clubSiglas = this.getClubSiglas(t).toLowerCase();
        const shortId = t.id.substring(0, 6).toLowerCase();
        const asunto = (t.asunto || '').toLowerCase();
        const cat = (t.categoria || '').toLowerCase();
        const lastMsg = (t.messages?.[0]?.text || '').toLowerCase();

        const matches =
          clubName.includes(query) ||
          clubSiglas.includes(query) ||
          shortId.includes(query) ||
          t.id.toLowerCase().includes(query) ||
          asunto.includes(query) ||
          cat.includes(query) ||
          lastMsg.includes(query);

        if (!matches) return false;
      }

      return true;
    });
  });

  // Dossier Institucional del Club del Ticket Activo (Columna 3)
  protected readonly activeClubDossier = computed(() => {
    const t = this.activeTicket();
    if (!t) return null;

    const cid = t.clubId;
    const clubObj = this.clubes().find((c) => c.id === cid);
    const clubNombre = clubObj?.nombre || t.club?.nombre || 'Club Afiliado';
    const clubSiglas = clubObj?.siglas || t.club?.siglas || this.getInitials(clubNombre);
    const logoUrl = clubObj?.logoUrl || t.club?.logoUrl || null;
    const esInvitado = clubObj?.esInvitado ?? t.club?.esInvitado ?? false;

    const clubJugadores = this.jugadores().filter(
      (j) => j.clubId === cid || (j.club?.nombre && j.club.nombre.toLowerCase() === clubNombre.toLowerCase())
    );
    const totalAtletas = clubJugadores.length;
    const habilitados = clubJugadores.filter(
      (j) => j.estado === 'Habilitado' || j.estado === 'Aprobado'
    ).length;
    const pendientes = clubJugadores.filter((j) => j.estado === 'Pendiente').length;
    const observados = clubJugadores.filter(
      (j) => j.estado === 'Observado' || j.estado === 'Rechazado'
    ).length;

    const clubSanciones = this.sanciones().filter((s) => {
      if (s.clubId && s.clubId === cid) return true;
      const inst = (s.institucion || '').toLowerCase();
      return inst.includes(clubNombre.toLowerCase());
    });
    const sancionesActivas = clubSanciones.filter(
      (s) => s.totales === 0 || (s.cumplidas ?? 0) < (s.totales ?? 1)
    ).length;

    const otrosTickets = this.tickets()
      .filter((other) => other.clubId === cid && other.id !== t.id)
      .slice(0, 4);

    return {
      id: cid,
      nombre: clubNombre,
      siglas: clubSiglas,
      logoUrl,
      esInvitado,
      totalAtletas,
      habilitados,
      pendientes,
      observados,
      sancionesActivas,
      otrosTickets,
    };
  });

  ngOnInit(): void {
    this.cargarConsola();
  }

  cargarConsola(preserveActiveId?: string): void {
    this.loading.set(true);

    forkJoin({
      tickets: this.ticketsService.getTickets().pipe(catchError(() => of([] as TicketItem[]))),
      clubes: this.clubesService.getClubes().pipe(catchError(() => of([] as Club[]))),
      jugadores: this.jugadoresService.getJugadores().pipe(catchError(() => of([] as Jugador[]))),
      sanciones: this.sancionesService.getSanciones().pipe(catchError(() => of([] as SancionDisciplinaria[]))),
    }).subscribe({
      next: ({ tickets, clubes, jugadores, sanciones }) => {
        this.tickets.set(tickets || []);
        this.clubes.set((clubes || []).filter((c) => !c.esInvitado));
        this.jugadores.set(jugadores || []);
        this.sanciones.set(sanciones || []);
        this.loading.set(false);

        const targetId = preserveActiveId || this.activeTicket()?.id;
        if (targetId) {
          const found = (tickets || []).find((t) => t.id === targetId);
          if (found) {
            this.seleccionarTicket(found);
            return;
          }
        }

        if (tickets && tickets.length > 0) {
          this.seleccionarTicket(tickets[0]);
        } else {
          this.activeTicket.set(null);
          this.messages.set([]);
        }
      },
      error: () => {
        this.loading.set(false);
        this.mostrarToast('Error al sincronizar la consola de soporte.', 'error');
      },
    });
  }

  seleccionarTicket(ticket: TicketItem): void {
    this.activeTicket.set(ticket);
    this.showStatusMenu.set(false);
    this.showTemplatesMenu.set(false);
    this.loadingMessages.set(true);

    this.ticketsService
      .getMessages(ticket.id)
      .pipe(catchError(() => of([] as TicketMessage[])))
      .subscribe({
        next: (msgs) => {
          this.messages.set(msgs || []);
          this.loadingMessages.set(false);
        },
        error: () => {
          this.loadingMessages.set(false);
          this.mostrarToast('No se pudieron cargar los mensajes del expediente.', 'error');
        },
      });
  }

  cambiarModoComposer(mode: 'official' | 'internal'): void {
    this.composerMode.set(mode);
  }

  aplicarPlantilla(plantilla: PlantillaRespuesta): void {
    const current = this.replyText().trim();
    this.replyText.set(current ? `${current}\n\n${plantilla.texto}` : plantilla.texto);
    this.composerMode.set('official');
    this.showTemplatesMenu.set(false);
    this.mostrarToast(`Plantilla "${plantilla.titulo}" insertada.`, 'info');
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files).slice(0, 5);
      this.selectedFiles.update((prev) => [...prev, ...files].slice(0, 5));
      input.value = '';
    }
  }

  removeSelectedFile(index: number): void {
    this.selectedFiles.update((prev) => prev.filter((_, i) => i !== index));
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.enviarMensaje(false);
    }
  }

  enviarMensaje(marcarResuelto = false): void {
    const t = this.activeTicket();
    const txt = this.replyText().trim();
    if (!t || (!txt && this.selectedFiles().length === 0)) return;

    this.isSending.set(true);
    const isInternal = this.composerMode() === 'internal';

    const formData = new FormData();
    formData.append('message', txt || 'Documento oficial adjunto.');
    formData.append('senderRole', 'ADMIN');
    formData.append(
      'senderName',
      isInternal
        ? `${this.currentUserName()} (Auditoría Interna)`
        : `${this.currentUserName()} • Mesa Oficial FJH`
    );
    formData.append('isInternal', String(isInternal));

    this.selectedFiles().forEach((file) => {
      formData.append('attachments', file);
    });

    this.ticketsService.enviarRespuesta(t.id, formData).subscribe({
      next: (nuevoMsg) => {
        this.messages.update((prev) => [...prev, nuevoMsg]);
        this.replyText.set('');
        this.selectedFiles.set([]);
        this.isSending.set(false);

        // Actualizar preview en la lista de tickets
        this.tickets.update((list) =>
          list.map((item) =>
            item.id === t.id
              ? {
                  ...item,
                  messages: [nuevoMsg],
                  _count: { messages: (item._count?.messages || 0) + 1 },
                }
              : item
          )
        );

        if (marcarResuelto && !isInternal) {
          this.cambiarEstadoTicket('Resuelto');
        } else {
          this.mostrarToast(
            isInternal
              ? 'Nota interna guardada en el legajo confidencial.'
              : 'Respuesta oficial enviada al club.',
            'success'
          );
        }
      },
      error: () => {
        this.isSending.set(false);
        this.mostrarToast('Error al enviar la comunicación.', 'error');
      },
    });
  }

  cambiarEstadoTicket(nuevoEstado: 'Abierto' | 'En Espera' | 'Resuelto' | 'Cerrado'): void {
    const t = this.activeTicket();
    if (!t) return;

    this.showStatusMenu.set(false);
    this.ticketsService.actualizarEstado(t.id, nuevoEstado).subscribe({
      next: () => {
        const updated: TicketItem = { ...t, status: nuevoEstado };
        this.activeTicket.set(updated);
        this.tickets.update((list) => list.map((item) => (item.id === t.id ? updated : item)));
        this.sidebarState.reload();
        this.mostrarToast(`Estado del expediente actualizado a "${nuevoEstado}".`, 'success');
      },
      error: () => {
        this.mostrarToast('No se pudo actualizar el estado del expediente.', 'error');
      },
    });
  }

  // --- MODAL: NUEVO EXPEDIENTE / COMUNICADO HACIA UN CLUB ---

  abrirModalNuevoTicket(preselectedClubId?: string): void {
    this.newTicketClubId.set(preselectedClubId || (this.clubes()[0]?.id ?? ''));
    this.newTicketCategoria.set('Fichajes y Reglamentos');
    this.newTicketAsunto.set('');
    this.newTicketDescripcion.set('');
    this.newTicketFiles.set([]);
    this.showNewTicketModal.set(true);
  }

  cerrarModalNuevoTicket(): void {
    this.showNewTicketModal.set(false);
  }

  onNewTicketFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.newTicketFiles.set(Array.from(input.files).slice(0, 5));
      input.value = '';
    }
  }

  crearNuevoExpedienteAdmin(): void {
    const cid = this.newTicketClubId();
    const asunto = this.newTicketAsunto().trim();
    const desc = this.newTicketDescripcion().trim();

    if (!cid || !asunto || !desc) {
      this.mostrarToast('Complete el club destinatario, asunto y mensaje inicial.', 'error');
      return;
    }

    this.isCreatingTicket.set(true);
    const formData = new FormData();
    formData.append('clubId', cid);
    formData.append('categoria', this.newTicketCategoria());
    formData.append('asunto', asunto);
    formData.append('descripcion', desc);
    formData.append('senderRole', 'ADMIN');
    formData.append('senderName', `${this.currentUserName()} • Mesa Oficial FJH`);
    formData.append('status', 'En Espera');

    this.newTicketFiles().forEach((f) => {
      formData.append('attachments', f);
    });

    this.ticketsService.crearTicket(formData).subscribe({
      next: (creado) => {
        this.isCreatingTicket.set(false);
        this.showNewTicketModal.set(false);
        this.tickets.update((prev) => [creado, ...prev]);
        this.seleccionarTicket(creado);
        this.sidebarState.reload();
        this.mostrarToast('Expediente oficial iniciado y remitido al club.', 'success');
      },
      error: () => {
        this.isCreatingTicket.set(false);
        this.mostrarToast('No se pudo crear el expediente.', 'error');
      },
    });
  }

  // --- ELIMINAR EXPEDIENTE ---

  confirmarEliminarTicket(ticket: TicketItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.ticketToDelete.set(ticket);
  }

  cancelarEliminarTicket(): void {
    this.ticketToDelete.set(null);
  }

  ejecutarEliminarTicket(): void {
    const target = this.ticketToDelete();
    if (!target) return;

    this.isDeleting.set(true);
    this.ticketsService.eliminarTicket(target.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.ticketToDelete.set(null);
        const remaining = this.tickets().filter((t) => t.id !== target.id);
        this.tickets.set(remaining);
        if (this.activeTicket()?.id === target.id) {
          if (remaining.length > 0) {
            this.seleccionarTicket(remaining[0]);
          } else {
            this.activeTicket.set(null);
            this.messages.set([]);
          }
        }
        this.sidebarState.reload();
        this.mostrarToast('Expediente eliminado del registro.', 'info');
      },
      error: () => {
        this.isDeleting.set(false);
        this.mostrarToast('No se pudo eliminar el expediente.', 'error');
      },
    });
  }

  // --- NAVEGACIÓN CONTEXTUAL ---

  irAPadronClub(clubId: string): void {
    this.router.navigate(['/admin/jugadores'], { queryParams: { clubId } });
  }

  irATribunalResoluciones(): void {
    this.router.navigate(['/admin/boletin-resoluciones']);
  }

  // --- UTILIDADES DE FORMATO Y AVATAR ---

  getClubName(ticket: TicketItem): string {
    if (ticket.club?.nombre) return ticket.club.nombre;
    const found = this.clubes().find((c) => c.id === ticket.clubId);
    return found?.nombre || 'Club Afiliado';
  }

  getClubSiglas(ticket: TicketItem): string {
    if (ticket.club?.siglas) return ticket.club.siglas;
    const found = this.clubes().find((c) => c.id === ticket.clubId);
    if (found?.siglas) return found.siglas;
    return this.getInitials(this.getClubName(ticket));
  }

  getClubLogo(ticket: TicketItem): string | null {
    const raw =
      ticket.club?.logoUrl || this.clubes().find((c) => c.id === ticket.clubId)?.logoUrl || null;
    if (!raw || this.logoErrors().has(ticket.clubId)) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `${environment.serverUrl}${raw}`;
  }

  getDossierLogoUrl(logoUrl: string | null | undefined, clubId: string): string | null {
    if (!logoUrl || this.logoErrors().has(clubId)) return null;
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) return logoUrl;
    return `${environment.serverUrl}${logoUrl}`;
  }

  onLogoError(clubId: string): void {
    this.logoErrors.update((prev) => {
      const next = new Set(prev);
      next.add(clubId);
      return next;
    });
  }

  getInitials(name?: string): string {
    if (!name) return 'CL';
    const parts = name
      .replace(/club|atlético|deportivo|handball/gi, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name.trim().slice(0, 3) || 'CL').toUpperCase();
  }

  getAttachmentUrl(url: string): string {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.serverUrl}${url}`;
  }

  formatRelativeTime(dateStr?: string): string {
    if (!dateStr) return 'Reciente';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Reciente';

    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays}d`;

    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${date.getDate()} ${meses[date.getMonth()]}`;
  }

  formatMessageTime(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${date.getDate()} ${meses[date.getMonth()]} • ${hh}:${mm} hs`;
  }

  getCategoryIcon(categoria?: string): string {
    const c = (categoria || '').toLowerCase();
    if (c.includes('ficha') || c.includes('médic') || c.includes('atleta')) return 'badge';
    if (c.includes('tesor') || c.includes('arancel') || c.includes('pago')) return 'payments';
    if (c.includes('compet') || c.includes('fixture') || c.includes('torneo')) return 'calendar_month';
    if (c.includes('tribunal') || c.includes('sanci') || c.includes('disciplin')) return 'gavel';
    return 'forum';
  }

  limpiarFiltros(): void {
    this.searchQuery.set('');
    this.statusFilter.set('todos');
    this.categoryFilter.set('ALL');
  }

  private mostrarToast(msg: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set(msg);
    this.toastType.set(type);
    setTimeout(() => {
      if (this.toastMessage() === msg) {
        this.toastMessage.set(null);
      }
    }, 4200);
  }
}
