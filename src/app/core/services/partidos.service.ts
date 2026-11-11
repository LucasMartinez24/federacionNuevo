import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PartidoItem {
  id?: string;
  torneoId?: string;
  jornada: number;
  localId: string;
  visitanteId: string;
  local?: any;
  visitante?: any;
  fecha?: string | null;
  hora?: string | null;
  lugar?: string | null;
  estado?: string;
  fase?: string;
  grupo?: string | null;
  arbitro1?: string | null;
  arbitro2?: string | null;
  cronometrista?: string | null;
  observaciones?: string | null;
  showDesignaciones?: boolean;
}

export interface JornadaItem {
  numero: number;
  nombre?: string;
  fechaDefault?: string;
  sedeDefault?: string;
  horaInicioDefault?: string;
  isExpanded?: boolean;
  partidos: PartidoItem[];
}

@Injectable({ providedIn: 'root' })
export class PartidosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Algoritmo Berger Round Robin Oficial IHF / CAH
   * Genera fixture todos contra todos con alternancia de localías
   */
  generarFixture(clubes: any[], idaVuelta: boolean = false, sedes: string[] = []): JornadaItem[] {
    let equipos = [...clubes];
    if (equipos.length < 2) return [];

    const tieneBye = equipos.length % 2 !== 0;
    if (tieneBye) {
      equipos.push({ id: '__BYE__', nombre: 'LIBRE / DESCANSA', siglas: 'LIBRE' });
    }

    const n = equipos.length;
    const numJornadas = n - 1;
    const partidosPorJornada = n / 2;
    let jornadas: JornadaItem[] = [];

    const defaultSede = sedes.length > 0 ? sedes[0] : 'Polideportivo Cuyaya';

    for (let round = 0; round < numJornadas; round++) {
      let partidos: PartidoItem[] = [];
      let currentMinute = 15 * 60; // Comienza a las 15:00 hs

      for (let i = 0; i < partidosPorJornada; i++) {
        let local = equipos[i];
        let visitante = equipos[n - 1 - i];

        // Alternancia de localía para el pivote Berger
        if (i === 0 && round % 2 === 1) {
          const temp = local;
          local = visitante;
          visitante = temp;
        }

        if (local.id !== '__BYE__' && visitante.id !== '__BYE__') {
          const hours = Math.floor(currentMinute / 60);
          const mins = currentMinute % 60;
          const horaStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} hs`;
          const sede = sedes.length > 0 ? sedes[i % sedes.length] : defaultSede;

          partidos.push({
            jornada: round + 1,
            localId: local.id,
            visitanteId: visitante.id,
            local,
            visitante,
            fecha: null,
            hora: horaStr,
            lugar: sede,
            estado: 'Programado',
            fase: 'Fase Regular',
            arbitro1: '',
            arbitro2: '',
            cronometrista: '',
            observaciones: '',
            showDesignaciones: false,
          });

          currentMinute += 75; // Intervalo oficial de 75 min
        }
      }

      jornadas.push({
        numero: round + 1,
        nombre: `Jornada ${round + 1}${round === 0 ? ' • Fecha Inaugural' : round === numJornadas - 1 ? ' • Cierre 1ra Rueda' : ''}`,
        sedeDefault: defaultSede,
        isExpanded: round < 2, // Primeras 2 abiertas por defecto
        partidos,
      });

      // Rotación estándar Berger: fijar el primer elemento y rotar el resto
      equipos.splice(1, 0, equipos.pop()!);
    }

    if (idaVuelta) {
      const vueltas: JornadaItem[] = jornadas.map((j) => ({
        numero: j.numero + numJornadas,
        nombre: `Jornada ${j.numero + numJornadas} • Revancha (Fecha ${j.numero})`,
        sedeDefault: j.sedeDefault,
        fechaDefault: j.fechaDefault,
        isExpanded: false,
        partidos: j.partidos.map((p) => ({
          jornada: j.numero + numJornadas,
          localId: p.visitanteId,
          visitanteId: p.localId,
          local: p.visitante,
          visitante: p.local,
          fecha: p.fecha,
          hora: p.hora,
          lugar: p.lugar,
          estado: 'Programado',
          fase: 'Fase Regular (Vuelta)',
          arbitro1: '',
          arbitro2: '',
          cronometrista: '',
          observaciones: '',
          showDesignaciones: false,
        })),
      }));
      jornadas = [...jornadas, ...vueltas];
    }

    return jornadas;
  }

  getJornadasDisponibles(torneoId: string): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}/partidos/torneo/${torneoId}/jornadas`);
  }

  getFixtureByTorneo(torneoId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/partidos/torneo/${torneoId}`);
  }

  getPartidosByJornada(torneoId: string, jornadaNum: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/partidos/torneo/${torneoId}/jornada/${jornadaNum}`);
  }

  getTablaPosiciones(torneoId: string, grupo?: string): Observable<any[]> {
    let url = `${this.apiUrl}/posiciones/torneo/${torneoId}`;
    if (grupo) url += `?grupo=${encodeURIComponent(grupo)}`;
    return this.http.get<any[]>(url);
  }

  updateResultado(partidoId: string, payload: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/partidos/${partidoId}/resultado`, payload);
  }

  crearPartidoPlayoff(payload: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/partidos/partido`, payload);
  }

  saveFixture(torneoId: string, jornadas: JornadaItem[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/partidos/torneo/${torneoId}/fixture`, { jornadas });
  }

  updatePartido(partidoId: string, data: Partial<PartidoItem>): Observable<any> {
    return this.http.patch(`${this.apiUrl}/partidos/${partidoId}`, data);
  }

  deletePartido(partidoId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/partidos/${partidoId}`);
  }
}

