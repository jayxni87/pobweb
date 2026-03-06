// PoBWeb - WebGL2 Passive Tree Renderer
// Instanced rendering for nodes and connections with sprite atlas support.

// Inline shader sources (bundler-friendly)
const NODE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
layout(location = 2) in vec2 a_offset;
layout(location = 3) in vec2 a_size;
layout(location = 4) in vec4 a_spriteRect;
layout(location = 5) in vec4 a_color;
uniform mat4 u_viewProjection;
out vec2 v_texCoord;
out vec2 v_localUV;
out vec4 v_color;
void main() {
  vec2 worldPos = a_offset + a_position * a_size; // a_size.x = width, a_size.y = height
  gl_Position = u_viewProjection * vec4(worldPos, 0.0, 1.0);
  v_texCoord = a_spriteRect.xy + a_texCoord * a_spriteRect.zw;
  v_localUV = a_texCoord;
  v_color = a_color;
}`;

const NODE_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
in vec2 v_localUV;
in vec4 v_color;
uniform sampler2D u_atlas;
uniform float u_circleClip;
out vec4 fragColor;
void main() {
  if (u_circleClip > 0.5) {
    vec2 center = v_localUV - 0.5;
    if (dot(center, center) > 0.25) discard;
  }
  vec4 texColor = texture(u_atlas, v_texCoord);
  fragColor = texColor * v_color;
  if (fragColor.a < 0.01) discard;
}`;

const CONN_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_start;
layout(location = 1) in vec2 a_end;
layout(location = 2) in float a_width;
layout(location = 3) in vec4 a_color;
layout(location = 4) in vec2 a_vertex;
uniform mat4 u_viewProjection;
out vec4 v_color;
void main() {
  vec2 dir = a_end - a_start;
  vec2 normal = normalize(vec2(-dir.y, dir.x));
  vec2 worldPos = a_start + dir * a_vertex.x + normal * a_width * a_vertex.y;
  gl_Position = u_viewProjection * vec4(worldPos, 0.0, 1.0);
  v_color = a_color;
}`;

const CONN_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;
void main() {
  fragColor = v_color;
}`;

// Node state colors
export const NODE_COLORS = {
  unallocated: [0.5, 0.5, 0.5, 1.0],
  allocated: [1.0, 0.84, 0.0, 1.0],
  canAllocate: [0.3, 0.8, 0.3, 1.0],
  highlighted: [1.0, 1.0, 1.0, 1.0],
};

export const CONNECTION_COLORS = {
  inactive: [0.25, 0.2, 0.1, 0.6],
  active: [0.85, 0.65, 0.1, 1.0],
  path: [0.3, 0.8, 0.3, 0.8],
};

