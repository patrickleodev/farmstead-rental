import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostBinding, HostListener, NgZone, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { IonApp, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { calendarOutline, chatbubbleEllipsesOutline, chevronBackOutline, chevronForwardOutline, createOutline, gridOutline, trashOutline } from 'ionicons/icons';
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
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  status: CalendarEntryStatus;
  bookingStatus: BookingStatus;
  notes: string | null;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  payments: CalendarPayment[];
};

type CalendarPayment = {
  date: string;
  amount: number;
  note: string | null;
};

type CalendarDay = {
  monthKey: string;
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

type CalendarMonth = {
  key: string;
  label: string;
  month: Date;
  leadingBlankDays: number;
  days: CalendarDay[];
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

const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

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
    const paidAmount = seed.paidAmount ?? 0;

    return {
      id: index + 1,
      title: seed.title,
      startDate,
      startTime: null,
      endDate,
      endTime: null,
      status: seed.status,
      bookingStatus: seed.bookingStatus ?? 'inquiry',
      notes: seed.notes ?? null,
      totalAmount: seed.totalAmount ?? 0,
      depositAmount: seed.depositAmount ?? 0,
      paidAmount,
      payments: paidAmount > 0 ? [{ date: startDate, amount: paidAmount, note: 'Sinal pago' }] : [],
    };
  });
};

