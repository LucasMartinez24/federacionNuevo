import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Torneo, TorneosService } from '../../../../../core/services/torneos.service';

export interface VisualTheme {
  name: string;
  sublabel: string;
  class: string;
  previewGradient: string;
}

@Component({
  selector: 'app-torneo-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './torneo-form.component.html',
  styleUrl: './torneo-form.component.css',
})
export class TorneoFormComponent implements OnInit {
  private readonly torneosService = inject(TorneosService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Modo edición / creación
  readonly isEditMode = signal<boolean>(false);
  readonly torneoId = signal<string | null>(null);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly actionFeedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Paletas visuales oficiales FJH
  readonly themes: VisualTheme[] = [
    {
      name: 'Azul Federación',
      sublabel: 'NAVY • ELECTRIC CYAN',
      class: 'from-[#0b3c5d] via-court-card to-surface-container',
      previewGradient: 'from-court-card to-accent-cyan-deep',
    },
    {
      name: 'Carmesí Deportivo',
      sublabel: 'RUBY • CRIMSON',
      class: 'from-red-600 to-orange-950',
      previewGradient: 'from-secondary-container to-secondary',
    },
    {
      name: 'Ámbar Competitivo',
      sublabel: 'OBSIDIAN • GOLD',
      class: 'from-amber-600 to-amber-950',
      previewGradient: 'from-surface-container-high to-accent-amber',
    },
    {
      name: 'Esmeralda Provincial',
      sublabel: 'DEEP TEAL • MINT',
      class: 'from-emerald-500 to-teal-950',
      previewGradient: 'from-surface-container-low to-tertiary',
    },
    {
      name: 'Púrpura Nocturno',
      sublabel: 'INDIGO ARENA • VIOLET GLOW',
      class: 'from-purple-600 to-indigo-950',
      previewGradient: 'from-surface-container-highest to-accent-ihf-blue',
    },
  ];

  // Estado del Formulario
  readonly nombre = signal<string>('');
  readonly categoria = signal<string>('Primera División');
  readonly rama = signal<string>('Masculino');
  readonly temporada = signal<string>('2026');
  readonly fechaInicio = signal<string>(new Date().toISOString().substring(0, 10));
  readonly sedes = signal<string[]>([
    'Polideportivo Cuyaya',
    'Club Atl. Gorriti',
    'Estadio Federación',
  ]);
  readonly nuevaSedeInput = signal<string>('');
  readonly showAddSedeInput = signal<boolean>(false);

  // Sección Formato & Playoffs
  readonly formato = signal<'liga' | 'grupos_eliminatorias' | 'eliminatoria_directa'>('grupos_eliminatorias');
  readonly idaVuelta = signal<boolean>(true);
  readonly faseInicial = signal<'final' | 'semifinales' | 'cuartos' | 'octavos'>('semifinales');
  readonly tercerPuesto = signal<boolean>(true);
  readonly modalidadLlave = signal<'unico' | 'ida_vuelta'>('ida_vuelta');
  readonly cantidadGrupos = signal<number>(2);
  readonly criterioDesempate = signal<string>('dif_gol');

  // Sección Estilo Visual
  readonly colorClase = signal<string>(this.themes[0].class);
  readonly estado = signal<string>('Upcoming');

  // Cálculos dinámicos
  readonly crucesCalculados = computed<string>(() => {
    const f = this.formato();
    const fase = this.faseInicial();
    const modalidad = this.modalidadLlave() === 'ida_vuelta' ? 'Ida y Vuelta' : 'Partido Único';
    const bronce = this.tercerPuesto() ? ' + 3° Puesto' : '';

    if (f === 'liga') {
      const regular = this.idaVuelta() ? 'Fase Regular Ida y Vuelta' : 'Fase Regular Solo Ida';
      return `${regular} • Semifinales (1° vs 4°, 2° vs 3°)${bronce} y Gran Final (${modalidad})`;
    }

    if (f === 'grupos_eliminatorias') {
      return `${this.cantidadGrupos()} Zonas • Semifinales Cruzadas (1°A vs 2°B, 1°B vs 2°A)${bronce} y Gran Final (${modalidad})`;
    }

    let base = 0;
    switch (fase) {
      case 'octavos':
        base = 8;
        break;
      case 'cuartos':
        base = 4;
        break;
      case 'semifinales':
        base = 2;
        break;
      case 'final':
        base = 1;
        break;
    }
    const crucesTotales = base * 2 - 1 + (this.tercerPuesto() ? 1 : 0);
    return `Cuadro Directo: ${crucesTotales} Cruces Totales (${modalidad})${bronce}`;
  });

  readonly isFormValid = computed<boolean>(() => {
    return this.nombre().trim().length >= 4 && !!this.fechaInicio();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.torneoId.set(id);
      this.cargarTorneo(id);
    }
  }

  cargarTorneo(id: string): void {
    this.loading.set(true);
    this.torneosService.getTorneoById(id).subscribe({
      next: (t) => {
        this.nombre.set(t.nombre || '');
        this.categoria.set(t.categoria || 'Primera División');
        this.rama.set(t.rama || 'Masculino');
        this.temporada.set(t.temporada || '2026');
        if (t.fechaInicio) {
          this.fechaInicio.set(new Date(t.fechaInicio).toISOString().substring(0, 10));
        }
        if (t.sedes) {
          try {
            const parsed = typeof t.sedes === 'string' ? JSON.parse(t.sedes) : t.sedes;
            this.sedes.set(Array.isArray(parsed) ? parsed : [parsed]);
          } catch {
            this.sedes.set(String(t.sedes).split(',').map((s) => s.trim()));
          }
        }
        if (t.formato) {
          this.formato.set(t.formato as any);
        }
        this.idaVuelta.set(t.idaVuelta ?? true);
        if (t.faseInicial) {
          this.faseInicial.set(t.faseInicial as any);
        }
        this.tercerPuesto.set(t.tercerPuesto ?? true);
        if (t.modalidadLlave) {
          this.modalidadLlave.set(t.modalidadLlave as any);
        }
        if (t.cantidadGrupos) {
          this.cantidadGrupos.set(t.cantidadGrupos);
        }
        if (t.criterioDesempate) {
          this.criterioDesempate.set(t.criterioDesempate);
        }
        if (t.colorClase) {
          this.colorClase.set(t.colorClase);
        }
        if (t.estado) {
          this.estado.set(t.estado);
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al cargar torneo:', err);
        this.loading.set(false);
        this.mostrarFeedback('error', 'No se pudo recuperar los datos del torneo.');
      },
    });
  }

  setRama(rama: string): void {
    this.rama.set(rama);
  }

  setFormato(formato: 'liga' | 'grupos_eliminatorias' | 'eliminatoria_directa'): void {
    this.formato.set(formato);
    if (formato === 'liga') {
      this.faseInicial.set('semifinales');
      this.tercerPuesto.set(true);
    }
  }

  setIdaVuelta(valor: boolean): void {
    this.idaVuelta.set(valor);
  }

  setFaseInicial(fase: 'final' | 'semifinales' | 'cuartos' | 'octavos'): void {
    this.faseInicial.set(fase);
  }

  toggleTercerPuesto(): void {
    this.tercerPuesto.update((v) => !v);
  }

  setModalidadLlave(modalidad: 'unico' | 'ida_vuelta'): void {
    this.modalidadLlave.set(modalidad);
  }

  toggleIdaVuelta(): void {
    this.idaVuelta.update((v) => !v);
  }

  setTheme(themeClass: string): void {
    this.colorClase.set(themeClass);
  }

  agregarSede(): void {
    const val = this.nuevaSedeInput().trim();
    if (!val) return;
    if (!this.sedes().includes(val)) {
      this.sedes.update((s) => [...s, val]);
    }
    this.nuevaSedeInput.set('');
    this.showAddSedeInput.set(false);
  }

  eliminarSede(index: number): void {
    this.sedes.update((s) => s.filter((_, i) => i !== index));
  }

  guardar(publicar: boolean = false): void {
    if (!this.nombre().trim()) {
      this.mostrarFeedback('error', 'El nombre oficial del torneo es obligatorio.');
      return;
    }

    if (!this.fechaInicio()) {
      this.mostrarFeedback('error', 'Debe especificar la fecha de inicio programada.');
      return;
    }

    this.saving.set(true);

    const payload: Partial<Torneo> = {
      nombre: this.nombre().trim(),
      categoria: this.categoria(),
      rama: this.rama(),
      temporada: this.temporada(),
      fechaInicio: this.fechaInicio(),
      sedes: this.sedes(),
      formato: this.formato(),
      idaVuelta: this.idaVuelta(),
      faseInicial: this.faseInicial(),
      tercerPuesto: this.tercerPuesto(),
      modalidadLlave: this.modalidadLlave(),
      cantidadGrupos: this.cantidadGrupos(),
      criterioDesempate: this.criterioDesempate(),
      colorClase: this.colorClase(),
      estado: publicar ? 'In Progress' : (this.estado() || 'Upcoming'),
    };

    const request = this.isEditMode() && this.torneoId()
      ? this.torneosService.updateTorneo(this.torneoId()!, payload)
      : this.torneosService.crearTorneo(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/admin/torneos']);
      },
      error: (err) => {
        console.error('Error al guardar torneo:', err);
        this.saving.set(false);
        this.mostrarFeedback('error', 'Error al sincronizar con el servidor central de la FJH.');
      },
    });
  }

  mostrarFeedback(type: 'success' | 'error', message: string): void {
    this.actionFeedback.set({ type, message });
    setTimeout(() => {
      this.actionFeedback.set(null);
    }, 4500);
  }
}

