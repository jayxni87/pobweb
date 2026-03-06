// PoBWeb - Build XML Serialization (port of Modules/Build.lua save/load)
// Build ↔ XML conversion compatible with desktop PoB format.

export class Build {
  constructor(opts = {}) {
    this.name = opts.name !== undefined ? opts.name : 'New Build';
    this.className = opts.className !== undefined ? opts.className : 'Scion';
    this.level = opts.level !== undefined ? opts.level : 1;
    this.ascendancy = opts.ascendancy !== undefined ? opts.ascendancy : '';
    this.treeNodes = opts.treeNodes || [];
    this.masteryEffects = opts.masteryEffects || []; // [{nodeId, effectId}]
    this.specs = opts.specs || [];       // [{title, classId, ascendClassId, treeVersion, nodes, masteryEffects}]
    this.activeSpec = opts.activeSpec || 0; // 0-indexed
    this.skills = opts.skills || [];
    this.items = opts.items || [];
    this.config = opts.config || {};
    this.notes = opts.notes !== undefined ? opts.notes : '';
  }
}

// Escape XML special characters
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Serialize Build to XML string
export function buildToXml(build) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<PathOfBuilding>\n';

  // Build section
  xml += `  <Build className="${escapeXml(build.className)}" level="${build.level}" ascendClassName="${escapeXml(build.ascendancy)}" buildName="${escapeXml(build.name)}">\n`;
  xml += '  </Build>\n';

  // Tree section
  xml += '  <Tree>\n';
  if (build.treeNodes.length > 0) {
    const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
    const classId = classNames.indexOf(build.className);
    let masteryAttr = '';
    if (build.masteryEffects && build.masteryEffects.length > 0) {
      masteryAttr = ` masteryEffects="${build.masteryEffects.map(m => `{${m.nodeId},${m.effectId}}`).join(',')}"`;
    }
    xml += `    <Spec treeVersion="3_25" classId="${classId >= 0 ? classId : 0}" ascendClassId="0" nodes="${build.treeNodes.join(',')}"${masteryAttr}>\n`;
    xml += '    </Spec>\n';
  }
  xml += '  </Tree>\n';

  // Skills section
  xml += '  <Skills>\n';
  for (const group of build.skills) {
    xml += `    <SkillGroup slot="${escapeXml(group.slot || '')}">\n`;
    for (const gem of group.gems) {
      xml += `      <Gem nameSpec="${escapeXml(gem.name)}" level="${gem.level}" quality="${gem.quality || 0}"/>\n`;
    }
    xml += '    </SkillGroup>\n';
  }
  xml += '  </Skills>\n';

  // Items section
  xml += '  <Items>\n';
  for (const item of build.items) {
    xml += `    <Item slot="${escapeXml(item.slot || '')}">${escapeXml(item.raw || '')}</Item>\n`;
  }
  xml += '  </Items>\n';

  // Config section
  xml += '  <Config>\n';
  for (const [key, value] of Object.entries(build.config)) {
    xml += `    <Input name="${escapeXml(key)}" value="${escapeXml(String(value))}"/>\n`;
  }
  xml += '  </Config>\n';

  // Notes section
  xml += `  <Notes>${escapeXml(build.notes)}</Notes>\n`;

  xml += '</PathOfBuilding>\n';
  return xml;
}

// Parse XML string to Build object
export function xmlToBuild(xmlString) {
  // Use DOMParser (available in browsers) or a simple regex parser for Node
  let doc;
  if (typeof DOMParser !== 'undefined') {
    doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  } else {
    // Simple regex-based parsing for Node/test environment
    return parseXmlSimple(xmlString);
  }

  return parseDom(doc);
}

