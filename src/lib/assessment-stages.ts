/**
 * Stages de evaluación contra los 16 mandatos del CEO.
 * Cada candidato puede tener una evaluación por stage.
 */

export type AssessmentStage = "recruiter_interview" | "cwo_interview" | "hiring_manager_interview";

export type AssessmentStageInfo = {
  stage: AssessmentStage;
  label: string;
  shortLabel: string;
  interviewerLabel: string;
  storytellingPersona: string;
  // Stages del candidato donde el card debe aparecer (el card "siguiente" se habilita cuando llega ahí)
  visibleFromStage: string[];
};

export const ASSESSMENT_STAGES: Record<AssessmentStage, AssessmentStageInfo> = {
  recruiter_interview: {
    stage: "recruiter_interview",
    label: "Recruiter Assessment · 16 Mandatos del CEO",
    shortLabel: "Recruiter",
    interviewerLabel: "Talent Acquisition Team",
    storytellingPersona: "como recruiter",
    visibleFromStage: ["recruiter_interview", "cwo_interview", "touring", "terna", "oferta", "contratado", "rechazado"],
  },
  cwo_interview: {
    stage: "cwo_interview",
    label: "CWO Assessment · 16 Mandatos del CEO",
    shortLabel: "CWO",
    interviewerLabel: "Yohanna Franco · CWO",
    storytellingPersona: "como CWO",
    visibleFromStage: ["cwo_interview", "touring", "terna", "oferta", "contratado", "rechazado"],
  },
  hiring_manager_interview: {
    stage: "hiring_manager_interview",
    label: "Hiring Manager Assessment",
    shortLabel: "Hiring Manager",
    interviewerLabel: "Hiring Manager",
    storytellingPersona: "como hiring manager",
    visibleFromStage: ["touring", "terna", "oferta", "contratado", "rechazado"],
  },
};

export function getStageInfo(stage: AssessmentStage): AssessmentStageInfo {
  return ASSESSMENT_STAGES[stage];
}
