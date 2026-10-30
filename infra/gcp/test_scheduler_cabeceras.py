"""Pruebas de scheduler_cabeceras.py con una API falsa (sin Google).

    python3 -I infra/gcp/test_scheduler_cabeceras.py
"""
import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scheduler_cabeceras as sc  # noqa: E402

CRON = "c" * 40
VIEJO = "Bearer viejo"


class ApiFalsa:
    """Tareas en memoria; registra cada llamada. `estado_tras_patch` simula que
    Google dejara una tarea activa; `falla_patch` simula un PATCH rechazado."""

    def __init__(self, estado="PAUSED", estado_tras_patch=None, falla_patch=()):
        self.tareas = {t: {"state": estado, "httpTarget": {
            "uri": f"https://careers.tradingsolutions.com/api/cron/{t}",
            "headers": {"Authorization": VIEJO, "User-Agent": "Google-Cloud-Scheduler"}}}
            for t in sc.TAREAS}
        self.estado_tras_patch = estado_tras_patch
        self.falla_patch = set(falla_patch)
        self.llamadas = []

    def __call__(self, metodo, ruta, cuerpo=None):
        self.llamadas.append((metodo, ruta))
        t = ruta.split("?")[0].split(":")[0]
        if metodo == "GET":
            return copy.deepcopy(self.tareas[t])
        if metodo == "PATCH":
            assert ruta.endswith("?updateMask=httpTarget.headers"), ruta
            if t in self.falla_patch:
                raise OSError("rechazado")
            self.tareas[t]["httpTarget"]["headers"] = cuerpo["httpTarget"]["headers"]
            if self.estado_tras_patch:
                self.tareas[t]["state"] = self.estado_tras_patch
            return copy.deepcopy(self.tareas[t])
        if metodo == "POST" and ruta.endswith(":pause"):
            self.tareas[t]["state"] = "PAUSED"
            return {}
        raise AssertionError(f"llamada no permitida: {metodo} {ruta}")

    def metodos(self, metodo):
        return [r for m, r in self.llamadas if m == metodo]

    def nunca_reanuda(self):
        return not any(":resume" in r for _, r in self.llamadas)


def correr(api, cron=CRON, aplicar=True):
    lineas = []
    try:
        sc.ejecutar(api, cron, aplicar, salida=lineas.append)
        return None, lineas
    except sc.Error as e:
        return str(e), lineas


class Pruebas(unittest.TestCase):
    def test_cron_invalido_no_llama_a_la_api(self):
        for malo in ("[SENSITIVE]", "corto", " " + "c" * 40, "c" * 40 + "\n"):
            api = ApiFalsa()
            error, _ = correr(api, cron=malo)
            self.assertIn("forma inválida", error)
            self.assertEqual(api.llamadas, [])

    def test_tarea_no_pausada_detiene_sin_patch(self):
        api = ApiFalsa(estado="ENABLED")
        error, _ = correr(api)
        self.assertIn("no está en PAUSED", error)
        self.assertEqual(api.metodos("PATCH"), [])

    def test_validar_no_escribe(self):
        api = ApiFalsa()
        error, lineas = correr(api, aplicar=False)
        self.assertIsNone(error)
        self.assertEqual([m for m, _ in api.llamadas], ["GET"] * 4)
        self.assertTrue(any("Solo validación" in l for l in lineas))

    def test_reemplaza_solo_authorization_y_conserva_otros(self):
        api = ApiFalsa()
        error, _ = correr(api)
        self.assertIsNone(error)
        for t in sc.TAREAS:
            h = api.tareas[t]["httpTarget"]["headers"]
            self.assertEqual(h["Authorization"], f"Bearer {CRON}")
            self.assertEqual(h["User-Agent"], "Google-Cloud-Scheduler")
            self.assertEqual(set(h), {"Authorization", "User-Agent"})
            self.assertTrue(api.tareas[t]["httpTarget"]["uri"].endswith(t))

    def test_quedan_pausadas_y_nunca_reanuda(self):
        api = ApiFalsa()
        correr(api)
        self.assertTrue(all(x["state"] == "PAUSED" for x in api.tareas.values()))
        self.assertTrue(api.nunca_reanuda())
        self.assertEqual(api.metodos("POST"), [])

    def test_si_google_la_activa_se_repausa_y_falla(self):
        api = ApiFalsa(estado_tras_patch="ENABLED")
        error, _ = correr(api)
        self.assertIn("Con problemas", error)
        self.assertEqual(len(api.metodos("POST")), 4)
        self.assertTrue(all(x["state"] == "PAUSED" for x in api.tareas.values()))
        self.assertTrue(api.nunca_reanuda())

    def test_fallo_patch_no_reporta_exito_y_revisa_estados(self):
        api = ApiFalsa(falla_patch={"ats-digest-email"})
        error, lineas = correr(api)
        self.assertIn("ats-digest-email", error)
        self.assertEqual(api.tareas["ats-digest-email"]["httpTarget"]["headers"]["Authorization"], VIEJO)
        self.assertFalse(any("ats-digest-email: header Authorization actualizado" in l for l in lineas))
        # Las 4 se releen al final, también la que falló.
        self.assertEqual(len(api.metodos("GET")), 8)
        self.assertTrue(api.nunca_reanuda())

    def test_salida_nunca_contiene_el_secreto(self):
        for api in (ApiFalsa(), ApiFalsa(falla_patch={"ats-run-reminders"}), ApiFalsa(estado_tras_patch="ENABLED")):
            error, lineas = correr(api)
            self.assertFalse(any(CRON in l for l in lineas + [error or ""]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
