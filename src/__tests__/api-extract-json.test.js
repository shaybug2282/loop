// Unit tests for extractJson (api/ai.js) — tolerant JSON extraction from
// model replies that may include prose or markdown fences.
import { extractJson } from '../../api/ai';

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson('{"reply":"hi","plans":[]}')).toEqual({ reply: 'hi', plans: [] });
  });

  it('parses a bare JSON array', () => {
    expect(extractJson('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('extracts JSON from a ```json fence', () => {
    const text = 'Here you go:\n```json\n{"a": 1}\n```\nEnjoy!';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it('extracts JSON from an unlabelled fence', () => {
    expect(extractJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON surrounded by prose', () => {
    const text = 'Sure! {"plans": [{"title": "Coffee"}]} Let me know.';
    expect(extractJson(text)).toEqual({ plans: [{ title: 'Coffee' }] });
  });

  it('handles nested braces and brackets', () => {
    const obj = { a: { b: [1, { c: 'x}y' }] } };
    expect(extractJson(JSON.stringify(obj))).toEqual(obj);
  });

  it('returns null for plain prose', () => {
    expect(extractJson('I could not find a good time.')).toBeNull();
  });

  it('returns null for empty / nullish input', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson(null)).toBeNull();
    expect(extractJson(undefined)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(extractJson('{"unclosed": ')).toBeNull();
  });
});
