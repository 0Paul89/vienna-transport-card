import logging
import voluptuous as vol
from datetime import timedelta
import aiohttp
import async_timeout
from homeassistant.components.sensor import PLATFORM_SCHEMA, SensorEntity
from homeassistant.const import CONF_NAME
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import Throttle

_LOGGER = logging.getLogger(__name__)

CONF_STOPS = "stops"
DEFAULT_NAME = "Wiener Linien"
MIN_TIME_BETWEEN_UPDATES = timedelta(seconds=60)

PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({
    vol.Optional(CONF_NAME, default=DEFAULT_NAME): cv.string,
    vol.Required(CONF_STOPS): vol.All(cv.ensure_list, [cv.string]),
})

API_ENDPOINT = "http://www.wienerlinien.at/ogd_realtime/monitor"
# ADD THIS LINE:
TRAFFIC_INFO_ENDPOINT = "http://www.wienerlinien.at/ogd_realtime/trafficInfoList"

async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    """Set up the Wiener Linien sensor."""
    name = config.get(CONF_NAME)
    stops = config.get(CONF_STOPS)
    
    session = async_get_clientsession(hass)
    
    sensors = []
    for stop_id in stops:
        sensor = WienerLinienSensor(name, stop_id, session)
        sensors.append(sensor)
    
    async_add_entities(sensors, True)

class WienerLinienSensor(SensorEntity):
    """Representation of a Wiener Linien sensor."""
    
    def __init__(self, name, stop_id, session):
        """Initialize the sensor."""
        self._name = f"{name} {stop_id}"
        self._stop_id = stop_id
        self._session = session
        self._state = None
        self._attributes = {}
    
    @property
    def name(self):
        """Return the name of the sensor."""
        return self._name
    
    @property
    def unique_id(self):
        """Return a unique ID."""
        return f"wienerlinien_{self._stop_id}"
    
    @property
    def state(self):
        """Return the state of the sensor."""
        return self._state
    
    @property
    def extra_state_attributes(self):
        """Return the state attributes."""
        return self._attributes
    
    @Throttle(MIN_TIME_BETWEEN_UPDATES)
    async def async_update(self):
        """Fetch new state data for the sensor."""
        try:
            url = f"{API_ENDPOINT}?stopId={self._stop_id}"
            async with async_timeout.timeout(10):
                response = await self._session.get(url)
                data = await response.json()
            
            if not data.get("data", {}).get("monitors"):
                _LOGGER.warning("No monitor data for stop %s", self._stop_id)
                return
            
            monitors = data["data"]["monitors"]
            departures = []
            stop_name = "Unknown"
            
            if monitors:
                # Get stop name from first monitor
                stop_name = monitors[0].get("locationStop", {}).get("properties", {}).get("title", "Unknown")
                
                # Process all lines and departures
                for monitor in monitors:
                    lines = monitor.get("lines", [])
                    for line in lines:
                        line_departures = line.get("departures", {}).get("departure", [])
                        for departure in line_departures:
                            dep_time = departure.get("departureTime", {})
                            vehicle = departure.get("vehicle", {})
                            
                            departure_info = {
                                "line": line.get("name"),
                                "direction": line.get("towards"),
                                "platform": line.get("platform"),
                                "time_planned": dep_time.get("timePlanned"),
                                "time_real": dep_time.get("timeReal"),
                                "countdown": dep_time.get("countdown"),
                                "barrier_free": vehicle.get("barrierFree", False),
                                "folding_ramp": vehicle.get("foldingRamp", False),
                                "type": vehicle.get("type"),
                            }
                            departures.append(departure_info)
            
            # Sort by countdown
            departures.sort(key=lambda x: x.get("countdown", 999))
            
            self._state = len(departures)
            self._attributes = {
                "stop_id": self._stop_id,
                "stop_name": stop_name,
                "departures": departures,
                "server_time": data.get("message", {}).get("serverTime"),
            }
            
            # ADD THIS SECTION - Fetch traffic info (disturbances):
            await self._fetch_traffic_info()
            
        except aiohttp.ClientError as err:
            _LOGGER.error("Error fetching data for stop %s: %s", self._stop_id, err)
        except Exception as err:
            _LOGGER.error("Unexpected error for stop %s: %s", self._stop_id, err)
    
    # ADD THIS ENTIRE METHOD:
    async def _fetch_traffic_info(self):
        """Fetch traffic information (disturbances) for this stop."""
        try:
            # Get all lines at this stop
            lines_at_stop = list(set([dep["line"] for dep in self._attributes.get("departures", []) if dep.get("line")]))
            
            if not lines_at_stop:
                self._attributes["traffic_info"] = []
                return
            
            # Build URL with line filters
            line_params = "&".join([f"relatedLine={line}" for line in lines_at_stop])
            url = f"{TRAFFIC_INFO_ENDPOINT}?{line_params}&relatedStop={self._stop_id}"
            
            async with async_timeout.timeout(10):
                response = await self._session.get(url)
                traffic_data = await response.json()
            
            traffic_info = []
            
            # Parse traffic info
            if traffic_data.get("data", {}).get("trafficInfos"):
                for info in traffic_data["data"]["trafficInfos"]:
                    traffic_info.append({
                        "title": info.get("title", ""),
                        "description": info.get("description", ""),
                        "time": info.get("time", {}).get("start", ""),
                        "priority": info.get("priority", ""),
                        "related_lines": info.get("relatedLines", []),
                        "related_stops": info.get("relatedStops", []),
                    })
            
            # Add traffic info to attributes
            self._attributes["traffic_info"] = traffic_info
            
            # Add disturbances to individual departures
            for dep in self._attributes.get("departures", []):
                dep["disturbances"] = [
                    ti for ti in traffic_info 
                    if dep["line"] in ti.get("related_lines", [])
                ]
            
        except Exception as err:
            _LOGGER.warning("Could not fetch traffic info for stop %s: %s", self._stop_id, err)
            self._attributes["traffic_info"] = []
