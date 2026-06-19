import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, NgZone, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonApp, IonContent } from '@ionic/angular/standalone';
import { Socket, io } from 'socket.io-client';

import { environment } from '../environments/environment';

type CalendarEntryStatus = 'booked' | 'blocked';
type BookingStatus = 'inquiry' | 'deposit_pending' | 'confirmed' | 'completed';
type ManagementView = 'dashboard' | 'calendar' | 'chat';

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
  isToday: boolean;
  entry?: CalendarEntry;
};

type CalendarChangedEvent = {
  action: 'created' | 'updated' | 'removed';
  entryId: number;
  changedAt: string;
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
  private readonly selectedDate = signal(formatDate(new Date()));

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
  protected chatAuthor = this.getSavedChatAuthor();
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
      const date = formatDate(new Date(month.getFullYear(), month.getMonth(), index + 1));
      return {
        date,
        day: index + 1,
        isToday: date === today,
        entry: entries.find((entry) => entry.startDate <= date && entry.endDate >= date),
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
    this.loadEntries();
    this.loadChatMessages();
    this.connectRealtime();
  }

  ngOnDestroy() {
    this.socket.disconnect();
  }

  protected previousMonth() {
    this.changeMonth(-1);
  }

  protected openView(view: ManagementView) {
    this.activeView.set(view);
    if (view === 'chat') {
      this.loadChatMessages();
    }
  }

  protected sendChatMessage() {
    const author = this.chatAuthor.trim();
    const content = this.chatDraft.trim();
    this.chatError.set('');

    if (!author || !content) {
      this.chatError.set('Informe seu nome e escreva uma mensagem.');
      return;
    }

    this.chatSending.set(true);
    try {
      localStorage.setItem('farmstead-rental.chat-author', author);
    } catch {
      // The chat remains usable when local storage is unavailable.
    }

    this.http
      .post<ChatMessage>(`${this.apiUrl}/chat-messages`, { author, content })
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
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.entries.set([]);
        this.loading.set(false);
        this.error.set(this.getErrorMessage(error));
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

  private connectRealtime() {
    this.socket.on('connect', () => {
      this.zone.run(() => this.realtimeConnected.set(true));
    });

    this.socket.on('disconnect', () => {
      this.zone.run(() => this.realtimeConnected.set(false));
    });

    this.socket.on('calendar:changed', () => {
      this.zone.run(() => {
        this.loadEntries();
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

  private addChatMessage(message: ChatMessage) {
    this.chatMessages.update((messages) => {
      if (messages.some((item) => item.id === message.id)) {
        return messages;
      }
      return [...messages, message].slice(-100);
    });
  }

  private getSavedChatAuthor() {
    try {
      return localStorage.getItem('farmstead-rental.chat-author') ?? '';
    } catch {
      return '';
    }
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
}
