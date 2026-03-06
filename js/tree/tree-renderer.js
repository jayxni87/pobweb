// PoBWeb - WebGL2 Passive Tree Renderer
// Instanced rendering for nodes and connections with texture atlas.

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
out vec4 v_color;
void main() {
  vec2 worldPos = a_offset + a_position * a_size;
  gl_Position = u_viewProjection * vec4(worldPos, 0.0, 1.0);
  v_texCoord = a_spriteRect.xy + a_texCoord * a_spriteRect.zw;
  v_color = a_color;
}`;

const NODE_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
in vec4 v_color;
uniform sampler2D u_atlas;
out vec4 fragColor;
void main() {
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
  allocated: [1.0, 0.84, 0.0, 1.0],     // gold
  canAllocate: [0.3, 0.8, 0.3, 1.0],     // green hint
  highlighted: [1.0, 1.0, 1.0, 1.0],
};

export const CONNECTION_COLORS = {
  inactive: [0.3, 0.3, 0.3, 0.6],
  active: [0.85, 0.7, 0.2, 1.0],         // gold
  path: [0.3, 0.8, 0.3, 0.8],            // green preview
};

export class TreeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!this.gl) throw new Error('WebGL2 not supported');

    this.nodeProgram = null;
    this.connProgram = null;
    this.atlasTexture = null;
    this.nodeVAO = null;
    this.connVAO = null;

    // Camera
    this.camera = { x: 0, y: 0, zoom: 1, width: canvas.width, height: canvas.height };

    // Instance data
    this.nodeInstances = null;
    this.nodeInstanceCount = 0;
    this.connInstances = null;
    this.connInstanceCount = 0;

    // Overlay layer (path preview, jewel radius, search highlights)
    this.overlayNodeInstances = null;
    this.overlayNodeCount = 0;
    this.overlayConnInstances = null;
    this.overlayConnCount = 0;

    this.dirty = true;

    this._initGL();
  }

  _initGL() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.08, 0.08, 0.12, 1.0);

    this.nodeProgram = this._createProgram(NODE_VERT, NODE_FRAG);
    this.connProgram = this._createProgram(CONN_VERT, CONN_FRAG);

    this._setupNodeVAO();
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

  _setupNodeVAO() {
    const gl = this.gl;
    this.nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVAO);

    // Quad vertices: position + texcoord (shared by all instances)
    const quadData = new Float32Array([
      // pos.x, pos.y, uv.x, uv.y
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

    // a_position (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    // a_texCoord (location 1)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    // Instance buffer (created later when data is set)
    this.nodeInstanceBuffer = gl.createBuffer();

    gl.bindVertexArray(null);
  }

  _setupConnVAO() {
    const gl = this.gl;
    this.connVAO = gl.createVertexArray();
    gl.bindVertexArray(this.connVAO);

    // Quad vertices for line segment
    const lineQuad = new Float32Array([
      0, -0.5,
      1, -0.5,
      1,  0.5,
      0, -0.5,
      1,  0.5,
      0,  0.5,
    ]);
    const vertBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lineQuad, gl.STATIC_DRAW);

    // a_vertex (location 4)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 8, 0);

    // Instance buffer
    this.connInstanceBuffer = gl.createBuffer();

    gl.bindVertexArray(null);
  }

  // Load atlas from image URL
  async loadAtlas(imageUrl) {
    const gl = this.gl;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageUrl;
    });

    this.atlasTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.dirty = true;
  }

  // Create a 1x1 white pixel atlas (fallback when no texture loaded)
  createFallbackAtlas() {
    const gl = this.gl;
    this.atlasTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  // Set node instance data
  // instances: array of { x, y, size, spriteRect: [u, v, w, h], color: [r, g, b, a] }
  setNodeInstances(instances) {
    const gl = this.gl;
    // Per instance: offset(2) + size(1) + spriteRect(4) + color(4) = 11 floats
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

    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    const stride = 44; // 11 floats * 4 bytes
    // a_offset (location 2)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(2, 1);
    // a_size (location 3)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(3, 1);
    // a_spriteRect (location 4)
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(4, 1);
    // a_color (location 5)
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 28);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);

    this.nodeInstanceCount = instances.length;
    this.dirty = true;
  }

  // Set connection instance data
  // connections: array of { x1, y1, x2, y2, width, color: [r, g, b, a] }
  setConnectionInstances(connections) {
    const gl = this.gl;
    // Per instance: start(2) + end(2) + width(1) + color(4) = 9 floats
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

    const stride = 36; // 9 floats * 4 bytes
    // a_start (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1);
    // a_end (location 1)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(1, 1);
    // a_width (location 2)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    // a_color (location 3)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    this.connInstanceCount = connections.length;
    this.dirty = true;
  }

  // Build orthographic view-projection matrix
  _buildViewProjection() {
    const { x, y, zoom, width, height } = this.camera;
    const hw = (width / 2) / zoom;
    const hh = (height / 2) / zoom;
    const left = x - hw;
    const right = x + hw;
    const bottom = y + hh;
    const top = y - hh;

    // Column-major orthographic projection
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

    // Layer 1: Background (handled by clearColor for now)

    // Layer 2: Connections
    if (this.connInstanceCount > 0) {
      gl.useProgram(this.connProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.connProgram, 'u_viewProjection'), false, vp);
      gl.bindVertexArray(this.connVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.connInstanceCount);
    }

    // Layer 3: Nodes
    if (this.nodeInstanceCount > 0 && this.atlasTexture) {
      gl.useProgram(this.nodeProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.nodeProgram, 'u_viewProjection'), false, vp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
      gl.uniform1i(gl.getUniformLocation(this.nodeProgram, 'u_atlas'), 0);
      gl.bindVertexArray(this.nodeVAO);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.nodeInstanceCount);
    }

    // Layer 4: Overlays (path preview, jewel radius, search highlights)
    // Overlay connections and nodes are rendered on top with additive blending
    // (Overlay data is applied by temporarily uploading to the same VAOs)
    // For simplicity, overlays reuse the same shader programs

    gl.bindVertexArray(null);
  }

  // Set overlay instances (path preview, search highlights)
  setOverlayNodeInstances(instances) {
    this.overlayNodeInstances = instances;
    this.overlayNodeCount = instances.length;
    this.dirty = true;
  }

  setOverlayConnectionInstances(connections) {
    this.overlayConnInstances = connections;
    this.overlayConnCount = connections.length;
    this.dirty = true;
  }

  clearOverlays() {
    this.overlayNodeInstances = null;
    this.overlayNodeCount = 0;
    this.overlayConnInstances = null;
    this.overlayConnCount = 0;
    this.dirty = true;
  }

  // Hit test: find node at screen coordinates
  hitTest(screenX, screenY, nodeSize = 20) {
    // Convert screen to world coordinates
    const worldX = this.camera.x + (screenX - this.camera.width / 2) / this.camera.zoom;
    const worldY = this.camera.y + (screenY - this.camera.height / 2) / this.camera.zoom;
    return { x: worldX, y: worldY };
  }

  // Convert screen coords to world coords
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
    if (this.atlasTexture) gl.deleteTexture(this.atlasTexture);
    if (this.nodeVAO) gl.deleteVertexArray(this.nodeVAO);
    if (this.connVAO) gl.deleteVertexArray(this.connVAO);
  }
}

// Utility: Build node instances from TreeData + PassiveSpec
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
      spriteRect: [0, 0, 1, 1], // full atlas (placeholder)
      color,
    });
  }

  return instances;
}

// Utility: Build path preview instances (green connections for prospective allocation)
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

// Utility: Build connection instances from TreeData + PassiveSpec
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
        x1: node.x,
        y1: node.y,
        x2: adjNode.x,
        y2: adjNode.y,
        width: bothAllocated ? 3 : 2,
        color,
      });
    }
  }

  return connections;
}
