/**
 * Los enlaces de agendamiento conjunto quedaron cerrados.
 * La página no consulta la agenda ni crea eventos.
 */
export default function AgendaConjuntaClosedPage() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="text-xs font-semibold tracking-wide uppercase text-neutral-500">Trading Solutions</p>
        <h1 className="mt-3 text-xl font-semibold">Este enlace ya no está activo</h1>
        <p className="mt-3 text-sm leading-relaxed">
          Escríbenos a{" "}
          <a className="underline" href="mailto:jointheteam@tradingsolutions.com">
            jointheteam@tradingsolutions.com
          </a>
        </p>
        <p className="mt-6 text-sm leading-relaxed text-neutral-600">
          This link is no longer active. Write to us at jointheteam@tradingsolutions.com
        </p>
      </div>
    </main>
  );
}
