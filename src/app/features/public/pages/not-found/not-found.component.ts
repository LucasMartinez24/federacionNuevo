import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterModule],
  template: `
    <main class="min-h-screen bg-court-base text-text-primary flex items-center justify-center p-6">
      <section class="max-w-lg w-full text-center bg-court-card border border-white/10 rounded-2xl p-8 shadow-2xl">
        <span class="material-symbols-outlined text-6xl text-primary">route</span>
        <p class="mt-4 text-xs uppercase tracking-[0.25em] text-primary font-bold">Error 404</p>
        <h1 class="mt-2 text-2xl font-bold">Página no disponible</h1>
        <p class="mt-3 text-sm text-text-secondary">
          Esta sección todavía no cuenta con una funcionalidad habilitada.
        </p>
        <a routerLink="/" class="inline-flex mt-6 px-4 py-2 rounded-xl bg-primary text-court-base font-bold text-sm">
          Volver al inicio
        </a>
      </section>
    </main>
  `,
})
export class NotFoundComponent {}