@Component({
  selector: 'app-root',
  imports: [CurrencyPipe, DatePipe, FormsModule, IonApp, IonContent, IonIcon],
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
  private readonly mockCalendarStorageKey = 'farmstead-rental.show-calendar-mocks';
  private workspaceStarted = false;
  private realtimeBound = false;
  private nativeGoogleInitialized = false;
  private formSnapshot = '';
  private readonly rangeAnchorDate = signal<string | null>(null);
  private rangeDragStartDate: string | null = null;
  private draggingRange = false;
  private draggedRange = false;
  private suppressNextCalendarClick = false;
  private monthScrollTimeout?: number;
  private calendarWheelUnlockTimeout?: number;
  private calendarWheelLocked = false;
  private releaseCalendarScrollSyncTimeout?: number;
  private syncingCalendarScroll = false;

  @ViewChild('calendarMonths')
  private calendarMonths?: ElementRef<HTMLElement>;

  protected readonly currentPath = signal(this.getCurrentPath());
  protected readonly isNativePlatform = Capacitor.isNativePlatform();
  protected readonly month = signal(this.firstDayOfMonth(new Date()));
  protected readonly calendarWindowMonth = signal(this.firstDayOfMonth(new Date()));
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
  protected readonly showMockCalendarEntries = signal(this.readMockCalendarPreference());
  private readonly selectedDate = signal(formatDate(new Date()));

  @HostBinding('class.dev-theme-light')
  protected get isDevLightTheme() {
    return this.showDevThemeControls && this.devTheme() === 'light';
  }

  @HostBinding('class.dev-theme-dark')
  protected get isDevDarkTheme() {
    return this.showDevThemeControls && this.devTheme() === 'dark';
  }

  @HostListener('window:keydown', ['$event'])
  protected handleDraftRangeKeydown(event: KeyboardEvent) {
    if (this.editingEntryId() || this.activeView() !== 'calendar' || this.isTypingTarget(event.target)) {
      return;
    }
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const offset = offsets[event.key];
    if (!offset) {
      return;
    }

    event.preventDefault();
    if (event.shiftKey) {
      this.moveDraftStart(offset);
    } else {
      this.moveDraftEnd(offset);
    }
    this.rangeAnchorDate.set(this.startDate);
  }

  @HostListener('window:pointerup')
  protected finishDraftRangeDrag() {
    if (this.draggingRange && this.draggedRange) {
      this.suppressNextCalendarClick = true;
      this.rangeAnchorDate.set(this.startDate);
    }
    this.draggingRange = false;
    this.draggedRange = false;
    this.rangeDragStartDate = null;
  }

  protected title = '';
  protected get startDate() {
    return this.selectedDate();
  }

  protected set startDate(value: string) {
    this.selectedDate.set(value);
  }

  protected endDate = formatDate(new Date());
  protected startTime = '';
  protected endTime = '';
  protected status: CalendarEntryStatus = 'booked';
  protected bookingStatus: BookingStatus = 'inquiry';
  protected notes = '';
  protected totalAmount = 0;
  protected depositAmount = 0;
  protected payments: CalendarPayment[] = [];
  protected chatDraft = '';

  protected readonly monthLabel = computed(() => this.formatMonthLabel(this.month()));
  protected readonly activeMonthKey = computed(() => this.getMonthKey(this.month()));
  protected readonly visibleMonths = computed<CalendarMonth[]>(() =>
    this.getCalendarWindow(this.calendarWindowMonth()).map((month) => this.buildCalendarMonth(month)),
  );
  protected readonly visibleLeadingBlankDays = computed(() => this.visibleMonths()[0]?.leadingBlankDays ?? 0);
  protected readonly visibleDays = computed<CalendarDay[]>(() =>
    this.visibleMonths().flatMap((calendarMonth) => calendarMonth.days),
  );
  protected readonly monthDays = computed<CalendarDay[]>(() => {
    const monthKey = this.getMonthKey(this.month());
    return this.visibleMonths().find((calendarMonth) => calendarMonth.key === monthKey)?.days ?? [];
  });
  protected readonly bookedDays = computed(
    () => this.monthDays().filter((day) => day.entry?.status === 'booked').length,
  );
  protected readonly blockedDays = computed(
    () => this.monthDays().filter((day) => day.entry?.status === 'blocked').length,
  );
  protected readonly freeDays = computed(
    () => this.monthDays().filter((day) => !day.entry).length,
  );
  protected readonly upcomingEntries = computed(() => {
    const today = formatDate(new Date());
    return this.entries()
      .filter((entry) => entry.endDate >= today)
      .sort((left, right) => left.startDate.localeCompare(right.startDate))
      .slice(0, 5);
  });
  protected readonly selectedEntry = computed(() => {
    const selectedDate = this.startDate;
    return this.entries().find(
      (entry) => entry.startDate <= selectedDate && entry.endDate >= selectedDate,
    );
  });

  constructor() {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'grid-outline': gridOutline,
      'calendar-outline': calendarOutline,
      'chatbubble-ellipses-outline': chatbubbleEllipsesOutline,
      'create-outline': createOutline,
      'trash-outline': trashOutline,
    });
    window.addEventListener('popstate', () => this.zone.run(() => this.handleLocation()));
    this.handleLocation();
    this.restoreSession();
  }

  ngOnDestroy() {
    if (this.monthScrollTimeout) {
      window.clearTimeout(this.monthScrollTimeout);
    }
    if (this.calendarWheelUnlockTimeout) {
      window.clearTimeout(this.calendarWheelUnlockTimeout);
    }
    if (this.releaseCalendarScrollSyncTimeout) {
      window.clearTimeout(this.releaseCalendarScrollSyncTimeout);
    }
    this.socket.disconnect();
  }

  protected previousMonth() {
    this.changeMonth(-1);
  }

  protected setDevTheme(theme: DevTheme) {
    this.devTheme.set(theme);
    localStorage.setItem(this.devThemeStorageKey, theme);
  }

  protected toggleMockCalendarEntries() {
    const nextValue = !this.showMockCalendarEntries();
    this.showMockCalendarEntries.set(nextValue);
    localStorage.setItem(this.mockCalendarStorageKey, nextValue ? 'visible' : 'hidden');
    this.notice.set(nextValue ? 'Mocking do calendario visivel.' : 'Mocking do calendario oculto.');
    this.loadEntries(true);
  }

  protected handleCalendarWheel(event: WheelEvent) {
    if (Math.abs(event.deltaY) < 8) {
      return;
    }

    event.preventDefault();
    if (this.calendarWheelLocked) {
      return;
    }

    this.calendarWheelLocked = true;
    this.changeMonth(event.deltaY > 0 ? 1 : -1);
    if (this.calendarWheelUnlockTimeout) {
      window.clearTimeout(this.calendarWheelUnlockTimeout);
    }
    this.calendarWheelUnlockTimeout = window.setTimeout(() => {
      this.calendarWheelLocked = false;
    }, 650);
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
    const todayMonth = this.firstDayOfMonth(new Date());
    this.month.set(todayMonth);
    this.calendarWindowMonth.set(todayMonth);
    this.startDate = formatDate(new Date());
    this.endDate = this.startDate;
    this.loadEntries(true);
    this.scrollToMonth(todayMonth, 'smooth');
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
    if (this.suppressNextCalendarClick) {
      this.suppressNextCalendarClick = false;
      return;
    }
    if (day.entry) {
      this.rangeAnchorDate.set(null);
      this.editEntry(day.entry);
    } else {
      this.resetForm(day.date, false);
      const anchorDate = this.rangeAnchorDate();
      if (!anchorDate) {
        this.rangeAnchorDate.set(day.date);
      } else {
        this.startDate = anchorDate <= day.date ? anchorDate : day.date;
        this.endDate = anchorDate <= day.date ? day.date : anchorDate;
        this.rangeAnchorDate.set(null);
      }
    }
    this.notice.set('');
    this.error.set('');
  }

  protected startDraftRangeDrag(day: CalendarDay, event: PointerEvent) {
    if (day.entry || this.editingEntryId() || event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.draggingRange = true;
    this.draggedRange = false;
    this.rangeDragStartDate = day.date;
  }

  protected updateDraftRangeDrag(day: CalendarDay) {
    if (!this.draggingRange || day.entry || !this.rangeDragStartDate) {
      return;
    }
    this.draggedRange = this.draggedRange || day.date !== this.rangeDragStartDate;
    this.applyDraftRange(this.rangeDragStartDate, day.date);
  }

  protected startNewEntry() {
    this.resetForm(this.startDate);
    this.rangeAnchorDate.set(this.startDate);
  }

  protected editEntry(entry: CalendarEntry) {
    this.fillFormFromEntry(entry);
    this.error.set('');
    this.notice.set('');
  }

  private fillFormFromEntry(entry: CalendarEntry) {
    this.editingEntryId.set(entry.id);
    this.title = entry.title;
    this.startDate = entry.startDate;
    this.startTime = entry.startTime ?? '';
    this.endDate = entry.endDate;
    this.endTime = entry.endTime ?? '';
    this.status = entry.status;
    this.bookingStatus = entry.bookingStatus ?? 'inquiry';
    this.notes = entry.notes ?? '';
    this.totalAmount = Number(entry.totalAmount);
    this.depositAmount = Number(entry.depositAmount);
    this.payments = this.resolveEntryPayments(entry);
    if (!this.payments.length) {
      this.payments = [this.createEmptyPayment()];
    }
    this.formSnapshot = this.getFormSnapshot();
  }

  protected saveEntry() {
    this.error.set('');
    this.notice.set('');

    if (!this.isEntryFormReady() || (this.editingEntryId() && !this.hasFormChanges())) {
      return;
    }

    if (!this.title.trim() || !this.startDate || !this.endDate) {
      this.error.set('Preencha o título e o período antes de salvar.');
      return;
    }

    this.saving.set(true);
    const payload = {
      title: this.title,
      startDate: this.startDate,
      startTime: this.startTime || null,
      endDate: this.endDate,
      endTime: this.endTime || null,
      status: this.status,
      bookingStatus: this.bookingStatus,
      notes: this.notes,
      totalAmount: Number(this.totalAmount),
      depositAmount: Number(this.depositAmount),
      paidAmount: this.paidTotalAmount,
      payments: this.getNormalizedPayments(),
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
    this.updatePageTitle(path);
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
    if (path === '/calendario') {
      this.scrollToMonth(this.month(), 'auto');
    }
    if (!this.authLoading() && !this.authUser()) {
      this.navigate('/login', true);
      return;
    }
    if (path === '/chat' && this.workspaceStarted) {
      this.loadChatMessages();
    }
  }

  private updatePageTitle(path: string) {
    const pageTitles: Record<string, string> = {
      '/': 'Painel',
      '/calendario': 'Calendário',
      '/chat': 'Chat',
      '/login': 'Login',
    };
    document.title = `${pageTitles[path] ?? 'Painel'} | Chácara`;
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
    this.loadEntries(true);
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
    const targetMonth = addMonths(this.month(), offset);
    if (this.monthScrollTimeout) {
      window.clearTimeout(this.monthScrollTimeout);
    }

    if (!this.isMonthInCalendarWindow(targetMonth)) {
      this.month.set(targetMonth);
      this.calendarWindowMonth.set(targetMonth);
      this.scrollToMonth(targetMonth, 'auto');
      this.loadEntries(true);
      return;
    }

    this.scrollToMonth(targetMonth, 'smooth');
    this.monthScrollTimeout = window.setTimeout(() => {
      this.month.set(targetMonth);
      this.calendarWindowMonth.set(targetMonth);
      this.scrollToMonth(targetMonth, 'auto');
      this.loadEntries(true);
    }, 430);
  }

  protected get outstandingAmount() {
    return Math.max(0, Number(this.totalAmount || 0) - this.paidTotalAmount);
  }

  protected get paidTotalAmount() {
    return this.sumPayments(this.payments);
  }

  protected isEntryFormReady() {
    if (!this.title.trim() || !this.isDateOnly(this.startDate) || !this.isDateOnly(this.endDate)) {
      return false;
    }
    if (this.startDate > this.endDate || !this.isTimeRangeReady()) {
      return false;
    }
    if (this.status !== 'booked') {
      return true;
    }

    const totalAmount = Number(this.totalAmount || 0);
    const depositAmount = Number(this.depositAmount || 0);
    return (
      this.isValidAmount(totalAmount) &&
      this.isValidAmount(depositAmount) &&
      depositAmount <= totalAmount &&
      this.arePaymentsReady() &&
      this.paidTotalAmount <= totalAmount
    );
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

  protected formatEntryPeriod(entry: CalendarEntry) {
    const start = entry.startTime ? `${entry.startDate} ${entry.startTime.slice(0, 5)}` : entry.startDate;
    const end = entry.endTime ? `${entry.endDate} ${entry.endTime.slice(0, 5)}` : entry.endDate;
    return `${start} até ${end}`;
  }

  protected addPayment() {
    this.payments = [...this.payments, this.createEmptyPayment()];
  }

  protected removePayment(index: number) {
    const nextPayments = this.payments.filter((_, paymentIndex) => paymentIndex !== index);
    this.payments = nextPayments.length ? nextPayments : [this.createEmptyPayment()];
  }

  protected isDraftRangeDay(date: string) {
    return !this.editingEntryId() && this.startDate <= date && this.endDate >= date;
  }

  protected isDraftRangeEndpoint(date: string) {
    return !this.editingEntryId() && (date === this.startDate || date === this.endDate);
  }

  private applyDraftRange(startDate: string, endDate: string) {
    this.startDate = startDate <= endDate ? startDate : endDate;
    this.endDate = startDate <= endDate ? endDate : startDate;
  }

  private moveDraftStart(offset: number) {
    const nextStartDate = this.shiftDate(this.startDate, offset);
    if (nextStartDate <= this.endDate) {
      this.startDate = nextStartDate;
    }
  }

  private moveDraftEnd(offset: number) {
    const nextEndDate = this.shiftDate(this.endDate, offset);
    if (nextEndDate >= this.startDate) {
      this.endDate = nextEndDate;
    }
  }

  private shiftDate(date: string, offset: number) {
    return formatDate(addDays(new Date(`${date}T12:00:00`), offset));
  }

  private isTypingTarget(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    return !!element?.closest('input, textarea, select, [contenteditable="true"]');
  }

  protected hasFormChanges() {
    const entryId = this.editingEntryId();
    if (!entryId) {
      return true;
    }
    const originalEntry = this.entries().find((entry) => entry.id === entryId);
    return !originalEntry || this.getFormSnapshot() !== this.getEntrySnapshot(originalEntry);
  }

  private resetForm(date: string, clearRangeAnchor = true) {
    if (clearRangeAnchor) {
      this.rangeAnchorDate.set(null);
    }
    this.editingEntryId.set(null);
    this.title = '';
    this.startDate = date;
    this.startTime = '';
    this.endDate = date;
    this.endTime = '';
    this.status = 'booked';
    this.bookingStatus = 'inquiry';
    this.notes = '';
    this.totalAmount = 0;
    this.depositAmount = 0;
    this.payments = [this.createEmptyPayment()];
    this.formSnapshot = this.getFormSnapshot();
  }

  private buildCalendarMonth(month: Date): CalendarMonth {
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const today = formatDate(new Date());
    const entries = this.entries();
    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const currentDate = new Date(month.getFullYear(), month.getMonth(), index + 1);
      const date = formatDate(currentDate);
      const weekday = currentDate.getDay();
      const entry = entries.find((item) => item.startDate <= date && item.endDate >= date);
      const previousDate = formatDate(addDays(currentDate, -1));
      const nextDate = formatDate(addDays(currentDate, 1));
      const previousEntry = entries.find((item) => item.startDate <= previousDate && item.endDate >= previousDate);
      const nextEntry = entries.find((item) => item.startDate <= nextDate && item.endDate >= nextDate);
      const entryStart = !!entry && (!previousEntry || previousEntry.id !== entry.id);
      const entryEnd = !!entry && (!nextEntry || nextEntry.id !== entry.id);
      const entrySingle = !!entry && entryStart && entryEnd;

      return {
        monthKey: this.getMonthKey(month),
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

    return {
      key: this.getMonthKey(month),
      label: this.formatMonthLabel(month),
      month,
      leadingBlankDays: month.getDay(),
      days,
    };
  }

  private loadEntries(scrollAfterLoad = false) {
    const windowMonth = this.calendarWindowMonth();
    const calendarWindow = this.getCalendarWindow(windowMonth);
    const firstMonth = calendarWindow[0];
    const lastMonth = calendarWindow[calendarWindow.length - 1];
    const from = formatDate(firstMonth);
    const to = formatDate(new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0));
    this.loading.set(true);
    this.http.get<CalendarEntry[]>(`${this.apiUrl}/calendar-entries?from=${from}&to=${to}`).subscribe({
      next: (entries) => {
        const resolvedEntries = this.resolveCalendarEntries(entries, windowMonth);
        this.entries.set(resolvedEntries);
        this.syncSelectedDateWithEntries(resolvedEntries);
        this.loading.set(false);
        if (scrollAfterLoad) {
          this.scrollToMonth(this.month(), 'auto');
        }
      },
      error: (error: HttpErrorResponse) => {
        const resolvedEntries = this.resolveCalendarEntries([], windowMonth);
        this.entries.set(resolvedEntries);
        this.syncSelectedDateWithEntries(resolvedEntries);
        this.loading.set(false);
        if (scrollAfterLoad) {
          this.scrollToMonth(this.month(), 'auto');
        }
        if (environment.production) {
          this.error.set(this.getErrorMessage(error));
        } else if (error.status !== 0) {
          this.error.set(this.getErrorMessage(error));
        } else if (this.showMockCalendarEntries()) {
          this.notice.set('Usando aluguéis mockados para visualização em ambiente dev.');
        }
      },
    });
  }

  private resolveCalendarEntries(entries: CalendarEntry[], month: Date) {
    if (entries.length || environment.production || !this.showMockCalendarEntries()) {
      return entries;
    }
    return this.getCalendarWindow(month).flatMap((calendarMonth) => {
      const monthIdBase = (calendarMonth.getFullYear() * 100 + calendarMonth.getMonth() + 1) * 100;
      return buildMockCalendarEntries(calendarMonth).map((entry) => ({
        ...entry,
        id: monthIdBase + entry.id,
      }));
    });
  }

  private syncSelectedDateWithEntries(entries: CalendarEntry[]) {
    const selectedDate = this.startDate;
    const entry = entries.find((item) => item.startDate <= selectedDate && item.endDate >= selectedDate);
    if (entry) {
      this.fillFormFromEntry(entry);
    } else {
      this.resetForm(selectedDate);
    }
  }

  private resolveEntryPayments(entry: CalendarEntry) {
    if (entry.payments?.length) {
      return entry.payments.map((payment) => ({
        date: payment.date,
        amount: Number(payment.amount),
        note: payment.note ?? null,
      }));
    }

    const paidAmount = Number(entry.paidAmount || 0);
    return paidAmount > 0 ? [{ date: entry.startDate, amount: paidAmount, note: 'Pagamento anterior' }] : [];
  }

  private createEmptyPayment(): CalendarPayment {
    return {
      date: formatDate(new Date()),
      amount: 0,
      note: null,
    };
  }

  private getNormalizedPayments() {
    return this.payments
      .map((payment) => ({
        date: payment.date,
        amount: Math.round(Number(payment.amount || 0) * 100) / 100,
        note: payment.note?.trim() || null,
      }))
      .filter((payment) => payment.date && payment.amount > 0);
  }

  private arePaymentsReady() {
    return this.payments.every((payment) => {
      const amount = Number(payment.amount || 0);
      if (!this.isValidAmount(amount)) {
        return false;
      }
      return amount <= 0 || this.isDateOnly(payment.date);
    });
  }

  private isValidAmount(amount: number) {
    return Number.isFinite(amount) && amount >= 0;
  }

  private isDateOnly(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private isTimeRangeReady() {
    const validStartTime = !this.startTime || /^\d{2}:\d{2}$/.test(this.startTime);
    const validEndTime = !this.endTime || /^\d{2}:\d{2}$/.test(this.endTime);
    if (!validStartTime || !validEndTime) {
      return false;
    }
    if (this.startDate !== this.endDate || !this.startTime || !this.endTime) {
      return true;
    }
    return this.startTime < this.endTime;
  }

  private sumPayments(payments: CalendarPayment[]) {
    return Math.round(
      payments.reduce((total, payment) => total + Number(payment.amount || 0), 0) * 100,
    ) / 100;
  }

  private getFormSnapshot() {
    const snapshot = {
      title: this.title.trim(),
      startDate: this.startDate,
      startTime: this.startTime || null,
      endDate: this.endDate,
      endTime: this.endTime || null,
      status: this.status,
      notes: this.notes.trim(),
    };
    return JSON.stringify(this.status === 'booked' ? {
      ...snapshot,
      bookingStatus: this.bookingStatus ?? 'inquiry',
      totalAmount: Number(this.totalAmount || 0),
      depositAmount: Number(this.depositAmount || 0),
      paidAmount: this.paidTotalAmount,
      payments: this.getNormalizedPayments(),
    } : snapshot);
  }

  private getEntrySnapshot(entry: CalendarEntry) {
    const snapshot = {
      title: entry.title.trim(),
      startDate: entry.startDate,
      startTime: entry.startTime ?? null,
      endDate: entry.endDate,
      endTime: entry.endTime ?? null,
      status: entry.status,
      notes: (entry.notes ?? '').trim(),
    };
    return JSON.stringify(entry.status === 'booked' ? {
      ...snapshot,
      bookingStatus: entry.bookingStatus ?? 'inquiry',
      totalAmount: Number(entry.totalAmount || 0),
      depositAmount: Number(entry.depositAmount || 0),
      paidAmount: Number(entry.paidAmount || 0),
      payments: this.resolveEntryPayments(entry),
    } : snapshot);
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

  private getCalendarWindow(month: Date) {
    return [-2, -1, 0, 1, 2].map((offset) => addMonths(month, offset));
  }

  private isMonthInCalendarWindow(month: Date) {
    const monthKey = this.getMonthKey(month);
    return this.visibleMonths().some((calendarMonth) => calendarMonth.key === monthKey);
  }

  private getMonthKey(month: Date) {
    return formatDate(month).slice(0, 7);
  }

  private formatMonthLabel(month: Date) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
      .format(month)
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  private scrollToMonth(month: Date, behavior: ScrollBehavior) {
    window.setTimeout(() => {
      const container = this.calendarMonths?.nativeElement;
      if (!container) {
        return;
      }

      const target = container.querySelector<HTMLElement>(`[data-month-start="${this.getMonthKey(month)}"]`);
      if (!target) {
        return;
      }

      this.syncingCalendarScroll = true;
      if (this.releaseCalendarScrollSyncTimeout) {
        window.clearTimeout(this.releaseCalendarScrollSyncTimeout);
      }

      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top, behavior });
      this.releaseCalendarScrollSyncTimeout = window.setTimeout(
        () => {
          this.syncingCalendarScroll = false;
        },
        behavior === 'smooth' ? 460 : 80,
      );
    });
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

  private readMockCalendarPreference() {
    return localStorage.getItem(this.mockCalendarStorageKey) !== 'hidden';
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
