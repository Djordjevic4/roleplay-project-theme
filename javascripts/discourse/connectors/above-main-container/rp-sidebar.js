// ---------------------------------------------------------------
// Right sidebar: Server Status / Server Time / Server Weather.
//
// Each widget has an optional *_api_url theme setting. When it is
// blank, the widget falls back to static/mock values so the layout
// always renders something sensible. See README.md for the exact
// JSON shape each endpoint is expected to return.
//
// NOTE: these helpers are plain module-level functions (not object
// methods called via `this`). Discourse's connector-class wiring does
// not guarantee `this` inside setupComponent/teardownComponent refers
// to this exported object, so all state is threaded through explicit
// `component` arguments / properties instead.
// ---------------------------------------------------------------

const FALLBACK_HOURLY = [
  { label: "10am", icon: "cloudy", tempF: 86 },
  { label: "11am", icon: "cloudy", tempF: 86 },
  { label: "12pm", icon: "cloudy", tempF: 90 },
  { label: "1pm", icon: "cloudy", tempF: 94 },
  { label: "2pm", icon: "cloudy", tempF: 101 },
];

function clampPercent(pct) {
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function markerPercent(tempF, low, high) {
  if (!Number.isFinite(tempF) || !Number.isFinite(low) || !Number.isFinite(high) || high === low) {
    return 50;
  }
  return clampPercent(((tempF - low) / (high - low)) * 100);
}

function iconForCondition(key) {
  switch (key) {
    case "sunny":
    case "clear":
      return "sun";
    case "rain":
      return "cloud-rain";
    case "storm":
      return "cloud-bolt";
    case "snow":
      return "snowflake";
    case "clear-night":
      return "moon";
    case "cloudy":
    default:
      return "cloud";
  }
}

// Pre-resolve each hourly slot's condition key into a concrete FA icon
// name so the template never needs to call a function helper.
function mapHourly(hourly) {
  return (hourly || []).map((slot) => ({
    label: slot.label,
    tempF: slot.tempF,
    iconName: iconForCondition(slot.icon),
  }));
}

function addTimer(component, id) {
  component._rpTimers = component._rpTimers || [];
  component._rpTimers.push(id);
}

// --- Server Status -------------------------------------------------
function fetchStatus(component) {
  const url = settings.server_status_api_url;
  if (!url) {
    return;
  }
  const load = async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (component.isDestroying || component.isDestroyed) {
        return;
      }
      const maxPlayers = Number(data.maxPlayers ?? settings.server_max_players);
      const playerCount = Number(data.players ?? 0);
      component.setProperties({
        statusOnline: !!data.online,
        playerCount,
        maxPlayers,
        playerPercent: markerPercent(playerCount, 0, maxPlayers),
      });
    } catch (e) {
      // API unreachable: keep showing the last known / fallback values.
    }
  };
  load();
  addTimer(component, setInterval(load, 30000));
}

// --- Server Time -----------------------------------------------------
function startClock(component) {
  const url = settings.server_time_api_url;

  const applyClientFallback = () => {
    const offsetMs = settings.server_time_utc_offset * 3600 * 1000;
    const now = new Date(Date.now() + offsetMs);
    const hours = now.getUTCHours();
    component.setProperties({
      timeHours: String(hours).padStart(2, "0"),
      timeMinutes: String(now.getUTCMinutes()).padStart(2, "0"),
      timeSeconds: String(now.getUTCSeconds()).padStart(2, "0"),
      isDaytime: hours >= 6 && hours < 20,
      dateLabel: now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
    });
  };

  const loadFromApi = async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (component.isDestroying || component.isDestroyed) {
        return;
      }
      component.setProperties({
        timeHours: String(data.hour).padStart(2, "0"),
        timeMinutes: String(data.minute).padStart(2, "0"),
        timeSeconds: String(data.second ?? 0).padStart(2, "0"),
        timeZoneLabel: data.tz ?? settings.server_time_zone_label,
        isDaytime: !!data.isDay,
        dateLabel: data.date
          ? new Date(data.date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "",
      });
    } catch (e) {
      applyClientFallback();
    }
  };

  if (url) {
    loadFromApi();
    addTimer(component, setInterval(loadFromApi, 15000));
  } else {
    applyClientFallback();
    addTimer(component, setInterval(applyClientFallback, 1000));
  }
}

// --- Server Weather ----------------------------------------------------
function fetchWeather(component) {
  const url = settings.server_weather_api_url;
  if (!url) {
    return;
  }
  const load = async () => {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (component.isDestroying || component.isDestroyed) {
        return;
      }
      component.setProperties({
        weatherTempF: data.tempF,
        weatherTempC: data.tempC ?? Math.round(((data.tempF - 32) * 5) / 9),
        weatherCondition: data.condition,
        weatherIcon: iconForCondition(data.icon),
        weatherHigh: data.highF,
        weatherLow: data.lowF,
        weatherWind: data.windMph,
        weatherHumidity: data.humidity,
        weatherHourly: mapHourly(Array.isArray(data.hourly) ? data.hourly : FALLBACK_HOURLY),
        weatherUpdatedLabel: "updated just now",
        weatherMarkerPercent: markerPercent(data.tempF, data.lowF, data.highF),
      });
    } catch (e) {
      // API unreachable: keep showing mock/fallback values.
    }
  };
  load();
  addTimer(component, setInterval(load, 600000));
}

export default {
  shouldRender() {
    return settings.show_sidebar_widgets && !document.querySelector(".rp-sidebar");
  },

  setupComponent(args, component) {
    const maxPlayers = settings.server_max_players;
    const playerCount = settings.server_status_fallback_players;

    component.setProperties({
      settings,
      showStatus: settings.show_server_status,
      showTime: settings.show_server_time,
      showWeather: settings.show_server_weather,

      // Server status defaults (used until/unless the API responds)
      statusOnline: settings.server_status_fallback_state === "online",
      playerCount,
      maxPlayers,
      playerPercent: markerPercent(playerCount, 0, maxPlayers),

      // Server time defaults
      timeHours: "--",
      timeMinutes: "--",
      timeSeconds: "--",
      timeZoneLabel: settings.server_time_zone_label,
      isDaytime: true,
      dateLabel: "",

      // Weather defaults (mock, from settings)
      weatherTempF: settings.server_weather_mock_temp_f,
      weatherTempC: Math.round(((settings.server_weather_mock_temp_f - 32) * 5) / 9),
      weatherCondition: settings.server_weather_mock_condition,
      weatherIcon: "cloud",
      weatherHigh: settings.server_weather_mock_high_f,
      weatherLow: settings.server_weather_mock_low_f,
      weatherWind: settings.server_weather_mock_wind_mph,
      weatherHumidity: settings.server_weather_mock_humidity,
      weatherHourly: mapHourly(FALLBACK_HOURLY),
      weatherUpdatedLabel: "using fallback data",
      weatherMarkerPercent: markerPercent(
        settings.server_weather_mock_temp_f,
        settings.server_weather_mock_low_f,
        settings.server_weather_mock_high_f
      ),
    });

    fetchStatus(component);
    startClock(component);
    fetchWeather(component);
  },

  // Signature varies across Discourse versions (`component` vs
  // `(args, component)`); accept whatever we're given defensively.
  teardownComponent(...callArgs) {
    const component = callArgs.find((a) => a && typeof a === "object" && "isDestroying" in a);
    ((component && component._rpTimers) || []).forEach(clearInterval);
    if (component) {
      component._rpTimers = [];
    }
  },
};
