// Level definitions, keyed by mode + map. Each level is pure data that the
// mode class interprets; add a new shift by appending an entry.
export const LEVELS = [
  {
    id: 'dr-downtown-1', mode: 'delivery', map: 'downtown',
    name: 'Morning Shift', blurb: 'Clear skies, light traffic. Learn the streets.',
    timeOfDay: 8.2, todSpeed: 0.3, rain: 0, wind: 1.5, windDir: 0.6, traffic: 0.6,
    deliveries: 4, timeLimit: 330, seed: 11, stars: [0, 450, 600],
  },
  {
    id: 'dr-downtown-2', mode: 'delivery', map: 'downtown',
    name: 'Rainy Lunch Rush', blurb: 'Wet roads are slippery and a headwind blows from the bay.',
    timeOfDay: 12.4, todSpeed: 0.3, rain: 1, wind: 5, windDir: 2.4, traffic: 0.85,
    deliveries: 5, timeLimit: 390, seed: 23, stars: [0, 560, 740],
  },
  {
    id: 'dr-downtown-3', mode: 'delivery', map: 'downtown',
    name: 'Night Owl', blurb: 'Late orders after dark. Headlights on, watch for potholes.',
    timeOfDay: 21.6, todSpeed: 0.3, rain: 0, wind: 2, windDir: 4.0, traffic: 1,
    deliveries: 6, timeLimit: 440, seed: 37, stars: [0, 680, 880],
  },
];

export const levelsFor = (mode, map) => LEVELS.filter(l => l.mode === mode && l.map === map);
export const getLevel = id => LEVELS.find(l => l.id === id);
