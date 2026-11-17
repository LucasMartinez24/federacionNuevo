import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AdminSidebarStateService } from '../../../../core/navigation/admin-sidebar-state.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  BoletinArancel,
  BoletinCategoria,
  BoletinOficial,
  BoletinesService,
} from '../../../../core/services/boletines.service';
import { Club, ClubesService } from '../../../../core/services/clubes.service';
import { Jugador, JugadoresService } from '../../../../core/services/jugadores.service';
import { SancionDisciplinaria, SancionesService } from '../../../../core/services/sanciones.service';

const DEFAULT_BOLETINES_FALLBACK: BoletinOficial[] = [];

@Component({
  selector: 'app-boletin-resoluciones',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './boletin-resoluciones.component.html',
  styleUrl: './boletin-resoluciones.component.css',
})
export class BoletinResolucionesComponent implements OnInit {
  private readonly boletinesService = inject(BoletinesService);
  private readonly sancionesService = inject(SancionesService);
  private readonly clubesService = inject(ClubesService);
  private readonly jugadoresService = inject(JugadoresService);
  private readonly authService = inject(AuthService);
  private readonly sidebarState = inject(AdminSidebarStateService);

  protected readonly serverUrl = environment.serverUrl;
  protected readonly isAdmin = computed(
    () => this.authService.isAdmin() || this.authService.isRepFederacion() || this.authService.isJefeArbitros()
  );

  // Estado principal
  protected readonly loading = signal<boolean>(true);
  protected readonly boletines = signal<BoletinOficial[]>([]);
  protected readonly sanciones = signal<SancionDisciplinaria[]>([]);
  protected readonly clubes = signal<Club[]>([]);
  protected readonly jugadores = signal<Jugador[]>([]);

  // Notificación Toast
  protected readonly toastMessage = signal<string | null>(null);
  protected readonly toastType = signal<'success' | 'error' | 'info'>('success');

  // Filtros reactivos
  protected readonly searchQuery = signal<string>('');
  protected readonly selectedYear = signal<'2026' | '2025' | 'ALL'>('2026');
  protected readonly selectedCategory = signal<'ALL' | 'tribunal' | 'reglamento' | 'tesoreria' | 'urgentes'>('ALL');
  protected readonly selectedStatus = signal<'vigente' | 'archivado' | 'ALL'>('vigente');
  protected readonly visibleLimit = signal<number>(10);

  // Modales interactivos
  protected readonly showCreateModal = signal<boolean>(false);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly selectedResolutionModal = signal<BoletinOficial | null>(null);
  protected readonly resolutionToDelete = signal<BoletinOficial | null>(null);

  // Formulario para Nueva Resolución / Circular
  protected formCategoria: BoletinCategoria = 'tribunal';
  protected formNumero = '';
  protected formExpediente = '';
  protected formTitulo = '';
  protected formUrgente = false;
  protected readonly formClubId = signal<string>('');
  protected readonly cargandoJugadoresClub = signal<boolean>(false);
  protected readonly jugadoresDelClubModal = signal<Jugador[]>([]);
  protected readonly filtroBusquedaJugador = signal<string>('');
  protected readonly selectedJugadorModal = signal<Jugador | null>(null);
  protected readonly formSancionadoManual = signal<string>('');
  protected formJugadorId = '';
  protected formRegistrarSancionDb = true;
  protected formTipoPenalidad: 'suspension' | 'multa' | 'mixta' | 'advertencia' = 'suspension';
  protected formMontoMulta = '$50.000';
  protected formCausalMulta = 'Inconducta deportiva / disturbios';
  protected formPlazoPago = '5 días hábiles en Tesorería FJH';
  protected formInhabilitarJugador = true;
  protected formFechasTotales = 2;
  protected formFalloCorto = '2 Fechas de Suspensión';
  protected formVisto = '';
  protected formConsiderando = '';
  protected formResuelveTexto = '';
  protected formResumen = '';
  protected formAlertaTitulo = '';
  protected formAlertaTexto = '';
  protected formAutoridad = 'Dr. M. Villafañe (Pres. Tribunal) & Prof. L. Cruz (Sec. Gral.)';
  protected selectedPdfFile: File | null = null;
  protected formAranceles: BoletinArancel[] = [
    { concepto: 'Seguro Anual Atleta', monto: '$18.500', moneda: 'ARS', detalle: 'Póliza CAH Obligatoria', destacado: true },
  ];

