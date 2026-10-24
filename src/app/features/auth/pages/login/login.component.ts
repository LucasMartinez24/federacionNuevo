import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

export interface LoginError {
  title: string;
  message: string;
  hint?: string;
  field?: 'username' | 'password' | 'all';
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly savedUsername =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('fjh_saved_username') || ''
      : '';

  protected readonly username = signal(this.savedUsername);
  protected readonly password = signal('');
  protected readonly rememberMe = signal(!!this.savedUsername || true);
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<LoginError | null>(null);

  protected togglePassword(): void {
    this.showPassword.update((val) => !val);
  }

  protected onUsernameChange(val: string): void {
    this.username.set(val);
    if (this.error()?.field === 'username' || this.error()?.field === 'all') {
      this.clearError();
    }
  }

  protected onPasswordChange(val: string): void {
    this.password.set(val);
    if (this.error()?.field === 'password' || this.error()?.field === 'all') {
      this.clearError();
    }
  }

  protected clearError(): void {
    this.error.set(null);
  }

  protected onSubmit(): void {
    const userVal = this.username().trim();
    const passVal = this.password();

    // Validaciones detalladas de entrada
    if (!userVal && !passVal) {
      this.error.set({
        title: 'Campos Requeridos',
        message: 'Debe ingresar su usuario institucional o DNI y su contraseña reglamentaria.',
        hint: 'Ambos campos son obligatorios para ingresar al sistema oficial.',
        field: 'all',
      });
      return;
    }

    if (!userVal) {
      this.error.set({
        title: 'Usuario Faltante',
        message: 'Debe ingresar el identificador de su club o DNI del personal federativo.',
        hint: 'Por ejemplo: siglas del club (ej. MINAS, GORRITI) o DNI oficial.',
        field: 'username',
      });
      return;
    }

    if (!passVal) {
      this.error.set({
        title: 'Contraseña Faltante',
        message: 'Debe ingresar su contraseña reglamentaria para continuar.',
        hint: 'Si olvidó su contraseña, puede contactar a la Mesa de Entradas FJH.',
        field: 'password',
      });
      return;
    }

    this.loading.set(true);
    this.clearError();

    this.authService.login({ username: userVal, password: passVal }).subscribe({
      next: (user) => {
        this.loading.set(false);

        // Recordar u olvidar usuario según preferencia
        if (this.rememberMe()) {
          localStorage.setItem('fjh_saved_username', userVal);
        } else {
          localStorage.removeItem('fjh_saved_username');
        }

        const returnUrl = this.route.snapshot.queryParams['returnUrl'];
        if (returnUrl) {
          this.router.navigateByUrl(returnUrl);
          return;
        }

        // Redirección según rol
        if (user.role === 'user') {
          // Club
          this.router.navigate(['/']);
        } else {
          // Staff (Admin, Rep Federación, Oficial de Mesa, Árbitros, CM)
          this.router.navigate(['/admin/jugadores']);
        }
      },
      error: (err: any) => {
        this.loading.set(false);
        this.error.set({
          title: err.title || 'Acceso Denegado',
          message:
            err.message ||
            'Credenciales no válidas. Verifique su identificador institucional y contraseña.',
          hint: err.hint,
          field: err.field || 'all',
        });
      },
    });
  }
}
