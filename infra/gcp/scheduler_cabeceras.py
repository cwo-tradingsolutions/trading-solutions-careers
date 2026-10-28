"""Pone el CRON_SECRET vigente en el header Authorization de las 4 tareas del
ATS sin reanudarlas. Para después de cargar un prd-careers-CRON_SECRET nuevo.

Por defecto solo valida (secreto con forma útil, tareas existentes y en
PAUSED). Con --apply reemplaza SOLO Authorization por la API REST y conserva
los demás headers de cada tarea (p. ej. User-Agent): el PATCH lleva el mapa
completo porque updateMask=httpTarget.headers reemplaza el mapa entero. El
secreto no pasa por la línea de comandos ni se imprime. Al final relee las 4
(también las que fallaron) y exige PAUSED; si alguna no lo está, la pausa y
sale con error. Nunca reanuda ni toca IAM.

    python3 -I infra/gcp/scheduler_cabeceras.py            # validar
    python3 -I infra/gcp/scheduler_cabeceras.py --apply    # con GO de Kelly

Pruebas: python3 -I infra/gcp/test_scheduler_cabeceras.py
"""
import json
import os
import subprocess
import sys
import urllib.request

G = os.path.expanduser("~/google-cloud-sdk/bin/gcloud")
P = "wellness-experience-management"
R = "us-west1"
SECRETO = "prd-careers-CRON_SECRET"
TAREAS = ["ats-run-reminders", "ats-digest-email", "ats-morning-brief", "ats-sync-contactos"]
API = f"https://cloudscheduler.googleapis.com/v1/projects/{P}/locations/{R}/jobs"


class Error(Exception):
    """Fallo que detiene el script; el mensaje nunca lleva el secreto."""


def gcloud(*a):
    r = subprocess.run([G, *a, "--project", P], capture_output=True, text=True)
    if r.returncode != 0:
        raise Error(f"gcloud {a[0]} {a[1]} falló")
    return r.stdout


def api_real(token):
    def api(metodo, ruta, cuerpo=None):
        req = urllib.request.Request(f"{API}/{ruta}", method=metodo,
                                     data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                     headers={"Authorization": f"Bearer {token}",
                                              "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    return api


def secreto_util(v):
    # Mismo criterio que el cargador: nada de marcadores de Vercel ni valores cortos.
    return len(v) >= 32 and v.strip() == v and "SENSITIVE" not in v.upper()


def headers_nuevos(tarea, cron):
    """Copia los headers actuales y reemplaza solo Authorization."""
    h = dict(tarea.get("httpTarget", {}).get("headers", {}))
    h["Authorization"] = f"Bearer {cron}"
    return h


def ejecutar(api, cron, aplicar, salida=print):
    if not secreto_util(cron):
        raise Error(f"{SECRETO}: forma inválida (marcador, corto o con espacios). No se toca nada.")
    salida(f"{SECRETO}: forma válida")

    tareas = {}
    for t in TAREAS:
        tareas[t] = api("GET", t)
        estado = tareas[t].get("state")
        salida(f"{t}: {estado}")
        if estado != "PAUSED":
            raise Error(f"{t} no está en PAUSED. No se toca nada; revisar antes.")

    if not aplicar:
        salida("Solo validación. Para aplicar: --apply (con GO de Kelly).")
        return

    fallos = []
    for t in TAREAS:
        try:
            api("PATCH", f"{t}?updateMask=httpTarget.headers",
                {"httpTarget": {"headers": headers_nuevos(tareas[t], cron)}})
            salida(f"{t}: header Authorization actualizado")
        except Exception as e:  # noqa: BLE001 — sin cuerpo: podría traer el header
            fallos.append(t)
            salida(f"{t}: ERROR al actualizar ({type(e).__name__})")

    # Revisión final de las 4, hayan fallado o no: nunca quedan activas.
    for t in TAREAS:
        try:
            estado = api("GET", t).get("state")
        except Exception as e:  # noqa: BLE001
            fallos.append(t)
            salida(f"{t}: no se pudo releer el estado ({type(e).__name__})")
            continue
        if estado != "PAUSED":
            api("POST", f"{t}:pause", {})
            fallos.append(t)
            salida(f"{t}: quedó {estado}; se volvió a pausar")
        else:
            salida(f"{t}: PAUSED")
    if fallos:
        raise Error(f"Con problemas: {', '.join(dict.fromkeys(fallos))}")


def main():
    aplicar = "--apply" in sys.argv[1:]
    try:
        token = gcloud("auth", "print-access-token").strip()
        cron = gcloud("secrets", "versions", "access", "latest", "--secret", SECRETO)
        ejecutar(api_real(token), cron, aplicar)
    except Error as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()
