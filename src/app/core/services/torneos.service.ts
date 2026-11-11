import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PosicionClub {
  id?: string;
  torneoId?: string;
  clubId: string;
  grupo?: string;
  puntos?: number;
  pj?: number;
  pg?: number;
  pe?: number;
  pp?: number;
  gf?: number;
  gc?: number;
  dg?: number;
  club?: {
    id: string;
    nombre: string;
    siglas?: string;
    logoUrl?: string | null;
  };
}

export interface Torneo {
  id: string;
  nombre: string;
  categoria: string;
  rama: string;
  formato: string; // 'liga' | 'grupos_eliminatorias' | 'eliminatoria_directa'
  idaVuelta?: boolean;
  estado: string; // 'In Progress' | 'Upcoming' | 'Finalizado' | 'Archive' | 'PAUSA'
  fechaInicio: string;
  progreso: number;
  colorClase?: string;
  createdAt?: string;
  equiposCount?: number;
  temporada?: string;
  sedes?: string | string[];
  faseInicial?: string; // 'final' | 'semifinales' | 'cuartos' | 'octavos'
  tercerPuesto?: boolean;
  modalidadLlave?: string; // 'unico' | 'ida_vuelta'
  cantidadGrupos?: number;
  criterioDesempate?: string;
  tipo?: string;
  tablaPosiciones?: PosicionClub[];
  partidos?: any[];
  _count?: {
    tablaPosiciones?: number;
    partidos?: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class TorneosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/torneos`;

  getTorneos(): Observable<Torneo[]> {
    return this.http.get<Torneo[]>(this.apiUrl);
  }

  getTorneoById(id: string): Observable<Torneo> {
    return this.http.get<Torneo>(`${this.apiUrl}/${id}`);
  }

  getTorneoEstructura(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}/estructura`);
  }

  getTorneosPorClub(clubId: string): Observable<Torneo[]> {
    return this.http.get<Torneo[]>(`${this.apiUrl}/club/${clubId}`);
  }

  crearTorneo(data: Partial<Torneo>): Observable<Torneo> {
    return this.http.post<Torneo>(this.apiUrl, data);
  }

  updateTorneo(id: string, data: Partial<Torneo>): Observable<Torneo> {
    return this.http.put<Torneo>(`${this.apiUrl}/${id}`, data);
  }

  deleteTorneo(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
