'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { TS_SCENARIOS } from '@/lib/headhunting/scenarios-ts';
import { TS_BENCHMARK_STATS, TS_DNA_PATTERNS } from '@/lib/headhunting/calibration-data';

type Phase = 'loading' | 'welcome' | 'habeas_data' | 'camera_setup' | 'assessment' | 'review' | 'complete' | 'error' | 'expired';

interface Scenario {
  id: string;
  block: 'cognitivo' | 'comportamental' | 'caracter' | 'bienestar_trayectoria';
  type: 'role_play' | 'numerical' | 'english' | 'likert' | 'checklist' | 'creative' | 'role_play_mc';
  scenario_text: string;
  instructions?: string;
  options?: string[];
  statements?: string[];
  target_columns?: string[];
  time_limit_seconds?: number;
  competency_label?: string;
  order_index?: number;
}

interface AssessmentData {
  token: string;
  candidate_name: string;
  vacancy_title: string;
  client_name: string;
  client_logo?: string;
  scenarios: Scenario[];
  started_at?: number;
}

interface SavedResponse {
  text: string;
  data: Record<string, any>;
  time: number;
  final: boolean;
}

interface TabSwitchEvent {
  timestamp: number;
  type: 'hidden' | 'visible';
}

const BLOCK_INFO = {
  cognitivo: {
    label: 'Resolución',
    color: 'bg-violet-100',
    textColor: 'text-violet-600',
    description: 'Cómo analizas problemas y tomas decisiones',
    time: '15 min',
    image: 'https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/691645abb6a2f3012e0b0519_FotosWeb_TradingSolutions-03_3_11zon.webp',
  },
  comportamental: {
    label: 'Liderazgo',
    color: 'bg-blue-100',
    textColor: 'text-blue-600',
    description: 'Cómo trabajas con otros y lideras equipos',
    time: '20 min',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80',
  },
  caracter: {
    label: 'Valores',
    color: 'bg-emerald-100',
    textColor: 'text-emerald-600',
    description: 'Qué te motiva y cómo enfrentas los retos',
    time: '15 min',
    image: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&q=80',
  },
  bienestar_trayectoria: {
    label: 'Balance',
    color: 'bg-orange-100',
    textColor: 'text-orange-600',
    description: 'Tu estilo de vida y hacia dónde quieres crecer',
    time: '10 min',
    image: 'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=800&q=80',
  },
};

const LIKERT_SCALE = [
  'Totalmente en desacuerdo',
  'En desacuerdo',
  'Neutral',
  'De acuerdo',
  'Totalmente de acuerdo',
];

// Trading Solutions Clean Design System
const TS_COLORS = {
  white: '#ffffff',
  offWhite: '#FAFAFA',
  lightGray: '#F3F4F6',
  black: '#111111',
  darkText: '#1a1a1a',
  mediumGray: '#666666',
  lightBorder: '#E5E7EB',
  accent: '#111111',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
};