export class TreeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!this.gl) throw new Error('WebGL2 not supported');

    this.nodeProgram = null;
    this.connProgram = null;
    this.connVAO = null;

    // Camera
    this.camera = { x: 0, y: 0, zoom: 1, width: canvas.width, height: canvas.height };

    // Connection data
    this.connInstanceCount = 0;

    // Node layers: array of { texture, vao, instanceBuffer, instanceCount }
    this.nodeLayers = [];

    // Background layers (rendered before connections)
    this.backgroundLayers = [];

    // Texture cache: url -> WebGLTexture
    this._textures = new Map();

    this.dirty = true;
    this._initGL();
  }

  _initGL() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.04, 0.04, 0.06, 1.0);

    this.nodeProgram = this._createProgram(NODE_VERT, NODE_FRAG);
    this.connProgram = this._createProgram(CONN_VERT, CONN_FRAG);

    this._setupConnVAO();
  }

  _createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile error: ' + info);
    }
    return shader;
  }

  _createProgram(vertSrc, fragSrc) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, this._createShader(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(program, this._createShader(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error('Program link error: ' + info);
    }
    return program;
  }

  _setupConnVAO() {
    const gl = this.gl;
    this.connVAO = gl.createVertexArray();
    gl.bindVertexArray(this.connVAO);

    const lineQuad = new Float32Array([
      0, -0.5, 1, -0.5, 1, 0.5,
      0, -0.5, 1, 0.5, 0, 0.5,
    ]);
    const vertBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lineQuad, gl.STATIC_DRAW);

    // a_vertex (location 4)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 8, 0);

    this.connInstanceBuffer = gl.createBuffer();
    gl.bindVertexArray(null);
  }

  // Create a node layer VAO (returns { vao, instanceBuffer })
  _createNodeLayerVAO() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Shared quad geometry
    const quadData = new Float32Array([
      -0.5, -0.5, 0, 0,
       0.5, -0.5, 1, 0,
       0.5,  0.5, 1, 1,
      -0.5, -0.5, 0, 0,
       0.5,  0.5, 1, 1,
      -0.5,  0.5, 0, 1,
    ]);
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    const instanceBuffer = gl.createBuffer();
    gl.bindVertexArray(null);

    return { vao, instanceBuffer };
  }

  // Upload instance data to a node layer VAO
  _uploadNodeInstances(vao, instanceBuffer, instances) {
    const gl = this.gl;
    const data = new Float32Array(instances.length * 12);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const o = i * 12;
      data[o + 0] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.width ?? inst.size;
      data[o + 3] = inst.height ?? inst.size;
      data[o + 4] = inst.spriteRect?.[0] ?? 0;
      data[o + 5] = inst.spriteRect?.[1] ?? 0;
      data[o + 6] = inst.spriteRect?.[2] ?? 1;
      data[o + 7] = inst.spriteRect?.[3] ?? 1;
      data[o + 8] = inst.color?.[0] ?? 1;
      data[o + 9] = inst.color?.[1] ?? 1;
      data[o + 10] = inst.color?.[2] ?? 1;
      data[o + 11] = inst.color?.[3] ?? 1;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    const stride = 48;
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
  }

  // Load a texture from URL, returns a promise. Caches by URL.
  async loadTexture(url) {
    if (this._textures.has(url)) return this._textures.get(url);

    const gl = this.gl;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);

    this._textures.set(url, tex);
    this.dirty = true;
    return tex;
  }

  // Create a 1x1 white pixel texture (fallback)
  createFallbackTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this._textures.set('__fallback__', tex);
    return tex;
  }

  // Set node layers for rendering.
  // layers: array of { textureUrl: string, instances: [{x,y,size,spriteRect,color}] }
  setNodeLayers(layers) {
    const gl = this.gl;

    // Clean up old layers
    for (const layer of this.nodeLayers) {
      gl.deleteVertexArray(layer.vao);
      gl.deleteBuffer(layer.instanceBuffer);
    }
    this.nodeLayers = [];

    for (const layerDef of layers) {
      if (!layerDef.instances.length) continue;
      const { vao, instanceBuffer } = this._createNodeLayerVAO();
      this._uploadNodeInstances(vao, instanceBuffer, layerDef.instances);

      const texture = this._textures.get(layerDef.textureUrl) || this._textures.get('__fallback__');
      this.nodeLayers.push({
        vao,
        instanceBuffer,
        instanceCount: layerDef.instances.length,
        texture,
        circleClip: !!layerDef.circleClip,
      });
    }

    this.dirty = true;
  }

  // Set background layers (rendered before connections)
  setBackgroundLayers(layers) {
    const gl = this.gl;
    for (const layer of this.backgroundLayers) {
      gl.deleteVertexArray(layer.vao);
      gl.deleteBuffer(layer.instanceBuffer);
    }
    this.backgroundLayers = [];
    for (const layerDef of layers) {
      if (!layerDef.instances.length) continue;
      const { vao, instanceBuffer } = this._createNodeLayerVAO();
      this._uploadNodeInstances(vao, instanceBuffer, layerDef.instances);
      const texture = this._textures.get(layerDef.textureUrl) || this._textures.get('__fallback__');
      this.backgroundLayers.push({
        vao, instanceBuffer,
        instanceCount: layerDef.instances.length,
        texture,
        circleClip: !!layerDef.circleClip,
      });
    }
    this.dirty = true;
  }

  // Legacy single-layer API (for tests)
  setNodeInstances(instances) {
    this.setNodeLayers([{ textureUrl: '__fallback__', instances }]);
  }

  createFallbackAtlas() {
    this.createFallbackTexture();
  }

  setConnectionInstances(connections) {
    const gl = this.gl;
    const data = new Float32Array(connections.length * 9);
    for (let i = 0; i < connections.length; i++) {
      const c = connections[i];
      const o = i * 9;
      data[o + 0] = c.x1;
      data[o + 1] = c.y1;
      data[o + 2] = c.x2;
      data[o + 3] = c.y2;
      data[o + 4] = c.width || 2;
      data[o + 5] = c.color?.[0] ?? 0.3;
      data[o + 6] = c.color?.[1] ?? 0.3;
      data[o + 7] = c.color?.[2] ?? 0.3;
      data[o + 8] = c.color?.[3] ?? 0.6;
    }

    gl.bindVertexArray(this.connVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.connInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    const stride = 36;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
    this.connInstanceCount = connections.length;
    this.dirty = true;
  }

  _buildViewProjection() {
    const { x, y, zoom, width, height } = this.camera;
    const hw = (width / 2) / zoom;
    const hh = (height / 2) / zoom;
    const left = x - hw;
    const right = x + hw;
    const bottom = y + hh;
    const top = y - hh;

    return new Float32Array([
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,
      0, 0, -1, 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), 0, 1,
    ]);
  }

  setCamera(x, y, zoom) {
    this.camera.x = x;
    this.camera.y = y;
    this.camera.zoom = zoom;
    this.dirty = true;
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.width = width;
    this.camera.height = height;
    this.gl.viewport(0, 0, width, height);
    this.dirty = true;
  }

  render() {
    if (!this.dirty) return;
    this.dirty = false;

    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);

    const vp = this._buildViewProjection();

    // Layer 0: Background art (before connections)
    if (this.backgroundLayers.length > 0) {
      gl.useProgram(this.nodeProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.nodeProgram, 'u_viewProjection'), false, vp);
      const atlasLoc = gl.getUniformLocation(this.nodeProgram, 'u_atlas');
      const clipLoc = gl.getUniformLocation(this.nodeProgram, 'u_circleClip');
      for (const layer of this.backgroundLayers) {
        if (!layer.texture || layer.instanceCount === 0) continue;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, layer.texture);
        gl.uniform1i(atlasLoc, 0);
        gl.uniform1f(clipLoc, layer.circleClip ? 1.0 : 0.0);
        gl.bindVertexArray(layer.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, layer.instanceCount);
      }
    }

    // Layer 1: Connections
    if (this.connInstanceCount > 0) {
      gl.useProgram(this.connProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.connProgram, 'u_viewProjection'), false, vp);
      gl.bindVertexArray(this.connVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.connInstanceCount);
    }

    // Layer 2+: Node layers (frames, then icons, in order)
    if (this.nodeLayers.length > 0) {
      gl.useProgram(this.nodeProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.nodeProgram, 'u_viewProjection'), false, vp);
      const atlasLoc = gl.getUniformLocation(this.nodeProgram, 'u_atlas');
      const clipLoc = gl.getUniformLocation(this.nodeProgram, 'u_circleClip');

      for (const layer of this.nodeLayers) {
        if (!layer.texture || layer.instanceCount === 0) continue;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, layer.texture);
        gl.uniform1i(atlasLoc, 0);
        gl.uniform1f(clipLoc, layer.circleClip ? 1.0 : 0.0);
        gl.bindVertexArray(layer.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, layer.instanceCount);
      }
    }

    gl.bindVertexArray(null);
  }

  hitTest(screenX, screenY) {
    const worldX = this.camera.x + (screenX - this.camera.width / 2) / this.camera.zoom;
    const worldY = this.camera.y + (screenY - this.camera.height / 2) / this.camera.zoom;
    return { x: worldX, y: worldY };
  }

  screenToWorld(sx, sy) {
    return {
      x: this.camera.x + (sx - this.camera.width / 2) / this.camera.zoom,
      y: this.camera.y + (sy - this.camera.height / 2) / this.camera.zoom,
    };
  }

  destroy() {
    const gl = this.gl;
    if (this.nodeProgram) gl.deleteProgram(this.nodeProgram);
    if (this.connProgram) gl.deleteProgram(this.connProgram);
    if (this.connVAO) gl.deleteVertexArray(this.connVAO);
    for (const layer of this.nodeLayers) {
      gl.deleteVertexArray(layer.vao);
      gl.deleteBuffer(layer.instanceBuffer);
    }
    for (const layer of this.backgroundLayers) {
      gl.deleteVertexArray(layer.vao);
      gl.deleteBuffer(layer.instanceBuffer);
    }
    for (const tex of this._textures.values()) {
      gl.deleteTexture(tex);
    }
  }
}

