import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, HostBinding, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { IonApp, IonContent } from '@ionic/angular/standalone';
import { Socket, io } from 'socket.io-client';

import { environment } from '../environments/environment';

type CalendarEntryStatus = 'booked' | 'blocked';
type BookingStatus = 'inquiry' | 'deposit_pending' | 'confirmed' | 'completed';
type ManagementView = 'dashboard' | 'calendar' | 'chat';
type DevTheme = 'system' | 'light' | 'dark';

type AuthUser = {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
};

type GoogleLoginResponse = {
  token: string;
  user: AuthUser;
};

type AuditLog = {
  id: number;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
};

type CalendarEntry = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  status: CalendarEntryStatus;
  bookingStatus: BookingStatus;
  notes: string | null;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
};

type CalendarDay = {
  date: string;
  day: number;
  weekday: number;
  isToday: boolean;
  entry?: CalendarEntry;
  entryStart?: boolean;
  entryMiddle?: boolean;
  entryEnd?: boolean;
  entrySingle?: boolean;
};

type CalendarChangedEvent = {
  action: 'created' | 'updated' | 'removed';
  entryId: number;
  changedAt: string;
};

type MockCalendarEntrySeed = {
  title: string;
  startOffset: number;
  endOffset: number;
  status: CalendarEntryStatus;
  bookingStatus?: BookingStatus;
  notes?: string | null;
  totalAmount?: number;
  depositAmount?: number;
  paidAmount?: number;
};

type ChatMessage = {
  id: number;
  author: string;
  content: string;
  createdAt: string;
};

type ServerToClientEvents = {
  'calendar:changed': (event: CalendarChangedEvent) => void;
  'chat:message': (message: ChatMessage) => void;
};

type GoogleCredentialResponse = {
  credential: string;
};

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: { theme: string; size: string; text: string; width: number },
      ) => void;
    };
  };
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const buildMockCalendarEntries = (month: Date): CalendarEntry[] => {
  const baseDate = new Date(month.getFullYear(), month.getMonth(), 1);
  const seeds: MockCalendarEntrySeed[] = [
    {
      title: 'Família Silva',
      startOffset: 2,
      endOffset: 6,
      status: 'booked',
      bookingStatus: 'confirmed',
      notes: 'Estadia de final de semana longa.',
      totalAmount: 2850,
      depositAmount: 850,
      paidAmount: 850,
    },
    {
      title: 'Bloqueio piscina',
      startOffset: 11,
      endOffset: 13,
      status: 'blocked',
      notes: 'Manutenção e limpeza da área externa.',
    },
    {
      title: 'Casal Martins',
      startOffset: 17,
      endOffset: 19,
      status: 'booked',
      bookingStatus: 'deposit_pending',
      notes: 'Aguardando confirmação do sinal.',
      totalAmount: 1680,
      depositAmount: 500,
      paidAmount: 250,
    },
    {
      title: 'Aniversário da família Costa',
      startOffset: 24,
      endOffset: 27,
      status: 'booked',
      bookingStatus: 'inquiry',
      notes: 'Reserva para confraternização de aniversário.',
      totalAmount: 4200,
      depositAmount: 1200,
      paidAmount: 0,
    },
  ];

  return seeds.map((seed, index) => {
    const startDate = formatDate(addDays(baseDate, seed.startOffset));
    const endDate = formatDate(addDays(baseDate, seed.endOffset));

    return {
      id: index + 1,
      title: seed.title,
      startDate,
      endDate,
      status: seed.status,
      bookingStatus: seed.bookingStatus ?? 'inquiry',
      notes: seed.notes ?? null,
      totalAmount: seed.totalAmount ?? 0,
      depositAmount: seed.depositAmount ?? 0,
      paidAmount: seed.paidAmount ?? 0,
    };
  });
};

