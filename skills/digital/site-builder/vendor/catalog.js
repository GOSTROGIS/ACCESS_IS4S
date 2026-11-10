/* mc-site-catalog.js — window.MCSITECAT v3. The site logistics catalogue.
   Classic <script src>. Depends on window.MCDIM (engine/sitelib/dimensions.js) and on the
   model generators in window.MCSITEMODELS (engine/mc-site-models-*.js, which depend on
   engine/mc-site-parts.js). Load order: dimensions → materials → parts → models → this.

   RULES
   · A physical entry NEVER carries a dimension of its own: `dim` names the MCDIM row
     (sourced, tolerance per row) and L/W/H, slew, outrigger and reach figures are read
     from it at call time. A drawn ZONE is the one kind without a row — its size is the
     user's polygon, which is real input.
   · ONE GENERATOR PER ENTRY, REFERENCED BY NAME. `model` names a function on MCSITEMODELS;
     two entries may share a generator only when they are the same machine at two sizes
     (the container series, the excavator classes). `audit()` reports an entry whose
     generator is missing by name, never silently as an empty model.
   · The plan symbol and the 3-D model are built to published overall size; internal
     proportions are drawing convention, and every symbol says so.
   · Symbol primitives and model parts are in LOCAL METRES, origin at the plan centre,
     +x along the length, z up. `extentOf()` is the clash extent in the shape
     MCCLASH.volOf() reads (`_ext`), with the swept ring where MCDIM says the body slews. */
