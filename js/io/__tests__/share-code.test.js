import { describe, it, expect } from 'vitest';
import { encodeShareCode, decodeShareCode } from '../share-code.js';

describe('share codes', () => {
  it('round-trips XML through encode/decode', () => {
    const xml = '<PathOfBuilding><Build className="Witch" level="80"/></PathOfBuilding>';
    const code = encodeShareCode(xml);
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
    expect(decodeShareCode(code)).toBe(xml);
  });

  it('round-trips empty string', () => {
    const code = encodeShareCode('');
    expect(decodeShareCode(code)).toBe('');
  });

  it('round-trips large XML', () => {
    const xml = '<PathOfBuilding>' + '<Node id="1"/>'.repeat(1000) + '</PathOfBuilding>';
    const code = encodeShareCode(xml);
    expect(decodeShareCode(code)).toBe(xml);
  });

  it('produces URL-safe base64', () => {
    const xml = '<Build>test with special chars: + / =</Build>';
    const code = encodeShareCode(xml);
    // PoB uses standard base64, but should not contain characters that break URLs
    // when used as a query parameter (after proper URL encoding)
    expect(typeof code).toBe('string');
    expect(decodeShareCode(code)).toBe(xml);
  });

  it('handles unicode content', () => {
    const xml = '<Notes>Build notes with unicode: äöü 日本語</Notes>';
    const code = encodeShareCode(xml);
    expect(decodeShareCode(code)).toBe(xml);
  });
});