// Class start portrait art names (classStartIndex → sprite name in startNode category)
const CLASS_START_ART = {
  0: 'centerscion',
  1: 'centermarauder',
  2: 'centerranger',
  3: 'centerwitch',
  4: 'centerduelist',
  5: 'centertemplar',
  6: 'centershadow',
};

// Class background illustration positions and sizes (from PoB PassiveTreeView.lua)
// Image pixels at 0.3835 scale → world size = pixels * 2.66
const CLASS_BACKGROUNDS = {
  1: { image: 'assets/tree/class-art/BackgroundStr.png', x: -2750, y: 1600, w: 2689, h: 3213 },
  2: { image: 'assets/tree/class-art/BackgroundDex.png', x: 2550, y: 1600, w: 2093, h: 2955 },
  3: { image: 'assets/tree/class-art/BackgroundInt.png', x: -250, y: -2200, w: 2615, h: 2290 },
  4: { image: 'assets/tree/class-art/BackgroundStrDex.png', x: -150, y: 2350, w: 3689, h: 2264 },
  5: { image: 'assets/tree/class-art/BackgroundStrInt.png', x: -2100, y: -1500, w: 2399, h: 2910 },
  6: { image: 'assets/tree/class-art/BackgroundDexInt.png', x: 2350, y: -1950, w: 2357, h: 3194 },
};

