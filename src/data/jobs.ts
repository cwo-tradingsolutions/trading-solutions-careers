export interface Job {
  id: number;
  slug: string;
  linkedinUrl: string;
  title: { es: string; en: string };
  dept: string;
  location: string;
  mode: "Presencial" | "Híbrido" | "Remoto";
  level: "Junior" | "Mid-Level" | "Senior";
  salary: string;
  tags: string[];
  description: { es: string; en: string };
  responsibilities: { es: string[]; en: string[] };
  requirements: { es: string[]; en: string[] };
  applyEmail: string;
  postedAt: string;
}

export const departments = ["Comercial", "Operaciones", "Talento", "Finanzas", "Tecnología"] as const;
export const modes = ["Presencial", "Híbrido", "Remoto"] as const;

/**
 * VACANTES ABIERTAS — Trading Solutions Barranquilla
 * Última actualización: 14 mayo 2026
 * Postulación: vía formulario en la página de cada vacante.
 */
export const jobs: Job[] = [
  {
    id: 11,
    slug: "talent-acquisition-specialist",
    linkedinUrl: "",
    title: {
      es: "Talent Acquisition Specialist",
      en: "Talent Acquisition Specialist",
    },
    dept: "Wellness",
    location: "Barranquilla, Atlántico, Colombia",
    mode: "Presencial",
    level: "Mid-Level",
    salary: "A convenir",
    tags: ["Selección", "Psicometría", "Entrevista por competencias", "ATS", "Bilingüe EN/ES"],
    description: {
      es: "Trading Solutions es una compañía de logística internacional. Movemos carga entre continentes y, para sostener ese crecimiento, necesitamos elegir bien a las personas que lo hacen posible.\n\nBuscamos un Talent Acquisition Specialist: un profesional en Psicología que lidere nuestros procesos de selección end to end y que evalúe con rigor técnico. No buscamos a alguien que coordine agendas: buscamos criterio.",
      en: "Trading Solutions is an international logistics company. We move cargo across continents, and sustaining that growth depends on choosing the right people.\n\nWe are hiring a Talent Acquisition Specialist: a psychologist who owns our hiring processes end to end and assesses with technical rigour. We are not looking for someone to coordinate calendars — we are looking for judgment.",
    },
    responsibilities: {
      es: [
        "Levantar el perfil con el líder solicitante antes de publicar y definir la estrategia de búsqueda de cada vacante",
        "Ejecutar sourcing activo y headhunting en LinkedIn, portales de empleo, bases propias, referidos y alianzas académicas",
        "Conducir entrevistas por competencias (metodología STAR/BEI) en español e inglés",
        "Aplicar, calificar e interpretar la batería psicométrica corporativa y elaborar informes de evaluación dirigidos al líder de negocio",
        "Construir y sustentar la terna de finalistas con evidencia y una recomendación técnica",
        "Verificar referencias y coordinar los pasos de la etapa de contratación con el equipo de People Ops",
        "Mantener la trazabilidad del proceso en el ATS y reportar los indicadores de selección",
      ],
      en: [
        "Run role intake with the hiring leader before publishing, and define the search strategy for each opening",
        "Execute active sourcing and headhunting across LinkedIn, job boards, internal databases, referrals and academic partnerships",
        "Conduct competency-based interviews (STAR/BEI) in Spanish and English",
        "Administer, score and interpret our psychometric battery, and write assessment reports addressed to business leaders",
        "Build and defend the final shortlist with evidence and a technical recommendation",
        "Verify references and coordinate the pre-employment steps with the People Ops team",
        "Maintain process traceability in the ATS and report recruitment metrics",
      ],
    },
    requirements: {
      es: [
        "Profesional en Psicología",
        "De 2 a 4 años de experiencia en procesos de selección end to end, con responsabilidad directa sobre vacantes",
        "Mínimo 1 año aplicando e interpretando pruebas psicométricas y elaborando informes de evaluación",
        "Inglés B2 o superior. Se valida durante el proceso con entrevista en vivo y prueba escrita",
        "Formación o certificación en entrevista por competencias (BEI/STAR)",
        "Excel nivel intermedio-avanzado y manejo de plataformas ATS",
        "Preferible: experiencia en logística internacional, freight forwarding, comercio exterior, agenciamiento aduanero o navieras",
        "Preferible: experiencia en compañías con operación en varios países y equipos distribuidos",
      ],
      en: [
        "Degree in Psychology",
        "2-4 years in end-to-end recruitment with direct ownership of openings",
        "At least 1 year administering and interpreting psychometric assessments",
        "English at B2 or above, verified during the process through a live interview and a written exercise",
        "Training or certification in competency-based interviewing (BEI/STAR)",
        "Intermediate-advanced Excel and hands-on ATS experience",
        "Preferred: background in international logistics, freight forwarding, foreign trade, customs brokerage or shipping lines",
        "Preferred: experience in companies operating across several countries with distributed teams",
      ],
    },
    applyEmail: "jointheteam@tradingsolutions.com",
    postedAt: "2026-08-19",
  },
  {
    // OJO · el id era 6, el mismo que china-customer-documentation.
    // VACANCY_MAP en /api/applications mapea por job_id, así que todas las
    // aplicaciones a Full Stack estaban entrando al funnel de la vacante de
    // China. Se movió a 10 para romper la colisión (18-ago-2026).
    id: 10,
    slug: "full-stack-developer",
    linkedinUrl: "https://www.linkedin.com/company/trading-solutions/jobs/",
    title: { es: "Full Stack Developer Junior", en: "Junior Full Stack Developer" },
    dept: "Tecnología",
    location: "Barranquilla, Atlántico, Colombia",
    mode: "Presencial",
    level: "Junior",
    salary: "A convenir según perfil · contrato de aprendizaje o término indefinido",
    tags: ["JavaScript", "React", "Node.js", "SQL", "Git", "Junior", "Primer empleo", "Prácticas"],
    description: {
      es: "Únete al equipo de Producto & Tecnología de Trading Solutions y ayúdanos a construir el ecosistema tecnológico que conecta operaciones, clientes, proveedores y equipos internos. Este rol está pensado para recién graduados, estudiantes en etapa de práctica o personas con hasta 2 años de experiencia. Trabajarás junto al Tech Lead y al equipo de Product y UX/UI en funcionalidades reales de la plataforma, con acompañamiento, revisión de código y mentoría constante. No esperamos que lo sepas todo: esperamos curiosidad, disciplina para aprender y ganas de entender por qué se construye lo que se construye.",
      en: "Join Trading Solutions' Product & Technology team and help us build the technology ecosystem that connects operations, clients, suppliers and internal teams. This role is designed for recent graduates, students looking for an internship, or people with up to 2 years of experience. You'll work alongside the Tech Lead and the Product and UX/UI team on real platform features, with close support, code review and constant mentorship. We don't expect you to know everything — we expect curiosity, the discipline to learn, and a genuine interest in why we build what we build.",
    },
    responsibilities: {
      es: [
        "Desarrollar componentes y funcionalidades de Frontend y Backend con acompañamiento del equipo",
        "Consumir e integrar APIs REST existentes dentro de nuestros productos",
        "Implementar interfaces a partir de diseños entregados por el equipo de UX/UI",
        "Identificar, reproducir y corregir bugs reportados por usuarios y por el equipo",
        "Escribir código legible, documentado y alineado a los estándares del equipo",
        "Participar en code reviews como espacio de aprendizaje: recibir feedback y aplicarlo",
        "Apoyar tareas de pruebas, documentación técnica y mantenimiento de la plataforma",
        "Participar en las ceremonias Agile del equipo (dailies, planning, retrospectivas)",
        "Hacer preguntas, levantar bloqueos a tiempo y comunicar avances con claridad",
      ],
      en: [
        "Build Frontend and Backend components and features with the team's support",
        "Consume and integrate existing REST APIs across our products",
        "Implement interfaces from designs delivered by the UX/UI team",
        "Identify, reproduce and fix bugs reported by users and the team",
        "Write readable, documented code aligned with the team's standards",
        "Take part in code reviews as a learning space: receive feedback and apply it",
        "Support testing, technical documentation and platform maintenance",
        "Join the team's Agile ceremonies (dailies, planning, retrospectives)",
        "Ask questions, raise blockers early and communicate progress clearly",
      ],
    },
    requirements: {
      es: [
        "Formación en Ingeniería de Sistemas, Desarrollo de Software o carreras afines · también formación técnica/tecnológica o bootcamp con proyectos demostrables",
        "Estudiante de últimos semestres en búsqueda de práctica, recién graduado o hasta 2 años de experiencia",
        "Fundamentos sólidos de JavaScript, HTML y CSS",
        "Nociones de React (componentes, estado, props) adquiridas en proyectos académicos, personales o laborales",
        "Nociones de desarrollo backend con Node.js y comprensión de cómo funciona una API REST",
        "Conocimientos básicos de bases de datos y SQL",
        "Manejo de Git (commits, ramas, pull requests)",
        "Inglés técnico a nivel de lectura (documentación)",
        "Portafolio, repositorio de GitHub o proyectos que podamos revisar juntos",
        "Será un plus: experiencia con Claude Code u otras herramientas de IA, TypeScript o Next.js, prácticas previas o proyectos con usuarios reales, Figma, nociones de Google Cloud, Docker o CI/CD, e interés por el sector logístico",
      ],
      en: [
        "Studies in Systems Engineering, Software Development or related fields · technical/vocational training or a bootcamp with demonstrable projects also count",
        "Final-semester student looking for an internship, recent graduate, or up to 2 years of experience",
        "Solid fundamentals of JavaScript, HTML and CSS",
        "Working knowledge of React (components, state, props) from academic, personal or professional projects",
        "Working knowledge of backend development with Node.js and an understanding of how a REST API works",
        "Basic knowledge of databases and SQL",
        "Comfortable with Git (commits, branches, pull requests)",
        "Technical English at reading level (documentation)",
        "A portfolio, GitHub repository or projects we can review together",
        "Nice to have: experience with Claude Code or other AI tools, TypeScript or Next.js, previous internships or projects with real users, Figma, some exposure to Google Cloud, Docker or CI/CD, and an interest in the logistics sector",
      ],
    },
    applyEmail: "jointheteam@tradingsolutions.com",
    postedAt: "2026-08-18",
  },
  {
    id: 6,
    slug: "china-customer-documentation",
    linkedinUrl: "",
    title: {
      es: "Customer Documentation and Support",
      en: "Customer Documentation and Support",
    },
    dept: "Finanzas",
    location: "Shanghai / Shenzhen / Guangzhou, China",
    mode: "Presencial",
    level: "Junior",
    salary: "A convenir",
    tags: ["China", "Finance", "Documentation", "Freight Forwarding", "Builder Team"],
    description: {
      es: `📢 We're building our Builder Team in China! Looking for a Customer Documentation & Support professional to be the administrative and financial backbone of our expansion across Asia.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will be the bridge between our Commercial, Operations, Pricing, and Finance teams — making sure every shipment has its complete financial and logistical "resume," and that billing flows without friction.`,
      en: `📢 We're building our Builder Team in China! Looking for a Customer Documentation & Support professional to be the administrative and financial backbone of our expansion across Asia.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will be the bridge between our Commercial, Operations, Pricing, and Finance teams — making sure every shipment has its complete financial and logistical "resume," and that billing flows without friction.`,
    },
    responsibilities: {
      es: [
        "Verify and register received and issued invoices, making sure they match contracts and purchase orders",
        "Consolidate costs, sales, and profitability by client or service, flagging risks along the way",
        "Register and update rates on the Federal Maritime Commission platform",
        "Handle the physical onboarding of new team members and keep the workspace (WeWork) organized",
        "Provide cross-functional support across Sales, Operations, and Procurement during this fast-paced launch phase",
        "Keep records organized with proper digital backups and report any inconsistencies to your supervisor",
      ],
      en: [
        "Verify and register received and issued invoices, making sure they match contracts and purchase orders",
        "Consolidate costs, sales, and profitability by client or service, flagging risks along the way",
        "Register and update rates on the Federal Maritime Commission platform",
        "Handle the physical onboarding of new team members and keep the workspace (WeWork) organized",
        "Provide cross-functional support across Sales, Operations, and Procurement during this fast-paced launch phase",
        "Keep records organized with proper digital backups and report any inconsistencies to your supervisor",
      ],
    },
    requirements: {
      es: [
        "Professional or technologist degree in Foreign Trade, International Business, Administration, or related fields",
        "Advanced English (B2-C1)",
        "1 to 2 years of experience in document management",
      ],
      en: [
        "Professional or technologist degree in Foreign Trade, International Business, Administration, or related fields",
        "Advanced English (B2-C1)",
        "1 to 2 years of experience in document management",
      ],
    },
    applyEmail: "jointheteam@tradingsolutions.com",
    postedAt: "2026-07-29",
  },
  {
    id: 7,
    slug: "china-operations-executive",
    linkedinUrl: "",
    title: {
      es: "Operations Executive and Support",
      en: "Operations Executive and Support",
    },
    dept: "Operaciones",
    location: "Shanghai / Shenzhen / Guangzhou, China",
    mode: "Presencial",
    level: "Junior",
    salary: "A convenir",
    tags: ["China", "Operations", "Freight Forwarding", "Track and Trace", "Builder Team"],
    description: {
      es: `📢 We're building our Builder Team in China! Looking for an Operations Executive & Support professional to keep our shipments moving flawlessly across Asia.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will own end-to-end shipment execution — coordinating bookings, suppliers, and logistics partners, and solving operational challenges so every client gets an on-time, on-spec experience.`,
      en: `📢 We're building our Builder Team in China! Looking for an Operations Executive & Support professional to keep our shipments moving flawlessly across Asia.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will own end-to-end shipment execution — coordinating bookings, suppliers, and logistics partners, and solving operational challenges so every client gets an on-time, on-spec experience.`,
    },
    responsibilities: {
      es: [
        "Execute bookings per client and assignment instructions, ensuring confirmations land within SLA",
        "Coordinate cargo with shipping lines, airlines, customs agents, and warehouses, keeping full traceability",
        "Keep Track & Trace data accurate and proactively flag delays or schedule changes",
        "Prepare and review HBL/MBL, handle Switch BL, and submit AMS/ISF to U.S. Customs",
        "Transmit House/Master BLs to customs portals and coordinate smooth clearance",
        "Provide cross-functional support across Pricing and Sales during this fast-paced launch phase",
      ],
      en: [
        "Execute bookings per client and assignment instructions, ensuring confirmations land within SLA",
        "Coordinate cargo with shipping lines, airlines, customs agents, and warehouses, keeping full traceability",
        "Keep Track & Trace data accurate and proactively flag delays or schedule changes",
        "Prepare and review HBL/MBL, handle Switch BL, and submit AMS/ISF to U.S. Customs",
        "Transmit House/Master BLs to customs portals and coordinate smooth clearance",
        "Provide cross-functional support across Pricing and Sales during this fast-paced launch phase",
      ],
    },
    requirements: {
      es: [
        "Bachelor's degree in International Trade, Logistics, Foreign Trade, Business Administration, or related fields",
        "Advanced, conversational English",
        "1 to 2 years of experience in logistics operations or freight forwarding",
        "Knowledge of logistics platforms and shipping-company portals",
      ],
      en: [
        "Bachelor's degree in International Trade, Logistics, Foreign Trade, Business Administration, or related fields",
        "Advanced, conversational English",
        "1 to 2 years of experience in logistics operations or freight forwarding",
        "Knowledge of logistics platforms and shipping-company portals",
      ],
    },
    applyEmail: "jointheteam@tradingsolutions.com",
    postedAt: "2026-07-29",
  },
  {
    id: 8,
    slug: "china-overseas-sales-executive",
    linkedinUrl: "",
    title: {
      es: "Overseas Sales Executive and Support",
      en: "Overseas Sales Executive and Support",
    },
    dept: "Comercial",
    location: "Shanghai / Shenzhen / Guangzhou, China",
    mode: "Presencial",
    level: "Senior",
    salary: "A convenir",
    tags: ["China", "Commercial", "Sales", "Agent Network", "Freight Forwarding", "Builder Team"],
    description: {
      es: `📢 We're building our Builder Team in China! Looking for an Overseas Sales Executive to open new markets and drive our commercial expansion across Asia.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will drive the end-to-end sales pipeline — from prospecting to closing — developing overseas agents and direct clients and connecting our local team with the global network.`,
      en: `📢 We're building our Builder Team in China! Looking for an Overseas Sales Executive to open new markets and drive our commercial expansion across Asia.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will drive the end-to-end sales pipeline — from prospecting to closing — developing overseas agents and direct clients and connecting our local team with the global network.`,
    },
    responsibilities: {
      es: [
        "Develop and follow up on overseas agents and direct clients, promoting our routes and services",
        "Prepare competitive quotes (FCL/LCL/Air), coordinating with pricing and operations",
        "Meet weekly KPIs and keep the CRM impeccable, with clear pipeline reports and forecasts",
        "Hit monthly and quarterly targets for agent acquisition, revenue, and account expansion",
        "Provide cross-functional support across Pricing, Procurement, and Operations",
        "Travel to visit agents, clients, and industry events as the business needs",
      ],
      en: [
        "Develop and follow up on overseas agents and direct clients, promoting our routes and services",
        "Prepare competitive quotes (FCL/LCL/Air), coordinating with pricing and operations",
        "Meet weekly KPIs and keep the CRM impeccable, with clear pipeline reports and forecasts",
        "Hit monthly and quarterly targets for agent acquisition, revenue, and account expansion",
        "Provide cross-functional support across Pricing, Procurement, and Operations",
        "Travel to visit agents, clients, and industry events as the business needs",
      ],
    },
    requirements: {
      es: [
        "Associate's or Bachelor's degree in International Trade, International Business, Logistics, or related fields",
        "Fluent, conversational English",
        "3+ years of experience in Freight Forwarding",
        "Proven experience developing overseas agents and selling ocean freight (FCL/LCL) to Latin America",
      ],
      en: [
        "Associate's or Bachelor's degree in International Trade, International Business, Logistics, or related fields",
        "Fluent, conversational English",
        "3+ years of experience in Freight Forwarding",
        "Proven experience developing overseas agents and selling ocean freight (FCL/LCL) to Latin America",
      ],
    },
    applyEmail: "jointheteam@tradingsolutions.com",
    postedAt: "2026-07-29",
  },
  {
    id: 9,
    slug: "china-pricing-executive",
    linkedinUrl: "",
    title: {
      es: "Pricing Executive - Support",
      en: "Pricing Executive - Support",
    },
    dept: "Pricing",
    location: "Shanghai / Shenzhen / Guangzhou, China",
    mode: "Presencial",
    level: "Junior",
    salary: "A convenir",
    tags: ["China", "Pricing", "Rates", "Freight Forwarding", "Builder Team"],
    description: {
      es: `📢 We're building our Builder Team in China! Looking for a Pricing Executive to shape our pricing strategy and rate management across Asia–LATAM trade.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will develop pricing strategies, manage rates with carriers and agents, and turn market insight into profitable business between Asia and Latin America.`,
      en: `📢 We're building our Builder Team in China! Looking for a Pricing Executive to shape our pricing strategy and rate management across Asia–LATAM trade.

At Trading Solutions, we're redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We want someone who wants to build, not just operate.

The Role: You will develop pricing strategies, manage rates with carriers and agents, and turn market insight into profitable business between Asia and Latin America.`,
    },
    responsibilities: {
      es: [
        "Update and register FCL/LCL/air rates, keeping them valid per quarter with full traceability",
        "Request and confirm rates with carriers, airlines, and agents, and coordinate with Sales",
        "Resolve rate/charge discrepancies and run consistency checks between quotes and final costs",
        "Identify cost-saving opportunities and support profitability analysis of suppliers and routes",
        "Improve quotation templates and processes for efficiency",
        "Provide operational and sales support during this fast-paced launch phase (potential sales commission)",
      ],
      en: [
        "Update and register FCL/LCL/air rates, keeping them valid per quarter with full traceability",
        "Request and confirm rates with carriers, airlines, and agents, and coordinate with Sales",
        "Resolve rate/charge discrepancies and run consistency checks between quotes and final costs",
        "Identify cost-saving opportunities and support profitability analysis of suppliers and routes",
        "Improve quotation templates and processes for efficiency",
        "Provide operational and sales support during this fast-paced launch phase (potential sales commission)",
      ],
    },
    requirements: {
      es: [
        "Bachelor's degree in International Trade, Logistics, Foreign Trade, Business Administration, or related fields",
        "Advanced English",
        "1 to 2 years of experience in logistics, freight forwarding, or international trade",
        "Knowledge of logistics platforms and shipping-company portals",
      ],
      en: [
        "Bachelor's degree in International Trade, Logistics, Foreign Trade, Business Administration, or related fields",
        "Advanced English",
        "1 to 2 years of experience in logistics, freight forwarding, or international trade",
        "Knowledge of logistics platforms and shipping-company portals",
      ],
    },
    applyEmail: "jointheteam@tradingsolutions.com",
    postedAt: "2026-07-29",
  },
  {
    id: 12,
    slug: "especialista-sig-sst",
    linkedinUrl: "",
    title: {
      es: "Especialista SIG-SST",
      en: "Integrated Management Systems & HSE Specialist",
    },
    dept: "Wellness",
    location: "Barranquilla, Atl\u00e1ntico, Colombia",
    mode: "Presencial",
    level: "Senior",
    salary: "A convenir",
    tags: ["SIG", "SST", "BASC V6", "ISO 9001/14001/45001", "Licencia SST", "Biling\u00fce EN/ES"],
    description: {
      es: "\u00a1Buscamos un Especialista SIG-SST para unirse a nuestro equipo!\n\nEn Trading Solutions estamos redefiniendo el futuro de la log\u00edstica global, uniendo tecnolog\u00eda de punta, visibilidad en tiempo real y coordinaci\u00f3n fluida entre continentes. Le damos a las empresas la capacidad de moverse m\u00e1s r\u00e1pido, con m\u00e1s inteligencia y con total confianza en cada embarque.\n\nBuscamos un Especialista SIG-SST que lidere el sistema que mantiene a Trading Solutions operando al nivel por el que nuestros clientes ya nos reconocen. Es un rol end to end \u2014calidad, ambiental, seguridad y salud en el trabajo, seguridad de la cadena de suministro e inocuidad\u2014 e incluye el plan anual de formaci\u00f3n, el programa de auditor\u00edas internas y las pr\u00e1cticas del d\u00eda a d\u00eda que mantienen nuestra operaci\u00f3n segura y consistente. Vas a trabajar con toda la compa\u00f1\u00eda y en terreno: reportas al CWO, lideras a un analista y a un practicante, y eres nuestra voz t\u00e9cnica con clientes y aliados alrededor del mundo. El cargo se mide por dos cosas: certificaciones que se mantienen fuertes, y un equipo que trabaja seguro todos los d\u00edas.",
      en: "We're looking for an Integrated Management Systems & HSE Specialist to join our team!\n\nAt Trading Solutions, we are redefining the future of global logistics by merging cutting-edge technology, real-time visibility, and seamless coordination across continents. We empower businesses to move faster, smarter, and with absolute confidence in every shipment.\n\nWe're looking for an Integrated Management Systems & HSE Specialist to lead the system that keeps Trading Solutions operating at the standard our clients already know us for. It's an end-to-end role \u2014 quality, environment, occupational health and safety, supply chain security and food safety \u2014 including the annual training plan, the internal audit programme and the everyday practices that keep our operation safe and consistent. You'll work across the whole company and out in the field: you report to the CWO, lead an analyst and an intern, and are our technical voice with clients and partners around the world. The role is measured on two things: certifications that stay strong, and a team that works safely every day.",
    },
    responsibilities: {
      es: [
        "Mantener y fortalecer el Sistema Integrado de Gesti\u00f3n: calidad, ambiental, seguridad y salud en el trabajo, seguridad de la cadena de suministro e inocuidad",
        "Liderar el sistema de seguridad y salud en el trabajo: matriz de peligros, plan anual de trabajo, programas de vigilancia epidemiol\u00f3gica y plan de emergencias",
        "Acompa\u00f1ar la prevenci\u00f3n en el d\u00eda a d\u00eda: inspecciones planeadas, an\u00e1lisis de incidentes y seguimiento de los indicadores de seguridad",
        "Sostener las pr\u00e1cticas de seguridad de la cadena de suministro: inspecci\u00f3n de unidades de carga, control de sellos, estudios de seguridad y acuerdos con nuestros aliados",
        "Ser due\u00f1o del plan anual de formaci\u00f3n de los cinco sistemas y de la medici\u00f3n de su eficacia",
        "Planear y ejecutar el programa anual de auditor\u00edas internas y preparar a la compa\u00f1\u00eda para las evaluaciones externas",
        "Ser nuestra voz t\u00e9cnica ante clientes internacionales, aliados y entes certificadores",
        "Liderar al Analista SIG y al practicante, y llevar el sistema a bodega, patio y puerto \u2014 no solo al escritorio",
      ],
      en: [
        "Maintain and strengthen the Integrated Management System: quality, environment, occupational health and safety, supply chain security and food safety",
        "Lead the occupational health and safety system: hazard matrix, annual work plan, health surveillance programmes and the emergency plan",
        "Support prevention day to day: planned inspections, incident analysis and follow-up on safety indicators",
        "Sustain our supply chain security practices: cargo unit inspections, seal control, background studies and agreements with our partners",
        "Own the annual training plan across all five systems and the measurement of its effectiveness",
        "Plan and run the annual internal audit programme and prepare the company for external assessments",
        "Be our technical voice with international clients, partners and certification bodies",
        "Lead the SIG Analyst and the intern, and take the system to the warehouse, the yard and the port \u2014 not just to the desk",
      ],
    },
    requirements: {
      es: [
        "Profesional en Ingenier\u00eda Industrial, Ambiental, de Procesos, Administraci\u00f3n o Seguridad y Salud en el Trabajo, con posgrado en SST, HSEQ o Sistemas Integrados de Gesti\u00f3n",
        "Licencia vigente en Seguridad y Salud en el Trabajo (Resoluci\u00f3n 908 de 2025). Se verifica n\u00famero, entidad expedidora y fecha de vencimiento antes de la entrevista t\u00e9cnica",
        "Curso de 50 horas del SG-SST y curso de actualizaci\u00f3n de 20 horas vigente",
        "Auditor interno en ISO 9001, ISO 14001 e ISO 45001",
        "M\u00ednimo 5 a\u00f1os en sistemas integrados de gesti\u00f3n y SST, con al menos 3 liderando el sistema en una empresa certificada",
        "Haber atendido de forma directa al menos un ciclo completo de auditor\u00eda de certificaci\u00f3n o recertificaci\u00f3n externa",
        "Ingl\u00e9s B2 o superior. Se valida durante el proceso con una entrevista sostenida en ingl\u00e9s",
        "Excel avanzado. Hay prueba t\u00e9cnica",
        "Preferible: auditor interno BASC V6:2022. Si no lo trae, se certifica durante los primeros seis meses",
        "Preferible: experiencia en log\u00edstica internacional, freight forwarding, agenciamiento aduanero, puerto o zona franca",
      ],
      en: [
        "Degree in Industrial, Environmental or Process Engineering, Business Administration or Occupational Health and Safety, with a postgraduate qualification in OHS, HSEQ or Integrated Management Systems",
        "Valid Colombian OHS licence (Resolution 908 of 2025). Licence number, issuing authority and expiry date are verified before the technical interview",
        "50-hour OHS management course and a current 20-hour refresher course",
        "Internal auditor for ISO 9001, ISO 14001 and ISO 45001",
        "At least 5 years in integrated management systems and OHS, including 3 years leading the system in a certified company",
        "Direct, hands-on involvement in at least one full external certification or recertification audit cycle",
        "English at B2 or above, verified during the process through an interview held entirely in English",
        "Advanced Excel. There is a technical exercise",
        "Preferred: BASC V6:2022 internal auditor. If not held on entry, certification is completed within the first six months",
        "Preferred: background in international logistics, freight forwarding, customs brokerage, ports or free trade zones",
      ],
    },
    applyEmail: "jointheteam@tradingsolutions.com",
    postedAt: "2026-09-07",
  },

]
