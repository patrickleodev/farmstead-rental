import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { IonApp, IonContent } from '@ionic/angular/standalone';
import { Socket, io } from 'socket.io-client';

import { environment } from '../environments/environment';

type ApiHealth = {
  message: string;
  environment: string;
  timestamp: string;
  nextSteps: string[];
};

type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

type OperationRealtimeState = {
  channel: 'operation';
  connectedClients: number;
  message: string;
  timestamp: string;
};

type OperationPingPayload = {
  source: string;
};

type OperationPong = {
  clientId: string;
  message: string;
  receivedAt: string;
  source: string;
};

type ServerToClientEvents = {
  'operation:state': (state: OperationRealtimeState) => void;
  'operation:pong': (pong: OperationPong) => void;
};

type ClientToServerEvents = {
  'operation:ping': (payload: OperationPingPayload, callback?: (pong: OperationPong) => void) => void;
};

@Component({
  selector: 'app-root',
  imports: [CurrencyPipe, DatePipe, IonApp, IonContent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly apiUrl = environment.apiUrl;
  private readonly socket = this.createRealtimeSocket();

  protected readonly apiHealth = signal<ApiHealth | null>(null);
  protected readonly apiError = signal('');
  protected readonly realtimeStatus = signal<RealtimeStatus>('connecting');
  protected readonly realtimeState = signal<OperationRealtimeState | null>(null);
  protected readonly realtimePong = signal<OperationPong | null>(null);
  protected readonly realtimeError = signal('');
  protected readonly realtimeSocketId = signal('');
  protected readonly bookings = [
    {
      guest: 'Familia Oliveira',
      dates: '05-07 jun',
      status: 'Confirmado',
      value: 1800,
    },
    {
      guest: 'Retiro Equipe Norte',
      dates: '13-15 jun',
      status: 'Sinal pendente',
      value: 2400,
    },
    {
      guest: 'Aniversario da Marina',
      dates: '21 jun',
      status: 'Orcamento enviado',
      value: 950,
    },
  ];
  protected readonly checklist = [
    'Receber documentos do contrato',
    'Conferir taxa de limpeza',
    'Bloquear manutencao da piscina',
  ];

  constructor() {
    this.http.get<ApiHealth>(`${this.apiUrl}/health`).subscribe({
      next: (health) => this.apiHealth.set(health),
      error: () => this.apiError.set(`API indisponivel em ${this.apiUrl}`),
    });

    this.connectRealtime();
  }

  ngOnDestroy() {
    this.socket.disconnect();
  }

  protected pingRealtime() {
    this.socket.emit('operation:ping', { source: 'painel' }, (pong) => {
      this.zone.run(() => this.realtimePong.set(pong));
    });
  }

  private connectRealtime() {
    this.socket.on('connect', () => {
      this.zone.run(() => {
        this.realtimeStatus.set('connected');
        this.realtimeError.set('');
        this.realtimeSocketId.set(this.socket.id ?? '');
      });

      this.pingRealtime();
    });

    this.socket.on('disconnect', () => {
      this.zone.run(() => {
        this.realtimeStatus.set('disconnected');
        this.realtimeSocketId.set('');
      });
    });

    this.socket.on('connect_error', (error) => {
      this.zone.run(() => {
        this.realtimeStatus.set('disconnected');
        this.realtimeError.set(error.message);
      });
    });

    this.socket.on('operation:state', (state) => {
      this.zone.run(() => this.realtimeState.set(state));
    });

    this.socket.on('operation:pong', (pong) => {
      this.zone.run(() => this.realtimePong.set(pong));
    });

    this.socket.connect();
  }

  private createRealtimeSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
    const realtimeUrl = this.getRealtimeUrl();
    const options = {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    };

    const socket = realtimeUrl ? io(realtimeUrl, options) : io(options);

    return socket as Socket<ServerToClientEvents, ClientToServerEvents>;
  }

  private getRealtimeUrl() {
    if (!this.apiUrl.startsWith('http')) {
      return undefined;
    }

    return this.apiUrl.replace(/\/api\/?$/, '');
  }
}
