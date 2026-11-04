-- ============================================================
-- Pruebas complementarias · registro de borradores (DOWN / rollback)
-- Idempotente. Deshace sql/20261104_pruebas_complementarias_envios.sql.
-- ============================================================
-- OJO: borra el historial de borradores registrados en esta tabla. Antes de
-- correrlo en un entorno con datos, respaldar:
--   \copy (select * from public.ht_pruebas_complementarias_envios) to 'pc_envios.csv' csv header
-- No toca ninguna otra tabla (ht_candidates, ts_test_providers y
-- ht_external_test_results quedan igual).
-- La app en 07df374 no usa esta tabla, así que volver a esa imagen y correr
-- este down es seguro. Con la imagen nueva y sin la tabla, el botón sigue
-- creando el borrador pero avisa «el envío NO quedó registrado».

drop table if exists public.ht_pruebas_complementarias_envios;

notify pgrst, 'reload schema';

select 'ht_pruebas_complementarias_envios' as tabla,
       to_regclass('public.ht_pruebas_complementarias_envios') is null as eliminada;
