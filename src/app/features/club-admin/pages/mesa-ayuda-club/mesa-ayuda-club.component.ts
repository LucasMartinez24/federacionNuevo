import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { TicketItem, TicketMessage, TicketsService } from '../../../../core/services/tickets.service';

@Component({
  selector: 'app-mesa-ayuda-club',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './mesa-ayuda-club.component.html',
  styleUrl: './mesa-ayuda-club.component.css',
})
export class MesaAyudaClubComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly ticketsService = inject(TicketsService);
  private readonly clubesService = inject(ClubesService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly club = signal<Club | null>(null);

  // Tickets & Chat
  protected readonly tickets = signal<TicketItem[]>([]);
  protected readonly activeTicket = signal<TicketItem | null>(null);
  protected readonly messages = signal<TicketMessage[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly loadingMessages = signal<boolean>(false);

  // Composer
  protected readonly replyText = signal<string>('');
  protected readonly isSending = signal<boolean>(false);
  protected readonly selectedFiles = signal<File[]>([]);

  // Filtro de búsqueda y pestañas
  protected readonly searchTicketText = signal<string>('');
  protected readonly activeFilter = signal<'todos' | 'abiertos' | 'urgentes'>('todos');

  // Modal Nuevo Ticket
  protected readonly showNewTicketModal = signal<boolean>(false);
  protected readonly newTicketAsunto = signal<string>('');
  protected readonly newTicketCategoria = signal<string>('Fichajes y Reglamentos');
  protected readonly newTicketDescripcion = signal<string>('');
  protected readonly isCreatingTicket = signal<boolean>(false);
  protected readonly newTicketFiles = signal<File[]>([]);

  protected readonly actionMessage = signal<string | null>(null);
  protected readonly clubId = computed(() => this.currentUser()?.id || '');

  // Conteo de telemetría
  protected readonly ticketsPendientes = computed(() => {
    return this.tickets().filter((t) => t.status !== 'Resuelto' && t.status !== 'Cerrado').length;
  });

  protected readonly ticketsResueltos = computed(() => {
    return this.tickets().filter((t) => t.status === 'Resuelto' || t.status === 'Cerrado').length;
  });

  // Lista Filtrada
  protected readonly filteredTickets = computed(() => {
    const list = this.tickets();
    const query = this.searchTicketText().toLowerCase().trim();
    const f = this.activeFilter();

    return list.filter((t) => {
      // Filtro de texto
      if (query) {
        const matchAsunto = (t.asunto || '').toLowerCase().includes(query);
        const matchId = (t.id || '').toLowerCase().includes(query);
        const matchCat = (t.categoria || '').toLowerCase().includes(query);
        if (!matchAsunto && !matchId && !matchCat) return false;
      }

      // Filtro de pestaña
      if (f === 'abiertos') return t.status !== 'Resuelto' && t.status !== 'Cerrado';
      if (f === 'urgentes') return t.categoria?.toLowerCase().includes('urgente') || t.asunto?.toLowerCase().includes('urgente');

      return true;
    });
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

    this.ticketsService
      .getTickets(cid || undefined)
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (res) => {
          this.tickets.set(res || []);
          if (res && res.length > 0 && !this.activeTicket()) {
            this.seleccionarTicket(res[0]);
          }
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  seleccionarTicket(ticket: TicketItem): void {
    this.activeTicket.set(ticket);
    this.loadingMessages.set(true);

    this.ticketsService
      .getMessages(ticket.id)
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (msgs) => {
          this.messages.set((msgs || []).filter((m) => !m.isInternal));
          this.loadingMessages.set(false);
        },
        error: () => this.loadingMessages.set(false),
      });
  }

  setFilter(filter: 'todos' | 'abiertos' | 'urgentes'): void {
    this.activeFilter.set(filter);
  }

  onFilesSelected(event: any): void {
    const files: FileList = event.target.files;
    if (files) {
      const arr = Array.from(files).slice(0, 3);
      this.selectedFiles.set(arr);
    }
  }

  removeSelectedFile(idx: number): void {
    this.selectedFiles.update((list) => list.filter((_, i) => i !== idx));
  }

  enviarRespuesta(): void {
    const t = this.activeTicket();
    const txt = this.replyText().trim();
    if (!t || !txt) return;

    this.isSending.set(true);

    const formData = new FormData();
    formData.append('message', txt);
    formData.append('senderRole', 'CLUB');
    formData.append('senderName', this.club()?.nombre || this.currentUser()?.nombre || 'Delegado de Club');
    formData.append('isInternal', 'false');

    this.selectedFiles().forEach((f) => {
      formData.append('attachments', f);
    });

    this.ticketsService.enviarRespuesta(t.id, formData).subscribe({
      next: (nuevoMensaje) => {
        this.messages.update((list) => [...list, nuevoMensaje]);
        this.replyText.set('');
        this.selectedFiles.set([]);
        this.isSending.set(false);
        this.mostrarMensaje('Respuesta enviada a la Mesa de Entradas FJH.');
      },
      error: (err) => {
        console.error('Error al responder ticket:', err);
        this.isSending.set(false);
        this.mostrarMensaje('No se pudo enviar el mensaje.');
      },
    });
  }

  abrirModalNuevoTicket(): void {
    this.newTicketAsunto.set('');
    this.newTicketCategoria.set('Fichajes y Reglamentos');
    this.newTicketDescripcion.set('');
    this.newTicketFiles.set([]);
    this.showNewTicketModal.set(true);
  }

  cerrarModalNuevoTicket(): void {
    this.showNewTicketModal.set(false);
  }

  onNewTicketFilesSelected(event: any): void {
    const files: FileList = event.target.files;
    if (files) {
      this.newTicketFiles.set(Array.from(files).slice(0, 3));
    }
  }

  crearTicket(): void {
    const asunto = this.newTicketAsunto().trim();
    const descripcion = this.newTicketDescripcion().trim();
    const cid = this.clubId();

    if (!asunto || !descripcion || !cid) {
      this.mostrarMensaje('Complete asunto y descripción del caso.');
      return;
    }

    this.isCreatingTicket.set(true);

    const formData = new FormData();
    formData.append('asunto', asunto);
    formData.append('categoria', this.newTicketCategoria());
    formData.append('descripcion', descripcion);
    formData.append('clubId', cid);

    this.newTicketFiles().forEach((f) => {
      formData.append('attachments', f);
    });

    this.ticketsService.crearTicket(formData).subscribe({
      next: (nuevoTicket) => {
        this.tickets.update((list) => [nuevoTicket, ...list]);
        this.seleccionarTicket(nuevoTicket);
        this.isCreatingTicket.set(false);
        this.cerrarModalNuevoTicket();
        this.mostrarMensaje('Expediente / Solicitud ingresada con éxito.');
      },
      error: (err) => {
        console.error('Error al crear ticket:', err);
        this.isCreatingTicket.set(false);
        this.mostrarMensaje('Error al crear la solicitud en Mesa de Entradas.');
      },
    });
  }

  getAttachmentUrl(url: string): string {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${environment.serverUrl}${url}`;
  }

  mostrarMensaje(msg: string): void {
    this.actionMessage.set(msg);
    setTimeout(() => {
      if (this.actionMessage() === msg) this.actionMessage.set(null);
    }, 4000);
  }
}
