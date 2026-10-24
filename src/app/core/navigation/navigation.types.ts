export type UserRole =
  | 'admin'
  | 'REP_FEDERACION'
  | 'CM'
  | 'user'
  | 'OFICIAL_MESA'
  | 'JEFE_ARBITROS'
  | 'ARBITRO';

export type NavigationAudience = 'public' | 'authenticated';
export type NavigationBadgeTone = 'live' | 'info' | 'warning' | 'accent';

export interface NavigationItem {
  label: string;
  route: string;
  icon: string;
  roles?: readonly UserRole[];
  badge?: string;
  badgeTone?: NavigationBadgeTone;
  children?: readonly NavigationItem[];
}

export interface NavigationGroup {
  label: string;
  items: readonly NavigationItem[];
  audience?: NavigationAudience;
}
