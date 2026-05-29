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
- iOS so abre/compila em macOS com Xcode, mas o projeto nativo ja esta gerado em `client/ios`.
- Antes de publicar app, use uma API HTTPS publica e revise `android:usesCleartextTraffic`.

## Proximos passos sugeridos

1. Modelar reservas, clientes, pagamentos e bloqueios de calendario.
2. Criar as primeiras entidades e migrations do TypeORM.
3. Criar autenticacao para separar acesso da familia e administradores.
4. Evoluir o frontend para telas de agenda, cadastro de reserva e financeiro.
5. Quando o fluxo web estiver maduro, empacotar como app com Ionic/Capacitor.