// Simple XML parsing without DOMParser (for Node/Vitest)
function parseXmlSimple(xml) {
  const build = new Build({
    name: '',
    className: '',
    level: 1,
    ascendancy: '',
  });

  // Build attributes
  const buildMatch = xml.match(/<Build\s+([^>]*)>/);
  if (buildMatch) {
    const attrs = buildMatch[1];
    build.className = extractAttr(attrs, 'className') || '';
    build.level = parseInt(extractAttr(attrs, 'level') || '1', 10);
    build.ascendancy = extractAttr(attrs, 'ascendClassName') || '';
    build.name = extractAttr(attrs, 'buildName') || '';
  }

  // Parse activeSpec from <Tree activeSpec="...">
  const treeMatch = xml.match(/<Tree\s+([^>]*)>/);
  const activeSpecStr = treeMatch ? extractAttr(treeMatch[1], 'activeSpec') : null;
  const activeSpecIdx = activeSpecStr ? parseInt(activeSpecStr, 10) - 1 : 0;

  // Parse all <Spec> elements
  const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
  const specRegex = /<Spec\s+([^>]*)(?:\/>|>[\s\S]*?<\/Spec>)/g;
  let specIdx = 0;
  let specMatch;
  while ((specMatch = specRegex.exec(xml)) !== null) {
    const specAttrs = specMatch[1];
    const nodesStr = extractAttr(specAttrs, 'nodes') || '';
    const nodes = nodesStr ? nodesStr.split(',').map(Number).filter(n => !isNaN(n)) : [];
    const classId = parseInt(extractAttr(specAttrs, 'classId') || '0', 10);
    build.specs.push({
      title: extractAttr(specAttrs, 'title') || `Tree ${specIdx + 1}`,
      classId,
      ascendClassId: parseInt(extractAttr(specAttrs, 'ascendClassId') || '0', 10),
      treeVersion: extractAttr(specAttrs, 'treeVersion') || '',
      nodes,
      masteryEffects: parseMasteryEffectsAttr(extractAttr(specAttrs, 'masteryEffects')),
    });
    specIdx++;
  }

  // Set active spec and apply its nodes
  build.activeSpec = Math.min(activeSpecIdx, Math.max(0, build.specs.length - 1));
  if (build.specs.length > 0) {
    const active = build.specs[build.activeSpec];
    build.treeNodes = active.nodes;
    build.masteryEffects = active.masteryEffects || [];
    if (!build.className) {
      build.className = classNames[active.classId] || 'Scion';
    }
  }

  // Skills
  const skillGroupRegex = /<SkillGroup\s+slot="([^"]*)">([\s\S]*?)<\/SkillGroup>/g;
  let sgMatch;
  while ((sgMatch = skillGroupRegex.exec(xml)) !== null) {
    const group = { slot: sgMatch[1], gems: [] };
    const gemRegex = /<Gem\s+nameSpec="([^"]*)"\s+level="(\d+)"\s+quality="(\d+)"\/>/g;
    let gMatch;
    while ((gMatch = gemRegex.exec(sgMatch[2])) !== null) {
      group.gems.push({
        name: gMatch[1],
        level: parseInt(gMatch[2], 10),
        quality: parseInt(gMatch[3], 10),
      });
    }
    build.skills.push(group);
  }

  // Items
  const itemRegex = /<Item\s+slot="([^"]*)">([\s\S]*?)<\/Item>/g;
  let iMatch;
  while ((iMatch = itemRegex.exec(xml)) !== null) {
    build.items.push({ slot: iMatch[1], raw: unescapeXml(iMatch[2]) });
  }

  // Config
  const inputRegex = /<Input\s+name="([^"]*)"\s+value="([^"]*)"\/?>/g;
  let cMatch;
  while ((cMatch = inputRegex.exec(xml)) !== null) {
    build.config[cMatch[1]] = cMatch[2];
  }

  // Notes
  const notesMatch = xml.match(/<Notes>([\s\S]*?)<\/Notes>/);
  if (notesMatch) {
    build.notes = unescapeXml(notesMatch[1]);
  }

  return build;
}

function parseMasteryEffectsAttr(str) {
  if (!str) return [];
  const effects = [];
  const re = /\{(\d+),(\d+)\}/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    effects.push({ nodeId: parseInt(m[1], 10), effectId: parseInt(m[2], 10) });
  }
  return effects;
}

function extractAttr(attrStr, name) {
  const match = attrStr.match(new RegExp(`${name}="([^"]*)"`));
  return match ? unescapeXml(match[1]) : null;
}

function unescapeXml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Parse from DOM document
function parseDom(doc) {
  const classNames = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow'];
  const build = new Build({ name: '', className: '', level: 1 });

  const buildEl = doc.querySelector('Build');
  if (buildEl) {
    build.className = buildEl.getAttribute('className') || '';
    build.level = parseInt(buildEl.getAttribute('level') || '1', 10);
    build.ascendancy = buildEl.getAttribute('ascendClassName') || '';
    build.name = buildEl.getAttribute('buildName') || '';
  }

  // Parse all Spec elements from the Tree section
  const treeEl = doc.querySelector('Tree');
  const activeSpecAttr = treeEl?.getAttribute('activeSpec');
  const activeSpecIdx = activeSpecAttr ? parseInt(activeSpecAttr, 10) - 1 : 0; // convert 1-indexed to 0-indexed

  const specEls = doc.querySelectorAll('Spec');
  specEls.forEach((specEl, i) => {
    const nodesStr = specEl.getAttribute('nodes') || '';
    const nodes = nodesStr ? nodesStr.split(',').map(Number).filter(n => !isNaN(n)) : [];
    const classId = parseInt(specEl.getAttribute('classId') || '0', 10);
    build.specs.push({
      title: specEl.getAttribute('title') || `Tree ${i + 1}`,
      classId,
      ascendClassId: parseInt(specEl.getAttribute('ascendClassId') || '0', 10),
      treeVersion: specEl.getAttribute('treeVersion') || '',
      nodes,
      masteryEffects: parseMasteryEffectsAttr(specEl.getAttribute('masteryEffects')),
    });
  });

  // Set active spec and apply its nodes
  build.activeSpec = Math.min(activeSpecIdx, Math.max(0, build.specs.length - 1));
  if (build.specs.length > 0) {
    const active = build.specs[build.activeSpec];
    build.treeNodes = active.nodes;
    build.masteryEffects = active.masteryEffects || [];
    if (!build.className && active.classId !== undefined) {
      build.className = classNames[active.classId] || 'Scion';
    }
  }

  doc.querySelectorAll('SkillGroup').forEach(sg => {
    const group = { slot: sg.getAttribute('slot') || '', gems: [] };
    sg.querySelectorAll('Gem').forEach(g => {
      group.gems.push({
        name: g.getAttribute('nameSpec') || '',
        level: parseInt(g.getAttribute('level') || '1', 10),
        quality: parseInt(g.getAttribute('quality') || '0', 10),
      });
    });
    build.skills.push(group);
  });

  doc.querySelectorAll('Item').forEach(item => {
    build.items.push({
      slot: item.getAttribute('slot') || '',
      raw: item.textContent || '',
    });
  });

  doc.querySelectorAll('Config Input').forEach(input => {
    const name = input.getAttribute('name');
    const value = input.getAttribute('value');
    if (name) build.config[name] = value;
  });

  const notesEl = doc.querySelector('Notes');
  if (notesEl) {
    build.notes = notesEl.textContent || '';
  }

  return build;
}
