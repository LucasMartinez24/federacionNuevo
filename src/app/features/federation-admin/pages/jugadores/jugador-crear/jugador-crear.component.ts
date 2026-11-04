import { Component, inject, OnInit, ChangeDetectorRef, HostListener, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { Club, ClubesService } from '../../../../../core/services/clubes.service';
import { Jugador, JugadoresService } from '../../../../../core/services/jugadores.service';
import { AuthService } from '../../../../../core/services/auth.service';

@Component({
  selector: 'app-jugador-crear',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './jugador-crear.component.html',
  styleUrl: './jugador-crear.component.css',
})
export class JugadorCrearComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly jugadoresService = inject(JugadoresService);
  private readonly clubesService = inject(ClubesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sub = new Subscription();

  windowWidth = window.innerWidth;
  @HostListener('window:resize') onResize() {
    this.windowWidth = window.innerWidth;
  }

  isEditMode = false;
  jugadorId: string | null = null;
  errorMessage = '';
  isAdmin = true;
  saving = false;
  loading = false;
  intentoGuardar = false;

  // Opción para registrar con documentación física a digitalizar luego
  documentacionDiferida = false;

  // Estructura de datos del jugador idéntica a la original
  jugadorData: any = {
    dni: '',
    apellidos: '',
    nombres: '',
    genero: 'Masculino',
    nacionalidad: 'Argentina',
    email: '',
    whatsapp: '',
    tutorPhone: '',
    peso: null,
    altura: null,
    equipo: 'A',
    estado: 'Pendiente',
    clubId: '',
    categoriaEspecial: null,
  };

  birthDate = '';
  selectedCategory = 'Primera';
  isMinor = false;
  mostrarSelectorEspecial = false;
  opcionesCategoriaEspecial: string[] = ['Primera', '+35'];
  selectedHand = 'Derecha';
  clubNombre = 'Seleccione un Club';

  // Gestión de Movimientos Federativos (Préstamos y Pases)
  modoMovimiento: 'PRESTAMO' | 'PASE' = 'PRESTAMO';
  clubesDisponibles: Club[] = [];
  movimientosJugador: any[] = [];
  movimientoActivo: any = null;
  clubDestinoId = '';
  mesesPrestamo = 1;
  observacionesMovimiento = '';
  cargandoMovimientos = false;

  // Bóveda de Documentación
  fileNames = { fichaMedica: '', autorizacionPadres: '', fichaJugador: '' };
  files = {
    fichaMedica: null as File | null,
    autorizacionPadres: null as File | null,
    fichaJugador: null as File | null,
  };
  existingUrls = {
    fichaMedica: '' as string | null,
    autorizacionPadres: '' as string | null,
    fichaJugador: '' as string | null,
  };

  // Toast Feedback
  feedbackMensaje: string | null = null;
  feedbackTipo: 'success' | 'error' = 'success';

  ngOnInit() {
    this.isAdmin = this.auth.isAdmin ? this.auth.isAdmin() : true;

    this.jugadorId =
      this.route.snapshot.paramMap.get('id') ||
      this.route.snapshot.parent?.paramMap.get('id') ||
      this.route.snapshot.queryParamMap.get('id');

    const isEditUrl =
      this.route.snapshot.url.some((u) => u.path === 'editar') ||
      this.router.url.includes('/editar');

    if (this.jugadorId && isEditUrl) {
      this.isEditMode = true;
      this.cargarDatosJugador(this.jugadorId);
    }

    this.sub.add(
      this.route.queryParams.subscribe((params) => {
        if (params['clubId'] && !this.jugadorData.clubId) {
          this.jugadorData.clubId = params['clubId'];
          this.buscarNombreClub(params['clubId']);
        }
        if (params['operation'] === 'PASE' || params['operation'] === 'pase') {
          this.modoMovimiento = 'PASE';
        }
        if (params['operation'] === 'PRESTAMO' || params['operation'] === 'prestamo') {
          this.modoMovimiento = 'PRESTAMO';
        }
        this.cdr.detectChanges();
      }),
    );

    this.sub.add(
      this.clubesService.getClubes().subscribe({
        next: (clubes) => {
          this.clubesDisponibles = clubes || [];
          if (this.jugadorData.clubId) {
            this.buscarNombreClub(this.jugadorData.clubId);
          }
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error al cargar clubes:', err),
      }),
    );
  }

  // Clubes agrupados para selector del admin
  get clubesAfiliados(): Club[] {
    return this.clubesDisponibles.filter((c) => !c.esInvitado);
  }

  get clubesInvitados(): Club[] {
    return this.clubesDisponibles.filter((c) => c.esInvitado);
  }

  get selectedClub(): Club | null {
    if (!this.jugadorData.clubId) return null;
    return this.clubesDisponibles.find((c) => c.id === this.jugadorData.clubId) || null;
  }

  get clubesDestinoDisponibles(): Club[] {
    return this.clubesDisponibles.filter((c) => c.id !== this.jugadorData.clubId);
  }

  get etiquetaMovimiento(): string {
    return this.modoMovimiento === 'PASE' ? 'Registrar pase definitivo' : 'Registrar préstamo interclub';
  }

  get edadCalculada(): number | null {
    if (!this.birthDate) return null;
    const nacimiento = new Date(this.birthDate);
    if (isNaN(nacimiento.getTime())) return null;
    const birthYear = nacimiento.getFullYear();
    const age = 2026 - birthYear;
    return age >= 0 ? age : null;
  }

  get esMayorDe35(): boolean {
    const edad = this.edadCalculada;
    return edad !== null && edad >= 35;
  }

  get imcCalculado(): string | null {
    const alturaCm = this.jugadorData.altura;
    const pesoKg = this.jugadorData.peso;
    if (!alturaCm || !pesoKg || alturaCm <= 0 || pesoKg <= 0) return null;
    const alturaM = alturaCm / 100;
    const imc = pesoKg / (alturaM * alturaM);
    return imc.toFixed(1);
  }

  get imcEstado(): string {
    const imcStr = this.imcCalculado;
    if (!imcStr) return 'Pendiente de datos biométricos';
    const imc = parseFloat(imcStr);
    if (imc < 18.5) return 'Bajo peso atlético';
    if (imc <= 24.9) return 'Óptimo Handball (Normopeso)';
    if (imc <= 29.9) return 'Rango Físico / Fuerza';
    return 'Requiere Acondicionamiento';
  }

  get progress(): number {
    const fields = [
      this.jugadorData.dni,
      this.jugadorData.apellidos,
      this.jugadorData.nombres,
      this.birthDate,
      this.jugadorData.clubId,
      this.fileNames.fichaJugador || this.existingUrls.fichaJugador || (this.documentacionDiferida ? 'ok' : ''),
    ];
    if (this.isMinor) {
      fields.push(
        this.fileNames.autorizacionPadres ||
          this.existingUrls.autorizacionPadres ||
          this.jugadorData.tutorPhone ||
          (this.documentacionDiferida ? 'ok' : ''),
      );
    }
    const completed = fields.filter((f) => !!f).length;
    return Math.min(100, Math.round((completed / fields.length) * 100));
  }

  buscarNombreClub(id: string) {
    const club = this.clubesDisponibles.find((c) => c.id === id);
    if (club) {
      this.clubNombre = club.nombre;
      // Solo habilitar selector especial si el atleta tiene 35 años o más
      if (club.esInvitado && this.esMayorDe35) {
        this.mostrarSelectorEspecial = true;
        this.opcionesCategoriaEspecial = ['+35', 'Primera'];
        if (!this.jugadorData.categoriaEspecial) {
          this.jugadorData.categoriaEspecial = '+35';
        }
      }
    }
  }

  onClubChange(id: string) {
    this.jugadorData.clubId = id;
    this.buscarNombreClub(id);
  }

  cargarDatosJugador(id: string) {
    this.loading = true;
    this.sub.add(
      this.jugadoresService.getJugadorById(id).subscribe({
        next: (j: any) => {
          this.loading = false;
          if (j) {
            this.poblarFormulario(j);
            this.cargarMovimientosJugador(id, j);
          }
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.errorMessage = 'Error al conectar con el servidor para cargar el expediente.';
          this.cdr.detectChanges();
        },
      }),
    );
  }

  poblarFormulario(j: any) {
    let apellidos = '';
    let nombres = '';
    if (j.nombreCompleto) {
      if (j.nombreCompleto.includes(', ')) {
        const partes = j.nombreCompleto.split(', ');
        apellidos = partes[0] || '';
        nombres = partes.slice(1).join(', ') || '';
      } else {
        apellidos = j.nombreCompleto;
        nombres = '';
      }
    }

    this.jugadorData = {
      dni: j.dni,
      apellidos: apellidos,
      nombres: nombres,
      genero: j.genero || 'Masculino',
      nacionalidad: j.nacionalidad || 'Argentina',
      email: j.email || '',
      whatsapp: j.whatsapp || '',
      tutorPhone: j.tutorPhone || '',
      peso: j.peso || null,
      altura: j.altura || null,
      equipo: j.equipo || 'A',
      categoriaEspecial: j.categoriaEspecial || null,
      estado: j.estado || 'Pendiente',
      clubId: j.clubId,
    };

    if (j.fechaNacimiento) {
      this.birthDate = j.fechaNacimiento.split('T')[0];
    }
    this.selectedHand = j.manoHabil || 'Derecha';
    this.selectedCategory = j.categoria || 'Primera';

    if (this.birthDate) {
      this.onDateChange(this.birthDate);
    }

    // Si ya tenía categoría especial o +35, solo mantenerlo si es >= 35 años
    if ((j.categoria === '+35' || j.categoriaEspecial === '+35') && this.esMayorDe35) {
      this.mostrarSelectorEspecial = true;
      this.opcionesCategoriaEspecial = ['+35', 'Primera'];
      this.jugadorData.categoriaEspecial = '+35';
    } else if (!this.esMayorDe35) {
      this.mostrarSelectorEspecial = false;
      this.jugadorData.categoriaEspecial = null;
    }

    if (j.fichaMedicaUrl) {
      this.fileNames.fichaMedica = 'Archivo guardado';
      this.existingUrls.fichaMedica = j.fichaMedicaUrl;
    }
    if (j.autorizacionUrl) {
      this.fileNames.autorizacionPadres = 'Archivo guardado';
      this.existingUrls.autorizacionPadres = j.autorizacionUrl;
    }
    if (j.fichaJugadorUrl) {
      this.fileNames.fichaJugador = 'Archivo guardado';
      this.existingUrls.fichaJugador = j.fichaJugadorUrl;
    }

    this.buscarNombreClub(j.clubId);
  }

  cargarMovimientosJugador(id: string, jugadorObj?: any) {
    if (jugadorObj?.movimientos && Array.isArray(jugadorObj.movimientos)) {
      this.movimientosJugador = jugadorObj.movimientos;
      this.movimientoActivo =
        this.movimientosJugador.find((m) => m.tipo === 'PRESTAMO' && m.estado === 'Activo') || null;
      return;
    }

    this.cargandoMovimientos = true;
    this.sub.add(
      this.jugadoresService.getMovimientos(id).subscribe({
        next: (movimientos) => {
          this.movimientosJugador = movimientos || [];
          this.movimientoActivo =
            this.movimientosJugador.find((m) => m.tipo === 'PRESTAMO' && m.estado === 'Activo') || null;
          this.cargandoMovimientos = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.cargandoMovimientos = false;
          this.cdr.detectChanges();
        },
      }),
    );
  }

  registrarMovimiento() {
    if (!this.isEditMode || !this.jugadorId) {
      this.mostrarToast('Primero guarde el jugador antes de registrar un movimiento.', 'error');
      return;
    }

    if (!this.clubDestinoId) {
      this.mostrarToast('Debe elegir un club destino.', 'error');
      return;
    }

    if (this.modoMovimiento === 'PRESTAMO' && (!this.mesesPrestamo || this.mesesPrestamo <= 0)) {
      this.mostrarToast('Indique la cantidad de meses del préstamo.', 'error');
      return;
    }

    const payload = {
      clubDestinoId: this.clubDestinoId,
      meses: this.modoMovimiento === 'PRESTAMO' ? Number(this.mesesPrestamo) : undefined,
      observaciones: this.observacionesMovimiento || undefined,
    };

    const request =
      this.modoMovimiento === 'PASE'
        ? this.jugadoresService.registrarPase(this.jugadorId, payload)
        : this.jugadoresService.registrarPrestamo(this.jugadorId, payload);

    request.subscribe({
      next: () => {
        this.mostrarToast(
          this.modoMovimiento === 'PASE' ? 'Pase definitivo registrado con éxito' : 'Préstamo interclub registrado',
          'success',
        );
        this.observacionesMovimiento = '';
        this.clubDestinoId = '';
        if (this.jugadorId) {
          this.cargarDatosJugador(this.jugadorId);
        }
      },
      error: (err) => {
        this.mostrarToast(err.error?.error || 'No se pudo registrar el movimiento', 'error');
        this.cdr.detectChanges();
      },
    });
  }

  devolverPrestamo() {
    if (!this.jugadorId) return;

    this.jugadoresService
      .devolverPrestamo(this.jugadorId, {
        observaciones: this.observacionesMovimiento || undefined,
      })
      .subscribe({
        next: () => {
          this.mostrarToast('Préstamo devuelto correctamente.', 'success');
          this.observacionesMovimiento = '';
          if (this.jugadorId) {
            this.cargarDatosJugador(this.jugadorId);
          }
        },
        error: (err) => {
          this.mostrarToast(err.error?.error || 'No se pudo devolver el préstamo', 'error');
          this.cdr.detectChanges();
        },
      });
  }

  soloNumeros(event: KeyboardEvent) {
    const pattern = /[0-9]/;
    const inputChar = String.fromCharCode(event.charCode);
    if (!pattern.test(inputChar)) event.preventDefault();
  }

  onDniInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input) return;
    this.jugadorData.dni = input.value.replace(/\D/g, '');
  }

  onAlturaInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input) return;
    let val = parseFloat(input.value.replace(',', '.'));
    if (!isNaN(val) && val > 0 && val < 3) {
      val = Math.round(val * 100);
      this.jugadorData.altura = val;
    }
  }

  onDateChange(newDate: string) {
    if (!newDate) return;
    this.birthDate = newDate;
    const nacimiento = new Date(newDate);
    if (isNaN(nacimiento.getTime())) return;

    const birthYear = nacimiento.getFullYear();
    const age = 2026 - birthYear;

    this.isMinor = age < 18;

    if (age <= 12) this.selectedCategory = 'Infantiles';
    else if (age <= 14) this.selectedCategory = 'Menores';
    else if (age <= 16) this.selectedCategory = 'Cadetes';
    else if (age <= 18) this.selectedCategory = 'Juveniles';
    else this.selectedCategory = 'Primera';

    if (age >= 35) {
      this.mostrarSelectorEspecial = true;
      this.opcionesCategoriaEspecial = ['Primera', '+35'];
      if (!this.isEditMode && !this.jugadorData.categoriaEspecial) {
        this.jugadorData.categoriaEspecial = '+35';
      }
    } else {
      // Si tiene menos de 35 años, NUNCA puede habilitarse el régimen +35
      this.mostrarSelectorEspecial = false;
      this.jugadorData.categoriaEspecial = null;
    }

    if (!this.isMinor) {
      this.jugadorData.tutorPhone = '';
      this.files.autorizacionPadres = null;
      this.fileNames.autorizacionPadres = '';
    }

    this.cdr.detectChanges();
  }

  toggleSelectorEspecial(forzar?: boolean) {
    // REGLA ESTRICTA: Solo es posible de habilitar si el jugador tiene >= 35 años
    if (!this.esMayorDe35) {
      this.mostrarToast('El régimen +35 solo es posible de habilitar si el jugador tiene 35 años o más.', 'error');
      this.mostrarSelectorEspecial = false;
      this.jugadorData.categoriaEspecial = null;
      return;
    }

    if (forzar !== undefined) {
      this.mostrarSelectorEspecial = forzar;
    } else {
      this.mostrarSelectorEspecial = !this.mostrarSelectorEspecial;
    }

    if (this.mostrarSelectorEspecial) {
      this.opcionesCategoriaEspecial = ['+35', 'Primera'];
      this.jugadorData.categoriaEspecial = '+35';
      this.selectedCategory = '+35';
      this.mostrarToast('Régimen +35 activado. Jugador habilitado para Torneo de Veteranos.', 'success');
    } else {
      this.jugadorData.categoriaEspecial = null;
      if (this.birthDate) {
        this.onDateChange(this.birthDate);
      } else {
        this.selectedCategory = 'Primera';
      }
      this.mostrarToast('Régimen +35 desactivado. Asignado a categoría reglamentaria.', 'success');
    }
  }

  onFileChange(event: any, type: 'fichaMedica' | 'autorizacionPadres' | 'fichaJugador') {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        this.mostrarToast('El archivo supera el tamaño máximo permitido de 10 MB.', 'error');
        return;
      }
      this.fileNames[type] = file.name;
      this.files[type] = file;
      this.mostrarToast(`Archivo "${file.name}" cargado correctamente.`, 'success');
      this.cdr.detectChanges();
    }
  }

  verDocumento(url?: string | null) {
    if (!url) return;
    const fullUrl = this.jugadoresService.getFileUrl(url);
    window.open(fullUrl, '_blank');
  }

  onHandChange(hand: string) {
    this.selectedHand = hand;
    this.cdr.detectChanges();
  }

  // --- Validación Visual de Campos ---
  isCampoInvalido(campo: string): boolean {
    if (!this.intentoGuardar) return false;
    switch (campo) {
      case 'dni':
        return !this.jugadorData.dni || !/^[0-9]{7,10}$/.test(this.jugadorData.dni.toString().trim());
      case 'apellidos':
        return !this.jugadorData.apellidos || this.jugadorData.apellidos.trim().length < 2;
      case 'nombres':
        return !this.jugadorData.nombres || this.jugadorData.nombres.trim().length < 2;
      case 'birthDate':
        return !this.birthDate;
      case 'clubId':
        return !this.jugadorData.clubId;
      case 'altura':
        return (
          this.jugadorData.altura !== null &&
          this.jugadorData.altura !== '' &&
          (this.jugadorData.altura < 100 || this.jugadorData.altura > 230)
        );
      case 'peso':
        return (
          this.jugadorData.peso !== null &&
          this.jugadorData.peso !== '' &&
          (this.jugadorData.peso < 30 || this.jugadorData.peso > 160)
        );
      case 'fichaJugador':
        return (
          !this.documentacionDiferida &&
          !this.isEditMode &&
          !this.files.fichaJugador &&
          !this.existingUrls.fichaJugador
        );
      case 'autorizacionPadres':
        return (
          this.isMinor &&
          !this.documentacionDiferida &&
          !this.isEditMode &&
          !this.files.autorizacionPadres &&
          !this.existingUrls.autorizacionPadres
        );
      default:
        return false;
    }
  }

  // --- Finalizar Registro / Guardar Legajo ---
  onFinalize() {
    this.intentoGuardar = true;
    this.errorMessage = '';

    // Validaciones básicas idénticas al proyecto original
    if (!this.jugadorData.dni || !this.jugadorData.dni.toString().trim()) {
      this.errorMessage = 'El DNI / Documento es obligatorio.';
      this.mostrarToast(this.errorMessage, 'error');
      this.scrollAlPrimerError('dni');
      return;
    }

    const dniLimpio = this.jugadorData.dni.toString().replace(/\D/g, '');
    if (dniLimpio.length < 7 || dniLimpio.length > 10) {
      this.errorMessage = 'El DNI debe contener entre 7 y 10 dígitos numéricos.';
      this.mostrarToast(this.errorMessage, 'error');
      this.scrollAlPrimerError('dni');
      return;
    }

    if (!this.jugadorData.apellidos || this.jugadorData.apellidos.trim().length < 2) {
      this.errorMessage = 'El apellido es obligatorio (mínimo 2 letras).';
      this.mostrarToast(this.errorMessage, 'error');
      this.scrollAlPrimerError('apellidos');
      return;
    }

    if (!this.jugadorData.nombres || this.jugadorData.nombres.trim().length < 2) {
      this.errorMessage = 'El nombre es obligatorio (mínimo 2 letras).';
      this.mostrarToast(this.errorMessage, 'error');
      this.scrollAlPrimerError('nombres');
      return;
    }

    if (!this.birthDate) {
      this.errorMessage = 'La fecha de nacimiento es obligatoria.';
      this.mostrarToast(this.errorMessage, 'error');
      this.scrollAlPrimerError('birthDate');
      return;
    }

    if (!this.jugadorData.clubId) {
      this.errorMessage = 'Debe seleccionar un club o equipo asignado.';
      this.mostrarToast(this.errorMessage, 'error');
      this.scrollAlPrimerError('clubId');
      return;
    }

    if (!this.documentacionDiferida && !this.isEditMode && !this.files.fichaJugador && !this.existingUrls.fichaJugador) {
      this.errorMessage = 'La Ficha de Jugador / Afiliación es obligatoria (o tilde "Documentación pendiente").';
      this.mostrarToast(this.errorMessage, 'error');
      return;
    }

    if (
      this.isMinor &&
      !this.documentacionDiferida &&
      !this.isEditMode &&
      !this.files.autorizacionPadres &&
      !this.existingUrls.autorizacionPadres
    ) {
      this.errorMessage = 'Los atletas menores de 18 años requieren Autorización de Padres (o tilde "Documentación pendiente").';
      this.mostrarToast(this.errorMessage, 'error');
      return;
    }

    const formData = new FormData();

    // 1. Datos base: Solo agregar si tienen valor real
    Object.keys(this.jugadorData).forEach((key) => {
      const value = this.jugadorData[key];
      if (value !== null && value !== undefined && value !== '') {
        formData.append(key, value);
      }
    });

    // 2. Datos obligatorios calculados
    const nombreNormalizado = `${this.jugadorData.apellidos.trim().toUpperCase()}, ${this.jugadorData.nombres.trim().toUpperCase()}`;
    formData.set('dni', dniLimpio);
    formData.set('nombreCompleto', nombreNormalizado);
    formData.set('fechaNacimiento', this.birthDate);

    // REGLA: El régimen de +35 solo es posible si el jugador tiene >= 35 años
    if (this.mostrarSelectorEspecial && this.esMayorDe35 && this.jugadorData.categoriaEspecial === '+35') {
      formData.set('categoria', '+35');
      formData.set('categoriaEspecial', '+35');
    } else {
      formData.set('categoria', this.selectedCategory);
      if (this.esMayorDe35 && this.jugadorData.categoriaEspecial) {
        formData.set('categoriaEspecial', this.jugadorData.categoriaEspecial);
      } else {
        formData.delete('categoriaEspecial');
      }
    }

    formData.set('manoHabil', this.selectedHand);

    // 3. Archivos (Solo si son nuevos archivos de tipo File)
    if (this.files.fichaMedica instanceof File) {
      formData.append('fichaMedica', this.files.fichaMedica);
    }
    if (this.files.fichaJugador instanceof File) {
      formData.append('fichaJugador', this.files.fichaJugador);
    }
    if (this.isMinor && this.files.autorizacionPadres instanceof File) {
      formData.append('autorizacionPadres', this.files.autorizacionPadres);
    }

    this.saving = true;

    const request =
      this.isEditMode && this.jugadorId
        ? this.jugadoresService.actualizarJugador(this.jugadorId, formData)
        : this.jugadoresService.crearJugador(formData);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.mostrarToast(
          this.isEditMode ? '¡Expediente del atleta actualizado con éxito!' : '¡Atleta registrado con éxito en el padrón federativo!',
          'success',
        );
        setTimeout(() => this.router.navigate(['/admin/jugadores']), 1200);
      },
      error: (err) => {
        this.saving = false;
        console.error(err);
        this.errorMessage = err.error?.error || 'Error al conectar con el servidor para guardar el atleta.';
        this.mostrarToast(this.errorMessage, 'error');
        this.cdr.detectChanges();
      },
    });
  }

  scrollAlPrimerError(campo: string) {
    setTimeout(() => {
      const el = document.querySelector(`[name="${campo}"]`) as HTMLElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus?.();
      }
    }, 100);
  }

  mostrarToast(msg: string, tipo: 'success' | 'error' = 'success') {
    this.feedbackMensaje = msg;
    this.feedbackTipo = tipo;
    setTimeout(() => (this.feedbackMensaje = null), 4500);
  }

  getClubInitials(c?: Club | null): string {
    if (!c) return 'FJH';
    if (c.siglas) return c.siglas;
    return c.nombre.slice(0, 3).toUpperCase();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
