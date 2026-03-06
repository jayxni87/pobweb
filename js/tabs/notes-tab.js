// PoBWeb - Notes Tab
// Simple textarea for build notes, saved in build XML.

export class NotesTab {
  constructor(container) {
    this.container = container;
    this.notes = '';
    this.onChange = null;

    this._init();
  }

  _init() {
    this.container.innerHTML = `
      <div class="notes-tab">
        <textarea id="notes-textarea" class="pob-edit notes-textarea"
          placeholder="Build notes...">${this.notes}</textarea>
      </div>
    `;

    const textarea = this.container.querySelector('#notes-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => {
        this.notes = textarea.value;
        if (this.onChange) this.onChange(this.notes);
      });
    }
  }

  setNotes(text) {
    this.notes = text || '';
    const textarea = this.container.querySelector('#notes-textarea');
    if (textarea) textarea.value = this.notes;
  }

  getNotes() {
    return this.notes;
  }
}
