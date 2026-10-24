import { Injectable } from '@angular/core';

import { authenticatedNavigation, publicNavigation } from './navigation.config';
import { NavigationGroup, NavigationItem, UserRole } from './navigation.types';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  getPublicNavigation(): readonly NavigationGroup[] {
    return publicNavigation;
  }

  getNavigationForRole(role: UserRole): readonly NavigationGroup[] {
    return authenticatedNavigation
      .map((group) => ({
        ...group,
        items: this.filterItems(group.items, role),
      }))
      .filter((group) => group.items.length > 0);
  }

  private filterItems(items: readonly NavigationItem[], role: UserRole): NavigationItem[] {
    return items
      .filter((item) => !item.roles || item.roles.includes(role))
      .map((item) => ({
        ...item,
        children: item.children ? this.filterItems(item.children, role) : undefined,
      }))
      .filter((item) => !item.children || item.children.length > 0);
  }
}
