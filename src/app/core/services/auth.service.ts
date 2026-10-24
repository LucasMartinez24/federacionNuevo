import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserRole } from '../navigation/navigation.types';

export interface User {
  id: string;
  username: string;
  nombre?: string;
  role: UserRole;
  siglas?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  // Signals para reactividad moderna en Angular 21
  readonly currentUser = signal<User | null>(this.loadStoredUser());
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly role = computed(() => this.currentUser()?.role ?? null);

  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');
  readonly isRepFederacion = computed(() => this.currentUser()?.role === 'REP_FEDERACION');
  readonly isOficialMesa = computed(() => this.currentUser()?.role === 'OFICIAL_MESA');
  readonly isJefeArbitros = computed(() => this.currentUser()?.role === 'JEFE_ARBITROS');
  readonly isCM = computed(() => this.currentUser()?.role === 'CM');
  readonly isClub = computed(() => this.currentUser()?.role === 'user');

  login(credentials: LoginCredentials): Observable<User> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap((res) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('currentUser', JSON.stringify(res.user));
        this.currentUser.set(res.user);
      }),
      map((res) => res.user),
      catchError((error: HttpErrorResponse) => {
        let title = 'Acceso Denegado';
        let message = 'No fue posible iniciar sesión. Verifique sus credenciales.';
        let hint = 'Si el problema persiste, contacte a la Mesa de Entradas de la FJH.';
        let field: 'username' | 'password' | 'all' = 'all';

        if (error.status === 0) {
          title = 'Servidor No Disponible';
          message = 'No se pudo establecer conexión con el servidor central de la Federación.';
          hint = 'Asegúrese de que el backend esté encendido (puerto 3000) y de tener conexión a la red.';
        } else if (error.status === 401) {
          const serverError = error.error?.error || '';
          if (
            serverError.toLowerCase().includes('usuario no existe') ||
            serverError.toLowerCase().includes('no existe')
          ) {
            title = 'Usuario No Registrado';
            message =
              'El usuario o DNI ingresado no se encuentra en el padrón de clubes ni del personal de la Federación.';
            hint = 'Verifique si ingresó correctamente las siglas del club o su número de DNI.';
            field = 'username';
          } else if (
            serverError.toLowerCase().includes('contraseña incorrecta') ||
            serverError.toLowerCase().includes('password')
          ) {
            title = 'Contraseña Incorrecta';
            message = 'La contraseña ingresada no coincide con la registrada para este usuario.';
            hint = 'Verifique mayúsculas/minúsculas o utilice el enlace de recuperación si la olvidó.';
            field = 'password';
          } else {
            title = 'Credenciales Inválidas';
            message = serverError || 'Identificador o clave no autorizados.';
          }
        } else if (error.status === 403) {
          title = 'Acceso Restringido';
          message = 'Su cuenta institucional se encuentra inhabilitada o suspendida temporalmente.';
          hint = 'Comuníquese con las autoridades de la FJH para regularizar su estado federativo.';
        } else if (error.status >= 500) {
          title = 'Error del Servidor';
          message = 'Ocurrió un inconveniente interno en el servidor federativo al validar los datos.';
          hint = 'Por favor intente nuevamente en unos instantes o informe al administrador del sistema.';
        } else if (error.error?.error) {
          message = error.error.error;
        }

        const customError: any = new Error(message);
        customError.title = title;
        customError.hint = hint;
        customError.field = field;
        customError.status = error.status;

        return throwError(() => customError);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getCurrentUser(): User | null {
    return this.currentUser();
  }

  private loadStoredUser(): User | null {
    try {
      const stored = localStorage.getItem('currentUser');
      const token = localStorage.getItem('token');
      if (stored && token) {
        return JSON.parse(stored) as User;
      }
    } catch {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('token');
    }
    return null;
  }
}
