import { startBrokerLogin } from "@/lib/auth-broker";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const payload = await startBrokerLogin();
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to start broker sign-in." },
      { status: 503 },
    );
  }
}