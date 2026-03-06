// PoBWeb - Tree Interaction (pan/zoom/click/hover)
// Event handling for the passive tree canvas.

export class TreeInteraction {
  constructor(renderer, treeData) {
    this.renderer = renderer;
    this.treeData = treeData;

    // Zoom limits
    this.minZoom = 0.1;
    this.maxZoom = 10;
    this.zoomSpeed = 0.15;

    // Drag state
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragCamStartX = 0;
    this._dragCamStartY = 0;

    // Hit test radius (screen pixels)
    this.hitRadius = 20;

    // Callbacks
    this.onNodeClick = null;
    this.onNodeHover = null;

    // Node spatial index for fast lookup
    this._nodeList = Object.values(treeData.nodes);
  }

  // Start a drag operation
  startDrag(screenX, screenY) {
    this._dragging = true;
    this._dragStartX = screenX;
    this._dragStartY = screenY;
    this._dragCamStartX = this.renderer.camera.x;
    this._dragCamStartY = this.renderer.camera.y;
  }

  // Continue drag
  drag(screenX, screenY) {
    if (!this._dragging) return;
    const dx = (screenX - this._dragStartX) / this.renderer.camera.zoom;
    const dy = (screenY - this._dragStartY) / this.renderer.camera.zoom;
    this.renderer.setCamera(
      this._dragCamStartX - dx,
      this._dragCamStartY - dy,
      this.renderer.camera.zoom,
    );
  }

  // End drag
  endDrag() {
    this._dragging = false;
  }

  // Zoom towards a screen position
  // delta: positive = zoom in, negative = zoom out
  zoom(screenX, screenY, delta) {
    const cam = this.renderer.camera;
    const oldZoom = cam.zoom;
    const factor = delta > 0 ? (1 + this.zoomSpeed) : (1 / (1 + this.zoomSpeed));
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom * factor));

    // Zoom towards cursor: adjust camera so the world point under cursor stays fixed
    const worldBefore = this.renderer.screenToWorld(screenX, screenY);
    cam.zoom = newZoom;
    const worldAfter = this.renderer.screenToWorld(screenX, screenY);

    this.renderer.setCamera(
      cam.x + (worldBefore.x - worldAfter.x),
      cam.y + (worldBefore.y - worldAfter.y),
      newZoom,
    );
  }

  // Find nearest node to a world position within radius
  findNodeAt(worldX, worldY, radius) {
    let bestNode = null;
    let bestDist = radius * radius;

    for (const node of this._nodeList) {
      const dx = node.x - worldX;
      const dy = node.y - worldY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestNode = node;
      }
    }

    return bestNode;
  }

  // Handle click at screen coordinates
  click(screenX, screenY) {
    const world = this.renderer.screenToWorld(screenX, screenY);
    const hitRadiusWorld = this.hitRadius / this.renderer.camera.zoom;
    const node = this.findNodeAt(world.x, world.y, hitRadiusWorld);
    if (this.onNodeClick) {
      this.onNodeClick(node);
    }
    return node;
  }

  // Handle hover at screen coordinates
  hover(screenX, screenY) {
    const world = this.renderer.screenToWorld(screenX, screenY);
    const hitRadiusWorld = this.hitRadius / this.renderer.camera.zoom;
    const node = this.findNodeAt(world.x, world.y, hitRadiusWorld);
    if (this.onNodeHover) {
      this.onNodeHover(node, screenX, screenY);
    }
    return node;
  }

  // Attach event listeners to a canvas element
  attachToCanvas(canvas) {
    let lastTouchDist = 0;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.startDrag(e.offsetX, e.offsetY);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this._dragging) {
        // If mouse button was released outside canvas, stop dragging
        if (e.buttons === 0) {
          this.endDrag();
          return;
        }
        this.drag(e.offsetX, e.offsetY);
      } else {
        this.hover(e.offsetX, e.offsetY);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        // Only count as click if didn't drag far
        const dx = e.offsetX - this._dragStartX;
        const dy = e.offsetY - this._dragStartY;
        if (dx * dx + dy * dy < 25) {
          this.click(e.offsetX, e.offsetY);
        }
        this.endDrag();
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      this.zoom(e.offsetX, e.offsetY, delta);
    }, { passive: false });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        this.startDrag(t.clientX - rect.left, t.clientY - rect.top);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this._dragging) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        this.drag(t.clientX - rect.left, t.clientY - rect.top);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastTouchDist > 0) {
          const rect = canvas.getBoundingClientRect();
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          const delta = dist > lastTouchDist ? 1 : -1;
          this.zoom(cx, cy, delta);
        }
        lastTouchDist = dist;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.endDrag();
      lastTouchDist = 0;
    });
  }
}
