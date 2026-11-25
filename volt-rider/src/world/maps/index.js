import { DOWNTOWN } from './downtown.js';

// Registry of districts. `available: false` entries show as "coming soon"
// in the map select so the UI is ready for them.
export const MAPS = [
  { ...DOWNTOWN, available: true, icon: '🏙️' },
  { id: 'waterfront', name: 'Waterfront', blurb: 'Bike path along the bay.', available: false, icon: '🌊' },
  { id: 'hills', name: 'Forest Hills', blurb: 'Climbs, descents and singletrack.', available: false, icon: '🌲' },
  { id: 'industrial', name: 'Industrial', blurb: 'Warehouses, rail yards, ramps.', available: false, icon: '🏭' },
];

export const getMap = id => MAPS.find(m => m.id === id);
