import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type HealthCheck = {
  message: string;
  environment: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
  nextSteps: string[];
};

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getHealth(): HealthCheck {
    return {
      message: 'Farmstead Rental API online',
      environment: process.env.NODE_ENV ?? 'development',
      database: this.dataSource.isInitialized ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      nextSteps: [
        'Modelar reservas e clientes',
        'Criar autenticacao',
        'Criar migrations do TypeORM',
      ],
    };
  }
}
