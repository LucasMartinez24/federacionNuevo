import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { environment } from '../../../../../../environments/environment';
import { ClubesService } from '../../../../../core/services/clubes.service';

@Component({
  selector: 'app-club-crear',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './club-crear.component.html',
  styleUrl: './club-crear.component.css',
})
export class ClubCrearComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly clubesService = inject(ClubesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal<boolean>(false);
  protected readonly showPassword = signal<boolean>(false);
  protected readonly isEditMode = signal<boolean>(false);
  protected readonly clubId = signal<string | null>(null);

  protected readonly logoFile = signal<File | null>(null);
  protected readonly logoPreview = signal<string | null>(null);

  // Mensaje toast de feedback
  protected readonly feedbackMensaje = signal<string | null>(null);
  protected readonly feedbackTipo = signal<'success' | 'error'>('success');

  // Formulario reactivo con los atributos exactos de model Club
  protected readonly clubForm: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    siglas: ['', [Validators.required, Validators.maxLength(5), Validators.pattern('^[a-zA-Z0-9]+$')]],
    esInvitado: [false, [Validators.required]],
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  // Siglas computadas para vista previa en marcador oficial
  protected readonly siglasPreview = computed(() => {
    const val = this.clubForm.get('siglas')?.value;
    return val ? val.toString().toUpperCase() : 'FJH';
  });

  protected readonly esInvitado = computed(() => {
    return this.clubForm.get('esInvitado')?.value === true;
  });

  ngOnInit(): void {
    const id =
      this.route.snapshot.paramMap.get('id') ||
      this.route.snapshot.parent?.paramMap.get('id') ||
      this.route.snapshot.queryParamMap.get('id');
    const edit = this.route.snapshot.queryParamMap.get('edit');

    if (id && (edit === 'true' || this.route.snapshot.url.some((u) => u.path === 'editar') || this.router.url.includes('/editar'))) {
      this.isEditMode.set(true);
      this.clubId.set(id);
      this.cargarDatosEdicion(id);
    }

    // Si es equipo invitado, las credenciales son opcionales
    this.clubForm.get('esInvitado')?.valueChanges.subscribe((esInvitado: boolean) => {
      const userControl = this.clubForm.get('username');
      const passControl = this.clubForm.get('password');

      if (esInvitado) {
        userControl?.clearValidators();
        passControl?.clearValidators();
      } else {
        userControl?.setValidators([Validators.required, Validators.minLength(3)]);
        if (!this.isEditMode()) {
          passControl?.setValidators([Validators.required, Validators.minLength(6)]);
        }
      }
      userControl?.updateValueAndValidity();
      passControl?.updateValueAndValidity();
    });
  }

  private cargarDatosEdicion(id: string): void {
    this.loading.set(true);
    // En modo edición la contraseña es opcional
    this.clubForm.get('password')?.clearValidators();
    this.clubForm.get('password')?.updateValueAndValidity();

    this.clubesService.getClubById(id).subscribe({
      next: (club) => {
        this.loading.set(false);
        if (club) {
          this.aplicarDatosClub(club);
        }
      },
      error: () => {
        // Fallback: Si getClubById falla por algún motivo, buscar en la lista general de clubes
        this.clubesService.getClubes().subscribe({
          next: (clubes) => {
            this.loading.set(false);
            const encontrado = clubes.find((c) => c.id === id);
            if (encontrado) {
              this.aplicarDatosClub(encontrado);
            } else {
              this.mostrarToast('No se encontró el club especificado.', 'error');
            }
          },
          error: () => {
            this.loading.set(false);
            this.mostrarToast('Error al cargar la información del club para edición.', 'error');
          },
        });
      },
    });
  }

  private aplicarDatosClub(club: any): void {
    this.clubForm.patchValue({
      nombre: club.nombre || '',
      siglas: club.siglas || '',
      esInvitado: club.esInvitado === true || club.esInvitado === 'true',
      username: club.username || '',
    });

    if (club.logoUrl) {
      this.logoPreview.set(
        club.logoUrl.startsWith('http')
          ? club.logoUrl
          : `${environment.apiUrl.replace('/api', '')}${club.logoUrl}`
      );
    }
  }

  protected setEsInvitado(valor: boolean): void {
    this.clubForm.get('esInvitado')?.setValue(valor);
  }

  protected togglePassword(): void {
    this.showPassword.update((val) => !val);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.logoFile.set(file);

      const reader = new FileReader();
      reader.onload = () => {
        this.logoPreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  protected onSubmit(): void {
    if (this.clubForm.invalid) {
      this.clubForm.markAllAsTouched();
      this.mostrarToast('Por favor, complete los campos obligatorios.', 'error');
      return;
    }

    this.loading.set(true);
    const formVal = this.clubForm.value;
    const formData = new FormData();

    // Atributos exactos del modelo Club en la base de datos
    formData.append('nombre', formVal.nombre.trim());
    formData.append('siglas', formVal.siglas.trim().toUpperCase());
    formData.append('esInvitado', formVal.esInvitado ? 'true' : 'false');

    if (formVal.username && formVal.username.trim() !== '') {
      formData.append('username', formVal.username.trim());
    }

    if (formVal.password && formVal.password.trim() !== '') {
      formData.append('password', formVal.password.trim());
    }

    if (this.logoFile()) {
      formData.append('logo', this.logoFile() as File);
    }

    const request$ = this.isEditMode() && this.clubId()
      ? this.clubesService.updateClub(this.clubId()!, formData)
      : this.clubesService.createClub(formData);

    request$.subscribe({
      next: (clubGuardado) => {
        this.loading.set(false);
        const accion = this.isEditMode() ? 'actualizado' : 'registrado';
        this.mostrarToast(`Club ${clubGuardado.nombre} ${accion} correctamente.`, 'success');

        setTimeout(() => {
          this.router.navigate(['/admin/jugadores']);
        }, 1200);
      },
      error: (err) => {
        this.loading.set(false);
        const mensajeError = err?.error?.message || 'Error al guardar la institución en el servidor.';
        this.mostrarToast(mensajeError, 'error');
      },
    });
  }

  protected mostrarToast(mensaje: string, tipo: 'success' | 'error'): void {
    this.feedbackMensaje.set(mensaje);
    this.feedbackTipo.set(tipo);
    setTimeout(() => {
      this.feedbackMensaje.set(null);
    }, 4500);
  }
}
