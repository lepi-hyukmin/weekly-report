import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  { path: '', redirectTo: 'report', pathMatch: 'full' },
  {
    path: 'report',
    loadComponent: () =>
      import('./pages/report/report.page').then((m) => m.ReportPage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
];
