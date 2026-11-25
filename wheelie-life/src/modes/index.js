// Mode registry. Unavailable modes are listed so the map select can show them
// as "coming soon"; add a class extending GameMode and flip `available`.
import { DeliveryRush } from './DeliveryRush.js';

const stub = (id, title, icon, blurb) => ({ id, title, icon, blurb, available: false });

export const MODES = [
  DeliveryRush,
  stub('trail', 'Trail Challenge', '⛰️', 'Off-road climbs and descents with checkpoints.'),
  stub('endless', 'Endless Commute', '🚗', 'Dodge traffic, potholes and car doors on a busy road.'),
  stub('free', 'Free Ride', '🗺️', 'Explore, find collectibles and scenic viewpoints.'),
];

export const getMode = id => MODES.find(m => m.id === id);
