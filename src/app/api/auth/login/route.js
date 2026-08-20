import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import { isOidcConfigured } from "@/lib/auth/oidc";
import { checkLock, getClientIp, recordFailure, recordSuccess } from "@/lib/auth/loginLimiter";
import { isLocalRequest } from "@/dashboardGuard";

const RESET_HINT = "Set INITIAL_PASSWORD or change the password from a trusted local session.";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function isTunnelRequest(request, settings) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const tunnelHost = settings.tunnelUrl ? new URL(settings.tunnelUrl).hostname.toLowerCase() : "";
  const tailscaleHost = settings.tailscaleUrl ? new URL(settings.tailscaleUrl).hostname.toLowerCase() : "";
  return (tunnelHost && host === tunnelHost) || (tailscaleHost && host === tailscaleHost);
}

export async function POST(request) {
  try {
    const clientIp = getClientIp(request);
    const lock = checkLock(clientIp);
    if (lock.locked) {
      return NextResponse.json(
        {
          error: `Too many failed attempts. Try again in ${lock.retryAfter}s. ${RESET_HINT}`,
          retryAfter: lock.retryAfter,
          resetHint: RESET_HINT,
        },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(lock.retryAfter) } },
      );
    }

    const { password } = await request.json();
    const settings = await getSettings();

    // Block login via tunnel/tailscale if dashboard access is disabled
    if (isTunnelRequest(request, settings) && settings.tunnelDashboardAccess !== true) {
      return NextResponse.json({ error: "Dashboard access via tunnel is disabled" }, { status: 403 });
    }

    // Default password is '123456' if not set
    const storedHash = settings.password;

    if (settings.authMode === "oidc" && isOidcConfigured(settings)) {
      return NextResponse.json({ error: "Password login is disabled. Use OIDC sign in." }, { status: 403 });
    }

    let isValid = false;
    if (storedHash) {
      isValid = await bcrypt.compare(password, storedHash);
    } else {
      // Use env var or default
      const initialPassword = process.env.INITIAL_PASSWORD || "123456";
      isValid = password === initialPassword;
    }

    if (isValid) {
      recordSuccess(clientIp);

      const mustChangePassword =
        !storedHash && !process.env.INITIAL_PASSWORD && !isLocalRequest(request);

      if (mustChangePassword) {
        return NextResponse.json(
          {
            success: false,
            error: "Default password must be changed before remote access. Change it locally or set INITIAL_PASSWORD.",
            mustChangePassword: true,
          },
          { status: 403, headers: NO_STORE_HEADERS },
        );
      }

      const cookieStore = await cookies();
      await setDashboardAuthCookie(cookieStore, request);

      return NextResponse.json(
        { success: true, mustChangePassword: false },
        { headers: NO_STORE_HEADERS },
      );
    }

    const { remainingBeforeLock } = recordFailure(clientIp);
    const postFailureLock = checkLock(clientIp);
    if (postFailureLock.locked) {
      return NextResponse.json(
        {
          error: `Too many failed attempts. Try again in ${postFailureLock.retryAfter}s. ${RESET_HINT}`,
          retryAfter: postFailureLock.retryAfter,
          resetHint: RESET_HINT,
        },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(postFailureLock.retryAfter) } },
      );
    }

    return NextResponse.json(
      {
        error: `Invalid password. ${remainingBeforeLock} attempt(s) left before lockout.`,
        remainingBeforeLock,
      },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
