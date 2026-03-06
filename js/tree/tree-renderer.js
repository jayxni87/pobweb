// PoBWeb - WebGL2 Passive Tree Renderer
// Instanced rendering for nodes and connections with sprite atlas support.

// Inline shader sources (bundler-friendly)
const NODE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
layout(location = 2) in vec2 a_offset;
layout(location = 3) in float a_size;
layout(location = 4) in vec4 a_spriteRect;
layout(location = 5) in vec4 a_color;
uniform mat4 u_viewProjection;
out vec2 v_texCoord;
out vec2 v_localUV;
out vec4 v_color;
void main() {
  vec2 worldPos = a_offset + a_position * a_size;
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
  inactive: [0.3, 0.3, 0.3, 0.6],
  active: [0.85, 0.7, 0.2, 1.0],
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
    const data = new Float32Array(instances.length * 11);
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const o = i * 11;
      data[o + 0] = inst.x;
      data[o + 1] = inst.y;
      data[o + 2] = inst.size;
      data[o + 3] = inst.spriteRect?.[0] ?? 0;
      data[o + 4] = inst.spriteRect?.[1] ?? 0;
      data[o + 5] = inst.spriteRect?.[2] ?? 1;
      data[o + 6] = inst.spriteRect?.[3] ?? 1;
      data[o + 7] = inst.color?.[0] ?? 1;
      data[o + 8] = inst.color?.[1] ?? 1;
      data[o + 9] = inst.color?.[2] ?? 1;
      data[o + 10] = inst.color?.[3] ?? 1;
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    const stride = 44;
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 28);
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
    for (const tex of this._textures.values()) {
      gl.deleteTexture(tex);
    }
  }
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
  const masteryIcons = [];

  for (const node of Object.values(treeData.nodes)) {
    const allocated = spec ? spec.isAllocated(node.id) : false;
    const isHighlighted = highlighted?.has(node.id);

    // Frame
    const frameState = isHighlighted ? 'highlighted' : (allocated ? 'allocated' : 'unallocated');
    const frameUV = spriteData.getFrameUV(node.type, frameState);
    if (frameUV) {
      frameInstances.push({
        x: node.x,
        y: node.y,
        size: frameSizes[node.type] || 39,
        spriteRect: frameUV,
        color: [1, 1, 1, 1],
      });
    }

    // Icon
    if (node.type === 'mastery') {
      // Mastery uses separate sprite sheets
      const icon = node._inactiveIcon || node._icon;
      if (icon) {
        const uv = spriteData.getMasteryIconUV(icon, allocated);
        if (uv) {
          masteryIcons.push({
            x: node.x,
            y: node.y,
            size: iconSizes.mastery,
            spriteRect: uv,
            color: [1, 1, 1, allocated ? 1 : 0.6],
          });
        }
      }
    } else if (node.type === 'classStart' || node.type === 'ascendancyStart' || node.type === 'jewel') {
      // These types don't have skill icons in the skills sprite sheet
      // For classStart, we could use group-background or startNode sprites
      // For now, render frame only (which already distinguishes them)
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
            color: isHighlighted ? [1, 1, 0.5, 1] : [1, 1, 1, 1],
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

  if (masteryIcons.length > 0) {
    layers.push({ textureUrl: 'assets/tree/mastery-disabled-3.png', instances: masteryIcons, circleClip: true });
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

      const bothAllocated = spec && spec.isAllocated(node.id) && spec.isAllocated(adjId);
      const color = bothAllocated ? CONNECTION_COLORS.active : CONNECTION_COLORS.inactive;

      connections.push({
        x1: node.x, y1: node.y,
        x2: adjNode.x, y2: adjNode.y,
        width: bothAllocated ? 6 : 4,
        color,
      });
    }
  }

  return connections;
}
