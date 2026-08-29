import type {
  ApiErrorCode,
  ApiErrorPayload,
  ApiResult,
  CredentialListItem,
  CredentialStatusFilter,
  InstitutionProfile,
  IssueCredentialInput,
  IssuedCredential,
  ListCredentialsResult,
  RevokeCredentialResult,
  SaveInstitutionInput,
  VerificationResult,
  VerifyApiResult,
  WalletConnection,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "/api/v1";

const USER_FACING_FALLBACKS: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: "The credential ID format is not valid.",
  UNAUTHENTICATED: "Connect your issuer wallet to do that.",
  ISSUER_NOT_AUTHORIZED: "This wallet is not authorized to issue for this institution.",
  NOT_FOUND: "No credential was found for this public ID.",
  CREDENTIAL_ALREADY_REVOKED: "This credential has already been revoked.",
  DUPLICATE_CREDENTIAL: "A credential with this identifier already exists.",
  RATE_LIMITED: "Too many attempts. Please wait and try again.",
  PROOF_SERVICE_UNAVAILABLE:
    "Could not generate a proof. This is our service issue, not a problem with the credential.",
  CHAIN_UNAVAILABLE:
    "The Midnight network services are unavailable. This is our service issue, not a problem with the credential.",
  UNKNOWN_ERROR:
    "The request could not be completed. This is a service issue, not a rejection of the credential.",
};

// ---------------------------------------------------------------------------
// Public verification
// ---------------------------------------------------------------------------

export async function verifyCredential(
  credentialId: string,
  options: { discloseGpa?: boolean; signal?: AbortSignal } = {},
): Promise<VerifyApiResult> {
  const params = new URLSearchParams();

  if (options.discloseGpa) {
    params.set("disclose", "gpa");
  }

  const url = `${API_BASE_URL}/verify/${encodeURIComponent(credentialId)}${
    params.size > 0 ? `?${params.toString()}` : ""
  }`;

  return request<VerificationResult>(url, { signal: options.signal });
}

export function buildIndexerQuery(contractAddress: string) {
  return `query {
  contractAction(address: "${contractAddress}") {
    __typename
  }
}`;
}

// ---------------------------------------------------------------------------
// Dashboard: issued credential registry
// ---------------------------------------------------------------------------

export async function listCredentials(
  wallet: WalletConnection,
  params: {
    search?: string;
    status?: CredentialStatusFilter;
    signal?: AbortSignal;
  } = {},
): Promise<ApiResult<ListCredentialsResult>> {
  const query = new URLSearchParams();

  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.status && params.status !== "ALL") query.set("status", params.status);

  const url = `${API_BASE_URL}/credentials${
    query.size > 0 ? `?${query.toString()}` : ""
  }`;

  return request<ListCredentialsResult>(url, {
    signal: params.signal,
    headers: issuerHeaders(wallet),
  });
}

// ---------------------------------------------------------------------------
// Dashboard: issue credential
// ---------------------------------------------------------------------------

export async function issueCredential(
  input: IssueCredentialInput,
  wallet: WalletConnection,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<IssuedCredential>> {
  return request<IssuedCredential>(`${API_BASE_URL}/credentials`, {
    method: "POST",
    signal: options.signal,
    headers: issuerHeaders(wallet),
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Dashboard: revoke credential
// ---------------------------------------------------------------------------

export async function revokeCredential(
  credentialId: string,
  wallet: WalletConnection,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<RevokeCredentialResult>> {
  return request<RevokeCredentialResult>(
    `${API_BASE_URL}/credentials/${encodeURIComponent(credentialId)}/revoke`,
    {
      method: "POST",
      signal: options.signal,
      headers: issuerHeaders(wallet),
    },
  );
}

// ---------------------------------------------------------------------------
// Dashboard: certificate download
// ---------------------------------------------------------------------------

export async function downloadCertificate(
  credential: CredentialListItem,
  wallet: WalletConnection,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = `${API_BASE_URL}/credentials/${encodeURIComponent(
    credential.id,
  )}/certificate`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/pdf", ...issuerHeaders(wallet) },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = getApiError(payload, response.status);
      return { ok: false, message: error.message };
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${credential.studentName.replace(/\s+/g, "-").toLowerCase()}-certificate.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);

    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "The certificate could not be downloaded. Check your connection and try again.",
    };
  }
}

// ---------------------------------------------------------------------------
// Institutions: onboarding / authorization
// ---------------------------------------------------------------------------

export async function getInstitutionProfile(
  wallet: WalletConnection,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<InstitutionProfile>> {
  return request<InstitutionProfile>(`${API_BASE_URL}/institutions/me`, {
    signal: options.signal,
    headers: issuerHeaders(wallet),
  });
}

export async function saveInstitutionProfile(
  input: SaveInstitutionInput,
  wallet: WalletConnection,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<InstitutionProfile>> {
  return request<InstitutionProfile>(`${API_BASE_URL}/institutions/me`, {
    method: "PUT",
    signal: options.signal,
    headers: issuerHeaders(wallet),
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Shared request plumbing
// ---------------------------------------------------------------------------

/**
 * Issuer auth is a stretch goal pending real wallet-signature verification
 * from the backend/chain-service. This header carries the connected
 * address so the API can authorize by issuer identity today; swap the
 * body of this function for a signed-challenge scheme without touching
 * any call site once that's ready. No witness data or secrets are ever
 * sent — only the public wallet address.
 */
function issuerHeaders(wallet: WalletConnection): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Issuer-Address": wallet.address,
  };
}

async function request<T>(
  url: string,
  init: { method?: string; headers?: HeadersInit; body?: BodyInit; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: { Accept: "application/json", ...init.headers },
      body: init.body,
      signal: init.signal,
    });
    const payload: unknown = await response.json().catch(() => null);

    if (response.ok) {
      return { ok: true, data: payload as T };
    }

    return {
      ok: false,
      status: response.status,
      error: getApiError(payload, response.status),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    return {
      ok: false,
      status: 0,
      error: {
        code: "UNKNOWN_ERROR",
        message: USER_FACING_FALLBACKS.UNKNOWN_ERROR,
      },
    };
  }
}

function getApiError(payload: unknown, status: number): ApiErrorPayload["error"] {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
  ) {
    const candidate = payload.error as {
      code?: ApiErrorCode;
      message?: string;
      requestId?: string;
    };
    const code = candidate.code || codeFromStatus(status);

    return {
      code,
      message: candidate.message || USER_FACING_FALLBACKS[code],
      requestId: candidate.requestId,
    };
  }

  const code = codeFromStatus(status);

  return {
    code,
    message: USER_FACING_FALLBACKS[code],
  };
}

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "DUPLICATE_CREDENTIAL";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "PROOF_SERVICE_UNAVAILABLE";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "ISSUER_NOT_AUTHORIZED";
  if (status === 400) return "VALIDATION_ERROR";

  return "UNKNOWN_ERROR";
}
