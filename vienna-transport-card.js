class ViennaTransportCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
        this._hass = null;
        this._lines = {};
        this._departures = {};
        this._timers = {};
    }

    set hass(hass) {
        this._hass = hass;
        this._updateData();
        this._updateView();
    }

    setConfig(config) {
        if (!config.lines || !Array.isArray(config.lines)) {
            throw new Error('You need to define at least one line');
        }

        this._config = {
            title: config.title || 'Vienna Transport',
            update_interval: config.update_interval || 60,
            max_departures: config.max_departures || 3,
            lines: config.lines.map(line => {
                return {
                    id: line.id,
                    station_id: line.station_id || 'vao:490108800',
                    name: line.name || line.id,
                    type: line.type || 'bim'
                };
            })
        };

        this._lines = {};
        this._config.lines.forEach(line => {
            this._lines[line.id] = line;
        });

        this._setupTimers();
        this._updateView();
    }

    _setupTimers() {
        Object.values(this._timers).forEach(timer => clearInterval(timer));
        this._timers = {};

        Object.keys(this._lines).forEach(lineId => {
            this._timers[lineId] = setInterval(() => {
                this._fetchLineData(lineId);
            }, this._config.update_interval * 1000);
        });
    }

    async _updateData() {
        if (!this._hass || !this._config.lines) return;

        for (const lineId of Object.keys(this._lines)) {
            this._fetchLineData(lineId);
        }
    }

    async _fetchLineData(lineId) {
        if (!this._hass) return;

        const line = this._lines[lineId];
        try {
            const data = await this._callWienmobilApi(line.station_id, lineId);
            this._departures[lineId] = this._processApiResponse(data, lineId);
            this._updateView();
        } catch (error) {
            console.error(`Error fetching data for line ${lineId}:`, error);
            this._departures[lineId] = { error: true, message: error.message };
            this._updateView();
        }
    }

    async _callWienmobilApi(stationId, lineId) {
        try {
            const now = new Date();
            const isoTime = now.toISOString();

            const encodedStation = encodeURIComponent(stationId);
            const url = `https://www.wienmobil.at/api/public-transport-stations/${encodedStation}/lines/${lineId}?departuresLimit=${this._config.max_departures}&departuresAt=${isoTime}`;

            const response = await fetch(url, {
                headers: {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
                }
            });

            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error("API call error:", error);
            throw error;
        }
    }

    _processApiResponse(data, lineId) {
        const stationName = data?.station?.name || 'Unknown Station';
        const lines = data?.station?.lines || [];

        if (!lines.length) {
            return {
                active: false,
                station: stationName,
                error: false
            };
        }

        const status = lines[0]?.status || '';
        const active = status.includes('active');

        const departures = {};
        const trips = lines[0]?.trips || [];

        for (const trip of trips) {
            const direction = trip.tripHeadsign || 'Unknown';
            departures[direction] = [];

            for (const departure of (trip.departures || [])) {
                const planned = new Date(departure.plannedAt);
                const estimated = departure.estimatedAt ? new Date(departure.estimatedAt) : planned;

                const minutesUntilDeparture = Math.ceil((estimated.getTime() - Date.now()) / 60000);

                departures[direction].push({
                    time: this._formatTime(estimated),
                    destination: direction,
                    minutesUntilDeparture: minutesUntilDeparture,
                    facilities: departure.facilities || [],
                    hash: Date.now() + Math.random()
                });
            }
        }

        return {
            active,
            station: stationName,
            departures,
            error: false
        };
    }

    _formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    _updateView() {
        if (!this._hass) return;

        this.shadowRoot.innerHTML = `
            <ha-card>
                <div class="card-header">
                    <div class="title">${this._config.title}</div>
                </div>
                <div class="card-content">
                    ${this._generateLineCards()}
                </div>
                <style>
                    ${this._generateStyles()}
                </style>
            </ha-card>
        `;
    }

    _generateLineCards() {
        if (!Object.keys(this._lines).length) {
            return '<div class="error">No transport lines configured</div>';
        }

        return Object.keys(this._lines).map(lineId => {
            const line = this._lines[lineId];
            const data = this._departures[lineId];

            if (!data) {
                return `
                    <div class="line-card loading" id="${lineId}-card">
                        <div class="line-header">
                            <div class="line-title">
                                <div class="line-icon ${line.type || 'bim'}"></div>
                                <span class="line-name">${lineId}</span>
                            </div>
                            <div class="station-name">${line.name || lineId}</div>
                        </div>
                        <div class="loading-indicator">
                            <ha-circular-progress indeterminate size="small"></ha-circular-progress>
                            <span>Loading data...</span>
                        </div>
                    </div>
                `;
            }

            if (data.error) {
                return `
                    <div class="line-card error" id="${lineId}-card">
                        <div class="line-header">
                            <div class="line-title">
                                <div class="line-icon ${line.type || 'bim'} error"></div>
                                <span class="line-name">${lineId}</span>
                            </div>
                            <div class="station-name">${data.station || line.name || 'Unknown Station'}</div>
                        </div>
                        <div class="error-message">
                            <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                            <span>Error loading departures</span>
                        </div>
                    </div>
                `;
            }

            if (!data.active) {
                return `
                    <div class="line-card inactive" id="${lineId}-card">
                        <div class="line-header">
                            <div class="line-title">
                                <div class="line-icon ${line.type || 'bim'} inactive"></div>
                                <span class="line-name">${lineId}</span>
                            </div>
                            <div class="station-name">${data.station || line.name || 'Unknown Station'}</div>
                        </div>
                        <div class="inactive-message">
                            <ha-icon icon="mdi:information-outline"></ha-icon>
                            <span>Line is currently inactive</span>
                        </div>
                    </div>
                `;
            }

            let departuresHtml = '';
            for (const [direction, deps] of Object.entries(data.departures)) {
                departuresHtml += `
                    <div class="direction-departures">
                        <div class="direction-header">
                            <ha-icon icon="mdi:arrow-right-bold-outline"></ha-icon>
                            <span class="direction-name">${direction}</span>
                        </div>
                        <ul class="departure-list">
                            ${deps.map(dep => `
                                <li class="departure-item">
                                    <span class="departure-time">${dep.time}</span>
                                    <span class="departure-destination">${dep.destination}</span>
                                    <span class="minutes-until">${dep.minutesUntilDeparture} min</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            }

            return `
                <div class="line-card active" id="${lineId}-card">
                    <div class="line-header">
                        <div class="line-title">
                            <div class="line-icon ${line.type || 'bim'}"></div>
                            <span class="line-name">${lineId}</span>
                        </div>
                        <div class="station-name">${data.station || line.name || 'Unknown Station'}</div>
                    </div>
                    <div class="line-departures">
                        ${departuresHtml || '<div class="no-departures">No departures found</div>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    _generateStyles() {
        return `
            :host {
                --card-background-color: #1e1e1e; /* Dark background */
                --primary-text-color: #ffffff; /* White primary text */
                --secondary-text-color: #b3b3b3; /* Light grey secondary text */
                --accent-color: #00bcd4; /* Electric blue accent */
                --success-color: #4caf50; /* Green for success/on-time */
                --error-color: #f44336; /* Red for error/delayed */
                --warning-color: #ffc107; /* Amber for warnings */

                --line-icon-color: var(--accent-color);
                --line-icon-size: 24px;

                --departure-item-background: rgba(255, 255, 255, 0.05); /* Slightly lighter background for departure items */
                --departure-item-border-radius: 6px;

                --status-on-time-background: rgba(var(--rgb-success-color), 0.3);
                --status-delayed-background: rgba(var(--rgb-error-color), 0.3);

                --card-header-padding-bottom: 16px;
                --card-padding: 16px;
                --line-card-margin-bottom: 12px;
                --line-card-padding: 12px;
                --line-card-border-radius: 10px;

                font-family: 'Roboto', sans-serif; /* Modern font */
            }

            ha-card {
                background: var(--card-background-color);
                color: var(--primary-text-color);
                padding: var(--card-padding);
                border-radius: 12px; /* Rounded corners for the main card */
                box-shadow: 0 4px 8px rgba(0,0,0,0.3); /* Subtle shadow for depth */
            }

            .card-header {
                padding-bottom: var(--card-header-padding-bottom);
                display: flex;
                justify-content: space-between;
                align-items: center; /* Vertically align title */
            }

            .card-header .title {
                font-size: 1.4rem; /* Slightly larger title */
                font-weight: 500;
                color: var(--primary-text-color);
                letter-spacing: -0.02em; /* Slightly tighter letter spacing for modern look */
            }

            .line-card {
                margin-bottom: var(--line-card-margin-bottom);
                padding: var(--line-card-padding);
                border-radius: var(--line-card-border-radius);
                background: rgba(var(--rgb-primary-text-color), 0.04); /* Slightly darker line card background */
                transition: background-color 0.3s ease; /* Smooth background transition for hover/active effects */
            }

            .line-card.loading {
                background: rgba(var(--rgb-warning-color), 0.08); /* Indicate loading with a subtle amber */
            }

            .line-card.error {
                background: rgba(var(--rgb-error-color), 0.1); /* Indicate error with a subtle red */
            }

            .line-card.inactive {
                opacity: 0.6; /* Dim inactive lines slightly */
            }

            .line-header {
                display: flex;
                align-items: center; /* Align icon and title */
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(var(--rgb-primary-text-color), 0.1); /* Subtle line separator */
            }

            .line-title {
                display: flex;
                align-items: center;
                margin-right: 16px; /* Space between title and station name */
            }

            .line-title .line-name {
                margin-left: 8px;
                font-size: 1.2rem;
                font-weight: 500;
                color: var(--primary-text-color);
                letter-spacing: -0.01em;
            }

            .line-icon {
                width: var(--line-icon-size);
                height: var(--line-icon-size);
                margin-right: 8px; /* Space after the icon */
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                -webkit-mask-size: contain;
                mask-size: contain;
                -webkit-mask-repeat: no-repeat;
                mask-repeat: no-repeat;
                -webkit-mask-position: center;
                mask-position: center;
                background-color: var(--line-icon-color); /* Icon color from variable */
                -webkit-mask-image: var(--icon-bim); /* Default BIM icon */
                mask-image: var(--icon-bim); /* Default BIM icon */
            }
            .line-icon.bim { -webkit-mask-image: var(--icon-bim); mask-image: var(--icon-bim); }
            .line-icon.bus { -webkit-mask-image: var(--icon-bus); mask-image: var(--icon-bus); }
            .line-icon.error { background-color: var(--error-color); } /* Error icon color */
            .line-icon.inactive { background-color: var(--secondary-text-color); } /* Inactive icon color */

            .station-name {
                font-size: 0.95rem;
                color: var(--secondary-text-color);
                font-style: italic;
                margin-left: auto; /* Push station name to the right */
            }

            .loading-indicator, .error-message, .inactive-message {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 10px 0;
                color: var(--secondary-text-color);
            }
            .loading-indicator ha-circular-progress {
                margin-right: 8px;
                --mdc-theme-primary: var(--warning-color); /* Amber loading indicator */
            }
            .error-message ha-icon {
                color: var(--error-color);
                margin-right: 5px;
            }
            .inactive-message ha-icon {
                color: var(--secondary-text-color);
                margin-right: 5px;
            }

            .direction-departures {
                margin-bottom: 12px;
            }

            .direction-header {
                display: flex;
                align-items: center;
                margin-bottom: 8px;
                color: var(--accent-color); /* Accent color for direction header */
                font-weight: 500;
                text-transform: uppercase;
                font-size: 0.9rem;
                letter-spacing: 0.05em;
            }
            .direction-header ha-icon {
                margin-right: 6px;
                --mdc-icon-size: 18px;
            }

            .departure-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }

            .departure-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 10px;
                margin-bottom: 6px;
                border-radius: var(--departure-item-border-radius);
                background: var(--departure-item-background);
                transition: background-color 0.2s ease-in-out; /* Hover effect */
            }
            .departure-item:hover {
                background: rgba(255, 255, 255, 0.1); /* Slightly brighter on hover */
            }

            .departure-time {
                font-weight: 500;
                font-size: 1.1rem;
                margin-right: 10px; /* Space between time and destination */
                color: var(--primary-text-color);
            }
            .original-time {
                font-size: 0.9rem;
                color: var(--secondary-text-color);
                margin-left: 5px;
            }
            .departure-destination {
                color: var(--secondary-text-color); /* Lighter color for destination */
                flex-grow: 1; /* Allow destination to take available space */
                overflow: hidden; /* Prevent text overflow */
                text-overflow: ellipsis; /* Ellipsis for long destinations */
                white-space: nowrap; /* Prevent wrapping */
            }

            .minutes-until {
                font-size: 0.9rem;
                color: var(--accent-color);
                margin-left: 10px;
            }

            .no-departures {
                padding: 12px;
                text-align: center;
                color: var(--secondary-text-color);
                font-style: italic;
            }

            /* Icon Styles - Define your BIM and BUS icons here, or ideally, import from Material Design Icons for consistency */
            :host {
                --icon-bim: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="var(--line-icon-color)" d="M4,16v6h16v-6c0-1.1-0.9-2-2-2H6C4.9,14,4,14.9,4,16z M12,2c-4.42,0-8,0.5-8,4v10c0,0.88,0.39,1.67,1,2.22V20c0,0.55,0.45,1,1,1h1c0.55,0,1-0.45,1-1v-1h8v1c0,0.55,0.45,1,1,1h1c0.55,0,1-0.45,1-1v-1.78c0.61-0.55,1-1.34,1-2.22V6C20,2.5,16.42,2,12,2z M12,4c3.25,0,6,0.4,6,2s-2.75,2-6,2s-6-0.4-6-2S8.75,4,12,4z M12,14c-1.66,0-3-1.34-3-3s1.34-3,3-3s3,1.34,3,3S13.66,14,12,14z"/></svg>');
                --icon-bus: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="var(--line-icon-color)" d="M4,16c0,1.1,0.9,2,2,2h1v1c0,0.55,0.45,1,1,1h1c0.55,0,1-0.45,1-1v-1h4v1c0,0.55,0.45,1,1,1h1c0.55,0,1-0.45,1-1v-1h1c1.1,0,2-0.9,2-2v-3H4V16z M19,9c-0.12-1.85-1.03-3.11-2.05-3.64C15.91,4.88,14.08,4.5,12,4.5c-2.08,0-3.91,0.38-4.95,0.86C5.97,5.89,5.12,7.15,5,9H19z M4,11v1h16v-1H4z M6,6h12V5H6V6z"/></svg>');
            }
        `;
    }

    getCardSize() {
        return 1 + (Object.keys(this._lines).length * 0.5);
    }

    static getStubConfig() {
        return {
            title: "Vienna Transport",
            update_interval: 60,
            max_departures: 3,
            lines: [
                {
                    id: "52",
                    station_id: "vao:490108800",
                    name: "Westbahnstraße/Neubaugasse",
                    type: "bim"
                },
                {
                    id: "13A",
                    station_id: "vao:490108800",
                    name: "Westbahnstraße/Neubaugasse",
                    type: "bus"
                }
            ]
        };
    }
}

customElements.define('vienna-transport-card', ViennaTransportCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: 'vienna-transport-card',
    name: 'Vienna Transport Card',
    description: 'Display real-time Vienna public transport departures'
});
