import { Component, signal } from '@angular/core';

interface Match {
  competition: string;
  status: string;
  statusTone: 'live' | 'scheduled' | 'finished';
  home: string;
  away: string;
  homeInitial: string;
  awayInitial: string;
  score: string;
  venue: string;
  detail: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly menuOpen = signal(false);
  protected readonly activeFilter = signal('Primera Masc');
  protected readonly activeGender = signal('Masc');

  protected readonly matches: readonly Match[] = [
    {
      competition: 'Apertura • 1° Div Masculino',
      status: "2T 22'",
      statusTone: 'live',
      home: 'CIAF Jujuy',
      away: 'Minas HC',
      homeInitial: 'C',
      awayInitial: 'M',
      score: '26:24',
      venue: 'Estadio Federación de Básquet',
      detail: 'Árbitro: C. Tolaba / M. Jerez',
    },
    {
      competition: 'Apertura • 1° Div Masculino',
      status: 'Hoy 20:30 hs',
      statusTone: 'scheduled',
      home: 'Lavalle HC',
      away: 'San Salvador HC',
      homeInitial: 'L',
      awayInitial: 'S',
      score: 'VS',
      venue: 'Club Atlético Gorriti - Cancha 1',
      detail: 'Árbitro: F. Ramos / G. Benítez',
    },
    {
      competition: 'Apertura • 1° Div Masculino',
      status: 'Finalizado',
      statusTone: 'finished',
      home: 'Defensores',
      away: 'Tiro y Gimnasia',
      homeInitial: 'D',
      awayInitial: 'T',
      score: '19:23',
      venue: 'Complejo Deportivo San Pedro',
      detail: 'Planilla cerrada y firmada',
    },
  ];

  protected readonly galleryItems = [
    {
      label: 'Torneo Apertura',
      date: '18 Mayo, 2025',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCKr062kwRRxRQSlLayP-ELMnthIrLnHQ_p2DFCWlx_5DKMEZOf-Er6IbFbXyo_UzQxvybTwlQ07K3DeTLAq8U2LzKO7ZIACa2JbO4-gTXYxzie7-gqFtf5Ho-sc0nDohZP-Nz9hoTyQlJRtbOhUnxYgKIm4FyiJY8Vmxwkl3JceTai6fXm6pjT_XeFgKoc8sVoO3lr6K3NjWUKlKm0_3DOBGGJrrEeKhQEuBh22jyruzSbYtw5f0Y9xQ',
    },
    {
      label: 'Selecciones FJH',
      date: '14 Mayo, 2025',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDeM49TJggaKKIX4b9l1YTZqEmz3hNKSyjCOhh0TCYBFOkPB593gKIsEhF0Jg0V7qDEihmdn90tIxdqgZa4_cZgS49cSpyLVVvNbVGLHwYpFYLHqNJpgiAyRfgcNLdjWtHKvByGF0ATtOc0qJxaIuOYN3TBTlokfquLd7qTeofCTJCdjAb9VySERji7lYvczpti8wr4pjneFZNxf0hvCYH7o3V4R5ZEipSH7ArEu1vMGbQMX7PrmM-uHg',
    },
    {
      label: 'Handball Jujeño',
      date: '10 Mayo, 2025',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC_Uc7m-VfEPjkg-WuQYv7TFkCizYGlpCDSchPdxg2W3eTzUGdQfsaY5J-NSchXcE0NcA6AdL0c-apGjkHi8nq1cO44XFfOJia7gdAyvP9Fhv4mXt_HR3BfYJoIpHAi-mmAZ7E9ttjIbtPxvps2apROthKI_z13zrg_9C4kCWQ9VKcKehBSSjoYuRoBls_xdtp5j0hKZjdPEa3JS26SNHZbV8oO3Pu20MuUtawlWnX642zAfkme2mHVUA',
    },
  ];

  protected readonly sponsors = [
    { name: 'Kempa', image: '/img/sponsors/kempa.webp', light: false },
    { name: 'Waxola', image: '/img/sponsors/WAXOLA.png', light: false },
    { name: 'Consultorio', image: '/img/sponsors/Consultorio.jpeg', light: false },
    { name: 'YPF', image: '/img/sponsors/ypf.png', light: false },
    { name: 'Gran Monarca', image: '/img/sponsors/granmonarca.png', light: true },
    { name: 'Sushi Express', image: '/img/sponsors/sushiExpress.jpeg', light: false },
    { name: 'Muebles Norteñita', image: '/img/sponsors/muebles.png', light: true },
  ];

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }
  protected selectFilter(filter: string): void {
    this.activeFilter.set(filter);
  }
  protected selectGender(gender: string): void {
    this.activeGender.set(gender);
  }
}
