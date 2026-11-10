/* mc-site-models-static.js — site establishment and temporary works: jackleg cabin,
   mobile welfare unit, portable toilet, ISO containers, Euro pallet, mesh fence panel,
   Jersey barrier, road plate, trackway mat, traffic cone, post-mounted sign, parking
   bay, the standing figure, a scaffold run and the rack-and-pinion hoist.
   Published module figures (ISO 668 corner castings, EN 39 tube, EN 12811 lifts, Heras
   panel feet) are read from the MCDIM row.  Origin at the plan centre, z up. */
(function (g) {
  'use strict';
  var P = g.MCPARTS, R = g.MCSITEMODELS = g.MCSITEMODELS || {};
  var box = P.box, cyl = P.cyl, tube = P.tube, prof = P.prof, lathe = P.lathe, torus = P.torus, P3 = P.P3, arc = P.arc, roundRect = P.roundRect;

  /* a window with frame, sill and glass, set in a wall on the ±y face */
  function win(x, ys, z, w, h, o) { var s = ys > 0 ? 1 : -1, out = []; out.push(box(w + 0.08, 0.05, h + 0.08, x, ys + s * 0.01, z - 0.04, (o && o.frame) || 'cab-dark')); out.push(box(w, 0.02, h, x, ys + s * 0.03, z, 'glass', { noShadow: true })); out.push(box(w + 0.12, 0.08, 0.03, x, ys + s * 0.04, z - 0.06, 'galvanised')); if (o && o.bars) for (var i = 1; i < 4; i++) out.push(box(0.02, 0.02, h, x - w / 2 + w * i / 4, ys + s * 0.06, z, 'steel-dark', { noEdge: true })); return out; }
  function door(x, ys, z, w, h, m) { var s = ys > 0 ? 1 : -1; return [box(w + 0.08, 0.05, h + 0.05, x, ys + s * 0.01, z, 'cab-dark'), box(w, 0.04, h, x, ys + s * 0.03, z, m || 'steel-grey'), box(0.03, 0.05, 0.12, x + w * 0.35, ys + s * 0.07, z + h * 0.48, 'galvanised'), box(w * 0.5, 0.02, 0.3, x, ys + s * 0.055, z + h * 0.62, 'glass', { noShadow: true })]; }
  /* ---- jackleg anti-vandal cabin: four adjustable legs, skid frame, panelled walls, shuttered windows, door with step, roof with drip edge, a/c unit ---- */
  R.cabin = function (d) {
    var jack = d.x.jackSection || 0.08, plate = d.x.basePlate || 0.25, z0 = 0.5, out = [], hw = d.W / 2, m = 'cab-white', i;
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { var x = c[0] * (d.L / 2 - 0.4), y = c[1] * (hw - 0.14); out.push(box(jack, jack, z0 + 0.5, x, y, 0.02, 'plant-yellow')); out.push(box(jack * 1.5, jack * 1.5, 0.2, x, y, z0 - 0.2, 'steel-dark')); out.push(box(plate, plate, 0.02, x, y, 0, 'steel-dark', { beyond: plate > jack * 2 + 0.02 })); for (i = 0; i < 4; i++) out.push(cyl(0.02, 0.06, x + jack * 0.5, y, 0.12 + i * 0.1, 'steel-dark', { axis: 'x', seg: 8 })); });
    out.push(box(d.L * 0.96, d.W * 0.72, 0.18, 0, 0, z0 - 0.18, 'steel-dark')); [-1, 1].forEach(function (s) { out.push(box(d.L * 0.96, 0.1, 0.18, 0, s * (d.W * 0.36), z0 - 0.18, 'steel-dark')); });   /* skid frame */
    out.push(box(d.L - 0.06, d.W * 0.94, 0.08, 0, 0, z0 - 0.02, 'steel-grey'));   /* floor edge */
    out.push(box(d.L - 0.06, d.W * 0.94, d.H - z0 - 0.1, 0, 0, z0 + 0.06, m));
    var n = Math.max(2, Math.round(d.L / 1.2)); for (i = 1; i < n; i++) [-1, 1].forEach(function (s) { out.push(box(0.03, 0.015, d.H - z0 - 0.2, -d.L / 2 + 0.03 + d.L * i / n, s * (d.W * 0.47 + 0.008), z0 + 0.1, 'steel-grey', { noEdge: true })); });   /* panel joints */
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { out.push(box(0.1, 0.1, d.H - z0 - 0.1, c[0] * (d.L / 2 - 0.05), c[1] * (d.W * 0.47), z0 + 0.06, 'steel-grey')); });   /* corner posts */
    out.push(box(d.L, d.W, 0.1, 0, 0, d.H - 0.1, 'steel-grey')); out.push(box(d.L, d.W * 0.98, 0.025, 0, 0, d.H - 0.005, 'cladding', { noEdge: true }));   /* roof and drip edge */
    var nw = Math.max(1, Math.round(d.L / 2.3)), wl = Math.min(1.15, d.L / nw * 0.5); for (i = 0; i < nw; i++) { var wx = -d.L / 2 + d.L / nw * (i + 0.5); out = out.concat(win(wx, d.W * 0.47, z0 + 1.05, wl, 0.85, { bars: true })); if (i > 0) out = out.concat(win(wx, -d.W * 0.47, z0 + 1.05, wl, 0.85, { bars: true })); }
    var dx = -d.L / 2 + 0.75; out = out.concat(door(dx, -d.W * 0.47, z0 + 0.06, 0.9, d.H - z0 - 0.35, 'steel-grey'));
    out.push(box(1.1, 0.7, 0.05, dx, -(hw + 0.35), z0 - 0.05, 'checker', { beyond: true })); out.push(box(1.1, 0.35, 0.05, dx, -(hw + 0.87), z0 - 0.3, 'checker', { beyond: true })); [-1, 1].forEach(function (s) { out.push(box(0.05, 0.05, z0 - 0.05, dx + s * 0.52, -(hw + 0.68), 0, 'galvanised', { beyond: true })); });   /* landing and step */
    out = out.concat(P.rails([P3(dx - 0.55, -(hw + 0.7), z0), P3(dx + 0.55, -(hw + 0.7), z0)], 1.0, { m: 'galvanised', r: 0.017 }).map(function (p) { p.beyond = true; return p; }));
    out.push(box(0.8, 0.35, 0.55, d.L / 2 - 0.9, d.W * 0.47 + 0.19, d.H - 0.95, 'aluminium', { beyond: true })); for (i = 0; i < 6; i++) out.push(box(0.75, 0.01, 0.02, d.L / 2 - 0.9, d.W * 0.47 + 0.37, d.H - 0.9 + i * 0.08, 'steel-dark', { noEdge: true }));   /* a/c unit */
    out.push(box(0.12, 0.12, 0.06, d.L / 2 - 0.4, 0.4, d.H, 'steel-dark', { beyond: true })); out.push(cyl(0.02, 0.6, d.L / 2 - 0.4, 0.4, d.H + 0.06, 'galvanised', { beyond: true }));   /* aerial */
    return out;
  };
  /* ---- towable mobile welfare unit: single axle, drawbar, generator locker, canteen body with hopper windows, toilet door ---- */
  R.welfare = function (d) {
    var wr = 0.33, out = P.axle(-d.L * 0.06, d.W, wr, 0.2, { rim: 0.6, lugs: 5 }), z0 = wr * 2 + 0.08, m = 'cab-white', bl = d.L * 0.74, bx = -d.L * 0.12;
    out.push(box(bl, d.W * 0.6, 0.14, bx, 0, z0 - 0.14, 'steel-dark'));
    out.push(box(bl, d.W * 0.94, d.H - z0 - 0.1, bx, 0, z0, m)); out.push(box(bl + 0.06, d.W * 0.98, 0.1, bx, 0, d.H - 0.1, 'steel-grey'));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { out.push(box(0.08, 0.08, d.H - z0 - 0.1, bx + c[0] * (bl / 2 - 0.04), c[1] * d.W * 0.47, z0, 'steel-grey')); });
    out = out.concat(win(bx - 0.4, d.W * 0.47, z0 + 1.1, 0.9, 0.6, { bars: true }), win(bx + 0.9, d.W * 0.47, z0 + 1.1, 0.9, 0.6, { bars: true }));
    out = out.concat(door(bx + bl * 0.28, -d.W * 0.47, z0 + 0.02, 0.8, d.H - z0 - 0.4, 'plant-blue')); out = out.concat(door(bx - bl * 0.3, -d.W * 0.47, z0 + 0.02, 0.7, d.H - z0 - 0.4, 'steel-grey'));
    out.push(box(0.9, 0.5, 0.05, bx + bl * 0.28, -(d.W / 2 + 0.28), z0 - 0.02, 'checker', { beyond: true })); out.push(box(0.9, 0.3, 0.05, bx + bl * 0.28, -(d.W / 2 + 0.7), z0 - 0.35, 'checker', { beyond: true }));
    out.push(box(0.5, d.W * 0.8, 0.9, bx + bl / 2 + 0.28, 0, z0 - 0.1, 'steel-dark')); out.push(box(0.45, 0.4, 0.1, bx + bl / 2 + 0.28, d.W * 0.2, z0 + 0.8, 'steel-grey')); out = out.concat(P.exhaust(bx + bl / 2 + 0.28, -d.W * 0.2, z0 + 0.8, 0.35, 0.035));   /* generator locker */
    out.push(tube(P3(bx + bl / 2 + 0.5, 0, z0 - 0.08), P3(d.L / 2 - 0.05, 0, wr * 0.9), 0.04, 'steel-dark')); [-1, 1].forEach(function (s) { out.push(tube(P3(bx + bl / 2 + 0.5, s * d.W * 0.3, z0 - 0.08), P3(d.L / 2 - 0.4, 0, wr * 0.92), 0.035, 'steel-dark')); });
    out.push(torus(0.05, 0.012, d.L / 2 - 0.02, 0, wr * 0.9, 'steel-dark', { axis: 'x' })); out.push(tube(P3(d.L / 2 - 0.35, 0, wr * 0.9), P3(d.L / 2 - 0.35, 0, 0.15), 0.028, 'steel-dark')); out.push(cyl(0.12, 0.1, d.L / 2 - 0.35, 0, 0.02, 'rubber-flat', { axis: 'y' }));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { out.push(box(0.06, 0.06, z0 - 0.15, bx + c[0] * (bl / 2 - 0.2), c[1] * (d.W * 0.44), 0.02, 'galvanised')); out.push(box(0.16, 0.16, 0.02, bx + c[0] * (bl / 2 - 0.2), c[1] * (d.W * 0.44), 0, 'steel-dark')); });   /* corner steadies */
    out.push(cyl(0.25, 0.3, bx - bl * 0.25, 0, d.H, 'plant-blue', { seg: 20 }));   /* water tank */
    return out;
  };
  R.toilet = function (d) {
    var out = [box(d.L, d.W, 0.14, 0, 0, 0, 'steel-dark')], m = 'plant-blue';
    out.push(prof(roundRect(-d.L / 2 + 0.02, d.L / 2 - 0.02, -d.W / 2 + 0.02, d.W / 2 - 0.02, 0.08), d.H - 0.3, 0, 0, 0.14, m, { axis: 'z' }));
    out.push(prof(roundRect(-d.L / 2, d.L / 2, -d.W / 2, d.W / 2, 0.12), 0.16, 0, 0, d.H - 0.16, 'cab-white', { axis: 'z' }));   /* translucent roof */
    for (var i = 0; i < 6; i++) out.push(box(0.012, d.W * 0.86, 0.02, d.L / 2 - 0.05 + 0.02 * (i % 2), 0, 0.3 + i * 0.35, 'plant-blue', { noEdge: true }));
    out.push(box(0.015, d.W * 0.62, d.H * 0.72, d.L / 2 + 0.005, 0, 0.22, 'plant-blue'));   /* door */
    out.push(box(0.03, 0.04, 0.16, d.L / 2 + 0.02, -d.W * 0.24, d.H * 0.45, 'steel-grey')); out.push(box(0.02, 0.1, 0.03, d.L / 2 + 0.02, -d.W * 0.24, d.H * 0.58, 'lamp-white', { noEdge: true }));   /* handle, vacancy indicator */
    out.push(box(0.04, 0.25, 0.25, d.L / 2 - 0.01, 0, d.H * 0.74, 'steel-dark')); for (i = 0; i < 4; i++) out.push(box(0.01, 0.22, 0.02, d.L / 2 + 0.01, 0, d.H * 0.74 + 0.04 + i * 0.05, 'steel-grey', { noEdge: true }));   /* vent louvre */
    out.push(cyl(0.05, 0.25, -d.L / 2 + 0.2, 0, d.H - 0.2, 'steel-dark'));   /* vent pipe */
    return out;
  };
  /* ---- ISO container: corrugated side and end panels, corner castings, top and bottom side rails, door end with locking bars, CSC plate ---- */
  R.container = function (d, m) {
    m = m || 'container'; var pitch = 0.2794, depth = 0.036, out = [], i, hw = d.W / 2, hz = d.H;
    function corrugated(u0, u1, v, flip) { var n = Math.max(4, Math.round((u1 - u0) / pitch)), step = (u1 - u0) / n, pts = []; for (i = 0; i <= n; i++) { var u = u0 + i * step; pts.push([u, v + (i % 2 ? depth : 0) * flip]); if (i < n) pts.push([u + step * 0.5, v + (i % 2 ? 0 : depth) * flip]); } return pts; }
    var u0 = -d.L / 2 + 0.16, u1 = d.L / 2 - 0.16, v = hw - 0.09;
    var side = corrugated(u0, u1, -v, 1).concat(corrugated(u0, u1, v, -1).reverse());   /* a closed ring: both sides */
    out.push(prof(side, hz - 0.3, 0, 0, 0.15, m, { axis: 'z' }));
    out.push(prof(corrugated(-v + 0.05, v - 0.05, -(d.L / 2 - 0.08), 1).concat([[v - 0.05, -(d.L / 2 - 0.02)], [-v + 0.05, -(d.L / 2 - 0.02)]]).map(function (q) { return [q[1], q[0]]; }), hz - 0.3, 0, 0, 0.15, m, { axis: 'z' }));   /* front end wall */
    out.push(box(d.L - 0.1, d.W - 0.1, 0.05, 0, 0, hz - 0.2, m)); for (i = 1; i < Math.round(d.L / 0.6); i++) out.push(box(0.05, d.W - 0.2, 0.02, -d.L / 2 + 0.6 * i, 0, hz - 0.15, m, { noEdge: true }));   /* roof and its corrugations */
    [-1, 1].forEach(function (s) { out.push(box(d.L - 0.28, 0.14, 0.16, 0, s * (hw - 0.07), 0, 'steel-dark')); out.push(box(d.L - 0.28, 0.1, 0.16, 0, s * (hw - 0.05), hz - 0.16, 'steel-dark')); for (i = 0; i < Math.round(d.L / 1.2); i++) out.push(box(0.1, 0.05, 0.16, -d.L / 2 + 0.6 + i * 1.2, s * (hw - 0.14), 0.02, 'steel-dark', { noEdge: true })); });   /* rails and floor cross-members */
    [-1, 1].forEach(function (s) { out.push(box(0.14, d.W - 0.28, 0.16, s * (d.L / 2 - 0.07), 0, 0, 'steel-dark')); out.push(box(0.1, d.W - 0.28, 0.16, s * (d.L / 2 - 0.05), 0, hz - 0.16, 'steel-dark')); });
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { out.push(box(0.16, 0.16, hz, c[0] * (d.L / 2 - 0.08), c[1] * (hw - 0.08), 0, 'steel-dark')); [0.06, hz - 0.12].forEach(function (z) { out.push(box(0.18, 0.18, 0.12, c[0] * (d.L / 2 - 0.09), c[1] * (hw - 0.09), z, 'steel-grey')); out.push(box(0.02, 0.06, 0.05, c[0] * (d.L / 2 - 0.0), c[1] * (hw - 0.09), z + 0.035, 'steel-black', { noEdge: true })); }); });   /* corner posts and castings */
    /* the door end: two leaves with corrugation, four locking bars with cams and handles, hinges, the CSC plate */
    var xd = d.L / 2 - 0.02; out.push(prof(corrugated(-v + 0.1, v - 0.1, xd - 0.05, 1).map(function (q) { return [q[1], q[0]]; }).concat([[xd - 0.02, v - 0.1], [xd - 0.02, -v + 0.1]]), hz - 0.36, 0, 0, 0.18, m, { axis: 'z' }));
    out.push(box(0.04, 0.03, hz - 0.4, xd, 0, 0.2, 'steel-dark', { noEdge: true }));
    [-0.7, -0.3, 0.3, 0.7].forEach(function (f) { var y = f * (hw - 0.14); out.push(tube(P3(xd + 0.02, y, 0.3), P3(xd + 0.02, y, hz - 0.3), 0.02, 'galvanised')); out.push(box(0.04, 0.08, 0.1, xd + 0.02, y, 0.32, 'steel-grey')); out.push(box(0.04, 0.08, 0.1, xd + 0.02, y, hz - 0.42, 'steel-grey')); out.push(box(0.04, 0.06, 0.36, xd + 0.02, y, 1.0, 'steel-grey')); out.push(tube(P3(xd + 0.035, y, 1.18), P3(xd + 0.035, y + (f < 0 ? 0.25 : -0.25), 1.18), 0.012, 'galvanised')); });
    [-1, 1].forEach(function (s) { for (i = 0; i < 4; i++) out.push(box(0.04, 0.08, 0.14, xd, s * (hw - 0.2), 0.3 + i * (hz - 0.8) / 3, 'steel-grey', { noEdge: true })); });   /* hinges */
    out.push(box(0.006, 0.22, 0.14, xd + 0.012, -(hw - 0.45), hz * 0.28, 'aluminium', { noEdge: true }));   /* CSC plate */
    return out;
  };
  R.container10 = function (d) { return R.container(d, 'container'); };
  R.container20 = function (d) { return R.container(d, 'container'); };
  R.container40 = function (d) { return R.container(d, 'container-2'); };
  R.container40hc = function (d) { return R.container(d, 'container-3'); };
  R.pallet = function (d) {
    var out = [], t = 0.022, bh = d.H - 2 * t - 0.078 + 0.078, blk = 0.078, i;   /* EUR: 22 mm boards, 78 mm blocks */
    [-d.L / 2 + 0.0725, 0, d.L / 2 - 0.0725].forEach(function (x) { out.push(box(0.145, d.W, t, x, 0, 0, 'timber')); [-d.W / 2 + 0.05, 0, d.W / 2 - 0.05].forEach(function (y) { out.push(box(0.145, 0.1, blk, x, y, t, 'timber-dark')); }); });
    [-d.W / 2 + 0.0725, 0, d.W / 2 - 0.0725].forEach(function (y) { out.push(box(d.L, 0.145, t, 0, y, t + blk, 'timber')); });
    for (i = 0; i < 5; i++) out.push(box(d.L, i === 0 || i === 4 ? 0.145 : 0.1, t, 0, -d.W / 2 + 0.0725 + i * (d.W - 0.145) / 4, 2 * t + blk, 'timber'));
    return out;
  };
  /* ---- Heras-type mesh fence panel: two uprights, top and bottom rails, welded mesh infill, anti-climb top, coupler, feet shared with the neighbour ---- */
  R.fencePanel = function (d) {
    var r = 0.021, fl = d.x.footLength || 0.77, fw = d.W, fh = d.x.footHeight || 0.14, out = [], x0 = -d.L / 2 + 0.06, x1 = d.L / 2 - 0.06, z1 = d.H - 0.02;
    [-d.L / 2, d.L / 2].forEach(function (x) { out.push(prof([[-fl / 2, 0], [fl / 2, 0], [fl / 2 - 0.05, fh], [-fl / 2 + 0.05, fh]], fw, x, 0, 0, 'concrete-cast', { axis: 'y' })); out.push(box(0.09, 0.09, 0.02, x, 0, fh, 'steel-dark', { beyond: true })); });
    out.push(tube(P3(x0, 0, fh), P3(x0, 0, z1), r)); out.push(tube(P3(x1, 0, fh), P3(x1, 0, z1), r));
    out.push(tube(P3(x0, 0, fh + 0.05), P3(x1, 0, fh + 0.05), r)); out.push(tube(P3(x0, 0, z1 - 0.02), P3(x1, 0, z1 - 0.02), r));
    out.push(box(x1 - x0 - 0.04, 0.008, z1 - fh - 0.09, 0, 0, fh + 0.07, 'mesh', { noShadow: true }));
    for (var i = 1; i < 4; i++) out.push(tube(P3(x0 + (x1 - x0) * i / 4, 0, fh + 0.05), P3(x0 + (x1 - x0) * i / 4, 0, z1 - 0.02), 0.006, 'galvanised'));   /* the heavier verticals */
    out.push(box(0.11, 0.09, 0.14, x1, 0, z1 - 0.4, 'galvanised')); out.push(cyl(0.02, 0.1, x1, 0.06, z1 - 0.33, 'steel-dark', { axis: 'y' }));   /* coupler and bolt */
    return out;
  };
  R.jerseyBarrier = function (d) {
    var tw = d.x.topWidth || 0.178, toe = d.x.toeHeight || 0.076, w = d.W, h = d.H, pts = [[-w / 2, 0], [w / 2, 0], [w / 2, toe], [w / 2 - 0.055, toe], [tw / 2, h * 0.42], [tw / 2, h], [-tw / 2, h], [-tw / 2, h * 0.42], [-(w / 2 - 0.055), toe], [-w / 2, toe]];
    var out = [prof(pts, d.L, 0, 0, 0, 'concrete-cast', { axis: 'x' })];
    [-1, 1].forEach(function (s) { out.push(box(0.06, 0.14, 0.4, s * (d.L / 2 - 0.03), 0, h * 0.45, 'galvanised')); out.push(torus(0.06, 0.014, s * (d.L / 2 - 0.02), 0, h * 0.7, 'steel-dark', { axis: 'x' })); out.push(box(0.5, 0.02, 0.15, s * d.L * 0.3, w / 2 * 0.62 + 0.01, h * 0.62, 'reflective', { noEdge: true })); });
    out.push(box(0.35, 0.02, 0.15, 0, w / 2 * 0.62 + 0.01, h * 0.62, 'hazard-yellow', { noEdge: true }));
    return out;
  };
  R.roadPlate = function (d) { return [box(d.L, d.W, d.H, 0, 0, 0, 'steel-grey'), box(d.L - 0.3, d.W - 0.3, 0.003, 0, 0, d.H, 'chevron', { noEdge: true }), box(0.2, 0.12, 0.02, d.L / 2 - 0.2, 0, d.H, 'steel-dark', { beyond: true }), box(0.2, 0.12, 0.02, -(d.L / 2 - 0.2), 0, d.H, 'steel-dark', { beyond: true }), box(d.L - 0.1, 0.06, 0.006, 0, d.W / 2 - 0.08, d.H, 'hazard-yellow', { noEdge: true, beyond: true }), box(d.L - 0.1, 0.06, 0.006, 0, -(d.W / 2 - 0.08), d.H, 'hazard-yellow', { noEdge: true, beyond: true })]; };
  R.trackwayMat = function (d) { var out = [box(d.L, d.W, d.H, 0, 0, 0, 'rubber-flat')]; for (var i = 1; i < 6; i++) out.push(box(0.02, d.W * 0.96, 0.004, -d.L / 2 + d.L * i / 6, 0, d.H, 'steel-black', { noEdge: true, beyond: true })); [-1, 1].forEach(function (s) { out.push(box(0.2, 0.1, 0.015, s * (d.L / 2 - 0.15), 0, d.H, 'galvanised', { beyond: true })); out.push(box(0.06, 0.1, 0.015, s * (d.L / 2 - 0.02), d.W * 0.3, d.H * 0.3, 'galvanised', { beyond: true })); }); return out; };
  R.trafficCone = function (d) { var r = d.L / 2, h = d.H; return [box(d.L, d.W, 0.04, 0, 0, 0, 'rubber-flat'), lathe([[r * 0.75, 0.04], [r * 0.7, 0.06], [r * 0.14, h - 0.03], [r * 0.1, h], [0, h]], 0, 0, 0, 'hi-vis', { seg: 28 }), lathe([[r * 0.66 + 0.004, h * 0.34], [r * 0.5 + 0.004, h * 0.6]], 0, 0, 0, 'reflective', { seg: 28, noShadow: true })]; };
  R.sign = function (d) { var fw = Math.min(d.x.faceWidth || 0.6, d.L), fh = d.x.faceHeight || 0.45, le = d.x.lowerEdge || 1.2, fy = Math.min(0.03, d.W / 2 - 0.02); return [cyl(0.038, d.H - 0.01, 0, 0, 0, 'galvanised', { seg: 16 }), box(Math.min(0.3, d.L), Math.min(0.3, d.W), 0.02, 0, 0, 0, 'steel-dark'), box(fw, 0.012, fh, 0, fy, le, 'aluminium'), box(fw * 0.94, 0.004, fh * 0.9, 0, fy + 0.008, le + fh * 0.05, 'plant-red', { noEdge: true }), box(fw * 0.78, 0.004, fh * 0.72, 0, fy + 0.011, le + fh * 0.14, 'plant-white', { noEdge: true }), box(fw * 0.5, 0.004, fh * 0.12, 0, fy + 0.014, le + fh * 0.44, 'plant-red', { noEdge: true }), box(0.05, 0.02, 0.06, 0, fy + 0.02, le + fh * 0.2, 'galvanised'), box(0.05, 0.02, 0.06, 0, fy + 0.02, le + fh * 0.8, 'galvanised')]; };
  R.parkingBay = function (d) { return [box(d.L, d.W, 0.008, 0, 0, 0, 'ground', { noEdge: true }), box(d.L, d.W, d.H, 0, 0, 0, 'zone', { noShadow: true, noEdge: true }),   /* the bay is a volume reservation to the row's 2.49 m */ box(d.L, 0.1, 0.01, 0, d.W / 2 - 0.05, 0, 'plant-white', { noEdge: true }), box(d.L, 0.1, 0.01, 0, -(d.W / 2 - 0.05), 0, 'plant-white', { noEdge: true }), box(0.1, d.W, 0.01, -d.L / 2 + 0.05, 0, 0, 'plant-white', { noEdge: true })]; };
  R.person = function (d) { return P.person(0, 0, { H: d.H, shoulder: d.x.shoulderBreadth || d.W }); };
  /* ---- a scaffold run: base plates and sole boards, standards, ledgers and transoms per lift, boarded decks with toe boards and double guardrails, facade bracing, ladder access, debris netting ---- */
  R.scaffold = function (d) {
    var bay = d.x.bayLength || 2.5, lift = d.x.liftHeight || 2.0, r = (d.x.tubeDiameter || 0.0483) / 2, bw = d.x.boardWidth || 0.225, bt = d.x.boardThickness || 0.038, gr = d.x.guardrailHeight || 0.95, tb = d.x.toeBoardHeight || 0.15, out = [], i, k;
    var x0 = -d.L / 2 + 0.06, x1 = d.L / 2 - 0.06, n = Math.max(1, Math.round((x1 - x0) / bay)), step = (x1 - x0) / n, yi = -d.W / 2 + r + 0.02, yo = d.W / 2 - r - 0.02, top = d.H - 0.02, lifts = Math.max(1, Math.floor((top - gr) / lift));
    for (i = 0; i <= n; i++) { var x = x0 + i * step; [yi, yo].forEach(function (y) { out.push(box(0.3, 0.12, 0.04, x, y, 0, 'timber-dark')); out.push(box(0.15, 0.15, 0.006, x, y, 0.04, 'galvanised')); out.push(tube(P3(x, y, 0.045), P3(x, y, top), r)); for (k = 1; k <= lifts; k++) out.push(cyl(r * 1.6, 0.06, x, y, k * lift - 0.1, 'steel-dark', { seg: 10 })); }); }   /* standards with couplers */
    for (k = 1; k <= lifts; k++) {
      var z = k * lift; [yi, yo].forEach(function (y) { out.push(tube(P3(x0, y, z), P3(x1, y, z), r)); });   /* ledgers */
      for (i = 0; i <= n; i++) out.push(tube(P3(x0 + i * step, yi - 0.03, z + r * 2), P3(x0 + i * step, yo + 0.03, z + r * 2), r));   /* transoms */
      var nb = Math.max(1, Math.floor((d.W - 2 * r - 0.06) / bw)); for (i = 0; i < nb; i++) out.push(box(x1 - x0 - 0.02, bw - 0.012, bt, 0, yi + 0.02 + bw * (i + 0.5), z + r * 3, 'timber'));   /* boards */
      out.push(tube(P3(x0, yo, z + gr), P3(x1, yo, z + gr), r)); out.push(tube(P3(x0, yo, z + gr * 0.5), P3(x1, yo, z + gr * 0.5), r));   /* double guardrail */
      out.push(box(x1 - x0, 0.025, tb, 0, yo - 0.035, z + r * 3 + bt, 'timber'));   /* toe board */
      if (k < lifts) { var lx = x0 + step * 0.5; out.push(box(0.6, bw * 2, bt, lx, yi + 0.02 + bw, z + r * 3 + 0.001, 'ply', { noEdge: true })); out = out.concat(P.ladder(lx, yi + 0.02 + bw, z + r * 3, z + lift + 1.0, 0.4, 'x', { m: 'aluminium' })); }   /* ladder bay */
    }
    for (i = 0; i < n; i++) { var xa = x0 + i * step, xb = xa + step; out.push(tube(P3(xa, yo - 0.02, (i % 2) * lift + 0.1), P3(xb, yo - 0.02, ((i % 2) + 1) * lift), r)); }   /* facade bracing */
    out.push(tube(P3(x0, yi - 0.05, 0.1), P3(x0, yo + 0.05, lift), r)); out.push(tube(P3(x1, yi - 0.05, 0.1), P3(x1, yo + 0.05, lift), r));   /* end bracing */
    out.push(box(x1 - x0, 0.004, top - lift * 0.45, 0, d.W / 2 - 0.01, lift * 0.45, 'netting', { noShadow: true }));
    return out;
  };
  /* ---- rack-and-pinion passenger/goods hoist: base frame, lattice mast with rack, landing gate, mesh car with roof and drive unit ---- */
  R.hoist = function (d) {
    var ms = d.x.mastSectionSquare || 0.65, ml = d.x.mastSectionLength || 1.508, cl = d.L, cw = d.W - 0.02, out = [], mx = -d.L / 2 - ms / 2 - 0.08, mastH = d.H * 7;
    out.push(box(ms * 2.2, ms * 2.4, 0.3, mx + 0.2, 0, 0, 'steel-grey', { beyond: true })); out.push(box(ms * 3.5, ms * 3.5, 0.15, mx + 0.3, 0, -0.14, 'concrete-cast', { beyond: true })); out.push(box(ms, ms, 0.3, mx, 0, 0, 'galvanised', { beyond: true }));
    out.push(box(ms, ms, mastH, mx, 0, 0.3, 'galvanised', { lat: { along: 'z', section: 'sq', panel: ml / 2, chord: 0.038, brace: 0.02, bracing: 'z' }, beyond: true }));
    for (var i = 1; i * ml < mastH; i++) out.push(box(ms + 0.06, ms + 0.06, 0.03, mx, 0, 0.3 + i * ml, 'steel-dark', { beyond: true, noEdge: true }));   /* section joints */
    out.push(cyl(0.035, mastH - 0.5, mx + ms / 2 + 0.04, 0, 0.5, 'steel-dark', { beyond: true, seg: 8 })); for (i = 0; i < Math.round(mastH / 0.5); i++) out.push(box(0.05, 0.08, 0.025, mx + ms / 2 + 0.04, 0, 0.6 + i * 0.5, 'steel-grey', { beyond: true, noEdge: true }));   /* the rack */
    var x0 = -d.L / 2, xc = 0;
    out.push(box(cl, cw, 0.1, xc, 0, 0.35, 'checker')); out.push(box(cl * 0.96, cw * 0.9, 0.35, xc, 0, 0, 'steel-dark'));   /* car base frame and buffers */ out.push(box(cl, cw, 0.06, xc, 0, d.H - 0.06, 'aluminium'));
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) { out.push(box(0.07, 0.07, d.H - 0.45, xc + c[0] * (cl / 2 - 0.035), c[1] * (cw / 2 - 0.035), 0.45, 'aluminium')); });
    [-1, 1].forEach(function (s) { out.push(box(cl - 0.25, 0.01, d.H - 0.55, xc, s * (cw / 2 - 0.02), 0.45, 'mesh', { noShadow: true })); out.push(box(cl - 0.25, 0.03, 0.15, xc, s * (cw / 2 - 0.02), 0.45, 'hazard-yellow', { noEdge: true })); });
    out.push(box(0.01, cw - 0.16, d.H - 0.55, xc + cl / 2 - 0.02, 0, 0.45, 'mesh', { noShadow: true })); out.push(box(0.04, cw * 0.5, d.H - 0.6, xc + cl / 2 - 0.03, 0, 0.45, 'aluminium'));   /* ramp door */
    out.push(box(0.6, cw * 0.86, d.H * 0.4, x0 + 0.3, 0, 0.45, 'plant-yellow')); out.push(cyl(0.14, 0.4, x0 + 0.3, cw * 0.25, 0.45 + d.H * 0.4, 'steel-dark')); out.push(cyl(0.14, 0.4, x0 + 0.3, -cw * 0.25, 0.45 + d.H * 0.4, 'steel-dark')); out.push(box(ms * 0.9, ms * 0.9, d.H - 0.6, x0 - ms / 2 - 0.04, 0, 0.5, 'steel-dark', { beyond: true }));   /* drive unit with the two motors */
    out.push(box(0.3, 0.3, 0.25, x0 + 0.3, 0, 0.45 + d.H * 0.4, 'steel-dark')); out.push(box(0.4, 0.3, 0.6, x0 + 0.5, cw * 0.35, d.H - 0.9, 'lamp-amber', { noEdge: true }));
    /* the landing enclosure at ground: mesh panels and a gate on the far side */
    [-1, 1].forEach(function (s) { out.push(box(0.05, 0.05, 2.0, xc + cl / 2 + 0.3, s * (cw / 2 + 0.2), 0, 'galvanised', { beyond: true })); }); out.push(box(0.01, cw + 0.4, 1.95, xc + cl / 2 + 0.3, 0, 0.03, 'mesh', { beyond: true, noShadow: true })); out.push(box(0.05, cw + 0.4, 0.05, xc + cl / 2 + 0.3, 0, 1.98, 'galvanised', { beyond: true }));
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
