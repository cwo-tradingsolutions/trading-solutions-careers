export type Locale = "es" | "en";

export const translations = {
  es: {
    nav: { roles: "Vacantes", life: "Vida en TS", process: "Proceso", viewJobs: "Ver vacantes" },
    hero: {
      tag: "Carreras",
      title: "Construye mercados\ncon claridad.",
      subtitle: "Somos un boutique freight forwarder con operación en más de 10 países. Buscamos personas curiosas, comprometidas y con ganas de crecer junto a nosotros.",
      cta: "Explorar roles",
      ctaSecondary: "Cómo contratamos"
    },
    stats: {
      countries: { value: "+10", label: "Países en operación" },
      clients: { value: "+300", label: "Clientes activos" },
      teus: { value: "+52k", label: "TEUs marítimos" },
      tons: { value: "+500", label: "Tons Air & Land" }
    },
    culture: {
      tag: "Mentalidad de crecimiento",
      title: "Aquí no vienes a ocupar un puesto.\nVienes a construir tu futuro.",
      subtitle: "En Trading Solutions creemos que el talento excepcional florece cuando se le da espacio para crecer, libertad para proponer y un entorno donde cada persona puede desafiar el status quo.",
      cards: [
        { title: "Crecimiento acelerado", desc: "Tu carrera se acelera con exposición internacional, proyectos de alto impacto y líderes que invierten en tu desarrollo. Aquí el techo lo pones tú." },
        { title: "Alcance internacional", desc: "Operamos en más de 10 países con servicios marítimos, terrestres, aéreos y aduaneros. Cada día es una oportunidad de resolver desafíos logísticos reales." },
        { title: "Cultura de expansión", desc: "Cada idea tiene espacio. Cada voz importa. Construimos un entorno donde la curiosidad se premia, la innovación se celebra y los límites se desafían." }
      ],
      blackBlock: {
        title: "Creemos en las personas que quieren más.",
        desc: "Más impacto. Más aprendizaje. Más libertad. Si buscas un lugar donde tu energía se convierte en resultados reales y tu crecimiento profesional no tiene techo — este es tu lugar.",
        maritime: "Maritime",
        maritimeSub: "Ground, Air & Customs",
        countriesLabel: "Países en operación",
        teusLabel: "TEUs marítimos gestionados",
        tonsLabel: "Tons Air & Land"
      }
    },
    departments: {
      tag: "Áreas",
      title: "Encuentra tu espacio.",
      ops: { name: "Operaciones", count: "4 posiciones abiertas" },
      corporate: { name: "Corporate", count: "3 posiciones abiertas" },
      commercial: { name: "Comercial", count: "2 posiciones abiertas" }
    },
    experience: {
      tag: "La experiencia",
      title: "Contratamos talento excepcional. Así se siente ser parte del proceso.",
      steps: [
        { num: "01", label: "Descubrimiento", title: "Nos encuentras. Te intrigamos.", desc: "Exploras nuestras oportunidades y algo conecta. No es solo un trabajo — es la posibilidad de hacer algo que importa en una escala internacional." },
        { num: "02", label: "Conversación", title: "No es una entrevista. Es un diálogo.", desc: "Queremos conocer quién eres de verdad — tu curiosidad, tus ideas, tu forma de pensar. Tú también nos conoces a nosotros. Es un match de dos vías." },
        { num: "03", label: "Inmersión", title: "Muéstranos cómo piensas.", desc: "Un reto real del negocio. Sin respuestas correctas. Queremos ver tu proceso, tu creatividad y cómo abordas lo desconocido." },
        { num: "04", label: "Bienvenida", title: "Empieza algo extraordinario.", desc: "Desde el día uno, tienes mentor, equipo y acceso a un programa de onboarding diseñado para que despegues rápido y con confianza." }
      ],
      cta: "Explorar vacantes abiertas"
    },
    benefits: {
      tag: "Lo que te espera",
      title: "Diseñado para que crezcas.",
      items: [
        { title: "Aprendizaje continuo", desc: "Presupuesto anual para formación, certificaciones y conferencias" },
        { title: "Experiencia internacional", desc: "Proyectos cross-country y oportunidad de asignaciones internacionales" },
        { title: "Bienestar integral", desc: "Programas de wellness, salud mental, flexibilidad y balance real" },
        { title: "Reconocimiento", desc: "Tu impacto se ve. Compensación competitiva y crecimiento acelerado" }
      ]
    },
    cta: {
      title: "¿No ves tu rol?",
      subtitle: "Envía una aplicación general. Mantenemos un banco de talento.",
      button: "Enviar hoja de vida"
    },
    footer: {
      tagline: "Boutique freight forwarder. Movemos lo que importa, con precisión y propósito.",
      services: "Servicios",
      company: "Compañía",
      companyAbout: "Nosotros",
      companyCareers: "Carreras",
      companyContact: "Contacto",
      followUs: "Síguenos",
      legal: "Legal",
      privacy: "Privacidad",
      rights: "Todos los derechos reservados."
    },
    jobs: {
      pageTitle: "Vacantes abiertas.",
      pageSubtitle: "Encuentra el rol que conecta con tu ambición.",
      applyShort: "Aplicar →",
      backHome: "Volver al inicio",
      searchPlaceholder: "Buscar por título, área o habilidad...",
      deptLabel: "Departamento:",
      modeLabel: "Modalidad:",
      all: "Todos",
      allFem: "Todas",
      resultsSingular: "posición encontrada",
      resultsPlural: "posiciones encontradas",
      clearFilters: "Limpiar filtros",
      noResults: "No encontramos vacantes con esos filtros.",
      backToJobs: "Todas las vacantes",
      notFound: "Vacante no encontrada",
      viewAll: "Ver todas las vacantes",
      whatYouDo: "Lo que harás",
      whatWeSeek: "Lo que buscamos",
      applyBtn: "Aplicar a esta posición",
      applyTo: "Aplicar a",
      fullName: "Nombre completo",
      fullNamePlaceholder: "Tu nombre",
      email: "Email",
      emailPlaceholder: "tu@email.com",
      phone: "Teléfono",
      phonePlaceholder: "+1 (555) 000-0000",
      linkedin: "LinkedIn",
      linkedinPlaceholder: "https://linkedin.com/in/tu-perfil",
      cvLabel: "CV / Résumé",
      cvDrag: "Arrastra tu CV o",
      cvSelect: "selecciona un archivo",
      cvFormats: "PDF, DOC o DOCX (máx. 10 MB)",
      whyTs: "¿Por qué Trading Solutions?",
      whyTsPlaceholder: "Cuéntanos qué te motiva y qué te haría excepcional en este rol...",
      submit: "Enviar aplicación",
      cancel: "Cancelar",
      successTitle: "Aplicación enviada",
      successMsg: "Gracias por tu interés en Trading Solutions. Nuestro equipo revisará tu perfil y te contactaremos pronto.",
      backToJobsBtn: "Volver a vacantes"
    },
    deptNames: {
      Operaciones: "Operaciones",
      Corporate: "Corporate",
      Comercial: "Comercial",
      People: "People",
      Talento: "Talento",
      Finanzas: "Finanzas",
      "Tecnología": "Tecnología"
    },
    modeNames: {
      Presencial: "Presencial",
      "Híbrido": "Híbrido",
      Remoto: "Remoto"
    }
  },
  en: {
    nav: { roles: "Open roles", life: "Life at TS", process: "Process", viewJobs: "View openings" },
    hero: {
      tag: "Careers",
      title: "Build markets\nwith clarity.",
      subtitle: "We are a boutique freight forwarder with operations in over 10 countries. We look for curious, committed people eager to grow with us.",
      cta: "Explore roles",
      ctaSecondary: "How we hire"
    },
    stats: {
      countries: { value: "+10", label: "Countries of operation" },
      clients: { value: "+300", label: "Active clients" },
      teus: { value: "+52k", label: "Maritime TEUs" },
      tons: { value: "+500", label: "Tons Air & Land" }
    },
    culture: {
      tag: "Growth mindset",
      title: "You're not here to fill a role.\nYou're here to build your future.",
      subtitle: "At Trading Solutions we believe exceptional talent thrives when given room to grow, freedom to propose, and an environment where everyone can challenge the status quo.",
      cards: [
        { title: "Accelerated growth", desc: "Your career takes off with international exposure, high-impact projects, and leaders who invest in your development. Here, you set your own ceiling." },
        { title: "Global reach", desc: "We operate in over 10 countries with maritime, ground, air, and customs services. Every day is an opportunity to solve real logistics challenges." },
        { title: "Culture of expansion", desc: "Every idea has space. Every voice matters. We build an environment where curiosity is rewarded, innovation is celebrated, and limits are challenged." }
      ],
      blackBlock: {
        title: "We believe in people who want more.",
        desc: "More impact. More learning. More freedom. If you're looking for a place where your energy turns into real results and your professional growth knows no ceiling — this is your place.",
        maritime: "Maritime",
        maritimeSub: "Ground, Air & Customs",
        countriesLabel: "Countries of operation",
        teusLabel: "Maritime TEUs handled",
        tonsLabel: "Tons Air & Land"
      }
    },
    departments: {
      tag: "Areas",
      title: "Find your space.",
      ops: { name: "Operations", count: "4 open positions" },
      corporate: { name: "Corporate", count: "3 open positions" },
      commercial: { name: "Commercial", count: "2 open positions" }
    },
    experience: {
      tag: "The experience",
      title: "We hire exceptional talent. This is what being part of the process feels like.",
      steps: [
        { num: "01", label: "Discovery", title: "You find us. We intrigue you.", desc: "You explore our opportunities and something clicks. It's not just a job — it's the chance to do something that matters on an international scale." },
        { num: "02", label: "Conversation", title: "It's not an interview. It's a dialogue.", desc: "We want to meet the real you — your curiosity, your ideas, your way of thinking. You also get to know us. It's a two-way match." },
        { num: "03", label: "Immersion", title: "Show us how you think.", desc: "A real business challenge. No right answers. We want to see your process, your creativity, and how you approach the unknown." },
        { num: "04", label: "Welcome", title: "Start something extraordinary.", desc: "From day one, you have a mentor, a team, and access to an onboarding program designed to help you take off quickly and confidently." }
      ],
      cta: "Explore open positions"
    },
    benefits: {
      tag: "What awaits you",
      title: "Designed for your growth.",
      items: [
        { title: "Continuous learning", desc: "Annual budget for training, certifications, and conferences" },
        { title: "International experience", desc: "Cross-country projects and international assignment opportunities" },
        { title: "Holistic well-being", desc: "Wellness programs, mental health support, flexibility, and real balance" },
        { title: "Recognition", desc: "Your impact is visible. Competitive compensation and accelerated growth" }
      ]
    },
    cta: {
      title: "Don't see your role.",
      subtitle: "Send a general application — we keep a warm talent pool.",
      button: "Submit resume"
    },
    footer: {
      tagline: "Boutique freight forwarder. We move what matters, with precision and purpose.",
      services: "Services",
      company: "Company",
      companyAbout: "About",
      companyCareers: "Careers",
      companyContact: "Contact",
      followUs: "Follow us",
      legal: "Legal",
      privacy: "Privacy",
      rights: "All rights reserved."
    },
    jobs: {
      pageTitle: "Open roles.",
      pageSubtitle: "Find the role that matches your ambition.",
      applyShort: "Apply →",
      backHome: "Back to home",
      searchPlaceholder: "Search by title, area, or skill...",
      deptLabel: "Department:",
      modeLabel: "Work mode:",
      all: "All",
      allFem: "All",
      resultsSingular: "position found",
      resultsPlural: "positions found",
      clearFilters: "Clear filters",
      noResults: "No openings match those filters.",
      backToJobs: "All openings",
      notFound: "Position not found",
      viewAll: "View all openings",
      whatYouDo: "What you'll do",
      whatWeSeek: "What we're looking for",
      applyBtn: "Apply for this position",
      applyTo: "Apply for",
      fullName: "Full name",
      fullNamePlaceholder: "Your name",
      email: "Email",
      emailPlaceholder: "you@email.com",
      phone: "Phone",
      phonePlaceholder: "+1 (555) 000-0000",
      linkedin: "LinkedIn",
      linkedinPlaceholder: "https://linkedin.com/in/your-profile",
      cvLabel: "CV / Résumé",
      cvDrag: "Drag your CV or",
      cvSelect: "select a file",
      cvFormats: "PDF, DOC, or DOCX (max. 10 MB)",
      whyTs: "Why Trading Solutions?",
      whyTsPlaceholder: "Tell us what motivates you and what would make you exceptional in this role...",
      submit: "Submit application",
      cancel: "Cancel",
      successTitle: "Application submitted",
      successMsg: "Thank you for your interest in Trading Solutions. Our team will review your profile and contact you soon.",
      backToJobsBtn: "Back to openings"
    },
    deptNames: {
      Operaciones: "Operations",
      Corporate: "Corporate",
      Comercial: "Commercial",
      People: "People",
      Talento: "Talent",
      Finanzas: "Finance",
      "Tecnología": "Technology"
    },
    modeNames: {
      Presencial: "On-site",
      "Híbrido": "Hybrid",
      Remoto: "Remote"
    }
  }
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

export type Translations = DeepWritable<typeof translations.es>;
