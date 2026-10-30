/**
 * MARCA · el logo, en un solo lugar
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * La URL del logo estaba escrita a mano en cinco pantallas y ninguna de las
 * dos versiones del CDN servía: las dos son cuadrados OPACOS con solo el
 * símbolo. El `.jpg` mostraba su fondo gris sobre la barra blanca; el `.png`,
 * invertido para el pie negro, se volvía un cuadrado blanco sólido. Ninguno
 * traía el logotipo completo ni transparencia.
 *
 * El archivo de acá es el logotipo completo —símbolo más palabra— recortado y
 * con fondo transparente de verdad, servido desde el propio sitio. Se guarda
 * en negro: sobre fondo oscuro se invierte con CSS, así hay un solo archivo
 * que mantener.
 *
 * Servirlo local y no desde el CDN de la web corporativa también quita una
 * dependencia: si allá reorganizan los archivos, la página de empleo no se
 * queda sin logo.
 */

/** Logotipo completo (símbolo + palabra), negro sobre fondo transparente. */
export const LOGO_TS = "/logo-trading-solutions.png";

/**
 * Solo el símbolo, recortado del mismo archivo para que no se desincronicen.
 *
 * Va en la barra de navegación: ahí el nombre de la compañía ya aparece en el
 * título de la página y en el contenido, así que el logotipo completo repetía
 * la palabra y competía con el menú. En el pie sigue el logotipo entero, que
 * es donde cierra la marca.
 */
export const LOGO_TS_SIMBOLO = "/logo-trading-solutions-simbolo.png";

/**
 * Sobre fondo negro se invierte con CSS en vez de servir un segundo archivo:
 * `brightness-0 invert` deja el logo blanco sólido sea cual sea el color de
 * origen, así que sigue funcionando si mañana cambia el archivo.
 */
export const LOGO_TS_CLASE_EN_OSCURO = "brightness-0 invert";

/**
 * Símbolo del shell Universe (portal público, pack rev F): el mismo SVG que
 * usan Universe About y el clon de Clara, junto a la palabra
 * "Trading Solutions." en texto.
 */
export const UNIVERSE_SIMBOLO =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2032%2032%22%20fill%3D%22none%22%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M3%203h12c.7%200%201.3.3%201.8.8L28%2015c1%201%201%202.6%200%203.5l-4%204c-.5.5-1.1.8-1.8.8H19v-3.2h3.5L28%2014.3%2015.7%202H3v14h3.2V3z%22/%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M29%2029H17c-.7%200-1.3-.3-1.8-.8L4%2017c-1-1-1-2.6%200-3.5l4-4c.5-.5%201.1-.8%201.8-.8H13v3.2H9.5L4%2017.7%2016.3%2030H29V16h-3.2V29z%22/%3E%3C/svg%3E";
