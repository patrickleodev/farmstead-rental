import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { IonApp, IonContent } from '@ionic/angular/standalone';

import { environment } from '../environments/environment';

type ApiHealth = {
  message: string;
  environment: string;
  timestamp: string;
  nextSteps: string[];
};

@Component({
  selector: 'app-root',
  imports: [CurrencyPipe, DatePipe, IonApp, IonContent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  protected readonly apiHealth = signal<ApiHealth | null>(null);
  protected readonly apiError = signal('');
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
  }
}
