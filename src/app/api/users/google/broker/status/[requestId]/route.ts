import { getBrokerLoginStatus } from "@/lib/auth-broker";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { requestId } = await context.params;
    const payload = await getBrokerLoginStatus(requestId);
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to check broker sign-in status." },
      { status: 503 },
    );
  }
}