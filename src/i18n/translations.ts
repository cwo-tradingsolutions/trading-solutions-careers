/**
 * Textos del portal público de empleo.
 *
 * El portal público va en un solo idioma: inglés, 1:1 con el copy pack de
 * Bernabé (CAREERS-COPY-PACK-Bernabe-2026-10-27, v1.0). Antes convivían ES y
 * EN con un selector y la página mezclaba `lang=es` con texto en inglés.
 *
 * Cifras (pack rev K, Kelly GO): las de tradingsolutions.com — +150 países,
 * +300 clientes, +52k TEUs, +500 t aire y tierra. El "+10 markets" del copy
 * pack sale de Universe (oficinas) y no se usa en Careers para no
 * contradecir el sitio corporativo.
 *
 * Los tres puntos que el pack deja por confirmar (presupuesto de formación,
 * programas de bienestar, caso en todos los roles) van con su texto de
 * respaldo hasta que Kelly/HR los confirme. Antes de agregar texto nuevo,
 * pasar la lista "Voice QA" del pack (§5): ni programas internos, ni cifras
 * de la web corporativa, ni promesas de ascenso o asignaciones.
 */
export type Locale = "en";

export const translations = {
  en: {
    meta: {
      title: "Careers at Trading Solutions | Boutique Freight Forwarder, Miami",
      description:
        "Join a boutique freight forwarder moving cargo by sea, land and air to +150 countries. Open roles in Operations, Corporate and Commercial.",
      ogTitle: "Every shipment has a name behind it. It could be yours.",
      ogDescription:
        "Careers at Trading Solutions — +150 countries, one team. See open roles in Operations, Corporate and Commercial.",
    },
    logoAlt: "Trading Solutions logo",
    nav: {
      why: "Why us",
      roles: "Open roles",
      hire: "How we hire",
      life: "Life here",
      cta: "See open roles",
      menu: "Menu",
    },
    // Shell Universe × Careers (preview AJUSTE de Clara, pack rev J). Las
    // pills del preview (Inicio · Cultura · Gente · Crecer · Vacantes · Únete)
    // van en inglés: el portal público es un solo idioma.
    shell: {
      workspace: "Workspace",
      company: "Company",
      workspaceTip: "Workspace is for the Trading Solutions team",
      searchPlaceholder: "Search open roles…",
      searchLabel: "Search open roles",
      announcements: "New roles are posted here first",
      sections: "Careers sections",
      home: "Home",
      culture: "Culture",
      people: "People",
      grow: "Grow",
      roles: "Open roles",
      join: "Join us",
      photoPlaceholder: "placeholder until TS photo bank",
    },
    // Búsqueda junto al hero (patrón SLB).
    heroSearch: {
      label: "Search open roles",
      keyword: "Keyword or role",
      allTeams: "All teams",
      anyLocation: "Any location",
      submit: "Search",
      cardKicker: "Trading Solutions Careers",
    },
    // Historias de gente: hasta que Bernabé entregue historias reales (con
    // nombre y foto del banco TS) las tarjetas llevan las tres ideas del
    // bloque Why, sin citas ni nombres inventados.
    people: {
      storyPending: "Team story · coming soon",
    },
    // Talent pool "Join us" (Kelly P0). Texto nuestro, pendiente de pasada de
    // Bernabé: no promete puesto ni llamada, igual que el resto del pack.
    pool: {
      eyebrow: "Join us",
      title: "No role that fits today? Leave your CV.",
      body: "Send it once and it stays on file with our team. When a role opens that matches your profile, the CVs on file are part of the search.",
      points: [
        "One submission. Your CV stays with our team.",
        "Pick the team where you'd like to contribute.",
        "If there's a fit, we'll reach out.",
      ],
      area: "Team of interest",
      areaPlaceholder: "Choose a team",
      areaOther: "Other / open",
      message: "Message (optional)",
      messagePlaceholder: "Tell us what you're looking for.",
      cvFormats: "PDF, DOC or DOCX (max. 5 MB)",
      cvTooBig: "That file is over 5 MB. Please upload a smaller PDF or Word file.",
      submit: "Send my CV",
      successTitle: "CV received. Thank you.",
      successBody: "It's on file with our team. If a role opens that fits your profile, we'll reach out.",
      again: "Send another",
      cta: "Leave your CV",
    },
    hero: {
      eyebrow: "Careers at Trading Solutions",
      title: "Every shipment has a name behind it. It could be yours.",
      body: "We're a boutique freight forwarder headquartered in Miami, moving cargo by sea, land and air to +150 countries. We look for curious, committed people who like owning the details — and answering the phone when it rings.",
      ctaPrimary: "See open roles",
      ctaSecondary: "How we hire",
      imageAlt: "A Trading Solutions container vessel arriving at the Port of Miami",
    },
    stats: [
      { value: "+150", label: "Countries of operation" },
      { value: "+300", label: "Clients" },
      { value: "+52k", label: "Maritime TEUs" },
      { value: "+500", label: "Tons by air & land" },
    ],
    why: {
      eyebrow: "Why Trading Solutions",
      title: "+150 countries. One team. A seat that matters.",
      lead: "We're not a giant with a call center. We're a team that knows every client by name and every shipment by its route. Here, your work doesn't disappear into a process — it shows up at a port, a border or a warehouse, on time.",
      pillars: [
        {
          title: "Learn the whole route",
          body: "Freight is a chain: booking, origin, transit, customs, delivery. You'll work close to every link, side by side with people who've done it for years and are glad to show you how.",
        },
        {
          title: "Real cargo, real markets",
          body: "Maritime, ground, air and customs to +150 countries. Every day brings a real problem with a real client on the other end — and a team that solves it together.",
        },
        {
          title: "Small enough to be heard",
          body: "In a boutique team, a good idea doesn't wait in a queue. If you see a better way to quote, track or communicate, you'll have people who listen — and the chance to make it happen.",
        },
      ],
      closeTitle: "Every shipment has a name behind it, and a phone that gets answered.",
      closeBody:
        "That's the promise we make to our clients. It only works because of the people who keep it. If you like being the person others can count on — at 9 a.m. or when a container is stuck at 6 p.m. — you'll feel at home here.",
      tags: ["Maritime", "Ground", "Air", "Customs"],
      miniStats: [
        { value: "+150", label: "Countries of operation" },
        { value: "+52k", label: "Maritime TEUs moved" },
        { value: "+500", label: "Tons by air & land" },
      ],
      imageAlt: "Trading Solutions ground fleet at sunrise",
    },
    areas: {
      eyebrow: "Open roles",
      title: "Find your place on the route.",
      lead: "Three teams, one goal: getting every shipment where it needs to go — and every client the answer they need.",
      operations: {
        title: "Operations",
        desc: "Coordinate cargo from origin to destination. Bookings, tracking, documents, carriers — the heartbeat of every shipment.",
        imageAlt: "Container terminal seen from above",
      },
      corporate: {
        title: "Corporate",
        desc: "Finance, people, systems and administration. The team that keeps the whole operation steady and growing.",
        imageAlt: "Stacked containers under a port crane",
      },
      commercial: {
        title: "Commercial",
        desc: "Understand what clients need to move and design the right solution. Relationships built one conversation at a time.",
        imageAlt: "A team member on a call with a client",
      },
      cardCta: "View roles",
      countOne: "1 open position",
      countMany: "{n} open positions",
      countZero: "No open roles right now",
    },
    process: {
      eyebrow: "How we hire",
      title: "Four steps. Real people on both sides.",
      lead: "No black boxes. Here's what to expect from the moment you apply — and what we expect from ourselves.",
      steps: [
        {
          label: "01 — Apply",
          title: "Tell us who you are.",
          body: "Pick a role that fits and send your application. A real person on our team reads it — not just a filter.",
        },
        {
          label: "02 — Conversation",
          title: "A conversation, not an interrogation.",
          body: "We'll talk about your experience, how you think and what you're looking for. Ask us anything — about the team, the work, the day-to-day. It has to be a fit for both of us.",
        },
        {
          label: "03 — Case",
          title: "Show us how you'd handle it.",
          body: "For some roles, we'll share a short practical case based on real freight situations. We care about how you reason, prioritize and communicate.",
        },
        {
          label: "04 — Welcome",
          title: "Your first shipment won't be a solo trip.",
          body: "You'll start with a team that walks you through our clients, our routes and our tools. Ask early, ask often — that's how everyone here learned.",
        },
      ],
    },
    benefits: {
      eyebrow: "Life at Trading Solutions",
      title: "What you can count on.",
      items: [
        {
          title: "Keep learning",
          body: "Learn from people who know the business inside out, with support for the training that helps you grow in your role.",
        },
        {
          title: "International exposure",
          body: "Work every day with partners, clients and colleagues in +150 countries. Your network grows with every shipment.",
        },
        {
          title: "Well-being that's real",
          body: "Flexibility where the work allows it, and a team that understands life happens outside of work, too.",
        },
        {
          title: "Work that's seen",
          body: "In a boutique team, your impact doesn't get lost. Competitive pay and people who notice what you bring.",
        },
      ],
    },
    cta: {
      title: "Ready to move something real?",
      body: "Somewhere, a client is waiting on a shipment. Help us get it there — with your name behind it.",
      primary: "See open roles",
      secondary: "Get to know Trading Solutions",
      secondaryUrl: "https://tradingsolutions.com",
    },
    footer: {
      tagline: "Boutique freight forwarding. One team.",
      hq: "Headquartered in Miami, FL",
      careers: "Careers",
      services: "Services",
      company: "Company",
      about: "About",
      contact: "Contact",
      legal: "Legal",
      rights: "© 2026 Trading Solutions. All rights reserved.",
    },
    jobs: {
      pageEyebrow: "Open roles",
      pageTitle: "Find your place on the route.",
      pageSubtitle: "Every role here moves something real. Search, filter and find the one that fits.",
      searchPlaceholder: "Search by title, team or skill",
      searchLabel: "Search open roles",
      areaLabel: "Team",
      modeLabel: "Work mode",
      all: "All",
      loading: "Loading open roles…",
      resultsOne: "1 open role",
      resultsMany: "{n} open roles",
      clearFilters: "Clear filters",
      noResults: "No open roles match those filters.",
      areaEmptyTitle: "No open roles in {Area} right now.",
      areaEmptyBody: "Our team grows with our clients, so this can change. Check back soon or explore the other teams.",
      areaEmptyCta: "See all open roles",
      allEmptyTitle: "No open roles at the moment.",
      allEmptyBody: "We're not hiring for any position right now. New roles are posted here first — check back soon.",
      cardCta: "View role",
      backToJobs: "All open roles",
      notFound: "This role is no longer open.",
      viewAll: "See all open roles",
      whatYouDo: "What you'll do",
      whatWeSeek: "What we're looking for",
      applyBtn: "Apply for this role",
      applyTo: "Apply for",
      fullName: "Full name",
      fullNamePlaceholder: "Your name",
      email: "Email",
      emailPlaceholder: "you@email.com",
      phone: "Phone",
      phonePlaceholder: "+1 (555) 000-0000",
      linkedin: "LinkedIn",
      linkedinPlaceholder: "linkedin.com/in/your-profile",
      cvLabel: "CV / Résumé",
      cvDrag: "Drop your CV here or",
      cvSelect: "choose a file",
      cvFormats: "PDF, DOC or DOCX (max. 10 MB)",
      whyTs: "Why Trading Solutions?",
      whyTsPlaceholder: "Tell us what draws you to this role and to freight.",
      submit: "Send application",
      submitting: "Sending…",
      cancel: "Cancel",
      close: "Close",
      successTitle: "Application received. Thank you.",
      successBody:
        "A member of our team will review it. If your profile fits the role, we'll reach out to set up a conversation.",
      errorGeneric: "Something went wrong sending your application. Please try again in a moment.",
      backToJobsBtn: "All open roles",
    },
    deptNames: {
      Operaciones: "Operations",
      Corporate: "Corporate",
      Comercial: "Commercial",
      People: "People",
      Talento: "Talent",
      Finanzas: "Finance",
      "Tecnología": "Technology",
      Pricing: "Pricing",
    },
    modeNames: {
      Presencial: "On-site",
      "Híbrido": "Hybrid",
      Remoto: "Remote",
    },
  },
};

// Deep writable type that converts readonly string literals to string
type DeepWritable<T> = {
  -readonly [K in keyof T]: T[K] extends ReadonlyArray<infer U>
    ? DeepWritable<U>[]
    : T[K] extends string
    ? string
    : T[K] extends object
    ? DeepWritable<T[K]>
    : T[K];
};

export type Translations = DeepWritable<typeof translations.en>;

/** "{n} open positions" → "4 open positions". */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
