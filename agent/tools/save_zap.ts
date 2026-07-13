import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { saveZapRecipe } from "../../lib/save-zap.js";
import { parseZapMarkdown } from "../../lib/zap-schema.js";

export default defineTool({
  description: "Validate and return an approved Zap.md recipe to Studio, packaging it as an Eve skill when running locally.",
  inputSchema: z.object({
    markdown: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
  }),
  approval: always(),
  async execute({ markdown, slug }) {
    const spec = parseZapMarkdown(markdown);
    if (spec.zap !== slug) {
      throw new Error(`Zap slug mismatch: frontmatter declares ${spec.zap}, tool input was ${slug}.`);
    }
    return saveZapRecipe({ description: spec.description, markdown, slug });
  },
});
