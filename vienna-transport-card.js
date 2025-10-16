class ViennaTransportCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;

    // state to avoid unnecessary rerenders and to preserve UI toggles
    this._prevFingerprints = {};
    this._expanded = {
      station: {},            // keyed by entity id
      details: {}             // keyed by `${entityId}-${index}`
    };
  }

  set hass(hass) {
    // always update internal hass reference for live reads,
    // but only rerender when fingerprints changed
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
          direction: entity.direction || null
        };
      })
    };

    // force full render after config change
    this._prevFingerprints = {};
    this._updateView();
  }

  // Decide if the render should happen by creating a stable fingerprint
  _shouldRerender(hass) {
    if (!this._config || !this._config.entities) return true;
    const newFingerprints = {};
    let changed = false;

    for (const eCfg of this._config.entities) {
      const id = eCfg.entity;
      const state = hass.states[id];

      // if entity missing we want to render (error message)
      if (!state) {
        if (this._prevFingerprints[id] !== '__MISSING__') changed = true;
        newFingerprints[id] = '__MISSING__';
        continue;
      }

      const attrs = state.attributes || {};
      // Build compact fingerprint: stop_id + departures length + departures key fields + traffic_info count + last update
      const stopId = attrs.stop_id || '';
      const departures = Array.isArray(attrs.departures) ? attrs.departures : [];
      const depFingerprint = departures.slice(0, this._config.max_departures).map(d =>
        `${d.line ?? ''}|${d.direction ?? ''}|${d.countdown ?? ''}|${d.time_real ?? ''}|${d.time_planned ?? ''}|${(d.disturbances && d.disturbances.length) ?? 0}`
      ).join(';;');
      const trafficInfo = Array.isArray(attrs.traffic_info) ? attrs.traffic_info : [];
      const trafficFingerprint = trafficInfo.map(t => `${t.id??t.title??''}|${t.priority??''}`).join(';;');

      const fingerprint = `${stopId}||${depFingerprint}||${trafficFingerprint}`;

      newFingerprints[id] = fingerprint;
      if (this._prevFingerprints[id] !== fingerprint) changed = true;
    }

    // store latest fingerprints for next comparison
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

    // Re-attach listeners after new DOM created
    this._attachEventListeners();
  }

  _attachEventListeners() {
    // Station disturbances toggle
    this.shadowRoot.querySelectorAll('.station-disturbances').forEach(element => {
      element.addEventListener('click', (e) => {
        const entity = element.dataset.entity;
        const content = element.querySelector('.station-disturbances-content');
        const chevron = element.querySelector('.station-disturbances-header ha-icon:last-child');

        const nowShown = content.style.display === 'block';
        // toggle
        content.style.display = nowShown ? 'none' : 'block';
        if (chevron) chevron.setAttribute('icon', nowShown ? 'mdi:chevron-down' : 'mdi:chevron-up');

        // persist expanded state so it is preserved across renders
        this._expanded.station[entity] = !nowShown;
      });
    });

    // Individual disturbance indicators toggle
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

      // Filter departures by direction if specified
      const filteredDepartures = entityConfig.direction 
        ? departures.filter(dep => dep.direction === entityConfig.direction)
        : departures;

      // Station-wide disturbances
      const stationDisturbances = trafficInfo.filter(info => 
        info.related_stops && info.related_stops.includes(stopId)
      );

      // check persisted expanded state
      const stationExpanded = !!this._expanded.station[entityConfig.entity];

      return `
  <div class="line-card">
    <div class="line-header">
      <div class="line-title">
        <div class="line-icon ${entityConfig.type || 'bus'}"></div>
        <span class="line-name">${stopName}</span>
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
          ${filteredDepartures.slice(0, this._config.max_departures).map((dep, index) => 
            this._generateDepartureItem(dep, index, entityConfig.entity)
          ).join('')}
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

  // accept both snake_case and camelCase in case source varies
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


  _isDelayed(departure) {
    if (!departure.time_planned || !departure.time_real) return false;
    const planned = new Date(departure.time_planned).getTime();
    const real = new Date(departure.time_real).getTime();
    return real > planned + 60000; // More than 1 minute delay
  }

  _getDelayMinutes(departure) {
    if (!departure.time_planned || !departure.time_real) return 0;
    const planned = new Date(departure.time_planned).getTime();
    const real = new Date(departure.time_real).getTime();
    return Math.floor((real - planned) / 60000);
  }

  _formatTime(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  _generateStyles() {
    return `
      :host {
        /* Use HA theme variables with sensible fallbacks */
        --vt-card-background: var(--ha-card-background, var(--card-background-color, #1e1e1e));
        --vt-primary-text: var(--primary-text-color, #ffffff);
        --vt-secondary-text: var(--secondary-text-color, #b3b3b3);
        --vt-accent: var(--primary-color, var(--accent-color, #00bcd4));
        --vt-success: var(--success-color, #4caf50);
        --vt-error: var(--error-color, #f44336);
        --vt-warning: var(--warning-color, #ff9800);
        --vt-info: var(--info-color, #2196f3);
        --vt-divider: var(--divider-color, rgba(255, 255, 255, 0.12));
        
        /* Derived colors for better theme integration */
        --vt-card-border: var(--ha-card-border-color, var(--divider-color, rgba(255, 255, 255, 0.08)));
        --vt-shadow: var(--ha-card-box-shadow, 0 4px 8px rgba(0,0,0,0.3));
        
        /* Component-specific variables */
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
      
      .card-content {
        padding: var(--card-padding);
      }
      
      .line-card {
        margin-bottom: var(--line-card-margin-bottom);
        padding: var(--line-card-padding);
        border-radius: var(--line-card-border-radius);
        background: var(--primary-background-color, rgba(255, 255, 255, 0.04));
        transition: background-color 0.3s ease;
        border: 1px solid var(--vt-divider);
      }
      
      .line-card.error {
        background: color-mix(in srgb, var(--vt-error) 10%, transparent);
      }
      
      .line-card.inactive {
        opacity: 0.6;
      }
      
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
      
      .direction-filter {
        font-size: 0.85rem;
        color: var(--vt-accent);
        background: color-mix(in srgb, var(--vt-accent) 15%, transparent);
        padding: 2px 6px;
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
      
      .line-icon.bim {
        -webkit-mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19,16.94V8.5C19,5.71 16.39,5.1 13,5L13.75,3.5H17V2H7V3.5H11.75L11,5C7.86,5.11 5,5.73 5,8.5V16.94C5,18.39 6.19,19.6 7.59,19.91L6,21.5V22H8.23L10.23,20H14L16,22H18V21.5L16.5,20H16.42C18.11,20 19,18.63 19,16.94M12,18.5A1.5,1.5 0 0,1 10.5,17A1.5,1.5 0 0,1 12,15.5A1.5,1.5 0 0,1 13.5,17A1.5,1.5 0 0,1 12,18.5M17,14H7V9H17V14Z" /></svg>');
        mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19,16.94V8.5C19,5.71 16.39,5.1 13,5L13.75,3.5H17V2H7V3.5H11.75L11,5C7.86,5.11 5,5.73 5,8.5V16.94C5,18.39 6.19,19.6 7.59,19.91L6,21.5V22H8.23L10.23,20H14L16,22H18V21.5L16.5,20H16.42C18.11,20 19,18.63 19,16.94M12,18.5A1.5,1.5 0 0,1 10.5,17A1.5,1.5 0 0,1 12,15.5A1.5,1.5 0 0,1 13.5,17A1.5,1.5 0 0,1 12,18.5M17,14H7V9H17V14Z" /></svg>');
      }
      
      .line-icon.bus {
        -webkit-mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M18,11H6V6H18M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M4,16C4,16.88 4.39,17.67 5,18.22V20A1,1 0 0,0 6,21H7A1,1 0 0,0 8,20V19H16V20A1,1 0 0,0 17,21H18A1,1 0 0,0 19,20V18.22C19.61,17.67 20,16.88 20,16V6C20,2.5 16.42,2 12,2C7.58,2 4,2.5 4,6V16Z" /></svg>');
        mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M18,11H6V6H18M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M4,16C4,16.88 4.39,17.67 5,18.22V20A1,1 0 0,0 6,21H7A1,1 0 0,0 8,20V19H16V20A1,1 0 0,0 17,21H18A1,1 0 0,0 19,20V18.22C19.61,17.67 20,16.88 20,16V6C20,2.5 16.42,2 12,2C7.58,2 4,2.5 4,6V16Z" /></svg>');
      }
      
      .line-icon.train {
        -webkit-mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12,2C8,2 4,2.5 4,6V15.5A3.5,3.5 0 0,0 7.5,19L6,20.5V21H8.23L10.23,19H14L16,21H18V20.5L16.5,19A3.5,3.5 0 0,0 20,15.5V6C20,2.5 16.42,2 12,2M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M11,10H6V6H11V10M13,10V6H18V10H13M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17Z" /></svg>');
        mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12,2C8,2 4,2.5 4,6V15.5A3.5,3.5 0 0,0 7.5,19L6,20.5V21H8.23L10.23,19H14L16,21H18V20.5L16.5,19A3.5,3.5 0 0,0 20,15.5V6C20,2.5 16.42,2 12,2M7.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,14A1.5,1.5 0 0,1 9,15.5A1.5,1.5 0 0,1 7.5,17M11,10H6V6H11V10M13,10V6H18V10H13M16.5,17A1.5,1.5 0 0,1 15,15.5A1.5,1.5 0 0,1 16.5,14A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 16.5,17Z" /></svg>');
      }
      
      .line-icon.subway {
        -webkit-mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8.5,15A1,1 0 0,1 9.5,16A1,1 0 0,1 8.5,17A1,1 0 0,1 7.5,16A1,1 0 0,1 8.5,15M7,9H17V14H7V9M15.5,15A1,1 0 0,1 16.5,16A1,1 0 0,1 15.5,17A1,1 0 0,1 14.5,16A1,1 0 0,1 15.5,15M18,15.88V9C18,6.38 15.32,6 12,6C9,6 6,6.37 6,9V15.88A2.62,2.62 0 0,0 8.62,18.5L7.5,19.62V20H9.17L10.67,18.5H13.5L15,20H16.5V19.62L15.37,18.5C16.82,18.5 18,17.33 18,15.88M17.8,2.8C20.47,3.84 22,6.05 22,8.86V22H2V8.86C2,6.05 3.53,3.84 6.2,2.8C8,2.09 10.14,2 12,2C13.86,2 16,2.09 17.8,2.8Z" /></svg>');
        mask-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8.5,15A1,1 0 0,1 9.5,16A1,1 0 0,1 8.5,17A1,1 0 0,1 7.5,16A1,1 0 0,1 8.5,15M7,9H17V14H7V9M15.5,15A1,1 0 0,1 16.5,16A1,1 0 0,1 15.5,17A1,1 0 0,1 14.5,16A1,1 0 0,1 15.5,15M18,15.88V9C18,6.38 15.32,6 12,6C9,6 6,6.37 6,9V15.88A2.62,2.62 0 0,0 8.62,18.5L7.5,19.62V20H9.17L10.67,18.5H13.5L15,20H16.5V19.62L15.37,18.5C16.82,18.5 18,17.33 18,15.88M17.8,2.8C20.47,3.84 22,6.05 22,8.86V22H2V8.86C2,6.05 3.53,3.84 6.2,2.8C8,2.09 10.14,2 12,2C13.86,2 16,2.09 17.8,2.8Z" /></svg>');
      }
      
      .station-name {
        font-size: 0.95rem;
        color: var(--vt-secondary-text);
        font-style: italic;
        margin-left: auto;
      }
      
      .loading-indicator, .error-message, .inactive-message {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 0;
        color: var(--vt-secondary-text);
      }
      
      .error-message ha-icon {
        color: var(--vt-error);
        margin-right: 5px;
      }
      
      .inactive-message ha-icon {
        color: var(--vt-secondary-text);
        margin-right: 5px;
      }
      
      .direction-departures {
        margin-bottom: 12px;
      }
      
      .direction-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 500;
        font-size: 0.95rem;
        gap: 8px;
        flex-wrap: wrap;
      }
      
      .direction-header ha-icon {
        --mdc-icon-size: 18px;
        color: var(--vt-accent);
      }
      
      .line-number {
        font-weight: 700;
        font-size: 1rem;
        padding: 4px 8px;
        border-radius: 4px;
        background: var(--vt-accent);
        color: var(--text-primary-color, #000);
        min-width: 30px;
        text-align: center;
      }
      
      .direction-name {
        color: var(--vt-primary-text);
        font-weight: 400;
      }
      
      .platform-badge {
        font-size: 0.75rem;
        color: var(--vt-secondary-text);
        background: color-mix(in srgb, var(--vt-primary-text) 10%, transparent);
        padding: 3px 6px;
        border-radius: 3px;
        margin-left: auto;
      }
      
      .departure-list {
        list-style: none;
        padding: 0;
        margin: 0;
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
      
      .departure-item:hover {
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.1));
      }
      
      .departure-time {
        font-weight: 500;
        font-size: 1.1rem;
        margin-right: 10px;
        color: var(--vt-primary-text);
      }
      
      .departure-destination {
        color: var(--vt-secondary-text);
        flex-grow: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .departure-details {
        min-width: 0;
       }
      
      .direction {
        color: var(--vt-secondary-text);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      
      .countdown {
        font-weight: 500;
        font-size: 1.1rem;
        color: var(--vt-accent);
        margin-left: 10px;
        white-space: nowrap;
      }
      
      .vehicle-features {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
      }
      
      .barrier-free-icon {
        color: var(--vt-secondary-text);
        opacity: 0.4;
        --mdc-icon-size: 16px;
      }
      
      .ac-icon {
        color: var(--vt-info);
        --mdc-icon-size: 20px;
      }
      
      .minutes-until {
        font-size: 0.9rem;
        color: var(--vt-accent);
        margin-left: 10px;
      }
      
      .no-departures {
        padding: 12px;
        text-align: center;
        color: var(--vt-secondary-text);
        font-style: italic;
      }
      
      .error {
        padding: 16px;
        text-align: center;
        color: var(--vt-error);
      }
      
      .station-disturbances {
        margin: 12px 0;
        padding: 12px;
        background: color-mix(in srgb, var(--vt-info) 10%, transparent);
        border-left: 3px solid var(--vt-info);
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      
      .station-disturbances:hover {
        background: color-mix(in srgb, var(--vt-info) 15%, transparent);
      }
      
      .station-disturbances-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
      }
      
      .station-disturbances-content {
        margin-top: 8px;
      }
      
      .disturbance-indicator {
        display: inline-flex;
        align-items: center;
        margin-left: 8px;
        cursor: pointer;
        transition: transform 0.2s ease;
      }
      
      .disturbance-indicator:hover {
        transform: scale(1.2);
      }
      
      .disturbance-icon {
        color: var(--vt-warning);
        --mdc-icon-size: 18px;
        animation: pulse 2s infinite;
      }
      
      .disturbance-icon.high-priority {
        color: var(--vt-error);
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      
      .disturbance-details-content {
        margin-top: 8px;
        padding: 12px;
        background: color-mix(in srgb, var(--vt-warning) 10%, transparent);
        border-left: 3px solid var(--vt-warning);
        border-radius: 4px;
        font-size: 0.85rem;
        line-height: 1.4;
      }
      
      .disturbance-details-content.high-priority {
        background: color-mix(in srgb, var(--vt-error) 10%, transparent);
        border-left-color: var(--vt-error);
      }
      
      .disturbance-title {
        font-weight: 600;
        margin-bottom: 4px;
        color: var(--vt-primary-text);
      }
      
      .disturbance-description {
        color: var(--vt-secondary-text);
      }
      
      .folding-ramp-icon {
        color: var(--vt-info);
        opacity: 0.85;
        --mdc-icon-size: 24px;
        margin-left: 6px;
        vertical-align: middle;
        transform-origin: center;
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