@Component({
  selector: 'app-root',
  imports: [CurrencyPipe, DatePipe, FormsModule, IonApp, IonContent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly apiUrl = environment.apiUrl;
  private readonly socket = this.createRealtimeSocket();
  private readonly accessTokenKey = 'farmstead-rental.access-token';
  private readonly devThemeStorageKey = 'farmstead-rental.dev-theme';
  private workspaceStarted = false;
  private realtimeBound = false;
  private nativeGoogleInitialized = false;

  protected readonly currentPath = signal(this.getCurrentPath());
  protected readonly isNativePlatform = Capacitor.isNativePlatform();
  protected readonly month = signal(this.firstDayOfMonth(new Date()));
  protected readonly activeView = signal<ManagementView>('dashboard');
  protected readonly entries = signal<CalendarEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly realtimeConnected = signal(false);
  protected readonly editingEntryId = signal<number | null>(null);
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly chatLoading = signal(false);
  protected readonly chatSending = signal(false);
  protected readonly chatError = signal('');
  protected readonly authUser = signal<AuthUser | null>(null);
  protected readonly authLoading = signal(true);
  protected readonly loginLoading = signal(false);
  protected readonly loginError = signal('');
  protected readonly googleClientId = signal('');
  protected readonly auditLogs = signal<AuditLog[]>([]);
  protected readonly auditLoading = signal(false);
  protected readonly showDevThemeControls = !environment.production;
  protected readonly devTheme = signal<DevTheme>(this.readDevTheme());
  private readonly selectedDate = signal(formatDate(new Date()));

  @HostBinding('class.dev-theme-light')
  protected get isDevLightTheme() {
    return this.showDevThemeControls && this.devTheme() === 'light';
  }

  @HostBinding('class.dev-theme-dark')
  protected get isDevDarkTheme() {
    return this.showDevThemeControls && this.devTheme() === 'dark';
  }

  protected title = '';
  protected get startDate() {
    return this.selectedDate();
  }

  protected set startDate(value: string) {
    this.selectedDate.set(value);
  }

  protected endDate = formatDate(new Date());
  protected status: CalendarEntryStatus = 'booked';
  protected bookingStatus: BookingStatus = 'inquiry';
  protected notes = '';
  protected totalAmount = 0;
  protected depositAmount = 0;
  protected paidAmount = 0;
  protected chatDraft = '';

  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
      .format(this.month())
      .replace(/^./, (letter) => letter.toUpperCase()),
  );
  protected readonly monthDays = computed<CalendarDay[]>(() => {
    const month = this.month();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const today = formatDate(new Date());
    const entries = this.entries();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const currentDate = new Date(month.getFullYear(), month.getMonth(), index + 1);
      const date = formatDate(currentDate);
      const weekday = currentDate.getDay();
      const entry = entries.find((item) => item.startDate <= date && item.endDate >= date);
      const previousDate = index > 0 ? formatDate(addDays(currentDate, -1)) : null;
      const nextDate = index < daysInMonth - 1 ? formatDate(addDays(currentDate, 1)) : null;
      const previousEntry = previousDate
        ? entries.find((item) => item.startDate <= previousDate && item.endDate >= previousDate)
        : undefined;
      const nextEntry = nextDate
        ? entries.find((item) => item.startDate <= nextDate && item.endDate >= nextDate)
        : undefined;
      const entryStart = !!entry && (!previousEntry || previousEntry.id !== entry.id);
      const entryEnd = !!entry && (!nextEntry || nextEntry.id !== entry.id);
      const entrySingle = !!entry && entryStart && entryEnd;

      return {
        date,
        day: index + 1,
        weekday,
        isToday: date === today,
        entry,
        entryStart,
        entryMiddle: !!entry && !entryStart && !entryEnd,
        entryEnd,
        entrySingle,
      };
    });
  });
  protected readonly leadingBlankDays = computed(() => this.month().getDay());
  protected readonly bookedDays = computed(
    () => this.monthDays().filter((day) => day.entry?.status === 'booked').length,
  );
  protected readonly blockedDays = computed(
    () => this.monthDays().filter((day) => day.entry?.status === 'blocked').length,
  );
  protected readonly freeDays = computed(
    () => this.monthDays().filter((day) => !day.entry).length,
  );
  protected readonly upcomingEntries = computed(() => this.entries().slice(0, 5));
  protected readonly selectedEntry = computed(() => {
    const selectedDate = this.startDate;
    return this.entries().find(
      (entry) => entry.startDate <= selectedDate && entry.endDate >= selectedDate,
    );
  });

  constructor() {
    window.addEventListener('popstate', () => this.zone.run(() => this.handleLocation()));
    this.handleLocation();
    this.restoreSession();
  }

  ngOnDestroy() {
    this.socket.disconnect();
  }

  protected previousMonth() {
    this.changeMonth(-1);
  }

  protected setDevTheme(theme: DevTheme) {
    this.devTheme.set(theme);
    localStorage.setItem(this.devThemeStorageKey, theme);
  }

  protected openView(view: ManagementView) {
    const paths: Record<ManagementView, string> = {
      dashboard: '/',
      calendar: '/calendario',
      chat: '/chat',
    };
    this.navigate(paths[view]);
  }

  protected sendChatMessage() {
    const content = this.chatDraft.trim();
    this.chatError.set('');

    if (!content) {
      this.chatError.set('Escreva uma mensagem antes de enviar.');
      return;
    }

    this.chatSending.set(true);

    this.http
      .post<ChatMessage>(`${this.apiUrl}/chat-messages`, { content })
      .subscribe({
        next: (message) => {
          this.chatSending.set(false);
          this.chatDraft = '';
          this.addChatMessage(message);
        },
        error: (error: HttpErrorResponse) => {
          this.chatSending.set(false);
          this.chatError.set(this.getChatErrorMessage(error));
        },
      });
  }

  protected nextMonth() {
    this.changeMonth(1);
  }

  protected goToToday() {
    this.month.set(this.firstDayOfMonth(new Date()));
    this.startDate = formatDate(new Date());
    this.endDate = this.startDate;
    this.loadEntries();
  }

  protected logout() {
    localStorage.removeItem(this.accessTokenKey);
    this.socket.disconnect();
    this.workspaceStarted = false;
    this.authUser.set(null);
    this.entries.set([]);
    this.chatMessages.set([]);
    this.auditLogs.set([]);
    this.navigate('/login', true);
  }

  protected retryGoogleLogin() {
    this.loginError.set('');
    this.loadGoogleConfiguration();
  }

  protected async signInWithNativeGoogle() {
    const clientId = this.googleClientId();
    if (!clientId) {
      this.loadGoogleConfiguration();
      return;
    }

    this.loginError.set('');
    this.loginLoading.set(true);

    try {
      await this.initializeNativeGoogleLogin(clientId);
      const login = await SocialLogin.login({
        provider: 'google',
        options: {},
      });
      const idToken = 'idToken' in login.result ? login.result.idToken : null;

      if (!idToken) {
        throw new Error('O Google não retornou um token de identificação.');
      }

      this.zone.run(() => this.signInWithGoogle(idToken));
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.zone.run(() => {
        this.loginLoading.set(false);
        if (code !== 'USER_CANCELLED') {
          this.loginError.set('Não foi possível iniciar o login Google no Android.');
        }
      });
    }
  }

  protected selectDay(day: CalendarDay) {
    if (day.entry) {
      this.editEntry(day.entry);
    } else {
      this.resetForm(day.date);
    }
    this.notice.set('');
    this.error.set('');
  }

  protected startNewEntry() {
    this.resetForm(this.startDate);
  }

  protected editEntry(entry: CalendarEntry) {
    this.editingEntryId.set(entry.id);
    this.title = entry.title;
    this.startDate = entry.startDate;
    this.endDate = entry.endDate;
    this.status = entry.status;
    this.bookingStatus = entry.bookingStatus;
    this.notes = entry.notes ?? '';
    this.totalAmount = Number(entry.totalAmount);
    this.depositAmount = Number(entry.depositAmount);
    this.paidAmount = Number(entry.paidAmount);
    this.error.set('');
    this.notice.set('');
  }

  protected saveEntry() {
    this.error.set('');
    this.notice.set('');

    if (!this.title.trim() || !this.startDate || !this.endDate) {
      this.error.set('Preencha o título e o período antes de salvar.');
      return;
    }

    this.saving.set(true);
    const payload = {
      title: this.title,
      startDate: this.startDate,
      endDate: this.endDate,
      status: this.status,
      bookingStatus: this.bookingStatus,
      notes: this.notes,
      totalAmount: Number(this.totalAmount),
      depositAmount: Number(this.depositAmount),
      paidAmount: Number(this.paidAmount),
    };
    const entryId = this.editingEntryId();
    const request = entryId
      ? this.http.patch<CalendarEntry>(`${this.apiUrl}/calendar-entries/${entryId}`, payload)
      : this.http.post<CalendarEntry>(`${this.apiUrl}/calendar-entries`, payload);

    request
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notice.set(entryId ? 'Aluguel atualizado.' : 'Período salvo no calendário.');
          this.resetForm(this.startDate);
          this.loadEntries();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.error.set(this.getErrorMessage(error));
        },
      });
  }

  protected deleteEntry(entry: CalendarEntry) {
    this.error.set('');
    this.notice.set('');
    this.http.delete(`${this.apiUrl}/calendar-entries/${entry.id}`).subscribe({
      next: () => {
        this.notice.set('Período removido. As datas voltaram a ficar livres.');
        this.resetForm(this.startDate);
        this.loadEntries();
      },
      error: (error: HttpErrorResponse) => this.error.set(this.getErrorMessage(error)),
    });
  }

  private restoreSession() {
    if (!this.getAccessToken()) {
      this.authLoading.set(false);
      if (this.currentPath() !== '/login') {
        this.navigate('/login', true);
      } else {
        this.loadGoogleConfiguration();
      }
      return;
    }

    this.http.get<AuthUser>(`${this.apiUrl}/auth/me`).subscribe({
      next: (user) => {
        this.authUser.set(user);
        this.authLoading.set(false);
        if (this.currentPath() === '/login') {
          this.navigate('/', true);
        }
        this.startWorkspace();
      },
      error: () => {
        localStorage.removeItem(this.accessTokenKey);
        this.authLoading.set(false);
        this.navigate('/login', true);
        this.loadGoogleConfiguration();
      },
    });
  }

  private handleLocation() {
    const path = this.getCurrentPath();
    const validPaths = ['/', '/login', '/calendario', '/chat'];
    if (!validPaths.includes(path)) {
      this.navigate('/', true);
      return;
    }

    this.currentPath.set(path);
    if (path === '/login') {
      if (!this.authUser()) {
        this.loadGoogleConfiguration();
      }
      return;
    }

    const views: Record<string, ManagementView> = {
      '/': 'dashboard',
      '/calendario': 'calendar',
      '/chat': 'chat',
    };
    this.activeView.set(views[path]);
    if (!this.authLoading() && !this.authUser()) {
      this.navigate('/login', true);
      return;
    }
    if (path === '/chat' && this.workspaceStarted) {
      this.loadChatMessages();
    }
  }

  private navigate(path: string, replace = false) {
    if (window.location.pathname !== path) {
      const method = replace ? 'replaceState' : 'pushState';
      window.history[method](null, '', path);
    }
    this.handleLocation();
  }

  private startWorkspace() {
    if (this.workspaceStarted) {
      return;
    }
    this.workspaceStarted = true;
    this.loadEntries();
    this.loadChatMessages();
    this.loadAuditLogs();
    this.connectRealtime();
  }

  private loadGoogleConfiguration() {
    if (this.googleClientId() || this.loginLoading()) {
      return;
    }

    this.loginLoading.set(true);
    const configUrl = `${this.apiUrl}/auth/config?refresh=${Date.now()}`;
    this.http.get<{ googleClientId: string }>(configUrl).subscribe({
      next: ({ googleClientId }) => {
        if (!googleClientId) {
          this.loginLoading.set(false);
          this.loginError.set('O login Google ainda não foi configurado no servidor.');
          return;
        }
        this.googleClientId.set(googleClientId);
        if (this.isNativePlatform) {
          this.initializeNativeGoogleLogin(googleClientId)
            .then(() => this.zone.run(() => this.loginLoading.set(false)))
            .catch(() =>
              this.zone.run(() => {
                this.loginLoading.set(false);
                this.loginError.set('Não foi possível preparar o login Google no Android.');
              }),
            );
          return;
        }
        this.loginLoading.set(false);
        this.loadGoogleScript();
      },
      error: () => {
        this.loginLoading.set(false);
        this.loginError.set('Não foi possível carregar a configuração de login.');
      },
    });
  }

  private async initializeNativeGoogleLogin(clientId: string) {
    if (this.nativeGoogleInitialized) {
      return;
    }

    await SocialLogin.initialize({
      google: {
        webClientId: clientId,
        mode: 'online',
      },
    });
    this.nativeGoogleInitialized = true;
  }

  private loadGoogleScript() {
    const existingScript = document.getElementById('google-identity-services');
    if (existingScript) {
      this.renderGoogleButton();
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => this.zone.run(() => this.renderGoogleButton());
    script.onerror = () =>
      this.zone.run(() => this.loginError.set('Não foi possível carregar o login Google.'));
    document.head.append(script);
  }

  private renderGoogleButton() {
    const clientId = this.googleClientId();
    const target = document.getElementById('google-sign-in');
    const google = (window as unknown as { google?: GoogleIdentity }).google;
    if (!clientId || !target || !google) {
      return;
    }

    target.replaceChildren();
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => this.zone.run(() => this.signInWithGoogle(response.credential)),
    });
    google.accounts.id.renderButton(target, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 320,
    });
  }

  private signInWithGoogle(credential: string) {
    this.loginError.set('');
    this.loginLoading.set(true);
    this.http.post<GoogleLoginResponse>(`${this.apiUrl}/auth/google`, { credential }).subscribe({
      next: ({ token, user }) => {
        localStorage.setItem(this.accessTokenKey, token);
        this.authUser.set(user);
        this.loginLoading.set(false);
        this.authLoading.set(false);
        this.navigate('/', true);
        this.startWorkspace();
      },
      error: (error: HttpErrorResponse) => {
        this.loginLoading.set(false);
        this.loginError.set(this.getLoginErrorMessage(error));
      },
    });
  }

  private changeMonth(offset: number) {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() + offset, 1));
    this.loadEntries();
  }

  protected get outstandingAmount() {
    return Math.max(0, Number(this.totalAmount || 0) - Number(this.paidAmount || 0));
  }

  protected getBookingStatusLabel(status: BookingStatus) {
    const labels: Record<BookingStatus, string> = {
      inquiry: 'Em negociação',
      deposit_pending: 'Sinal pendente',
      confirmed: 'Confirmada',
      completed: 'Concluída',
    };
    return labels[status];
  }

  protected getEntryBalance(entry: CalendarEntry) {
    return Math.max(0, Number(entry.totalAmount) - Number(entry.paidAmount));
  }

  private resetForm(date: string) {
    this.editingEntryId.set(null);
    this.title = '';
    this.startDate = date;
    this.endDate = date;
    this.status = 'booked';
    this.bookingStatus = 'inquiry';
    this.notes = '';
    this.totalAmount = 0;
    this.depositAmount = 0;
    this.paidAmount = 0;
  }

  private loadEntries() {
    const month = this.month();
    const from = formatDate(month);
    const to = formatDate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    this.loading.set(true);
    this.http.get<CalendarEntry[]>(`${this.apiUrl}/calendar-entries?from=${from}&to=${to}`).subscribe({
      next: (entries) => {
        this.entries.set(entries.length || environment.production ? entries : buildMockCalendarEntries(month));
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.entries.set(environment.production ? [] : buildMockCalendarEntries(month));
        this.loading.set(false);
        if (environment.production) {
          this.error.set(this.getErrorMessage(error));
        } else if (error.status !== 0) {
          this.error.set(this.getErrorMessage(error));
        } else {
          this.notice.set('Usando aluguéis mockados para visualização em ambiente dev.');
        }
      },
    });
  }

  private loadChatMessages() {
    this.chatLoading.set(true);
    this.http.get<ChatMessage[]>(`${this.apiUrl}/chat-messages`).subscribe({
      next: (messages) => {
        this.chatMessages.set(messages);
        this.chatLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.chatLoading.set(false);
        this.chatError.set(this.getChatErrorMessage(error));
      },
    });
  }

  private loadAuditLogs() {
    this.auditLoading.set(true);
    this.http.get<AuditLog[]>(`${this.apiUrl}/audit-logs`).subscribe({
      next: (logs) => {
        this.auditLogs.set(logs);
        this.auditLoading.set(false);
      },
      error: () => this.auditLoading.set(false),
    });
  }

  private connectRealtime() {
    if (!this.getAccessToken()) {
      return;
    }
    if (this.realtimeBound) {
      this.socket.connect();
      return;
    }
    this.realtimeBound = true;
    this.socket.on('connect', () => {
      this.zone.run(() => this.realtimeConnected.set(true));
    });

    this.socket.on('disconnect', () => {
      this.zone.run(() => this.realtimeConnected.set(false));
    });

    this.socket.on('calendar:changed', () => {
      this.zone.run(() => {
        this.loadEntries();
        this.loadAuditLogs();
        this.notice.set('Agenda atualizada por outro dispositivo.');
      });
    });

    this.socket.on('chat:message', (message) => {
      this.zone.run(() => this.addChatMessage(message));
    });

    this.socket.connect();
  }

  private createRealtimeSocket(): Socket<ServerToClientEvents> {
    const realtimeUrl = this.getRealtimeUrl();
    const options = {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (callback: (data: { token: string }) => void) =>
        callback({ token: this.getAccessToken() }),
    };
    const socket = realtimeUrl ? io(realtimeUrl, options) : io(options);
    return socket as Socket<ServerToClientEvents>;
  }

  private getRealtimeUrl() {
    if (!this.apiUrl.startsWith('http')) {
      return undefined;
    }

    return this.apiUrl.replace(/\/api\/?$/, '');
  }

  private firstDayOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getCurrentPath() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return path === '/index.html' ? '/' : path;
  }

  private getAccessToken() {
    return localStorage.getItem(this.accessTokenKey) ?? '';
  }

  private readDevTheme(): DevTheme {
    const theme = localStorage.getItem(this.devThemeStorageKey);
    return theme === 'light' || theme === 'dark' ? theme : 'system';
  }

  private addChatMessage(message: ChatMessage) {
    this.chatMessages.update((messages) => {
      if (messages.some((item) => item.id === message.id)) {
        return messages;
      }
      return [...messages, message].slice(-100);
    });
  }

  private getErrorMessage(error: HttpErrorResponse) {
    const apiMessage = error.error?.message;
    if (error.status === 404) {
      return 'A agenda ainda não está disponível na API. Atualize e reinicie o servidor para liberar o calendário.';
    }
    if (typeof apiMessage === 'string') {
      return apiMessage;
    }
    return 'Não foi possível atualizar o calendário. Verifique se a API está em execução.';
  }

  private getChatErrorMessage(error: HttpErrorResponse) {
    const apiMessage = error.error?.message;
    if (typeof apiMessage === 'string') {
      return apiMessage;
    }
    return 'Não foi possível atualizar o chat. Verifique se a API está em execução.';
  }

  private getLoginErrorMessage(error: HttpErrorResponse) {
    const apiMessage = error.error?.message;
    if (typeof apiMessage === 'string') {
      return apiMessage;
    }
    return 'Não foi possível concluir o login com Google.';
  }
}
