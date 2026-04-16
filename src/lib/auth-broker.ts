type BrokerStartResponse = {
  requestId: string;
  authorizeUrl: string;
  expiresAt: string;
  pollIntervalMs: number;
};

type BrokerStatusResponse = {
  requestId: string;
  status: "pending" | "approved" | "expired" | "consumed";
  expiresAt: string;
};

type BrokerExchangeResponse = {
  requestId: string;
  identity: {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };
};

function getBrokerBaseUrl() {
  const value = process.env.AUTH_BROKER_BASE_URL?.trim();

  if (!value) {
    return null;
  }

  return value.replace(/\/$/, "");
}

async function brokerFetch(path: string, init?: RequestInit) {
  const baseUrl = getBrokerBaseUrl();

  if (!baseUrl) {
    throw new Error("Auth broker is not configured.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = `Broker request failed with ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      errorMessage = payload.error ?? errorMessage;
    } catch {
      // Ignore broker response parsing failures and use the default message.
    }

    throw new Error(errorMessage);
  }

  return response;
}

export function isBrokerAuthConfigured() {
  return Boolean(getBrokerBaseUrl());
}

export async function startBrokerLogin() {
  const response = await brokerFetch("/api/login/start", { method: "POST" });
  return (await response.json()) as BrokerStartResponse;
}

export async function getBrokerLoginStatus(requestId: string) {
  const response = await brokerFetch(`/api/login/status/${encodeURIComponent(requestId)}`);
  return (await response.json()) as BrokerStatusResponse;
}

export async function exchangeBrokerLogin(requestId: string) {
  const response = await brokerFetch("/api/login/exchange", {
    method: "POST",
    body: JSON.stringify({ requestId }),
  });
  return (await response.json()) as BrokerExchangeResponse;
}