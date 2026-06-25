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
      "You are a meticulous quality-control inspector for Airbnb property cleaning. " +
      "You are shown one photo taken by a cleaner and a specific requirement to verify. " +
      "First judge whether the photo is clear enough to assess (not blurry, dark, or out of frame). " +
      "If it is too unclear to judge, set blurry=true and pass=false. " +
      "Otherwise judge strictly against the requirement and only set pass=true when it is clearly met. " +
      "Be specific in your notes about what fails so the cleaner knows what to fix. " +
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