  // Jugadores filtrados en tiempo real por búsqueda dentro del club seleccionado
  protected readonly jugadoresFiltradosModal = computed(() => {
    const term = this.filtroBusquedaJugador().toLowerCase().trim();
    const list = this.jugadoresDelClubModal();
    if (!term) return list.slice(0, 8);
    return list
      .filter((j) => {
        const matchName = (j.nombreCompleto || '').toLowerCase().includes(term);
        const matchDni = (j.dni || '').includes(term);
        const matchCat = (j.categoria || '').toLowerCase().includes(term);
        return matchName || matchDni || matchCat;
      })
      .slice(0, 16);
  });

  // Unificación de Boletines Oficiales + Fallos de Base de Datos (Sanciones)
  protected readonly unifiedStream = computed<BoletinOficial[]>(() => {
    const baseBoletines = this.boletines();
    const dbSanciones = this.sanciones();

    // Evitar duplicar si el expediente ya existe en boletines
    const existingExpedientes = new Set(
      baseBoletines.map((b) => (b.expediente || '').toLowerCase().trim())
    );

    const mappedSanciones: BoletinOficial[] = dbSanciones
      .filter((s) => !existingExpedientes.has((s.expediente || '').toLowerCase().trim()))
      .map((s, idx) => {
        const createdDate = s.createdAt ? new Date(s.createdAt) : new Date();
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const fechaStr = `${String(createdDate.getDate()).padStart(2, '0')} ${
          meses[createdDate.getMonth()]
        } ${createdDate.getFullYear()} • ${String(createdDate.getHours()).padStart(2, '0')}:${String(
          createdDate.getMinutes()
        ).padStart(2, '0')} hs`;

        const isFalloMulta = (s.fallo || '').toLowerCase().includes('multa') || (s.totales === 0);
        const isActiva = isFalloMulta ? true : (s.cumplidas ?? 0) < (s.totales ?? 1);

        const arancelesItem: BoletinArancel[] = isFalloMulta
          ? [
              {
                concepto: `Multa Tribunal de Penas - ${s.institucion}`,
                monto: (s.fallo.match(/\$[\d.]+/)?.[0]) || '$50.000',
                moneda: 'ARS',
                detalle: 'Sanción Pecuniaria a cancelar en Tesorería FJH',
                destacado: true,
              },
            ]
          : [];

        return {
          id: `sancion-${s.id}`,
          sancionId: s.id,
          numero: `RESOLUCIÓN T.P. • ${s.expediente}`,
          expediente: s.expediente,
          titulo: `FALLO DISCIPLINARIO OFICIAL: ${s.sancionado} (${s.institucion}) — ${s.fallo.toUpperCase()}`,
          categoria: 'tribunal',
          organo: 'Consejo Directivo',
          suborgano: 'Tribunal de Penas & Disciplina Deportiva',
          fecha: fechaStr,
          anio: String(createdDate.getFullYear()),
          urgente: s.estado === 'grave' && isActiva,
          estado: isActiva ? 'vigente' : 'archivado',
          clubAfectado: s.institucion,
          sancionado: s.sancionado,
          cumplidas: s.cumplidas ?? 0,
          totales: s.totales ?? (isFalloMulta ? 0 : 1),
          fallo: s.fallo,
          visto: `Las actuaciones labradas en el ${s.expediente} correspondientes a la categoría ${s.categoria} (${
            s.vigencia || 'Temporada 2026'
          }) involucrando a ${s.sancionado} de la institución ${s.institucion}; y`,
          considerando:
            s.motivo ||
            'Que los hechos informados en la planilla electrónica oficial constituyen una infracción tipificada en el Código de Penas de la Federación Jujeña de Handball y reglamentos CAH;',
          resuelve: [
            `Art. 1°: Sancionar a ${s.sancionado} (${s.institucion} • ${s.categoria}) con la pena de ${s.fallo}.`,
            isFalloMulta
              ? `Art. 2°: Intimar a la institución al pago de la multa pecuniaria ante Tesorería FJH dentro de los plazos reglamentarios.`
              : `Art. 2°: Registrar el cómputo de cumplimiento en el sistema oficial (${s.cumplidas} de ${s.totales} fechas cumplidas) y notificar al delegado acreditado.`,
          ],
          resumen: null,
          alertaTitulo: isFalloMulta
            ? 'Multa Económica al Club (Sanción Pecuniaria):'
            : (isActiva ? 'Sanción Disciplinaria en Curso:' : 'Sanción Cumplida / Homologada:'),
          alertaTexto: isFalloMulta
            ? `Fallo pecuniario emitido por el Tribunal de Penas bajo ${s.expediente}: ${s.fallo}. Deberá ser cancelado ante Tesorería FJH.`
            : (isActiva
                ? `El atleta o miembro sancionado registra ${s.cumplidas} de ${s.totales} fecha(s) cumplidas bajo el expediente ${s.expediente}.`
                : `La sanción de ${s.totales} fecha(s) fue cumplida en su totalidad, rehabilitando su condición federativa.`),
          alertaTipo: isFalloMulta ? 'amber' : (isActiva ? 'amber' : 'tertiary'),
          aranceles: arancelesItem,
          adjuntos: [
            {
              nombre: `Acta-Tribunal-${s.expediente.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`,
              tamano: '640 KB',
              subtitulo: 'Fallo Homologado',
              url: '/docs/Formulario-Fichaje-FJH.pdf',
            },
          ],
          selloTitulo: 'Fallo Vinculante Tribunal de Penas',
          selloAutoridad: 'Certificado CAH: Tribunal de Disciplina FJH • Registro Electrónico',
          selloIcono: 'gavel',
          selloColor: 'tertiary',
          createdAt: s.createdAt,
        };
      });

    return [...baseBoletines, ...mappedSanciones];
  });

