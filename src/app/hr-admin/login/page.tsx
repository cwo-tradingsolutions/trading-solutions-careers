import React from "react";
import HRLoginForm from "./login-form";
import { passwordLoginAllowed } from "@/lib/hr-admin-session-format";

// Se decide en cada request: con el flag apagado el formulario de clave no llega al HTML.
export const dynamic = "force-dynamic";

export default function HRLoginPage() {
  return <HRLoginForm passwordLogin={passwordLoginAllowed(process.env.HR_ADMIN_PASSWORD_LOGIN_ENABLED)} />;
}
