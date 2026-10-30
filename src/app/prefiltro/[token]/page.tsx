"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { invalidLinkBoth } from "@/lib/candidate-invalid-link";
import { CANDIDATE_MAIL } from "@/lib/candidate-public-error";
import "./submit.css";

const TS_BLACK = "#111111";
const TS_BLUE = "#0988FC";
const TS_GRAY = "#6F6F6A";
const TS_BORDER = "#E6E6E1";
const TS_FONT = '"Open Sauce Two", Inter, "Helvetica Neue", Arial, sans-serif';

type Phase = "loading" | "habeas" | "form" | "submitting" | "done" | "error";

type CandidateData = {
  candidate: { id: string; name: string; email: string };
  vacancy: { title: string; form_template_key?: string };
  client: { name: string };
};

const SALARY_RANGES = ["< 3 M", "3 – 4 M", "4 – 5 M", "5 – 6 M", "6 – 7 M", "7 – 8 M", "8 M+"];
const AVAILABILITY = ["Inmediato", "15 días", "30 días", "60+ días"];
const RELOCATE = ["Ya vivo en Barranquilla", "Sí, dispuesto a mudarme", "No me puedo mudar"];
const ENGLISH = ["A1 (básico)", "A2 (elemental)", "B1 (intermedio)", "B2 (intermedio alto)", "C1 (avanzado)", "C2 (nativo / fluido)"];
// El marco europeo no se usa en China: alli se habla de CET, IELTS y TOEFL.
// Con los chips en letras peladas, las cinco unicas personas descartadas por
// idioma fueron las cinco que marcaron "B1" -- una con IELTS 7.5 -- y nadie
// marco A1 ni A2: "B1" se estaba leyendo como "no estoy seguro". La etiqueta
// lleva la equivalencia; el valor que se guarda sigue siendo B1/B2/C1/C2.
const CN_ENGLISH: ChipOption[] = [
  { value: "B1", label: "B1 · CET-4 · IELTS 4.5–5.0" },
  { value: "B2", label: "B2 · CET-6 · IELTS 5.5–6.5" },
  { value: "C1", label: "C1 · IELTS 7.0–8.0 · TEM-8" },
  { value: "C2", label: "C2 · near-native" },
];
// Panama Ops · CEFR letters; soft mark below B1 (A1/A2).
const PA_ENGLISH: ChipOption[] = [
  { value: "A1", label: "A1 · basic" },
  { value: "A2", label: "A2 · elementary" },
  { value: "B1", label: "B1 · intermediate" },
  { value: "B2", label: "B2 · upper-intermediate" },
  { value: "C1", label: "C1 · advanced" },
  { value: "C2", label: "C2 · near-native" },
];
// Education options · varían según template
const EDU_COMEX = ["Industrial", "Sistemas / Software", "Otra ingeniería", "Otra carrera", "Estudiante últimos semestres", "Bachiller / técnico"];
const EDU_HR = ["Psicología", "Administración / Negocios", "Recursos Humanos", "Comunicación / Mercadeo", "Otra carrera", "Estudiante últimos semestres"];
const EDU_FINANCE = ["Contaduría Pública", "Administración Financiera", "Economía", "Ingeniería Industrial", "Otra carrera", "Estudiante últimos semestres"];
const EDU_SIG = ["Ingeniería Industrial", "Ingeniería Ambiental / Procesos", "Seguridad y Salud en el Trabajo", "Administración", "Otra ingeniería", "Otra carrera"];
const AUDITOR_CERTS = ["ISO 9001", "ISO 14001", "ISO 45001", "BASC V6:2022", "Auditor líder IRCA / RABQSA", "Ninguna todavía"];
const SIG_SYSTEMS = ["Calidad", "Ambiental", "Seguridad y salud en el trabajo", "Seguridad de la cadena de suministro", "Inocuidad", "Ninguno de estos"];
const SIG_SECTORS = ["Logística / freight forwarding", "Aduanas / puerto / zona franca", "Manufactura", "Alimentos", "Construcción / obra", "Servicios / oficina", "Otro"];
const CRMS = ["Salesforce", "HubSpot", "CargoWise", "SAP", "Odoo", "Zoho", "Microsoft Dynamics", "Otro CRM", "Ninguno"];
const PSYCH_INSTRUMENTS = ["DISC", "Betesa", "16PF", "Cleaver", "Wartegg", "Terman", "IPV", "Zavic", "MMPI", "Otro", "Ninguno"];
const ATS_TOOLS = ["LinkedIn Recruiter", "Greenhouse", "Lever", "Workday", "BambooHR", "HiBob", "Otro ATS", "Ninguno"];
// Customer Documentation · lo que de verdad pasa por las manos del cargo.
const DOC_TYPES_COMEX = ["B/L o guía aérea", "Factura comercial", "Packing list", "Certificado de origen", "Declaración de importación o exportación", "Órdenes y contratos con soportes", "Anticipos de clientes", "Ninguno de estos"];
const DOC_COMPANY_TYPES = ["Freight forwarder", "Agencia de aduanas", "Naviera o aerolínea", "Importador o exportador", "Otra"];
const DOC_PLATFORMS = ["MUISCA", "VUCE", "Federal Maritime Commission", "CargoWise u otro TMS", "ERP (SAP, Siesa, World Office…)", "Ninguna de estas"];
const DOC_COURSES = ["Gestión documental de comercio internacional", "Procesos aduaneros", "Logística internacional", "INCOTERMS", "Ninguno todavía"];
const DOC_YEARS: ChipOption[] = [
  { value: "0", label: "No he trabajado con documentos de comercio exterior" },
  { value: "-1", label: "Menos de 1 año" },
  { value: "1-2", label: "Entre 1 y 2 años" },
  { value: "2-4", label: "Entre 2 y 4 años" },
  { value: "+4", label: "Más de 4 años" },
];
// Tres niveles y no un sí/no: mucha gente concilia todos los días sin
// llamarlo conciliar, y un sí/no la deja por fuera.
const DOC_RECONCILIATION: ChipOption[] = [
  { value: "central", label: "Sí, era parte central de mi trabajo" },
  { value: "ocasional", label: "Lo he hecho de vez en cuando" },
  { value: "no", label: "No lo he hecho" },
];
const DOC_CASE: ChipOption[] = [
  { value: "radico", label: "Radico con el peso del B/L para no frenar el embarque y aviso después." },
  { value: "pago", label: "Pago lo que dice la factura del agente; él conoce su operación." },
  { value: "soporte", label: "Pido el soporte del peso al agente y aviso de inmediato a mi líder y al cliente que hay una diferencia sin resolver." },
  { value: "espera", label: "Espero a que el agente responda; si no contesta, radico igual." },
];
const ACCOUNTING_SYSTEMS = ["SAP", "Oracle NetSuite", "QuickBooks", "Microsoft Dynamics", "Siigo", "World Office", "Otro", "Ninguno"];
const DOC_TYPES = [
  { label: "Cédula de Ciudadanía", value: "CC" },
  { label: "Cédula de Extranjería", value: "CE" },
  { label: "Pasaporte", value: "PP" },
  { label: "Permiso por Protección Temporal (PPT)", value: "PPT" },
];

