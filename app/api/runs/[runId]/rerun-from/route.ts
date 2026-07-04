import { NextResponse } from "next/server";
import { z } from "zod";
import { rerunZapRunFromStep } from "@/lib/zap-runner-server";
import { toZapErrorPayload } from "@/lib/zap-errors";

const bodySchema = z.object({
  comment: z.string().optional(),
  stepId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const snapshot = await rerunZapRunFromStep(runId, body.stepId, body.comment);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: toZapErrorPayload(error) }, { status: 400 });
  }
}
