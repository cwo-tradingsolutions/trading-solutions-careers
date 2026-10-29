import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAdminRequest } from '@/lib/bateria/auth';
import { getAnthropic } from '@/lib/anthropic';
import { calcularMatch } from '@/lib/bateria/match';
import { perfilDe, perfilPorTitulo } from '@/lib/bateria/perfiles-cargo';
import { FACTORS, MOTIVADORES, INTEGRIDAD_LABEL, RAZONAMIENTO_LABEL, DISC_PATRONES, ARQUETIPOS } from '@/lib/bateria/interpretacion';
import { pruebasExternasParaAgente } from '@/lib/pruebas-externas';
import { entrevistaParaAgente } from '@/lib/informe-candidato';
import { isPreviewMutationBlocked } from '@/lib/preview-readonly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MODEL = 'claude-sonnet-4-5';

/** El informe completo en una sola llamada pedia ~4.000 tokens de salida:
 *  entre 90 y 150 s, y si la API reintentaba se iba mucho mas alla. El boton
 *  se quedaba pensando sin devolver nada. Ahora son dos llamadas en paralelo
 *  con timeout propio: pase lo que pase la ruta responde, con exito o con la
 *  causa exacta.
 *
 *  El cupo de salida NO se reparte por igual. La primera version daba 2.600 a
 *  cada mitad y la de decision se quedaba sin espacio antes de cerrar el JSON:
 *  cinco preguntas de entrevista con su porque y su que-escuchar, mas el plan
 *  de entrada, ocupan bastante mas que el resumen y las fortalezas. */
const TIMEOUT_MODELO_MS = 170_000;

const REGLAS = `Eres psicólogo organizacional con tarjeta profesional, redactando el informe de una batería de selección propia de Trading Solutions (freight forwarder, Barranquilla).

REGLAS QUE NO PUEDES ROMPER:

1. Los puntajes te llegan calculados. NUNCA inventes, estimes ni corrijas un número. Si necesitas citar una cifra, usa exactamente la que recibiste.
2. NO diagnostiques. "Estabilidad emocional" es el nombre de una escala laboral, no una condición de salud. Prohibido: ansiedad, depresión, trastorno, patología, terapia, y cualquier inferencia clínica.
3. Los puntajes DISC son ipsativos: dicen qué eje pesa más DENTRO de la persona. Nunca digas que es "más dominante que otros candidatos".
4. Si la validez viene marcada como no interpretable o con reservas, DILO PRIMERO y no caracterices a la persona como si el perfil fuera confiable.

4.b. Y NO CONCLUYAS CON ESOS PUNTAJES. Declarar que la sesión es inválida y
   acto seguido usar los números igual —"aun si tomáramos los puntajes como
   reales…"— es contradecirse: si el protocolo no es interpretable, esos
   puntajes no son evidencia de nada, tampoco en contra de la persona. Con
   validez "no_interpretable" la recomendación es OBLIGATORIAMENTE
   "no_concluyente". Con "con_reservas" no puedes recomendar "no_avanzar"
   apoyándote solo en puntajes de escala: hace falta conducta observada.

4.c. Los eventos de proctoring te llegan DESGLOSADOS. Los de copia —paste,
   copy, shortcut, contextmenu— son la señal de que alguien pudo estar
   resolviendo con ayuda. Los de ambiente —tab_blur, cam_lost— son una
   notificación, una llamada, la cámara que se cae. No los mezcles ni los
   cites como un solo total: di cuántos fueron de cada clase. Un evento de
   ambiente no es una falta de honestidad.

4.d. Deseabilidad social alta significa que la persona trató de quedar bien.
   Si además sale BAJA en integridad, eso es raro: quien maquilla contesta lo
   que suena correcto y sale alto. Esa combinación sugiere respuestas ruidosas
   —distracción, apuro— antes que un rasgo. Dilo así, no al revés.
5. Escribe en español colombiano, directo y concreto. Nada de "el candidato demuestra una notable capacidad". Frases cortas. Ejemplos observables de trabajo.
6. Cada afirmación se apoya en un dato que recibiste. Si no tienes evidencia para algo, no lo digas.
7. Nunca menciones características protegidas: edad, sexo, origen, religión, salud, situación familiar.

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después.`;

