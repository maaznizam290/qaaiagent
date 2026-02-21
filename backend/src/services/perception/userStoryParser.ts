import { z } from 'zod';

export type UserStoryMap = {
  actors: string[];
  flows: string[];
  validations: string[];
  edgeCases: string[];
};

const outputSchema = z.object({
  actors: z.array(z.string()).default([]),
  flows: z.array(z.string()).default([]),
  validations: z.array(z.string()).default([]),
  edgeCases: z.array(z.string()).default([]),
});

const RESPONSE_JSON_SCHEMA = {
  name: 'user_story_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['actors', 'flows', 'validations', 'edgeCases'],
    properties: {
      actors: {
        type: 'array',
        items: { type: 'string' },
      },
      flows: {
        type: 'array',
        items: { type: 'string' },
      },
      validations: {
        type: 'array',
        items: { type: 'string' },
      },
      edgeCases: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
} as const;

const EMPTY_RESULT: UserStoryMap = {
  actors: [],
  flows: [],
  validations: [],
  edgeCases: [],
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

function toUserStoryMap(value: unknown): UserStoryMap {
  const parsed = outputSchema.safeParse(value);
  if (!parsed.success) {
    return EMPTY_RESULT;
  }
  return parsed.data;
}

export async function userStoryParser(userStories?: string): Promise<UserStoryMap> {
  const normalizedStories = String(userStories || '').trim();
  if (!normalizedStories) {
    return EMPTY_RESULT;
  }

  const apiKey =
    process.env.OPENAI_API_KEY
    || process.env.OPENAI_KEY
    || process.env.OPENAI_FAILURE_ANALYZER_API_KEY;

  if (!apiKey) {
    return EMPTY_RESULT;
  }

  const model = process.env.OPENAI_USER_STORY_MODEL || 'gpt-4o-mini';
  const timeoutMs = Number(process.env.OPENAI_USER_STORY_TIMEOUT_MS || 20000);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

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
            content:
              'Act as a senior QA engineer. Extract actors, actions, acceptance criteria, edge cases from the following user stories.\n\n'
              + normalizedStories,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_JSON_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      return EMPTY_RESULT;
    }

    const payload = await response.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      return EMPTY_RESULT;
    }

    return toUserStoryMap(safeParseJson(content));
  } catch (error) {
    return EMPTY_RESULT;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

