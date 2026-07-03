import { NextResponse } from "next/server";
import { readZapSkill } from "@/lib/zap-skills";

export async function GET(request: Request, { params }: { readonly params: Promise<{ skill: string }> }) {
  const { skill } = await params;
  const loaded = await readZapSkill(skill);
  if (!loaded) {
    return NextResponse.json({ error: `Unknown Zap skill ${skill}.` }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format");
  if (format === "json") {
    return NextResponse.json({
      content: loaded.content,
      skill: loaded.entry,
    });
  }

  return new NextResponse(loaded.content, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-zap-skill-hash": loaded.entry.hash,
    },
  });
}
