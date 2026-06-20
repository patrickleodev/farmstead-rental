import { HttpInterceptorFn } from '@angular/common/http';

const accessTokenKey = 'farmstead-rental.access-token';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = localStorage.getItem(accessTokenKey);
  if (!token || request.url.includes('/api/auth/config') || request.url.includes('/api/auth/google')) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
