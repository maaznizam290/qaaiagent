import { load } from 'cheerio';

import type { ApiMap } from './perception/apiParser';
import type { DbSchemaMap } from './perception/dbSchemaParser';
import type { DomScannerResult } from './perception/domScanner';

export type FieldValidation = {
  field: string;
  required: boolean;
  patterns: string[];
  rules: string[];
  sources: string[];
};

export type BusinessRule = {
  name: string;
  description: string;
  source: string;
};

export type ValidationExtractorOutput = {
  fieldValidations: FieldValidation[];
  businessRules: BusinessRule[];
};

export type ValidationExtractorInput = {
  dom?: DomScannerResult | null;
  dbMap?: DbSchemaMap | null;
  apiMap?: ApiMap | null;
};

type MutableField = {
  required: boolean;
  patterns: Set<string>;
  rules: Set<string>;
  sources: Set<string>;
};

function normalizeFieldName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function ensureField(map: Map<string, MutableField>, rawField: string): [string, MutableField] | null {
  const field = normalizeFieldName(rawField);
  if (!field) return null;
  if (!map.has(field)) {
    map.set(field, {
      required: false,
      patterns: new Set<string>(),
      rules: new Set<string>(),
      sources: new Set<string>(),
    });
  }
  return [field, map.get(field)!];
}

function addHtmlRules(fieldMap: Map<string, MutableField>, dom?: DomScannerResult | null): void {
  if (!dom) return;

  dom.inputs.forEach((input) => {
    const rawField = input.name || input.id || '';
    const ensured = ensureField(fieldMap, rawField);
    if (!ensured) return;
    const [, entry] = ensured;
    entry.sources.add('html');

    if (input.required) {
      entry.required = true;
      entry.rules.add('required');
    }

    const t = String(input.type || '').toLowerCase();
    if (t === 'email') {
      entry.patterns.add('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
      entry.rules.add('email');
    } else if (t === 'url') {
      entry.patterns.add('^https?://.+');
      entry.rules.add('url');
    } else if (t === 'tel') {
      entry.patterns.add('^[+()\\-\\s0-9]{7,20}$');
      entry.rules.add('phone');
    }
  });

  const $ = load(dom.rawHTML || '');
  $('input[pattern], textarea[pattern]').each((_, node) => {
    const el = $(node);
    const pattern = String(el.attr('pattern') || '').trim();
    if (!pattern) return;

    const rawField = String(el.attr('name') || el.attr('id') || '').trim();
    const ensured = ensureField(fieldMap, rawField);
    if (!ensured) return;
    const [, entry] = ensured;
    entry.sources.add('html');
    entry.patterns.add(pattern);
    entry.rules.add('regex');
  });
}

function addDbRules(
  fieldMap: Map<string, MutableField>,
  businessRules: BusinessRule[],
  dbMap?: DbSchemaMap | null
): void {
  if (!dbMap) return;

  dbMap.tables.forEach((table) => {
    table.columns.forEach((column) => {
      const ensured = ensureField(fieldMap, column.name);
      if (!ensured) return;
      const [field, entry] = ensured;
      entry.sources.add('db');

      if (column.constraints.includes('NOT NULL')) {
        entry.required = true;
        entry.rules.add('required');
      }
      if (column.constraints.includes('UNIQUE')) {
        entry.rules.add('unique');
        businessRules.push({
          name: `Unique_${table.tableName}_${column.name}`,
          description: `${table.tableName}.${column.name} must be unique.`,
          source: 'db',
        });
      }
      if (column.constraints.includes('FOREIGN KEY')) {
        const fk = table.constraints.foreignKeys.find((x) => normalizeFieldName(x.column) === field);
        if (fk) {
          entry.rules.add(`existsIn:${fk.referencesTable}.${fk.referencesColumn}`);
          businessRules.push({
            name: `ForeignKey_${table.tableName}_${column.name}`,
            description: `${table.tableName}.${column.name} must reference ${fk.referencesTable}.${fk.referencesColumn}.`,
            source: 'db',
          });
        }
      }
    });
  });
}

function addApiRules(
  fieldMap: Map<string, MutableField>,
  businessRules: BusinessRule[],
  apiMap?: ApiMap | null
): void {
  if (!apiMap) return;

  apiMap.endpoints.forEach((endpoint) => {
    endpoint.methods.forEach((method) => {
      method.parameters.forEach((parameter) => {
        const ensured = ensureField(fieldMap, parameter.name);
        if (!ensured) return;
        const [, entry] = ensured;
        entry.sources.add('api');
        if (parameter.required) {
          entry.required = true;
          entry.rules.add('required');
        }
      });

      method.requiredFields.forEach((requiredField) => {
        const ensured = ensureField(fieldMap, requiredField);
        if (!ensured) return;
        const [, entry] = ensured;
        entry.sources.add('api');
        entry.required = true;
        entry.rules.add('required');
      });

      if (method.requiredFields.length > 0) {
        businessRules.push({
          name: `ApiRequired_${method.method}_${endpoint.path}`,
          description: `${method.method} ${endpoint.path} requires: ${method.requiredFields.join(', ')}`,
          source: 'api',
        });
      }
    });
  });
}

export function validationExtractor(input: ValidationExtractorInput): ValidationExtractorOutput {
  const fieldMap = new Map<string, MutableField>();
  const businessRules: BusinessRule[] = [];

  addHtmlRules(fieldMap, input.dom);
  addDbRules(fieldMap, businessRules, input.dbMap);
  addApiRules(fieldMap, businessRules, input.apiMap);

  const fieldValidations: FieldValidation[] = Array.from(fieldMap.entries())
    .map(([field, entry]) => ({
      field,
      required: entry.required,
      patterns: Array.from(entry.patterns),
      rules: Array.from(entry.rules),
      sources: Array.from(entry.sources),
    }))
    .sort((a, b) => a.field.localeCompare(b.field));

  return {
    fieldValidations,
    businessRules,
  };
}

