import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import localePt from '@angular/common/locales/pt';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { authInterceptor } from './auth.interceptor';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideIonicAngular(),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
  ],
};
