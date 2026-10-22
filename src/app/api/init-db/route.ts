import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Crea el esquema de Neon y resiembra las vacantes.
 *
 * ES DESTRUCTIVO: hace `TRUNCATE vacancies RESTART IDENTITY CASCADE` antes de
 * sembrar. Estuvo expuesto como GET sin autenticación y con CORS abierto, así
 * que cualquiera que abriera la URL —o un rastreador que la siguiera— vaciaba
 * la tabla y todo lo que cuelga de ella. Ahora es POST (un GET no debe cambiar
 * estado, y es lo que permitía el disparo accidental) y exige admin.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Método no permitido. Esta operación es destructiva: usa POST con credenciales de admin.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}

type VacancySeed = {
  id: number;
  slug: string;
  title_es: string;
  title_en: string;
  department: string;
  location: string;
  work_mode: string;
  employment_type: string;
  level: string;
  salary_range: string;
  tags: string[];
  description_es: string;
  description_en: string;
  responsibilities_es: string[];
  responsibilities_en: string[];
  requirements_es: string[];
  requirements_en: string[];
  linkedin_url: string;
  apply_email: string;
  posted_at: string;
};

// VACANTES REALES — Trading Solutions Barranquilla
// Fuente: src/data/jobs.ts (fuente de verdad del frontend)
const VACANCIES: VacancySeed[] = [
  {
    id: 1,
    slug: 'senior-pricing-analyst',
    title_es: 'Pricing Senior',
    title_en: 'Senior Pricing Analyst',
    department: 'Comercial',
    location: 'Barranquilla, Atlántico, Colombia',
    work_mode: 'Presencial',
    employment_type: 'full-time',
    level: 'Senior',
    salary_range: 'Competitivo según experiencia',
    tags: ['Pricing', 'Freight Forwarding', 'Incoterms', 'Carrier Negotiation', 'RFQ/RFP'],
    description_es:
      "Liderarás la estrategia de tarifas y la rentabilidad de la red global de Trading Solutions. Tomarás ownership de la estrategia de pricing — analizarás mercados, negociarás con carriers y construirás la ventaja competitiva que impulsa nuestra expansión internacional en servicios marítimos, aéreos y terrestres.",
    description_en:
      "Lead rate strategy and drive profitability across Trading Solutions' global freight network. Take ownership of pricing strategy — analyze markets, negotiate with carriers, and build the competitive edge that fuels international expansion across ocean, air, and ground services.",
    responsibilities_es: [
      'Liderar el desarrollo y ejecución de estrategias de pricing en servicios marítimos, aéreos y terrestres para maximizar ingresos y margen',
      'Negociar acuerdos de tarifas complejos con carriers, co-loaders y agentes en el exterior usando compromisos de volumen e inteligencia de mercado',
      'Gestionar respuestas a RFQ/RFP de cuentas clave y estratégicas con modelos de costo detallados y propuestas comerciales',
      'Mentorear analistas junior de pricing y hacer partnership con liderazgos de Ventas, Operaciones y Finanzas',
      'Diseñar y mantener dashboards de pricing y reportes de rentabilidad para toma de decisiones ejecutiva',
      'Monitorear costos reales vs. tarifas cotizadas y liderar análisis de causa raíz sobre variaciones de margen',
    ],
    responsibilities_en: [
      'Lead development and execution of pricing strategies across ocean, air, and ground services to maximize revenue and margin',
      'Negotiate complex rate agreements with carriers, co-loaders, and overseas agents using volume commitments and market intelligence',
      'Manage RFQ/RFP responses for key and strategic accounts with detailed cost models and commercial proposals',
      'Mentor junior pricing analysts and partner with Sales, Operations, and Finance leadership',
      'Design and maintain pricing dashboards and profitability reports for executive decision-making',
      'Monitor actual costs vs. quoted rates, lead root-cause analysis on margin variances',
    ],
    requirements_es: [
      '4+ años en pricing de freight forwarding, gestión de tarifas o logística comercial',
      'Conocimiento profundo de Incoterms, modos de envío internacionales (FCL, LCL, aéreo, terrestre, multimodal) y estructuras de costos',
      'Experiencia probada en negociación con carriers y gestión estratégica de tarifas',
      'Habilidades analíticas avanzadas; dominio de Excel, herramientas de pricing y visualización de datos',
      'Fuertes habilidades de liderazgo y comunicación interfuncional',
      'Licenciatura en Negocios Internacionales, Logística, Ingeniería Industrial, Finanzas o afín',
    ],
    requirements_en: [
      '4+ years in freight forwarding pricing, rate management, or commercial logistics',
      'Deep understanding of Incoterms, international shipping modes (FCL, LCL, air, ground, multimodal) and freight cost structures',
      'Proven carrier negotiation and strategic rate management experience',
      'Advanced analytical skills; expert Excel, pricing tools, data visualization',
      'Strong leadership and cross-functional communication skills',
      "Bachelor's in International Business, Logistics, Industrial Engineering, Finance, or related",
    ],
    linkedin_url: 'https://www.linkedin.com/jobs/view/4403973230/',
    apply_email: 'jointheteam@tradingsolutions.com',
    posted_at: '2026-04-14',
  },
  {
    id: 2,
    slug: 'inside-sales-support',
    title_es: 'Inside Sales Support',
    title_en: 'Inside Sales Support Specialist',
    department: 'Comercial',
    location: 'Barranquilla, Atlántico, Colombia',
    work_mode: 'Presencial',
    employment_type: 'full-time',
    level: 'Junior',
    salary_range: 'Competitivo según experiencia',
    tags: ['Inside Sales', 'CRM', 'Account Management', 'Cotizaciones', 'Bilingüe EN/ES'],
    description_es:
      'Eres la primera línea del éxito del cliente en Trading Solutions. Conectas la estrategia comercial con la ejecución operativa en un rol que da la cara al cliente — asegurando que cada interacción genere lealtad, revenue y crecimiento a largo plazo en nuestro portafolio global de logística.',
    description_en:
      "You're the frontline of client success at Trading Solutions. Bridge commercial strategy and operational execution in a client-facing role — ensuring every customer interaction drives loyalty, revenue, and long-term growth across the global logistics portfolio.",
    responsibilities_es: [
      'Ser el punto de contacto principal para cuentas asignadas (consultas, seguimientos, solicitudes de servicio)',
      'Generar y gestionar cotizaciones de carga con el equipo de Pricing, asegurando precisión y posicionamiento competitivo',
      'Identificar oportunidades de upselling y cross-selling dentro del portafolio existente',
      'Hacer seguimiento end-to-end a los embarques y resolver incidencias proactivamente',
      'Colaborar con Operaciones, Documentación y Finanzas para una entrega de servicio impecable',
      'Mantener registros en CRM (interacciones, pipeline, forecasts) y apoyar el desarrollo de negocio',
    ],
    responsibilities_en: [
      'Serve as primary point of contact for assigned client accounts (inquiries, follow-ups, service requests)',
      'Generate and manage freight quotations with the Pricing team ensuring accuracy and competitive positioning',
      'Identify upselling and cross-selling opportunities within existing portfolio',
      'Track shipments end-to-end and resolve issues proactively',
      'Collaborate with Operations, Documentation, and Finance for seamless service delivery',
      'Maintain CRM records (interactions, pipeline, forecasts) and support business development',
    ],
    requirements_es: [
      '1-3 años en inside sales, account management o servicio al cliente en logística/freight forwarding',
      'Fuertes habilidades de comunicación y relacionamiento en inglés y español',
      'Capacidad para gestionar múltiples cuentas en un entorno de ritmo alto',
      'Dominio de herramientas CRM (Salesforce, HubSpot) y Microsoft Office',
      'Licenciatura en Administración de Empresas, Comercio Internacional, Marketing o afín',
      'Preferible: experiencia en freight forwarding, agenciamiento aduanero o 3PL',
    ],
    requirements_en: [
      '1-3 years in inside sales, account management, or customer service within logistics/freight forwarding',
      'Strong communication and relationship-building skills in English and Spanish',
      'Ability to manage multiple accounts in a fast-paced environment',
      'Proficiency in CRM tools (Salesforce, HubSpot) and Microsoft Office',
      "Bachelor's in Business Administration, International Trade, Marketing, or related",
      'Preferred: experience in freight forwarding, customs brokerage, or 3PL',
    ],
    linkedin_url: 'https://www.linkedin.com/jobs/view/4403965745/',
    apply_email: 'jointheteam@tradingsolutions.com',
    posted_at: '2026-04-14',
  },
  {
    id: 3,
    slug: 'customer-documentation-specialist',
    title_es: 'Customer Documentation Specialist',
    title_en: 'Customer Documentation Specialist',
    department: 'Operaciones',
    location: 'Barranquilla, Atlántico, Colombia',
    work_mode: 'Presencial',
    employment_type: 'full-time',
    level: 'Junior',
    salary_range: 'Competitivo según experiencia',
    tags: ['Compliance', 'Documentación Aduanera', 'Bill of Lading', 'Incoterms', 'Freight Forwarding'],
    description_es:
      'Eres la columna vertebral del compliance comercial y la precisión de cada embarque en Trading Solutions. Aseguras excelencia operativa en cada envío — donde la precisión se encuentra con el impacto global — gestionando flujos de documentación, compliance aduanero y coordinación interfuncional.',
    description_en:
      "You're the backbone of trade compliance and shipment accuracy at Trading Solutions. Ensure operational excellence across every shipment — where precision meets global impact — by managing documentation workflows, customs compliance, and cross-team coordination.",
    responsibilities_es: [
      'Preparar, revisar y procesar documentación de embarque: B/L, facturas comerciales, packing lists, certificados de origen, declaraciones aduaneras',
      'Asegurar cumplimiento de regulaciones de comercio internacional, requerimientos aduaneros y estándares de carrier',
      'Coordinar con carriers, forwarders, agentes aduaneros y agentes en el exterior para entregas a tiempo',
      'Gestionar flujos documentales de múltiples embarques cumpliendo cut-offs de buque y deadlines de aduana',
      'Identificar y resolver discrepancias antes de que impacten tiempos o generen penalidades',
      'Mantener archivos digitales organizados según políticas de retención y requerimientos de auditoría',
    ],
    responsibilities_en: [
      'Prepare, review, and process shipping documentation: B/L, commercial invoices, packing lists, certificates of origin, customs declarations',
      'Ensure compliance with international trade regulations, customs requirements, and carrier standards',
      'Coordinate with carriers, forwarders, customs brokers, and overseas agents for timely submission',
      'Manage document workflows across multiple shipments, meeting vessel cut-offs and customs clearance deadlines',
      'Identify and resolve discrepancies before they impact timelines or incur penalties',
      'Maintain organized digital records per retention policies and audit requirements',
    ],
    requirements_es: [
      '1-3 años en documentación de embarques, compliance comercial o administración logística',
      'Conocimiento de documentos de embarque internacional (B/L, AWB, ISF, AES, certificados de origen) y procedimientos aduaneros',
      'Atención excepcional al detalle bajo alto volumen y plazos ajustados',
      'Dominio de Microsoft Office y sistemas de gestión documental',
      'Licenciatura en Negocios Internacionales, Comercio Exterior, Logística o afín',
      'Preferible: Incoterms 2020, Cartas de Crédito, conocimiento US CBP/FDA/USDA; fluidez EN/ES',
    ],
    requirements_en: [
      '1-3 years in shipping documentation, trade compliance, or logistics administration',
      'Knowledge of international shipping documents (B/L, AWB, ISF, AES, certificates of origin) and customs procedures',
      'Exceptional attention to detail under high-volume, tight deadlines',
      'Proficiency in Microsoft Office and document management systems',
      "Bachelor's in International Business, Foreign Trade, Logistics, or related",
      'Preferred: Incoterms 2020, Letters of Credit, U.S. CBP/FDA/USDA knowledge; EN/ES fluency',
    ],
    linkedin_url: 'https://www.linkedin.com/jobs/view/4403956946/',
    apply_email: 'jointheteam@tradingsolutions.com',
    posted_at: '2026-04-14',
  },
  {
    id: 4,
    slug: 'pricing-junior',
    title_es: 'Pricing Junior',
    title_en: 'Junior Pricing Analyst',
    department: 'Comercial',
    location: 'Barranquilla, Atlántico, Colombia',
    work_mode: 'Presencial',
    employment_type: 'full-time',
    level: 'Junior',
    salary_range: '$3.0M - $4.0M COP',
    tags: ['Pricing', 'Freight Forwarding', 'Cotizaciones', 'Inglés B1-B2', 'Junior'],
    description_es:
      'Serás parte del equipo de pricing de Trading Solutions apoyando la generación de cotizaciones, análisis de tarifas con carriers y respuestas a RFQs. Rol de entrada ideal para profesionales de comercio exterior que quieren especializarse en freight forwarding.',
    description_en:
      "You'll support the pricing team at Trading Solutions by generating quotations, analyzing carrier rates, and responding to RFQs. Entry-level role ideal for international trade professionals specializing in freight forwarding.",
    responsibilities_es: [
      'Generar cotizaciones marítimas, aéreas y terrestres para cuentas comerciales',
      'Solicitar y comparar tarifas con carriers, co-loaders y agentes',
      'Mantener el pricing sheet y el banco de tarifas vigentes',
      'Dar soporte a Inside Sales en cotizaciones urgentes',
      'Monitorear tendencias de tarifas por ruta y reportar al Senior',
    ],
    responsibilities_en: [
      'Generate ocean, air, and ground freight quotations for commercial accounts',
      'Request and compare rates with carriers, co-loaders, and agents',
      'Maintain the pricing sheet and active rates database',
      'Support Inside Sales with urgent quotations',
      'Monitor rate trends per route and report to the Senior',
    ],
    requirements_es: [
      '1-2 años de experiencia en comercio exterior, freight forwarding o logística',
      'Manejo de Excel avanzado y cálculo de costos',
      'Inglés intermedio (B1 mínimo, B2 deseable)',
      'Técnico o profesional en Comercio Internacional / Admin Negocios Internacionales',
      'Atención al detalle y habilidad para priorizar bajo presión',
    ],
    requirements_en: [
      '1-2 years in international trade, freight forwarding, or logistics',
      'Advanced Excel and cost calculation skills',
      'Intermediate English (B1 minimum, B2 preferred)',
      "Technical or Bachelor's in International Trade / International Business",
      'Attention to detail and ability to prioritize under pressure',
    ],
    linkedin_url: '',
    apply_email: 'jointheteam@tradingsolutions.com',
    posted_at: '2026-04-14',
  },
  {
    id: 5,
    slug: 'lead-accounting-finance-officer',
    title_es: 'Líder de Contabilidad y Finanzas',
    title_en: 'Lead Accounting & Finance Officer',
    department: 'Finanzas',
    location: 'Barranquilla, Atlántico, Colombia',
    work_mode: 'Presencial',
    employment_type: 'full-time',
    level: 'Senior',
    salary_range: 'Competitivo según experiencia',
    tags: ['Contabilidad', 'IFRS/NIIF', 'Cumplimiento Tributario', 'Reportes Financieros', 'ERP (SAP/Oracle)', 'Consolidación', 'Inglés B1+'],
    description_es:
      'Buscamos un Líder de Contabilidad y Finanzas para garantizar la integridad financiera y el cumplimiento normativo multi-país a medida que escalamos nuestras operaciones globales. Este rol será clave para anclar nuestras operaciones contables en múltiples jurisdicciones, asegurando reportes financieros sólidos, cumplimiento tributario internacional y un marco de gobernanza que soporte el crecimiento de Trading Solutions como compañía global de freight forwarding.',
    description_en:
      'We are hiring a Lead Accounting & Finance Officer to drive financial integrity and multi-country compliance as we scale our global operations. This role anchors accounting operations across multiple jurisdictions, ensuring rock-solid financial reporting, international tax compliance, and the governance framework that allows Trading Solutions to scale as a global freight forwarding company.',
    responsibilities_es: [
      'Liderar y fortalecer la función contable, estableciendo estándares de precisión, oportunidad y cumplimiento regulatorio en todas las entidades',
      'Gestionar los cierres mensuales y anuales, asegurando reportes financieros impecables alineados con regulaciones locales y políticas corporativas',
      'Liderar la estrategia de cumplimiento tributario internacional en todos los países donde opera Trading Solutions',
      'Coordinar la contabilidad multi-entidad y transfronteriza, incluyendo estados financieros consolidados para holdings y subsidiarias internacionales',
      'Preparar reportes financieros de alto impacto para la gerencia, auditores externos y stakeholders clave',
      'Establecer controles internos robustos, marcos de gobernanza y prácticas de mitigación de riesgos',
    ],
    responsibilities_en: [
      'Lead and strengthen the accounting function, setting standards for accuracy, timeliness, and full regulatory compliance across all entities',
      'Own the monthly and annual closing cycles, ensuring flawless financial reporting aligned with local regulations and corporate policies',
      'Drive international tax compliance strategy across every country where Trading Solutions operates',
      'Coordinate multi-entity and cross-border accounting, including consolidated financial statements for holding structures and international subsidiaries',
      'Prepare and deliver high-impact financial reports for senior management, external auditors, and key stakeholders',
      'Establish and maintain robust internal financial controls, governance frameworks, and risk mitigation practices',
    ],
    requirements_es: [
      'Título profesional en Contaduría Pública',
      '3-5 años de experiencia progresiva en contabilidad corporativa, reportes financieros o roles afines',
      'Experiencia comprobada gestionando declaraciones tributarias, cierres mensuales/anuales y cumplimiento regulatorio',
      'Mentalidad analítica con excepcional atención al detalle y precisión de datos',
      'Inglés nivel B1+ (intermedio o superior); B2-C1 deseable',
      'Deseable: conocimiento de IFRS/NIIF, ERP (SAP/Oracle) y experiencia en logística internacional o freight forwarding',
    ],
    requirements_en: [
      "Bachelor's degree in Accounting",
      '3-5 years of progressive experience in corporate accounting, financial reporting, or related finance roles',
      'Proven track record managing tax filings, monthly/annual closings, and regulatory compliance',
      'Strong analytical mindset with exceptional attention to detail and data accuracy',
      'English proficiency at B1+ level (intermediate or above); B2-C1 is a plus',
      'Preferred: working knowledge of IFRS/NIIF, ERP systems (SAP/Oracle), and experience in freight forwarding or international logistics',
    ],
    linkedin_url: 'https://www.linkedin.com/jobs/view/4376444434/',
    apply_email: 'jointheteam@tradingsolutions.com',
    posted_at: '2026-04-17',
  },
];

