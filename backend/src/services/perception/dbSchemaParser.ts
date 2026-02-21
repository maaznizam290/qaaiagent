export type DbConstraintType = 'NOT NULL' | 'UNIQUE' | 'FOREIGN KEY';

export type DbColumn = {
  name: string;
  rawType: string | null;
  constraints: DbConstraintType[];
};

export type DbForeignKey = {
  column: string;
  referencesTable: string;
  referencesColumn: string;
};

export type DbTableMap = {
  tableName: string;
  columns: DbColumn[];
  constraints: {
    notNull: string[];
    unique: string[];
    foreignKeys: DbForeignKey[];
  };
  validationRules: {
    [columnName: string]: string[];
  };
};

export type DbSchemaMap = {
  tables: DbTableMap[];
};

function normalizeIdentifier(value: string): string {
  return value.replace(/[`"'[\]]/g, '').trim();
}

function splitByTopLevelComma(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      const chunk = current.trim();
      if (chunk) parts.push(chunk);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

function buildValidationRules(table: DbTableMap): DbTableMap['validationRules'] {
  const rules: DbTableMap['validationRules'] = {};

  table.columns.forEach((column) => {
    const columnRules: string[] = [];
    if (column.constraints.includes('NOT NULL')) {
      columnRules.push('required');
    }
    if (column.constraints.includes('UNIQUE')) {
      columnRules.push('unique');
    }

    const fk = table.constraints.foreignKeys.find((x) => x.column === column.name);
    if (fk) {
      columnRules.push(`existsIn:${fk.referencesTable}.${fk.referencesColumn}`);
    }

    if (columnRules.length > 0) {
      rules[column.name] = columnRules;
    }
  });

  return rules;
}

function parseCreateTable(sqlBlock: string): DbTableMap | null {
  const headerMatch = sqlBlock.match(/create\s+table(?:\s+if\s+not\s+exists)?\s+([`"\[\]\w.]+)/i);
  if (!headerMatch) return null;

  const tableName = normalizeIdentifier(headerMatch[1].split('.').pop() || headerMatch[1]);
  const openParen = sqlBlock.indexOf('(');
  const closeParen = sqlBlock.lastIndexOf(')');
  if (openParen < 0 || closeParen <= openParen) return null;

  const body = sqlBlock.slice(openParen + 1, closeParen);
  const entries = splitByTopLevelComma(body);

  const columns: DbColumn[] = [];
  const notNull = new Set<string>();
  const unique = new Set<string>();
  const foreignKeys: DbForeignKey[] = [];

  entries.forEach((entryRaw) => {
    const entry = entryRaw.trim();
    const lower = entry.toLowerCase();

    if (lower.startsWith('constraint ') || lower.startsWith('foreign key')) {
      const fkMatch = entry.match(/foreign\s+key\s*\(([^)]+)\)\s*references\s+([`"\[\]\w.]+)\s*\(([^)]+)\)/i);
      if (fkMatch) {
        const column = normalizeIdentifier(fkMatch[1].split(',')[0] || '');
        const referencesTable = normalizeIdentifier((fkMatch[2] || '').split('.').pop() || fkMatch[2] || '');
        const referencesColumn = normalizeIdentifier((fkMatch[3] || '').split(',')[0] || '');
        if (column && referencesTable && referencesColumn) {
          foreignKeys.push({ column, referencesTable, referencesColumn });
        }
      }

      const uqMatch = entry.match(/unique\s*\(([^)]+)\)/i);
      if (uqMatch) {
        uqMatch[1]
          .split(',')
          .map((x) => normalizeIdentifier(x))
          .filter(Boolean)
          .forEach((col) => unique.add(col));
      }
      return;
    }

    if (lower.startsWith('primary key') || lower.startsWith('unique(') || lower.startsWith('unique ')) {
      const uqMatch = entry.match(/unique\s*\(([^)]+)\)/i);
      if (uqMatch) {
        uqMatch[1]
          .split(',')
          .map((x) => normalizeIdentifier(x))
          .filter(Boolean)
          .forEach((col) => unique.add(col));
      }
      return;
    }

    const tokens = entry.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;

    const columnName = normalizeIdentifier(tokens[0]);
    if (!columnName) return;

    const rawType = tokens[1] ? tokens[1].trim() : null;
    const columnConstraints: DbConstraintType[] = [];

    if (/\bnot\s+null\b/i.test(entry)) {
      columnConstraints.push('NOT NULL');
      notNull.add(columnName);
    }
    if (/\bunique\b/i.test(entry)) {
      columnConstraints.push('UNIQUE');
      unique.add(columnName);
    }

    const inlineFkMatch = entry.match(/references\s+([`"\[\]\w.]+)\s*\(([^)]+)\)/i);
    if (inlineFkMatch) {
      const referencesTable = normalizeIdentifier((inlineFkMatch[1] || '').split('.').pop() || inlineFkMatch[1] || '');
      const referencesColumn = normalizeIdentifier((inlineFkMatch[2] || '').split(',')[0] || '');
      if (referencesTable && referencesColumn) {
        columnConstraints.push('FOREIGN KEY');
        foreignKeys.push({
          column: columnName,
          referencesTable,
          referencesColumn,
        });
      }
    }

    columns.push({
      name: columnName,
      rawType,
      constraints: columnConstraints,
    });
  });

  foreignKeys.forEach((fk) => {
    const target = columns.find((c) => c.name === fk.column);
    if (target && !target.constraints.includes('FOREIGN KEY')) {
      target.constraints.push('FOREIGN KEY');
    }
  });

  const table: DbTableMap = {
    tableName,
    columns,
    constraints: {
      notNull: Array.from(notNull),
      unique: Array.from(unique),
      foreignKeys,
    },
    validationRules: {},
  };
  table.validationRules = buildValidationRules(table);
  return table;
}

export function dbSchemaParser(dbSchema?: string): DbSchemaMap {
  const text = String(dbSchema || '').trim();
  if (!text) {
    return { tables: [] };
  }

  const createTableBlocks = text.match(/create\s+table[\s\S]*?\)[\s]*;?/gi) || [];
  const tables = createTableBlocks
    .map(parseCreateTable)
    .filter((x): x is DbTableMap => Boolean(x));

  return { tables };
}

