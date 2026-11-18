import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { FotoGaleria, GaleriaService } from '../../../../core/services/galeria.service';
import { PublicNavbarComponent } from '../../../../shared/components/public-navbar/public-navbar.component';

@Component({
  selector: 'app-galeria',
  standalone: true,
  imports: [CommonModule, PublicNavbarComponent],
  template: `
    <div class="gallery-page">
      <!-- Header Público Oficial Unificado -->
      <app-public-navbar activePage="galeria"></app-public-navbar>

      <!-- Hero Section -->
      <section class="gallery-hero">
        <div class="hero-glow"></div>
        <span class="gallery-kicker">
          <span class="material-symbols-outlined">photo_camera</span> Memoria Visual FJH
        </span>
        <h1>Momentos &amp; Pasión<br /><em>del Handball Jujeño</em></h1>
        <p>Reviví las mejores postales de nuestros torneos oficiales, seleccionados provinciales, formativas y clínicas deportivas avaladas por CAH.</p>
      </section>

      <!-- Contenido Principal -->
      <section class="gallery-content">
        <!-- Píldoras de Filtro -->
        <nav class="gallery-filters" aria-label="Filtrar galería">
          @for (category of categories(); track category) {
            <button type="button" [class.active]="selectedCategory() === category"
              (click)="selectCategory(category)">{{ category }}</button>
          }
        </nav>

        <!-- Grilla de Fotos -->
        @if (loading()) {
          <div class="gallery-state">
            <div class="spinner"></div>
            <span>Cargando momentos destacados de la Federación...</span>
          </div>
        } @else if (filteredPhotos().length) {
          <div class="gallery-grid">
            @for (photo of filteredPhotos(); track photo.id) {
              <article class="gallery-card" (click)="abrirLightbox(photo)">
                <img [src]="photoUrl(photo)" [alt]="photo.titulo || 'Foto FJH'" loading="lazy" />
                <div class="gallery-caption">
                  <span class="caption-cat">{{ photo.categoria || 'General' }}</span>
                  <strong class="caption-title">{{ photo.titulo || 'Jornada FJH' }}</strong>
                  <span class="caption-date">{{ photo.createdAt ? (photo.createdAt | date:'dd/MM/yyyy') : 'Oficial' }}</span>
                </div>
                <div class="zoom-pill">
                  <span class="material-symbols-outlined">zoom_in</span>
                </div>
              </article>
            }
          </div>
        } @else {
          <div class="gallery-empty">
            <span class="material-symbols-outlined">no_photography</span>
            <p>Todavía no hay fotos publicadas en esta categoría.</p>
          </div>
        }
      </section>

      <!-- Modal Lightbox (Visualización en alta resolución) -->
      @if (lightboxPhoto(); as p) {
        <div class="lightbox-backdrop" (click)="cerrarLightbox()">
          <div class="lightbox-modal" (click)="$event.stopPropagation()">
            <button type="button" class="lightbox-close" (click)="cerrarLightbox()">
              <span class="material-symbols-outlined">close</span>
            </button>
            <img [src]="photoUrl(p)" [alt]="p.titulo || 'Foto FJH'" />
            <div class="lightbox-info">
              <span>{{ p.categoria || 'General' }}</span>
              <h3>{{ p.titulo || 'Jornada FJH' }}</h3>
            </div>
          </div>
        </div>
      }

      <!-- Footer Institucional -->
      <footer class="w-full max-w-7xl mx-auto px-6 py-6 mt-12 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
        <span>© 2026 Federación Jujeña de Handball (FJH). Todos los derechos reservados.</span>
        <span>Desarrollado por <strong class="text-sky-400">REC Technologies</strong></span>
      </footer>
    </div>
  `,
  styleUrl: './galeria.component.css',
})
export class GaleriaComponent {
  private readonly galeriaService = inject(GaleriaService);
  protected readonly loading = signal(true);
  protected readonly photos = signal<FotoGaleria[]>([]);
  protected readonly selectedCategory = signal('Todas');
  protected readonly lightboxPhoto = signal<FotoGaleria | null>(null);

  protected readonly categories = computed(() => [
    'Todas',
    ...new Set(this.photos().map((photo) => photo.categoria).filter((category): category is string => !!category)),
  ]);

  protected readonly filteredPhotos = computed(() => {
    const category = this.selectedCategory();
    return category === 'Todas' ? this.photos() : this.photos().filter((photo) => photo.categoria === category);
  });

  constructor() {
    this.galeriaService.getFotos().subscribe({
      next: (photos) => {
        this.photos.set(photos);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected photoUrl(photo: FotoGaleria): string {
    return photo.url.startsWith('http') ? photo.url : `${environment.serverUrl}${photo.url}`;
  }

  protected abrirLightbox(photo: FotoGaleria): void {
    this.lightboxPhoto.set(photo);
  }

  protected cerrarLightbox(): void {
    this.lightboxPhoto.set(null);
  }
}
