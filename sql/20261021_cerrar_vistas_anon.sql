-- ATS (mojbhvphztnadndhnraf) — cerrar las vistas SECURITY DEFINER expuestas a `anon`.
--
-- ✅ APLICADO el 21-oct-2026 como migración `cerrar_vistas_security_definer_anon`.
--    Queda aquí como registro de qué se hizo y por qué.
--
-- QUÉ PASA HOY
-- Cinco vistas del esquema `public` están definidas como SECURITY DEFINER y
-- tienen SELECT concedido a `anon` y a `authenticated`. SECURITY DEFINER
-- significa que la vista corre con los privilegios de quien la creó, así que
-- NO respeta el RLS de las tablas que lee. Como viven en `public`, PostgREST
-- las publica en /rest/v1/<vista>.
--
-- Resultado: cualquiera que tenga la llave `anon` del proyecto puede leer
-- resultados de pruebas, rankings y evaluaciones de los 950 candidatos, sin
-- iniciar sesión y sin que el RLS intervenga.
--
-- POR QUÉ `security_invoker` Y NO SOLO `REVOKE`
-- Con security_invoker la vista pasa a evaluarse con los permisos de quien
-- consulta, de modo que el RLS vuelve a aplicar. Las apps no se ven afectadas:
-- consultan con `service_role`, que ignora RLS por diseño. El REVOKE es el
-- cinturón además del tirante.
--
-- Requiere Postgres 15 o superior. Este proyecto corre 17.6.1, así que aplica.
-- Reversible: para deshacer, `set (security_invoker = off)` y volver a conceder.

begin;

alter view public.ts_bat_sesiones_resumen set (security_invoker = on);
alter view public.ts_bat_ranking          set (security_invoker = on);
alter view public.ts_bat_pendientes       set (security_invoker = on);
alter view public.ht_evaluacion_vigente   set (security_invoker = on);
alter view public.ht_adjuntos_resumen     set (security_invoker = on);

-- Ninguna página del ATS consulta estas vistas con la llave anon: el cliente
-- anónimo (`src/lib/supabase-client.ts`) no tiene consumidores y la variable
-- NEXT_PUBLIC_SUPABASE_ANON_KEY ni siquiera está configurada en Vercel.
-- Quitar el permiso no rompe nada que hoy funcione.
revoke all on public.ts_bat_sesiones_resumen from anon, authenticated;
revoke all on public.ts_bat_ranking          from anon, authenticated;
revoke all on public.ts_bat_pendientes       from anon, authenticated;
revoke all on public.ht_evaluacion_vigente   from anon, authenticated;
revoke all on public.ht_adjuntos_resumen     from anon, authenticated;

commit;

-- Verificación: debe devolver CERO filas.
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
   and table_name in (
     'ts_bat_sesiones_resumen', 'ts_bat_ranking', 'ts_bat_pendientes',
     'ht_evaluacion_vigente', 'ht_adjuntos_resumen'
   );