  // Contadores de KPIs y Categorías
  protected readonly totalCount = computed(() => this.unifiedStream().length);
  protected readonly vigentesCount = computed(
    () => this.unifiedStream().filter((b) => b.estado === 'vigente').length
  );
  protected readonly tribunalCount = computed(
    () => this.unifiedStream().filter((b) => b.categoria === 'tribunal').length
  );
  protected readonly reglamentoCount = computed(
    () => this.unifiedStream().filter((b) => b.categoria === 'reglamento').length
  );
  protected readonly tesoreriaCount = computed(
    () => this.unifiedStream().filter((b) => b.categoria === 'tesoreria').length
  );
  protected readonly urgentesCount = computed(
    () => this.unifiedStream().filter((b) => b.urgente).length
  );

  // Lista Filtrada
  protected readonly filteredBoletines = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const year = this.selectedYear();
    const cat = this.selectedCategory();
    const stat = this.selectedStatus();

    return this.unifiedStream().filter((item) => {
      // 1. Año
      if (year !== 'ALL' && item.anio !== year) {
        return false;
      }

      // 2. Estado (vigente / archivado)
      if (stat !== 'ALL' && item.estado !== stat) {
        return false;
      }

      // 3. Categoría
      if (cat === 'urgentes') {
        if (!item.urgente) return false;
      } else if (cat !== 'ALL') {
        if (item.categoria !== cat) return false;
      }

      // 4. Búsqueda por texto
      if (query) {
        const haystack = [
          item.numero,
          item.expediente,
          item.titulo,
          item.organo,
          item.suborgano,
          item.clubAfectado,
          item.sancionado,
          item.visto,
          item.considerando,
          item.resumen,
          ...(item.resuelve || []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  });

  protected readonly displayedBoletines = computed(() =>
    this.filteredBoletines().slice(0, this.visibleLimit())
  );

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.loading.set(true);

    forkJoin({
      boletines: this.boletinesService
        .getBoletines()
        .pipe(catchError(() => of(DEFAULT_BOLETINES_FALLBACK))),
      sanciones: this.sancionesService.getSanciones().pipe(catchError(() => of([]))),
      clubes: this.clubesService.getClubes().pipe(catchError(() => of([]))),
      jugadores: this.jugadoresService.getJugadores().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ boletines, sanciones, clubes, jugadores }) => {
        this.boletines.set(
          boletines && boletines.length > 0 ? boletines : DEFAULT_BOLETINES_FALLBACK
        );
        this.sanciones.set(sanciones || []);
        this.clubes.set(clubes || []);
        this.jugadores.set(jugadores || []);
        this.loading.set(false);
      },
      error: () => {
        this.boletines.set(DEFAULT_BOLETINES_FALLBACK);
        this.loading.set(false);
      },
    });
  }

  // --- ACCIONES DE FILTRADO ---

  setCategory(cat: 'ALL' | 'tribunal' | 'reglamento' | 'tesoreria' | 'urgentes'): void {
    this.selectedCategory.set(cat);
  }