const TS_TYPOGRAPHY = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export default function AssessmentPage() {
  const params = useParams();
  const token = params.token as string;
  // Preview mode: cuando el token es 'preview', el runner usa los escenarios
  // locales (TS_SCENARIOS) y NO guarda nada al backend. Se usa desde el HR
  // Admin para que Kelly y Yohanna vean la prueba EXACTAMENTE como la ve un
  // candidato real, sin necesidad de invitar a alguien.
  const isPreview = token === 'preview';
  // Session ID estable para todo el run preview (se mantiene mientras la página vive)
  const previewSessionRef = useRef<string>(`preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [previewReport, setPreviewReport] = useState<null | Record<string, unknown>>(null);

  // Load Inter from Google Fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap';
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  // Phase management
  const [phase, setPhase] = useState<Phase>('loading');
  const [assessmentData, setAssessmentData] = useState<AssessmentData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Assessment state
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, SavedResponse>>({});
  const [startTime, setStartTime] = useState<number>(0);
  const [scenarioStartTime, setScenarioStartTime] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number>(0);

  // Security/Proctoring state
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [antiCopyToast, setAntiCopyToast] = useState(false);
  const [scenarioTimeLeft, setScenarioTimeLeft] = useState(180);
  const [habeasAccepted, setHabeasAccepted] = useState(false);

  // Refs for proctoring
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotsRef = useRef<string[]>([]);
  const tabSwitchEventsRef = useRef<TabSwitchEvent[]>([]);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scenarioTimerRef = useRef<NodeJS.Timeout | null>(null);
  const antiCopyToastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const interactionLog = useRef<{type: string; ts: number; detail?: string}[]>([]);

  // Phase 1: Load and validate assessment
  useEffect(() => {
    async function loadAssessment() {
      try {
        // ─── PREVIEW MODE: usa TS_SCENARIOS local sin hit a Supabase ───
        if (isPreview) {
          const mapped: AssessmentData = {
            token: 'preview',
            candidate_name: 'Preview · HR Admin',
            vacancy_title: 'Evaluación Trading Solutions',
            client_name: 'Trading Solutions',
            scenarios: TS_SCENARIOS.map((s, i) => ({
              id: `preview-${i}`,
              block: s.block,
              type: s.scenario_type,
              scenario_text: s.scenario_text,
              options: s.options ?? [],
              target_columns: s.target_columns,
              time_limit_seconds: s.time_limit_seconds,
              competency_label: s.competency_label,
              order_index: s.order_index,
            })),
          };
          setAssessmentData(mapped);
          setStartTime(Date.now());
          setScenarioStartTime(Date.now());
          setPhase('welcome');
          return;
        }

        const res = await fetch(
          `/api/headhunting/assessment/validate?token=${encodeURIComponent(token)}`
        );

        if (res.status === 401 || res.status === 410) {
          setErrorMsg(
            res.status === 410
              ? 'Este enlace ha expirado. Por favor, solicita uno nuevo.'
              : 'Token inválido o expirado.'
          );
          setPhase('expired');
          return;
        }

        if (!res.ok) {
          setErrorMsg('Error al cargar la evaluación. Por favor, intenta de nuevo.');
          setPhase('error');
          return;
        }

        const raw = await res.json();

        // Map API response to AssessmentData shape
        const mapped: AssessmentData = {
          token,
          candidate_name: raw.candidate?.name || 'Candidato',
          vacancy_title: raw.vacancy?.title || 'Evaluación',
          client_name: raw.client?.name || 'Trading Solutions',
          client_logo: raw.client?.logo_url || undefined,
          scenarios: (raw.scenarios || []).map((s: any) => ({
            id: s.id,
            block: s.block,
            type: s.scenario_type,
            scenario_text: s.scenario_text,
            // NOTE: scoring_rubric.instructions is internal — never shown to candidate
            options: s.options || [],
            target_columns: s.target_columns,
            time_limit_seconds: s.time_limit_seconds,
            competency_label: s.competency_label,
            order_index: s.order_index,
          })),
        };

        setAssessmentData(mapped);

        // Restore existing responses if resuming
        if (raw.existing_responses?.length) {
          const restoredResponses: Record<string, SavedResponse> = {};
          for (const r of raw.existing_responses) {
            restoredResponses[r.scenario_id] = {
              text: r.response_text || '',
              data: r.response_data || {},
              time: Date.now(),
              final: r.is_final || false,
            };
          }
          setResponses(restoredResponses);
        }

        setStartTime(Date.now());
        setScenarioStartTime(Date.now());
        setPhase('welcome');
      } catch (err) {
        console.error('Error loading assessment:', err);
        setErrorMsg('Error de conexión. Por favor, recarga la página.');
        setPhase('error');
      }
    }

    if (token) {
      loadAssessment();
    }
  }, [token]);

  // Tab visibility change detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (phase !== 'assessment') return;

      const isHidden = document.hidden;
      tabSwitchEventsRef.current.push({
        timestamp: Date.now(),
        type: isHidden ? 'hidden' : 'visible',
      });

      if (isHidden) {
        setTabSwitchCount((prev) => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setShowTabWarning(true);
          }
          return newCount;
        });
      } else {
        setShowTabWarning(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [phase]);

  // Anti copy/paste
  useEffect(() => {
    if (phase !== 'assessment') return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setAntiCopyToast(true);
      if (antiCopyToastTimeoutRef.current) clearTimeout(antiCopyToastTimeoutRef.current);
      antiCopyToastTimeoutRef.current = setTimeout(() => {
        setAntiCopyToast(false);
      }, 2000);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlKey && ['c', 'v', 'a', 'x'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        setAntiCopyToast(true);
        if (antiCopyToastTimeoutRef.current) clearTimeout(antiCopyToastTimeoutRef.current);
        antiCopyToastTimeoutRef.current = setTimeout(() => {
          setAntiCopyToast(false);
        }, 2000);
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [phase]);

  // Enhanced anti-cheat
  useEffect(() => {
    if (phase !== 'assessment') return;

    const preventContext = (e: MouseEvent) => { e.preventDefault(); };
    const preventPrintScreen = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'))) {
        e.preventDefault();
        interactionLog.current.push({ type: 'screenshot_attempt', ts: Date.now() });
      }
    };

    document.addEventListener('contextmenu', preventContext);
    document.addEventListener('keydown', preventPrintScreen);

    return () => {
      document.removeEventListener('contextmenu', preventContext);
      document.removeEventListener('keydown', preventPrintScreen);
    };
  }, [phase]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (phase !== 'assessment' || !assessmentData) return;

    const scenario = assessmentData.scenarios[currentScenarioIndex];
    if (!scenario) return;

    autoSaveIntervalRef.current = setInterval(() => {
      saveResponse(scenario.id, false);
    }, 30000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [currentScenarioIndex, phase, assessmentData]);

  // Camera snapshot capture every 45 seconds — upload immediately to server
  useEffect(() => {
    if (phase !== 'assessment' || !cameraEnabled) return;

    const capture = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      // Downscale to 480px wide for bandwidth
      const vw = videoRef.current.videoWidth || 640;
      const vh = videoRef.current.videoHeight || 480;
      const targetW = 480;
      const targetH = Math.round((vh / vw) * targetW);
      canvasRef.current.width = targetW;
      canvasRef.current.height = targetH;
      ctx.drawImage(videoRef.current, 0, 0, targetW, targetH);
      const snapshot = canvasRef.current.toDataURL('image/jpeg', 0.6);
      snapshotsRef.current.push(snapshot);

      const capturedAt = new Date().toISOString();
      // En preview no subimos snapshots (no se requieren para revisión interna),
      // pero conservamos el conteo en local para mostrarlo en el reporte.
      if (isPreview) return;
      // Upload in background (don't block UI)
      try {
        await fetch('/api/headhunting/assessment/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            scenario_id: assessmentData?.scenarios[currentScenarioIndex]?.id,
            scenario_index: currentScenarioIndex,
            snapshot_base64: snapshot,
            captured_at: capturedAt,
          }),
        });
      } catch (e) {
        // Silently fail — proctoring is best-effort, don't interrupt test
        console.warn('Snapshot upload failed:', e);
      }
    };

    // Capture one immediately on entering assessment, then every 45s
    capture();
    snapshotIntervalRef.current = setInterval(capture, 45000);

    return () => {
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current);
      }
    };
  }, [phase, cameraEnabled, token, assessmentData, currentScenarioIndex]);

  // Scenario timer
  useEffect(() => {
    if (phase !== 'assessment' || !assessmentData) return;

    const scenario = assessmentData.scenarios[currentScenarioIndex];
    if (!scenario) return;

    const timeLimit = scenario.time_limit_seconds || 180;
    setScenarioTimeLeft(timeLimit);

    // Log scenario start
    interactionLog.current.push({ type: 'scenario_viewed', ts: scenarioStartTime, detail: scenario.id });

    scenarioTimerRef.current = setInterval(() => {
      setScenarioTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up, auto-advance
          handleAutoAdvance();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (scenarioTimerRef.current) {
        clearInterval(scenarioTimerRef.current);
      }
    };
  }, [phase, currentScenarioIndex, assessmentData, scenarioStartTime]);

  // Auto-advance when time runs out
  const handleAutoAdvance = useCallback(async () => {
    if (!assessmentData) return;

    const scenario = assessmentData.scenarios[currentScenarioIndex];
    await saveResponse(scenario.id, false);

    // Show toast
    setAntiCopyToast(true);
    if (antiCopyToastTimeoutRef.current) clearTimeout(antiCopyToastTimeoutRef.current);
    antiCopyToastTimeoutRef.current = setTimeout(() => {
      setAntiCopyToast(false);
    }, 2000);

    if (currentScenarioIndex < assessmentData.scenarios.length - 1) {
      setCurrentScenarioIndex((prev) => prev + 1);
      setScenarioStartTime(Date.now());
    } else {
      setPhase('review');
    }
  }, [assessmentData, currentScenarioIndex]);

  // Request camera access
  const handleRequestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraEnabled(true);
      setCameraError('');
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('No se pudo acceder a la cámara');
      // Allow to continue with warning
    }
  };

  // Reconnect stream to video element whenever it mounts/remounts
  useEffect(() => {
    if (cameraEnabled && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
    }
  });

  // Save response
  const saveResponse = useCallback(
    async (scenarioId: string, isFinal: boolean = false) => {
      const resp = responses[scenarioId];
      if (!resp || !resp.text.trim()) return;

      // Prevent duplicate saves within 2 seconds
      if (Date.now() - lastSaveTime < 2000) return;

      setIsSaving(true);
      try {
        const elapsedSeconds = Math.round((Date.now() - scenarioStartTime) / 1000);

        // Calculate interaction metadata for anti-cheat detection
        const scenarioInteractions = interactionLog.current.filter(
          (log) => log.ts >= scenarioStartTime
        );
        const firstInteraction = scenarioInteractions.find(
          (log) => log.type === 'option_clicked' || log.type === 'response_started'
        );
        const timeToFirstInteraction = firstInteraction ? firstInteraction.ts - scenarioStartTime : elapsedSeconds * 1000;
        const answerChanges = scenarioInteractions.filter((log) => log.type === 'answer_changed').length;
        const hoverCount = scenarioInteractions.filter((log) => log.type === 'option_hovered').length;

        if (isPreview) {
          // Preview mode: guarda en assessment_preview_responses (Neon)
          const scenarioObj = assessmentData?.scenarios.find((s) => s.id === scenarioId);
          const idx = assessmentData?.scenarios.findIndex((s) => s.id === scenarioId) ?? -1;
          await fetch('/api/assessment-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: previewSessionRef.current,
              scenario_index: idx,
              scenario_id: scenarioId,
              block: scenarioObj?.block,
              response_text: resp.text,
              response_data: resp.data,
              time_spent_seconds: elapsedSeconds,
              tab_switch_count: tabSwitchCount,
            }),
          });
        } else {
          await fetch('/api/headhunting/assessment/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              scenario_id: scenarioId,
              response_text: resp.text,
              response_data: resp.data,
              time_spent_seconds: elapsedSeconds,
              is_final: isFinal,
              tab_switch_count: tabSwitchCount,
              tab_switch_events: tabSwitchEventsRef.current,
              camera_snapshots_count: snapshotsRef.current.length,
              response_metadata: {
                time_to_first_interaction_ms: timeToFirstInteraction,
                time_to_final_answer_ms: elapsedSeconds * 1000,
                answer_changes: answerChanges,
                tab_switches_during_question: tabSwitchCount,
                interaction_count: scenarioInteractions.length,
              },
            }),
          });
        }
        setLastSaveTime(Date.now());
      } catch (err) {
        console.error('Error saving response:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [responses, token, scenarioStartTime, lastSaveTime, tabSwitchCount]
  );

  // Update response text
  const updateResponse = useCallback(
    (scenarioId: string, text: string, data: Record<string, any> = {}) => {
      setResponses((prev) => ({
        ...prev,
        [scenarioId]: {
          text,
          data,
          time: Date.now(),
          final: false,
        },
      }));
    },
    []
  );

  // Handle next scenario
  const handleNext = async () => {
    if (!assessmentData) return;

    const scenario = assessmentData.scenarios[currentScenarioIndex];
    await saveResponse(scenario.id, false);

    if (currentScenarioIndex < assessmentData.scenarios.length - 1) {
      setCurrentScenarioIndex((prev) => prev + 1);
      setScenarioStartTime(Date.now());
    } else {
      setPhase('review');
    }
  };

  // Handle previous scenario
  const handlePrevious = () => {
    if (currentScenarioIndex > 0) {
      setCurrentScenarioIndex((prev) => prev - 1);
      setScenarioStartTime(Date.now());
    }
  };

  // Start assessment (transition to habeas data policy)
  const handleStartAssessment = () => {
    setPhase('habeas_data');
  };

  // Accept habeas data policy and continue to camera setup
  const handleAcceptHabeasData = () => {
    setPhase('camera_setup');
  };

  // Continue to assessment from camera setup
  const handleContinueToAssessment = () => {
    setPhase('assessment');
    setScenarioStartTime(Date.now());
  };

  // Complete assessment
  const handleCompleteAssessment = async () => {
    setPhase('loading');

    try {
      if (isPreview) {
        // Preview: guarda todas las respuestas finales y pide reporte con benchmarks
        if (assessmentData) {
          for (let i = 0; i < assessmentData.scenarios.length; i++) {
            const scenario = assessmentData.scenarios[i];
            const resp = responses[scenario.id];
            if (resp && (resp.text.trim() || resp.data?.option_index !== undefined)) {
              await fetch('/api/assessment-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: previewSessionRef.current,
                  scenario_index: i,
                  scenario_id: scenario.id,
                  block: scenario.block,
                  response_text: resp.text,
                  response_data: resp.data,
                  time_spent_seconds: Math.round((Date.now() - startTime) / 1000 / Math.max(1, assessmentData.scenarios.length)),
                  tab_switch_count: tabSwitchCount,
                }),
              });
            }
          }
        }
        const completeRes = await fetch('/api/assessment-preview?op=complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: previewSessionRef.current,
            total_time_seconds: Math.round((Date.now() - startTime) / 1000),
            tab_switch_count: tabSwitchCount,
            camera_enabled: cameraEnabled,
          }),
        });
        if (completeRes.ok) {
          const data = await completeRes.json();
          setPreviewReport(data.report);
          setPhase('complete');
        } else {
          throw new Error('Preview complete failed');
        }
        // Stop camera
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        return;
      }

      // Save all remaining responses as final (ruta normal con token real)
      // ⚠️ NO incluir time_spent_seconds aquí — los saves durante navegación
      // (handleNext) ya guardaron el tiempo correcto por escenario. Si lo
      // pasáramos acá lo SOBREESCRIBIMOS con el tiempo total del test, que
      // es lo que rompía el agente auditor (todos los escenarios mostraban
      // el mismo ~3175s).
      if (assessmentData) {
        for (const scenario of assessmentData.scenarios) {
          const resp = responses[scenario.id];
          if (resp && resp.text.trim()) {
            await fetch('/api/headhunting/assessment/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token,
                scenario_id: scenario.id,
                response_text: resp.text,
                response_data: resp.data,
                // time_spent_seconds: OMITIDO a propósito — preserva el valor por-escenario
                is_final: true,
                tab_switch_count: tabSwitchCount,
                tab_switch_events: tabSwitchEventsRef.current,
                camera_snapshots_count: snapshotsRef.current.length,
              }),
            });
          }
        }
      }

      // Mark as complete
      const res = await fetch('/api/headhunting/assessment/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          total_time_seconds: assessmentData ? Math.round((Date.now() - (assessmentData.started_at || Date.now())) / 1000) : 0,
          proctoring: {
            camera_enabled: cameraEnabled,
            total_tab_switches: tabSwitchCount,
            total_camera_snapshots: snapshotsRef.current.length,
            tab_switch_events: tabSwitchEventsRef.current,
          },
        }),
      });

      if (res.ok) {
        setPhase('complete');
      } else {
        throw new Error('Failed to complete assessment');
      }
    } catch (err) {
      console.error('Error completing assessment:', err);
      setErrorMsg('Error al completar la evaluación.');
      setPhase('error');
    } finally {
      // Stop camera stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    }
  };

  // Format timer display
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const timerColor = scenarioTimeLeft < 30 ? TS_COLORS.error : TS_COLORS.darkText;

  // Render loading phase
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-[#111111] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p style={{ color: TS_COLORS.mediumGray }} className="text-base font-light">Cargando tu evaluación...</p>
        </div>
      </div>
    );
  }

  // Render error/expired phases
  if (phase === 'error' || phase === 'expired') {
    const isExpired = phase === 'expired';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        <div className="max-w-md w-full text-center">
          <div className="rounded-3xl shadow-sm p-10 border" style={{ backgroundColor: TS_COLORS.lightGray, borderColor: TS_COLORS.lightBorder }}>
            <div className="w-16 h-16 rounded-2xl mx-auto mb-8 flex items-center justify-center" style={{ backgroundColor: isExpired ? '#FEF3C7' : '#FEE2E2' }}>
              {isExpired ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
            </div>
            <h1 className="text-3xl font-semibold mb-3" style={{ color: TS_COLORS.black }}>
              {isExpired ? 'Enlace Expirado' : 'Error'}
            </h1>
            <p className="mb-8 leading-relaxed" style={{ color: TS_COLORS.mediumGray, fontSize: '15px' }}>{errorMsg}</p>
            <a
              href="/"
              className="inline-block px-8 py-3 text-white font-semibold rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
              style={{ backgroundColor: TS_COLORS.black }}
            >
              Volver al inicio
            </a>
          </div>
          <div className="text-center text-xs mt-12" style={{ color: TS_COLORS.mediumGray }}>
            Powered by ELEVARE Career
          </div>
        </div>
      </div>
    );
  }

  // Render welcome phase
  if (phase === 'welcome' && assessmentData) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        {/* Header with Logo */}
        <div className="border-b" style={{ borderColor: TS_COLORS.lightBorder }}>
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <img
              src="https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/6913594489519813fe9e620e_logo%20web-03.png"
              alt="Trading Solutions"
              className="h-7"
            />
            <span style={{ color: TS_COLORS.mediumGray }} className="text-xs font-medium tracking-wide">
              Powered by ELEVARE
            </span>
          </div>
        </div>

        {/* Hero Section — large image with overlaid text like TS website */}
        <div
          className="relative h-[420px] flex items-end px-6 pb-12 mb-16"
          style={{
            backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.1) 60%, transparent 100%), url('https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/691645abb6a2f3012e0b0519_FotosWeb_TradingSolutions-03_3_11zon.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 40%',
          }}
        >
          <div className="max-w-6xl mx-auto w-full">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Evaluación · {assessmentData.vacancy_title}
            </p>
            <h1 className="text-5xl sm:text-6xl font-bold leading-tight text-white">
              Hola, {assessmentData.candidate_name.split(' ')[0]}.
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 pb-16">
          <div className="max-w-5xl mx-auto">

            {/* Aspirational block — full-width, no card wrapper */}
            <div className="mb-16">
              <h2 style={{ color: TS_COLORS.black }} className="text-3xl sm:text-4xl font-bold leading-snug mb-6">
                Tu próximo gran paso profesional
              </h2>
              <p style={{ color: TS_COLORS.mediumGray }} className="text-lg leading-relaxed max-w-3xl">
                En Trading Solutions movemos el comercio internacional. Operamos en cinco continentes, resolvemos desafíos logísticos que otros no pueden, y cada persona aquí tiene impacto real en operaciones globales. Si buscas un lugar donde tu criterio cuente y tu crecimiento no tenga techo — estás en el lugar correcto.
              </p>
            </div>

            {/* Divider */}
            <div className="border-t mb-16" style={{ borderColor: TS_COLORS.lightBorder }}></div>

            {/* What to expect — horizontal layout */}
            <div className="mb-16">
              <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold uppercase tracking-widest mb-10">
                Qué te espera
              </p>

              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 mb-12">
                {[
                  { label: 'Resolución', desc: 'Problemas y decisiones', time: '15 min', block: 'cognitivo' },
                  { label: 'Liderazgo', desc: 'Trabajo en equipo', time: '20 min', block: 'comportamental' },
                  { label: 'Valores', desc: 'Motivación y resiliencia', time: '15 min', block: 'caracter' },
                  { label: 'Balance', desc: 'Estilo de vida', time: '10 min', block: 'bienestar_trayectoria' },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="group cursor-default"
                  >
                    <div
                      className="h-40 rounded-xl bg-cover bg-center mb-5 transition-transform duration-300 group-hover:scale-[1.02]"
                      style={{
                        backgroundImage: `url('${BLOCK_INFO[item.block as keyof typeof BLOCK_INFO].image}')`,
                      }}
                    />
                    <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold uppercase tracking-widest mb-2">
                      {item.time}
                    </p>
                    <h3 style={{ color: TS_COLORS.black }} className="text-lg font-bold mb-1">
                      {item.label}
                    </h3>
                    <p style={{ color: TS_COLORS.mediumGray }} className="text-sm">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 py-4 px-6 rounded-xl" style={{ backgroundColor: TS_COLORS.lightGray }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TS_COLORS.mediumGray} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <p style={{ color: TS_COLORS.black }} className="text-sm font-semibold">
                  Duración total: 55 minutos
                </p>
                <span style={{ color: TS_COLORS.mediumGray }} className="text-sm">
                  · 4 bloques · Responde con tu primera reacción
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t mb-16" style={{ borderColor: TS_COLORS.lightBorder }}></div>

            {/* About the evaluation */}
            <div className="mb-16">
              <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold uppercase tracking-widest mb-6">
                Sobre la evaluación
              </p>
              <p style={{ color: TS_COLORS.mediumGray }} className="text-base leading-relaxed max-w-3xl">
                Queremos conocer tu estilo: cómo tomas decisiones, cómo colaboras, y qué te mueve. No hay respuestas correctas — solo tu forma de ser.
              </p>
            </div>

            {/* How it works */}
            <div className="mb-20">
              <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold uppercase tracking-widest mb-10">
                Cómo funciona
              </p>

              <div className="space-y-5">
                {[
                  {
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="6" rx="2" ry="2" width="20" height="14" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <circle cx="12" cy="13" r="3" />
                      </svg>
                    ),
                    text: 'Tu cámara estará activa para verificar tu identidad'
                  },
                  {
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    ),
                    text: 'Cada pregunta tiene tiempo límite — responde con tu primera reacción'
                  },
                  {
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    ),
                    text: 'Copiar, pegar y cambiar de pestaña están deshabilitados'
                  },
                  {
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 17.5A5.5 5.5 0 0 1 6.5 7 5 5 0 0 1 16 6a4.5 4.5 0 0 1 1 9" />
                        <path d="M9.5 15l2.5 2.5L17 12" />
                      </svg>
                    ),
                    text: 'Tus respuestas se guardan automáticamente'
                  },
                  {
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                        <path d="M14 2v6h6" />
                        <path d="M9 15h6" />
                        <path d="M9 11h6" />
                      </svg>
                    ),
                    text: 'Podrás revisar todo antes de enviar'
                  },
                ].map((point, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <div className="flex-shrink-0 mt-0.5" style={{ color: TS_COLORS.black, minWidth: '24px', height: '24px' }}>
                      {point.icon}
                    </div>
                    <p style={{ color: TS_COLORS.black }} className="text-base leading-relaxed font-medium">
                      {point.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA Button */}
            <div>
              <button
                onClick={handleStartAssessment}
                className="w-full py-4 px-8 text-white font-bold rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105 text-lg"
                style={{ backgroundColor: TS_COLORS.black }}
              >
                Empezar
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  }

  // Render habeas data policy phase
  if (phase === 'habeas_data' && assessmentData) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        {/* Header */}
        <div className="border-b" style={{ borderColor: TS_COLORS.lightBorder }}>
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <img
              src="https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/6913594489519813fe9e620e_logo%20web-03.png"
              alt="Trading Solutions"
              className="h-7"
            />
            <span style={{ color: TS_COLORS.mediumGray }} className="text-xs font-medium tracking-wide">
              Powered by ELEVARE
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-12">
          <div className="max-w-3xl mx-auto">
            {/* Title */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={TS_COLORS.black} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <h1 style={{ color: TS_COLORS.black }} className="text-2xl sm:text-3xl font-bold">
                  Política de Protección de Datos Personales
                </h1>
              </div>
              <p style={{ color: TS_COLORS.mediumGray }} className="text-sm">
                Antes de continuar, te pedimos leer y aceptar nuestra política de tratamiento de datos personales conforme a la Ley 1581 de 2012.
              </p>
            </div>

            {/* Scrollable Policy Text */}
            <div
              className="border rounded-xl p-6 sm:p-8 mb-8 overflow-y-auto"
              style={{
                borderColor: TS_COLORS.lightBorder,
                maxHeight: '420px',
                backgroundColor: TS_COLORS.offWhite,
              }}
            >
              <div style={{ color: TS_COLORS.darkText }} className="text-sm leading-relaxed space-y-4">
                <p className="font-bold text-base" style={{ color: TS_COLORS.black }}>
                  AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES
                </p>

                <p>
                  En cumplimiento de la <strong>Ley Estatutaria 1581 de 2012</strong>, el <strong>Decreto Reglamentario 1377 de 2013</strong> y demás normas concordantes sobre protección de datos personales en Colombia, <strong>TRADING SOLUTIONS S.A.S.</strong> (en adelante «la Empresa»), identificada con NIT que obra en su base de datos, con domicilio en Barranquilla, Colombia, en calidad de Responsable del Tratamiento, solicita su autorización para recolectar, almacenar, usar, circular y tratar sus datos personales conforme a lo descrito a continuación.
                </p>

                <p className="font-semibold" style={{ color: TS_COLORS.black }}>1. Datos que serán recolectados</p>
                <p>
                  A través de este proceso de evaluación se recolectarán los siguientes datos personales:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Datos de identificación:</strong> nombre completo, correo electrónico, número de teléfono.</li>
                  <li><strong>Datos de desempeño en la evaluación:</strong> respuestas proporcionadas en cada escenario, tiempos de respuesta, puntajes obtenidos en dimensiones psicométricas (cognitivas, de personalidad, comportamentales y motivacionales).</li>
                  <li><strong>Datos de monitoreo:</strong> capturas de cámara periódicas durante la evaluación con fines de verificación de identidad, registro de cambios de pestaña del navegador.</li>
                  <li><strong>Datos sensibles:</strong> los resultados de evaluaciones psicométricas constituyen datos sensibles conforme al artículo 5 de la Ley 1581 de 2012. Su tratamiento requiere autorización expresa y se realizará exclusivamente para las finalidades aquí descritas.</li>
                </ul>

                <p className="font-semibold" style={{ color: TS_COLORS.black }}>2. Finalidades del tratamiento</p>
                <p>Sus datos personales serán tratados para las siguientes finalidades:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Evaluar su perfil profesional, competencias, habilidades cognitivas y rasgos de personalidad en el marco del proceso de selección para la vacante a la que aplica.</li>
                  <li>Generar un informe de resultados que será utilizado exclusivamente por el área de Talento Humano de la Empresa para la toma de decisiones en el proceso de selección.</li>
                  <li>Verificar la identidad del evaluado durante la prueba.</li>
                  <li>Garantizar la integridad y autenticidad de las respuestas proporcionadas.</li>
                  <li>Cumplir con obligaciones legales, contractuales y regulatorias aplicables.</li>
                </ul>

                <p className="font-semibold" style={{ color: TS_COLORS.black }}>3. Derechos del titular</p>
                <p>
                  Como titular de los datos, usted tiene derecho a:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Conocer, actualizar y rectificar sus datos personales.</li>
                  <li>Solicitar prueba de la autorización otorgada.</li>
                  <li>Ser informado(a) sobre el uso que se ha dado a sus datos.</li>
                  <li>Revocar la autorización y/o solicitar la supresión de sus datos cuando considere que no se han respetado los principios, derechos y garantías constitucionales y legales.</li>
                  <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.</li>
                  <li>Acceder de forma gratuita a sus datos personales que hayan sido objeto de tratamiento.</li>
                </ul>

                <p className="font-semibold" style={{ color: TS_COLORS.black }}>4. Seguridad y confidencialidad</p>
                <p>
                  La Empresa implementa medidas técnicas, humanas y administrativas necesarias para garantizar la seguridad de los datos personales, evitando su adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento. Los resultados de su evaluación serán tratados de manera estrictamente confidencial y únicamente serán consultados por personal autorizado del área de Talento Humano.
                </p>

                <p className="font-semibold" style={{ color: TS_COLORS.black }}>5. Vigencia y almacenamiento</p>
                <p>
                  Sus datos personales serán conservados durante el tiempo que sea razonablemente necesario para cumplir con las finalidades descritas, y en todo caso, durante el período que exijan las disposiciones legales vigentes. Una vez cumplida la finalidad del tratamiento y los términos legales aplicables, sus datos serán suprimidos de nuestras bases de datos.
                </p>

                <p className="font-semibold" style={{ color: TS_COLORS.black }}>6. Encargado y canales de atención</p>
                <p>
                  El tratamiento de datos es realizado a través de la plataforma de evaluación de <strong>TRADING SOLUTIONS S.A.S.</strong>, que actúa también como Encargado del Tratamiento. Para ejercer sus derechos como titular, puede comunicarse al correo del área de Talento Humano: <strong>jointheteam@tradingsolutions.com</strong>.
                </p>

                <p className="font-semibold" style={{ color: TS_COLORS.black }}>7. Carácter facultativo</p>
                <p>
                  La participación en este proceso de evaluación y el suministro de sus datos personales es de carácter <strong>voluntario</strong>. No obstante, en caso de no otorgar la presente autorización, no será posible continuar con el proceso de evaluación ni con su participación en el proceso de selección.
                </p>
              </div>
            </div>

            {/* Acceptance checkbox and button */}
            <div className="space-y-6">
              <label className="flex items-start gap-3 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={habeasAccepted}
                  className="mt-1 w-5 h-5 rounded border-2 accent-black cursor-pointer"
                  style={{ accentColor: TS_COLORS.black }}
                  onChange={(e) => setHabeasAccepted(e.target.checked)}
                />
                <span style={{ color: TS_COLORS.darkText }} className="text-sm leading-relaxed">
                  Declaro que he leído y comprendido la Política de Protección de Datos Personales. Autorizo de manera libre, expresa, previa e informada a <strong>TRADING SOLUTIONS S.A.S.</strong> para recolectar, almacenar, usar y tratar mis datos personales, incluidos datos sensibles derivados de la evaluación psicométrica, conforme a las finalidades aquí descritas y en cumplimiento de la Ley 1581 de 2012.
                </span>
              </label>

              <button
                onClick={handleAcceptHabeasData}
                disabled={!habeasAccepted}
                className="w-full py-4 px-8 text-white font-bold rounded-full transition-all duration-300 text-lg"
                style={{
                  backgroundColor: TS_COLORS.black,
                  opacity: habeasAccepted ? 1 : 0.4,
                  cursor: habeasAccepted ? 'pointer' : 'not-allowed',
                }}
              >
                Acepto y continúo
              </button>

              <p className="text-center text-xs" style={{ color: TS_COLORS.mediumGray }}>
                Si no desea continuar, puede cerrar esta ventana. Su información no será procesada.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render camera setup phase
  if (phase === 'camera_setup' && assessmentData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        <div className="max-w-md w-full">
          <div className="rounded-3xl p-10 border" style={{ backgroundColor: TS_COLORS.lightGray, borderColor: TS_COLORS.lightBorder }}>
            {/* TS Logo */}
            <div className="mb-8 flex justify-center">
              <img
                src="https://cdn.prod.website-files.com/68fb7b9474bf8f90808cd50f/6913594489519813fe9e620e_logo%20web-03.png"
                alt="Trading Solutions"
                className="h-10"
              />
            </div>

            {/* Camera Icon */}
            <div className="flex justify-center mb-8">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={TS_COLORS.black} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" rx="2" ry="2" width="20" height="14" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>

            <h2 style={{ color: TS_COLORS.black }} className="text-3xl font-bold text-center mb-4">
              Configurar cámara
            </h2>

            <p style={{ color: TS_COLORS.mediumGray }} className="text-base text-center mb-10 leading-relaxed">
              Necesitamos acceso a tu cámara para verificar tu identidad durante la evaluación.
            </p>

            {/* Video Preview */}
            {cameraEnabled ? (
              <div className="mb-8">
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video mb-6" style={{ boxShadow: `0 0 0 2px ${TS_COLORS.white}, 0 0 0 4px ${TS_COLORS.success}` }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center gap-2 justify-center mb-8">
                  <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: TS_COLORS.success }}></div>
                  <span style={{ color: TS_COLORS.success }} className="text-sm font-semibold">
                    Cámara lista
                  </span>
                </div>
                <button
                  onClick={handleContinueToAssessment}
                  className="w-full text-white font-bold py-4 rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
                  style={{ backgroundColor: TS_COLORS.black }}
                >
                  Continuar
                </button>
              </div>
            ) : (
              <div className="mb-8">
                {cameraError && (
                  <p style={{ color: TS_COLORS.error, backgroundColor: '#FEE2E2', borderColor: TS_COLORS.error }} className="text-sm mb-6 p-4 rounded-2xl text-center border">
                    {cameraError}
                  </p>
                )}
                <button
                  onClick={handleRequestCamera}
                  className="w-full text-white font-bold py-4 rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105 mb-4"
                  style={{ backgroundColor: TS_COLORS.black }}
                >
                  Activar cámara
                </button>
                <button
                  onClick={handleContinueToAssessment}
                  style={{ color: TS_COLORS.black }}
                  className="w-full font-semibold py-3 text-base hover:opacity-70 transition"
                >
                  Continuar sin cámara
                </button>
                <p style={{ color: TS_COLORS.mediumGray }} className="text-xs text-center mt-4 leading-relaxed">
                  Puedes continuar sin cámara, pero esto quedará registrado y podría ser considerado en la revisión de tu evaluación.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs mt-12" style={{ color: TS_COLORS.mediumGray }}>
          Powered by ELEVARE Career
        </div>
      </div>
    );
  }

  // Render assessment phase
  if (phase === 'assessment' && assessmentData) {
    const scenarios = assessmentData.scenarios;
    const scenario = scenarios[currentScenarioIndex];
    const blockInfo = BLOCK_INFO[scenario.block];
    const progress = Math.round(((currentScenarioIndex + 1) / scenarios.length) * 100);
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedSecs = elapsedSeconds % 60;
    const elapsedTime = `${elapsedMinutes.toString().padStart(2, '0')}:${elapsedSecs.toString().padStart(2, '0')}`;

    const currentResponse = responses[scenario.id] || { text: '', data: {} };

    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        {/* Tab Warning Overlay */}
        {showTabWarning && (
          <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="rounded-3xl p-10 max-w-sm w-full mx-4 border" style={{ backgroundColor: TS_COLORS.white, borderColor: TS_COLORS.lightBorder }}>
              <div className="flex justify-center mb-6">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={TS_COLORS.black} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 style={{ color: TS_COLORS.black }} className="text-2xl font-bold text-center mb-4">
                Atención
              </h2>
              <p style={{ color: TS_COLORS.mediumGray }} className="text-base text-center mb-8 leading-relaxed">
                {tabSwitchCount >= 3
                  ? `Has salido de esta pestaña ${tabSwitchCount} veces. Esto será registrado.`
                  : 'Por favor, permanece en esta pestaña durante la evaluación.'}
              </p>
              <button
                onClick={() => setShowTabWarning(false)}
                className="w-full text-white font-bold py-3 rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
                style={{ backgroundColor: TS_COLORS.black }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* Anti-Copy Toast */}
        {antiCopyToast && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50">
            <div className="text-white px-6 py-3 rounded-full text-sm font-bold" style={{ backgroundColor: 'rgba(17, 17, 17, 0.9)' }}>
              Copiar y pegar está deshabilitado
            </div>
          </div>
        )}

        {/* Sticky Top Bar */}
        <div className="border-b sticky top-0 z-20" style={{ backgroundColor: TS_COLORS.white, borderColor: TS_COLORS.lightBorder }}>
          <div className="max-w-5xl mx-auto px-6 py-5">
            {/* Progress Bar */}
            <div className="h-1 rounded-full overflow-hidden mb-4" style={{ backgroundColor: TS_COLORS.lightBorder }}>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${progress}%`, backgroundColor: TS_COLORS.black }}
              ></div>
            </div>

            {/* Progress Dots — shows which questions are answered */}
            <div className="flex gap-1.5 mb-5 flex-wrap">
              {scenarios.map((s, idx) => {
                const isAnswered = !!(responses[s.id]?.text?.trim());
                const isCurrent = idx === currentScenarioIndex;
                return (
                  <div
                    key={s.id}
                    className={`h-2 rounded-full transition-all duration-200 ${isCurrent ? 'w-6' : 'w-2'}`}
                    style={{
                      backgroundColor: isCurrent
                        ? TS_COLORS.black
                        : isAnswered
                          ? TS_COLORS.success
                          : '#D1D5DB',
                    }}
                    title={`Pregunta ${idx + 1}${isAnswered ? ' ✓' : ''}`}
                  />
                );
              })}
            </div>

            {/* Title & Timer Row */}
            <div className="flex items-center justify-between">
              <div>
                <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold uppercase tracking-wide">
                  {currentScenarioIndex + 1} / {scenarios.length}
                </p>
                <p style={{ color: TS_COLORS.black }} className="text-sm font-bold mt-1">
                  {blockInfo.label}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold mb-1">
                    Tiempo total
                  </p>
                  <p style={{ color: TS_COLORS.black }} className="text-base font-mono font-bold">
                    {elapsedTime}
                  </p>
                </div>
                {/* Timer: only visible when < 60 seconds remain */}
                {scenarioTimeLeft <= 60 && (
                  <div className="text-right">
                    <p style={{ color: scenarioTimeLeft < 30 ? TS_COLORS.error : TS_COLORS.mediumGray }} className="text-xs font-semibold mb-1">
                      {scenarioTimeLeft < 30 ? 'Tiempo casi agotado' : 'Tiempo restante'}
                    </p>
                    <p style={{ color: scenarioTimeLeft < 30 ? TS_COLORS.error : TS_COLORS.black }} className={`text-base font-mono font-bold ${scenarioTimeLeft < 30 ? 'animate-pulse' : ''}`}>
                      {formatTimer(scenarioTimeLeft)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 px-6 py-10 overflow-auto">
          <div className="max-w-4xl mx-auto">
            {/* Question Text */}
            <div className="mb-12">
              <p style={{ color: TS_COLORS.mediumGray }} className="text-sm font-semibold uppercase tracking-wide mb-4">
                Pregunta
              </p>
              <p style={{ color: TS_COLORS.black }} className="text-xl leading-relaxed whitespace-pre-wrap select-none font-medium">
                {scenario.scenario_text}
              </p>
            </div>

            {/* Response Input - Different by type */}
            <div className="mb-16">
              {scenario.type === 'likert' && scenario.statements ? (
                // Likert Scale
                <div className="space-y-10">
                  {scenario.statements.map((statement, idx) => (
                    <div key={idx}>
                      <p style={{ color: TS_COLORS.black }} className="text-base font-semibold mb-6">
                        {statement}
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        {LIKERT_SCALE.map((label, scaleIdx) => (
                          <button
                            key={scaleIdx}
                            onClick={() => {
                              const data = currentResponse.data || {};
                              data[`statement_${idx}`] = scaleIdx;
                              updateResponse(scenario.id, currentResponse.text || '', data);
                            }}
                            className={`flex-1 py-3 px-4 rounded-full text-xs sm:text-sm font-semibold transition duration-200 ${
                              (currentResponse.data?.[`statement_${idx}`] ?? -1) === scaleIdx
                                ? 'text-white'
                                : 'border'
                            }`}
                            style={{
                              backgroundColor:
                                (currentResponse.data?.[`statement_${idx}`] ?? -1) === scaleIdx
                                  ? TS_COLORS.black
                                  : TS_COLORS.white,
                              color:
                                (currentResponse.data?.[`statement_${idx}`] ?? -1) === scaleIdx
                                  ? TS_COLORS.white
                                  : TS_COLORS.mediumGray,
                              borderColor: TS_COLORS.lightBorder,
                            }}
                            title={label}
                          >
                            <span className="hidden sm:inline">{label}</span>
                            <span className="sm:hidden">{scaleIdx + 1}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : scenario.type === 'checklist' && scenario.options ? (
                // Checklist
                <div className="space-y-4">
                  {scenario.options.map((option, idx) => (
                    <label key={idx} className="flex items-start gap-4 cursor-pointer group p-4 rounded-2xl transition" style={{ backgroundColor: (currentResponse.data?.selected_options || []).includes(idx) ? TS_COLORS.lightGray : 'transparent' }}>
                      <div className="relative mt-1 flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={(currentResponse.data?.selected_options || []).includes(idx)}
                          onChange={(e) => {
                            const data = currentResponse.data || {};
                            const selected = data.selected_options || [];
                            if (e.target.checked) {
                              selected.push(idx);
                            } else {
                              selected.splice(selected.indexOf(idx), 1);
                            }
                            data.selected_options = selected;
                            updateResponse(scenario.id, currentResponse.text || '', data);
                          }}
                          className="w-5 h-5 rounded"
                          style={{ accentColor: TS_COLORS.black }}
                        />
                      </div>
                      <span style={{ color: TS_COLORS.black }} className="text-base leading-relaxed group-hover:font-semibold transition font-medium">
                        {option}
                      </span>
                    </label>
                  ))}
                </div>
              ) : scenario.type === 'role_play_mc' && scenario.options?.length ? (
                // Role-Play Multiple Choice — large pill cards
                <div className="space-y-4">
                  <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold uppercase tracking-wide mb-6">
                    Selecciona tu respuesta
                  </p>
                  {scenario.options.map((option, idx) => {
                    const isSelected = currentResponse.data?.selected_option === idx;
                    return (
                      <button
                        key={idx}
                        onMouseEnter={() => {
                          interactionLog.current.push({ type: 'option_hovered', ts: Date.now(), detail: `option_${idx}` });
                        }}
                        onClick={() => {
                          if (currentResponse.data?.selected_option !== undefined && currentResponse.data?.selected_option !== idx) {
                            interactionLog.current.push({ type: 'answer_changed', ts: Date.now(), detail: `from_${currentResponse.data?.selected_option}_to_${idx}` });
                          } else if (currentResponse.data?.selected_option === undefined) {
                            interactionLog.current.push({ type: 'option_clicked', ts: Date.now(), detail: `option_${idx}` });
                          }
                          updateResponse(scenario.id, option, { selected_option: idx });
                          saveResponse(scenario.id, false);
                        }}
                        className="w-full text-left p-6 rounded-2xl border-2 transition-all duration-200 select-none hover:shadow-md"
                        style={{
                          borderColor: isSelected ? TS_COLORS.black : TS_COLORS.lightBorder,
                          backgroundColor: isSelected ? '#F3F4F6' : TS_COLORS.white,
                        }}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition"
                            style={{
                              borderColor: isSelected ? TS_COLORS.black : TS_COLORS.lightBorder,
                              backgroundColor: isSelected ? TS_COLORS.black : TS_COLORS.white,
                            }}
                          >
                            {isSelected && (
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span
                            className="text-base leading-relaxed font-semibold transition"
                            style={{ color: isSelected ? TS_COLORS.black : TS_COLORS.mediumGray }}
                          >
                            {option}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {isSaving && (
                    <p style={{ color: TS_COLORS.black }} className="text-xs font-semibold text-right mt-3">
                      Guardando...
                    </p>
                  )}
                </div>
              ) : (
                // Text/Textarea (role_play, numerical, english, creative)
                <div>
                  <label style={{ color: TS_COLORS.black }} className="block text-base font-semibold mb-4">
                    Tu respuesta
                  </label>
                  <textarea
                    value={currentResponse.text}
                    onChange={(e) => updateResponse(scenario.id, e.target.value)}
                    onBlur={() => saveResponse(scenario.id, false)}
                    placeholder="Escribe tu respuesta aquí..."
                    className="w-full min-h-[240px] px-6 py-4 border rounded-2xl bg-white text-base focus:outline-none focus:ring-2 resize-vertical select-none"
                    style={{
                      borderColor: TS_COLORS.lightBorder,
                      color: TS_COLORS.black,
                      '--tw-ring-color': TS_COLORS.black,
                    } as React.CSSProperties}
                  />
                  <div className="mt-4 flex items-center justify-between text-xs" style={{ color: TS_COLORS.mediumGray }}>
                    <span>{currentResponse.text.length} caracteres</span>
                    {isSaving && <span style={{ color: TS_COLORS.black }} className="font-semibold">Guardando...</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <button
                onClick={handlePrevious}
                disabled={currentScenarioIndex === 0}
                className="flex-1 py-4 px-6 font-bold rounded-full transition-all duration-300 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  color: currentScenarioIndex === 0 ? TS_COLORS.mediumGray : TS_COLORS.black,
                  backgroundColor: TS_COLORS.lightGray,
                }}
              >
                Anterior
              </button>

              <button
                onClick={() => saveResponse(scenario.id, false)}
                disabled={isSaving}
                className="flex-1 py-4 px-6 font-bold rounded-full transition-all duration-300 hover:shadow-md disabled:opacity-50"
                style={{
                  color: TS_COLORS.black,
                  backgroundColor: TS_COLORS.lightGray,
                }}
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>

              <button
                onClick={handleNext}
                className="flex-1 py-4 px-6 text-white font-bold rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
                style={{ backgroundColor: TS_COLORS.black }}
              >
                {currentScenarioIndex === scenarios.length - 1 ? 'Revisar' : 'Siguiente'}
              </button>
            </div>
          </div>
        </div>

        {/* Camera Preview - Bottom Right Corner */}
        {cameraEnabled && (
          <div className="fixed bottom-8 right-8 z-30">
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-black" style={{ boxShadow: `0 0 0 2px ${TS_COLORS.white}, 0 0 0 4px ${TS_COLORS.success}` }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: TS_COLORS.success }}></div>
            </div>
          </div>
        )}

        {/* Hidden Canvas for Snapshots */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Footer */}
        <div className="text-center text-xs px-6 py-6" style={{ color: TS_COLORS.mediumGray }}>
          Powered by ELEVARE Career
        </div>
      </div>
    );
  }

  // Render review phase
  if (phase === 'review' && assessmentData) {
    const scenarios = assessmentData.scenarios;

    // Group scenarios by block
    const scenariosByBlock: Record<string, Scenario[]> = {};
    scenarios.forEach((s) => {
      if (!scenariosByBlock[s.block]) {
        scenariosByBlock[s.block] = [];
      }
      scenariosByBlock[s.block].push(s);
    });

    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        {/* Header */}
        <div className="border-b" style={{ borderColor: TS_COLORS.lightBorder }}>
          <div className="max-w-5xl mx-auto px-6 py-6">
            <h1 style={{ color: TS_COLORS.black }} className="text-3xl sm:text-4xl font-bold">
              Revisa tus respuestas
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-12">
          <div className="max-w-4xl mx-auto space-y-12">
            {Object.entries(scenariosByBlock).map(([block, blockScenarios]) => {
              const blockInfo = BLOCK_INFO[block as keyof typeof BLOCK_INFO];
              return (
                <div key={block}>
                  <div className="flex items-center gap-3 mb-8">
                    <div className={`w-10 h-10 rounded-lg ${blockInfo.color} ${blockInfo.textColor} flex items-center justify-center text-sm font-bold`}>
                      {['cognitivo', 'comportamental', 'caracter', 'bienestar_trayectoria'].indexOf(block) + 1}
                    </div>
                    <h2 style={{ color: TS_COLORS.black }} className="text-xl font-bold">
                      {blockInfo.label}
                    </h2>
                  </div>

                  <div className="space-y-4">
                    {blockScenarios.map((scenario) => {
                      const resp = responses[scenario.id];
                      const hasResponse = resp && resp.text.trim();

                      return (
                        <button
                          key={scenario.id}
                          onClick={() => {
                            setCurrentScenarioIndex(scenarios.indexOf(scenario));
                            setPhase('assessment');
                          }}
                          className="w-full rounded-2xl p-6 border text-left transition-all duration-200 hover:shadow-md hover:-translate-y-1"
                          style={{ backgroundColor: TS_COLORS.lightGray, borderColor: TS_COLORS.lightBorder }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 style={{ color: TS_COLORS.black }} className="font-bold mb-2">
                                Pregunta {scenarios.indexOf(scenario) + 1}
                              </h3>
                              <p style={{ color: TS_COLORS.mediumGray }} className="text-sm line-clamp-2">
                                {scenario.scenario_text.substring(0, 100)}...
                              </p>
                            </div>
                            <div className="flex-shrink-0">
                              {hasResponse ? (
                                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#166534' }}></span>
                                  Respondida
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#92400E' }}></span>
                                  Sin respuesta
                                </span>
                              )}
                            </div>
                          </div>
                          {resp && resp.text && (
                            <div className="mt-4 p-4 rounded-xl text-sm line-clamp-2" style={{ backgroundColor: TS_COLORS.white, color: TS_COLORS.mediumGray }}>
                              {resp.data?.selected_option !== undefined ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0 font-bold" style={{ backgroundColor: TS_COLORS.black }}>
                                    {String.fromCharCode(65 + resp.data.selected_option)}
                                  </span>
                                  {resp.text}
                                </span>
                              ) : (
                                resp.text
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit Button */}
        <div className="border-t px-6 py-10" style={{ borderColor: TS_COLORS.lightBorder }}>
          <div className="max-w-4xl mx-auto">
            <button
              onClick={handleCompleteAssessment}
              className="w-full text-white font-bold py-4 rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
              style={{ backgroundColor: TS_COLORS.black }}
            >
              Finalizar evaluación
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs px-6 py-6" style={{ color: TS_COLORS.mediumGray }}>
          Powered by ELEVARE Career
        </div>
      </div>
    );
  }

  // Render complete phase
  if (phase === 'complete') {
    // ── PREVIEW MODE: muestra reporte con benchmarks ──
    if (isPreview && previewReport) {
      const r = previewReport as {
        by_dimension?: Record<string, { score: number; benchmark_mean: number; benchmark_std: number; vs_mean: number; status: string; n_scenarios: number }>;
        overall_match?: number;
        ts_dna_summary?: string;
        ts_dna_traits?: Array<{ trait: string; direction: string; benchmark: number; note: string }>;
        responses_count?: number;
        scenarios_total?: number;
      };
      const dims = Object.entries(r.by_dimension ?? {});
      // Ordenar: in_range primero, luego over, luego under
      dims.sort((a, b) => {
        const order = { in_range: 0, over: 1, under: 2, no_benchmark: 3 } as Record<string, number>;
        return (order[a[1].status] ?? 4) - (order[b[1].status] ?? 4);
      });
      return (
        <div className="min-h-screen" style={{ backgroundColor: TS_COLORS.offWhite, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
          <div className="max-w-4xl mx-auto px-6 py-10">
            <div className="mb-8">
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: TS_COLORS.mediumGray }}>Preview · Reporte interno</div>
              <h1 className="text-3xl font-bold mb-2" style={{ color: TS_COLORS.black }}>Resultado de la evaluación</h1>
              <p style={{ color: TS_COLORS.mediumGray }}>{r.ts_dna_summary}</p>
            </div>

            {/* Match overall */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl p-5 border" style={{ backgroundColor: TS_COLORS.white, borderColor: TS_COLORS.lightBorder }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: TS_COLORS.mediumGray }}>Match TS DNA</div>
                <div className="text-4xl font-bold mt-1">{r.overall_match ?? 0}%</div>
                <div className="text-xs mt-1" style={{ color: TS_COLORS.mediumGray }}>vs top performers benchmark</div>
              </div>
              <div className="rounded-2xl p-5 border" style={{ backgroundColor: TS_COLORS.white, borderColor: TS_COLORS.lightBorder }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: TS_COLORS.mediumGray }}>Escenarios respondidos</div>
                <div className="text-4xl font-bold mt-1">{r.responses_count ?? 0} / {r.scenarios_total ?? 29}</div>
                <div className="text-xs mt-1" style={{ color: TS_COLORS.mediumGray }}>cobertura del test</div>
              </div>
              <div className="rounded-2xl p-5 border" style={{ backgroundColor: TS_COLORS.white, borderColor: TS_COLORS.lightBorder }}>
                <div className="text-xs uppercase tracking-widest" style={{ color: TS_COLORS.mediumGray }}>Anti-trampa</div>
                <div className="text-4xl font-bold mt-1">{tabSwitchCount}</div>
                <div className="text-xs mt-1" style={{ color: TS_COLORS.mediumGray }}>tab switches · cámara {cameraEnabled ? 'activa' : 'no'}</div>
              </div>
            </div>

            {/* Dimensiones */}
            <div className="rounded-2xl p-6 border mb-6" style={{ backgroundColor: TS_COLORS.white, borderColor: TS_COLORS.lightBorder }}>
              <h2 className="text-lg font-bold mb-4" style={{ color: TS_COLORS.black }}>Dimensiones psicométricas vs benchmark TS</h2>
              <div className="space-y-2">
                {dims.map(([dim, d]) => {
                  const color = d.status === 'in_range' ? '#22C55E' : d.status === 'over' ? '#3B82F6' : d.status === 'under' ? '#EF4444' : '#9CA3AF';
                  const label = d.status === 'in_range' ? 'En rango' : d.status === 'over' ? 'Sobre benchmark' : d.status === 'under' ? 'Bajo benchmark' : 'Sin ref';
                  return (
                    <div key={dim} className="grid items-center gap-3 py-2 border-b" style={{ gridTemplateColumns: '180px 1fr 80px 90px 70px', borderColor: TS_COLORS.lightBorder }}>
                      <div className="text-sm font-medium" style={{ color: TS_COLORS.darkText }}>{dim}</div>
                      <div className="h-2 rounded-full overflow-hidden relative" style={{ backgroundColor: TS_COLORS.lightGray }}>
                        <div className="absolute h-full" style={{ width: `${Math.min(100, (d.score / Math.max(d.benchmark_mean * 1.5, 1)) * 100)}%`, backgroundColor: color }} />
                        <div className="absolute h-full w-px" style={{ left: `${Math.min(100, (d.benchmark_mean / Math.max(d.benchmark_mean * 1.5, 1)) * 100)}%`, backgroundColor: TS_COLORS.darkText }} title="benchmark" />
                      </div>
                      <div className="text-sm font-bold text-right">{d.score}</div>
                      <div className="text-xs text-right" style={{ color: TS_COLORS.mediumGray }}>μ={d.benchmark_mean}</div>
                      <div className="text-[10px] uppercase font-semibold text-right" style={{ color }}>{label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] mt-3" style={{ color: TS_COLORS.mediumGray }}>
                Línea vertical = media TS top performers · Barra = score del run · {dims.length} dimensiones medidas con {r.responses_count} respuestas.
              </div>
            </div>

            <div className="flex gap-2">
              <a href="/hr-admin" className="px-6 py-3 rounded-full text-sm font-semibold border" style={{ borderColor: TS_COLORS.lightBorder, color: TS_COLORS.darkText }}>← Volver al HR Admin</a>
              <a href="/assessment/ht/preview" className="px-6 py-3 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: TS_COLORS.black }}>Correr de nuevo</a>
            </div>
            <div className="text-center text-xs mt-8" style={{ color: TS_COLORS.mediumGray }}>
              Datos guardados en assessment_preview_responses · session {previewSessionRef.current.slice(0, 16)}…
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: TS_COLORS.white, fontFamily: TS_TYPOGRAPHY.fontFamily }}>
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center" style={{ backgroundColor: '#DCFCE7' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ color: TS_COLORS.black }} className="text-4xl font-bold mb-4">
            ¡Listo!
          </h1>
          <p style={{ color: TS_COLORS.mediumGray }} className="text-lg leading-relaxed mb-12">
            Tu evaluación ha sido enviada. Te contactaremos pronto con los resultados.
          </p>

          <div className="rounded-2xl p-6 mb-12 border" style={{ backgroundColor: TS_COLORS.lightGray, borderColor: TS_COLORS.lightBorder }}>
            <p style={{ color: TS_COLORS.mediumGray }} className="text-xs font-semibold uppercase tracking-wide mb-2">
              Próximo paso
            </p>
            <p style={{ color: TS_COLORS.black }} className="text-base font-medium">
              Nos pondremos en contacto contigo en breve.
            </p>
          </div>

          <a
            href="/"
            className="inline-block px-10 py-4 text-white font-bold rounded-full hover:shadow-lg transition-all duration-300 hover:scale-105"
            style={{ backgroundColor: TS_COLORS.black }}
          >
            Volver al inicio
          </a>
        </div>

        <div className="text-center text-xs mt-16 absolute bottom-8 left-0 right-0 px-6" style={{ color: TS_COLORS.mediumGray }}>
          Powered by ELEVARE Career
        </div>
      </div>
    );
  }

  return null;
}
