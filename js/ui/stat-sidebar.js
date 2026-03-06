// PoBWeb - Stat Sidebar
// Always-visible sidebar showing key build stats, updated on calc results.

export class StatSidebar {
  constructor(el) {
    this.el = el;
  }

  update(output) {
    const f = StatSidebar.formatNumber;
    const p = StatSidebar.formatPercent;

    const life = output.Life || 0;
    const mana = output.Mana || 0;
    const es = output.EnergyShield || 0;
    const dps = output.TotalDPS || 0;
    const crit = output.CritChance || 0;
    const hit = output.HitChance || 0;
    const speed = output.Speed || 0;
    const fireRes = output.FireResist ?? 0;
    const coldRes = output.ColdResist ?? 0;
    const lightRes = output.LightningResist ?? 0;
    const chaosRes = output.ChaosResist ?? 0;

    this.el.innerHTML = `
      <div class="stat-section">
        <div class="stat-header">Defence</div>
        <div class="stat-row"><span class="stat-label">Life:</span><span class="stat-value life">${f(life)}</span></div>
        <div class="stat-row"><span class="stat-label">Mana:</span><span class="stat-value mana">${f(mana)}</span></div>
        ${es > 0 ? `<div class="stat-row"><span class="stat-label">ES:</span><span class="stat-value es">${f(es)}</span></div>` : ''}
      </div>
      <div class="stat-section">
        <div class="stat-header">Offence</div>
        <div class="stat-row"><span class="stat-label">Total DPS:</span><span class="stat-value dps">${f(dps)}</span></div>
        <div class="stat-row"><span class="stat-label">Crit Chance:</span><span class="stat-value">${p(crit)}</span></div>
        <div class="stat-row"><span class="stat-label">Hit Chance:</span><span class="stat-value">${p(hit)}</span></div>
        <div class="stat-row"><span class="stat-label">Speed:</span><span class="stat-value">${speed.toFixed(2)}</span></div>
      </div>
      <div class="stat-section">
        <div class="stat-header">Resistances</div>
        <div class="stat-row"><span class="stat-label">Fire:</span><span class="stat-value fire">${fireRes}%</span></div>
        <div class="stat-row"><span class="stat-label">Cold:</span><span class="stat-value cold">${coldRes}%</span></div>
        <div class="stat-row"><span class="stat-label">Lightning:</span><span class="stat-value lightning">${lightRes}%</span></div>
        <div class="stat-row"><span class="stat-label">Chaos:</span><span class="stat-value chaos">${chaosRes}%</span></div>
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
