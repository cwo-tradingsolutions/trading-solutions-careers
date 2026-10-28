/**
 * Public Careers strings — English only (Bernabé copy pack v1.0, 27-Oct-2026).
 *
 * One language per view: this ship is EN. Strings are pasted 1:1 from
 * CAREERS-COPY-PACK-Bernabe-2026-10-27.md (§3–§4). Do not add Spanish strings
 * here, do not reintroduce internal program names, and keep the stats lock
 * (+10 / +300 / +52k / +500) identical in hero and Why.
 *
 * Benefit 1, Benefit 3 and Step 03 use the copy pack FALLBACK lines until
 * HR confirms the underlying programs.
 */

export type Locale = "en";

export const translations = {
  en: {
    meta: {
      title: "Careers at Trading Solutions | Boutique Freight Forwarder, Miami",
      description:
        "Join a boutique freight forwarder moving cargo by sea, land and air across ten markets. Open roles in Operations, Corporate and Commercial.",
      ogTitle: "Every shipment has a name behind it. It could be yours.",
      ogDescription:
        "Careers at Trading Solutions — ten markets, one team. See open roles in Operations, Corporate and Commercial.",
    },
    logoAlt: "Trading Solutions logo",
    localeLabel: "EN",
    localeAria: "Site language: English",
    nav: {
      whyUs: "Why us",
      openRoles: "Open roles",
      howWeHire: "How we hire",
      lifeHere: "Life here",
      cta: "See open roles",
      menu: "Menu",
    },
    hero: {
      eyebrow: "Careers at Trading Solutions",
      title: "Every shipment has a name behind it. It could be yours.",
      body: "We're a boutique freight forwarder headquartered in Miami, moving cargo by sea, land and air across ten markets. We look for curious, committed people who like owning the details — and answering the phone when it rings.",
      ctaPrimary: "See open roles",
      ctaSecondary: "How we hire",
      imageAlt: "Container ship at port with the Miami skyline behind it",
    },
    stats: [
      { value: "+10", label: "Markets of operation" },
      { value: "+300", label: "Active clients" },
      { value: "+52k", label: "Maritime TEUs" },
      { value: "+500", label: "Tons by air & land" },
    ],
    why: {
      eyebrow: "Why Trading Solutions",
      title: "Ten markets. One team. A seat that matters.",
      lead: "We're not a giant with a call center. We're a team that knows every client by name and every shipment by its route. Here, your work doesn't disappear into a process — it shows up at a port, a border or a warehouse, on time.",
      pillars: [
        {
          title: "Learn the whole route",
          body: "Freight is a chain: booking, origin, transit, customs, delivery. You'll work close to every link, side by side with people who've done it for years and are glad to show you how.",
        },
        {
          title: "Real cargo, real markets",
          body: "Maritime, ground, air and customs across ten markets. Every day brings a real problem with a real client on the other end — and a team that solves it together.",
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
        { value: "+10", label: "Markets of operation" },
        { value: "+52k", label: "Maritime TEUs moved" },
        { value: "+500", label: "Tons by air & land" },
      ],
    },
    areas: {
      eyebrow: "Open roles",
      title: "Find your place on the route.",
      lead: "Three teams, one goal: getting every shipment where it needs to go — and every client the answer they need.",
      items: {
        operations: {
          title: "Operations",
          desc: "Coordinate cargo from origin to destination. Bookings, tracking, documents, carriers — the heartbeat of every shipment.",
          imageAlt: "Containers stacked under a port crane",
        },
        corporate: {
          title: "Corporate",
          desc: "Finance, people, systems and administration. The team that keeps the whole operation steady and growing.",
          imageAlt: "Aerial view of a container terminal",
        },
        commercial: {
          title: "Commercial",
          desc: "Understand what clients need to move and design the right solution. Relationships built one conversation at a time.",
          imageAlt: "Freight professional on a call at a logistics site",
        },
      },
      cardCta: "View roles",
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
          // STEP_3_BODY_FALLBACK (case in every role not confirmed yet)
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
      imageAlt: "Trucks lined up at a ground freight yard",
      items: [
        {
          title: "Keep learning",
          // BENEFIT_1_BODY_FALLBACK
          body: "Learn from people who know the business inside out, with support for the training that helps you grow in your role.",
        },
        {
          title: "International exposure",
          body: "Work every day with partners, clients and colleagues across ten markets. Your network grows with every shipment.",
        },
        {
          title: "Well-being that's real",
          // BENEFIT_3_BODY_FALLBACK
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
    counts: {
      one: "1 open position",
      many: "{n} open positions",
      zero: "No open roles right now",
    },
    empty: {
      areaTitle: "No open roles in {Area} right now.",
      areaBody: "Our team grows with our clients, so this can change. Check back soon or explore the other teams.",
      areaCta: "See all open roles",
      allTitle: "No open roles at the moment.",
      allBody: "We're not hiring for any position right now. New roles are posted here first — check back soon.",
    },
    footer: {
      tagline: "Boutique freight forwarding. Ten markets, one team.",
      hq: "Headquartered in Miami, FL",
      link1: "tradingsolutions.com",
      servicesLine: "Maritime · Ground · Air · Customs",
      legal: "© 2026 Trading Solutions. All rights reserved.",
      servicesHeading: "Services",
      careersHeading: "Careers",
      companyHeading: "Company",
      about: "About",
      contact: "Contact",
      legalLink: "Legal & privacy",
    },
    jobs: {
      eyebrow: "Open roles",
      pageTitle: "Find your place on the route.",
      pageSubtitle:
        "Three teams, one goal: getting every shipment where it needs to go — and every client the answer they need.",
      searchPlaceholder: "Search by title, team or skill",
      searchLabel: "Search roles",
      teamLabel: "Team",
      modeLabel: "Work mode",
      all: "All",
      clear: "Clear filters",
      loading: "Loading roles…",
      loadError: "We couldn’t load the open roles. Please try again.",
      retry: "Try again",
      resultsOne: "1 open position",
      resultsMany: "{n} open positions",
      noMatchTitle: "No roles match those filters.",
      noMatchBody: "Try a different search or clear the filters to see every open role.",
      cardCta: "View role",
      back: "← All open roles",
      notFound: "This role is no longer open.",
      notFoundBody: "It may have been filled. See what's open right now.",
      whatYouDo: "What you'll do",
      whatWeSeek: "What we're looking for",
      apply: "Apply for this role",
      applyAside: "A real person on our team reads every application.",
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
      cvDrag: "Drag your CV here or",
      cvSelect: "choose a file",
      cvFormats: "PDF, DOC or DOCX (max. 3 MB)",
      cvInvalid: "Choose a PDF, DOC or DOCX file of 3 MB or less.",
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
      backToRoles: "See all open roles",
    },
    deptNames: {
      Operaciones: "Operations",
      Comercial: "Commercial",
      Talento: "Talent",
      Administration: "Administration",
      Administracion: "Administration",
      "Administración": "Administration",
      Logistica: "Logistics",
      "Logística": "Logistics",
      Aduanas: "Customs",
      Ventas: "Sales",
      "Servicio al cliente": "Customer service",
      Finanzas: "Finance",
      "Tecnología": "Technology",
    } as Record<string, string>,
    modeNames: {
      Presencial: "On-site",
      "Híbrido": "Hybrid",
      Remoto: "Remote",
      presencial: "On-site",
      hibrido: "Hybrid",
      híbrido: "Hybrid",
      remoto: "Remote",
    } as Record<string, string>,
  },
};

export type Translations = (typeof translations)["en"];

/** "{n} open positions" → count-aware string (COUNT_ONE / COUNT_MANY / COUNT_ZERO). */
export function countLabel(n: number, c: { one: string; many: string; zero: string }): string {
  if (n === 0) return c.zero;
  if (n === 1) return c.one;
  return c.many.replace("{n}", String(n));
}
