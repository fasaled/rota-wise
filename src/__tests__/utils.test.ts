import { describe, it, expect } from 'bun:test';
import { cn, generateId } from '../lib/utils';

describe('cn (class merging)', () => {
  it('merges multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes with false', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
  });

  it('handles conditional classes with undefined', () => {
    expect(cn('foo', undefined, 'baz')).toBe('foo baz');
  });

  it('handles conditional classes with null', () => {
    expect(cn('foo', null, 'baz')).toBe('foo baz');
  });

  it('resolves tailwind padding conflicts (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('resolves tailwind text color conflicts', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('does not remove unrelated classes when resolving conflicts', () => {
    const result = cn('flex', 'p-2', 'p-4', 'text-sm');
    expect(result).toContain('flex');
    expect(result).toContain('p-4');
    expect(result).toContain('text-sm');
    expect(result).not.toContain('p-2');
  });

  it('handles object syntax (truthy values)', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles array syntax', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles nested arrays', () => {
    expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz');
  });

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('returns empty string for all falsy arguments', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('handles mixed input types', () => {
    const result = cn('base', { active: true, disabled: false }, ['extra']);
    expect(result).toContain('base');
    expect(result).toContain('active');
    expect(result).toContain('extra');
    expect(result).not.toContain('disabled');
  });
});

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('matches UUID v4 format', () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('generates unique values across many calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
  });

  it('each call returns a different id', () => {
    expect(generateId()).not.toBe(generateId());
  });
});
