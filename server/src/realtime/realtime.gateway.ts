import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { corsOrigin } from '../cors.config';

type OperationPingPayload = {
  source?: string;
};

export type OperationRealtimeState = {
  channel: 'operation';
  connectedClients: number;
  message: string;
  timestamp: string;
};

export type OperationPong = {
  clientId: string;
  message: string;
  receivedAt: string;
  source: string;
};

@WebSocketGateway({
  cors: {
    origin: corsOrigin,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  handleConnection() {
    this.broadcastState('Cliente conectado ao painel em tempo real');
  }

  handleDisconnect() {
    this.broadcastState('Cliente saiu do painel em tempo real');
  }

  @SubscribeMessage('operation:ping')
  handleOperationPing(
    @MessageBody() payload: OperationPingPayload | undefined,
    @ConnectedSocket() client: Socket,
  ): OperationPong {
    const response: OperationPong = {
      clientId: client.id,
      message: 'Realtime operacional',
      receivedAt: new Date().toISOString(),
      source: payload?.source ?? 'painel',
    };

    client.emit('operation:pong', response);
    this.broadcastState('Ping recebido do painel');

    return response;
  }

  private broadcastState(message: string) {
    this.server.emit('operation:state', this.buildState(message));
  }

  private buildState(message: string): OperationRealtimeState {
    return {
      channel: 'operation',
      connectedClients: this.server.sockets.sockets.size,
      message,
      timestamp: new Date().toISOString(),
    };
  }
}
