import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TicketAttachment {
  id?: string;
  name: string;
  url: string;
}

export interface TicketMessage {
  id?: string;
  text: string;
  senderRole: 'ADMIN' | 'CLUB' | string;
  senderName: string;
  isInternal?: boolean;
  ticketId: string;
  createdAt?: string;
  attachments?: TicketAttachment[];
}

export interface TicketItem {
  id: string;
  asunto: string;
  categoria: string;
  status: 'Abierto' | 'En Espera' | 'Resuelto' | 'Cerrado' | string;
  clubId: string;
  club?: {
    id?: string;
    nombre: string;
    siglas?: string;
    logoUrl?: string | null;
    esInvitado?: boolean;
  };
  createdAt: string;
  messages?: TicketMessage[];
  _count?: {
    messages: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class TicketsService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/tickets`;

  getTickets(clubId?: string): Observable<TicketItem[]> {
    let url = this.apiUrl;
    if (clubId) {
      url += `?clubId=${encodeURIComponent(clubId)}`;
    }
    return this.http.get<TicketItem[]>(url);
  }

  getMessages(ticketId: string): Observable<TicketMessage[]> {
    return this.http.get<TicketMessage[]>(`${this.apiUrl}/${ticketId}/messages`);
  }

  crearTicket(formData: FormData): Observable<TicketItem> {
    return this.http.post<TicketItem>(this.apiUrl, formData);
  }

  enviarRespuesta(ticketId: string, formData: FormData): Observable<TicketMessage> {
    return this.http.post<TicketMessage>(`${this.apiUrl}/${ticketId}/reply`, formData);
  }

  actualizarEstado(ticketId: string, status: string): Observable<TicketItem> {
    return this.http.patch<TicketItem>(`${this.apiUrl}/${ticketId}/status`, { status });
  }

  eliminarTicket(ticketId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${ticketId}`);
  }
}