// World-space sizes for group backgrounds (sprite pixel size * 2.66)
const GROUP_BG_SIZES = {
  PSGroupBackground1: { w: 367, h: 367 },   // 138×138 → square
  PSGroupBackground2: { w: 473, h: 473 },   // 178×178 → square
  PSGroupBackground3: { w: 753, h: 380 },   // 283×143 → half-circle
};

// Build background layers (class illustration + class start portraits + group backgrounds)
export function buildBackgroundLayers(treeData, spriteData, classId) {
  const layers = [];

  // Large class background illustration (only for selected class)
  const bg = CLASS_BACKGROUNDS[classId];
  if (bg) {
    layers.push({
      textureUrl: bg.image,
      instances: [{
        x: bg.x, y: bg.y,
        width: bg.w, height: bg.h,
        spriteRect: [0, 0, 1, 1],
        color: [1, 1, 1, 0.6],
      }],
    });
  }

  // Group backgrounds + class start portraits share the group-background-3.png sheet
  const gbInstances = [];

  // Group background circles behind node clusters
  for (const group of Object.values(treeData.groups)) {
    if (!group.background) continue;
    const spriteName = group.background.image;
    const uv = spriteData.getSpriteUV('groupBackground', spriteName);
    if (!uv) continue;
    const dims = GROUP_BG_SIZES[spriteName];
    if (!dims) continue;

    if (group.background.isHalfImage) {
      // Half-image: draw top half normally, bottom half with V-flipped UVs
      const halfH = dims.h / 2;
      // Top half: centered above group center
      gbInstances.push({
        x: group.x, y: group.y - halfH,
        width: dims.w, height: dims.h,
        spriteRect: uv,
        color: [1, 1, 1, 0.7],
      });
      // Bottom half: centered below group center, vertically flipped
      gbInstances.push({
        x: group.x, y: group.y + halfH,
        width: dims.w, height: dims.h,
        spriteRect: [uv[0], uv[1] + uv[3], uv[2], -uv[3]],
        color: [1, 1, 1, 0.7],
      });
    } else {
      gbInstances.push({
        x: group.x, y: group.y,
        width: dims.w, height: dims.h,
        spriteRect: uv,
        color: [1, 1, 1, 0.7],
      });
    }
  }

  // Class start portraits
  for (const node of Object.values(treeData.nodes)) {
    if (node.type !== 'classStart') continue;
    const isActive = node.classStartIndex === classId;
    const spriteName = isActive ? CLASS_START_ART[node.classStartIndex] : 'PSStartNodeBackgroundInactive';
    const uv = spriteData.getSpriteUV('startNode', spriteName);
    if (!uv) continue;

    // Active portrait is 241×222, inactive is 202×202
    const w = isActive ? 482 : 404;
    const h = isActive ? 444 : 404;
    gbInstances.push({
      x: node.x, y: node.y,
      width: w, height: h,
      spriteRect: uv,
      color: [1, 1, 1, isActive ? 1 : 0.5],
    });
  }

  if (gbInstances.length > 0) {
    layers.push({ textureUrl: 'assets/tree/group-background-3.png', instances: gbInstances });
  }

  return layers;
}

