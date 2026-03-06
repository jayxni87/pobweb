import { describe, it, expect } from 'vitest';
import { TreeInteraction } from '../tree-interaction.js';

// Mock renderer with camera
function mockRenderer() {
  return {
    camera: { x: 0, y: 0, zoom: 1, width: 800, height: 600 },
    dirty: false,
    setCamera(x, y, zoom) {
      this.camera.x = x;
      this.camera.y = y;
      this.camera.zoom = zoom;
      this.dirty = true;
    },
    screenToWorld(sx, sy) {
      return {
        x: this.camera.x + (sx - this.camera.width / 2) / this.camera.zoom,
        y: this.camera.y + (sy - this.camera.height / 2) / this.camera.zoom,
      };
    },
  };
}

// Mock tree data with node positions
function mockTreeData() {
  return {
    nodes: {
      1: { id: 1, x: 0, y: 0, name: 'Start', type: 'classStart', stats: [] },
      2: { id: 2, x: 100, y: 0, name: 'Node A', type: 'normal', stats: ['+10 Str'] },
      3: { id: 3, x: 200, y: 0, name: 'Node B', type: 'notable', stats: ['Big'] },
    },
  };
}

describe('TreeInteraction', () => {
  it('constructs with renderer and treeData', () => {
    const interaction = new TreeInteraction(mockRenderer(), mockTreeData());
    expect(interaction).toBeDefined();
  });

  it('pans camera on drag', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    interaction.startDrag(400, 300);
    interaction.drag(500, 350);
    // Camera should move opposite to drag direction
    expect(renderer.camera.x).toBeLessThan(0);
    expect(renderer.camera.y).toBeLessThan(0);
  });

  it('zooms camera', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    interaction.zoom(400, 300, 1); // zoom in
    expect(renderer.camera.zoom).toBeGreaterThan(1);
  });

  it('zooms out', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    interaction.zoom(400, 300, -1); // zoom out
    expect(renderer.camera.zoom).toBeLessThan(1);
  });

  it('clamps zoom to min/max', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    // Zoom way out
    for (let i = 0; i < 50; i++) interaction.zoom(400, 300, -1);
    expect(renderer.camera.zoom).toBeGreaterThanOrEqual(interaction.minZoom);
    // Zoom way in
    for (let i = 0; i < 100; i++) interaction.zoom(400, 300, 1);
    expect(renderer.camera.zoom).toBeLessThanOrEqual(interaction.maxZoom);
  });

  it('finds nearest node to world position', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    const node = interaction.findNodeAt(5, 5, 30); // near origin
    expect(node).toBeDefined();
    expect(node.id).toBe(1);
  });

  it('returns null when no node nearby', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    const node = interaction.findNodeAt(9999, 9999, 30);
    expect(node).toBeNull();
  });

  it('handles click at screen coordinates', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    let clickedNode = null;
    interaction.onNodeClick = (node) => { clickedNode = node; };
    // Screen center (400,300) → world (0,0) → node 1
    interaction.click(400, 300);
    expect(clickedNode).toBeDefined();
    expect(clickedNode.id).toBe(1);
  });

  it('handles hover at screen coordinates', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    let hoveredNode = null;
    interaction.onNodeHover = (node) => { hoveredNode = node; };
    interaction.hover(400, 300);
    expect(hoveredNode).toBeDefined();
    expect(hoveredNode.id).toBe(1);
  });

  it('reports null hover when not over a node', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    let hoveredNode = 'sentinel';
    interaction.onNodeHover = (node) => { hoveredNode = node; };
    interaction.hover(0, 0); // top-left corner → far from nodes
    expect(hoveredNode).toBeNull();
  });

  it('zoom towards cursor adjusts camera position', () => {
    const renderer = mockRenderer();
    const interaction = new TreeInteraction(renderer, mockTreeData());
    // Zoom in towards a point offset from center
    interaction.zoom(600, 300, 1); // right side of screen
    // Camera should shift towards the right (positive x)
    expect(renderer.camera.x).toBeGreaterThan(0);
  });
});