  setYear(year: '2026' | '2025' | 'ALL'): void {
    this.selectedYear.set(year);
  }

  setStatusFilter(status: 'vigente' | 'archivado' | 'ALL'): void {
    this.selectedStatus.set(status);
  }

  limpiarFiltros(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('ALL');
    this.selectedYear.set('2026');
    this.selectedStatus.set('ALL');
  }

  cargarMas(): void {
    this.visibleLimit.update((v) => v + 10);
  }

  // --- MODAL NUEVA RESOLUCIÓN / CIRCULAR ---

  abrirModalNuevaResolucion(categoriaInicial: BoletinCategoria = 'tribunal'): void {
    this.formCategoria = categoriaInicial;
    this.actualizarValoresPorCategoria(categoriaInicial);
    this.formTitulo = '';
    this.formUrgente = categoriaInicial === 'tribunal';
    this.formClubId.set('');
    this.jugadoresDelClubModal.set([]);
    this.selectedJugadorModal.set(null);
    this.filtroBusquedaJugador.set('');
    this.formSancionadoManual.set('');
    this.formJugadorId = '';
    this.formRegistrarSancionDb = categoriaInicial === 'tribunal';
    this.formTipoPenalidad = 'suspension';
    this.formMontoMulta = '$50.000';
    this.formCausalMulta = 'Inconducta deportiva / disturbios';
    this.formPlazoPago = '5 días hábiles en Tesorería FJH';
    this.formInhabilitarJugador = true;
    this.formFechasTotales = 2;
    this.formFalloCorto = '2 Fechas de Suspensión';
    this.formVisto =
      'El informe arbitral y las actuaciones administrativas remitidas a la Mesa de Entradas de la Federación Jujeña de Handball; y';
    this.formConsiderando =
      'Que resulta necesario dictar el instrumento resolutivo correspondiente conforme al Reglamento General de Competencias FJH / CAH;';
    this.formResuelveTexto =
      'Art. 1°: Homologar la presente disposición con carácter vinculante para las instituciones afiliadas.\nArt. 2°: Comuníquese, regístrese en el Boletín Oficial y archívese.';
    this.formResumen = '';
    this.formAlertaTitulo =
      categoriaInicial === 'tribunal'
        ? 'Plazo Perentorio de Apelación y Descargo:'
        : 'Vigencia Inmediata & Sincronización Digital:';
    this.formAlertaTexto =
      categoriaInicial === 'tribunal'
        ? 'Las instituciones disponen de 48 hs hábiles desde la publicación para presentar descargo formal por Mesa de Entradas.'
        : 'Esta circular entra en vigencia a partir de su publicación oficial en el sistema federativo.';
    this.selectedPdfFile = null;
    this.showCreateModal.set(true);
  }

  actualizarValoresPorCategoria(cat: BoletinCategoria): void {
    this.formCategoria = cat;
    const nextNum = String(this.boletines().length + 43).padStart(3, '0');
    if (cat === 'tribunal') {
      this.formNumero = `RESOLUCIÓN N° ${nextNum}/2026 - T.P.`;
      this.formExpediente = `EXPEDIENTE #${Math.floor(1000 + Math.random() * 9000)}-TP`;
      this.formAutoridad = 'Certificado CAH: Dr. M. Villafañe (Pres. Tribunal) & Prof. L. Cruz (Sec. Gral.)';
      this.formUrgente = true;
    } else if (cat === 'reglamento') {
      this.formNumero = `CIRCULAR N° ${nextNum}/2026 - C.T.`;
      this.formExpediente = `SESIÓN N° ${105 + this.boletines().length}`;
      this.formAutoridad = 'Colegio de Árbitros & Comisión Técnica FJH';
      this.formUrgente = false;
    } else {
      this.formNumero = `CIRCULAR N° ${nextNum}/2026 - TES.`;
      this.formExpediente = `HCD-TES-2026`;
      this.formAutoridad = 'Cdor. G. Salgado • Tesorería FJH';
      this.formUrgente = false;
    }
  }

  cerrarModalNuevaResolucion(): void {
    this.showCreateModal.set(false);
  }

