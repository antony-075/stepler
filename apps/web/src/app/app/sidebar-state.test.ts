import { describe, expect, it } from 'vitest';
import { isSidebarCollapsed, sidebarCookie } from './sidebar-state';

describe('sidebar state', () => {
  it('is expanded unless the cookie says collapsed', () => {
    expect(isSidebarCollapsed('collapsed')).toBe(true);
    expect(isSidebarCollapsed('expanded')).toBe(false);
    expect(isSidebarCollapsed(undefined)).toBe(false);
    expect(isSidebarCollapsed('anything')).toBe(false);
  });

  it('writes a year-long, site-wide, lax cookie, secure on https', () => {
    expect(sidebarCookie(true, { secure: false })).toBe(
      'st_sidebar=collapsed; max-age=31536000; path=/; samesite=lax',
    );
    expect(sidebarCookie(false, { secure: true })).toBe(
      'st_sidebar=expanded; max-age=31536000; path=/; samesite=lax; secure',
    );
  });
});
