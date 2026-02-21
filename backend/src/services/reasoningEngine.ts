import { z } from 'zod';

import type { ApiMap } from './perception/apiParser';
import type { DbSchemaMap } from './perception/dbSchemaParser';
import type { LogAnalysisResult } from './perception/logAnalyzer';
import type { UiElementMap } from './perception/uiElementDetector';
import type { UserStoryMap } from './perception/userStoryParser';

export type ReasoningInput = {
  uiMap?: UiElementMap | null;
  apiMap?: ApiMap | null;
  dbSchema?: DbSchemaMap | null;
  userStories?: UserStoryMap | string | null;
  logs?: LogAnalysisResult | string | null;
};

export type ReasoningOutput = {
  criticalRisks: string[];
  testingPriority: string[];
  recommendations: string[];
};

const outputSchema = z.object({
  criticalRisks: z.array(z.string()).default([]),
  testingPriority: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

const RESPONSE_JSON_SCHEMA = {
  name: 'qa_reasoning_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['criticalRisks', 'testingPriority', 'recommendations'],
    properties: {
      criticalRisks: {
        type: 'array',
        items: { type: 'string' },
      },
      testingPriority: {
        type: 'array',
        items: { type: 'string' },
      },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
} as const;

const EMPTY_OUTPUT: ReasoningOutput = {
  criticalRisks: [],
  testingPriority: [],
  recommendations: [],
};

function safeParseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch (error) {
    return '{}';
  }
}

function toReasoningOutput(value: unknown): ReasoningOutput {
  const parsed = outputSchema.safeParse(value);
  if (!parsed.success) {
    return EMPTY_OUTPUT;
  }
  return parsed.data;
}

function normalizeUserStories(userStories?: UserStoryMap | string | null): string {
  if (!userStories) return '';
  if (typeof userStories === 'string') return userStories;
  return safeStringify(userStories);
}

function normalizeLogs(logs?: LogAnalysisResult | string | null): string {
  if (!logs) return '';
  if (typeof logs === 'string') return logs;
  return safeStringify(logs);
}

export async function reasoningEngine(input: ReasoningInput): Promise<ReasoningOutput> {
  const apiKey =
    process.env.OPENAI_API_KEY
    || process.env.OPENAI_KEY
    || process.env.OPENAI_FAILURE_ANALYZER_API_KEY;
  if (!apiKey) {
    return EMPTY_OUTPUT;
  }

  const model = process.env.OPENAI_REASONING_MODEL || 'gpt-4o';
  const timeoutMs = Number(process.env.OPENAI_REASONING_TIMEOUT_MS || 25000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const userPrompt = [
    'Act as a senior QA architect. Identify risk areas, missing validations, critical flows, and testing priorities.',
    '',
    'CONTEXT: UI MAP',
    safeStringify(input.uiMap ?? {}),
    '',
    'CONTEXT: API MAP',
    safeStringify(input.apiMap ?? {}),
    '',
    'CONTEXT: DB SCHEMA',
    safeStringify(input.dbSchema ?? {}),
    '',
    'CONTEXT: USER STORIES',
    normalizeUserStories(input.userStories),
    '',
    'CONTEXT: LOGS',
    normalizeLogs(input.logs),
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Return strict JSON only. No markdown, no code fences, no extra keys.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_JSON_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      return EMPTY_OUTPUT;
    }

    const payload = await response.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      return EMPTY_OUTPUT;
    }

    return toReasoningOutput(safeParseJson(content));
  } catch (error) {
    return EMPTY_OUTPUT;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