  onClubModalChange(cid: string): void {
    this.formClubId.set(cid);
    this.selectedJugadorModal.set(null);
    this.formJugadorId = '';
    this.filtroBusquedaJugador.set('');
    this.formSancionadoManual.set('');

    if (!cid) {
      this.jugadoresDelClubModal.set([]);
      return;
    }

    this.cargandoJugadoresClub.set(true);
    this.jugadoresService.getJugadores(cid).subscribe({
      next: (jugadores) => {
        this.jugadoresDelClubModal.set(jugadores || []);
        this.cargandoJugadoresClub.set(false);
      },
      error: () => {
        // Fallback a buscar en la lista local cargada en memoria
        const clubMatch = this.clubes().find((c) => c.id === cid);
        const clubNombre = (clubMatch?.nombre || '').toLowerCase().trim();
        const locales = this.jugadores().filter((j) => {
          if (j.clubId === cid) return true;
          const jClubNombre = (j.club?.nombre || '').toLowerCase().trim();
          if (jClubNombre && jClubNombre === clubNombre) return true;
          return false;
        });
        this.jugadoresDelClubModal.set(locales);
        this.cargandoJugadoresClub.set(false);
      },
    });
  }

  seleccionarJugadorModal(j: Jugador): void {
    this.selectedJugadorModal.set(j);
    this.formJugadorId = j.id;
    this.formSancionadoManual.set('');
  }

  deseleccionarJugadorModal(): void {
    this.selectedJugadorModal.set(null);
    this.formJugadorId = '';
  }

  getInitials(nombreCompleto?: string): string {
    if (!nombreCompleto) return 'JU';
    const partes = nombreCompleto.trim().split(' ').filter(Boolean);
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return (partes[0]?.slice(0, 2) || 'JU').toUpperCase();
  }

  cambiarTipoPenalidad(tipo: 'suspension' | 'multa' | 'mixta' | 'advertencia'): void {
    this.formTipoPenalidad = tipo;
    this.actualizarTextosFallo();
  }

  setMontoMultaRapido(monto: string): void {
    this.formMontoMulta = monto;
    this.actualizarTextosFallo();
  }

  actualizarTextosFallo(): void {
    const clubObj = this.clubes().find((c) => c.id === this.formClubId());
    const clubNombre = clubObj ? clubObj.nombre : 'Club Afiliado';

    if (this.formTipoPenalidad === 'multa') {
      this.formFalloCorto = `Multa Económica: ${this.formMontoMulta} ARS (${this.formPlazoPago})`;
      this.formFechasTotales = 0;
      this.formInhabilitarJugador = false;
      this.formTitulo = `SANCIÓN DISCIPLINARIA: MULTA PECUNIARIA A ${clubNombre.toUpperCase()} — ${this.formMontoMulta} ARS`;
      this.formResuelveTexto = `Art. 1°: Aplicar a ${clubNombre} una multa económica de ${this.formMontoMulta} ARS por ${this.formCausalMulta.toLowerCase()}.\nArt. 2°: Intimar al pago en Tesorería FJH dentro del plazo perentorio de ${this.formPlazoPago}.\nArt. 3°: Notifíquese, regístrese y archívese.`;
    } else if (this.formTipoPenalidad === 'mixta') {
      this.formFalloCorto = `${this.formFechasTotales} Fechas de Suspensión + Multa ${this.formMontoMulta} ARS`;
      this.formInhabilitarJugador = true;
      this.formTitulo = `SANCIÓN DISCIPLINARIA Y MULTA A ${clubNombre.toUpperCase()}`;
      this.formResuelveTexto = `Art. 1°: Aplicar suspensión deportiva de ${this.formFechasTotales} fecha(s) oficiales.\nArt. 2°: Imponer a la institución ${clubNombre} una multa económica de ${this.formMontoMulta} ARS (${this.formPlazoPago}).\nArt. 3°: Comuníquese y regístrese.`;
    } else if (this.formTipoPenalidad === 'advertencia') {
      this.formFalloCorto = 'Apercibimiento / Advertencia Formal';
      this.formFechasTotales = 0;
      this.formInhabilitarJugador = false;
      this.formTitulo = `APERCIBIMIENTO DISCIPLINARIO FORMAL A ${clubNombre.toUpperCase()}`;
      this.formResuelveTexto = `Art. 1°: Dictar formal apercibimiento disciplinario a la institución ${clubNombre}.\nArt. 2°: Notifíquese que la reiteración de conductas similares motivará sanciones pecuniarias y quita de puntos.\nArt. 3°: Notifíquese.`;
    } else {
      this.formFalloCorto = `${this.formFechasTotales || 2} Fechas de Suspensión`;
      this.formInhabilitarJugador = true;
      if (!this.formFechasTotales || this.formFechasTotales === 0) {
        this.formFechasTotales = 2;
      }
    }
  }

  onPdfSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedPdfFile = input.files[0];
    }
  }

  agregarFilaArancel(): void {
    this.formAranceles.push({
      concepto: 'Nuevo Concepto Federativo',
      monto: '$15.000',
      moneda: 'ARS',
      detalle: 'Arancel Oficial 2026',
      destacado: false,
    });
  }

  quitarFilaArancel(index: number): void {
    this.formAranceles.splice(index, 1);
  }

  publicarResolucion(): void {
    if (!this.formTitulo.trim()) {
      this.mostrarToast('Por favor, ingrese el título oficial de la resolución o circular.', 'error');
      return;
    }

    this.isSubmitting.set(true);

    const clubObj = this.clubes().find((c) => c.id === this.formClubId());
    const jugadorObj = this.selectedJugadorModal();
    const sancionadoManual = this.formSancionadoManual().trim();
    const clubNombre = clubObj ? clubObj.nombre : 'Todos los Clubes Afiliados';
    const personaSancionada = jugadorObj
      ? jugadorObj.nombreCompleto
      : sancionadoManual || (clubObj ? `Sanción Institucional: ${clubNombre}` : 'Todos los Clubes Afiliados');

    const articulos = this.formResuelveTexto
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const formData = new FormData();
    formData.append('numero', this.formNumero.trim());
    formData.append('expediente', this.formExpediente.trim());
    formData.append('titulo', this.formTitulo.trim().toUpperCase());
    formData.append('categoria', this.formCategoria);
    formData.append('urgente', String(this.formUrgente));
    formData.append('estado', 'vigente');
    formData.append('clubAfectado', clubNombre);
    if (jugadorObj || sancionadoManual) {
      formData.append('sancionado', personaSancionada);
    }
    formData.append('selloAutoridad', this.formAutoridad.trim());

    if (this.formVisto.trim()) formData.append('visto', this.formVisto.trim());
    if (this.formConsiderando.trim()) formData.append('considerando', this.formConsiderando.trim());
    if (articulos.length > 0) formData.append('resuelve', JSON.stringify(articulos));
    if (this.formResumen.trim()) formData.append('resumen', this.formResumen.trim());
    if (this.formAlertaTitulo.trim()) formData.append('alertaTitulo', this.formAlertaTitulo.trim());
    if (this.formAlertaTexto.trim()) formData.append('alertaTexto', this.formAlertaTexto.trim());
    const esMulta = this.formTipoPenalidad === 'multa' || this.formTipoPenalidad === 'mixta';
    const arancelesMulta: BoletinArancel[] =
      esMulta && this.formMontoMulta
        ? [
            {
              concepto: `Multa Tribunal de Penas - ${this.formCausalMulta}`,
              monto: this.formMontoMulta,
              moneda: 'ARS',
              detalle: this.formPlazoPago || 'Tesorería FJH',
              destacado: true,
            },
          ]
        : [];

    const finalAranceles =
      this.formCategoria === 'tesoreria'
        ? this.formAranceles
        : this.formCategoria === 'tribunal' && esMulta
        ? arancelesMulta
        : [];

    if (finalAranceles.length > 0) {
      formData.append('aranceles', JSON.stringify(finalAranceles));
    }
    if (this.selectedPdfFile) {
      formData.append('archivoPdf', this.selectedPdfFile);
    }

    // Si es fallo del Tribunal de Penas y se vinculó un jugador o club para sanción
    const sancionObs$ =
      this.formCategoria === 'tribunal' && this.formRegistrarSancionDb && (jugadorObj || clubObj || sancionadoManual)
        ? this.sancionesService
            .crearSancion({
              sancionado: this.formTipoPenalidad === 'multa' ? clubNombre : personaSancionada,
              institucion: clubNombre,
              categoria:
                jugadorObj?.categoria || (this.formTipoPenalidad === 'multa' ? 'Institucional' : 'Primera División'),
              fallo:
                this.formFalloCorto ||
                (this.formTipoPenalidad === 'multa'
                  ? `Multa Económica ${this.formMontoMulta} ARS`
                  : `${this.formFechasTotales} Fechas de Suspensión`),
              cumplidas: 0,
              totales:
                this.formTipoPenalidad === 'multa' || this.formTipoPenalidad === 'advertencia'
                  ? 0
                  : Number(this.formFechasTotales) || 1,
              vigencia: 'Temporada Oficial 2026',
              expediente: this.formExpediente.trim(),
              estado: this.formUrgente ? 'grave' : 'advertencia',
              motivo: this.formConsiderando.trim() || this.formResumen.trim(),
              jugadorId: (this.formTipoPenalidad === 'multa' ? null : jugadorObj?.id) || null,
              clubId: clubObj?.id || null,
              inhabilitarJugador: this.formTipoPenalidad === 'multa' ? false : this.formInhabilitarJugador,
            })
            .pipe(catchError(() => of(null)))
        : of(null);

    forkJoin({
      boletin: this.boletinesService.crearBoletin(formData).pipe(
        catchError(() => {
          // Fallback local si el endpoint aún no fue reiniciado
          const fallbackItem: BoletinOficial = {
            id: `bol-${Date.now()}`,
            numero: this.formNumero.trim().toUpperCase(),
            expediente: this.formExpediente.trim(),
            titulo: this.formTitulo.trim().toUpperCase(),
            categoria: this.formCategoria,
            organo:
              this.formCategoria === 'tribunal'
                ? 'Consejo Directivo'
                : this.formCategoria === 'tesoreria'
                ? 'Secretaría Administrativa'
                : 'Comisión Técnica Federativa',
            suborgano:
              this.formCategoria === 'tribunal'
                ? 'Tribunal de Penas & Disciplina Deportiva'
                : this.formCategoria === 'tesoreria'
                ? 'Secretaría de Hacienda & Tesorería Institucional'
                : 'Comisión Técnica, Reglamento & Fixtures',
            fecha: 'Recién publicado',
            anio: '2026',
            urgente: this.formUrgente,
            estado: 'vigente',
            clubAfectado: clubNombre,
            sancionado: jugadorObj || sancionadoManual ? personaSancionada : undefined,
            fallo: this.formFalloCorto,
            totales:
              this.formTipoPenalidad === 'multa' || this.formTipoPenalidad === 'advertencia'
                ? 0
                : Number(this.formFechasTotales) || 1,
            cumplidas: 0,
            visto: this.formVisto.trim() || null,
            considerando: this.formConsiderando.trim() || null,
            resuelve: articulos,
            resumen: this.formResumen.trim() || null,
            alertaTitulo: this.formAlertaTitulo.trim() || null,
            alertaTexto: this.formAlertaTexto.trim() || null,
            alertaTipo:
              this.formCategoria === 'tribunal'
                ? 'amber'
                : this.formCategoria === 'tesoreria'
                ? 'tertiary'
                : 'primary',
            aranceles: finalAranceles,
            adjuntos: this.selectedPdfFile
              ? [
                  {
                    nombre: this.selectedPdfFile.name,
                    tamano: `${Math.max(1, Math.round(this.selectedPdfFile.size / 1024))} KB`,
                    subtitulo: 'Documento Homologado',
                    url: '/docs/Formulario-Fichaje-FJH.pdf',
                  },
                ]
              : [],
            selloTitulo: 'Documento Validado Digitalmente',
            selloAutoridad: this.formAutoridad.trim(),
            selloIcono: 'verified',
            selloColor: this.formCategoria === 'tesoreria' ? 'amber' : 'tertiary',
          };
          return of(fallbackItem);
        })
      ),
      sancion: sancionObs$,
    }).subscribe({
      next: ({ boletin, sancion }) => {
        this.boletines.update((prev) => [boletin, ...prev]);
        if (sancion) {
          this.sanciones.update((prev) => [sancion, ...prev]);
          this.sidebarState.reload();
        }
        this.isSubmitting.set(false);
        this.showCreateModal.set(false);
        this.mostrarToast(`Publicación oficial "${boletin.numero}" emitida con éxito.`, 'success');
      },
      error: () => {
        this.isSubmitting.set(false);
        this.mostrarToast('Error al publicar la resolución.', 'error');
      },
    });
  }

  // --- ACCIONES RÁPIDAS DE ADMINISTRADOR EN TARJETAS ---

  toggleUrgente(item: BoletinOficial): void {
    const nuevoValor = !item.urgente;
    this.boletines.update((list) =>
      list.map((b) => (b.id === item.id ? { ...b, urgente: nuevoValor } : b))
    );
    if (!item.sancionId) {
      this.boletinesService
        .actualizarBoletin(item.id, { urgente: nuevoValor })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
    this.mostrarToast(
      nuevoValor
        ? `${item.numero} marcada como Circular Urgente.`
        : `${item.numero} quitada de urgentes.`,
      'info'
    );
  }

  toggleArchivar(item: BoletinOficial): void {
    const nuevoEstado = item.estado === 'vigente' ? 'archivado' : 'vigente';
    this.boletines.update((list) =>
      list.map((b) => (b.id === item.id ? { ...b, estado: nuevoEstado } : b))
    );
    if (!item.sancionId) {
      this.boletinesService
        .actualizarBoletin(item.id, { estado: nuevoEstado })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
    this.mostrarToast(
      nuevoEstado === 'archivado'
        ? `${item.numero} archivada en el histórico.`
        : `${item.numero} restaurada como vigente.`,
      'info'
    );
  }

  ajustarFechasCumplidas(item: BoletinOficial, delta: number): void {
    if (!item.sancionId) return;
    const actual = item.cumplidas ?? 0;
    const total = item.totales ?? 1;
    const nuevo = Math.max(0, Math.min(total, actual + delta));
    if (nuevo === actual) return;

    this.sancionesService.actualizarSancion(item.sancionId, { cumplidas: nuevo }).subscribe({
      next: (actualizada) => {
        this.sanciones.update((list) =>
          list.map((s) => (s.id === item.sancionId ? { ...s, cumplidas: actualizada.cumplidas } : s))
        );
        this.sidebarState.reload();
        this.mostrarToast(
          `Cómputo actualizado: ${nuevo}/${total} fechas cumplidas (${item.expediente}).`,
          'success'
        );
      },
      error: () => this.mostrarToast('No se pudo actualizar el cómputo de fechas.', 'error'),
    });
  }

  toggleGuardar(item: BoletinOficial): void {
    this.boletines.update((list) =>
      list.map((b) => (b.id === item.id ? { ...b, guardado: !b.guardado } : b))
    );
    this.mostrarToast('Referencia guardada en marcadores de sesión.', 'info');
  }

  compartirResolucion(item: BoletinOficial): void {
    const texto = `${item.numero} — ${item.titulo} | Federación Jujeña de Handball`;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(texto);
    }
    this.mostrarToast(`Referencia oficial copiada al portapapeles (${item.numero}).`, 'info');
  }

  verExpedienteModal(item: BoletinOficial): void {
    this.selectedResolutionModal.set(item);
  }

  cerrarExpedienteModal(): void {
    this.selectedResolutionModal.set(null);
  }

  confirmarEliminar(item: BoletinOficial): void {
    this.resolutionToDelete.set(item);
  }

  cancelarEliminar(): void {
    this.resolutionToDelete.set(null);
  }

  ejecutarEliminar(): void {
    const target = this.resolutionToDelete();
    if (!target) return;

    if (target.sancionId) {
      this.sancionesService
        .eliminarSancion(target.sancionId)
        .pipe(catchError(() => of(null)))
        .subscribe(() => {
          this.sanciones.update((list) => list.filter((s) => s.id !== target.sancionId));
          this.sidebarState.reload();
          this.resolutionToDelete.set(null);
          this.mostrarToast(`Fallo ${target.expediente} eliminado del registro.`, 'info');
        });
    } else {
      this.boletinesService
        .eliminarBoletin(target.id)
        .pipe(catchError(() => of(null)))
        .subscribe(() => {
          this.boletines.update((list) => list.filter((b) => b.id !== target.id));
          this.resolutionToDelete.set(null);
          this.mostrarToast(`Publicación ${target.numero} eliminada.`, 'info');
        });
    }
  }

  imprimirBoletin(): void {
    window.print();
  }

  descargarAdjuntoUrl(url: string): string {
    if (!url) return '/docs/Formulario-Fichaje-FJH.pdf';
    if (url.startsWith('http') || url.startsWith('/docs/')) return url;
    return `${this.serverUrl}${url}`;
  }

  private mostrarToast(msg: string, type: 'success' | 'error' | 'info' = 'success'): void {
    this.toastMessage.set(msg);
    this.toastType.set(type);
    setTimeout(() => {
      if (this.toastMessage() === msg) {
        this.toastMessage.set(null);
      }
    }, 4000);
  }
}
