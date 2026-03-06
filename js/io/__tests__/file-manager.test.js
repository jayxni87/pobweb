import { describe, it, expect } from 'vitest';
import { importFromShareCode, exportToShareCode, importFromXml } from '../file-manager.js';
import { Build, buildToXml } from '../build-xml.js';

describe('file-manager', () => {
  it('round-trips build via share code', () => {
    const build = new Build({ name: 'Test Build', className: 'Witch', level: 90 });
    const code = exportToShareCode(build);
    const restored = importFromShareCode(code);
    expect(restored.name).toBe('Test Build');
    expect(restored.className).toBe('Witch');
    expect(restored.level).toBe(90);
  });

  it('imports from XML string', () => {
    const build = new Build({ name: 'XML Build', className: 'Ranger', level: 85 });
    const xml = buildToXml(build);
    const restored = importFromXml(xml);
    expect(restored.name).toBe('XML Build');
  });

  it('handles invalid share code gracefully', () => {
    expect(() => importFromShareCode('not-valid-base64!!!')).toThrow();
  });
});
