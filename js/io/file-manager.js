// PoBWeb - File Manager
// File import/export using File API and Blob downloads.

import { buildToXml, xmlToBuild } from './build-xml.js';
import { encodeShareCode, decodeShareCode } from './share-code.js';

// Read file as text via File API
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Download a string as a file
export function downloadAsFile(content, filename, mimeType = 'text/xml') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Import build from share code string
export function importFromShareCode(code) {
  const xml = decodeShareCode(code.trim());
  return xmlToBuild(xml);
}

// Export build to share code string
export function exportToShareCode(build) {
  const xml = buildToXml(build);
  return encodeShareCode(xml);
}

// Import build from XML file content
export function importFromXml(xmlContent) {
  return xmlToBuild(xmlContent);
}

// Export build as XML file download
export function exportAsXml(build, filename) {
  const xml = buildToXml(build);
  downloadAsFile(xml, filename || `${build.name}.xml`);
}

// Export build as share code (copy to clipboard)
export async function copyShareCode(build) {
  const code = exportToShareCode(build);
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(code);
  }
  return code;
}
