/* materials.js — window.MCSITEMAT v3. The material palette the 3-D site models
   are shaded with. MATERIAL colours (plant enamel, galvanised steel, concrete),
   not theme tokens: they follow the thing drawn, never the page theme.
   Fields: hex · rough · metal · label · opacity (translucent) · clearcoat (a
   painted finish: enamel over primer) · tex (a procedural albedo mc-site-3d.js
   draws) · bump (a procedural height map, same names) · emissive (a lamp) ·
   sheen (fabric) · noEdges (never outline this material).
   Surfaces: 'concrete' grain, 'concrete-cast' with tie-holes, 'mesh' wire grid
   with holes, 'timber' grain, 'tread' rubber blocks, 'chevron' red-white hazard
   stripes, 'galv' spangle, 'paint' orange-peel + scuffs, 'dirt' mud streaks,
   'checker' anti-slip plate, 'grating' open steel floor, 'corrugate' cladding. */
(function (g) {
  'use strict';
  var M = {
    /* plant enamels — clearcoated, slightly weathered by the 'paint' surface */
    'plant-yellow':      { hex: 0xE0A227, rough: 0.46, metal: 0.04, clearcoat: 0.55, tex: 'paint', label: 'plant enamel, yellow' },
    'plant-yellow-dark': { hex: 0xB47F16, rough: 0.5,  metal: 0.04, clearcoat: 0.4,  tex: 'paint', label: 'plant enamel, yellow (shadowed panel)' },
    'plant-orange':      { hex: 0xD9641E, rough: 0.46, metal: 0.04, clearcoat: 0.55, tex: 'paint', label: 'plant enamel, orange' },
    'plant-red':         { hex: 0xB0302A, rough: 0.46, metal: 0.04, clearcoat: 0.55, tex: 'paint', label: 'plant enamel, red' },
    'plant-white':       { hex: 0xE6E5DF, rough: 0.48, metal: 0.04, clearcoat: 0.45, tex: 'paint', label: 'plant enamel, white' },
    'plant-green':       { hex: 0x3F7A3C, rough: 0.46, metal: 0.04, clearcoat: 0.55, tex: 'paint', label: 'plant enamel, green' },
    'plant-blue':        { hex: 0x2F5F9E, rough: 0.46, metal: 0.04, clearcoat: 0.55, tex: 'paint', label: 'plant enamel, blue' },
    /* structural and machined steel */
    'steel-grey':   { hex: 0x767B80, rough: 0.5,  metal: 0.7,  tex: 'paint', label: 'painted steel, grey' },
    'steel-dark':   { hex: 0x36393D, rough: 0.58, metal: 0.65, tex: 'paint', label: 'chassis steel, black' },
    'steel-black':  { hex: 0x1F2124, rough: 0.62, metal: 0.55, label: 'undercarriage steel' },
    'galvanised':   { hex: 0xA6ABAF, rough: 0.38, metal: 0.9,  tex: 'galv', label: 'galvanised steel' },
    'chrome':       { hex: 0xDADDE0, rough: 0.1,  metal: 1.0,  label: 'hydraulic rod, chromed' },
    'aluminium':    { hex: 0xC6C9CB, rough: 0.32, metal: 0.85, label: 'aluminium' },
    'brass':        { hex: 0xB89A4E, rough: 0.35, metal: 0.9,  label: 'brass fitting' },
    'wear-steel':   { hex: 0x8A8C88, rough: 0.55, metal: 0.8,  tex: 'dirt', label: 'bucket / blade wear steel' },
    'checker':      { hex: 0x9EA3A6, rough: 0.5,  metal: 0.8,  tex: 'checker', bump: 'checker', label: 'anti-slip checker plate' },
    'grating':      { hex: 0x8F9497, rough: 0.5,  metal: 0.85, tex: 'grating', label: 'open steel grating' },
    /* cabs and glazing */
    'cab-white':    { hex: 0xD9DAD6, rough: 0.5,  metal: 0.08, clearcoat: 0.4, tex: 'paint', label: 'cabin panel' },
    'cab-dark':     { hex: 0x2B2E32, rough: 0.55, metal: 0.3,  label: 'cab pillar, black' },
    'glass':        { hex: 0x5F8798, rough: 0.05, metal: 0.15, opacity: 0.42, noEdges: true, label: 'cab glass' },
    'glass-dark':   { hex: 0x2A3A44, rough: 0.05, metal: 0.2,  opacity: 0.6,  noEdges: true, label: 'tinted glass' },
    'mirror':       { hex: 0xCFD6DA, rough: 0.05, metal: 1.0,  noEdges: true, label: 'mirror glass' },
    /* containers, cabins, temporary works */
    'container':    { hex: 0x3F5F7C, rough: 0.62, metal: 0.3,  tex: 'dirt', label: 'container steel, blue' },
    'container-2':  { hex: 0x7F4326, rough: 0.62, metal: 0.3,  tex: 'dirt', label: 'container steel, oxide red' },
    'container-3':  { hex: 0x4E6B3E, rough: 0.62, metal: 0.3,  tex: 'dirt', label: 'container steel, green' },
    'cladding':     { hex: 0xD5D3CC, rough: 0.55, metal: 0.35, tex: 'corrugate', bump: 'corrugate', label: 'profiled cladding' },
    'concrete':     { hex: 0x9A978F, rough: 0.96, metal: 0,    tex: 'concrete', bump: 'concrete', label: 'concrete' },
    'concrete-cast':{ hex: 0xA8A59D, rough: 0.94, metal: 0,    tex: 'concrete-cast', bump: 'concrete', label: 'precast concrete' },
    'concrete-dark':{ hex: 0x6F6D67, rough: 0.96, metal: 0,    tex: 'concrete', label: 'damp concrete' },
    'rubber':       { hex: 0x232422, rough: 0.9,  metal: 0,    tex: 'tread', bump: 'tread', label: 'tyre' },
    'rubber-flat':  { hex: 0x2A2B29, rough: 0.92, metal: 0,    label: 'rubber, moulded' },
    'track-steel':  { hex: 0x4A4C4A, rough: 0.6,  metal: 0.6,  tex: 'dirt', label: 'track shoe steel' },
    'mesh':         { hex: 0xB0B5B9, rough: 0.45, metal: 0.85, tex: 'mesh', noEdges: true, label: 'galvanised mesh' },
    'timber':       { hex: 0xA57A48, rough: 0.85, metal: 0,    tex: 'timber', bump: 'timber', label: 'timber board' },
    'timber-dark':  { hex: 0x6E5033, rough: 0.88, metal: 0,    tex: 'timber', label: 'weathered timber' },
    'ply':          { hex: 0xC4A574, rough: 0.8,  metal: 0,    tex: 'timber', label: 'plywood' },
    'hi-vis':       { hex: 0xF0661A, rough: 0.72, metal: 0,    label: 'high-visibility orange' },
    'hi-vis-yellow':{ hex: 0xDDE83A, rough: 0.72, metal: 0,    label: 'high-visibility yellow' },
    'reflective':   { hex: 0xE8E8E2, rough: 0.3,  metal: 0.2,  label: 'retro-reflective band' },
    'chevron':      { hex: 0xD9D9D6, rough: 0.6,  metal: 0,    tex: 'chevron', noEdges: true, label: 'hazard stripes' },
    'hazard-yellow':{ hex: 0xE3B21B, rough: 0.6,  metal: 0,    tex: 'hazard', noEdges: true, label: 'black-yellow hazard band' },
    'hose':         { hex: 0x1A1B1A, rough: 0.7,  metal: 0,    label: 'hydraulic hose' },
    'rope':         { hex: 0x3A3C3E, rough: 0.55, metal: 0.7,  label: 'wire rope' },
    'sling':        { hex: 0x2E6FB5, rough: 0.8,  metal: 0,    sheen: 0.5, label: 'lifting sling, webbing' },
    /* lamps */
    'lamp-amber':   { hex: 0xE58A1B, rough: 0.3,  metal: 0,    emissive: 0xFF9A1E, label: 'amber beacon' },
    'lamp-red':     { hex: 0xC02A22, rough: 0.3,  metal: 0,    emissive: 0xFF3A2E, label: 'red lamp' },
    'lamp-white':   { hex: 0xF3F3EC, rough: 0.25, metal: 0,    emissive: 0xFFF6DD, label: 'work lamp' },
    /* people */
    'skin':         { hex: 0xC59B77, rough: 0.8,  metal: 0,    label: 'figure' },
    'workwear':     { hex: 0x2A3646, rough: 0.9,  metal: 0,    sheen: 0.3, label: 'work trousers' },
    'boot':         { hex: 0x3A2A1C, rough: 0.85, metal: 0,    label: 'safety boot' },
    'hardhat':      { hex: 0xF1F1EC, rough: 0.35, metal: 0,    clearcoat: 0.5, label: 'hard hat' },
    'hardhat-yellow':{ hex: 0xE9C21C, rough: 0.35, metal: 0,   clearcoat: 0.5, label: 'hard hat, yellow' },
    /* ground and zones */
    'netting':      { hex: 0x3B7748, rough: 0.9,  metal: 0,    opacity: 0.5, noEdges: true, label: 'debris netting' },
    'tarp':         { hex: 0x2D5A8E, rough: 0.7,  metal: 0,    sheen: 0.4, label: 'tarpaulin' },
    'ground':       { hex: 0xB5B1A5, rough: 1,    metal: 0,    label: 'paved ground' },
    'gravel':       { hex: 0x9B948A, rough: 1,    metal: 0,    tex: 'concrete', label: 'crushed stone' },
    'spoil':        { hex: 0x6E5A44, rough: 1,    metal: 0,    tex: 'concrete', label: 'excavated spoil' },
    'zone':         { hex: 0xC8B27A, rough: 1,    metal: 0,    opacity: 0.35, noEdges: true, label: 'zone hatch' },
    /* city: paving, markings, sign sheeting, cladding, planting, vehicles, clothing */
    'asphalt': { hex: 0x4A4B4A, rough: 1, metal: 0, tex: 'concrete', label: 'asphalt' }, 'paint-white': { hex: 0xF2F1EA, rough: 0.7, metal: 0, noEdges: true, label: 'road marking, white' }, 'paint-yellow': { hex: 0xE8C532, rough: 0.7, metal: 0, noEdges: true, label: 'road marking, yellow' }, 'paint-blue': { hex: 0x2E63B8, rough: 0.7, metal: 0, noEdges: true, label: 'road marking, blue' }, 'paint-green': { hex: 0x2F8F4E, rough: 0.7, metal: 0, noEdges: true, label: 'bike lane, green' },
    'sign-red': { hex: 0xB9261E, rough: 0.35, metal: 0.1, noEdges: true, label: 'sign sheeting, red' }, 'sign-green': { hex: 0x1E6B3A, rough: 0.35, metal: 0.1, noEdges: true, label: 'sign sheeting, green' }, 'sign-blue': { hex: 0x1F5AA6, rough: 0.35, metal: 0.1, noEdges: true, label: 'sign sheeting, blue' }, 'sign-brown': { hex: 0x6A4A2E, rough: 0.35, metal: 0.1, noEdges: true, label: 'sign sheeting, brown' }, 'sign-orange': { hex: 0xE07A1F, rough: 0.35, metal: 0.1, noEdges: true, label: 'sign sheeting, orange' }, 'sign-yellow': { hex: 0xF0C419, rough: 0.35, metal: 0.1, noEdges: true, label: 'sign sheeting, yellow' }, 'sign-white': { hex: 0xF4F4F0, rough: 0.35, metal: 0.1, noEdges: true, label: 'sign sheeting, white' }, 'sign-black': { hex: 0x151515, rough: 0.5, metal: 0, noEdges: true, label: 'sign legend, black' },
    'signal-black': { hex: 0x1C1D1F, rough: 0.55, metal: 0.2, label: 'signal housing' }, 'signal-yellow': { hex: 0xD9A41C, rough: 0.5, metal: 0.1, clearcoat: 0.4, label: 'signal housing, yellow' }, 'lamp-green': { hex: 0x1FA84A, rough: 0.3, metal: 0, emissive: 0x2BD65E, label: 'green lens' }, 'lamp-blue': { hex: 0x2A7FD8, rough: 0.3, metal: 0, emissive: 0x3A9BFF, label: 'blue lamp' }, 'led-screen': { hex: 0x0E1A2B, rough: 0.2, metal: 0.1, emissive: 0x2A4E86, noEdges: true, label: 'LED screen' },
    'brick-red': { hex: 0x8E4A38, rough: 0.9, metal: 0, tex: 'concrete', label: 'clay brick, red' }, 'brick-buff': { hex: 0xC9A97C, rough: 0.9, metal: 0, tex: 'concrete', label: 'clay brick, buff' }, 'stucco': { hex: 0xD8CFBE, rough: 0.95, metal: 0, tex: 'concrete', label: 'stucco / EIFS' }, 'stone': { hex: 0x9C968C, rough: 0.85, metal: 0, tex: 'concrete', label: 'stone cladding' }, 'granite': { hex: 0x6E6C6A, rough: 0.4, metal: 0.05, tex: 'galv', label: 'granite' }, 'bronze': { hex: 0x6E5636, rough: 0.45, metal: 0.8, label: 'bronze' }, 'copper': { hex: 0x9A5E3C, rough: 0.4, metal: 0.85, label: 'copper' }, 'storefront-glass': { hex: 0x6F94A6, rough: 0.05, metal: 0.2, opacity: 0.38, noEdges: true, label: 'storefront glazing' },
    'awning-red': { hex: 0xA8302C, rough: 0.8, metal: 0, sheen: 0.4, label: 'awning canvas, red' }, 'awning-green': { hex: 0x2F5F43, rough: 0.8, metal: 0, sheen: 0.4, label: 'awning canvas, green' }, 'awning-navy': { hex: 0x233A5E, rough: 0.8, metal: 0, sheen: 0.4, label: 'awning canvas, navy' }, 'awning-cream': { hex: 0xE9DFC8, rough: 0.8, metal: 0, sheen: 0.4, label: 'awning canvas, cream' }, 'awning-stripe': { hex: 0xE0DED8, rough: 0.8, metal: 0, tex: 'chevron', noEdges: true, label: 'awning canvas, striped' },
    'grass': { hex: 0x5E8A3E, rough: 1, metal: 0, tex: 'concrete', label: 'turf' }, 'foliage': { hex: 0x4F7F3A, rough: 0.9, metal: 0, label: 'foliage' }, 'foliage-dark': { hex: 0x35582A, rough: 0.9, metal: 0, label: 'foliage, dark' }, 'foliage-autumn': { hex: 0xB86A2A, rough: 0.9, metal: 0, label: 'foliage, autumn' }, 'bark': { hex: 0x5C4632, rough: 0.95, metal: 0, tex: 'timber', label: 'bark' }, 'water': { hex: 0x3C7A99, rough: 0.08, metal: 0.1, opacity: 0.75, noEdges: true, label: 'water' }, 'sand': { hex: 0xD7C293, rough: 1, metal: 0, label: 'sand' }, 'mulch': { hex: 0x5A3D2A, rough: 1, metal: 0, tex: 'dirt', label: 'bark mulch' }, 'rubber-play': { hex: 0x3E6E8C, rough: 0.95, metal: 0, label: 'poured rubber play surface' }, 'court-green': { hex: 0x3E7A5A, rough: 0.95, metal: 0, label: 'acrylic court, green' }, 'court-red': { hex: 0x9E4A3A, rough: 0.95, metal: 0, label: 'acrylic court, red' }, 'track-red': { hex: 0xB0503A, rough: 0.95, metal: 0, label: 'running track' },
    'play-red': { hex: 0xD43D2A, rough: 0.5, metal: 0, clearcoat: 0.5, label: 'play equipment, red' }, 'play-blue': { hex: 0x2A6FD4, rough: 0.5, metal: 0, clearcoat: 0.5, label: 'play equipment, blue' }, 'play-yellow': { hex: 0xF0C020, rough: 0.5, metal: 0, clearcoat: 0.5, label: 'play equipment, yellow' }, 'play-green': { hex: 0x3FA34D, rough: 0.5, metal: 0, clearcoat: 0.5, label: 'play equipment, green' }, 'play-tan': { hex: 0xC9B48A, rough: 0.7, metal: 0, label: 'play deck, tan' },
    'canvas-cream': { hex: 0xEFE6D2, rough: 0.85, metal: 0, sheen: 0.5, label: 'umbrella canvas' }, 'canvas-teal': { hex: 0x2F7F80, rough: 0.85, metal: 0, sheen: 0.5, label: 'umbrella canvas, teal' }, 'wicker': { hex: 0x8B6B44, rough: 0.9, metal: 0, tex: 'timber', label: 'wicker' }, 'bench-timber': { hex: 0x8C6B4A, rough: 0.85, metal: 0, tex: 'timber', label: 'hardwood slat' }, 'bench-recycled': { hex: 0x4A5A5E, rough: 0.9, metal: 0, label: 'recycled plastic slat' }, 'cast-iron': { hex: 0x2E3134, rough: 0.6, metal: 0.6, label: 'cast iron' }, 'stainless': { hex: 0xC4C7C9, rough: 0.28, metal: 0.95, label: 'stainless steel' }, 'powder-green': { hex: 0x2F4F3A, rough: 0.5, metal: 0.3, clearcoat: 0.4, label: 'powder coat, dark green' }, 'powder-black': { hex: 0x232426, rough: 0.5, metal: 0.3, clearcoat: 0.4, label: 'powder coat, black' },
    'car-red': { hex: 0xA8231F, rough: 0.3, metal: 0.3, clearcoat: 0.9, label: 'automotive paint, red' }, 'car-blue': { hex: 0x1F3F7A, rough: 0.3, metal: 0.3, clearcoat: 0.9, label: 'automotive paint, blue' }, 'car-silver': { hex: 0xB9BCC0, rough: 0.3, metal: 0.6, clearcoat: 0.9, label: 'automotive paint, silver' }, 'car-black': { hex: 0x15161A, rough: 0.3, metal: 0.3, clearcoat: 0.9, label: 'automotive paint, black' }, 'car-white': { hex: 0xEDEDE8, rough: 0.3, metal: 0.2, clearcoat: 0.9, label: 'automotive paint, white' },
    'shirt-blue': { hex: 0x4F7BB8, rough: 0.9, metal: 0, sheen: 0.3, label: 'shirt' }, 'shirt-red': { hex: 0xA83A34, rough: 0.9, metal: 0, sheen: 0.3, label: 'shirt' }, 'shirt-grey': { hex: 0x8C8F92, rough: 0.9, metal: 0, sheen: 0.3, label: 'shirt' }, 'shirt-green': { hex: 0x4E7F5A, rough: 0.9, metal: 0, sheen: 0.3, label: 'shirt' }, 'coat-dark': { hex: 0x2B2E36, rough: 0.9, metal: 0, sheen: 0.3, label: 'coat' }, 'denim': { hex: 0x3B4F6E, rough: 0.95, metal: 0, label: 'denim' }, 'khaki': { hex: 0xA69169, rough: 0.95, metal: 0, label: 'chinos' }, 'hair-dark': { hex: 0x2A1E16, rough: 0.9, metal: 0, label: 'hair' }, 'hair-light': { hex: 0x9A7448, rough: 0.9, metal: 0, label: 'hair' }, 'skin-2': { hex: 0x8A5A3A, rough: 0.8, metal: 0, label: 'figure' }, 'skin-3': { hex: 0xE3C2A2, rough: 0.8, metal: 0, label: 'figure' }, 'shoe': { hex: 0x2A2622, rough: 0.7, metal: 0, label: 'shoe' }
  };
  g.MCSITEMAT = { VERSION: 3, MATERIALS: M, get: function (n) { return M[n] || M['steel-grey']; }, names: function () { return Object.keys(M); } };
})(typeof window !== 'undefined' ? window : globalThis);
