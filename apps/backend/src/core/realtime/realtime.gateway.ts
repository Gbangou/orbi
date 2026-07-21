import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { RealtimeService } from './realtime.service';
import { parseRealtimeEvent, type RealtimeEventFilter } from './realtime.types';

type AuthenticatedSocket = WebSocket & {
  isAlive: boolean;
  subscriptionId: string | null;
  filterOptions: RealtimeEventFilter | null;
};

/**
 * WebSocket gateway — remplace SSE pour les réseaux mobiles africains.
 *
 * Avantages vs SSE:
 * - Reconnexion automatique plus rapide sur réseau instable
 * - Heartbeat bidirectionnel (détection de déconnexion en 30s)
 * - Moins de proxies qui cassent la connexion keep-alive
 *
 * Compatible avec le WebSocket natif de React Native (pas de lib externe).
 *
 * Protocole client:
 *   → { type: "subscribe", role: "rider"|"driver", actorId, riderId?, driverId? }
 *   ← { type: "subscribed", message: "ok" }
 *   ← { type: "event", ...RealtimeEvent }
 *   → { type: "ping" }
 *   ← { type: "pong" }
 */
@WebSocketGateway({
  path: '/api/v1/realtime/ws',
  transports: ['websocket'],
  cors: {
    origin: '*',
    methods: ['GET'],
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionCount = 0;

  constructor(private readonly realtimeService: RealtimeService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket gateway initialized on /api/v1/realtime/ws');

    // Heartbeat toutes les 30s — détecte les connexions mortes (réseau africain)
    this.heartbeatInterval = setInterval(() => {
      (server.clients as Set<AuthenticatedSocket>).forEach((ws) => {
        if (!ws.isAlive) {
          this.logger.debug('Terminating stale WebSocket connection');
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30_000);

    server.on('close', () => {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    });
  }

  handleConnection(client: AuthenticatedSocket) {
    client.isAlive = true;
    client.subscriptionId = null;
    client.filterOptions = null;
    this.connectionCount++;
    this.logger.debug(`WS connected — total: ${this.connectionCount}`);

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        this.handleClientMessage(client, message);
      } catch {
        this.sendError(client, 'invalid_json');
      }
    });
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectionCount--;
    this.logger.debug(`WS disconnected — total: ${this.connectionCount}`);
  }

  private handleClientMessage(
    client: AuthenticatedSocket,
    message: Record<string, unknown>,
  ) {
    const type = message['type'];

    if (type === 'ping') {
      client.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      return;
    }

    if (type === 'subscribe') {
      this.handleSubscribe(client, message);
      return;
    }

    if (type === 'unsubscribe') {
      client.subscriptionId = null;
      client.filterOptions = null;
      client.send(JSON.stringify({ type: 'unsubscribed' }));
      return;
    }

    this.sendError(client, 'unknown_message_type');
  }

  private handleSubscribe(
    client: AuthenticatedSocket,
    message: Record<string, unknown>,
  ) {
    const filterOptions: RealtimeEventFilter = {
      role: String(message['role'] ?? 'rider'),
      actorId: message['actorId'] ? String(message['actorId']) : null,
      riderId: message['riderId'] ? String(message['riderId']) : null,
      driverId: message['driverId'] ? String(message['driverId']) : null,
    };

    client.filterOptions = filterOptions;
    client.subscriptionId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Subscribe to realtime stream and forward events
    const stream$ = this.realtimeService.stream(filterOptions);
    const subscription = stream$.subscribe({
      next: (messageEvent) => {
        if (client.readyState === WebSocket.OPEN) {
          const realtimeEvent = parseRealtimeEvent(messageEvent.data);
          if (!realtimeEvent) {
            client.send(JSON.stringify({ type: messageEvent.type ?? 'event' }));
            return;
          }

          client.send(
            JSON.stringify({
              type: 'event',
              eventType: realtimeEvent.type,
              channel: realtimeEvent.channel,
              entityId: realtimeEvent.entityId,
              actorRole: realtimeEvent.actorRole ?? null,
              payload: realtimeEvent.payload ?? {},
            }),
          );
        } else {
          subscription.unsubscribe();
        }
      },
      error: () => {
        if (client.readyState === WebSocket.OPEN) {
          this.sendError(client, 'stream_error');
        }
        subscription.unsubscribe();
      },
    });

    // Cleanup on disconnect
    client.once('close', () => subscription.unsubscribe());

    client.send(
      JSON.stringify({
        type: 'subscribed',
        subscriptionId: client.subscriptionId,
        message: 'Connexion realtime etablie.',
      }),
    );

    this.logger.debug(
      `Subscribed: role=${filterOptions.role} actor=${filterOptions.actorId}`,
    );
  }

  private sendError(client: AuthenticatedSocket, code: string) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'error', code }));
    }
  }

  snapshot() {
    return {
      connectionCount: this.connectionCount,
      clientCount: this.server?.clients?.size ?? 0,
    };
  }
}
