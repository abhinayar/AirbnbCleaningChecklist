import Anthropic from "@anthropic-ai/sdk";

// Constructed lazily so importing this module during `next build` (no env yet)
// doesn't throw on a missing API key.
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}

const MODEL = process.env.QC_MODEL || "claude-opus-4-8";

export type QcResult = {
  blurry: boolean;
  pass: boolean;
  confidence: number; // 0..1
  notes: string;
};

// Structured-output schema. Constraints like min/max aren't supported by the
// structured-outputs feature, so we keep it to plain types + additionalProperties:false.
const QC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    blurry: {
      type: "boolean",
      description:
        "True if the photo is too blurry, dark, or out of focus to judge the cleaning quality.",
    },
    pass: {
      type: "boolean",
      description:
        "True only if the photo clearly satisfies the QC requirement AND is not blurry.",
    },
    confidence: {
      type: "number",
      description: "Confidence in the pass/fail decision, from 0.0 to 1.0.",
    },
    notes: {
      type: "string",
      description:
        "One or two sentences explaining the decision: what looks good, or exactly what fails QC.",
    },
  },
  required: ["blurry", "pass", "confidence", "notes"],
} as const;

/**
 * Run a blur + QC check on a single photo against an item-specific requirement.
 * `jpegBuffer` must be a JPEG (we normalize uploads to JPEG before calling this).
 */
export async function runQc(
  jpegBuffer: Buffer,
  itemTitle: string,
  qcPrompt: string,
): Promise<QcResult> {
  const base64 = jpegBuffer.toString("base64");

  // Force the model to return its verdict via a single tool call — this gives us
  // guaranteed structured output without depending on newer SDK-only params.
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You are doing a light, practical quality check on a cleaner's photo for a short-term rental. " +
      "These are real working photos taken quickly on phones, often in imperfect lighting, angles, and focus. " +
      "Be lenient and reasonable — your DEFAULT is to PASS. " +
      "Only set pass=false when there is a clear, obvious problem a guest would plainly notice in the photo: " +
      "e.g. visible hair in a tub/sink/shower, trash or food debris, obvious stains or spills, a clearly unmade or messy bed, " +
      "or items left strewn about. " +
      "Do NOT fail for minor or subjective things: slight wrinkles, dim or uneven lighting, reflections, camera angle, " +
      "normal wear and tear, small water spots, or anything you're unsure about. When in doubt, pass. " +
      "Only set blurry=true if the photo is genuinely too blurry or dark to tell what's going on — not merely a bit soft. " +
      "Keep notes short and constructive: you may mention small things worth improving even when you pass. " +
      "Always report your verdict by calling the report_qc tool.",
    tools: [
      {
        name: "report_qc",
        description: "Report the blur + QC verdict for the inspected photo.",
        input_schema: QC_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "report_qc" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: base64 },
          },
          {
            type: "text",
            text:
              `Checklist item: ${itemTitle}\n` +
              `QC requirement: ${qcPrompt}\n\n` +
              "Inspect the photo and report whether it passes.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");

  try {
    if (!toolUse || !("input" in toolUse)) throw new Error("no tool_use");
    const parsed = toolUse.input as QcResult;
    return {
      blurry: Boolean(parsed.blurry),
      pass: Boolean(parsed.pass) && !parsed.blurry,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0,
      notes: String(parsed.notes ?? ""),
    };
  } catch {
    // If structured output somehow failed to parse, treat as an inconclusive fail
    // so a human notices rather than silently passing.
    return {
      blurry: false,
      pass: false,
      confidence: 0,
      notes: "QC check could not be completed automatically. Please review manually.",
    };
  }
}
