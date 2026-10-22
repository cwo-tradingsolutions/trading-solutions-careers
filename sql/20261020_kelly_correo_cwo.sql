-- Kelly pasó de k.castaneda@ a cwo@tradingsolutions.com al recibir el cargo de
-- CWO el 7-oct-2026. Su ficha de reclutadora quedó sembrada con el correo viejo
-- en 20260923_reclutadores.sql, así que al entrar al ATS con cwo@ no encontraba
-- su cuenta y las vacantes de las que es dueña seguían firmando con el anterior.
--
-- Se ACTUALIZA la fila, no se crea una nueva: ht_vacancies.owner_recruiter_id
-- apunta a su id, y una fila nueva dejaría las vacantes colgando de la vieja.
--
-- Idempotente: correrlo dos veces no hace nada la segunda.

begin;

-- Si por algún intento previo ya existe una fila con cwo@, nos quedamos con la
-- original (la que tiene las vacantes) y quitamos la duplicada antes de renombrar.
delete from ts_recruiters
 where lower(email) = 'cwo@tradingsolutions.com'
   and exists (
     select 1 from ts_recruiters
      where lower(email) = 'k.castaneda@tradingsolutions.com'
   );

update ts_recruiters
   set email = 'cwo@tradingsolutions.com',
       cargo = 'Chief Wellness Officer · Trading Solutions'
 where lower(email) = 'k.castaneda@tradingsolutions.com';

commit;

-- Verificación: debe devolver una sola fila, con cwo@ y sus vacantes.
select r.id,
       r.nombre,
       r.email,
       r.rol,
       r.cargo,
       (select count(*) from ht_vacancies v where v.owner_recruiter_id = r.id) as vacantes_a_su_cargo
  from ts_recruiters r
 where lower(r.email) in ('cwo@tradingsolutions.com', 'k.castaneda@tradingsolutions.com');
