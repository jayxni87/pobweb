// PoBWeb - Sprite Data Loader
// Loads sprites.json and provides coordinate lookups for tree node rendering.

const ASSET_BASE = 'assets/tree/';

// Map sprite sheet filename (from CDN URL) to local asset path
function localFilename(url) {
  const name = url.split('/').pop().split('?')[0];
  return ASSET_BASE + name;
}

// Frame names for each node type and state
const FRAME_MAP = {
  normal:    { unallocated: 'PSSkillFrame',            allocated: 'PSSkillFrameActive',    highlighted: 'PSSkillFrameHighlighted' },
  notable:   { unallocated: 'NotableFrameUnallocated', allocated: 'NotableFrameAllocated', highlighted: 'NotableFrameCanAllocate' },
  keystone:  { unallocated: 'KeystoneFrameUnallocated',allocated: 'KeystoneFrameAllocated',highlighted: 'KeystoneFrameCanAllocate' },
  jewel:     { unallocated: 'JewelFrameUnallocated',   allocated: 'JewelFrameAllocated',   highlighted: 'JewelFrameCanAllocate' },
};

// Icon category for node type + state
const ICON_CATEGORY = {
  normal:   { active: 'normalActive',   inactive: 'normalInactive' },
  notable:  { active: 'notableActive',  inactive: 'notableInactive' },
  keystone: { active: 'keystoneActive', inactive: 'keystoneInactive' },
};

export class SpriteData {
  constructor(spritesJson) {
    this.sprites = spritesJson.sprites || {};
    this.extraImages = spritesJson.extraImages || {};

    // Pre-resolve local filenames for each category
    this._sheetPaths = {};
    for (const [cat, data] of Object.entries(this.sprites)) {
      this._sheetPaths[cat] = localFilename(data.filename);
    }
  }

  // Get the local image path for a sprite category
  getSheetPath(category) {
    return this._sheetPaths[category] || null;
  }

  // Get sheet dimensions for a category
  getSheetSize(category) {
    const s = this.sprites[category];
    return s ? { w: s.w, h: s.h } : null;
  }

  // Get normalized UV rect [u, v, uW, uH] for a sprite within a category
  // Returns null if not found
  getSpriteUV(category, spriteName) {
    const cat = this.sprites[category];
    if (!cat) return null;
    const coord = cat.coords[spriteName];
    if (!coord) return null;
    return [
      coord.x / cat.w,
      coord.y / cat.h,
      coord.w / cat.w,
      coord.h / cat.h,
    ];
  }

  // Get the frame UV for a node type and allocation state
  getFrameUV(nodeType, state) {
    const mapping = FRAME_MAP[nodeType];
    if (!mapping) return null;
    const frameName = mapping[state] || mapping.unallocated;
    return this.getSpriteUV('frame', frameName);
  }

  // Get the icon UV for a node's icon path, given its type and allocation state
  getIconUV(nodeType, iconPath, allocated) {
    const catMap = ICON_CATEGORY[nodeType];
    if (!catMap) return null;
    const category = allocated ? catMap.active : catMap.inactive;
    return this.getSpriteUV(category, iconPath);
  }

  // Get mastery icon UV (uses separate sheets)
  getMasteryIconUV(iconPath, allocated) {
    if (allocated) {
      return this.getSpriteUV('mastery', iconPath);
    }
    // For inactive mastery, use the inactiveIcon path with masteryInactive category
    return this.getSpriteUV('masteryInactive', iconPath);
  }

  // Get the set of unique texture paths needed for rendering
  getRequiredTextures() {
    return {
      frame: this.getSheetPath('frame'),
      skillsActive: this.getSheetPath('normalActive'),
      skillsInactive: this.getSheetPath('normalInactive'),
      mastery: this.getSheetPath('mastery'),
      masteryInactive: this.getSheetPath('masteryInactive'),
      ascendancy: this.getSheetPath('ascendancy'),
      groupBackground: this.getSheetPath('groupBackground'),
    };
  }
}