// Utility: Build node frame + icon layers from TreeData + SpriteData + PassiveSpec
export function buildNodeLayers(treeData, spriteData, spec, options = {}) {
  const highlighted = options.highlighted;

  // World-space sizes for each node type (matching the sprite pixel sizes roughly)
  const frameSizes = { normal: 78, notable: 116, keystone: 166, jewel: 116, mastery: 172, classStart: 160, ascendancyStart: 100 };
  const iconSizes = { normal: 52, notable: 74, keystone: 104, jewel: 0, mastery: 172, classStart: 0, ascendancyStart: 0 };

  const frameInstances = [];
  const unallocatedIcons = [];
  const allocatedIcons = [];
  const masteryInactiveIcons = [];
  const masteryConnectedIcons = [];
  const masteryActiveIcons = [];

  const searchActive = highlighted && highlighted.size > 0;

  for (const node of Object.values(treeData.nodes)) {
    const allocated = spec ? spec.isAllocated(node.id) : false;
    const isHighlighted = highlighted?.has(node.id);

    // When searching, dim non-matching nodes
    const dimmed = searchActive && !isHighlighted;
    const dimAlpha = dimmed ? 0.2 : 1;

    // Frame
    const hasMasteryEffect = node.type === 'mastery' && spec && spec.masterySelections?.get(node.id) != null;
    // Mastery nodes only get a frame when they have an effect selected
    if (node.type !== 'mastery' || hasMasteryEffect) {
      const frameState = isHighlighted ? 'highlighted' : (allocated ? 'allocated' : 'unallocated');
      const frameUV = spriteData.getFrameUV(node.type, frameState);
      if (frameUV) {
        // Gold tint for active mastery frame
        const frameColor = hasMasteryEffect
          ? [1.0, 0.85, 0.4, dimAlpha]
          : [1, 1, 1, dimAlpha];
        frameInstances.push({
          x: node.x,
          y: node.y,
          size: frameSizes[node.type] || 39,
          spriteRect: frameUV,
          color: frameColor,
        });
      }
    }

    // Icon
    if (node.type === 'mastery') {
      let masteryState, icon;
      if (allocated && hasMasteryEffect) {
        masteryState = 'activeSelected';
        icon = node._activeIcon || node._inactiveIcon || node._icon;
      } else if (allocated) {
        masteryState = 'connected';
        icon = node._inactiveIcon || node._icon;
      } else {
        masteryState = 'inactive';
        icon = node._inactiveIcon || node._icon;
      }
      if (icon) {
        const uv = spriteData.getMasteryIconUV(icon, masteryState);
        if (uv) {
          // Gold tint for active mastery with a selected effect
          const color = (allocated && hasMasteryEffect)
            ? [1.0, 0.85, 0.4, dimmed ? 0.15 : 1]
            : [1, 1, 1, dimmed ? 0.15 : (allocated ? 1 : 0.6)];
          const inst = { x: node.x, y: node.y, size: iconSizes.mastery, spriteRect: uv, color };
          if (masteryState === 'activeSelected') masteryActiveIcons.push(inst);
          else if (masteryState === 'connected') masteryConnectedIcons.push(inst);
          else masteryInactiveIcons.push(inst);
        }
      }
    } else if (node.type === 'classStart' || node.type === 'ascendancyStart' || node.type === 'jewel') {
      // classStart portraits are in the background layers
    } else {
      const iconPath = node._icon;
      if (iconPath) {
        const iconUV = spriteData.getIconUV(node.type, iconPath, allocated);
        if (iconUV) {
          const target = allocated ? allocatedIcons : unallocatedIcons;
          target.push({
            x: node.x,
            y: node.y,
            size: iconSizes[node.type] || 26,
            spriteRect: iconUV,
            color: isHighlighted ? [1, 1, 0.5, 1] : [1, 1, 1, dimAlpha],
          });
        }
      }
    }
  }

  const layers = [
    { textureUrl: 'assets/tree/frame-3.png', instances: frameInstances },
    { textureUrl: 'assets/tree/skills-disabled-3.jpg', instances: unallocatedIcons, circleClip: true },
    { textureUrl: 'assets/tree/skills-3.jpg', instances: allocatedIcons, circleClip: true },
  ];

  if (masteryInactiveIcons.length > 0) {
    layers.push({ textureUrl: 'assets/tree/mastery-disabled-3.png', instances: masteryInactiveIcons, circleClip: true });
  }
  if (masteryConnectedIcons.length > 0) {
    layers.push({ textureUrl: 'assets/tree/mastery-connected-3.png', instances: masteryConnectedIcons, circleClip: true });
  }
  if (masteryActiveIcons.length > 0) {
    layers.push({ textureUrl: 'assets/tree/mastery-active-selected-3.png', instances: masteryActiveIcons, circleClip: true });
  }

  return layers;
}