/** Parte 1 · quién es y cómo trabaja. */
const SISTEMA_PERFIL = `${REGLAS}

Forma exacta del JSON:
{
  "resumen": "2 o 3 párrafos sobre cómo trabaja esta persona",
  "fortalezas": [{"titulo":"","detalle":"","evidencia":""}],
  "oportunidades": [{"titulo":"","detalle":"","evidencia":""}],
  "loQueNoAfirma": ""
}
3 a 5 fortalezas, 2 a 4 oportunidades. En "loQueNoAfirma" declara los límites del instrumento: qué NO mide esta batería y qué queda por verificar en assessment presencial y referencias.`;

/** Parte 2 · qué hacer con esta persona en este cargo. */
const SISTEMA_DECISION = `${REGLAS}

Forma exacta del JSON:
{
  "compatibilidad": {"lectura":"", "aFavor":[""], "riesgos":[""]},
  "preguntasEntrevista": [{"pregunta":"","porque":"","queEscuchar":""}],
  "planEntrada": [{"periodo":"","foco":"","porque":""}],
  "conclusion": {"recomendacion":"avanzar|entrevistar_con_reservas|no_avanzar|no_concluyente","texto":""}
}
"no_concluyente" existe porque antes no existía: el esquema obligaba a elegir entre avanzar y no avanzar aunque la sesión fuera inválida, y con integridad baja el modelo elegía no avanzar. La forma del formulario fabricaba el rechazo. Cuando no hay con qué concluir, esa es la respuesta correcta.

4 preguntas de entrevista conductual (STAR), cada una dirigida a verificar un punto dudoso del perfil. 3 periodos de plan de entrada (0-30, 30-60, 60-90 días) pensados para que el jefe los use desde el onboarding. Sé concreto y breve en cada campo: dos o tres frases, no párrafos.`;

/** Parte 3 · cómo se lee la batería propia junto a las pruebas de afuera.
 *
 *  POR QUÉ ES UNA PARTE APARTE Y NO UN PÁRRAFO MÁS
 *  Trading Solutions aplica pruebas en seis plataformas distintas. Cada una
 *  llega con su propio informe, y nadie tiene tiempo de leer seis PDF y
 *  acordarse de qué decía el primero. Lo que no se puede ver leyéndolos por
 *  separado es justo lo que decide: si tres instrumentos distintos dicen lo
 *  mismo, eso es un hecho; si solo lo dice uno, es una hipótesis.
 *
 *  La regla dura: el % de match NO cambia. Sale de la batería propia, que es
 *  la única con perfil de cargo versionado y fundamento escrito detrás. Las
 *  externas entran como evidencia que confirma o pone en duda, nunca como
 *  números que se promedian — promediarlas sería inventar equivalencias entre
 *  escalas que no miden lo mismo. */
