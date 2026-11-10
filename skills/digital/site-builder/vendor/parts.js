/* mc-site-parts.js — window.MCPARTS. The engineering sub-assemblies every site model
   is built from, so a tyre is the same tyre on a loader and a lorry, a hydraulic ram is a
   barrel with a chromed rod and two eyes everywhere, and a cab has pillars, glazing,
   mirrors and a beacon whether it sits on an excavator or a crane carrier.
   Everything returns an ARRAY OF PARTS in the mc-site-3d.js vocabulary, local metres,
   z up. A sub-assembly never knows the machine's published size; the generator that
   calls it does, and passes real figures (tyre radius, track gauge, cab width) in. */
(function (g) {
  'use strict';
  function ext(p, o) { if (o) for (var k in o) p[k] = o[k]; return p; }
  function box(l, w, h, x, y, z, m, o) { return ext({ s: 'box', l: l, w: w, h: h, x: x || 0, y: y || 0, z: z || 0, m: m || 'steel-grey' }, o); }
  function cyl(r, h, x, y, z, m, o) { return ext({ s: 'cyl', r: r, h: h, x: x || 0, y: y || 0, z: z || 0, m: m || 'steel-grey' }, o); }
  function cone(r, h, x, y, z, m, o) { return ext({ s: 'cone', r: r, h: h, x: x || 0, y: y || 0, z: z || 0, m: m || 'steel-grey' }, o); }
  function sphere(r, x, y, z, m, o) { return ext({ s: 'sphere', r: r, x: x, y: y, z: z, m: m || 'steel-grey' }, o); }
  function torus(R, r, x, y, z, m, o) { return ext({ s: 'torus', R: R, r: r, x: x, y: y, z: z, axis: 'z', m: m || 'steel-grey' }, o); }
  function tube(a, b, r, m, o) { return ext({ s: 'tube', a: a, b: b, r: r, m: m || 'galvanised' }, o); }
  function curve(pts, r, m, o) { return ext({ s: 'curve', pts: pts, r: r, m: m || 'hose' }, o); }
  function prof(pts, len, x, y, z, m, o) { return ext({ s: 'profile', pts: pts, len: len, x: x || 0, y: y || 0, z: z || 0, axis: 'x', m: m || 'steel-grey' }, o); }
  function lathe(pts, x, y, z, m, o) { return ext({ s: 'lathe', pts: pts, x: x || 0, y: y || 0, z: z || 0, axis: 'z', m: m || 'steel-grey' }, o); }
  function P3(x, y, z) { return [x, y, z]; }
  function arc(cx, cy, r, a0, a1, n) { var out = []; for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out; }
  function roundRect(u0, u1, v0, v1, r) { r = Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2); if (r <= 0.005) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; return [].concat(arc(u1 - r, v0 + r, r, -Math.PI / 2, 0, 5), arc(u1 - r, v1 - r, r, 0, Math.PI / 2, 5), arc(u0 + r, v1 - r, r, Math.PI / 2, Math.PI, 5), arc(u0 + r, v0 + r, r, Math.PI, 1.5 * Math.PI, 5)); }
  function houseRear(uF, uR, w, r) { r = Math.min(r, w / 2, (uF - uR) / 2); return [[uF, -w / 2], [uF, w / 2]].concat(arc(uR + r, w / 2 - r, r, Math.PI / 2, Math.PI, 8), arc(uR + r, -w / 2 + r, r, Math.PI, 1.5 * Math.PI, 8)); }
  function stadium(len, h) { var r = h / 2; return [].concat(arc(len / 2 - r, r, r, -Math.PI / 2, Math.PI / 2, 12), arc(-len / 2 + r, r, r, Math.PI / 2, 1.5 * Math.PI, 12)); }
  function dist(a, b) { return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2) + Math.pow(b[2] - a[2], 2)); }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function pitchOf(a, b) { return Math.atan2(b[2] - a[2], Math.hypot(b[0] - a[0], b[1] - a[1])) * 180 / Math.PI; }
  function deg(a) { return a * Math.PI / 180; }
  function polar(P, ang, L) { return P3(P[0] + Math.cos(deg(ang)) * L, P[1], P[2] + Math.sin(deg(ang)) * L); }

  /* ---- a road wheel: tyre with rounded shoulders and a tread band, dished rim, hub, lug nuts. The axis is y; the tyre sits on the ground at z=0 when zc=r ---- */
  function wheel(x, y, r, w, o) {
    o = o || {}; var zc = o.z != null ? o.z : r, rim = r * (o.rim || 0.58), out = [], sh = w * 0.5, s = o.side || (y >= 0 ? 1 : -1);
    /* tyre: lathe about y — [radius, axial] pairs from inner bead out over the shoulder to the tread and back */
    var pts = [[rim, -sh * 0.92], [rim + (r - rim) * 0.45, -sh], [r * 0.93, -sh * 0.95], [r, -sh * 0.72], [r, sh * 0.72], [r * 0.93, sh * 0.95], [rim + (r - rim) * 0.45, sh], [rim, sh * 0.92]];
    out.push(lathe(pts, x, y, zc, 'rubber', { axis: 'y', seg: 40 }));
    /* rim: a dish set into the outer face, a plain disc on the inner */
    out.push(lathe([[0.06 * r, sh * 0.35 * s], [rim * 0.55, sh * 0.62 * s], [rim * 0.98, sh * 0.5 * s], [rim + 0.005, sh * 0.85 * s], [rim + 0.005, -sh * 0.85 * s], [rim * 0.85, -sh * 0.8 * s], [0, -sh * 0.8 * s]], x, y, zc, o.rimM || 'steel-grey', { axis: 'y', seg: 28 }));
    out.push(cyl(rim * 0.24, w * 0.24, x, y + s * sh * 0.5, zc, 'steel-dark', { axis: 'y' }));
    var n = o.lugs || 8; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; out.push(cyl(Math.max(0.012, rim * 0.06), 0.03, x + Math.cos(a) * rim * 0.42, y + s * (sh * 0.62), zc + Math.sin(a) * rim * 0.42, 'galvanised', { axis: 'y' })); }
    return out;
  }
  function axle(x, W, r, w, o) {
    o = o || {}; var y = W / 2 - w / 2 - (o.inset || 0.02), out = wheel(x, -y, r, w, o).concat(wheel(x, y, r, w, o));
    if (o.dual) out = out.concat(wheel(x, -(y - w - 0.03), r, w, ext({ side: -1 }, o)), wheel(x, y - w - 0.03, r, w, ext({ side: 1 }, o)));
    out.push(cyl(Math.max(0.06, r * 0.14), W - w * (o.dual ? 4 : 2) - 0.1, x, 0, r, 'steel-black', { axis: 'y' }));   /* the axle beam */
    return out;
  }
  /* ---- a crawler track: shoes with grousers around a stadium loop, sprocket, idler, rollers, frame ----
     cx,y = loop centre in plan; len = overall track length; h = loop height; w = shoe width */
  function track(cx, y, len, h, w, o) {
    o = o || {}; var out = [], rc = h / 2, Ls = len - h, x0 = cx - Ls / 2, x1 = cx + Ls / 2, per = 2 * Ls + 2 * Math.PI * rc, pitch = o.pitch || Math.max(0.17, Math.min(0.32, h * 0.22)), n = Math.round(per / pitch), i;
    var shoeT = Math.max(0.035, h * 0.045), gr = Math.max(0.03, h * 0.035);
    /* track frame and rollers inside the loop */
    out.push(box(Ls * 0.92, w * 0.55, h * 0.36, cx, y, rc - h * 0.18, 'steel-black'));
    var nr = Math.max(4, Math.round(Ls / (h * 0.42))); for (i = 0; i < nr; i++) out.push(cyl(rc * 0.34, w * 0.62, x0 + (i + 0.5) * Ls / nr, y, rc * 0.34 + shoeT, 'steel-dark', { axis: 'y', seg: 16 }));
    out.push(cyl(rc * 0.78, w * 0.5, x1, y, rc, 'steel-dark', { axis: 'y', seg: 20 }));   /* sprocket */
    for (i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; out.push(box(rc * 0.16, w * 0.46, rc * 0.14, x1 + Math.cos(a) * rc * 0.82, y, rc + Math.sin(a) * rc * 0.82 - rc * 0.07, 'steel-dark', { pivot: P3(x1 + Math.cos(a) * rc * 0.82, y, rc + Math.sin(a) * rc * 0.82), pitch: -(a * 180 / Math.PI) })); }
    out.push(cyl(rc * 0.72, w * 0.5, x0, y, rc, 'steel-dark', { axis: 'y', seg: 20 }));   /* idler */
    out.push(cyl(rc * 0.3, w * 0.7, x0, y, rc, 'steel-black', { axis: 'y' })); out.push(cyl(rc * 0.3, w * 0.7, x1, y, rc, 'steel-black', { axis: 'y' }));
    /* shoes: walk the loop from the bottom-rear corner clockwise (seen from +y) */
    for (i = 0; i < n; i++) {
      var s = (i + 0.5) / n * per, p, ang;
      if (s < Ls) { p = P3(x0 + s, y, shoeT / 2); ang = 0; }
      else if (s < Ls + Math.PI * rc) { var t = (s - Ls) / rc, a2 = -Math.PI / 2 + t; p = P3(x1 + Math.cos(a2) * (rc - shoeT / 2), y, rc + Math.sin(a2) * (rc - shoeT / 2)); ang = -(t) * 180 / Math.PI; }
      else if (s < 2 * Ls + Math.PI * rc) { var u = s - Ls - Math.PI * rc; p = P3(x1 - u, y, h - shoeT / 2); ang = 180; }
      else { var t2 = (s - 2 * Ls - Math.PI * rc) / rc, a3 = Math.PI / 2 + t2; p = P3(x0 + Math.cos(a3) * (rc - shoeT / 2), y, rc + Math.sin(a3) * (rc - shoeT / 2)); ang = 180 - (t2) * 180 / Math.PI; }
      out.push(box(pitch * 0.94, w, shoeT, p[0], p[1], p[2] - shoeT / 2, o.m || 'track-steel', { pivot: p, pitch: ang, noEdge: true }));
      out.push(box(pitch * 0.22, w * 0.96, gr, p[0], p[1], p[2] - shoeT / 2 - gr, p[0] > x0 && p[0] < x1 ? 'track-steel' : 'track-steel', { pivot: p, pitch: ang, noEdge: true }));   /* the grouser bar, outboard */
    }
    return out;
  }
  /* the tracked undercarriage every crawler shares. d = {L,W,H,x:{trackLength,trackShoeWidth,trackGauge,...}} */
  function undercarriage(d, o) {
    o = o || {}; var tl = d.x.trackLength || d.L * 0.55, tw = d.x.trackShoeWidth || d.x.trackPadWidthStandard || d.W * 0.2, gauge = d.x.trackGauge || (d.W - tw), th = o.th || Math.min(1.15, Math.max(0.6, d.H * 0.3));
    var cxT = o.cx != null ? o.cx : -d.L / 2 + tl / 2, out = [];
    out = out.concat(track(cxT, -gauge / 2, tl, th, tw, o), track(cxT, gauge / 2, tl, th, tw, o));
    out.push(box(tl * 0.5, gauge - tw * 0.3, th * 0.55, cxT, 0, th * 0.3, 'steel-black'));   /* car body */
    [-1, 1].forEach(function (s) { out.push(box(tl * 0.5, tw * 0.5, th * 0.35, cxT, s * (gauge / 2 - tw * 0.55), th * 0.45, 'steel-black')); });   /* track-frame outriggers */
    return { parts: out, tl: tl, tw: tw, gauge: gauge, th: th, cxT: cxT };
  }
  /* ---- a hydraulic ram between two eyes: barrel, chromed rod, gland, ports and a hose loop ---- */
  function ram(a, b, r, o) {
    o = o || {}; var L = dist(a, b), ex = o.ext != null ? o.ext : 0.5, bl = L * (0.55 + 0.15 * (1 - ex)), m = lerp(a, b, bl / L), out = [];
    out.push(tube(a, m, r, o.m || 'steel-dark')); out.push(tube(lerp(a, b, (bl - r * 0.6) / L), m, r * 1.12, 'steel-dark'));   /* barrel + gland */
    out.push(tube(m, b, r * 0.58, 'chrome'));
    out.push(tube(lerp(a, b, -r * 0.6 / L), lerp(a, b, r * 1.4 / L), r * 1.05, 'steel-dark'));   /* rear cap */
    var ey = o.eye || r * 1.1; out.push(cyl(ey, r * 1.6, a[0], a[1], a[2], 'steel-dark', { axis: 'y' })); out.push(cyl(ey * 0.9, r * 1.5, b[0], b[1], b[2], 'steel-dark', { axis: 'y' }));
    if (o.hose !== false) { var side = o.hoseSide || 1, p1 = lerp(a, b, 0.06), p2 = lerp(a, b, bl / L * 0.92); out.push(curve([P3(p1[0], p1[1] + side * r * 1.3, p1[2]), P3(p1[0] - 0.05, p1[1] + side * r * 2.0, p1[2] + r * 1.5), P3(p2[0], p2[1] + side * r * 1.9, p2[2] + r * 1.7), P3(p2[0], p2[1] + side * r * 1.2, p2[2])], Math.max(0.012, r * 0.16), 'hose')); }
    return out;
  }
  /* ---- an operator's cab: floor, pillars, roof with overhang, raked front screen, side and rear glazing, door frame, mirrors, wiper, beacon, grab rails ----
     x0 = rear face, cl = length (+x forward), w = width, z0 floor, z1 roof top, rake = screen lean-back (m), m = panel enamel */
  function cab(x0, cl, w, z0, z1, o) {
    o = o || {}; var m = o.m || 'plant-yellow', rake = o.rake != null ? o.rake : Math.min(0.28, cl * 0.16), h = z1 - z0, pt = Math.max(0.05, w * 0.045), gz0 = z0 + h * 0.36, out = [];
    var x1 = x0 + cl, xs = x1 - rake;   /* screen top */
    out.push(box(cl, w, 0.08, x0 + cl / 2, 0, z0, 'steel-dark'));   /* floor */
    out.push(box(cl * 0.98, w * 0.96, h * 0.34, x0 + cl * 0.49, 0, z0 + 0.08, m));   /* lower panels */
    out.push(box(pt, w, h * 0.62, x0 + pt / 2, 0, z0 + h * 0.36, m));   /* rear wall */
    out.push(prof([[x0 - 0.04, z1 - 0.07], [x1 + 0.06, z1 - 0.07], [x1 + 0.06, z1 - 0.02], [x0 - 0.04, z1]], w + 0.08, 0, 0, 0, o.roofM || 'cab-dark', { axis: 'y' }));   /* roof */
    [-1, 1].forEach(function (s) {
      var y = s * (w / 2 - pt / 2);
      out.push(box(pt, pt, h * 0.62, x0 + pt / 2 + 0.01, y, gz0, 'cab-dark'));   /* rear pillar */
      out.push(prof([[x1 - pt * 0.4, gz0], [x1 + 0.005, gz0], [xs + 0.005, z1 - 0.05], [xs - pt * 0.5, z1 - 0.05]], pt, 0, y, 0, 'cab-dark', { axis: 'y' }));   /* A pillar, raked */
      out.push(box(pt * 0.6, 0.012, z1 - 0.06 - gz0, x0 + cl * (o.doorAt || 0.52), y, gz0, 'cab-dark'));   /* door pillar */
      out.push(box((x1 - x0) * 0.95, 0.02, z1 - 0.06 - gz0 - 0.03, x0 + cl * 0.5, y, gz0 + 0.02, 'glass', { noShadow: true }));   /* side glazing */
      out.push(box(0.14, 0.18, 0.3, x1 - cl * 0.12, s * (w / 2 + 0.16), gz0 + h * 0.3, 'cab-dark', { beyond: true }));   /* mirror head — outside the published body on every machine */
      out.push(box(0.03, 0.16, 0.03, x1 - cl * 0.12, s * (w / 2 + 0.08), gz0 + h * 0.5, 'cab-dark', { beyond: true }));   /* mirror arm */
      out.push(box(0.005, 0.15, 0.26, x1 - cl * 0.12 + 0.07, s * (w / 2 + 0.16), gz0 + h * 0.32, 'mirror', { noShadow: true, beyond: true }));
    });
    out.push(prof([[x1 - 0.01, gz0], [x1 + 0.012, gz0], [xs + 0.012, z1 - 0.06], [xs - 0.01, z1 - 0.06]], w - pt * 2 - 0.02, 0, 0, 0, 'glass', { axis: 'y', noShadow: true }));   /* front screen */
    out.push(box(0.02, w - pt * 2 - 0.02, z1 - 0.07 - gz0 - 0.02, x0 + pt + 0.01, 0, gz0, 'glass', { noShadow: true }));   /* rear glass */
    out.push(prof([[xs + 0.015, z1 - 0.2], [xs + 0.03, z1 - 0.2], [x1 - rake * 0.35 + 0.03, gz0 + h * 0.2], [x1 - rake * 0.35 + 0.015, gz0 + h * 0.2]], 0.025, 0, w * 0.18, 0, 'cab-dark', { axis: 'y' }));   /* wiper */
    if (o.beacon !== false) { out.push(cyl(0.06, 0.03, x0 + cl * 0.35, -w * 0.3, z1 - 0.02, 'steel-dark')); out.push(lathe([[0.055, 0], [0.058, 0.06], [0.035, 0.085], [0, 0.09]], x0 + cl * 0.35, -w * 0.3, z1 + 0.01, 'lamp-amber')); }
    if (o.lamps !== false) [-1, 1].forEach(function (s) { out.push(box(0.05, 0.16, 0.1, xs - 0.02, s * (w * 0.32), z1 - 0.2, 'steel-dark')); out.push(box(0.012, 0.13, 0.08, xs + 0.012, s * (w * 0.32), z1 - 0.19, 'lamp-white', { noEdge: true })); });
    if (o.rail !== false) { var ry = -(w / 2 + 0.06); out.push(tube(P3(x1 - 0.05, ry, gz0 - 0.05), P3(x1 - 0.05, ry, z1 - 0.15), 0.017, 'plant-yellow')); }   /* grab rail at the door */
    return out;
  }
  /* ---- a guardrail run along a polyline of [x,y,z] points: posts, top rail, mid rail; kick plate optional ---- */
  function rails(pts, h, o) {
    o = o || {}; var r = o.r || 0.02, m = o.m || 'plant-yellow', out = [], i;
    for (i = 0; i < pts.length; i++) { var p = pts[i]; out.push(tube(p, P3(p[0], p[1], p[2] + h), r, m)); }
    for (i = 0; i + 1 < pts.length; i++) { var a = pts[i], b = pts[i + 1]; out.push(tube(P3(a[0], a[1], a[2] + h), P3(b[0], b[1], b[2] + h), r, m)); out.push(tube(P3(a[0], a[1], a[2] + h * 0.52), P3(b[0], b[1], b[2] + h * 0.52), r * 0.85, m)); if (o.kick) out.push(box(dist(a, b), 0.015, 0.15, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2], m, { yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, pivot: P3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]) })); }
    return out;
  }
  function ladder(x, y, z0, z1, w, dir, o) {
    o = o || {}; var out = [], r = 0.018, n = Math.max(1, Math.round((z1 - z0) / 0.3)), off = 0.09, m = o.m || 'galvanised';
    var nx = dir === 'x' ? 1 : 0, ny = dir === 'x' ? 0 : 1;
    [-1, 1].forEach(function (s) { out.push(tube(P3(x + s * w / 2 * ny, y + s * w / 2 * nx, z0), P3(x + s * w / 2 * ny, y + s * w / 2 * nx, z1), r, m)); });
    for (var i = 1; i <= n; i++) { var z = z0 + (z1 - z0) * i / (n + 0.5); out.push(tube(P3(x - w / 2 * ny, y - w / 2 * nx, z), P3(x + w / 2 * ny, y + w / 2 * nx, z), r * 0.8, m)); }
    if (o.cage) for (var k = 0; k < n; k += 2) { var zc = z0 + (z1 - z0) * (k + 1) / (n + 0.5); out.push(torus(w * 0.65, 0.012, x + nx * off * 3, y + ny * off * 3, zc, m, { axis: 'z' })); }
    return out;
  }
  /* ---- a hook block hung on ropes from (x,y,zTop) to a hook at zHook: falls of rope, sheave block, swivel, hook with latch ---- */
  function hook(x, y, zTop, zHook, o) {
    o = o || {}; var out = [], n = o.falls || 4, bw = o.w || 0.5, bh = o.h || 0.9, top = zHook + 0.4 + bh, i;
    for (i = 0; i < n; i++) { var yy = (i - (n - 1) / 2) * (bw * 0.5 / Math.max(1, n - 1)); out.push(tube(P3(x, y + yy, zTop), P3(x, y + yy, top), o.ropeR || 0.014, 'rope')); }
    out.push(box(bw * 0.5, bw, bh, x, y, zHook + 0.4, 'steel-dark'));   /* cheek plates */
    out.push(cyl(bw * 0.42, bw * 0.7, x, y, zHook + 0.4 + bh * 0.62, 'steel-grey', { axis: 'y', seg: 24 }));   /* sheave */
    out.push(cyl(bw * 0.12, 0.42, x, y, zHook + 0.2, 'steel-grey'));   /* swivel */
    var r = bw * 0.36; out.push(curve([P3(x, y, zHook + 0.25), P3(x, y, zHook + 0.05), P3(x + r * 0.9, y, zHook - r * 0.8), P3(x + r * 0.2, y, zHook - r * 1.7), P3(x - r * 0.75, y, zHook - r * 1.1)], bw * 0.09, 'steel-dark'));
    out.push(box(0.03, 0.05, r * 0.9, x - r * 0.4, y, zHook - r * 1.0, 'hi-vis-yellow', { pivot: P3(x - r * 0.4, y, zHook - r * 1.0), pitch: -35 }));   /* safety latch */
    return out;
  }
  /* ---- a counterweight stack: slabs with lifting eyes and a hazard band ---- */
  function counterweight(x, y, z, l, w, h, o) {
    o = o || {}; var n = o.slabs || 3, out = [], sh = h / n, i, m = o.m || 'steel-grey';
    for (i = 0; i < n; i++) { out.push(box(l, w * (1 - 0.02 * i), sh * 0.94, x, y, z + i * sh, i === n - 1 && o.top ? o.top : m)); out.push(box(l * 0.5, 0.06, 0.12, x, y + w / 2 * (1 - 0.02 * i), z + i * sh + sh * 0.35, 'hazard-yellow', { noEdge: true })); out.push(box(l * 0.5, 0.06, 0.12, x, y - w / 2 * (1 - 0.02 * i), z + i * sh + sh * 0.35, 'hazard-yellow', { noEdge: true })); }
    [-1, 1].forEach(function (s) { out.push(torus(0.09, 0.02, x + s * l * 0.32, y, z + h + 0.09, 'steel-dark', { axis: 'x' })); });
    return out;
  }
  function beacon(x, y, z) { return [cyl(0.05, 0.05, x, y, z, 'steel-dark'), lathe([[0.05, 0], [0.052, 0.1], [0.03, 0.13], [0, 0.135]], x, y, z + 0.05, 'lamp-amber')]; }
  function exhaust(x, y, z, h, r) { r = r || 0.05; return [cyl(r, h, x, y, z, 'steel-black'), cyl(r * 1.25, r * 1.2, x, y, z + h - r * 1.2, 'steel-black'), cyl(r * 1.5, 0.03, x, y, z + h * 0.6, 'steel-dark')]; }
  function steps(x, y, z0, z1, w, dir, o) {
    o = o || {}; var n = Math.max(1, Math.round((z1 - z0) / 0.33)), out = [], sx = dir === '-x' ? -1 : 1;
    for (var i = 0; i < n; i++) { var z = z0 + (z1 - z0) * (i + 1) / (n + 1); out.push(box(0.22, w, 0.03, x + sx * 0.12 * (n - i), y, z, 'checker')); }
    [-1, 1].forEach(function (s) { out.push(tube(P3(x + sx * 0.12 * n, y + s * w / 2, z0), P3(x + sx * 0.12, y + s * w / 2, z1 + 0.02), 0.014, 'steel-dark')); });
    return out;
  }
  /* an excavator / loader bucket seen from the side: back plate, curved shell, cutting edge, teeth. B = pivot point, bw across, bl depth, +x opens forward */
  function bucket(B, bw, bl, o) {
    o = o || {}; var out = [], m = o.m || 'wear-steel', sh = [].concat([[0, 0.62 * bl], [0.42 * bl, 0.62 * bl]], arc(0.42 * bl, 0.12 * bl, 0.5 * bl, Math.PI / 2, -Math.PI / 6, 8), [[0.95 * bl, -0.14 * bl], [0.55 * bl, -0.02 * bl], [0.05 * bl, 0.1 * bl]]);
    out.push(prof(sh, bw, B[0] - 0.42 * bl, B[1], B[2] - 0.5 * bl, m, { axis: 'y', beyond: !!o.beyond }));
    [-1, 1].forEach(function (s) { out.push(prof([[0, 0.72 * bl], [0.3 * bl, 0.72 * bl], [0.9 * bl, -0.1 * bl], [0.3 * bl, -0.1 * bl]], 0.02, B[0] - 0.42 * bl, B[1] + s * (bw / 2 + 0.01), B[2] - 0.5 * bl, m, { axis: 'y', beyond: !!o.beyond })); });   /* side plates */
    var nt = Math.max(3, Math.round(bw / 0.22)); for (var i = 0; i < nt; i++) { var yy = B[1] - bw / 2 + bw * (i + 0.5) / nt; out.push(box(0.14 * bl, 0.06, 0.05, B[0] + 0.55 * bl, yy, B[2] - 0.66 * bl, 'steel-grey', { beyond: !!o.beyond, pivot: P3(B[0] + 0.55 * bl, yy, B[2] - 0.66 * bl), pitch: -12 })); }
    out.push(cyl(0.05, bw * 1.04, B[0], B[1], B[2], 'steel-dark', { axis: 'y', beyond: !!o.beyond }));   /* pivot pin */
    return out;
  }
  /* an outrigger beam swung out to (x, ±ty), jacked onto a pad and a timber mat */
  function outrigger(x, ty, zBeam, pad, o) {
    o = o || {}; var out = [], mat = o.mat !== false, by = o.beyond !== false;
    out.push(box(0.42, ty * 2 - pad, 0.34, x, 0, zBeam, 'steel-grey', { beyond: by }));
    [-1, 1].forEach(function (s) { var y = s * (ty - pad / 2); out.push(box(0.5, 0.5, 0.4, x, y, zBeam - 0.02, 'steel-dark', { beyond: by })); out.push(tube(P3(x, y, zBeam + 0.3), P3(x, y, 0.14), 0.1, 'steel-dark', { beyond: by })); out.push(tube(P3(x, y, zBeam - 0.05), P3(x, y, 0.16), 0.075, 'chrome', { beyond: by })); out.push(cyl(pad / 2, 0.12, x, y, 0.04, 'steel-dark', { beyond: by })); if (mat) out.push(box(pad * 1.7, pad * 1.7, 0.04, x, y, 0, 'timber', { beyond: true })); });
    return out;
  }
  /* a box-section telescopic boom of n sections from a pivot; ext 0..1 extension; returns parts and the tip point.
     Sections are placed UNROTATED along +x from the pivot and turned by `pitch` about it — placing them along the
     pitched line as well would turn them twice. */
  function teleBoom(pv, baseL, sec, n, ang, ext, m) {
    var out = [], off = 0, tip = pv;
    for (var k = 0; k < n; k++) { var sk = sec * (1 - k * 0.13), Lk = baseL * (1 - k * 0.04), start = off; out.push(prof(roundRect(-sk / 2, sk / 2, -sk * 0.55, sk * 0.5, sk * 0.12), Lk, pv[0] + start + Lk / 2, pv[1], pv[2], m, { axis: 'x', beyond: true, pivot: pv, pitch: ang })); off += Lk * (0.08 + 0.78 * ext); tip = polar(pv, ang, off + Lk); }
    var o2 = 0; for (var j = 0; j < n - 1; j++) { var Lj = baseL * (1 - j * 0.04), sj = sec * (1 - j * 0.13); out.push(prof(roundRect(-sj / 2 - 0.03, sj / 2 + 0.03, -sj * 0.58, sj * 0.53, sj * 0.12), sj * 0.5, pv[0] + o2 + Lj - sj * 0.25, pv[1], pv[2], 'steel-dark', { axis: 'x', beyond: true, pivot: pv, pitch: ang })); o2 += Lj * (0.08 + 0.78 * ext); }
    return { parts: out, tip: tip, len: off + baseL * (1 - (n - 1) * 0.04) };
  }
  function latticeBoom(foot, L, sec, ang, o) {
    o = o || {}; return box(L, sec, sec, foot[0] + L / 2, foot[1], foot[2] - sec / 2, o.m || 'plant-yellow', { beyond: true, pivot: foot, pitch: ang, lat: { along: 'x', section: o.section || 'sq', panel: o.panel || Math.max(1.2, sec * 1.3), chord: o.chord || sec * 0.06, brace: o.brace || sec * 0.03, chordShape: o.chordShape || 'round', bracing: o.bracing || 'z', tip: o.tip } }); }
  /* a slewing ring: bearing, bolt ring */
  function slewRing(x, y, z, r, h) { var out = [cyl(r, h, x, y, z, 'steel-grey', { seg: 40 })]; var n = Math.max(12, Math.round(r * 20)); for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; out.push(cyl(0.022, 0.03, x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86, z + h, 'steel-dark', { seg: 8 })); } return out; }
  function fuelTank(x, y, z, l, r) { return [cyl(r, l, x, y, z + r, 'aluminium', { axis: 'x', seg: 28 }), box(0.06, r * 1.4, r * 0.5, x + l * 0.35, y, z, 'steel-dark'), box(0.06, r * 1.4, r * 0.5, x - l * 0.35, y, z, 'steel-dark'), cyl(0.05, 0.05, x - l * 0.2, y, z + 2 * r, 'steel-dark')]; }
  function person(x, y, o) {
    o = o || {}; var h = o.H || 1.75, s = h / 1.75, sh = o.shoulder || 0.465, out = [], hat = o.hat || 'hardhat', yaw = o.yaw || 0;
    function pt(dx, dy, dz) { var a = deg(yaw); return P3(x + dx * Math.cos(a) - dy * Math.sin(a), y + dx * Math.sin(a) + dy * Math.cos(a), dz); }
    out.push(lathe([[0.112 * s, 0], [0.128 * s, 0.05 * s], [0.108 * s, 0.13 * s], [0.03 * s, 0.16 * s], [0, 0.165 * s]], x, y, h - 0.165 * s, hat)); out.push(lathe([[0.1 * s, 0], [0.14 * s, 0.01 * s], [0.13 * s, 0.03 * s]], x, y, h - 0.165 * s, hat));   /* hat and brim */
    out.push(sphere(0.1 * s, x, y, h - 0.1 * s - 0.1 * s, 'skin'));
    out.push(cyl(0.045 * s, 0.07 * s, x, y, h - 0.33 * s, 'skin'));
    out.push(prof(roundRect(-0.14 * s, 0.15 * s, -sh / 2 + 0.04 * s, sh / 2 - 0.04 * s, 0.06 * s), 0.56 * s, x, y, h - 0.33 * s - 0.56 * s, 'hi-vis', { axis: 'z' }));
    out.push(box(0.3 * s, sh * 0.5, 0.05 * s, x, y, h - 0.55 * s, 'reflective', { noEdge: true }));
    [-1, 1].forEach(function (k) { var yy = k * (sh / 2 - 0.05 * s), a = pt(0, yy, h - 0.36 * s), e = pt(0.03 * s, yy, h - 0.64 * s), w = pt(0.09 * s, yy - k * 0.01 * s, h - 0.94 * s); out.push(tube(a, e, 0.045 * s, 'hi-vis')); out.push(tube(e, w, 0.036 * s, 'skin')); out.push(sphere(0.036 * s, w[0], w[1], w[2], 'skin')); });
    [-1, 1].forEach(function (k) { var yy = k * 0.095 * s, top = pt(0, yy, h - 0.9 * s), knee = pt(0.01 * s, yy, h - 1.3 * s), ank = pt(0, yy, 0.12 * s); out.push(tube(top, knee, 0.075 * s, 'workwear')); out.push(tube(knee, ank, 0.062 * s, 'workwear')); var f = pt(0.06 * s, yy, 0); out.push(box(0.27 * s, 0.11 * s, 0.11 * s, f[0], f[1], 0, 'boot', { pivot: f, yaw: yaw })); });
    return out;
  }
  g.MCPARTS = { VERSION: 1, box: box, cyl: cyl, cone: cone, sphere: sphere, torus: torus, tube: tube, curve: curve, prof: prof, lathe: lathe, P3: P3, arc: arc, roundRect: roundRect, houseRear: houseRear, stadium: stadium, dist: dist, lerp: lerp, pitchOf: pitchOf, polar: polar,
    wheel: wheel, axle: axle, track: track, undercarriage: undercarriage, ram: ram, cab: cab, rails: rails, ladder: ladder, hook: hook, counterweight: counterweight, beacon: beacon, exhaust: exhaust, steps: steps, bucket: bucket, outrigger: outrigger, teleBoom: teleBoom, latticeBoom: latticeBoom, slewRing: slewRing, fuelTank: fuelTank, person: person };
})(typeof window !== 'undefined' ? window : globalThis);
