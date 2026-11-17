import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface FotoGaleria {
  id: string;
  url: string;
  titulo?: string | null;
  categoria?: string | null;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class GaleriaService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/galeria`;

  getFotos(): Observable<FotoGaleria[]> {
    return this.http.get<FotoGaleria[]>(this.apiUrl);
  }

  subirFotos(formData: FormData): Observable<{ message: string; cantidad: number }> {
    return this.http.post<{ message: string; cantidad: number }>(this.apiUrl, formData);
  }

  eliminarFoto(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
