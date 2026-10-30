/**
 * Tope mensual en COP que el prefiltro ya usa por vacancy_id.
 * Es el mismo mapa que decide cap_used. No es una estimación:
 * si el id no está acá, no hay tope.
 */
export const PREFILTER_SALARY_CAPS_COP: Record<string, number> = {
  "368006e7-98da-46a2-b871-6b741290821b": 4_000_000, // Pricing Senior
  "c25ce70b-9244-4393-aea6-75372a99a6ef": 4_000_000, // Inside Sales
  "6e4838dd-8aea-4426-bd26-ea588f0f493a": 3_000_000, // Customer Documentation
  "d354c55a-eb1c-4aee-bd02-b0a20162e1f1": 3_500_000, // Pricing Junior
  "8c246bb3-8244-4755-bf92-58c0c627821c": 6_000_000, // Lead Accounting Finance
};
