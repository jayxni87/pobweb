// PoBWeb - Import Tab
// Share code paste, file import, file save.

import { importFromShareCode, importFromXml, readFileAsText, exportAsXml, copyShareCode } from '../io/file-manager.js';

export class ImportTab {
  constructor(container) {
    this.container = container;
    this.onImport = null;
    this.currentBuild = null;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="import-tab">
        <div class="import-section">
          <h3>Import from Share Code</h3>
          <textarea id="share-code-input" class="pob-edit import-textarea" rows="4"
            placeholder="Paste PoB share code here..."></textarea>
          <button class="pob-btn pob-btn-primary" id="import-code-btn">Import</button>
          <span class="import-status" id="import-code-status"></span>
        </div>

        <div class="import-section">
          <h3>Import from File</h3>
          <input type="file" id="file-input" accept=".xml,.txt" class="file-input">
          <label for="file-input" class="pob-btn">Choose File</label>
          <span class="import-status" id="import-file-status"></span>
        </div>

        <div class="import-section">
          <h3>Export</h3>
          <button class="pob-btn" id="export-xml-btn">Save as XML</button>
          <button class="pob-btn" id="export-code-btn">Copy Share Code</button>
          <span class="import-status" id="export-status"></span>
        </div>
      </div>
    `;

    this._wireEvents();
  }

  _wireEvents() {
    const importCodeBtn = this.container.querySelector('#import-code-btn');
    if (importCodeBtn) {
      importCodeBtn.addEventListener('click', () => this._importShareCode());
    }

    const fileInput = this.container.querySelector('#file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this._importFile(e));
    }

    const exportXmlBtn = this.container.querySelector('#export-xml-btn');
    if (exportXmlBtn) {
      exportXmlBtn.addEventListener('click', () => this._exportXml());
    }

    const exportCodeBtn = this.container.querySelector('#export-code-btn');
    if (exportCodeBtn) {
      exportCodeBtn.addEventListener('click', () => this._exportShareCode());
    }
  }

  _importShareCode() {
    const input = this.container.querySelector('#share-code-input');
    const status = this.container.querySelector('#import-code-status');
    if (!input || !input.value.trim()) return;

    try {
      const build = importFromShareCode(input.value);
      if (status) status.textContent = `Imported: ${build.name}`;
      if (this.onImport) this.onImport(build);
    } catch (e) {
      if (status) status.textContent = `Error: ${e.message}`;
    }
  }

  async _importFile(e) {
    const file = e.target.files?.[0];
    const status = this.container.querySelector('#import-file-status');
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const build = importFromXml(text);
      if (status) status.textContent = `Imported: ${build.name}`;
      if (this.onImport) this.onImport(build);
    } catch (err) {
      if (status) status.textContent = `Error: ${err.message}`;
    }
  }

  _exportXml() {
    if (!this.currentBuild) return;
    exportAsXml(this.currentBuild);
    const status = this.container.querySelector('#export-status');
    if (status) status.textContent = 'Saved!';
  }

  async _exportShareCode() {
    if (!this.currentBuild) return;
    const status = this.container.querySelector('#export-status');
    try {
      const code = await copyShareCode(this.currentBuild);
      if (status) status.textContent = 'Copied to clipboard!';
    } catch (e) {
      if (status) status.textContent = `Error: ${e.message}`;
    }
  }

  setBuild(build) {
    this.currentBuild = build;
  }
}
