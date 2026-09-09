import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

const semantics = JSON.parse(
  readFileSync(resolve(__dirname, '../semantics.json'), 'utf-8'),
);
const deJson = JSON.parse(
  readFileSync(resolve(__dirname, '../language/de.json'), 'utf-8'),
);

/**
 * Mirrors h5p-cli's removeUntranslatables / createDefaultLanguage logic.
 *
 * Rules:
 * - Keep: label, description, entity, example
 * - Keep non-empty string defaults for non-select fields (text / code / …)
 * - For select fields: keep options[].label only
 * - Recurse into fields[] (groups) and field (list item template)
 * - Drop everything else (type, name, widget, default for boolean/number/select, …)
 */
function translatableShape(field) {
  const result = {};

  if ('label' in field) result.label = field.label;
  if ('description' in field) result.description = field.description;
  if ('entity' in field) result.entity = field.entity;
  if ('example' in field) result.example = field.example;

  if (
    'default' in field &&
    typeof field.default === 'string' &&
    field.default !== '' &&
    field.type !== 'select'
  ) {
    result.default = field.default;
  }

  if (field.type === 'select' && Array.isArray(field.options)) {
    result.options = field.options.map((opt) => ({ label: opt.label }));
  }

  if (Array.isArray(field.fields)) {
    result.fields = field.fields.map(translatableShape);
  }

  if ('field' in field) {
    result.field = translatableShape(field.field);
  }

  return result;
}

/**
 * Replaces all string leaf values with '' so that purely structural
 * differences (missing fields, wrong array lengths) fail the comparison
 * while actual translated text is ignored.
 */
function structuralSkeleton(value) {
  if (typeof value === 'string') return '';
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(structuralSkeleton);

  const result = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = structuralSkeleton(v);
  }
  return result;
}

describe('language/de.json', () => {
  it('has the same structural shape as semantics.json after removeUntranslatables', () => {
    const expectedSkeleton = structuralSkeleton(semantics.map(translatableShape));
    const actualSkeleton = structuralSkeleton(deJson.semantics);

    expect(actualSkeleton).toEqual(expectedSkeleton);
  });
});

describe('semantics.json', () => {
  it('provides defaults for data-structure constraint list entries', () => {
    const gradingSettings = semantics.find((field) => field.name === 'gradingSettings');
    const constraints = gradingSettings.fields.find((field) => field.name === 'algorithmConstraints');
    const dataStructureLists = constraints.fields.filter((field) => (
      ['requiredDataStructures', 'forbiddenDataStructures'].includes(field.name)
    ));

    expect(dataStructureLists).toHaveLength(2);
    dataStructureLists.forEach((field) => {
      expect(field.field.type).toBe('select');
      expect(field.field.default).toBe('list');
      expect(field.field.options.map((option) => option.value)).toContain(field.field.default);
    });
  });
});
