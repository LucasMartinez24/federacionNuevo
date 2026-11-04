import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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
  motivo?: string | null;
  jugadorId?: string | null;
  clubId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SancionesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/sanciones`;

  getSanciones(): Observable<SancionDisciplinaria[]> {
    return this.http.get<SancionDisciplinaria[]>(this.apiUrl);
  }

  crearSancion(data: Partial<SancionDisciplinaria> & { inhabilitarJugador?: boolean }): Observable<SancionDisciplinaria> {
    return this.http.post<SancionDisciplinaria>(this.apiUrl, data);
  }

  actualizarSancion(id: string, data: Partial<SancionDisciplinaria>): Observable<SancionDisciplinaria> {
    return this.http.patch<SancionDisciplinaria>(`${this.apiUrl}/${id}`, data);
  }

  eliminarSancion(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}