// Legacy utilities kept for backward compatibility
export function buildNodeInstances(treeData, spec, options = {}) {
  const nodeSize = options.nodeSize || { normal: 20, notable: 30, keystone: 40, socket: 25, jewel: 25, classStart: 30, ascendancyStart: 25, mastery: 25 };
  const instances = [];

  for (const node of Object.values(treeData.nodes)) {
    const allocated = spec ? spec.isAllocated(node.id) : false;
    let color = allocated ? NODE_COLORS.allocated : NODE_COLORS.unallocated;

    if (options.highlighted?.has(node.id)) {
      color = NODE_COLORS.highlighted;
    } else if (options.canAllocate?.has(node.id)) {
      color = NODE_COLORS.canAllocate;
    }

    instances.push({
      x: node.x,
      y: node.y,
      size: nodeSize[node.type] || 20,
      spriteRect: [0, 0, 1, 1],
      color,
    });
  }

  return instances;
}

export function buildPathPreviewInstances(treeData, pathNodeIds) {
  const connections = [];
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const nodeA = treeData.nodes[pathNodeIds[i]];
    const nodeB = treeData.nodes[pathNodeIds[i + 1]];
    if (!nodeA || !nodeB) continue;
    connections.push({
      x1: nodeA.x, y1: nodeA.y,
      x2: nodeB.x, y2: nodeB.y,
      width: 3,
      color: CONNECTION_COLORS.path,
    });
  }
  return connections;
}

export function buildConnectionInstances(treeData, spec, options = {}) {
  const connections = [];
  const seen = new Set();

  for (const node of Object.values(treeData.nodes)) {
    for (const adjId of node.adjacent) {
      const key = Math.min(node.id, adjId) + ':' + Math.max(node.id, adjId);
      if (seen.has(key)) continue;
      seen.add(key);

      const adjNode = treeData.nodes[adjId];
      if (!adjNode) continue;

      // Hide connections to classStart and mastery nodes
      if (node.type === 'classStart' || adjNode.type === 'classStart') continue;
      if (node.type === 'mastery' || adjNode.type === 'mastery') continue;

      // Hide connections between ascendancy sub-trees and the main tree
      const nodeIsAsc = !!(node.ascendancy || node.type === 'ascendancyStart');
      const adjIsAsc = !!(adjNode.ascendancy || adjNode.type === 'ascendancyStart');
      if (nodeIsAsc !== adjIsAsc) continue;

      const bothAllocated = spec && spec.isAllocated(node.id) && spec.isAllocated(adjId);
      const color = bothAllocated ? CONNECTION_COLORS.active : CONNECTION_COLORS.inactive;
      const width = bothAllocated ? 8 : 5;

      // Arc connection: same group, same orbit (>0), both have angles
      const isArc = node.group === adjNode.group && node.orbit === adjNode.orbit && node.orbit > 0
        && node.angle !== undefined && adjNode.angle !== undefined;

      if (isArc) {
        const group = treeData.groups[node.group];
        const radius = Math.sqrt((node.x - group.x) ** 2 + (node.y - group.y) ** 2);
        let startAngle = node.angle;
        let endAngle = adjNode.angle;
        let arcSpan = endAngle - startAngle;
        if (arcSpan > Math.PI) arcSpan -= 2 * Math.PI;
        if (arcSpan < -Math.PI) arcSpan += 2 * Math.PI;
        const segCount = Math.max(2, Math.round(Math.abs(arcSpan) / (Math.PI / 2) * 16));
        for (let s = 0; s < segCount; s++) {
          const t0 = s / segCount;
          const t1 = (s + 1) / segCount;
          const a0 = startAngle + arcSpan * t0;
          const a1 = startAngle + arcSpan * t1;
          connections.push({
            x1: group.x + Math.sin(a0) * radius,
            y1: group.y - Math.cos(a0) * radius,
            x2: group.x + Math.sin(a1) * radius,
            y2: group.y - Math.cos(a1) * radius,
            width,
            color,
          });
        }
      } else {
        connections.push({
          x1: node.x, y1: node.y,
          x2: adjNode.x, y2: adjNode.y,
          width,
          color,
        });
      }
    }
  }

  return connections;
}
