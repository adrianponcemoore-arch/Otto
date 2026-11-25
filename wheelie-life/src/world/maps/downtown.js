// Downtown district definition. A map is pure data: the World builder turns
// it into meshes, colliders and gameplay spots. New districts (waterfront,
// hills, industrial) are added by writing another file like this one and
// registering it in maps/index.js.

export const DOWNTOWN = {
  id: 'downtown',
  name: 'Downtown',
  blurb: 'Grid streets, pocket parks and a hill climb up to Lumen Heights.',
  seed: 1337,
  blocks: 7,        // blocks per side
  block: 64,        // block pitch (road centre to road centre), m
  road: 14,         // road width, m
  sidewalk: 3.5,
  outer: 120,       // countryside ring beyond the grid, m

  // Gaussian hills: x, z, amplitude, sigma (m). Kept under ~12% grade.
  hills: [
    { x: 135,  z: -135, a: 18, s: 95 },
    { x: -170, z: 160,  a: 7,  s: 70 },
    { x: -60,  z: -190, a: 5,  s: 55 },
    { x: 330,  z: 40,   a: 26, s: 70 },
    { x: -320, z: -260, a: 30, s: 80 },
  ],

  // Block types by [bx, bz]: 'p' park, 'z' plaza, default buildings.
  special: {
    '1,4': 'p', '1,5': 'p', '5,1': 'p', '3,3': 'z',
  },

  // Chargers: block + corner (0..3 = NW, NE, SE, SW)
  chargers: [
    { bx: 2, bz: 4, corner: 0 },
    { bx: 4, bz: 2, corner: 2 },
    { bx: 5, bz: 5, corner: 1 },
    { bx: 0, bz: 1, corner: 2 },
    { bx: 4, bz: 0, corner: 3 },
    { bx: 1, bz: 2, corner: 1 },
  ],

  start: { bx: 3, bz: 4, edge: 0 }, // north sidewalk of block south of the plaza

  shopNames: [
    'Pixel Bakery', 'Bean There Café', 'Ohm Sweet Ohm', 'Byte Books', 'Green Grocer',
    'Spoke & Gear', 'Noodle Bar', 'Flower Power', 'City Clinic', "Joule's Jewelers",
    'Volt Vinyl', "Watt's Pizza", 'Lumen Lofts', 'Ampere Apts', 'Circuit Gym',
    'Corner Deli', 'Tofu Temple', 'Hilltop Hostel', 'Print Shop', 'Pet Palace',
    'Taco Torque', 'Sushi Spark', 'Map Store', 'Tea House', 'Arcade 88',
    'Lab Supplies', 'Bike Kitchen', 'Bagel Bros', 'Toy Tower', 'Ramen Rush',
  ],

  palette: {
    buildings: ['#f4d6a0', '#f7b2a5', '#a8d8ea', '#ffe0ac', '#c3e6b8', '#d9c7f2',
                '#f9f4e8', '#9fc8e8', '#ffcfa3', '#e9e1d4', '#b6e3d4', '#f2a6a6'],
    downtown:  ['#7fa7c9', '#9cb6d0', '#c8d3de', '#6e8fb0', '#a7c4d9', '#dde4ea'],
    grass: '#7cc46a', grassOuter: '#8fcd6b', road: '#4b4f5c', sidewalk: '#d9d4cc',
    curb: '#b9b3aa', dirt: '#b98a5a', gravel: '#c9bfae', plaza: '#e8dcc6',
  },
};