const SISTEMA_CRUCE = `${REGLAS}

Te llegan hasta TRES cosas: los resultados de la batería propia de Trading
Solutions (con perfil de cargo versionado detrás), los resultados de pruebas
externas de proveedores distintos (DISC, 16personalities, IQ, BETA,
motivadores, Máquina de Turing) y, cuando existe, la evaluación de la
entrevista inicial contra los 16 principios de la compañía. Tu única tarea es
leerlas juntas.

LA ENTREVISTA PESA DISTINTO. Las pruebas miden lo que la persona dice de sí
misma respondiendo escalas; la entrevista registra lo que contó que hizo, con
situaciones y citas. Es conducta observada, y es lo único aquí que puede
confirmar o tumbar un puntaje. Cuando una escala y la entrevista se
contradigan, NO resuelvas a favor de la escala: nombra las dos y di qué haría
falta para zanjarlo. Y si la entrevista no se ha hecho, dilo entre los huecos.

NO COMPARES UN DISC CON OTRO DISC. «DISC» es una familia de instrumentos, no
un instrumento: cada proveedor tiene su banco de ítems y sus baremos, el
nuestro entrega tres gráficas —máscara social, bajo presión y natural— y el
gratuito entrega una sola, y todos son ipsativos. Enfrentar un eje contra el
otro produce una diferencia que no significa nada. Lo que sí se compara son
AFIRMACIONES DE CONDUCTA: «es metódico» dicho por tres fuentes es un hecho,
aunque los números no se parezcan.

REGLAS PROPIAS DE ESTA PARTE:

A. NO produces ningún puntaje ni porcentaje nuevo. El match ya está calculado
   y no se toca. No promedies escalas de proveedores distintos: un DISC de 0 a
   100 y un CI de 130 no viven en la misma escala, y forzarlos a un número
   común es inventar una equivalencia que no existe.
B. Clasifica cada hallazgo con una de estas cuatro señales:
   · "convergente" — dos o más instrumentos independientes dicen lo mismo.
     Nombra cuáles y con qué cifra cada uno. Es lo más sólido del expediente.
   · "contradictoria" — dos instrumentos dicen cosas distintas. NO decidas
     cuál tiene razón: descríbelo y conviértelo en algo que la entrevista
     pueda resolver.
   · "alerta" — una brecha frente a lo que el cargo exige, la mida una sola
     prueba o varias.
   · "hueco" — una prueba que no se presentó, no se calificó o no se verificó.
     La ausencia es parte del resultado: un expediente incompleto alcanza para
     entrevistar, no para decidir, y hay que decirlo con esas palabras.
C. Si una prueba externa no entrega datos utilizables —por ejemplo un DISC que
   la propia plataforma declara "balanceado" y para el que se niega a emitir
   informe— dilo y no la interpretes. Un resultado sin relieve no es un
   resultado neutro: es un dato que no sirve.
D. Entre 3 y 6 hallazgos. Ordena por lo que más mueve la decisión.
E. Marca "soloInterno": true en un hallazgo cuando para entenderlo haya que
   hablar de validez de la medición, de eventos de proctoring o de puntajes
   sueltos de escala. Ese informe también lo leen el líder del área y el CEO,
   y esas tres cosas son lecturas internas de Talent: en sus versiones se
   ocultan. Todo lo demás va con "soloInterno": false.

Forma exacta del JSON:
{
  "lecturaCruzada": [{"senal":"convergente|contradictoria|alerta|hueco","titulo":"","texto":"","soloInterno":false}],
  "suficiencia": {"alcanza":"para_decidir|para_entrevistar|insuficiente","texto":""}
}
"titulo" es una frase corta, afirmativa y concreta. "texto" son dos o tres
frases que citen las cifras exactas de los instrumentos que nombras.`;

type Parte = { ok: true; datos: any } | { ok: false; error: string; crudo?: string };