(function (g) {
  'use strict';
  var FAMILIES = {
    crane: 'Cranes', excavation: 'Excavation', earthmoving: 'Earthmoving', haulage: 'Haulage and deliveries',
    access: 'Access and lifting', concrete: 'Concrete', welfare: 'Welfare and accommodation', storage: 'Storage',
    boundary: 'Hoarding, barriers and roadway', traffic: 'Traffic and safety', people: 'People', zone: 'Zones'
  };
  var LW = { outline: 0.5, thin: 0.25, hidden: 0.25, centre: 0.18, envelope: 0.35 };
  function D(spec) { return { L: spec.L, W: spec.W, H: spec.H, x: spec.extras || {}, slew: spec.slew || null }; }
  function rect(l, w, cx, cy, lw, fill) { cx = cx || 0; cy = cy || 0; return { t: 'poly', pts: [[cx - l / 2, cy - w / 2], [cx + l / 2, cy - w / 2], [cx + l / 2, cy + w / 2], [cx - l / 2, cy + w / 2]], close: true, lw: lw || 'outline', fill: fill || null }; }
  function circ(r, cx, cy, lw) { return { t: 'circle', cx: cx || 0, cy: cy || 0, r: r, lw: lw || 'envelope' }; }
  function line(a, b, lw) { return { t: 'poly', pts: [a, b], close: false, lw: lw || 'thin' }; }

  /* ---- plan symbols (CAD convention: outline, hidden, centre, envelope weights) ---- */
  function symTracked(d) {
    var tl = d.x.trackLength || d.L * 0.55, tw = d.x.trackShoeWidth || d.W * 0.2, gauge = d.x.trackGauge || (d.W - tw);
    var out = [rect(tl, tw, -d.L / 2 + tl / 2, -gauge / 2), rect(tl, tw, -d.L / 2 + tl / 2, gauge / 2), rect(d.L, d.W, 0, 0, 'hidden')];
    if (d.slew && d.slew.tailSwing) { var cx = -d.L / 2 + d.slew.tailSwing; out.push(circ(d.slew.tailSwing, cx, 0, 'envelope')); out.push(line([cx - 0.5, 0], [cx + 0.5, 0], 'centre')); out.push(line([cx, -0.5], [cx, 0.5], 'centre')); }
    var reach = d.x.maxReachAtGroundLevel || d.x.maxReachAtGroundLine;
    if (reach) out.push(circ(reach, (d.slew && d.slew.tailSwing) ? -d.L / 2 + d.slew.tailSwing : 0, 0, 'hidden'));
    return out;
  }
  function symWheeled(d) { var out = [rect(d.L, d.W)]; var n = 2, wb = d.L * 0.6; for (var i = 0; i < n; i++) { var ax = -wb / 2 + i * wb; out.push(rect(d.L * 0.09, d.W * 0.14, ax, -d.W / 2 + d.W * 0.1, 'thin', 'solid')); out.push(rect(d.L * 0.09, d.W * 0.14, ax, d.W / 2 - d.W * 0.1, 'thin', 'solid')); } out.push(line([d.L * 0.25, -d.W / 2], [d.L * 0.25, d.W / 2], 'thin')); return out; }
  function symCabin(d) { var door = Math.min(0.9, d.W * 0.6, d.L * 0.6), x = -d.L / 2 + Math.min(0.3, d.L * 0.2); return [rect(d.L, d.W), line([x, -d.W / 2], [x, -d.W / 2 + door], 'thin'), { t: 'arc', cx: x, cy: -d.W / 2, r: door, a0: 0, a1: Math.PI / 2, lw: 'thin' }]; }
  function symContainer(d) { return [rect(d.L, d.W), line([-d.L / 2, -d.W / 2], [d.L / 2, d.W / 2], 'thin'), line([-d.L / 2, d.W / 2], [d.L / 2, -d.W / 2], 'thin')]; }
  function symTowerCrane(d) { var jib = d.x.maxJibRadius || d.x.maxRadius, cj = d.x.counterJibLength || 0; var out = [rect(d.L, d.W), circ(jib, 0, 0, 'envelope'), line([0, 0], [jib, 0], 'centre')]; if (cj) out.push(line([0, 0], [-cj, 0], 'centre')); if (d.x.minJibRadius) out.push(circ(d.x.minJibRadius, 0, 0, 'hidden')); return out; }
  function symOutriggers(d) { var t = d.x.outriggerSpreadTransverseMax || d.W, lr = d.x.outriggerSpreadLongitudinalRear || d.x.outriggerSpreadLongitudinalMax || d.L * 0.55, pad = d.x.outriggerPadSquare || 0.6; var out = [rect(d.L, d.x.carrierWidthTravelling || Math.min(d.W, 2.55)), rect(lr, t, 0, 0, 'hidden')]; [-lr / 2, lr / 2].forEach(function (x) { out.push(rect(pad, pad, x, -t / 2, 'thin', 'solid')); out.push(rect(pad, pad, x, t / 2, 'thin', 'solid')); }); if (d.slew) { var r = Math.max(d.slew.radius || 0, d.slew.tailSwing || 0); if (r) out.push(circ(r, 0, 0, 'envelope')); } if (d.x.maxRadius) out.push(circ(d.x.maxRadius, 0, 0, 'hidden')); return out; }
  function symCrawlerCrane(d) { var out = symTracked(d); var r = d.slew ? Math.max(d.slew.radius || 0, d.slew.tailSwing || 0) : 0; if (r) out.push(circ(r, 0, 0, 'envelope')); if (d.x.maxRadius) out.push(circ(d.x.maxRadius, 0, 0, 'hidden')); return out; }
  function symPump(d) { var out = symWheeled(d); var r = d.x.grossHorizontalReach || d.x.netHorizontalReach; if (r) out.push(circ(r, 0, 0, 'hidden')); var of = d.x.outriggerFront, orr = d.x.outriggerRear; if (of) out.push(rect(d.L * 0.15, of, d.L * 0.25, 0, 'hidden')); if (orr) out.push(rect(d.L * 0.15, orr, -d.L * 0.25, 0, 'hidden')); return out; }
  function symPoint(d) { return [circ(Math.max(d.L, d.W) / 2, 0, 0, 'outline'), line([-d.L / 2, 0], [d.L / 2, 0], 'thin'), line([0, -d.W / 2], [0, d.W / 2], 'thin')]; }
  function symPerson(d) { return [circ(0.2, 0, 0, 'outline'), line([-0.2, 0], [0.2, 0], 'thin')]; }
  function symPanel(d) { return [rect(d.L, d.W), rect(d.x.footLength || 0.8, d.x.footWidth || 0.2, -d.L / 2, 0, 'thin', 'solid'), rect(d.x.footLength || 0.8, d.x.footWidth || 0.2, d.L / 2, 0, 'thin', 'solid')]; }
  function symPlate(d) { return [rect(d.L, d.W), line([-d.L / 2, -d.W / 2], [d.L / 2, d.W / 2], 'thin')]; }
  function symScaffold(d) { var out = [rect(d.L, d.W)]; var bay = d.x.bayLength || 2.57; for (var x = -d.L / 2; x <= d.L / 2 + 1e-9; x += bay) { out.push(circ(0.03, x, -d.W / 2, 'thin')); out.push(circ(0.03, x, d.W / 2, 'thin')); } return out; }
  function symHoist(d) { var m = d.x.mastSectionSquare || 0.65; return [rect(d.L, d.W), rect(m, m, -d.L / 2 + m / 2, 0, 'thin', 'solid')]; }

  /* ---- entries: id, family, MCDIM row, plan symbol, MCSITEMODELS generator name, options ---- */
  var ENTRIES = [];
  function E(id, family, dim, sym, model, o) { var e = { id: id, family: family, dim: dim, symbol: sym, model: model, tag: (o && o.tag) || id.slice(0, 2).toUpperCase(), kind: (o && o.kind) || 'object', clash: !(o && o.clash === false) }; if (o) for (var k in o) if (!(k in e)) e[k] = o[k]; ENTRIES.push(e); return e; }
  /* cranes */
  E('tower-crane-saddle-jib', 'crane', 'tower-crane-saddle-jib', symTowerCrane, 'towerCrane', { tag: 'TC', ring: 'jib', namesRealMachine: true });
  E('tower-crane-self-erecting', 'crane', 'tower-crane-self-erecting', symTowerCrane, 'selfErecting', { tag: 'TC', ring: 'jib', namesRealMachine: true });
  E('crawler-crane', 'crane', 'crawler-crane', symCrawlerCrane, 'crawlerCrane', { tag: 'CC', ring: 'slew', namesRealMachine: true });
  E('mobile-crane-travelling', 'crane', 'mobile-crane-at', symWheeled, 'mobileCraneTravelling', { tag: 'MC', namesRealMachine: true });
  E('mobile-crane-deployed', 'crane', 'mobile-crane-at-deployed', symOutriggers, 'mobileCraneDeployed', { tag: 'MC', ring: 'slew', namesRealMachine: true });
  E('mobile-crane-1200t-rigged', 'crane', 'mobile-crane-ltm11200-rigged', symOutriggers, 'mobileCraneHeavyRigged', { tag: 'MC', ring: 'slew', namesRealMachine: true });
  /* excavation */
  E('excavator-mini-8t', 'excavation', 'excavator-mini-8t', symTracked, 'excavator', { tag: 'EX', ring: 'slew' });
  E('excavator-20t', 'excavation', 'excavator-20t', symTracked, 'excavator', { tag: 'EX', ring: 'slew' });
  E('excavator-36t', 'excavation', 'excavator-36t', symTracked, 'excavator', { tag: 'EX', ring: 'slew' });
  E('excavator-long-reach', 'excavation', 'excavator-long-reach', symTracked, 'excavator', { tag: 'EX', ring: 'slew' });
  E('backhoe-loader', 'excavation', 'backhoe-loader-3cx', symWheeled, 'backhoe', { tag: 'BH' });
  /* earthmoving */
  E('dozer-d6', 'earthmoving', 'dozer-d6', symTracked, 'dozer', { tag: 'DZ' });
  E('wheel-loader-966', 'earthmoving', 'wheel-loader-966', symWheeled, 'wheelLoader', { tag: 'WL' });
  E('motor-grader-140', 'earthmoving', 'motor-grader-140', symWheeled, 'grader', { tag: 'GR' });
  E('roller-single-drum', 'earthmoving', 'roller-single-drum', symWheeled, 'rollerSingle', { tag: 'RL' });
  E('roller-tandem', 'earthmoving', 'roller-tandem', symWheeled, 'rollerTandem', { tag: 'RL' });
  E('skid-steer', 'earthmoving', 'skid-steer', symWheeled, 'skidSteer', { tag: 'SS' });
  E('articulated-dump-truck', 'earthmoving', 'adt-745', symWheeled, 'adt', { tag: 'DT' });
  /* haulage */
  E('rigid-hgv', 'haulage', 'rigid-hgv', symWheeled, 'rigidTipper', { tag: 'HV' });
  E('articulated-lorry', 'haulage', 'lorry-artic-eu', symWheeled, 'artic', { tag: 'HV' });
  E('concrete-mixer-truck', 'haulage', 'concrete-mixer-truck', symWheeled, 'mixerTruck', { tag: 'MX' });
  E('pickup-double-cab', 'haulage', 'pickup-double-cab', symWheeled, 'pickup', { tag: 'PU' });
  E('panel-van', 'haulage', 'panel-van-transit', symWheeled, 'van', { tag: 'VN' });
  E('car', 'haulage', 'car-passenger', symWheeled, 'car', { tag: 'CA' });
  E('site-bowser', 'haulage', 'bowser-site-tow-2000l', symWheeled, 'bowser', { tag: 'BW' });
  /* access and lifting */
  E('telehandler', 'access', 'telehandler', symWheeled, 'telehandler', { tag: 'TH' });
  E('scissor-lift', 'access', 'scissor-lift', symWheeled, 'scissorLift', { tag: 'SL' });
  E('boom-lift', 'access', 'boom-lift', symWheeled, 'boomLift', { tag: 'BL' });
  E('construction-hoist', 'access', 'construction-hoist', symHoist, 'hoist', { tag: 'HO' });
  E('scaffold-run', 'access', 'scaffold-bay', symScaffold, 'scaffold', { tag: 'SC', linear: true });
  /* concrete */
  E('concrete-boom-pump', 'concrete', 'concrete-boom-pump', symPump, 'boomPump', { tag: 'CP' });
  /* welfare, storage */
  E('site-cabin', 'welfare', 'site-cabin-jackleg', symCabin, 'cabin', { tag: 'SO' });
  E('welfare-unit', 'welfare', 'welfare-unit-mobile', symCabin, 'welfare', { tag: 'WU' });
  E('portable-toilet', 'welfare', 'portable-toilet', symCabin, 'toilet', { tag: 'WC' });
  E('container-10ft', 'storage', 'container-10ft', symContainer, 'container10', { tag: 'CT' });
  E('container-20ft', 'storage', 'container-20ft', symContainer, 'container20', { tag: 'CT' });
  E('container-40ft', 'storage', 'container-40ft', symContainer, 'container40', { tag: 'CT' });
  E('container-40ft-hc', 'storage', 'container-40ft-hc', symContainer, 'container40hc', { tag: 'CT' });
  E('pallet', 'storage', 'pallet-euro', symPlate, 'pallet', { tag: 'PL', clash: false });
  /* boundary and roadway */
  E('fence-panel', 'boundary', 'fence-panel', symPanel, 'fencePanel', { tag: 'HF', linear: true });
  E('jersey-barrier', 'boundary', 'jersey-barrier', symPlate, 'jerseyBarrier', { tag: 'JB', linear: true });
  E('road-plate', 'boundary', 'road-plate', symPlate, 'roadPlate', { tag: 'RP', linear: true, clash: false });
  E('trackway-mat', 'boundary', 'trackway-mat', symPlate, 'trackwayMat', { tag: 'TW', linear: true, clash: false });
  /* traffic and safety */
  E('traffic-cone', 'traffic', 'traffic-cone-750', symPoint, 'trafficCone', { tag: 'TC' });
  E('site-sign', 'traffic', 'site-sign-post', symPoint, 'sign', { tag: 'SG' });
  E('parking-bay', 'traffic', 'parking-bay-uk', symPlate, 'parkingBay', { tag: 'PB', clash: false });
  /* people */
  E('person', 'people', 'person-standing', symPerson, 'person', { tag: 'P' });
  /* zones: DRAWN polygons; size is the user's input, height is the zone's operational band */
  var ZONES = [['laydown', 'Laydown area', 'ansi31', 0.02], ['crane-exclusion', 'Crane exclusion zone', 'ansi37', 0.02], ['lifting-zone', 'Lifting zone', 'ansi37', 0.02],
    ['welfare-compound', 'Welfare compound', 'dots', 0.02], ['spoil-heap', 'Spoil heap', 'earth', 3], ['wash-down', 'Wheel wash / wash-down', 'ansi31', 0.02],
    ['muster-point', 'Muster point', 'none', 0.02], ['pedestrian-route', 'Pedestrian route', 'ansi31', 0.02], ['vehicle-route', 'Vehicle route', 'none', 0.02],
    ['haul-road', 'Haul road (one way)', 'none', 0.02], ['delivery-bay', 'Delivery bay', 'none', 0.02], ['skip-area', 'Skip area', 'ansi31', 0.02],
    ['temporary-works', 'Temporary works zone', 'ansi37', 0.02], ['hazardous-store', 'Hazardous substances store', 'ansi37', 0.02], ['excavation', 'Open excavation', 'earth', 0.02]];
  ZONES.forEach(function (z) { E('zone-' + z[0], 'zone', null, null, null, { kind: 'zone', label: z[1], hatch: z[2], band: z[3], tag: 'Z', clash: z[0] === 'spoil-heap' }); });

  var BY_ID = Object.create(null);
  ENTRIES.forEach(function (e) { BY_ID[e.id] = e; });

  function dim() { return g.MCDIM || null; }
  function models() { return g.MCSITEMODELS || null; }
  function specOf(entry) { var e = typeof entry === 'string' ? BY_ID[entry] : entry; if (!e || !e.dim || !dim()) return null; return dim().SPECS[e.dim] || null; }
  function genOf(e) { var M = models(); return (M && e && e.model && typeof M[e.model] === 'function') ? M[e.model] : null; }
  function get(id) { return BY_ID[id] || null; }
  function list(family) { return ENTRIES.filter(function (e) { return !family || e.family === family; }); }
  function label(entry) { var e = typeof entry === 'string' ? BY_ID[entry] : entry; if (!e) return ''; if (e.kind === 'zone') return e.label; var s = specOf(e); return s ? s.name : e.id; }
  function ringOf(e, s) { if (!e.ring || !s) return null; var x = s.extras || {}; if (e.ring === 'jib') { var r = x.maxJibRadius || x.maxRadius; return r ? { r: r, cx: 0, z0: s.H - 4, z1: s.H, kind: 'jib' } : null; } var sl = s.slew; if (!sl) return null; var rr = Math.max(sl.radius || 0, sl.tailSwing || 0); if (!rr) return null; var cx = sl.bodySlews && sl.tailSwing ? -s.L / 2 + sl.tailSwing : 0; return { r: rr, cx: cx, z0: x.counterweightClearance != null ? x.counterweightClearance : (sl.clearance != null ? sl.clearance : 0.9), z1: s.H, kind: sl.bodySlews ? 'tail' : 'turret' }; }
  function extentOf(entry, params) {
    var e = typeof entry === 'string' ? BY_ID[entry] : entry;
    if (!e) return { refusal: { reason: 'no catalogue entry ' + JSON.stringify(entry) } };
    if (e.kind === 'zone') {
      var pts = params && Array.isArray(params.pts) ? params.pts : null;
      if (!pts || pts.length < 3) return { refusal: { reason: 'a zone is drawn: it has no size until its polygon is given' } };
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      return { x0: x0, y0: y0, x1: x1, y1: y1, z0: 0, z1: e.band, w: x1 - x0, d: y1 - y0, h: e.band, ws: 0, wsx: 0, wsy: 0, basis: 'drawn polygon' };
    }
    var s = specOf(e);
    if (!s) return { refusal: { reason: 'MCDIM row ' + JSON.stringify(e.dim) + ' is not loaded, so ' + e.id + ' has no dimension' } };
    var n = (params && params.count > 1 && e.linear) ? Math.round(params.count) : 1;
    /* an adjustable entry's clash box follows its parameters: the generator's own size rule, never the row it started from */
    var sz = (e.size && params && params.params) ? e.size(D(s), e.args || {}, params.params) : null, SL = sz ? sz.L : s.L, SW = sz ? sz.W : s.W, SH = sz ? sz.H : s.H;
    var L = SL * n, ext = { x0: -L / 2, y0: -SW / 2, x1: L / 2, y1: SW / 2, z0: 0, z1: SH, w: L, d: SW, h: SH, ws: 0, wsx: 0, wsy: 0, basis: sz ? 'adjusted from ' + s.source : s.source, dim: s.id, count: n, adjusted: !!sz };
    var ring = ringOf(e, s);
    if (ring) { ext.ws = ring.r; ext.wsx = ring.cx; ext.wsy = 0; ext.wz0 = ring.z0; ext.wz1 = ring.z1; ext.ringKind = ring.kind; }
    return ext;
  }
  function instance(entryId, o) {
    o = o || {}; var e = BY_ID[entryId];
    if (!e) return { refusal: { reason: 'no catalogue entry ' + JSON.stringify(entryId) } };
    var ext = extentOf(e, o); if (ext.refusal) return ext;
    return { uid: o.uid || (e.tag + '-' + Math.random().toString(36).slice(2, 8)), id: e.id, x: Number(o.x) || 0, y: Number(o.y) || 0, rot: Number(o.rot) || 0, sx: 1, sy: 1, sz: 1,
      tasks: Array.isArray(o.tasks) ? o.tasks.slice() : [], _ext: ext, _params: o.params || null, _site: { entry: e.id, family: e.family, dim: e.dim, count: ext.count || 1, pts: o.pts || null, params: o.params || null },
      _meta: { type: (e.kind === 'zone' ? 'ZONE · ' : 'SITE · ') + e.family, name: o.name || label(e), group: e.family, file: 'site logistics', storey: o.storey || null, guid: null } };
  }
  function symbolOf(entryId) { var e = BY_ID[entryId]; if (!e || e.kind === 'zone' || !e.symbol) return null; var s = specOf(e); if (!s) return null; return { prims: e.symbol(D(s)), L: s.L, W: s.W, tag: e.tag, basis: 'massing to ' + s.source }; }
  /* the 3-D model: parts from the named generator, built to the row. A missing generator is a refusal, not an empty box. */
  function blockOf(entryId, params) {
    var e = BY_ID[entryId]; if (!e || e.kind === 'zone') return null; var s = specOf(e); if (!s) return null;
    var gen = genOf(e); if (!gen) return { parts: [], L: s.L, W: s.W, H: s.H, refusal: { reason: 'generator ' + JSON.stringify(e.model) + ' is not loaded for ' + e.id } };
    var d = D(s); if (e.args) d.a = e.args; d.p = params || {};
    var parts; try { parts = gen(d); dunnage(parts); } catch (err) { return { parts: [], L: s.L, W: s.W, H: s.H, refusal: { reason: 'generator ' + e.model + ' threw: ' + (err && err.message || err) } }; }
    return { parts: parts, L: s.L, W: s.W, H: s.H, model: e.model, basis: 'parametric model to published overall size (' + s.source + '); internal proportions follow the machine class' };
  }
  /* DECLARED RULE: dunnage is not the pack. Timber bearers under a bundle, lifting eyes, hazard
     tape and edge-protection posts round an excavation are drawn for realism but are not the
     object the row measures, so they are marked beyond and stay out of the solid extent. */
  function dunnage(parts) { parts.forEach(function (p) { if (p.beyond != null) return; if ((p.s === 'box' && p.m === 'timber-dark' && p.h <= 0.16 && p.l <= 0.35) || (p.s === 'torus' && p.r <= 0.03) || (p.s === 'box' && p.m === 'hazard-yellow' && p.h <= 0.12) || (p.s === 'box' && p.m === 'timber-dark' && p.l <= 0.06 && p.w <= 0.06)) p.beyond = true; }); }
  /* every entry answered: sourced and drawable, or refused by name */
  function audit() {
    var out = { entries: ENTRIES.length, sourced: 0, drawable: 0, zones: 0, unresolved: [], generators: {} };
    ENTRIES.forEach(function (e) { if (e.kind === 'zone') { out.zones++; return; } if (specOf(e)) out.sourced++; else out.unresolved.push(e.id + ': MCDIM row ' + e.dim + ' missing'); if (genOf(e)) { out.drawable++; out.generators[e.model] = (out.generators[e.model] || 0) + 1; } else out.unresolved.push(e.id + ': generator ' + e.model + ' missing'); });
    return out;
  }
  /* later catalogue files add entries here: [id, family, dim, symbolName, model, opts]. Families they name are registered too. */
  var SYMS = { tracked: symTracked, wheeled: symWheeled, cabin: symCabin, container: symContainer, point: symPoint, plate: symPlate, panel: symPanel, scaffold: symScaffold, hoist: symHoist, outriggers: symOutriggers, crawler: symCrawlerCrane, tower: symTowerCrane, pump: symPump, person: symPerson };
  function register(list, fams) { if (fams) for (var k in fams) FAMILIES[k] = fams[k]; var n = 0; (list || []).forEach(function (r) { if (BY_ID[r[0]]) return; var e = E(r[0], r[1], r[2], SYMS[r[3]] || symPlate, r[4], r[5]); BY_ID[e.id] = e; n++; }); return n; }
  g.MCSITECAT = { VERSION: 3, register: register, SYMBOLS: SYMS, PART_SHAPES: ['box', 'cyl', 'cone', 'sphere', 'torus', 'tube', 'curve', 'profile', 'lathe'], FAMILIES: FAMILIES, LINE_WEIGHTS: LW, ENTRIES: ENTRIES, get: get, list: list, label: label, specOf: specOf, ringOf: ringOf, extentOf: extentOf, instance: instance, symbolOf: symbolOf, blockOf: blockOf, audit: audit };
})(typeof window !== 'undefined' ? window : globalThis);
