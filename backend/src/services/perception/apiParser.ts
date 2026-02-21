import axios from 'axios';

type UnknownRecord = Record<string, unknown>;

export type ApiParameter = {
  name: string;
  in: string | null;
  required: boolean;
  type: string | null;
};

export type ApiMethod = {
  method: string;
  operationId: string | null;
  summary: string | null;
  parameters: ApiParameter[];
  requiredFields: string[];
  responseSchema: UnknownRecord | null;
};

export type ApiEndpoint = {
  path: string;
  methods: ApiMethod[];
};

export type ApiMap = {
  sourceType: 'swagger-json' | 'url' | 'none';
  version: string | null;
  title: string | null;
  endpoints: ApiEndpoint[];
};

function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function asRecord(value: unknown): UnknownRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  return {};
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collectSchemaRequiredFields(schema: unknown): string[] {
  const root = asRecord(schema);
  const directRequired = Array.isArray(root.required) ? root.required.filter((x) => typeof x === 'string') : [];
  const properties = asRecord(root.properties);
  const nestedRequired = Object.entries(properties)
    .filter(([, propertyDef]) => {
      const prop = asRecord(propertyDef);
      return prop.required === true;
    })
    .map(([name]) => name);
  return Array.from(new Set([...directRequired, ...nestedRequired]));
}

function normalizeParameter(param: unknown): ApiParameter {
  const node = asRecord(param);
  const schema = asRecord(node.schema);
  return {
    name: toStringOrNull(node.name) || 'unknown',
    in: toStringOrNull(node.in),
    required: Boolean(node.required),
    type: toStringOrNull(node.type) || toStringOrNull(schema.type),
  };
}

function parseResponseSchema(operationNode: UnknownRecord): UnknownRecord | null {
  const responses = asRecord(operationNode.responses);

  const preferred =
    asRecord(responses['200'])['content']
      ? asRecord(responses['200'])
      : asRecord(responses['201'])['content']
        ? asRecord(responses['201'])
        : asRecord(responses.default);

  if (Object.keys(preferred).length > 0) {
    const content = asRecord(preferred.content);
    const jsonNode = asRecord(content['application/json']);
    const schema = asRecord(jsonNode.schema);
    if (Object.keys(schema).length > 0) {
      return schema;
    }
  }

  const firstResponse = Object.values(responses)[0];
  const fallbackSchema = asRecord(asRecord(firstResponse).schema);
  return Object.keys(fallbackSchema).length > 0 ? fallbackSchema : null;
}

function parseRequiredFields(operationNode: UnknownRecord): string[] {
  const parameters = Array.isArray(operationNode.parameters) ? operationNode.parameters : [];
  const normalizedParams = parameters.map(normalizeParameter);
  const requiredParams = normalizedParams.filter((param) => param.required).map((param) => param.name);

  // Swagger 2.0 body schema can be defined inside parameters with in=body.
  const swaggerBodySchema = parameters
    .map((param) => asRecord(param))
    .find((param) => String(param.in || '').toLowerCase() === 'body');
  const swaggerBodyRequired = collectSchemaRequiredFields(asRecord(swaggerBodySchema).schema);

  const requestBody = asRecord(operationNode.requestBody);
  const content = asRecord(requestBody.content);
  const jsonContent = asRecord(content['application/json']);
  const bodySchema = asRecord(jsonContent.schema);
  const bodyRequired = collectSchemaRequiredFields(bodySchema);

  return Array.from(new Set([...requiredParams, ...swaggerBodyRequired, ...bodyRequired]));
}

function parseOperation(method: string, node: unknown): ApiMethod {
  const op = asRecord(node);
  const parametersNode = Array.isArray(op.parameters) ? op.parameters : [];
  return {
    method: method.toUpperCase(),
    operationId: toStringOrNull(op.operationId),
    summary: toStringOrNull(op.summary),
    parameters: parametersNode.map(normalizeParameter),
    requiredFields: parseRequiredFields(op),
    responseSchema: parseResponseSchema(op),
  };
}

function parseSwaggerDoc(doc: unknown, sourceType: ApiMap['sourceType']): ApiMap {
  const root = asRecord(doc);
  const paths = asRecord(root.paths);
  const info = asRecord(root.info);

  const endpoints: ApiEndpoint[] = Object.entries(paths).map(([path, pathNode]) => {
    const operationMap = asRecord(pathNode);
    const methods = Object.entries(operationMap)
      .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase()))
      .map(([method, opNode]) => parseOperation(method, opNode));
    return {
      path,
      methods,
    };
  });

  return {
    sourceType,
    version: toStringOrNull(root.openapi) || toStringOrNull(root.swagger),
    title: toStringOrNull(info.title),
    endpoints,
  };
}

export async function apiParser(apiDocs?: string | UnknownRecord): Promise<ApiMap> {
  if (!apiDocs) {
    return {
      sourceType: 'none',
      version: null,
      title: null,
      endpoints: [],
    };
  }

  if (typeof apiDocs === 'object') {
    return parseSwaggerDoc(apiDocs, 'swagger-json');
  }

  const source = apiDocs.trim();
  if (source.length === 0) {
    return {
      sourceType: 'none',
      version: null,
      title: null,
      endpoints: [],
    };
  }

  if (isUrl(source)) {
    const response = await axios.get(source, {
      timeout: 30000,
      headers: {
        Accept: 'application/json, application/yaml, text/yaml, */*',
      },
    });
    const payload =
      typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data;
    return parseSwaggerDoc(payload, 'url');
  }

  try {
    const parsed = JSON.parse(source);
    return parseSwaggerDoc(parsed, 'swagger-json');
  } catch (error) {
    throw new Error('apiDocs must be a valid Swagger/OpenAPI JSON string or URL');
  }
}