export async function POST(request: NextRequest) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // 1) Tablas base (schema original se mantiene)
    await sql(`
      CREATE TABLE IF NOT EXISTS vacancies (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(100),
        location VARCHAR(255),
        work_mode VARCHAR(50),
        employment_type VARCHAR(50),
        description TEXT,
        responsibilities TEXT,
        requirements TEXT,
        preferred_qualifications TEXT,
        salary_range VARCHAR(100),
        status VARCHAR(50) DEFAULT 'open',
        linkedin_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS talent_pool (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        "current_role" VARCHAR(255),
        years_experience INTEGER,
        skills TEXT,
        education VARCHAR(500),
        languages TEXT,
        location VARCHAR(255),
        linkedin_url VARCHAR(500),
        cv_data TEXT,
        cv_filename VARCHAR(255),
        summary TEXT,
        tags TEXT,
        source VARCHAR(100) DEFAULT 'manual',
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS matching_results (
        id SERIAL PRIMARY KEY,
        vacancy_id INTEGER REFERENCES vacancies(id),
        candidate_id INTEGER REFERENCES talent_pool(id),
        match_score DECIMAL(5,2),
        match_details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 2) Migración: añadir columnas nuevas si no existen (bilingüe + metadata)
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS slug VARCHAR(255)`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS apply_email VARCHAR(255)`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS posted_at DATE`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS level VARCHAR(50)`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS tags TEXT`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS title_es VARCHAR(255)`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS title_en VARCHAR(255)`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS description_es TEXT`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS description_en TEXT`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS responsibilities_es JSONB`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS responsibilities_en JSONB`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS requirements_es JSONB`);
    await sql(`ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS requirements_en JSONB`);

    // Índice único en slug (idempotente)
    await sql(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vacancies_slug ON vacancies(slug)`);

    // 3) Indexes base
    await sql(`CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_vacancies_department ON vacancies(department)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_talent_pool_status ON talent_pool(status)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_talent_pool_email ON talent_pool(email)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_matching_vacancy ON matching_results(vacancy_id)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_matching_candidate ON matching_results(candidate_id)`);

    // 3b) Tabla assessment_tokens (pruebas psicométricas enviadas a candidatos)
    await sql(`
      CREATE TABLE IF NOT EXISTS assessment_tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(255) UNIQUE NOT NULL,
        candidate_id INTEGER REFERENCES talent_pool(id) ON DELETE SET NULL,
        candidate_name VARCHAR(255) NOT NULL,
        candidate_email VARCHAR(255) NOT NULL,
        vacancy_id INTEGER REFERENCES vacancies(id) ON DELETE SET NULL,
        vacancy_slug VARCHAR(255),
        assessment_ids TEXT,
        language VARCHAR(5) DEFAULT 'es',
        status VARCHAR(50) DEFAULT 'sent',
        score INTEGER,
        results JSONB,
        source VARCHAR(100) DEFAULT 'manual',
        sent_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')
      )
    `);
    await sql(`CREATE INDEX IF NOT EXISTS idx_assessment_token ON assessment_tokens(token)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_assessment_email ON assessment_tokens(candidate_email)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_assessment_vacancy ON assessment_tokens(vacancy_id)`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_assessment_status ON assessment_tokens(status)`);

    // 3c) Parser CV: columnas para la extracción estructurada con Claude
    //     cv_parsed_data JSONB  → {skills_inferidas, years_experience, education_level,
    //                              languages, seniority, industries, titles_held, strengths}
    //     cv_parsed_at TIMESTAMP → para invalidar cache cuando cambia el CV
    await sql(`ALTER TABLE talent_pool ADD COLUMN IF NOT EXISTS cv_parsed_data JSONB`);
    await sql(`ALTER TABLE talent_pool ADD COLUMN IF NOT EXISTS cv_parsed_at TIMESTAMP`);
    await sql(`CREATE INDEX IF NOT EXISTS idx_talent_pool_parsed_at ON talent_pool(cv_parsed_at)`);

    // 4) Reset + seed: IDs 1/2/3 de jobs.ts como fuente de verdad
    await sql(`TRUNCATE TABLE vacancies RESTART IDENTITY CASCADE`);

    for (const v of VACANCIES) {
      await sql(
        `INSERT INTO vacancies (
          id, slug,
          title, title_es, title_en,
          department, location, work_mode, employment_type, level,
          description, description_es, description_en,
          responsibilities, responsibilities_es, responsibilities_en,
          requirements, requirements_es, requirements_en,
          preferred_qualifications, salary_range, tags,
          status, linkedin_url, apply_email, posted_at
        ) VALUES (
          $1, $2,
          $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18, $19,
          $20, $21, $22,
          $23, $24, $25, $26
        )`,
        [
          v.id,
          v.slug,
          v.title_en,
          v.title_es,
          v.title_en,
          v.department,
          v.location,
          v.work_mode,
          v.employment_type,
          v.level,
          v.description_en,
          v.description_es,
          v.description_en,
          v.responsibilities_en.join('; '),
          JSON.stringify(v.responsibilities_es),
          JSON.stringify(v.responsibilities_en),
          v.requirements_en.join('; '),
          JSON.stringify(v.requirements_es),
          JSON.stringify(v.requirements_en),
          null,
          v.salary_range,
          v.tags.join(', '),
          'open',
          v.linkedin_url,
          v.apply_email,
          v.posted_at,
        ]
      );
    }

    // 5) Asegurar que la secuencia avance después de los IDs fijos
    await sql(`SELECT setval('vacancies_id_seq', (SELECT COALESCE(MAX(id), 0) FROM vacancies))`);

    return NextResponse.json(
      {
        message: 'Database initialized successfully',
        tables_created: ['vacancies', 'talent_pool', 'matching_results'],
        schema_migrated: [
          'slug',
          'apply_email',
          'posted_at',
          'level',
          'tags',
          'title_es',
          'title_en',
          'description_es',
          'description_en',
          'responsibilities_es',
          'responsibilities_en',
          'requirements_es',
          'requirements_en',
        ],
        vacancies_inserted: VACANCIES.length,
        vacancies: VACANCIES.map((v) => ({ id: v.id, slug: v.slug, title_en: v.title_en })),
      },
    );
  } catch (error) {
    console.error('Database initialization error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Database initialization failed' },
      { status: 500 },
    );
  }
}
