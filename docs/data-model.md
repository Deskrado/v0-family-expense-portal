# Modelo de Datos MVP

El esquema actual mantiene compatibilidad con la UI existente usando `user_id` en los ABM principales. Tambien deja columnas `family_id` y tablas familiares para evolucionar hacia control compartido por familia sin reescribir el dominio.

## Identidad y Configuracion

- `profiles`: perfil 1:1 con `auth.users`.
- `families`: hogar/familia, moneda base, zona horaria y dia de inicio mensual.
- `family_members`: miembros de una familia con rol `owner`, `admin`, `member` o `viewer`.
- `user_settings`: moneda base, saldo inicial y metas mensual/anual del usuario.

## Catalogos

- `currencies`: monedas globales. Seed inicial: ARS y USD.
- `exchange_rates`: cotizaciones por fecha entre monedas.
- `groups`: grupos de gasto/ingreso, con color, orden y archivo.
- `categories`: categorias de gasto/ingreso, opcionalmente asociadas a grupo y categoria padre.

## Operacion Diaria

- `transactions`: ingresos y gastos en una sola tabla con `type`, `payment_method`, categoria, grupo, moneda, previsto y real.
- `budgets`: presupuesto mensual por categoria o grupo.
- `monthly_savings`: cierre mensual historico o cache de ahorro calculado.

## Tarjetas y Cuotas

- `credit_cards`: tarjetas, limite, cierre, vencimiento, moneda y estado.
- `credit_card_purchases`: compras en cuotas activas. La UI proyecta cuotas futuras desde `start_date`, `installment_amount` y `total_installments`.

## Inversiones

- `investments`: posicion actual, tipo, monto inicial, valor actual, tasa, institucion/ticker y estado.

## Ahorros

- `savings_goals`: metas de ahorro con objetivo, avance actual, fecha y meta mensual.
- `savings_movements`: movimientos historicos de metas para evolucionar desde el ABM simple actual.

## RLS

Las tablas con `user_id` permiten acceso cuando `user_id = auth.uid()`. Si `family_id` esta cargado, tambien permiten lectura a miembros activos de la familia y escritura a `owner`, `admin` o `member`.

`currencies` permite lectura a usuarios autenticados. La escritura de catalogos globales debe hacerse con service role o migraciones.

## Migraciones

Las migraciones viven en `supabase/migrations`.

Comandos:

```bash
pnpm db:migration:new nombre_de_la_migracion
pnpm db:migrate:dry-run
pnpm db:migrate
pnpm db:migrate:local
pnpm db:reset:local
```

`db:migrate` usa `POSTGRES_URL_NON_POOLING` o `POSTGRES_URL` desde `.env`. Si no existen, intenta `supabase db push --linked`.
