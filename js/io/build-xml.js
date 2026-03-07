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
    this.jewelSockets = opts.jewelSockets || []; // [{nodeId, itemText}]
    this.specs = opts.specs || [];       // [{title, classId, ascendClassId, treeVersion, nodes, masteryEffects, jewelSockets}]
    this.activeSpec = opts.activeSpec || 0; // 0-indexed
    this.skills = opts.skills || [];
    this.skillSets = opts.skillSets || [];  // [{id, title, groups}]
    this.activeSkillSet = opts.activeSkillSet || 1; // 1-based
    this.mainSocketGroup = opts.mainSocketGroup || 0;
    this.items = opts.items || [];
    this.itemsById = opts.itemsById || {};   // id → raw item text
    this.itemSlots = opts.itemSlots || {};    // slotName → itemId
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
    if (build.jewelSockets && build.jewelSockets.length > 0) {
      xml += '      <Sockets>\n';
      for (const socket of build.jewelSockets) {
        xml += `        <Socket nodeId="${socket.nodeId}" itemText="${escapeXml(socket.itemText)}"/>\n`;
      }
      xml += '      </Sockets>\n';
    }
    xml += '    </Spec>\n';
  }
  xml += '  </Tree>\n';

  // Skills section — PoB format with multiple skill sets
  xml += `  <Skills activeSkillSet="${build.activeSkillSet || 1}" mainSocketGroup="${build.mainSocketGroup || 0}">\n`;
  const sets = build.skillSets.length > 0 ? build.skillSets : [{ id: 1, title: 'Default', groups: build.skills }];
  for (const set of sets) {
    xml += `    <SkillSet id="${set.id}"${set.title ? ` title="${escapeXml(set.title)}"` : ''}>\n`;
    for (const group of (set.groups || [])) {
      const enabled = group.enabled !== undefined ? group.enabled : true;
      xml += `      <Skill enabled="${enabled}" slot="${escapeXml(group.slot || '')}" label="${escapeXml(group.label || '')}" mainActiveSkill="${group.mainActiveSkill || 1}" includeInFullDPS="${group.includeInFullDPS ? 'true' : 'false'}">\n`;
      for (const gem of (group.gems || [])) {
        const gemEnabled = gem.enabled !== undefined ? gem.enabled : true;
        let attrs = `nameSpec="${escapeXml(gem.name || '')}" level="${gem.level || 1}" quality="${gem.quality || 0}"`;
        if (gem.gemId) attrs += ` gemId="${escapeXml(gem.gemId)}"`;
        if (gem.variantId) attrs += ` variantId="${escapeXml(gem.variantId)}"`;
        if (gem.skillId) attrs += ` skillId="${escapeXml(gem.skillId)}"`;
        attrs += ` qualityId="${escapeXml(gem.qualityId || 'Default')}" enabled="${gemEnabled}" count="${gem.count || 1}"`;
        xml += `        <Gem ${attrs}/>\n`;
      }
      xml += '      </Skill>\n';
    }
    xml += '    </SkillSet>\n';
  }
  xml += '  </Skills>\n';

  // Items section - PoB format: <Item id="N"> + <ItemSet><Slot>
  xml += '  <Items activeItemSet="1">\n';
  for (let i = 0; i < build.items.length; i++) {
    const item = build.items[i];
    xml += `    <Item id="${i + 1}">${escapeXml(item.raw || '')}</Item>\n`;
  }
  if (build.items.length > 0) {
    xml += '    <ItemSet id="1">\n';
    for (let i = 0; i < build.items.length; i++) {
      const item = build.items[i];
      if (item.slot) {
        xml += `      <Slot name="${escapeXml(item.slot)}" itemId="${i + 1}"/>\n`;
      }
    }
    xml += '    </ItemSet>\n';
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

  // Parse items first (needed to resolve Socket itemId references)
  const itemById = {};
  const itemRegexEarly = /<Item\s+([^>]*)>([\s\S]*?)<\/Item>/g;
  let earlyItemMatch;
  while ((earlyItemMatch = itemRegexEarly.exec(xml)) !== null) {
    const iAttrs = earlyItemMatch[1];
    const itemId = extractAttr(iAttrs, 'id');
    if (itemId) {
      itemById[itemId] = unescapeXml(earlyItemMatch[2]);
    }
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
    // Parse jewel sockets from within the spec block
    const specBlock = specMatch[0];
    const socketRegex = /<Socket\s+([^>]*)\/>/g;
    const jewelSockets = [];
    let socketMatch;
    while ((socketMatch = socketRegex.exec(specBlock)) !== null) {
      const sAttrs = socketMatch[1];
      const nodeId = parseInt(extractAttr(sAttrs, 'nodeId') || '0', 10);
      if (!nodeId) continue;
      // Support both our format (itemText attr) and PoB format (itemId referencing Items)
      let itemText = extractAttr(sAttrs, 'itemText') || '';
      if (!itemText) {
        const itemId = extractAttr(sAttrs, 'itemId');
        if (itemId && itemById[itemId]) {
          itemText = itemById[itemId];
        }
      }
      if (nodeId) jewelSockets.push({ nodeId, itemText });
    }

    build.specs.push({
      title: extractAttr(specAttrs, 'title') || `Tree ${specIdx + 1}`,
      classId,
      ascendClassId: parseInt(extractAttr(specAttrs, 'ascendClassId') || '0', 10),
      treeVersion: extractAttr(specAttrs, 'treeVersion') || '',
      nodes,
      masteryEffects: parseMasteryEffectsAttr(extractAttr(specAttrs, 'masteryEffects')),
      jewelSockets,
    });
    specIdx++;
  }

  // Set active spec and apply its nodes
  build.activeSpec = Math.min(activeSpecIdx, Math.max(0, build.specs.length - 1));
  if (build.specs.length > 0) {
    const active = build.specs[build.activeSpec];
    build.treeNodes = active.nodes;
    build.masteryEffects = active.masteryEffects || [];
    build.jewelSockets = active.jewelSockets || [];
    if (!build.className) {
      build.className = classNames[active.classId] || 'Scion';
    }
  }

  // Parse mainSocketGroup and activeSkillSet from <Skills>
  const skillsMatch = xml.match(/<Skills\s+([^>]*)>/);
  if (skillsMatch) {
    const msGroup = extractAttr(skillsMatch[1], 'mainSocketGroup');
    if (msGroup) build.mainSocketGroup = parseInt(msGroup, 10);
    const activeSet = extractAttr(skillsMatch[1], 'activeSkillSet');
    if (activeSet) build.activeSkillSet = parseInt(activeSet, 10);
  }

  // Helper to parse gems from a <Skill> block
  function parseGemsFromBlock(blockContent) {
    const gems = [];
    const gemRegex = /<Gem\s+([\s\S]*?)\s*\/>/g;
    let gMatch;
    while ((gMatch = gemRegex.exec(blockContent)) !== null) {
      const gAttrs = gMatch[1];
      gems.push({
        name: extractAttr(gAttrs, 'nameSpec') || '',
        gemId: extractAttr(gAttrs, 'gemId') || '',
        variantId: extractAttr(gAttrs, 'variantId') || '',
        skillId: extractAttr(gAttrs, 'skillId') || '',
        level: parseInt(extractAttr(gAttrs, 'level') || '1', 10),
        quality: parseInt(extractAttr(gAttrs, 'quality') || '0', 10),
        qualityId: extractAttr(gAttrs, 'qualityId') || 'Default',
        enabled: extractAttr(gAttrs, 'enabled') !== 'false',
        count: parseInt(extractAttr(gAttrs, 'count') || '1', 10),
      });
    }
    return gems;
  }

  function parseSkillGroup(attrs, content) {
    return {
      enabled: extractAttr(attrs, 'enabled') !== 'false',
      slot: extractAttr(attrs, 'slot') || '',
      label: extractAttr(attrs, 'label') || '',
      mainActiveSkill: parseInt(extractAttr(attrs, 'mainActiveSkill') || '1', 10),
      includeInFullDPS: extractAttr(attrs, 'includeInFullDPS') === 'true',
      gems: parseGemsFromBlock(content),
    };
  }

  // Skills — try PoB <SkillSet> format first
  const skillSetRegex = /<SkillSet\s+([^>]*)>([\s\S]*?)<\/SkillSet>/g;
  let setMatch;
  while ((setMatch = skillSetRegex.exec(xml)) !== null) {
    const setAttrs = setMatch[1];
    const setContent = setMatch[2];
    const setObj = {
      id: parseInt(extractAttr(setAttrs, 'id') || '1', 10),
      title: extractAttr(setAttrs, 'title') || 'Default',
      groups: [],
    };
    const skillRegex = /<Skill\s+([^>]*)>([\s\S]*?)<\/Skill>/g;
    let skillMatch;
    while ((skillMatch = skillRegex.exec(setContent)) !== null) {
      setObj.groups.push(parseSkillGroup(skillMatch[1], skillMatch[2]));
    }
    build.skillSets.push(setObj);
  }

  // If we found skill sets, set skills to active set's groups
  if (build.skillSets.length > 0) {
    const activeSet = build.skillSets.find(s => s.id === build.activeSkillSet) || build.skillSets[0];
    build.skills = activeSet.groups;
  } else {
    // Try bare <Skill> elements (no SkillSet wrapper)
    const skillRegex = /<Skill\s+([^>]*)>([\s\S]*?)<\/Skill>/g;
    let skillMatch;
    while ((skillMatch = skillRegex.exec(xml)) !== null) {
      build.skills.push(parseSkillGroup(skillMatch[1], skillMatch[2]));
    }

    // Fallback: legacy <SkillGroup> format
    if (build.skills.length === 0) {
      const skillGroupRegex = /<SkillGroup\s+([^>]*)>([\s\S]*?)<\/SkillGroup>/g;
      let sgMatch;
      while ((sgMatch = skillGroupRegex.exec(xml)) !== null) {
        build.skills.push(parseSkillGroup(sgMatch[1], sgMatch[2]));
      }
    }

    // Wrap into a single skill set for consistency
    if (build.skills.length > 0) {
      build.skillSets = [{ id: 1, title: 'Default', groups: build.skills }];
    }
  }

  // Items — support both formats: <Item slot="..."> (our format) and <Item id="N"> (PoB format)
  const itemRegex = /<Item\s+([^>]*)>([\s\S]*?)<\/Item>/g;
  let iMatch;
  while ((iMatch = itemRegex.exec(xml)) !== null) {
    const iAttrs = iMatch[1];
    const rawText = unescapeXml(iMatch[2]);
    const itemId = extractAttr(iAttrs, 'id');
    const slot = extractAttr(iAttrs, 'slot');
    if (itemId) {
      itemById[itemId] = rawText;
    }
    if (slot) {
      // Our format: <Item slot="Helmet">...</Item>
      build.items.push({ slot, raw: rawText });
    }
  }

  // Expose itemsById on the build
  build.itemsById = { ...itemById };

  // Parse activeItemSet from <Items activeItemSet="N">
  const itemsMatch = xml.match(/<Items\s+([^>]*)>/);
  const activeItemSetStr = itemsMatch ? extractAttr(itemsMatch[1], 'activeItemSet') : null;
  const activeItemSet = activeItemSetStr || '1';

  // Parse <ItemSet> blocks for <Slot> tags (PoB format)
  const itemSetRegex = /<ItemSet\s+([^>]*)>([\s\S]*?)<\/ItemSet>/g;
  let isMatch;
  let foundItemSets = false;
  while ((isMatch = itemSetRegex.exec(xml)) !== null) {
    foundItemSets = true;
    const isAttrs = isMatch[1];
    const setId = extractAttr(isAttrs, 'id');
    if (setId !== activeItemSet) continue;
    // Parse Slot elements within this ItemSet
    const slotRegex = /<Slot\s+([^>]*?)\/>/g;
    let slotMatch;
    while ((slotMatch = slotRegex.exec(isMatch[2])) !== null) {
      const sAttrs = slotMatch[1];
      const slotName = extractAttr(sAttrs, 'name');
      const slotItemId = extractAttr(sAttrs, 'itemId');
      if (slotName && slotItemId) {
        build.itemSlots[slotName] = slotItemId;
      }
    }
  }

  // Parse legacy top-level <Slot> elements directly inside <Items> (not inside <ItemSet>)
  if (!foundItemSets) {
    // Extract the <Items> block content
    const itemsBlockMatch = xml.match(/<Items[^>]*>([\s\S]*?)<\/Items>/);
    if (itemsBlockMatch) {
      const itemsBlock = itemsBlockMatch[1];
      // Remove <ItemSet>...</ItemSet> blocks to get only top-level Slot elements
      const withoutItemSets = itemsBlock.replace(/<ItemSet[\s\S]*?<\/ItemSet>/g, '');
      const slotRegex = /<Slot\s+([^>]*?)\/>/g;
      let slotMatch;
      while ((slotMatch = slotRegex.exec(withoutItemSets)) !== null) {
        const sAttrs = slotMatch[1];
        const slotName = extractAttr(sAttrs, 'name');
        const slotItemId = extractAttr(sAttrs, 'itemId');
        if (slotName && slotItemId) {
          build.itemSlots[slotName] = slotItemId;
        }
      }
    }
  }

  // Build items array from resolved slot assignments (PoB format)
  for (const [slotName, slotItemId] of Object.entries(build.itemSlots)) {
    if (itemById[slotItemId]) {
      build.items.push({ slot: slotName, raw: itemById[slotItemId] });
    }
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

  // Build item-by-id map (needed to resolve Socket itemId references)
  const domItemById = {};
  doc.querySelectorAll('Item').forEach(itemEl => {
    const itemId = itemEl.getAttribute('id');
    if (itemId) {
      domItemById[itemId] = itemEl.textContent || '';
    }
  });

  // Parse all Spec elements from the Tree section
  const treeEl = doc.querySelector('Tree');
  const activeSpecAttr = treeEl?.getAttribute('activeSpec');
  const activeSpecIdx = activeSpecAttr ? parseInt(activeSpecAttr, 10) - 1 : 0; // convert 1-indexed to 0-indexed

  const specEls = doc.querySelectorAll('Spec');
  specEls.forEach((specEl, i) => {
    const nodesStr = specEl.getAttribute('nodes') || '';
    const nodes = nodesStr ? nodesStr.split(',').map(Number).filter(n => !isNaN(n)) : [];
    const classId = parseInt(specEl.getAttribute('classId') || '0', 10);
    const jewelSockets = [];
    specEl.querySelectorAll('Socket').forEach(socketEl => {
      const nodeId = parseInt(socketEl.getAttribute('nodeId') || '0', 10);
      if (!nodeId) return;
      // Support both our format (itemText) and PoB format (itemId)
      let itemText = socketEl.getAttribute('itemText') || '';
      if (!itemText) {
        const itemId = socketEl.getAttribute('itemId');
        if (itemId && domItemById[itemId]) {
          itemText = domItemById[itemId];
        }
      }
      jewelSockets.push({ nodeId, itemText });
    });
    build.specs.push({
      title: specEl.getAttribute('title') || `Tree ${i + 1}`,
      classId,
      ascendClassId: parseInt(specEl.getAttribute('ascendClassId') || '0', 10),
      treeVersion: specEl.getAttribute('treeVersion') || '',
      nodes,
      masteryEffects: parseMasteryEffectsAttr(specEl.getAttribute('masteryEffects')),
      jewelSockets,
    });
  });

  // Set active spec and apply its nodes
  build.activeSpec = Math.min(activeSpecIdx, Math.max(0, build.specs.length - 1));
  if (build.specs.length > 0) {
    const active = build.specs[build.activeSpec];
    build.treeNodes = active.nodes;
    build.masteryEffects = active.masteryEffects || [];
    build.jewelSockets = active.jewelSockets || [];
    if (!build.className && active.classId !== undefined) {
      build.className = classNames[active.classId] || 'Scion';
    }
  }

  // Parse mainSocketGroup and activeSkillSet from <Skills>
  const skillsEl = doc.querySelector('Skills');
  if (skillsEl) {
    const msGroup = skillsEl.getAttribute('mainSocketGroup');
    if (msGroup) build.mainSocketGroup = parseInt(msGroup, 10);
    const activeSet = skillsEl.getAttribute('activeSkillSet');
    if (activeSet) build.activeSkillSet = parseInt(activeSet, 10);
  }

  function parseDomGems(parentEl) {
    const gems = [];
    parentEl.querySelectorAll(':scope > Gem').forEach(g => {
      gems.push({
        name: g.getAttribute('nameSpec') || '',
        gemId: g.getAttribute('gemId') || '',
        variantId: g.getAttribute('variantId') || '',
        skillId: g.getAttribute('skillId') || '',
        level: parseInt(g.getAttribute('level') || '1', 10),
        quality: parseInt(g.getAttribute('quality') || '0', 10),
        qualityId: g.getAttribute('qualityId') || 'Default',
        enabled: g.getAttribute('enabled') !== 'false',
        count: parseInt(g.getAttribute('count') || '1', 10),
      });
    });
    return gems;
  }

  function parseDomSkillGroup(el) {
    return {
      enabled: el.getAttribute('enabled') !== 'false',
      slot: el.getAttribute('slot') || '',
      label: el.getAttribute('label') || '',
      mainActiveSkill: parseInt(el.getAttribute('mainActiveSkill') || '1', 10),
      includeInFullDPS: el.getAttribute('includeInFullDPS') === 'true',
      gems: parseDomGems(el),
    };
  }

  // Skills — try PoB <SkillSet> format first
  const skillSetEls = doc.querySelectorAll('SkillSet');
  if (skillSetEls.length > 0) {
    skillSetEls.forEach(setEl => {
      const setObj = {
        id: parseInt(setEl.getAttribute('id') || '1', 10),
        title: setEl.getAttribute('title') || 'Default',
        groups: [],
      };
      setEl.querySelectorAll(':scope > Skill').forEach(skillEl => {
        setObj.groups.push(parseDomSkillGroup(skillEl));
      });
      build.skillSets.push(setObj);
    });
    const activeSetObj = build.skillSets.find(s => s.id === build.activeSkillSet) || build.skillSets[0];
    build.skills = activeSetObj.groups;
  } else {
    // Try bare <Skill> elements
    const skillEls = doc.querySelectorAll('Skill');
    if (skillEls.length > 0) {
      skillEls.forEach(skillEl => {
        build.skills.push(parseDomSkillGroup(skillEl));
      });
    } else {
      // Fallback: legacy <SkillGroup> format
      doc.querySelectorAll('SkillGroup').forEach(sg => {
        build.skills.push(parseDomSkillGroup(sg));
      });
    }
    if (build.skills.length > 0) {
      build.skillSets = [{ id: 1, title: 'Default', groups: build.skills }];
    }
  }

  // Items — support both formats: <Item slot="..."> (our format) and <Item id="N"> (PoB format)
  doc.querySelectorAll('Item').forEach(item => {
    const slot = item.getAttribute('slot');
    const itemId = item.getAttribute('id');
    const rawText = item.textContent || '';
    if (itemId) {
      domItemById[itemId] = rawText;
    }
    if (slot) {
      // Our format: <Item slot="Helmet">...</Item>
      build.items.push({ slot, raw: rawText });
    }
  });

  // Expose itemsById on the build
  build.itemsById = { ...domItemById };

  // Parse activeItemSet from <Items activeItemSet="N">
  const itemsEl = doc.querySelector('Items');
  const activeItemSetAttr = itemsEl?.getAttribute('activeItemSet');
  const activeItemSet = activeItemSetAttr || '1';

  // Parse <ItemSet> blocks for <Slot> tags (PoB format)
  const itemSetEls = doc.querySelectorAll('ItemSet');
  let foundItemSets = false;
  itemSetEls.forEach(setEl => {
    foundItemSets = true;
    const setId = setEl.getAttribute('id');
    if (setId !== activeItemSet) return;
    setEl.querySelectorAll('Slot').forEach(slotEl => {
      const slotName = slotEl.getAttribute('name');
      const slotItemId = slotEl.getAttribute('itemId');
      if (slotName && slotItemId) {
        build.itemSlots[slotName] = slotItemId;
      }
    });
  });

  // Parse legacy top-level <Slot> elements directly inside <Items> (not inside <ItemSet>)
  if (!foundItemSets && itemsEl) {
    // Only get direct child Slot elements of Items (not nested inside ItemSet)
    for (const child of itemsEl.children) {
      if (child.tagName === 'Slot') {
        const slotName = child.getAttribute('name');
        const slotItemId = child.getAttribute('itemId');
        if (slotName && slotItemId) {
          build.itemSlots[slotName] = slotItemId;
        }
      }
    }
  }

  // Build items array from resolved slot assignments (PoB format)
  for (const [slotName, slotItemId] of Object.entries(build.itemSlots)) {
    if (domItemById[slotItemId]) {
      build.items.push({ slot: slotName, raw: domItemById[slotItemId] });
    }
  }

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
