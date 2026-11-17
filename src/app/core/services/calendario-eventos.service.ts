import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type TipoEventoCalendario = 'institucional' | 'fichajes' | 'arbitraje' | 'torneo';

export interface EventoCalendarioFJH {
  id: string;
  titulo: string;
  fecha: string; // YYYY-MM-DD
  hora: string;
  sede: string;
  tipo: TipoEventoCalendario;
  descripcion?: string;
  destacado?: boolean;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CalendarioEventosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/calendario-eventos`;

  getEventos(): Observable<EventoCalendarioFJH[]> {
    return this.http.get<EventoCalendarioFJH[]>(this.apiUrl);
  }

  crearEvento(payload: Partial<EventoCalendarioFJH>): Observable<EventoCalendarioFJH> {
    return this.http.post<EventoCalendarioFJH>(this.apiUrl, payload);
  }

  eliminarEvento(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
