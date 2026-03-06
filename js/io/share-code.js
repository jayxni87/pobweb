// PoBWeb - Share Code Encode/Decode (port of Import/Export share code logic)
// PoB share codes are base64(zlib_deflate(xml_string)).

import pako from 'pako';

export function encodeShareCode(xmlString) {
  const compressed = pako.deflate(new TextEncoder().encode(xmlString));
  // Standard base64 encoding
  let binary = '';
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}

export function decodeShareCode(shareCode) {
  const binary = atob(shareCode);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decompressed = pako.inflate(bytes);
  return new TextDecoder().decode(decompressed);
}
