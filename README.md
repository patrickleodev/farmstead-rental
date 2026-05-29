# farmstead-rental

Aplicativo full-stack para gerenciar os alugueis da chacara.

## Estrutura inicial

- `client`: frontend Angular.
- `server`: backend NestJS.
- `package.json`: scripts de monorepo para rodar tudo pela raiz.

## Rodando localmente

```bash
npm install
npm run dev
```

URLs:

- Frontend: http://localhost:4200
- Backend: http://localhost:3000/api/health

## Docker

```bash
npm run docker:up
```

O Docker sobe dois containers:

- `client`: Angular servido por Nginx em http://localhost:4200
- `server`: NestJS em http://localhost:3000

O Nginx do client encaminha `/api` para o container do server, entao o frontend continua usando a mesma URL relativa.

Para parar:

```bash
npm run docker:down
```

## Mobile com Ionic/Capacitor

O frontend Angular ja esta preparado com Ionic e Capacitor.

Comandos principais:

```bash
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

Notas:

- Android foi configurado para desenvolvimento local usando `http://10.0.2.2:3000/api`, que aponta do emulador Android para o host.
- Em aparelho fisico, troque `client/src/environments/environment.native.ts` para o IP da sua maquina na rede, por exemplo `http://192.168.0.10:3000/api`.
- iOS so abre/compila em macOS com Xcode, mas o projeto nativo ja esta gerado em `client/ios`.
- Antes de publicar app, use uma API HTTPS publica e revise `android:usesCleartextTraffic`.

## Proximos passos sugeridos

1. Modelar reservas, clientes, pagamentos e bloqueios de calendario.
2. Adicionar banco Postgres com TypeORM ou Prisma.
3. Criar autenticacao para separar acesso da familia e administradores.
4. Evoluir o frontend para telas de agenda, cadastro de reserva e financeiro.
5. Quando o fluxo web estiver maduro, empacotar como app com Ionic/Capacitor.
