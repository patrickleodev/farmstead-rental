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
import { ChatMessage } from '../chat/chat-message.entity';

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

export type CalendarChangedEvent = {
  action: 'created' | 'updated' | 'removed';
  entryId: number;
  changedAt: string;
};

export type ChatMessageEvent = {
  id: number;
  author: string;
  content: string;
  createdAt: string;
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

  notifyCalendarChanged(
    action: CalendarChangedEvent['action'],
    entryId: number,
  ) {
    this.server.emit('calendar:changed', {
      action,
      entryId,
      changedAt: new Date().toISOString(),
    } satisfies CalendarChangedEvent);
  }

  notifyChatMessage(message: ChatMessage) {
    this.server.emit('chat:message', {
      id: message.id,
      author: message.author,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    } satisfies ChatMessageEvent);
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
