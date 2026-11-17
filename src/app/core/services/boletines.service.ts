import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type BoletinCategoria = 'tribunal' | 'reglamento' | 'tesoreria';

export interface BoletinArancel {
  concepto: string;
  monto: string;
  moneda: string;
  detalle: string;
  destacado?: boolean;
}

export interface BoletinAdjunto {
  nombre: string;
  tamano: string;
  subtitulo: string;
  url: string;
}

export interface BoletinOficial {
  id: string;
  numero: string;
  expediente: string;
  titulo: string;
  categoria: BoletinCategoria;
  organo: string;
  suborgano: string;
  fecha: string;
  anio: string;
  urgente: boolean;
  estado: 'vigente' | 'archivado';
  clubAfectado?: string;
  visto?: string | null;
  considerando?: string | null;
  resuelve?: string[];
  resumen?: string | null;
  alertaTitulo?: string | null;
  alertaTexto?: string | null;
  alertaTipo?: 'amber' | 'primary' | 'tertiary' | 'crimson';
  aranceles?: BoletinArancel[];
  adjuntos?: BoletinAdjunto[];
  selloTitulo: string;
  selloAutoridad: string;
  selloIcono: string;
  selloColor: 'tertiary' | 'amber' | 'primary';
  createdAt?: string;
  // Vinculación opcional con sanción disciplinaria de base de datos
  sancionId?: string;
  sancionado?: string;
  cumplidas?: number;
  totales?: number;
  guardado?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BoletinesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/boletines`;

  getBoletines(): Observable<BoletinOficial[]> {
    return this.http.get<BoletinOficial[]>(this.apiUrl);
  }

  crearBoletin(payload: FormData | Partial<BoletinOficial>): Observable<BoletinOficial> {
    return this.http.post<BoletinOficial>(this.apiUrl, payload);
  }

  actualizarBoletin(id: string, data: Partial<BoletinOficial>): Observable<BoletinOficial> {
    return this.http.patch<BoletinOficial>(`${this.apiUrl}/${id}`, data);
  }

  eliminarBoletin(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