async function redactar(sistema: string, insumo: unknown, maxTokens: number): Promise<Parte> {
  try {
    const client = getAnthropic();
    const r = await client.messages
      .stream(
        {
          model: MODEL,
          max_tokens: maxTokens,
          system: sistema,
          messages: [{ role: 'user', content: `Redacta tu parte del informe con estos datos:\n\n${JSON.stringify(insumo, null, 2)}` }],
        },
        { timeout: TIMEOUT_MODELO_MS, maxRetries: 1 }
      )
      .finalMessage();

    const texto = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    if (r.stop_reason === 'max_tokens') return { ok: false, error: `El modelo se quedó sin espacio antes de cerrar el JSON (tope ${maxTokens} tokens).` };
    try {
      return { ok: true, datos: JSON.parse(limpio) };
    } catch {
      return { ok: false, error: 'El agente no devolvió JSON válido', crudo: limpio.slice(0, 400) };
    }
  } catch (e: any) {
    const status = e?.status ? ` (HTTP ${e.status})` : '';
    return { ok: false, error: `${e?.name === 'APIConnectionTimeoutError' ? 'El modelo no respondió en 170 s' : e?.message ?? 'fallo al llamar al modelo'}${status}` };
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (isPreviewMutationBlocked()) {
    return NextResponse.json({ error: "preview read-only" }, { status: 403 });
  }

  if (!isAdminRequest(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const t0 = Date.now();

  try {
    const { data: sesion, error } = await supabaseAdmin
      .from('ts_bat_sessions').select('*').eq('token', params.token).single();
    if (error || !sesion) return NextResponse.json({ error: `Sesión no encontrada: ${error?.message ?? 'sin fila'}` }, { status: 404 });

    const sc: any = sesion.scores;
    if (!sc?.personalidad) {
      return NextResponse.json({ error: 'La sesión no tiene puntajes calculados. Use Recalcular primero.' }, { status: 400 });
    }

    // El desglose de proctoring, para que el agente no lea «42 eventos» como
    // un solo bloque. Copiar y distraerse no son lo mismo.
    const COPIA = ['paste', 'copy', 'shortcut', 'contextmenu'];
    const AMBIENTE = ['tab_blur', 'cam_lost'];
    const { data: evs } = await supabaseAdmin
      .from('ts_bat_events')
      .select('kind')
      .eq('session_id', sesion.id)
      .in('kind', [...COPIA, ...AMBIENTE]);
    const porTipo: Record<string, number> = {};
    for (const e of evs ?? []) porTipo[e.kind] = (porTipo[e.kind] ?? 0) + 1;
    const desglose = {
      intentosDeCopia: COPIA.reduce((a, k) => a + (porTipo[k] ?? 0), 0),
      eventosDeAmbiente: AMBIENTE.reduce((a, k) => a + (porTipo[k] ?? 0), 0),
      porTipo,
      nota:
        'Los de copia hablan de conducta; los de ambiente, del lugar donde presentó. ' +
        'No los sumes en un solo número.',
    };

    const body = await req.json().catch(() => ({}));
    const perfilKey = body?.perfil ?? sesion.perfil_cargo ?? perfilPorTitulo(sesion.vacancy_title);
    const perfil = perfilDe(perfilKey);
    const match = calcularMatch(sc, perfilKey);

    // Se le entrega TODO con etiquetas legibles: el agente no debe adivinar
    // que significa 'RES-dis' ni reconstruir escalas.
    const insumo = {
      candidato: sesion.candidate_name,
      cargo: perfil?.nombre ?? sesion.vacancy_title ?? 'Sin perfil de cargo definido',
      perfilCargo: perfil
        ? { nombre: perfil.nombre, version: perfil.version, descripcion: perfil.descripcion, fundamento: perfil.fundamento, criticos: perfil.criticos }
        : null,
      validez: sesion.validity,
      proctoring: desglose,
      arquetipo: ARQUETIPOS[sc.personalidad.arquetipo] ?? ARQUETIPOS.EQUILIBRADO,
      rasgos: Object.entries(FACTORS).map(([k, f]) => ({
        rasgo: f.label,
        puntaje: sc.personalidad.factores?.[k],
        referenciaDelCargo: perfil?.bigfive?.[k as keyof typeof perfil.bigfive] ?? null,
        facetas: f.facets.map((fa) => ({ faceta: fa.label, puntaje: sc.personalidad.facetas?.[fa.key] })),
      })),
      estilo: {
        patron: DISC_PATRONES[sc.disc?.patron]?.nombre ?? null,
        descripcionPatron: DISC_PATRONES[sc.disc?.patron]?.descripcion ?? null,
        natural: sc.disc?.natural,
        mascaraSocial: sc.disc?.mascara,
        bajoPresion: sc.disc?.presion,
        referenciaDelCargo: perfil?.disc ?? null,
        afinidadOtrosCargos: sc.disc?.afinidades?.slice(0, 4),
      },
      motivadores: Object.entries(sc.motivadores?.pct ?? {}).map(([k, v]) => ({
        motivador: MOTIVADORES[k]?.label ?? k, puntaje: v,
        loSostiene: MOTIVADORES[k]?.loSostiene, loHaceIrse: MOTIVADORES[k]?.loHaceIrse,
      })),
      razonamiento: {
        total: sc.razonamiento?.total,
        porAptitud: Object.entries(sc.razonamiento?.bySubdomain ?? {}).map(([k, v]: any) => ({
          aptitud: RAZONAMIENTO_LABEL[k] ?? k, ...v,
        })),
      },
      integridad: {
        global: sc.integridad?.permisividadGlobal,
        porDimension: Object.entries(sc.integridad?.byDimension ?? {}).map(([k, v]) => ({
          dimension: INTEGRIDAD_LABEL[k] ?? k, puntaje: v,
        })),
        nota: 'Más alto es mejor: menor permisividad ante la conducta descrita.',
      },
      match,
    };

    // Las pruebas de los otros proveedores, si la persona tiene ficha en el
    // funnel. Sin ellas el agente solo puede hablar de la batería propia, que
    // es como estaba antes: correcto pero ciego a la mitad del expediente.
    const externas = sesion.ht_candidate_id
      ? await pruebasExternasParaAgente(String(sesion.ht_candidate_id))
      : [];

    // La entrevista inicial, si ya se hizo. Es la conducta observada contra la
    // que se contrastan las escalas.
    const entrevista = sesion.ht_candidate_id
      ? await entrevistaParaAgente(String(sesion.ht_candidate_id))
      : null;

    // Tres partes al tiempo. Antes era una sola llamada larga.
    // El cruce solo se pide si hay algo con qué cruzar: pagarle al modelo por
    // comparar la batería contra nada devuelve párrafos de relleno.
    const [pPerfil, pDecision, pCruce] = await Promise.all([
      redactar(SISTEMA_PERFIL, insumo, 3200),
      redactar(SISTEMA_DECISION, insumo, 6000),
      externas.length || entrevista
        ? redactar(SISTEMA_CRUCE, { ...insumo, pruebasExternas: externas, entrevistaInicial: entrevista }, 2800)
        : Promise.resolve({ ok: true, datos: {} } as Parte),
    ]);

    if (!pPerfil.ok || !pDecision.ok) {
      const fallas = [
        !pPerfil.ok ? `perfil: ${pPerfil.error}` : null,
        !pDecision.ok ? `decisión: ${pDecision.error}` : null,
      ].filter(Boolean).join(' · ');
      return NextResponse.json(
        { error: `El psicólogo no pudo terminar (${Math.round((Date.now() - t0) / 1000)} s). ${fallas}` },
        { status: 502 }
      );
    }

    // El cruce no bloquea: si falla, el informe sale igual y la pantalla
    // muestra por qué faltó esa sección. Perder el perfil y la decisión por
    // una tercera parte opcional sería un mal negocio.
    const informe = {
      ...pPerfil.datos,
      ...pDecision.datos,
      ...(pCruce.ok ? pCruce.datos : {}),
      ...(pCruce.ok
        ? {}
        : { lecturaCruzadaError: pCruce.error }),
      pruebasExternasLeidas: externas.length,
    };

    const guardar = {
      informe_ia: { ...informe, modelo: MODEL, generado_at: new Date().toISOString() },
      match_data: match,
      perfil_cargo: perfilKey ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: filas, error: eUpd } = await supabaseAdmin
      .from('ts_bat_sessions').update(guardar).eq('id', sesion.id).select('id');
    if (eUpd || !filas?.length) {
      // El informe existe; lo devolvemos aunque no se haya podido guardar,
      // para que el trabajo del modelo no se pierda por un problema de tabla.
      return NextResponse.json(
        { informe: guardar.informe_ia, match, aviso: `Se generó pero NO se guardó: ${eUpd?.message ?? 'cero filas actualizadas'}. Falta correr el SQL del 10-sep.` },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { informe: guardar.informe_ia, match, ms: Date.now() - t0 },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('bateria/informe-ia', err);
    return NextResponse.json({ error: `${err?.message ?? 'Error interno'} · ${Math.round((Date.now() - t0) / 1000)} s` }, { status: 500 });
  }
}
