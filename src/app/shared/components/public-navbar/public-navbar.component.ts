import { CommonModule } from '@angular/common';
import { Component, computed, HostListener, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

export type PublicNavPage = 'inicio' | 'torneos' | 'fixture' | 'posiciones' | 'calendario' | 'goleadores' | 'galeria';

@Component({
  selector: 'app-public-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="public-nav-header">
      <div class="public-nav-inner">
        <!-- Identidad Institucional FJH -->
        <a class="public-nav-brand" routerLink="/" (click)="closeMenu()" aria-label="Federación Jujeña de Handball">
          <div class="brand-logo-wrap">
            <img src="/img/logo.png" alt="Logo FJH" />
          </div>
          <div class="brand-text">
            <strong>Federación Jujeña de Handball</strong>
            <small><span class="pulse-dot"></span> FJH · Afiliada a la CAH</small>
          </div>
        </a>

        <!-- Navegación Principal Desktop -->
        <nav class="public-nav-links" aria-label="Navegación pública principal">
          <a
            routerLink="/"
            [class.active]="activePage() === 'inicio' && activeSection() === 'inicio'"
            (click)="onInicioClick($event)">
            Inicio
          </a>
          <a
            href="#competencias"
            [class.active]="activeSection() === 'competencias'"
            (click)="scrollToSection($event, 'competencias')">
            Torneos
          </a>
          <a
            routerLink="/fixture"
            [class.active]="activePage() === 'fixture'">
            Fixture &amp; Resultados
          </a>
          <a
            routerLink="/fixture"
            [queryParams]="{ tab: 'posiciones' }"
            [class.active]="activePage() === 'posiciones'">
            Posiciones
          </a>
          <a
            routerLink="/calendario"
            [class.active]="activePage() === 'calendario'">
            Calendario
          </a>
          <a
            href="#goleadores"
            [class.active]="activeSection() === 'goleadores'"
            (click)="scrollToSection($event, 'goleadores')">
            Goleadores
          </a>
          <a
            routerLink="/galeria"
            [class.active]="activePage() === 'galeria'">
            Galería
          </a>
        </nav>

        <!-- Acciones Institucionales + Botón Menú Responsivo -->
        <div class="public-nav-actions">
          @if (isAuthenticated()) {
            <a [routerLink]="portalRoute()" class="institutional-cta authenticated">
              <span class="material-symbols-outlined">{{ isClub() ? 'shield' : 'admin_panel_settings' }}</span>
              <span>{{ portalLabel() }}</span>
            </a>
          } @else {
            <a routerLink="/login" class="institutional-cta">
              <span class="material-symbols-outlined">sports_handball</span>
              <span>Panel Institucional</span>
            </a>
          }

          <button
            type="button"
            class="mobile-menu-trigger"
            [class.is-open]="menuOpen()"
            (click)="toggleMenu()"
            [attr.aria-expanded]="menuOpen()"
            [attr.aria-label]="menuOpen() ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'">
            <span class="material-symbols-outlined">{{ menuOpen() ? 'close' : 'menu' }}</span>
          </button>
        </div>
      </div>

      <!-- Menú Desplegable Responsivo (Tablet & Móvil) -->
      @if (menuOpen()) {
        <div class="mobile-drawer-backdrop" (click)="closeMenu()"></div>
        <nav class="mobile-drawer" aria-label="Menú móvil">
          <div class="mobile-drawer-grid">
            <a
              routerLink="/"
              [class.active]="activePage() === 'inicio' && activeSection() === 'inicio'"
              (click)="onInicioClick($event)">
              <span class="material-symbols-outlined">home</span>
              <div>
                <strong>Inicio</strong>
                <small>Portada oficial FJH</small>
              </div>
            </a>

            <a
              href="#competencias"
              [class.active]="activeSection() === 'competencias'"
              (click)="scrollToSection($event, 'competencias')">
              <span class="material-symbols-outlined">emoji_events</span>
              <div>
                <strong>Torneos &amp; En Vivo</strong>
                <small>Match Center provincial</small>
              </div>
            </a>

            <a
              routerLink="/fixture"
              [class.active]="activePage() === 'fixture'"
              (click)="closeMenu()">
              <span class="material-symbols-outlined">scoreboard</span>
              <div>
                <strong>Fixture &amp; Resultados</strong>
                <small>Programación y planillas</small>
              </div>
            </a>

            <a
              routerLink="/fixture"
              [queryParams]="{ tab: 'posiciones' }"
              [class.active]="activePage() === 'posiciones'"
              (click)="closeMenu()">
              <span class="material-symbols-outlined">leaderboard</span>
              <div>
                <strong>Tabla de Posiciones</strong>
                <small>Clasificación por categoría</small>
              </div>
            </a>

            <a
              routerLink="/calendario"
              [class.active]="activePage() === 'calendario'"
              (click)="closeMenu()">
              <span class="material-symbols-outlined">calendar_month</span>
              <div>
                <strong>Calendario Oficial</strong>
                <small>Agenda anual y sedes</small>
              </div>
            </a>

            <a
              href="#goleadores"
              [class.active]="activeSection() === 'goleadores'"
              (click)="scrollToSection($event, 'goleadores')">
              <span class="material-symbols-outlined">military_tech</span>
              <div>
                <strong>Top Goleadores</strong>
                <small>Estadísticas por torneo y global</small>
              </div>
            </a>

            <a
              routerLink="/galeria"
              [class.active]="activePage() === 'galeria'"
              (click)="closeMenu()">
              <span class="material-symbols-outlined">photo_library</span>
              <div>
                <strong>Galería Oficial</strong>
                <small>Cobertura visual y álbumes</small>
              </div>
            </a>
          </div>

          <div class="mobile-drawer-footer">
            @if (isAuthenticated()) {
              <a [routerLink]="portalRoute()" class="mobile-cta authenticated" (click)="closeMenu()">
                <span class="material-symbols-outlined">{{ isClub() ? 'shield' : 'admin_panel_settings' }}</span>
                <span>Ir a {{ portalLabel() }}</span>
              </a>
            } @else {
              <a routerLink="/login" class="mobile-cta" (click)="closeMenu()">
                <span class="material-symbols-outlined">sports_handball</span>
                <span>Ingresar al Panel Institucional</span>
              </a>
            }
          </div>
        </nav>
      }
    </header>
  `,
  styles: [`
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 100;
      width: 100%;
    }

    .public-nav-header {
      position: relative;
      background: rgba(8, 14, 24, 0.94);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
    }

    .public-nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      max-width: 1280px;
      height: 76px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Brand */
    .public-nav-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: #f8fafc;
      flex-shrink: 0;
      min-width: 0;
    }

    .brand-logo-wrap {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    .brand-logo-wrap img {
      width: 44px;
      height: 44px;
      object-fit: contain;
      filter: drop-shadow(0 2px 8px rgba(56, 189, 248, 0.3));
      transition: transform 0.2s ease;
    }

    .public-nav-brand:hover .brand-logo-wrap img {
      transform: scale(1.04);
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .brand-text strong {
      font-size: 15px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.02em;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .brand-text small {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 3px;
      color: #38bdf8;
      font-size: 9.5px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .pulse-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: #f43f5e;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(244, 63, 94, 0.8);
    }

    /* Desktop Navigation Links */
    .public-nav-links {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px;
      background: rgba(19, 29, 46, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 12px;
    }

    .public-nav-links a {
      padding: 7px 11px;
      color: #94a3b8;
      border: 1px solid transparent;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      transition: all 0.18s ease;
    }

    .public-nav-links a:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.05);
    }

    .public-nav-links a.active {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.13);
      border-color: rgba(56, 189, 248, 0.32);
      font-weight: 700;
    }

    /* Right Actions */
    .public-nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .institutional-cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 9px 14px;
      color: #ffffff;
      background: #f43f5e;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      text-decoration: none;
      white-space: nowrap;
      box-shadow: 0 0 18px rgba(244, 63, 94, 0.28);
      transition: all 0.2s ease;
    }

    .institutional-cta:hover {
      background: #e11d48;
      transform: translateY(-1px);
      box-shadow: 0 4px 22px rgba(244, 63, 94, 0.4);
    }

    .institutional-cta.authenticated {
      background: linear-gradient(135deg, #0284c7, #0f385a);
      border-color: rgba(56, 189, 248, 0.35);
      box-shadow: 0 0 18px rgba(2, 132, 199, 0.3);
    }

    .institutional-cta.authenticated:hover {
      filter: brightness(1.1);
    }

    .institutional-cta .material-symbols-outlined {
      font-size: 17px;
    }

    /* Mobile Hamburger Button */
    .mobile-menu-trigger {
      display: none;
      place-items: center;
      width: 40px;
      height: 40px;
      color: #38bdf8;
      background: #131d2e;
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .mobile-menu-trigger:hover,
    .mobile-menu-trigger.is-open {
      color: #ffffff;
      background: rgba(56, 189, 248, 0.18);
      border-color: rgba(56, 189, 248, 0.45);
    }

    .mobile-menu-trigger .material-symbols-outlined {
      font-size: 22px;
    }

    /* Mobile & Tablet Drawer */
    .mobile-drawer-backdrop {
      position: fixed;
      inset: 76px 0 0 0;
      background: rgba(4, 8, 15, 0.65);
      backdrop-filter: blur(4px);
      z-index: 90;
      animation: fadeIn 0.18s ease;
    }

    .mobile-drawer {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 95;
      background: #0b1322;
      border-bottom: 1px solid rgba(56, 189, 248, 0.2);
      padding: 16px 20px 20px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .mobile-drawer-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      max-width: 1280px;
      margin: 0 auto;
    }

    .mobile-drawer-grid a {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 14px;
      background: rgba(19, 29, 46, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 11px;
      color: #cbd5e1;
      text-decoration: none;
      transition: all 0.18s ease;
    }

    .mobile-drawer-grid a:hover,
    .mobile-drawer-grid a.active {
      color: #ffffff;
      background: rgba(56, 189, 248, 0.12);
      border-color: rgba(56, 189, 248, 0.35);
    }

    .mobile-drawer-grid a .material-symbols-outlined {
      font-size: 20px;
      color: #38bdf8;
      flex-shrink: 0;
    }

    .mobile-drawer-grid a.active .material-symbols-outlined {
      color: #f43f5e;
    }

    .mobile-drawer-grid a div {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .mobile-drawer-grid a strong {
      font-size: 12.5px;
      font-weight: 700;
      color: #f8fafc;
      line-height: 1.2;
    }

    .mobile-drawer-grid a small {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-drawer-footer {
      max-width: 1280px;
      margin: 12px auto 0;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .mobile-cta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 12px 16px;
      background: #f43f5e;
      color: #ffffff;
      border-radius: 11px;
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
      box-shadow: 0 4px 18px rgba(244, 63, 94, 0.3);
    }

    .mobile-cta.authenticated {
      background: linear-gradient(135deg, #0284c7, #0f385a);
      border: 1px solid rgba(56, 189, 248, 0.35);
    }

    /* Responsive Breakpoints */
    @media (max-width: 1150px) {
      .public-nav-links {
        display: none;
      }

      .mobile-menu-trigger {
        display: grid;
      }
    }

    @media (max-width: 650px) {
      .public-nav-inner {
        height: 66px;
        padding: 0 14px;
      }

      .brand-logo-wrap,
      .brand-logo-wrap img {
        width: 38px;
        height: 38px;
      }

      .brand-text strong {
        font-size: 13px;
      }

      .brand-text small {
        font-size: 8.5px;
      }

      .institutional-cta {
        display: none;
      }

      .mobile-drawer-backdrop {
        inset: 66px 0 0 0;
      }

      .mobile-drawer {
        padding: 12px 14px 16px;
      }

      .mobile-drawer-grid {
        grid-template-columns: 1fr;
        gap: 6px;
      }
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `],
})
export class PublicNavbarComponent {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);

  readonly activePage = input<PublicNavPage>('inicio');
  protected readonly menuOpen = signal(false);
  protected readonly activeSection = signal<'inicio' | 'competencias' | 'goleadores'>('inicio');

  protected readonly isAuthenticated = computed(() => this.authService.isAuthenticated());
  protected readonly isClub = computed(() => this.authService.isClub());

  protected readonly portalRoute = computed(() => {
    if (this.authService.isClub()) return '/club/fixture';
    if (this.authService.isCM()) return '/admin/galeria';
    return '/admin/torneos';
  });

  protected readonly portalLabel = computed(() => {
    if (this.authService.isClub()) return 'Portal Mi Club';
    if (this.authService.isCM()) return 'Panel Galería';
    return 'Panel Federación';
  });

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 1150 && this.menuOpen()) {
      this.menuOpen.set(false);
    }
  }

  protected onInicioClick(event: Event): void {
    this.closeMenu();
    this.activeSection.set('inicio');
    if (this.activePage() === 'inicio') {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected scrollToSection(event: Event, sectionId: 'competencias' | 'goleadores'): void {
    event.preventDefault();
    this.closeMenu();
    this.activeSection.set(sectionId);

    if (this.activePage() === 'inicio') {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      this.router.navigate(['/']).then(() => {
        setTimeout(() => {
          const el = document.getElementById(sectionId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      });
    }
  }
}
