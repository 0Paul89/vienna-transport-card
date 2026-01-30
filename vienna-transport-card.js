class ViennaTransportCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._prevFingerprints = {};
    this._expanded = {
      station: {},
      details: {}
    };
  }

  // Helper to avoid nullish coalescing (Safari 12-safe)
  _nv(value, fallback = '') {
    return value !== undefined && value !== null ? value : fallback;
  }

  set hass(hass) {
    const should = this._shouldRerender(hass);
    this._hass = hass;
    if (should) this._updateView();
  }

  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities)) {
      throw new Error('You need to define at least one entity');
    }
    this._config = {
      max_departures: config.max_departures || 3,
      entities: config.entities.map(entity => {
        if (typeof entity === 'string') {
          return { entity: entity, type: 'bim' };
        }
        return {
          entity: entity.entity,
          type: entity.type || 'bim',
          direction: entity.direction || null,
          lines: entity.lines || null
        };
      })
    };
    this._prevFingerprints = {};
    this._updateView();
  }

  _shouldRerender(hass) {
    if (!this._config || !this._config.entities) return true;
    const newFingerprints = {};
    let changed = false;

    for (const eCfg of this._config.entities) {
      const id = eCfg.entity;
      const state = hass.states[id];

      if (!state) {
        if (this._prevFingerprints[id] !== '__MISSING__') changed = true;
        newFingerprints[id] = '__MISSING__';
        continue;
      }

      const attrs = state.attributes || {};
      const stopId = this._nv(attrs.stop_id, '');
      const departures = Array.isArray(attrs.departures) ? attrs.departures : [];
      const depFingerprint = departures
        .slice(0, this._config.max_departures)
        .map(d =>
          `${this._nv(d.line)}|${this._nv(d.direction)}|${this._nv(d.countdown)}|${this._nv(d.time_real)}|${this._nv(d.time_planned)}|${Array.isArray(d.disturbances) ? d.disturbances.length : 0}`
        )
        .join(';;');

      const trafficInfo = Array.isArray(attrs.traffic_info) ? attrs.traffic_info : [];
      const trafficFingerprint = trafficInfo
        .map(t => `${this._nv(t.id, this._nv(t.title))}|${this._nv(t.priority)}`)
        .join(';;');

      const fingerprint = `${stopId}||${depFingerprint}||${trafficFingerprint}`;
      newFingerprints[id] = fingerprint;
      if (this._prevFingerprints[id] !== fingerprint) changed = true;
    }

    this._prevFingerprints = newFingerprints;
    return changed;
  }

  _updateView() {
    if (!this._hass) return;
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div class="card-content">
          ${this._generateStopCards()}
        </div>
        <style>${this._generateStyles()}</style>
      </ha-card>
    `;
    this._attachEventListeners();
  }

  _attachEventListeners() {
    this.shadowRoot.querySelectorAll('.station-disturbances').forEach(element => {
      element.addEventListener('click', () => {
        const entity = element.dataset.entity;
        const content = element.querySelector('.station-disturbances-content');
        const chevron = element.querySelector('.station-disturbances-header ha-icon:last-child');
        const nowShown = content.style.display === 'block';
        content.style.display = nowShown ? 'none' : 'block';
        if (chevron) chevron.setAttribute('icon', nowShown ? 'mdi:chevron-down' : 'mdi:chevron-up');
        this._expanded.station[entity] = !nowShown;
      });
    });

    this.shadowRoot.querySelectorAll('.disturbance-indicator').forEach(indicator => {
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        const entityId = indicator.dataset.entity;
        const index = indicator.dataset.index;
        const key = `${entityId}-${index}`;
        const details = this.shadowRoot.querySelector(`[data-disturbance="${key}"]`);
        if (details) {
          const nowShown = details.style.display === 'block';
          details.style.display = nowShown ? 'none' : 'block';
          this._expanded.details[key] = !nowShown;
        }
      });
    });
  }

  _getIconForType(type) {
    const iconMap = {
      'tram': 'tram',
      'bus': 'bus',
      'subway': 'subway-variant',
      'train': 'train',
      'ubahn': 'subway-variant',
      'sbahn': 'train',
      'nightbus': 'bus-clock'
    };
    return iconMap[type] || 'bus-stop';
  }

  _generateStopCards() {
    if (!this._config.entities || !this._config.entities.length) {
      return '<div class="error">No entities configured</div>';
    }

    return this._config.entities.map(entityConfig => {
      const entity = this._hass.states[entityConfig.entity];
      if (!entity) {
        return `
          <div class="line-card error">
            <div class="error-message">
              <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
              <span>Entity ${entityConfig.entity} not found</span>
            </div>
          </div>
        `;
      }

      const stopName = entity.attributes.stop_name || 'Unknown Stop';
      const departures = entity.attributes.departures || [];
      const trafficInfo = entity.attributes.traffic_info || [];
      const stopId = entity.attributes.stop_id;

      let filteredDepartures = departures;
      if (entityConfig.direction) {
        filteredDepartures = filteredDepartures.filter(dep => dep.direction === entityConfig.direction);
      }
      if (entityConfig.lines && Array.isArray(entityConfig.lines) && entityConfig.lines.length > 0) {
        filteredDepartures = filteredDepartures.filter(dep => entityConfig.lines.includes(dep.line));
      }

      const stationDisturbances = trafficInfo.filter(info =>
        info.related_stops && info.related_stops.includes(stopId)
      );
      const stationExpanded = !!this._expanded.station[entityConfig.entity];

      const filterBadges = [];
      if (entityConfig.direction) {
        filterBadges.push(`<span class="filter-badge direction-filter" title="Direction filter active">→ ${entityConfig.direction}</span>`);
      }
      if (entityConfig.lines && entityConfig.lines.length > 0) {
        filterBadges.push(`<span class="filter-badge lines-filter" title="Lines filter active">Lines: ${entityConfig.lines.join(', ')}</span>`);
      }

      return `
        <div class="line-card">
          <div class="line-header">
            <div class="line-title">
              <div class="line-icon ${entityConfig.type || 'bus'}"></div>
              <span class="line-name">${stopName}</span>
              ${filterBadges.join('')}
            </div>
          </div>
          ${stationDisturbances.length > 0 ? `
            <div class="station-disturbances" data-entity="${entityConfig.entity}">
              <div class="station-disturbances-header">
                <ha-icon icon="mdi:alert-circle"></ha-icon>
                <span>${stationDisturbances.length} station disturbance(s)</span>
                <ha-icon icon="${stationExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
              </div>
              <div class="station-disturbances-content" style="display: ${stationExpanded ? 'block' : 'none'};">
                ${stationDisturbances.map(info => `
                  <div class="disturbance-details ${info.priority === 'high' ? 'high-priority' : ''}">
                    <div class="disturbance-title">${info.title}</div>
                    <div class="disturbance-description">${info.description}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          <div class="departures">
            ${filteredDepartures.length === 0
              ? '<div class="no-departures">No departures matching the filter criteria</div>'
              : filteredDepartures.slice(0, this._config.max_departures).map((dep, index) =>
                  this._generateDepartureItem(dep, index, entityConfig.entity)
                ).join('')
            }
          </div>
        </div>
      `;
    }).join('');
  }

  _generateDepartureItem(dep, index, entityId) {
    const hasDisturbances = dep.disturbances && dep.disturbances.length > 0;
    const highPriority = hasDisturbances && dep.disturbances.some(d => d.priority === 'high');
    const detailKey = `${entityId}-${index}`;
    const detailsExpanded = !!this._expanded.details[detailKey];
    const foldingRamp = !!(dep.folding_ramp || dep.foldingRamp);

    return `
      <div class="departure-item">
        <div class="line-number">${dep.line}</div>
        <div class="departure-details">
          <div class="direction">
            ${dep.direction}
            ${dep.barrier_free ? '<ha-icon class="barrier-free-icon" icon="mdi:wheelchair-accessibility"></ha-icon>' : ''}
            ${foldingRamp ? '<ha-icon class="ac-icon folding-ramp-icon" icon="mdi:snowflake" title="Air conditioning (detected)"></ha-icon>' : ''}
            ${hasDisturbances ? `
              <span class="disturbance-indicator" data-entity="${entityId}" data-index="${index}">
                <ha-icon class="disturbance-icon ${highPriority ? 'high-priority' : ''}"
                         icon="mdi:alert${highPriority ? '' : '-circle-outline'}"></ha-icon>
              </span>
            ` : ''}
          </div>
          ${hasDisturbances ? `
            <div class="disturbance-details-content ${highPriority ? 'high-priority' : ''}"
                 data-disturbance="${detailKey}"
                 style="display: ${detailsExpanded ? 'block' : 'none'};">
              ${dep.disturbances.map(dist => `
                <div class="disturbance-title">${dist.title}</div>
                <div class="disturbance-description">${dist.description}</div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="countdown">${dep.countdown} min</div>
      </div>
    `;
  }

  _generateStyles() {
    return `
      :host {
        --vt-card-background: var(--ha-card-background, var(--card-background-color, #1e1e1e));
        --vt-primary-text: var(--primary-text-color, #ffffff);
        --vt-secondary-text: var(--secondary-text-color, #b3b3b3);
        --vt-accent: var(--primary-color, var(--accent-color, #00bcd4));
        --vt-success: var(--success-color, #4caf50);
        --vt-error: var(--error-color, #f44336);
        --vt-warning: var(--warning-color, #ff9800);
        --vt-info: var(--info-color, #2196f3);
        --vt-divider: var(--divider-color, rgba(255, 255, 255, 0.12));
        --vt-card-border: var(--ha-card-border-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
        --vt-shadow: var(--ha-card-box-shadow, 0 4px 8px rgba(0,0,0,0.3));
        --line-icon-color: var(--vt-accent);
        --line-icon-size: 24px;
        --departure-item-background: var(--primary-background-color, rgba(255, 255, 255, 0.05));
        --departure-item-border-radius: var(--ha-card-border-radius, 6px);
        --card-padding: 16px;
        --line-card-margin-bottom: 12px;
        --line-card-padding: 12px;
        --line-card-border-radius: var(--ha-card-border-radius, 10px);
        font-family: var(--primary-font-family, var(--paper-font-common-base_-_font-family, 'Roboto', sans-serif));
      }
      ha-card {
        background: var(--vt-card-background);
        color: var(--vt-primary-text);
        border-radius: var(--ha-card-border-radius, 12px);
        box-shadow: var(--vt-shadow);
        border: var(--ha-card-border-width, 1px) solid var(--vt-card-border);
      }
      .card-content { padding: var(--card-padding); }
      .line-card {
        margin-bottom: var(--line-card-margin-bottom);
        padding: var(--line-card-padding);
        border-radius: var(--line-card-border-radius);
        background: var(--primary-background-color, rgba(255, 255, 255, 0.04));
        transition: background-color 0.3s ease;
        border: 1px solid var(--vt-divider);
      }
      /* modern browsers */
      .line-card.error { background: color-mix(in srgb, var(--vt-error) 10%, transparent); }
      .station-disturbances { background: color-mix(in srgb, var(--vt-info) 10%, transparent); }
      .station-disturbances:hover { background: color-mix(in srgb, var(--vt-info) 15%, transparent); }
      .disturbance-details-content { background: color-mix(in srgb, var(--vt-warning) 10%, transparent); }
      .disturbance-details-content.high-priority { background: color-mix(in srgb, var(--vt-error) 10%, transparent); }
      .direction-filter { background: color-mix(in srgb, var(--vt-accent) 15%, transparent); }
      .lines-filter { background: color-mix(in srgb, var(--vt-info) 15%, transparent); }
      .platform-badge { background: color-mix(in srgb, var(--vt-primary-text) 10%, transparent); }

      .line-card.inactive { opacity: 0.6; }
      .line-header {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--vt-divider);
        padding-top: 8px;
      }
      .line-title {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        min-height: 32px;
      }
      .line-title .line-name {
        font-size: 1.2rem;
        font-weight: 500;
        color: var(--vt-primary-text);
        letter-spacing: -0.01em;
      }
      .filter-badge {
        font-size: 0.85rem;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 400;
      }
      .line-icon {
        width: var(--line-icon-size);
        height: var(--line-icon-size);
        margin-right: 8px;
        background-color: var(--line-icon-color);
        -webkit-mask-size: contain;
        mask-size: contain;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
      }
      /* ... icon masks unchanged ... (kept from your original) ... */
      .loading-indicator, .error-message, .inactive-message {
        display: flex; align-items: center; justify-content: center;
        padding: 10px 0; color: var(--vt-secondary-text);
      }
      .error-message ha-icon { color: var(--vt-error); margin-right: 5px; }
      .inactive-message ha-icon { color: var(--vt-secondary-text); margin-right: 5px; }
      .direction-header {
        display: flex; align-items: center; margin-bottom: 8px;
        font-weight: 500; font-size: 0.95rem; gap: 8px; flex-wrap: wrap;
      }
      .direction-header ha-icon { --mdc-icon-size: 18px; color: var(--vt-accent); }
      .line-number {
        font-weight: 700; font-size: 1rem; padding: 4px 8px; border-radius: 4px;
        background: var(--vt-accent); color: var(--text-primary-color, #000);
        min-width: 30px; text-align: center;
      }
      .direction { color: var(--vt-secondary-text); display: flex; align-items: center; gap: 4px; }
      .countdown {
        font-weight: 500; font-size: 1.1rem; color: var(--vt-accent);
        margin-left: 10px; white-space: nowrap;
      }
      .departure-item {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        margin-bottom: 6px;
        border-radius: var(--departure-item-border-radius);
        background: var(--departure-item-background);
        transition: background-color 0.2s ease-in-out;
      }
      .departure-item:hover { background: var(--secondary-background-color, rgba(255, 255, 255, 0.1)); }
      .departure-details { min-width: 0; }
      .no-departures {
        padding: 12px; text-align: center;
        color: var(--vt-secondary-text); font-style: italic;
      }
      .error { padding: 16px; text-align: center; color: var(--vt-error); }
      .station-disturbances {
        margin: 12px 0; padding: 12px;
        border-left: 3px solid var(--vt-info);
        border-radius: 4px; cursor: pointer;
        transition: background 0.2s ease;
      }
      .station-disturbances-header {
        display: flex; align-items: center; gap: 8px; font-weight: 500;
      }
      .station-disturbances-content { margin-top: 8px; }
      .disturbance-indicator {
        display: inline-flex; align-items: center;
        margin-left: 8px; cursor: pointer; transition: transform 0.2s ease;
      }
      .disturbance-indicator:hover { transform: scale(1.2); }
      .disturbance-icon { color: var(--vt-warning); --mdc-icon-size: 18px; animation: pulse 2s infinite; }
      .disturbance-icon.high-priority { color: var(--vt-error); }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      .disturbance-details-content {
        margin-top: 8px; padding: 12px;
        border-left: 3px solid var(--vt-warning);
        border-radius: 4px; font-size: 0.85rem; line-height: 1.4;
      }
      .disturbance-details-content.high-priority { border-left-color: var(--vt-error); }
      .disturbance-title { font-weight: 600; margin-bottom: 4px; color: var(--vt-primary-text); }
      .disturbance-description { color: var(--vt-secondary-text); }
      .barrier-free-icon { color: var(--vt-secondary-text); opacity: 0.4; --mdc-icon-size: 16px; }
      .ac-icon { color: var(--vt-info); --mdc-icon-size: 20px; }
      .folding-ramp-icon { color: var(--vt-info); opacity: 0.85; --mdc-icon-size: 24px; margin-left: 6px; vertical-align: middle; transform-origin: center; }

      /* iOS12 and old Safari fallback: override color-mix with RGBA */
      @supports (-webkit-touch-callout: none) and (not (line-break: anywhere)) {
        .line-card.error { background: rgba(244, 67, 54, 0.10); }
        .station-disturbances { background: rgba(33, 150, 243, 0.10); }
        .station-disturbances:hover { background: rgba(33, 150, 243, 0.15); }
        .disturbance-details-content { background: rgba(255, 152, 0, 0.10); }
        .disturbance-details-content.high-priority { background: rgba(244, 67, 54, 0.10); }
        .direction-filter { background: rgba(0, 188, 212, 0.15); }
        .lines-filter { background: rgba(33, 150, 243, 0.15); }
        .platform-badge { background: rgba(255, 255, 255, 0.10); }
      }
    `;
  }

  getCardSize() {
    return 2 + (this._config.entities ? this._config.entities.length : 0);
  }

  static getStubConfig() {
    return {
      title: 'Vienna Transport',
      max_departures: 3,
      entities: []
    };
  }
}

customElements.define('vienna-transport-card', ViennaTransportCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'vienna-transport-card',
  name: 'Vienna Transport Card',
  description: 'Display real-time Vienna public transport departures from WL Monitor sensors'
});
