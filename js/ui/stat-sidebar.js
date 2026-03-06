// PoBWeb - Stat Sidebar
// Always-visible sidebar showing key build stats, updated on calc results.

export class StatSidebar {
  constructor(el) {
    this.el = el;
  }

  update(output) {
    const f = StatSidebar.formatNumber;
    const p = StatSidebar.formatPercent;

    const str = output.Str || 0;
    const dex = output.Dex || 0;
    const int = output.Int || 0;
    const life = output.Life || 0;
    const mana = output.Mana || 0;
    const es = output.EnergyShield || 0;
    const armour = output.Armour || 0;
    const evasion = output.Evasion || 0;
    const fireRes = output.FireResist ?? 0;
    const coldRes = output.ColdResist ?? 0;
    const lightRes = output.LightningResist ?? 0;
    const chaosRes = output.ChaosResist ?? 0;
    const block = output.BlockChance ?? 0;
    const spellBlock = output.SpellBlockChance ?? 0;
    const suppression = output.SpellSuppressionChance ?? 0;

    this.el.innerHTML = `
      <div class="stat-section">
        <div class="stat-header">Attributes</div>
        <div class="stat-row"><span class="stat-label">Strength:</span><span class="stat-value">${f(str)}</span></div>
        <div class="stat-row"><span class="stat-label">Dexterity:</span><span class="stat-value">${f(dex)}</span></div>
        <div class="stat-row"><span class="stat-label">Intelligence:</span><span class="stat-value">${f(int)}</span></div>
      </div>
      <div class="stat-section">
        <div class="stat-header">Defence</div>
        <div class="stat-row"><span class="stat-label">Life:</span><span class="stat-value life">${f(life)}</span></div>
        <div class="stat-row"><span class="stat-label">Mana:</span><span class="stat-value mana">${f(mana)}</span></div>
        <div class="stat-row"><span class="stat-label">Energy Shield:</span><span class="stat-value es">${f(es)}</span></div>
        <div class="stat-row"><span class="stat-label">Armour:</span><span class="stat-value">${f(armour)}</span></div>
        <div class="stat-row"><span class="stat-label">Evasion:</span><span class="stat-value">${f(evasion)}</span></div>
      </div>
      <div class="stat-section">
        <div class="stat-header">Resistances</div>
        <div class="stat-row"><span class="stat-label">Fire:</span><span class="stat-value fire">${fireRes}%</span></div>
        <div class="stat-row"><span class="stat-label">Cold:</span><span class="stat-value cold">${coldRes}%</span></div>
        <div class="stat-row"><span class="stat-label">Lightning:</span><span class="stat-value lightning">${lightRes}%</span></div>
        <div class="stat-row"><span class="stat-label">Chaos:</span><span class="stat-value chaos">${chaosRes}%</span></div>
      </div>
      <div class="stat-section">
        <div class="stat-header">Block</div>
        <div class="stat-row"><span class="stat-label">Block:</span><span class="stat-value">${p(block)}</span></div>
        <div class="stat-row"><span class="stat-label">Spell Block:</span><span class="stat-value">${p(spellBlock)}</span></div>
        <div class="stat-row"><span class="stat-label">Suppression:</span><span class="stat-value">${p(suppression)}</span></div>
      </div>
    `;
  }

  static formatNumber(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  static formatPercent(n) {
    return (Math.round(n * 10) / 10) + '%';
  }
}
