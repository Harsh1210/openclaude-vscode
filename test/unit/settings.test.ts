import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('openclaude-settings.schema.json', () => {
  const schemaPath = path.resolve(__dirname, '../../openclaude-settings.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  it('is valid JSON', () => {
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
  });

  it('has all required top-level properties', () => {
    const props = Object.keys(schema.properties);
    expect(props).toContain('permissions');
    expect(props).toContain('model');
    expect(props).toContain('hooks');
    expect(props).toContain('fastMode');
    expect(props).toContain('companyAnnouncements');
    expect(props).toContain('feedbackSurveyRate');
    expect(props).toContain('spinnerVerbs');
    expect(props).toContain('promptSuggestionEnabled');
    expect(props).toContain('showThinkingSummaries');
  });

  it('has permissions property with defaultMode enum', () => {
    const perms = schema.properties.permissions;
    expect(perms).toBeDefined();
    expect(perms.type).toBe('object');
    const defaultMode = perms.properties?.defaultMode;
    expect(defaultMode).toBeDefined();
    expect(defaultMode.enum).toContain('default');
    expect(defaultMode.enum).toContain('plan');
    expect(defaultMode.enum).toContain('acceptEdits');
    expect(defaultMode.enum).toContain('bypassPermissions');
  });

  it('has hooks property', () => {
    const hooks = schema.properties.hooks;
    expect(hooks).toBeDefined();
    expect(hooks.type).toBe('object');
  });

  it('has fastMode as boolean', () => {
    expect(schema.properties.fastMode.type).toBe('boolean');
  });

  it('has feedbackSurveyRate as number', () => {
    expect(schema.properties.feedbackSurveyRate.type).toBe('number');
  });

  it('has companyAnnouncements as array', () => {
    expect(schema.properties.companyAnnouncements.type).toBe('array');
  });

  it('has at least 30 top-level properties', () => {
    const count = Object.keys(schema.properties).length;
    expect(count).toBeGreaterThanOrEqual(30);
  });
});
