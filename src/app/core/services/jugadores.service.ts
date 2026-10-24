import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Club } from './clubes.service';

export interface Jugador {
  id: string;
  dni: string;
  nombreCompleto: string;
  fechaNacimiento: string;
  genero?: string | null;
  nacionalidad?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  tutorPhone?: string | null;
  peso?: number | null;
  altura?: number | null;
  categoria?: string | null;
  categoriaEspecial?: string | null;
  equipo?: string | null;
  manoHabil?: string | null;
  estado: string; // 'Pendiente' | 'Aprobado' | 'Habilitado' | 'Observado' | 'Rechazado'
  fichaMedicaUrl?: string | null;
  autorizacionUrl?: string | null;
  fichaJugadorUrl?: string | null;
  clubId: string;
  club?: Club;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class JugadoresService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/jugadores`;

  getJugadores(clubId?: string): Observable<Jugador[]> {
    const url = clubId ? `${this.apiUrl}?clubId=${clubId}` : this.apiUrl;
    return this.http.get<Jugador[]>(url);
  }

  getJugadorById(id: string): Observable<Jugador> {
    return this.http.get<Jugador>(`${this.apiUrl}/${id}`);
  }

  cambiarEstado(id: string, estado: string): Observable<Jugador> {
    return this.http.patch<Jugador>(`${this.apiUrl}/${id}/estado`, { estado });
  }

  crearJugador(formData: FormData): Observable<Jugador> {
    return this.http.post<Jugador>(this.apiUrl, formData);
  }

  actualizarJugador(id: string, formData: FormData): Observable<Jugador> {
    return this.http.put<Jugador>(`${this.apiUrl}/${id}`, formData);
  }

  eliminarJugador(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  getFileUrl(relativePath?: string | null): string {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }
    return `${environment.serverUrl}${relativePath}`;
  }
}
