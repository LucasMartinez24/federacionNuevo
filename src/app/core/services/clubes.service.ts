import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Club {
  id: string;
  nombre: string;
  siglas: string;
  username?: string | null;
  logoUrl?: string | null;
  esInvitado: boolean;
  jugadores?: any[];
  created_at?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ClubesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/clubes`;

  getClubes(): Observable<Club[]> {
    return this.http.get<Club[]>(`${this.apiUrl}/`);
  }

  getClubById(id: string): Observable<Club> {
    return this.http.get<Club>(`${this.apiUrl}/${id}`);
  }

  createClub(formData: FormData | any): Observable<Club> {
    return this.http.post<Club>(this.apiUrl, formData);
  }

  updateClub(id: string, formData: FormData | any): Observable<Club> {
    return this.http.put<Club>(`${this.apiUrl}/${id}`, formData);
  }

  deleteClub(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