export default function PrefiltroForm() {
  const params = useParams();
  const token = params.token as string;
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<CandidateData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Habeas data acceptance
  const [habeasAccepted, setHabeasAccepted] = useState(false);

  // Personal info (sección 1)
  const [docType, setDocType] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  // Form state · comunes
  const [salary, setSalary] = useState("");
  const [availability, setAvailability] = useState("");
  const [relocate, setRelocate] = useState("");
  const [englishLevel, setEnglishLevel] = useState("");
  const [englishCert, setEnglishCert] = useState("");
  const [eduType, setEduType] = useState("");
  // Comex
  const [yearsLogistics, setYearsLogistics] = useState("");
  const [intlClients, setIntlClients] = useState<string>("");
  const [excelLevel, setExcelLevel] = useState("");
  const [crms, setCrms] = useState<string[]>([]);
  const [yearsSales, setYearsSales] = useState("");
  const [pricingExp, setPricingExp] = useState("");
  const [leadership, setLeadership] = useState("");
  const [teamSize, setTeamSize] = useState("");
  // HR Lead
  const [yearsHR, setYearsHR] = useState("");
  const [atsTools, setAtsTools] = useState<string[]>([]);
  const [pipelineFromScratch, setPipelineFromScratch] = useState("");
  const [teamSizeLed, setTeamSizeLed] = useState("");
  const [psychometricsYears, setPsychometricsYears] = useState("");
  const [psychInstruments, setPsychInstruments] = useState<string[]>([]);
  const [beiCertified, setBeiCertified] = useState("");
  const [hrFocus, setHrFocus] = useState("");
  // Finance
  const [yearsFinance, setYearsFinance] = useState("");
  const [accountingSystems, setAccountingSystems] = useState<string[]>([]);
  const [ifrsFamiliar, setIfrsFamiliar] = useState("");
  const [auditExp, setAuditExp] = useState("");
  // Customer Documentation
  const [docYears, setDocYears] = useState("");
  const [docsHandled, setDocsHandled] = useState<string[]>([]);
  const [docCompanies, setDocCompanies] = useState<string[]>([]);
  const [docReconciliation, setDocReconciliation] = useState("");
  const [docStory, setDocStory] = useState("");
  const [docPlatforms, setDocPlatforms] = useState<string[]>([]);
  const [docCourses, setDocCourses] = useState<string[]>([]);
  const [docExcel, setDocExcel] = useState("");
  const [docExcelWhat, setDocExcelWhat] = useState("");
  const [docCase, setDocCase] = useState("");
  const [docCaseWhy, setDocCaseWhy] = useState("");
  // SIG-SST
  const [licenseStatus, setLicenseStatus] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [course50, setCourse50] = useState("");
  const [course20, setCourse20] = useState("");
  const [course20Year, setCourse20Year] = useState("");
  const [postgradSig, setPostgradSig] = useState("");
  const [auditorCerts, setAuditorCerts] = useState<string[]>([]);
  const [sigSystems, setSigSystems] = useState<string[]>([]);
  const [sigSectors, setSigSectors] = useState<string[]>([]);
  const [yearsSig, setYearsSig] = useState("");
  const [yearsLeadingSig, setYearsLeadingSig] = useState("");
  const [certAuditCycles, setCertAuditCycles] = useState("");
  const [excelSig, setExcelSig] = useState("");
  const [sigCase, setSigCase] = useState("");
  // Comunes
  const [whyTs, setWhyTs] = useState("");
  const [nextRole, setNextRole] = useState("");
  const [extra, setExtra] = useState("");

  // ─── China (form en inglés · knock-outs only) ─────────────────────
  const [cnFullName, setCnFullName] = useState("");
  const [cnEmail, setCnEmail] = useState("");
  const [cnPhone, setCnPhone] = useState("");
  const [cnCity, setCnCity] = useState("");
  const [cnWorkAuth, setCnWorkAuth] = useState("");        // "yes" | "no"
  const [cnEnglish, setCnEnglish] = useState("");          // B1/B2/C1/C2
  const [cnEnglishCert, setCnEnglishCert] = useState("");
  const [cnYearsExp, setCnYearsExp] = useState("");
  const [cnOnsite, setCnOnsite] = useState("");            // "yes" | "no"
  const [cnSalaryUsd, setCnSalaryUsd] = useState("");
  const [cnTariff, setCnTariff] = useState("");            // A/B/C
  const [cnTariffWhy, setCnTariffWhy] = useState("");

  // ─── Panama Ops (form EN · freight knock-outs) ────────────────────
  const [paFullName, setPaFullName] = useState("");
  const [paEmail, setPaEmail] = useState("");
  const [paPhone, setPaPhone] = useState("");
  const [paCity, setPaCity] = useState("");
  const [paWorkAuth, setPaWorkAuth] = useState("");        // "yes" | "no"
  const [paOnsite, setPaOnsite] = useState("");            // "yes" | "no"
  const [paYearsFreight, setPaYearsFreight] = useState("");
  const [paOcean, setPaOcean] = useState("");              // "yes" | "no"
  const [paAir, setPaAir] = useState("");
  const [paBlAwb, setPaBlAwb] = useState("");
  const [paWarehouse, setPaWarehouse] = useState("");
  const [paEnglish, setPaEnglish] = useState("");          // A1–C2
  const [paStart30, setPaStart30] = useState("");         // "yes" | "no"
  const [paWhyTs, setPaWhyTs] = useState("");

  // Template seleccionado (default comex si no hay info)
  const templateKey = data?.vacancy?.form_template_key || "comex";
  const isComex = templateKey === "comex";
  const isHR = templateKey === "hr_lead";
  const isFinance = templateKey === "finance";
  const isChina = templateKey === "china";
  const isPanamaOps = templateKey === "panama_ops";
  const isEnForm = isChina || isPanamaOps;
  const isSIG = templateKey === "sig_sst";
  const isDoc = templateKey === "customer_doc";

  // Prefill de nombre/email del candidato (plantillas EN)
  useEffect(() => {
    if (data) {
      if (!cnFullName) setCnFullName(data.candidate.name || "");
      if (!cnEmail) setCnEmail(data.candidate.email || "");
      if (!paFullName) setPaFullName(data.candidate.name || "");
      if (!paEmail) setPaEmail(data.candidate.email || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    fetch(`/api/headhunting/prefilter/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json();
          setErrorMsg(
            j.error === "already_completed"
              ? `Ya enviaste este cuestionario. Si necesitas ayuda, escríbenos a ${CANDIDATE_MAIL}. You already sent this questionnaire. If you need help, write to us at ${CANDIDATE_MAIL}.`
              : invalidLinkBoth()
          );
          setPhase("error");
          return;
        }
        const j = (await r.json()) as CandidateData;
        setData(j);
        setPhase("habeas");
      })
      .catch(() => {
        setErrorMsg(invalidLinkBoth());
        setPhase("error");
      });
  }, [token]);

  function toggleCrm(c: string) {
    setCrms((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }
  function togglePsych(t: string) {
    setPsychInstruments((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function toggleAts(t: string) {
    setAtsTools((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function toggleAcct(s: string) {
    setAccountingSystems((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function toggleAuditorCert(v: string) {
    setAuditorCerts((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }
  function toggleSigSystem(v: string) {
    setSigSystems((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }
  function toggleSigSector(v: string) {
    setSigSectors((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  function isFormValid() {
    // China · validación propia (inglés, knock-outs, PIPL)
    if (isChina) {
      return !!(
        cnFullName.trim().length >= 3 &&
        /\S+@\S+\.\S+/.test(cnEmail.trim()) &&
        cnPhone.trim().length >= 5 &&
        cnCity.trim().length >= 2 &&
        cnWorkAuth &&
        cnEnglish &&
        cnEnglishCert.trim().length >= 3 &&
        cnYearsExp !== "" &&
        cnOnsite &&
        cnSalaryUsd.trim() !== "" &&
        cnTariff &&
        habeasAccepted // en China este check = consentimiento PIPL
      );
    }
    // Panama Ops · EN · freight knock-outs + privacy consent
    if (isPanamaOps) {
      return !!(
        paFullName.trim().length >= 3 &&
        /\S+@\S+\.\S+/.test(paEmail.trim()) &&
        paPhone.trim().length >= 5 &&
        paCity.trim().length >= 2 &&
        paWorkAuth &&
        paOnsite &&
        paYearsFreight !== "" &&
        paOcean &&
        paAir &&
        paBlAwb &&
        paWarehouse &&
        paEnglish &&
        paStart30 &&
        paWhyTs.trim().length >= 10 &&
        habeasAccepted // privacy consent EN
      );
    }
    // Comunes a todos los templates
    const commonOk = !!(
      docType && docNumber.trim().length >= 6 && phone.trim().length >= 7 && city.trim().length >= 3 &&
      salary && availability && relocate && englishLevel && eduType && whyTs.trim().length >= 20
    );
    if (!commonOk) return false;
    if (isSIG) {
      const licenseOk = licenseStatus === "no"
        ? true
        : licenseNumber.trim().length >= 3 && licenseExpiry.trim().length >= 4;
      return !!(
        licenseStatus && licenseOk &&
        course50 && course20 && postgradSig &&
        auditorCerts.length > 0 && sigSystems.length > 0 && sigSectors.length > 0 &&
        yearsSig !== "" && yearsLeadingSig !== "" && certAuditCycles !== "" &&
        excelSig && sigCase.trim().length >= 40
      );
    }
    if (isDoc) {
      return !!(
        docYears && docsHandled.length > 0 && docReconciliation &&
        docStory.trim().length >= 40 && docCase && docCaseWhy.trim().length >= 15
      );
    }
    if (isHR) {
      return !!(yearsHR !== "" && atsTools.length > 0 && pipelineFromScratch && psychometricsYears !== "" && beiCertified);
    }
    if (isFinance) {
      return !!(yearsFinance !== "" && accountingSystems.length > 0 && ifrsFamiliar);
    }
    // Comex
    if (isComex) {
      return !!(
        yearsLogistics !== "" && intlClients && excelLevel &&
        yearsSales !== "" && pricingExp && leadership
      );
    }
    // Tech u otros roles: basta con las preguntas comunes
    return true;
  }

  /** Agrega o quita un valor de una lista de chips multiples. */
  function toggleEnLista(valor: string, lista: string[], set: (v: string[]) => void) {
    set(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
  }

  async function handleSubmit() {
    if (!isFormValid()) {
      alert(isEnForm ? "Please complete all required fields before submitting." : "Por favor completa todos los campos antes de enviar.");
      return;
    }
    setPhase("submitting");

    // ─── China · payload en inglés, keys que espera el backend ───────
    if (isChina) {
      const chinaPayload = {
        template_key: "china",
        full_name: cnFullName.trim(),
        email: cnEmail.trim(),
        phone_wechat: cnPhone.trim(),
        current_city: cnCity.trim(),
        work_authorized: cnWorkAuth === "yes",
        english_level: cnEnglish, // B1/B2/C1/C2
        english_cert: cnEnglishCert.trim(),
        years_experience: parseInt(cnYearsExp) || 0,
        onsite_available: cnOnsite === "yes",
        salary_usd: cnSalaryUsd.trim(), // dato · no descarta
        tariff_choice: cnTariff, // A/B/C
        tariff_reasoning: cnTariffWhy.trim(),
        extra: extra.trim(),
        pipl_consent: true,
        pipl_consent_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      };
      try {
        const res = await fetch(`/api/headhunting/prefilter/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chinaPayload),
        });
        if (!res.ok) {
          const j = await res.json();
          setErrorMsg(j.error_en ? `${j.error} ${j.error_en}` : (j.error || "Submission error."));
          setPhase("error");
          return;
        }
        setPhase("done");
      } catch {
        setErrorMsg("Connection error.");
        setPhase("error");
      }
      return;
    }

    // ─── Panama Ops · payload EN ─────────────────────────────────────
    if (isPanamaOps) {
      const panamaPayload = {
        template_key: "panama_ops",
        full_name: paFullName.trim(),
        email: paEmail.trim(),
        phone: paPhone.trim(),
        current_city: paCity.trim(),
        work_authorized_panama: paWorkAuth === "yes",
        onsite_panama_city: paOnsite === "yes",
        years_freight_panama: parseInt(paYearsFreight) || 0,
        ocean_fcl_lcl: paOcean === "yes",
        air_freight: paAir === "yes",
        bl_awb_docs: paBlAwb === "yes",
        warehouse_ftz: paWarehouse === "yes",
        english_level: paEnglish,
        start_within_30_days: paStart30 === "yes",
        why_ts: paWhyTs.trim(),
        extra: extra.trim(),
        privacy_consent: true,
        privacy_consent_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      };
      try {
        const res = await fetch(`/api/headhunting/prefilter/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(panamaPayload),
        });
        if (!res.ok) {
          const j = await res.json();
          setErrorMsg(j.error_en ? `${j.error} ${j.error_en}` : (j.error || "Submission error."));
          setPhase("error");
          return;
        }
        setPhase("done");
      } catch {
        setErrorMsg("Connection error.");
        setPhase("error");
      }
      return;
    }

    const basePayload = {
      // Personal
      doc_type: docType,
      doc_number: docNumber.trim(),
      phone: phone.trim(),
      city: city.trim(),
      habeas_accepted: true,
      habeas_accepted_at: new Date().toISOString(),
      // Comunes
      salary, availability, relocate,
      english_level: englishLevel, english_cert: englishCert,
      edu_type: eduType,
      why_ts: whyTs.trim(),
      next_role: nextRole.trim(),
      extra: extra.trim(),
      template_key: templateKey,
      submitted_at: new Date().toISOString(),
    };
    let payload: Record<string, unknown> = { ...basePayload };
    if (isSIG) {
      payload = {
        ...payload,
        license_status: licenseStatus,
        license_number: licenseStatus === "si" ? licenseNumber.trim() : "",
        license_expiry: licenseStatus === "si" ? licenseExpiry.trim() : "",
        course_50h: course50 === "si",
        course_20h: course20 === "si",
        course_20h_year: course20 === "si" ? course20Year.trim() : "",
        postgrad_sig: postgradSig === "si",
        auditor_certs: auditorCerts,
        systems_managed: sigSystems,
        sectors: sigSectors,
        years_sig: parseInt(yearsSig) || 0,
        years_leading_sig: parseInt(yearsLeadingSig) || 0,
        cert_audit_cycles: parseInt(certAuditCycles) || 0,
        excel_level: parseInt(excelSig) || 0,
        case_answer: sigCase.trim(),
      };
    } else if (isDoc) {
      payload = {
        ...payload,
        years_doc_comex: docYears,
        docs_handled: docsHandled,
        company_types: docCompanies,
        invoice_reconciliation: docReconciliation,
        difference_story: docStory.trim(),
        platforms_used: docPlatforms,
        doc_courses: docCourses,
        excel_level: parseInt(docExcel) || 0,
        excel_detail: docExcelWhat.trim(),
        case_choice: docCase,
        case_why: docCaseWhy.trim(),
      };
    } else if (isHR) {
      payload = {
        ...payload,
        years_hr: parseInt(yearsHR) || 0,
        ats_tools_used: atsTools,
        pipeline_from_scratch: pipelineFromScratch === "si",
        team_size_led: parseInt(teamSizeLed) || 0,
        psychometrics_years: parseInt(psychometricsYears) || 0,
        psych_instruments: psychInstruments,
        bei_certified: beiCertified,
        hr_focus: hrFocus.trim(),
      };
    } else if (isFinance) {
      payload = {
        ...payload,
        years_finance: parseInt(yearsFinance) || 0,
        accounting_systems: accountingSystems,
        ifrs_familiar: ifrsFamiliar === "si",
        audit_exp: auditExp.trim(),
      };
    } else if (isComex) {
      // Comex
      payload = {
        ...payload,
        years_logistics: parseInt(yearsLogistics) || 0,
        intl_clients: intlClients === "si",
        excel_level: parseInt(excelLevel) || 0,
        crms,
        years_sales: parseInt(yearsSales) || 0,
        pricing_exp: pricingExp === "si",
        leadership: leadership === "si",
        team_size: leadership === "si" ? (parseInt(teamSize) || 0) : 0,
      };
    }
    try {
      const res = await fetch(`/api/headhunting/prefilter/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json();
        setErrorMsg(j.error_en ? `${j.error} ${j.error_en}` : (j.error || "Error al enviar."));
        setPhase("error");
        return;
      }
      setPhase("done");
    } catch {
      setErrorMsg("Error de conexión.");
      setPhase("error");
    }
  }

  if (phase === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F5", fontFamily: TS_FONT }}>
        <p style={{ color: TS_GRAY }}>Cargando…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F5", padding: 24, fontFamily: TS_FONT }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h2 style={{ color: TS_BLACK }}>No pudimos abrir tu cuestionario</h2>
          <p style={{ color: TS_GRAY }}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F7F5", padding: 24, fontFamily: TS_FONT }}>
        <div style={{ maxWidth: 480, textAlign: "center", background: "white", padding: 48, borderRadius: 16, border: `1px solid ${TS_BORDER}` }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "#DCFCE7", margin: "0 auto 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 style={{ color: TS_BLACK, fontSize: 28, fontWeight: 700, margin: "0 0 12px" }}>{isEnForm ? "All set!" : "¡Listo!"}</h1>
          <p style={{ color: TS_GRAY, fontSize: 16, margin: "0 0 8px" }}>{isEnForm ? "We received your answers successfully." : "Recibimos tus respuestas correctamente."}</p>
          <p style={{ color: TS_GRAY, fontSize: 14 }}>{isEnForm ? "We'll be in touch soon with next steps." : "Te contactaremos pronto con los próximos pasos."}</p>
        </div>
      </div>
    );
  }

  // ─── China · PIPL consent phase (English) ─────────────────────────
  if (phase === "habeas" && isChina) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "32px 16px", fontFamily: TS_FONT, color: TS_BLACK }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ marginBottom: 32 }}>
            <p style={{ color: TS_GRAY, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 8 }}>
              🌏 Trading Solutions · Initial questionnaire
            </p>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.2 }}>
              Hi {data?.candidate.name.split(" ")[0]} — let's get to know you 👋
            </h1>
            <p style={{ color: TS_GRAY, fontSize: 16, lineHeight: 1.6 }}>
              Before moving forward with the <strong>{data?.vacancy.title}</strong> process, please complete this short questionnaire. It only covers the essentials and takes about 5 minutes.
            </p>
          </div>

          <div style={{ background: "white", borderRadius: 16, padding: 32, border: `1px solid ${TS_BORDER}`, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "#EBF0FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TS_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                </svg>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Personal information consent (PIPL)</h2>
            </div>
            <p style={{ color: TS_GRAY, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
              In accordance with China's <strong>Personal Information Protection Law (PIPL)</strong>, the information you share in this form will be processed by <strong>Trading Solutions</strong> for the sole purpose of managing the recruitment process for the position you are applying to.
            </p>
            <ul style={{ color: TS_GRAY, fontSize: 14, lineHeight: 1.7, paddingLeft: 20, marginBottom: 16 }}>
              <li>Your data will be stored securely in our candidate database.</li>
              <li>It will not be shared with third parties without your explicit authorization.</li>
              <li>You may access, update, correct or request deletion of your data at any time.</li>
              <li>To exercise your rights, write to <strong>jointheteam@tradingsolutions.com</strong>.</li>
            </ul>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, border: `2px solid ${habeasAccepted ? TS_BLACK : TS_BORDER}`, borderRadius: 12, cursor: "pointer", background: habeasAccepted ? "#EFEFEC" : "white" }}>
              <input
                type="checkbox"
                checked={habeasAccepted}
                onChange={(e) => setHabeasAccepted(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: TS_BLACK, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                I consent to Trading Solutions processing my personal information for the purpose of this recruitment process, in accordance with the PIPL.
              </span>
            </label>
          </div>

          <button
            onClick={() => habeasAccepted && setPhase("form")}
            disabled={!habeasAccepted}
            style={{
              width: "100%", padding: "16px 32px",
              background: habeasAccepted ? TS_BLACK : "#999",
              color: "white", border: "none", borderRadius: 999,
              fontSize: 16, fontWeight: 700,
              cursor: habeasAccepted ? "pointer" : "not-allowed",
            }}
          >
            Continue to the questionnaire →
          </button>
          {!habeasAccepted && (
            <p style={{ color: TS_GRAY, fontSize: 13, textAlign: "center", marginTop: 12 }}>
              Check the consent box to continue.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Panama Ops · EN privacy consent (not PIPL, not CO habeas) ────
  if (phase === "habeas" && isPanamaOps) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "32px 16px", fontFamily: TS_FONT, color: TS_BLACK }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ marginBottom: 32 }}>
            <p style={{ color: TS_GRAY, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 8 }}>
              Trading Solutions · Initial questionnaire
            </p>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.2 }}>
              Hi {data?.candidate.name.split(" ")[0]} — let&apos;s get to know you
            </h1>
            <p style={{ color: TS_GRAY, fontSize: 16, lineHeight: 1.6 }}>
              Before moving forward with the <strong>{data?.vacancy.title}</strong> process, please complete this short questionnaire. It covers freight operations essentials for Panama and takes about 5–7 minutes.
            </p>
          </div>

          <div style={{ background: "white", borderRadius: 16, padding: 32, border: `1px solid ${TS_BORDER}`, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "#EBF0FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TS_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                </svg>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Privacy notice</h2>
            </div>
            <p style={{ color: TS_GRAY, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
              The information you share in this form will be processed by <strong>Trading Solutions</strong> for the sole purpose of managing the recruitment process for the Panama Operations position you are applying to.
            </p>
            <ul style={{ color: TS_GRAY, fontSize: 14, lineHeight: 1.7, paddingLeft: 20, marginBottom: 16 }}>
              <li>Your data will be stored securely in our candidate database.</li>
              <li>It will not be shared with third parties without your authorization.</li>
              <li>You may access, update, correct or request deletion of your data at any time.</li>
              <li>To exercise your rights, write to <strong>jointheteam@tradingsolutions.com</strong>.</li>
            </ul>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, border: `2px solid ${habeasAccepted ? TS_BLACK : TS_BORDER}`, borderRadius: 12, cursor: "pointer", background: habeasAccepted ? "#EFEFEC" : "white" }}>
              <input
                type="checkbox"
                checked={habeasAccepted}
                onChange={(e) => setHabeasAccepted(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: TS_BLACK, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                I consent to Trading Solutions processing my personal information for the purpose of this recruitment process.
              </span>
            </label>
          </div>

          <button
            onClick={() => habeasAccepted && setPhase("form")}
            disabled={!habeasAccepted}
            style={{
              width: "100%", padding: "16px 32px",
              background: habeasAccepted ? TS_BLACK : "#999",
              color: "white", border: "none", borderRadius: 999,
              fontSize: 16, fontWeight: 700,
              cursor: habeasAccepted ? "pointer" : "not-allowed",
            }}
          >
            Continue to the questionnaire →
          </button>
          {!habeasAccepted && (
            <p style={{ color: TS_GRAY, fontSize: 13, textAlign: "center", marginTop: 12 }}>
              Check the consent box to continue.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Habeas Data phase ────────────────────────────────────────────
  if (phase === "habeas") {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "32px 16px", fontFamily: TS_FONT, color: TS_BLACK }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* Hero cálido */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ color: TS_GRAY, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 8 }}>
              🌎 Trading Solutions · Cuestionario inicial
            </p>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.2 }}>
              Hola, {data?.candidate.name.split(" ")[0]} — queremos conocerte mejor 👋
            </h1>
            <p style={{ color: TS_GRAY, fontSize: 16, lineHeight: 1.6 }}>
              Antes de avanzar al proceso de evaluación para <strong>{data?.vacancy.title}</strong>, te pedimos completar este cuestionario corto. Toma 7-10 minutos. No hay respuestas correctas o incorrectas — solo queremos entender tu perfil y lo que buscas.
            </p>
          </div>

          {/* Habeas Data card */}
          <div style={{ background: "white", borderRadius: 16, padding: 32, border: `1px solid ${TS_BORDER}`, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "#EBF0FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TS_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                </svg>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Autorización tratamiento de datos</h2>
            </div>
            <p style={{ color: TS_GRAY, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
              En cumplimiento de la <strong>Ley 1581 de 2012</strong> (Habeas Data) y demás normativa colombiana de protección de datos personales, te informamos que la información que compartas en este formulario será tratada por <strong>Trading Solutions Company S.A.S.</strong> con la finalidad exclusiva de adelantar el proceso de selección al que estás aplicando.
            </p>
            <ul style={{ color: TS_GRAY, fontSize: 14, lineHeight: 1.7, paddingLeft: 20, marginBottom: 16 }}>
              <li>Tus datos serán almacenados de forma segura en nuestra base de candidatos.</li>
              <li>No serán compartidos con terceros sin tu autorización expresa.</li>
              <li>Tienes derecho a conocer, actualizar, rectificar y solicitar la supresión de tus datos en cualquier momento.</li>
              <li>Para ejercer tus derechos puedes escribirnos a <strong>jointheteam@tradingsolutions.com</strong>.</li>
            </ul>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 16, border: `2px solid ${habeasAccepted ? TS_BLACK : TS_BORDER}`, borderRadius: 12, cursor: "pointer", background: habeasAccepted ? "#EFEFEC" : "white" }}>
              <input
                type="checkbox"
                checked={habeasAccepted}
                onChange={(e) => setHabeasAccepted(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: TS_BLACK, cursor: "pointer" }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Acepto que Trading Solutions trate mis datos personales con la finalidad de adelantar el proceso de selección, conforme a su política de privacidad y la Ley 1581 de 2012.
              </span>
            </label>
          </div>

          <button
            onClick={() => habeasAccepted && setPhase("form")}
            disabled={!habeasAccepted}
            style={{
              width: "100%", padding: "16px 32px",
              background: habeasAccepted ? TS_BLACK : "#999",
              color: "white", border: "none", borderRadius: 999,
              fontSize: 16, fontWeight: 700,
              cursor: habeasAccepted ? "pointer" : "not-allowed",
            }}
          >
            Continuar al cuestionario →
          </button>
          {!habeasAccepted && (
            <p style={{ color: TS_GRAY, fontSize: 13, textAlign: "center", marginTop: 12 }}>
              Marca la casilla de autorización para continuar.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── China · Form phase (English, essentials only) ────────────────
  if (isChina) {
    const YESNO_EN = [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }];
    return (
      <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "32px 16px", fontFamily: TS_FONT, color: TS_BLACK }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ marginBottom: 32 }}>
            <p style={{ color: TS_GRAY, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 8 }}>
              🌏 Trading Solutions · {data?.vacancy.title}
            </p>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 12px" }}>Tell us about yourself, {data?.candidate.name.split(" ")[0]}</h1>
            <p style={{ color: TS_GRAY, fontSize: 15, lineHeight: 1.6 }}>
              Just the essentials. Please answer honestly — there are no right or wrong answers.
            </p>
          </div>

          <Section title="1 · Your details">
            <Q label="Full name">
              <input value={cnFullName} onChange={(e) => setCnFullName(e.target.value)} style={inputStyle} placeholder="Your full name" />
            </Q>
            <Q label="Email">
              <input value={cnEmail} onChange={(e) => setCnEmail(e.target.value)} style={inputStyle} placeholder="you@email.com" inputMode="email" />
            </Q>
            <Q label="Phone / WeChat">
              <input value={cnPhone} onChange={(e) => setCnPhone(e.target.value)} style={inputStyle} placeholder="Phone number or WeChat ID" />
            </Q>
            <Q label="Current city (China)">
              <input value={cnCity} onChange={(e) => setCnCity(e.target.value)} style={inputStyle} placeholder="e.g. Shanghai, Shenzhen, Guangzhou" />
            </Q>
          </Section>

          <Section title="2 · Eligibility">
            <Q label="Are you legally authorized to work in China?">
              <SelectChips value={cnWorkAuth} onChange={setCnWorkAuth} options={YESNO_EN} />
            </Q>
            <Q label="On-site availability in Shanghai / Shenzhen / Guangzhou?">
              <SelectChips value={cnOnsite} onChange={setCnOnsite} options={YESNO_EN} />
            </Q>
          </Section>

          <Section title="3 · English">
            <Q label="English level">
              <SelectChips value={cnEnglish} onChange={setCnEnglish} options={CN_ENGLISH} />
              <p style={hintStyle}>
                This role needs <strong>B2 or above</strong>. If you are unsure, pick the level that matches
                your test score or your day-to-day work, and tell us the details below — we read it.
              </p>
            </Q>
            <Q label="How do you certify it? (e.g. IELTS / TOEFL / CET score, years working in English, studies abroad)">
              <textarea value={cnEnglishCert} onChange={(e) => setCnEnglishCert(e.target.value.slice(0, 300))} rows={2} style={inputStyle} />
            </Q>
          </Section>

          <Section title="4 · Experience">
            <Q label="Years of relevant experience in freight forwarding / the role area">
              <input type="number" min={0} max={50} value={cnYearsExp} onChange={(e) => setCnYearsExp(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="Monthly salary expectation in USD (gross)">
              <input value={cnSalaryUsd} onChange={(e) => setCnSalaryUsd(e.target.value)} style={inputStyle} placeholder="e.g. 2000" inputMode="numeric" />
            </Q>
          </Section>

          <Section title="5 · Tariff analysis">
            <Q label="A client wants a competitive but reliable option. Which do you choose and why? — A: Freight 1200 + Local 300 (25 days) · B: Freight 1350 + Local 250 (20 days) · C: Freight 1100 + Local 400 (30 days)">
              <SelectChips value={cnTariff} onChange={setCnTariff} options={["A", "B", "C"]} />
            </Q>
            <Q label="Briefly, why? (optional)">
              <textarea value={cnTariffWhy} onChange={(e) => setCnTariffWhy(e.target.value.slice(0, 500))} rows={3} style={inputStyle} placeholder="Your reasoning…" />
            </Q>
          </Section>

          <Section title="6 · Anything else">
            <Q label="Anything else we should know? (optional)">
              <textarea value={extra} onChange={(e) => setExtra(e.target.value.slice(0, 500))} rows={3} style={inputStyle} />
            </Q>
          </Section>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${TS_BORDER}` }}>
            <button
              onClick={handleSubmit}
              disabled={(phase as Phase) === "submitting" || !isFormValid()}
              className={isFormValid() ? "prefiltro-submit" : "prefiltro-submit is-idle"}
            >
              {(phase as Phase) === "submitting" ? "Submitting…" : "Submit answers"}
            </button>
            {!isFormValid() && (
              <p style={{ color: TS_GRAY, fontSize: 13, textAlign: "center", marginTop: 12 }}>
                Please complete all required questions before submitting.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Panama Ops · Form phase (EN · freight knock-outs) ────────────
  if (isPanamaOps) {
    const YESNO_EN = [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }];
    return (
      <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "32px 16px", fontFamily: TS_FONT, color: TS_BLACK }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ marginBottom: 32 }}>
            <p style={{ color: TS_GRAY, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 8 }}>
              Trading Solutions · {data?.vacancy.title}
            </p>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 12px" }}>Tell us about yourself, {data?.candidate.name.split(" ")[0]}</h1>
            <p style={{ color: TS_GRAY, fontSize: 15, lineHeight: 1.6 }}>
              Freight operations in Panama — please answer honestly. There are no right or wrong answers.
            </p>
          </div>

          <Section title="1 · Your details">
            <Q label="Full name">
              <input value={paFullName} onChange={(e) => setPaFullName(e.target.value)} style={inputStyle} placeholder="Your full name" />
            </Q>
            <Q label="Email">
              <input value={paEmail} onChange={(e) => setPaEmail(e.target.value)} style={inputStyle} placeholder="you@email.com" inputMode="email" />
            </Q>
            <Q label="Phone">
              <input value={paPhone} onChange={(e) => setPaPhone(e.target.value)} style={inputStyle} placeholder="+507 …" inputMode="tel" />
            </Q>
            <Q label="Current city">
              <input value={paCity} onChange={(e) => setPaCity(e.target.value)} style={inputStyle} placeholder="e.g. Panama City, Colón" />
            </Q>
          </Section>

          <Section title="2 · Eligibility">
            <Q label="Are you legally authorized to work in Panama?">
              <SelectChips value={paWorkAuth} onChange={setPaWorkAuth} options={YESNO_EN} />
            </Q>
            <Q label="Can you work on-site in Panama City?">
              <SelectChips value={paOnsite} onChange={setPaOnsite} options={YESNO_EN} />
            </Q>
          </Section>

          <Section title="3 · Freight experience">
            <Q label="Years of experience in freight forwarding / logistics in Panama (or equivalent)">
              <input type="number" min={0} max={50} value={paYearsFreight} onChange={(e) => setPaYearsFreight(e.target.value)} style={inputStyle} placeholder="0" />
              <p style={hintStyle}>We look for <strong>4+ years</strong>. Fewer years are flagged for a recruiter to review. They are not a knock-out.</p>
            </Q>
            <Q label="Hands-on experience with ocean freight (FCL / LCL)?">
              <SelectChips value={paOcean} onChange={setPaOcean} options={YESNO_EN} />
            </Q>
            <Q label="Hands-on experience with air freight?">
              <SelectChips value={paAir} onChange={setPaAir} options={YESNO_EN} />
            </Q>
            <Q label="Experience preparing / handling B/L and AWB documents?">
              <SelectChips value={paBlAwb} onChange={setPaBlAwb} options={YESNO_EN} />
            </Q>
            <Q label="Experience with warehouse / free trade zone (FTZ) operations?">
              <SelectChips value={paWarehouse} onChange={setPaWarehouse} options={YESNO_EN} />
            </Q>
          </Section>

          <Section title="4 · English and start date">
            <Q label="English level">
              <SelectChips value={paEnglish} onChange={setPaEnglish} options={PA_ENGLISH} />
              <p style={hintStyle}><strong>B1 is required.</strong> A1 or A2 does not move forward.</p>
            </Q>
            <Q label="Can you start within 30 days?">
              <SelectChips value={paStart30} onChange={setPaStart30} options={YESNO_EN} />
              <p style={hintStyle}>A later start is flagged for review. It is not a knock-out.</p>
            </Q>
          </Section>

          <Section title="5 · About you">
            <Q label="Why Trading Solutions / why this Operations role?">
              <textarea value={paWhyTs} onChange={(e) => setPaWhyTs(e.target.value.slice(0, 800))} rows={3} style={inputStyle} placeholder="A few sentences…" />
            </Q>
            <Q label="Anything else we should know? (optional)">
              <textarea value={extra} onChange={(e) => setExtra(e.target.value.slice(0, 500))} rows={3} style={inputStyle} />
            </Q>
          </Section>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${TS_BORDER}` }}>
            <button
              onClick={handleSubmit}
              disabled={(phase as Phase) === "submitting" || !isFormValid()}
              className={isFormValid() ? "prefiltro-submit" : "prefiltro-submit is-idle"}
            >
              {(phase as Phase) === "submitting" ? "Submitting…" : "Submit answers"}
            </button>
            {!isFormValid() && (
              <p style={{ color: TS_GRAY, fontSize: 13, textAlign: "center", marginTop: 12 }}>
                Please complete all required questions before submitting.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Form phase ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "32px 16px", fontFamily: TS_FONT, color: TS_BLACK }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <p style={{ color: TS_GRAY, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 8 }}>
            🌎 Trading Solutions · {data?.vacancy.title}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 12px" }}>Cuéntanos sobre ti, {data?.candidate.name.split(" ")[0]}</h1>
          <p style={{ color: TS_GRAY, fontSize: 15, lineHeight: 1.6 }}>
            Responde con tranquilidad y honestidad. No hay respuestas correctas o incorrectas.
          </p>
        </div>

        <Section title="1 · Información personal">
          <Q label="Tipo de documento">
            <SelectChips value={docType} onChange={setDocType} options={DOC_TYPES} />
          </Q>
          <Q label="Número de documento">
            <input value={docNumber} onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ""))} style={inputStyle} placeholder="Solo números" inputMode="numeric" />
          </Q>
          <Q label="Celular">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+57 300 123 4567" inputMode="tel" />
          </Q>
          <Q label="Ciudad de residencia">
            <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} placeholder="Ej. Barranquilla, Bogotá, Medellín…" />
          </Q>
        </Section>

        <Section title="2 · Disponibilidad y modalidad">
          <Q label="Expectativa salarial mensual (COP)">
            <SelectChips value={salary} onChange={setSalary} options={SALARY_RANGES} />
          </Q>
          <Q label="Disponibilidad para iniciar">
            <SelectChips value={availability} onChange={setAvailability} options={AVAILABILITY} />
          </Q>
          <Q label="¿Vives en Barranquilla o estás dispuesto(a) a mudarte? (la posición es presencial)">
            <SelectChips value={relocate} onChange={setRelocate} options={RELOCATE} />
          </Q>
        </Section>

        <Section title="3 · Idioma">
          <Q label="Nivel de inglés autoreportado">
            <SelectChips value={englishLevel} onChange={setEnglishLevel} options={ENGLISH} />
          </Q>
          <Q label="¿Cómo lo certificas? (opcional — ej. certificación, años trabajando en inglés, intercambio…)">
            <textarea value={englishCert} onChange={(e) => setEnglishCert(e.target.value)} rows={2} style={inputStyle} />
          </Q>
        </Section>

        {/* Sección 4 · Formación · varía según template */}
        <Section title="4 · Formación">
          <Q label="Tu formación principal">
            <SelectChips
              value={eduType}
              onChange={setEduType}
              options={isSIG ? EDU_SIG : isHR ? EDU_HR : isFinance ? EDU_FINANCE : EDU_COMEX}
            />
          </Q>
        </Section>

        {/* Sección 5 · Experiencia específica por template */}
        {isSIG ? (
          <Section title="5 · Credenciales y experiencia en sistemas de gestión">
            <Q label="¿Tienes licencia vigente en Seguridad y Salud en el Trabajo?">
              <SelectChips
                value={licenseStatus}
                onChange={setLicenseStatus}
                options={[
                  { label: "Sí, vigente", value: "si" },
                  { label: "La tengo pero está vencida", value: "vencida" },
                  { label: "En trámite", value: "tramite" },
                  { label: "No la tengo", value: "no" },
                ]}
              />
            </Q>
            {(licenseStatus === "si" || licenseStatus === "vencida") && (
              <>
                <Q label="Número de licencia y entidad que la expidió">
                  <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} style={inputStyle} placeholder="Ej. 12345 · Secretaría de Salud del Atlántico" />
                </Q>
                <Q label="Fecha de vencimiento de la licencia">
                  <input value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} style={inputStyle} placeholder="Ej. 14/03/2032" />
                </Q>
              </>
            )}
            <Q label="¿Tienes el curso de 50 horas del SG-SST?">
              <SelectChips value={course50} onChange={setCourse50} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
            </Q>
            <Q label="¿Tienes vigente el curso de actualización de 20 horas?">
              <SelectChips value={course20} onChange={setCourse20} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
            </Q>
            {course20 === "si" && (
              <Q label="¿En qué año lo hiciste?">
                <input value={course20Year} onChange={(e) => setCourse20Year(e.target.value)} style={inputStyle} placeholder="Ej. 2025" />
              </Q>
            )}
            <Q label="¿Tienes posgrado en SST, HSEQ o Sistemas Integrados de Gestión?">
              <SelectChips value={postgradSig} onChange={setPostgradSig} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
            </Q>
            <Q label="¿En qué normas estás certificado como auditor? (selecciona todas las que apliquen)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {AUDITOR_CERTS.map((c) => (
                  <button key={c} type="button" onClick={() => toggleAuditorCert(c)} style={chipStyle(auditorCerts.includes(c))}>{c}</button>
                ))}
              </div>
            </Q>
            <Q label="¿Qué sistemas has manejado directamente? (selecciona todos los que apliquen)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SIG_SYSTEMS.map((c) => (
                  <button key={c} type="button" onClick={() => toggleSigSystem(c)} style={chipStyle(sigSystems.includes(c))}>{c}</button>
                ))}
              </div>
            </Q>
            <Q label="Años totales de experiencia en sistemas de gestión y SST">
              <input type="number" min={0} max={50} value={yearsSig} onChange={(e) => setYearsSig(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="De esos, ¿cuántos años has sido tú el responsable del sistema? (no de apoyo)">
              <input type="number" min={0} max={50} value={yearsLeadingSig} onChange={(e) => setYearsLeadingSig(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="¿En cuántos ciclos de auditoría de certificación o recertificación externa has participado de forma directa?">
              <input type="number" min={0} max={50} value={certAuditCycles} onChange={(e) => setCertAuditCycles(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="¿En qué sectores has trabajado? (selecciona todos los que apliquen)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SIG_SECTORS.map((c) => (
                  <button key={c} type="button" onClick={() => toggleSigSector(c)} style={chipStyle(sigSectors.includes(c))}>{c}</button>
                ))}
              </div>
            </Q>
            <Q label="Tu nivel de Excel (1 = básico, 5 = experto con tablas dinámicas, fórmulas anidadas y validación de datos)">
              <SelectChips value={excelSig} onChange={setExcelSig} options={["1","2","3","4","5"]} />
            </Q>
            <Q label={`Caso corto: tienes una auditoría externa en seis semanas y encuentras que la evaluación de eficacia de varias capacitaciones del año pasado quedó sin registrar. ¿Qué haces? (mín. 40 caracteres) — ${sigCase.length}/700`}>
              <textarea value={sigCase} onChange={(e) => setSigCase(e.target.value.slice(0, 700))} rows={5} style={inputStyle} placeholder="Cuéntanos qué priorizas, qué corriges y qué no se puede corregir hacia atrás…" />
            </Q>
          </Section>
        ) : isHR ? (
          <Section title="5 · Experiencia en HR · Talent Acquisition">
            <Q label="Años de experiencia en HR / Talent Acquisition / Learning & Development">
              <input type="number" min={0} max={50} value={yearsHR} onChange={(e) => setYearsHR(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="¿Qué herramientas de ATS / sourcing has usado? (selecciona todas las que apliquen)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ATS_TOOLS.map((t) => (
                  <button key={t} type="button" onClick={() => toggleAts(t)} style={chipStyle(atsTools.includes(t))}>{t}</button>
                ))}
              </div>
            </Q>
            <Q label="¿Has construido pipelines de reclutamiento desde cero o liderado búsquedas estratégicas?">
              <SelectChips value={pipelineFromScratch} onChange={setPipelineFromScratch} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
            </Q>
            <Q label="¿Cuántas personas has liderado directamente? (escribe 0 si nunca)">
              <input type="number" min={0} max={500} value={teamSizeLed} onChange={(e) => setTeamSizeLed(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="Años aplicando e interpretando pruebas psicométricas y elaborando informes">
              <input type="number" min={0} max={50} value={psychometricsYears} onChange={(e) => setPsychometricsYears(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="¿Qué instrumentos psicométricos has aplicado? (selecciona todos los que apliquen)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PSYCH_INSTRUMENTS.map((t) => (
                  <button key={t} type="button" onClick={() => togglePsych(t)} style={chipStyle(psychInstruments.includes(t))}>{t}</button>
                ))}
              </div>
            </Q>
            <Q label="¿Tienes formación o certificación en entrevista por competencias (BEI / STAR)?">
              <SelectChips value={beiCertified} onChange={setBeiCertified} options={[{label:"Sí, certificación formal",value:"certificacion"},{label:"Sí, formación interna o curso",value:"formacion"},{label:"No",value:"no"}]} />
            </Q>
            <Q label="¿Cuál es tu foco preferido: atracción · desarrollo · cultura · todos? (opcional)">
              <input value={hrFocus} onChange={(e) => setHrFocus(e.target.value)} style={inputStyle} placeholder="Ej. atracción senior + desarrollo de líderes" />
            </Q>
          </Section>
        ) : isFinance ? (
          <Section title="5 · Experiencia en finanzas · contabilidad">
            <Q label="Años de experiencia en finanzas / contabilidad / FP&A">
              <input type="number" min={0} max={50} value={yearsFinance} onChange={(e) => setYearsFinance(e.target.value)} style={inputStyle} placeholder="0" />
            </Q>
            <Q label="¿Qué sistemas contables has usado? (selecciona todos los que apliquen)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ACCOUNTING_SYSTEMS.map((s) => (
                  <button key={s} type="button" onClick={() => toggleAcct(s)} style={chipStyle(accountingSystems.includes(s))}>{s}</button>
                ))}
              </div>
            </Q>
            <Q label="¿Tienes familiaridad con NIIF / IFRS y cierres mensuales?">
              <SelectChips value={ifrsFamiliar} onChange={setIfrsFamiliar} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
            </Q>
            <Q label="¿Has manejado auditorías externas? (opcional, breve)">
              <textarea value={auditExp} onChange={(e) => setAuditExp(e.target.value.slice(0, 300))} rows={2} style={inputStyle} placeholder="Ej. 3 ciclos con KPMG en cliente multinacional" />
            </Q>
          </Section>
        ) : isDoc ? (
          <>
            <Section title="5 · Tu experiencia documental">
              <Q label="¿Cuántos años llevas manejando documentos de comercio exterior?">
                <SelectChips value={docYears} onChange={setDocYears} options={DOC_YEARS} />
              </Q>
              <Q label="¿Cuáles de estos documentos has trabajado directamente? Marca solo los que hayas revisado, emitido o corregido tú.">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DOC_TYPES_COMEX.map((d) => (
                    <button key={d} type="button" onClick={() => toggleEnLista(d, docsHandled, setDocsHandled)} style={chipStyle(docsHandled.includes(d))}>{d}</button>
                  ))}
                </div>
              </Q>
              <Q label="¿En qué tipo de empresa fue?">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DOC_COMPANY_TYPES.map((c) => (
                    <button key={c} type="button" onClick={() => toggleEnLista(c, docCompanies, setDocCompanies)} style={chipStyle(docCompanies.includes(c))}>{c}</button>
                  ))}
                </div>
              </Q>
              <Q label="¿Has verificado facturas contra contratos u órdenes y encontrado diferencias?">
                <SelectChips value={docReconciliation} onChange={setDocReconciliation} options={DOC_RECONCILIATION} />
              </Q>
              <Q label={`Cuéntanos de una diferencia o un cobro indebido que hayas detectado: cómo te diste cuenta, qué hiciste y en qué terminó. Si nunca te ha pasado, dilo con franqueza y cuéntanos el error más costoso que hayas encontrado en un documento. (mín. 40 caracteres) — ${docStory.length}/700`}>
                <textarea value={docStory} onChange={(e) => setDocStory(e.target.value.slice(0, 700))} rows={5} style={inputStyle} placeholder="Cinco o seis líneas bastan" />
              </Q>
              <Q label="Plataformas y sistemas que has usado">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DOC_PLATFORMS.map((pl) => (
                    <button key={pl} type="button" onClick={() => toggleEnLista(pl, docPlatforms, setDocPlatforms)} style={chipStyle(docPlatforms.includes(pl))}>{pl}</button>
                  ))}
                </div>
              </Q>
              <Q label="¿Has hecho alguno de estos cursos o diplomados?">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {DOC_COURSES.map((c) => (
                    <button key={c} type="button" onClick={() => toggleEnLista(c, docCourses, setDocCourses)} style={chipStyle(docCourses.includes(c))}>{c}</button>
                  ))}
                </div>
              </Q>
              <Q label="Tu nivel de Excel (1 = básico, 5 = experto con tablas dinámicas y fórmulas anidadas)">
                <SelectChips value={docExcel} onChange={setDocExcel} options={["1","2","3","4","5"]} />
              </Q>
              <Q label="¿Qué haces en Excel en un día normal? (opcional)">
                <input value={docExcelWhat} onChange={(e) => setDocExcelWhat(e.target.value.slice(0, 200))} style={inputStyle} placeholder="Tablas dinámicas, BUSCARV, conciliaciones…" />
              </Q>
            </Section>

            <Section title="6 · Un caso corto">
              <div style={{ background: "#f4f3f0", padding: "14px 16px", fontSize: 14, lineHeight: 1.55, marginBottom: 4 }}>
                <b style={{ display: "block", marginBottom: 4 }}>La situación</b>
                Estás por radicar una orden. La factura del agente dice <b>2.540 kg</b>, el B/L dice <b>2.450 kg</b> y la orden del cliente autoriza <b>2.450 kg</b>. El agente insiste en que su factura está bien y el embarque sale hoy a las 5:00 p. m.
              </div>
              <Q label="¿Qué haces primero?">
                <SelectChips value={docCase} onChange={setDocCase} options={DOC_CASE} />
              </Q>
              <Q label={`¿Por qué? (mín. 15 caracteres) — ${docCaseWhy.length}/400`}>
                <textarea value={docCaseWhy} onChange={(e) => setDocCaseWhy(e.target.value.slice(0, 400))} rows={3} style={inputStyle} placeholder="Dos o tres líneas" />
              </Q>
            </Section>
          </>
        ) : isComex ? (
          <>
            <Section title="5 · Experiencia en comex · operaciones">
              <Q label="Años de experiencia en logística o comercio exterior">
                <input type="number" min={0} max={50} value={yearsLogistics} onChange={(e) => setYearsLogistics(e.target.value)} style={inputStyle} placeholder="0" />
              </Q>
              <Q label="¿Has manejado clientes internacionales (USA, Europa, Asia)?">
                <SelectChips value={intlClients} onChange={setIntlClients} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
              </Q>
              <Q label="Tu nivel de Excel (1 = básico, 5 = experto con macros/PowerQuery)">
                <SelectChips value={excelLevel} onChange={setExcelLevel} options={["1","2","3","4","5"]} />
              </Q>
              <Q label="¿Cuáles CRMs / plataformas has usado? (selecciona todos los que apliquen)">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CRMS.map((c) => (
                    <button key={c} type="button" onClick={() => toggleCrm(c)} style={chipStyle(crms.includes(c))}>{c}</button>
                  ))}
                </div>
              </Q>
            </Section>

            <Section title="6 · Ventas, pricing, liderazgo">
              <Q label="Años de experiencia en ventas / B2B / atención comercial">
                <input type="number" min={0} max={50} value={yearsSales} onChange={(e) => setYearsSales(e.target.value)} style={inputStyle} placeholder="0" />
              </Q>
              <Q label="¿Has trabajado en pricing, cotización, análisis tarifario o procurement?">
                <SelectChips value={pricingExp} onChange={setPricingExp} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
              </Q>
              <Q label="¿Has liderado equipos directamente?">
                <SelectChips value={leadership} onChange={setLeadership} options={[{label:"Sí",value:"si"},{label:"No",value:"no"}]} />
              </Q>
              {leadership === "si" && (
                <Q label="¿Cuántas personas tenías a cargo?">
                  <input type="number" min={1} max={500} value={teamSize} onChange={(e) => setTeamSize(e.target.value)} style={inputStyle} placeholder="0" />
                </Q>
              )}
            </Section>
          </>
        ) : null}

        <Section title={`${isComex || isDoc ? "7" : (isHR || isFinance) ? "6" : "5"} · Sobre ti`}>
          <Q label={`¿Por qué Trading Solutions específicamente? (mín. 20 caracteres) — ${whyTs.length}/500`}>
            <textarea value={whyTs} onChange={(e) => setWhyTs(e.target.value.slice(0, 500))} rows={4} style={inputStyle} placeholder="Cuéntanos qué te llamó la atención de la empresa, no de la vacante…" />
          </Q>
          <Q label="¿Qué buscas en tu próximo rol? (opcional)">
            <textarea value={nextRole} onChange={(e) => setNextRole(e.target.value.slice(0, 500))} rows={3} style={inputStyle} />
          </Q>
          <Q label="¿Algo más que quieras que sepamos? (opcional)">
            <textarea value={extra} onChange={(e) => setExtra(e.target.value.slice(0, 500))} rows={3} style={inputStyle} />
          </Q>
        </Section>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${TS_BORDER}` }}>
          <button
            onClick={handleSubmit}
            disabled={(phase as Phase) === "submitting" || !isFormValid()}
            className={isFormValid() ? "prefiltro-submit" : "prefiltro-submit is-idle"}
          >
            {(phase as Phase) === "submitting" ? "Enviando…" : "Enviar respuestas"}
          </button>
          {!isFormValid() && (
            <p style={{ color: TS_GRAY, fontSize: 13, textAlign: "center", marginTop: 12 }}>
              Por favor completa todas las preguntas obligatorias antes de enviar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32, padding: 24, background: "white", borderRadius: 12, border: `1px solid ${TS_BORDER}` }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: TS_BLUE, textTransform: "uppercase", letterSpacing: 1, marginTop: 0, marginBottom: 16 }}>{title}</h2>
      {children}
    </div>
  );
}

function Q({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

type ChipOption = string | { label: string; value: string };

function SelectChips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: ChipOption[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const l = typeof opt === "string" ? opt : opt.label;
        return (
          <button key={v} type="button" onClick={() => onChange(v)} style={chipStyle(value === v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

const hintStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "#6B7280",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: `1px solid ${TS_BORDER}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
  resize: "vertical",
  outline: "none",
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    border: `1.5px solid ${active ? TS_BLACK : TS_BORDER}`,
    background: active ? TS_BLACK : "white",
    color: active ? "white" : TS_BLACK,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "inherit",
  };
}
