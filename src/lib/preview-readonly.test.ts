import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPreviewMutationBlocked, isPreviewReadonlyBlocked } from "./preview-readonly";

describe("preview read-only", () => {
  it("leaves production and local requests alone", () => {
    for (const vercelEnv of ["production", undefined, "development"]) {
      assert.equal(
        isPreviewReadonlyBlocked({
          vercelEnv,
          method: "POST",
          pathname: "/api/headhunting/candidates/abc/stage",
        }),
        false,
      );
      assert.equal(isPreviewMutationBlocked(vercelEnv), false);
    }
  });

  it("blocks HR Admin mutations on preview, including stage, prefilter, and invite", () => {
    for (const pathname of [
      "/api/headhunting/candidates/abc/stage",
      "/api/headhunting/candidates/abc/send-prefilter",
      "/api/headhunting/candidates/invite",
      "/api/admin/candidates/abc/send-calendly",
      "/api/admin/informe-vacante/v1/borrador",
      "/api/bateria/enviar",
      "/api/applications",
    ]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        assert.equal(
          isPreviewReadonlyBlocked({ vercelEnv: "preview", method, pathname }),
          true,
          `${method} ${pathname}`,
        );
      }
    }
    assert.equal(isPreviewMutationBlocked("preview"), true);
  });

  it("still allows the HR login cookie and ordinary reads", () => {
    assert.equal(
      isPreviewReadonlyBlocked({
        vercelEnv: "preview",
        method: "POST",
        pathname: "/api/hr-admin/login",
      }),
      false,
    );
    assert.equal(
      isPreviewReadonlyBlocked({
        vercelEnv: "preview",
        method: "DELETE",
        pathname: "/api/hr-admin/login/",
      }),
      false,
    );
    assert.equal(
      isPreviewReadonlyBlocked({
        vercelEnv: "preview",
        method: "GET",
        pathname: "/api/headhunting/candidates",
      }),
      false,
    );
    assert.equal(
      isPreviewReadonlyBlocked({
        vercelEnv: "preview",
        method: "OPTIONS",
        pathname: "/api/headhunting/candidates/abc/stage",
      }),
      false,
    );
  });

  it("blocks preview cron and OAuth GETs that would send mail or change tokens", () => {
    for (const pathname of [
      "/api/cron/run-reminders",
      "/api/cron/digest-email",
      "/api/google/auth",
      "/api/google/callback",
      "/api/linkedin/auth",
    ]) {
      assert.equal(
        isPreviewReadonlyBlocked({ vercelEnv: "preview", method: "GET", pathname }),
        true,
        pathname,
      );
    }
    assert.equal(
      isPreviewReadonlyBlocked({
        vercelEnv: "preview",
        method: "GET",
        pathname: "/api/google/status",
      }),
      false,
    );
  });
});
