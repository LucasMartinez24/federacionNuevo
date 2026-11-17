import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/services/auth.service';
import { FotoGaleria, GaleriaService } from '../../../../core/services/galeria.service';

@Component({
  selector: 'app-galeria-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './galeria-admin.component.html',
  styleUrl: './galeria-admin.component.css',
})
export class GaleriaAdminComponent {
  private readonly galeriaService = inject(GaleriaService);
  protected readonly authService = inject(AuthService);
  protected readonly serverUrl = environment.serverUrl;

  // Estado
  protected readonly loading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly photos = signal<FotoGaleria[]>([]);
  protected readonly selectedCategory = signal<string>('Todas');
  protected readonly searchQuery = signal<string>('');

  // Formulario de Subida
  protected readonly showUploadModal = signal(false);
  protected uploadTitulo = '';
  protected uploadCategoria = 'Torneo Oficial';
  protected selectedFiles: File[] = [];
  protected filePreviews: string[] = [];

  // Modal Vista Previa (Lightbox)
  protected readonly previewPhoto = signal<FotoGaleria | null>(null);

  // Modal Confirmación Eliminar
  protected readonly photoToDelete = signal<FotoGaleria | null>(null);
  protected readonly isDeleting = signal(false);

  // Feedback Toast
  protected readonly feedback = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Categorías fijas y dinámicas
  protected readonly standardCategories = [
    'Torneo Oficial',
    'Selección Jujeña',
    'Primera División',
    'Formativas',
    'Arbitraje & Clínicas',
    'Institucional',
  ];

  protected readonly categories = computed(() => {
    const set = new Set<string>();
    set.add('Todas');
    for (const c of this.standardCategories) set.add(c);
    for (const p of this.photos()) {
      if (p.categoria) set.add(p.categoria);
    }
    return Array.from(set);
  });

  // Fotos Filtradas
  protected readonly filteredPhotos = computed(() => {
    const cat = this.selectedCategory();
    const query = this.searchQuery().trim().toLowerCase();
    let list = this.photos();

    if (cat !== 'Todas') {
      list = list.filter((p) => p.categoria?.toLowerCase() === cat.toLowerCase());
    }

    if (query) {
      list = list.filter(
        (p) =>
          p.titulo?.toLowerCase().includes(query) ||
          p.categoria?.toLowerCase().includes(query)
      );
    }

    return list;
  });

  constructor() {
    this.cargarFotos();
  }

  cargarFotos(): void {
    this.loading.set(true);
    this.galeriaService.getFotos().subscribe({
      next: (photos) => {
        this.photos.set(photos);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('error', 'Error al sincronizar álbum de fotos.');
      },
    });
  }

  photoUrl(photo: FotoGaleria): string {
    if (!photo || !photo.url) return '';
    return photo.url.startsWith('http') ? photo.url : `${this.serverUrl}${photo.url}`;
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFiles = Array.from(input.files);
      this.filePreviews = [];
      for (const file of this.selectedFiles) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            this.filePreviews.push(e.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    }
  }

  removeSelectedFile(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.filePreviews.splice(index, 1);
  }

  abrirUploadModal(): void {
    this.uploadTitulo = '';
    this.uploadCategoria = 'Torneo Oficial';
    this.selectedFiles = [];
    this.filePreviews = [];
    this.showUploadModal.set(true);
  }

  cerrarUploadModal(): void {
    this.showUploadModal.set(false);
    this.selectedFiles = [];
    this.filePreviews = [];
  }

  subirFotos(): void {
    if (this.selectedFiles.length === 0) {
      this.showToast('error', 'Selecciona al menos una fotografía para subir.');
      return;
    }

    this.uploading.set(true);
    const formData = new FormData();
    formData.append('titulo', this.uploadTitulo || 'Jornada Oficial FJH');
    formData.append('categoria', this.uploadCategoria || 'General');

    for (const file of this.selectedFiles) {
      formData.append('fotos', file);
    }

    this.galeriaService.subirFotos(formData).subscribe({
      next: (res) => {
        this.uploading.set(false);
        this.cerrarUploadModal();
        this.showToast('success', `${res.cantidad || this.selectedFiles.length} foto(s) publicadas con éxito.`);
        this.cargarFotos();
      },
      error: () => {
        this.uploading.set(false);
        this.showToast('error', 'Error al procesar la subida en el servidor.');
      },
    });
  }

  confirmarEliminacion(photo: FotoGaleria): void {
    this.photoToDelete.set(photo);
  }

  cancelarEliminacion(): void {
    this.photoToDelete.set(null);
  }

  ejecutarEliminacion(): void {
    const foto = this.photoToDelete();
    if (!foto) return;

    this.isDeleting.set(true);
    this.galeriaService.eliminarFoto(foto.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.photoToDelete.set(null);
        this.showToast('success', 'Fotografía eliminada del archivo oficial.');
        this.photos.update((list) => list.filter((p) => p.id !== foto.id));
      },
      error: () => {
        this.isDeleting.set(false);
        this.showToast('error', 'No se pudo eliminar la imagen.');
      },
    });
  }

  abrirLightbox(photo: FotoGaleria): void {
    this.previewPhoto.set(photo);
  }

  cerrarLightbox(): void {
    this.previewPhoto.set(null);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.feedback.set({ type, message });
    setTimeout(() => {
      this.feedback.set(null);
    }, 4000);
  }
}

