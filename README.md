# farmstead-rental

Aplicativo full-stack para gerenciar os alugueis da chacara.

## Estrutura inicial

- `client`: frontend Angular.
- `server`: backend NestJS.
- `package.json`: scripts de monorepo para rodar tudo pela raiz.

## Rodando localmente

```powershell
npm install
Copy-Item server\.env.example server\.env
npm run dev
```

URLs:

- Frontend: http://localhost:4200
- Backend: http://localhost:3000/api/health

Antes de subir o backend fora do Docker, garanta que existe um Postgres local usando as credenciais de `server/.env`, ou ajuste essas variaveis para o seu banco de desenvolvimento.

## Banco de dados

O backend usa NestJS com TypeORM conectado ao Postgres do Supabase. A configuracao fica em `server/src/database/typeorm.config.ts` e tambem alimenta o `DataSource` em `server/src/database/data-source.ts` para migrations.

Arquivos de ambiente:

- `server/.env`: desenvolvimento local e Docker, usando Postgres local.
- `server/.env.production`: producao, usando Supabase.
- `server/.env.example`: modelo sem segredo para versionar.

Comandos principais:

```bash
npm run migration:create -w server -- src/database/migrations/NomeDaMigration
npm run migration:generate -w server -- src/database/migrations/NomeDaMigration
npm run migration:run -w server
npm run migration:revert -w server
```

Por padrao, `TYPEORM_SYNC=false`; use migrations para evoluir o banco no Supabase.

### Calendário de gestão

O calendário é uma área interna para controlar a disponibilidade da chácara. Uma data sem
registro é considerada **livre**; os registros podem ser **alugados** ou **bloqueados**
(manutenção, uso próprio etc.). Ao remover um registro, suas datas voltam a ficar livres.
Os aluguéis também guardam a situação da reserva, observações, valor total, sinal, valor já
pago e o saldo pendente calculado automaticamente.

Antes de usar a agenda pela primeira vez, aplique a migration:

```bash
npm run migration:run -w server
```

Rotas internas disponíveis:

- `GET /api/calendar-entries?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/calendar-entries`
- `DELETE /api/calendar-entries/:id`

## Docker

```bash
npm run docker:up
```

O Docker sobe dois containers:

- `client`: Angular servido por Nginx em http://localhost:4200
- `server`: NestJS em http://localhost:3000
- `database`: Postgres local para desenvolvimento

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

## Google authentication and routes

The management area requires an authorized Google account. Configure these values in `server/.env` before starting the API:

- `GOOGLE_CLIENT_ID`: OAuth 2.0 Web client ID created in Google Cloud.
- `AUTH_JWT_SECRET`: random secret with at least 32 characters.
- `ADMIN_EMAILS`: comma-separated list of Google accounts allowed to manage the property.

In Google Cloud, add the web origin used by the app, such as `http://localhost:4200`, to the OAuth client configuration.

Internal application routes:

- `/login`: Google sign-in.
- `/`: dashboard and audit history.
- `/calendario`: rental calendar.
- iOS so abre/compila em macOS com Xcode, mas o projeto nativo ja esta gerado em `client/ios`.
- Antes de publicar app, use uma API HTTPS publica e revise `android:usesCleartextTraffic`.

## Realtime e deploy

Estado atual:

- Local: frontend/app -> backend NestJS -> Postgres local no Docker.
- Producao planejada: frontend/app -> API HTTPS publica -> Supabase Postgres.
- Supabase entra como banco online, e pode entrar depois com Auth, Storage e Realtime. Ele nao hospeda o backend NestJS deste projeto.
- O backend ja tem uma base Socket.IO para eventos em tempo real. O site/app mostra o status do canal e permite testar um ping realtime.

Eventos Socket.IO iniciais:

- `operation:state`: servidor -> clientes, com mensagem, horario e quantidade de clientes conectados.
- `operation:ping`: cliente -> servidor, usado para testar conectividade.
- `operation:pong`: servidor -> cliente, resposta do teste de conectividade.
- `calendar:changed`: servidor -> clientes, enviado ao criar ou remover um período; as agendas conectadas recarregam automaticamente.
- `chat:message`: servidor -> clientes, enviado quando um administrador publica uma mensagem no chat interno.

Proxies:

- `client/proxy.conf.json` encaminha `/api` e `/socket.io` no `ng serve`.
- `client/nginx.conf` encaminha `/api` e `/socket.io` no Docker.

Deploy recomendado:

1. Banco: Supabase Postgres.
2. Backend NestJS: Render, Railway, Fly.io ou VPS, usando `server/Dockerfile`.
3. Frontend Angular: Vercel/Netlify/Cloudflare Pages, ou junto do backend via Docker/Nginx.
4. App Android/iOS: apontar `environment.native.ts` para a API HTTPS publica.

Notas para revisar antes de publicar:

- Nao versionar `.env.production` nem URLs com senha.
- Em producao, trocar IP local por API HTTPS publica.
- Definir `CORS_ORIGIN` com os dominios reais do frontend e do app.
- Criar entidades, migrations e regras de negocio antes de publicar fluxo real de reservas.
- Decidir se o realtime final sera Socket.IO no backend, Supabase Realtime, ou uma combinacao dos dois.

## Proximos passos sugeridos

1. Modelar reservas, clientes, pagamentos e bloqueios de calendario.
2. Criar as primeiras entidades e migrations do TypeORM.
3. Criar autenticacao para separar acesso da familia e administradores.
4. Evoluir o frontend para telas de agenda, cadastro de reserva e financeiro.
5. Quando o fluxo web estiver maduro, empacotar como app com Ionic/Capacitor.
