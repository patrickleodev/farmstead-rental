import { Injectable } from '@nestjs/common';

export type HealthCheck = {
  message: string;
  environment: string;
  timestamp: string;
  nextSteps: string[];
};

@Injectable()
export class AppService {
  getHealth(): HealthCheck {
    return {
      message: 'Farmstead Rental API online',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
      nextSteps: [
        'Modelar reservas e clientes',
        'Criar autenticacao',
        'Persistir dados em Postgres',
      ],
    };
  }
}
