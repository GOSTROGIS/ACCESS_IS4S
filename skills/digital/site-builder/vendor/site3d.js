/* mc-site-3d.js — window.MCSITE3D v3. Three.js geometry and rendering for the site
   workspace: the parametric models MCSITECAT describes, physically based materials
   from MCSITEMAT with procedural albedo and height surfaces, the sky, sun and ground
   the scene stands in, the terrain surface from an MCGROUND snapshot, a ground raster
   from map tiles, exclusion rings and clash marks.
   Frame: site metres, x east, y north, z up (the datum's site frame).

   PART VOCABULARY (local metres, origin at the entry's plan centre, +x along the length)
     box     {l,w,h,x,y,z}            bottom at z; `lat` draws it as an engineered lattice truss
     cyl     {r,[r2],h,x,y,z,axis}    axis z bottom at z; axis 'x'|'y' centred at (x,y,z); r2 tapers
     cone    {r,h,x,y,z}
     sphere  {r,x,y,z}
     torus   {R,r,x,y,z,axis}         a ring: tyre bead, slew bearing, bolt ring
     tube    {a,b,r}                  a straight member from point a to point b
     curve   {pts,r,[closed]}         a hose, rope or handrail bend along a Catmull-Rom spline
     profile {pts,len,x,y,z,axis}     a polygon extruded `len`: 'x' (u→y,v→z, centred on x), 'y' (u→x,v→z, centred on y), 'z' (u→x,v→y, bottom at z)
     lathe   {pts,x,y,z,axis}         [r,v] pairs revolved about z (v up from z) or about x (v along x)
   Any part may carry `pivot:[x,y,z]` with `pitch` (about y, degrees, +up), `yaw` (about z) and
   `roll` (about x) — a boom, a slewing house, a tipped body. `beyond:true` marks a part the
   extent check skips (a raised boom, an outrigger pad past the carrier); `noEdge:true` skips
   the ink outline; `noShadow:true` skips shadow casting (glazing, mesh). */
(function (g) {
  'use strict';
  function T() { return g.THREE || null; }
  var RAMP = [[0x5b7f4d, 0], [0xa9b36b, 0.35], [0xc9a86a, 0.65], [0xb7b2a8, 0.85], [0xf0eee8, 1]];
  var INK = 0x1e1f1c, SKY = { zenith: 0x5f8fb8, horizon: 0xdfe4e8, ground: 0xb3ada0 };
  var INKS = { ink: '#1e1f1c', rule: '#6b6e6a', paper: '#f4f3ef', north: '#b8332a' };
  var FADE = { edge: 0.34, wire: 0.12, contour: 0.7, ring: 0.85, clashFill: 0.32, clashLine: 0.95, gridMinor: 0.06, gridMajor: 0.16 };
  var _mats = {}, _tex = {}, _geo = {}, _env = null;

  /* ---- procedural surfaces: drawn once on a canvas, shared by every material that names them ---- */
  function canvas(n) { var c = document.createElement('canvas'); c.width = c.height = n; return c; }
  function rng(seed) { var s = seed || 7; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  function noise(ctx, n, base, amp, seed) { var img = ctx.getImageData(0, 0, n, n), d = img.data, r = rng(seed); for (var i = 0; i < d.length; i += 4) { var v = base + (r() - 0.5) * amp; d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v)); d[i + 3] = 255; } ctx.putImageData(img, 0, 0); }
  function blotch(x, n, count, rMin, rMax, alpha, seed, colour) { var r = rng(seed); x.fillStyle = colour || 'rgba(0,0,0,' + alpha + ')'; for (var i = 0; i < count; i++) { x.beginPath(); x.arc(r() * n, r() * n, rMin + r() * (rMax - rMin), 0, 6.283); x.fill(); } }
  function surface(kind) {
    var n = 256, c = canvas(n), x = c.getContext('2d'), i, r;
    if (kind === 'concrete') { noise(x, n, 196, 50, 11); blotch(x, n, 220, 0.6, 1.8, 0.14, 3); blotch(x, n, 40, 3, 9, 0.05, 5); }
    else if (kind === 'concrete-cast') { noise(x, n, 205, 30, 13); x.fillStyle = 'rgba(0,0,0,0.35)'; for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { x.beginPath(); x.arc(32 + i * 64, 32 + j * 64, 3, 0, 6.283); x.fill(); } x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1.5; x.strokeRect(0.5, 0.5, n - 1, n - 1); }
    else if (kind === 'timber') { noise(x, n, 200, 34, 5); r = rng(9); x.globalAlpha = 0.32; for (i = 0; i < 44; i++) { x.fillStyle = i % 2 ? '#6b4a2a' : '#c9a06a'; x.fillRect(0, i * 5.8 + r() * 3, n, 0.8 + r() * 2.4); } x.globalAlpha = 1; }
    else if (kind === 'tread') { x.fillStyle = '#26272a'; x.fillRect(0, 0, n, n); x.fillStyle = '#3c3d3b'; for (i = 0; i < 16; i++) { x.fillRect(0, i * 16 + 3, n, 8); x.fillRect(i * 16 + 6, 0, 4, n); } x.fillStyle = '#17181a'; for (i = 0; i < 16; i++) x.fillRect(0, i * 16 + 12, n, 2); }
    else if (kind === 'chevron') { x.fillStyle = '#e3e3df'; x.fillRect(0, 0, n, n); x.fillStyle = '#c62f24'; for (i = -4; i < 8; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64 + 32, 0); x.lineTo(i * 64 + 32 + n, n); x.lineTo(i * 64 + n, n); x.closePath(); x.fill(); } }
    else if (kind === 'hazard') { x.fillStyle = '#e6b71c'; x.fillRect(0, 0, n, n); x.fillStyle = '#1c1c1a'; for (i = -4; i < 8; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64 + 32, 0); x.lineTo(i * 64 + 32 + n, n); x.lineTo(i * 64 + n, n); x.closePath(); x.fill(); } }
    else if (kind === 'mesh') { x.clearRect(0, 0, n, n); x.strokeStyle = '#b8bdc1'; x.lineWidth = 2.4; for (i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, n); x.stroke(); } for (i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 64); x.lineTo(n, i * 64); x.stroke(); } }
    else if (kind === 'grating') { x.clearRect(0, 0, n, n); x.fillStyle = '#8f9497'; for (i = 0; i < 16; i++) x.fillRect(i * 16, 0, 5, n); for (i = 0; i < 4; i++) x.fillRect(0, i * 64, n, 4); }
    else if (kind === 'galv') { noise(x, n, 200, 22, 17); r = rng(21); x.globalAlpha = 0.18; for (i = 0; i < 60; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#7d8489'; x.beginPath(); x.moveTo(r() * n, r() * n); for (var k = 0; k < 5; k++) x.lineTo(r() * n, r() * n); x.closePath(); x.fill(); } x.globalAlpha = 1; }
    else if (kind === 'paint') { noise(x, n, 236, 14, 23); blotch(x, n, 90, 0.5, 1.2, 0.08, 27); r = rng(31); x.strokeStyle = 'rgba(0,0,0,0.07)'; x.lineWidth = 0.8; for (i = 0; i < 26; i++) { x.beginPath(); var sx = r() * n, sy = r() * n; x.moveTo(sx, sy); x.lineTo(sx + (r() - 0.5) * 40, sy + (r() - 0.5) * 12); x.stroke(); } }
    else if (kind === 'dirt') { noise(x, n, 224, 26, 41); r = rng(43); var grd = x.createLinearGradient(0, 0, 0, n); grd.addColorStop(0, 'rgba(60,45,30,0)'); grd.addColorStop(1, 'rgba(60,45,30,0.42)'); x.fillStyle = grd; x.fillRect(0, 0, n, n); x.globalAlpha = 0.25; for (i = 0; i < 24; i++) { x.fillStyle = '#4a3a28'; x.fillRect(r() * n, n * 0.35 + r() * n * 0.5, 2 + r() * 5, 30 + r() * 100); } x.globalAlpha = 1; }
    else if (kind === 'checker') { x.fillStyle = '#a4a8ab'; x.fillRect(0, 0, n, n); x.fillStyle = '#cfd2d4'; for (i = 0; i < 8; i++) for (var m = 0; m < 8; m++) { x.save(); x.translate(i * 32 + 16, m * 32 + 16); x.rotate((i + m) % 2 ? 0.785 : -0.785); x.fillRect(-9, -2, 18, 4); x.restore(); } }
    else if (kind === 'corrugate') { for (i = 0; i < n; i++) { var v = 200 + Math.sin(i / n * Math.PI * 16) * 34; x.fillStyle = 'rgb(' + v + ',' + v + ',' + (v - 4) + ')'; x.fillRect(i, 0, 1, n); } }
    else return null;
    return c;
  }
  function texture(kind, asBump) {
    var THREE = T(), key = kind + (asBump ? '#b' : ''); if (_tex[key]) return _tex[key];
    var c = surface(kind); if (!c) return null;
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    if (!asBump && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    var rep = kind === 'mesh' ? 6 : kind === 'grating' ? 4 : kind === 'chevron' || kind === 'hazard' ? 3 : kind === 'corrugate' ? 4 : 2;
    t.repeat.set(rep, (kind === 'chevron' || kind === 'hazard' || kind === 'corrugate') ? 1 : rep);
    _tex[key] = t; return t;
  }
  function material(name) {
    var THREE = T(); if (!THREE) return null;
    if (_mats[name]) return _mats[name];
    var m = (g.MCSITEMAT && g.MCSITEMAT.get(name)) || { hex: 0x888888, rough: 0.6, metal: 0.2 };
    var opt = { color: m.hex, roughness: m.rough, metalness: m.metal, transparent: m.opacity != null, opacity: m.opacity != null ? m.opacity : 1, side: THREE.DoubleSide, envMapIntensity: 0.8 };
    if (m.tex) { var tx = texture(m.tex); if (tx) { opt.map = tx; if (m.tex === 'mesh' || m.tex === 'grating') { opt.alphaMap = tx; opt.transparent = true; opt.alphaTest = 0.4; opt.depthWrite = true; } } }
    if (m.bump) { var bt = texture(m.bump, true); if (bt) { opt.bumpMap = bt; opt.bumpScale = m.bump === 'tread' ? 0.012 : m.bump === 'corrugate' ? 0.02 : 0.006; } }
    if (m.emissive) { opt.emissive = m.emissive; opt.emissiveIntensity = 0.9; }
    var physical = (m.clearcoat || m.sheen) && THREE.MeshPhysicalMaterial;
    var mat = physical ? new THREE.MeshPhysicalMaterial(opt) : new THREE.MeshStandardMaterial(opt);
    if (m.clearcoat && mat.clearcoat != null) { mat.clearcoat = m.clearcoat; mat.clearcoatRoughness = 0.25; }
    if (m.sheen && mat.sheen != null) { mat.sheen = m.sheen; mat.sheenRoughness = 0.7; }
    if (m.opacity != null) mat.depthWrite = false;
    mat.userData = { name: name, castsShadow: !(m.tex === 'mesh' || m.tex === 'grating') && m.opacity == null, noEdges: !!m.noEdges };
    _mats[name] = mat; return mat;
  }
  function edgeMat() { var THREE = T(); if (!_mats._edge) _mats._edge = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: FADE.edge }); return _mats._edge; }
  function unitCyl() { var THREE = T(); if (!_geo.cyl) { _geo.cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1); } return _geo.cyl; }
  function unitBox() { var THREE = T(); if (!_geo.box) { _geo.box = new THREE.BoxGeometry(1, 1, 1); } return _geo.box; }

  /* ---- geometry from a part ---- */
  var _ROT = null;
  function rotFor(axis) {
    var THREE = T(); if (!_ROT) _ROT = {
      x: new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1),
      y: new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1),
      z: new THREE.Matrix4().identity()
    }; return _ROT[axis] || _ROT.x;
  }
  function v3(a) { var THREE = T(); return new THREE.Vector3(a[0], a[1], a[2]); }
  function partGeometry(p) {
    var THREE = T(), geo;
    if (p.s === 'box') geo = new THREE.BoxGeometry(p.l, p.w, p.h);
    else if (p.s === 'cyl') geo = new THREE.CylinderGeometry(p.r2 != null ? p.r2 : p.r, p.r, p.h, p.seg || (p.r > 0.6 ? 36 : p.r > 0.15 ? 24 : 14));
    else if (p.s === 'cone') geo = new THREE.ConeGeometry(p.r, p.h, p.seg || 24);
    else if (p.s === 'sphere') geo = new THREE.SphereGeometry(p.r, 20, 14);
    else if (p.s === 'torus') { geo = new THREE.TorusGeometry(p.R, p.r, 10, p.seg || 36); if (p.axis === 'x') geo.rotateY(Math.PI / 2); else if (p.axis === 'y') geo.rotateX(Math.PI / 2); }
    else if (p.s === 'curve') {
      var pts = p.pts.map(v3), crv = new THREE.CatmullRomCurve3(pts, !!p.closed, 'catmullrom', 0.5);
      geo = new THREE.TubeGeometry(crv, Math.max(8, p.pts.length * 6), p.r, 8, !!p.closed);
    }
    else if (p.s === 'profile') {
      var sh = new THREE.Shape(p.pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }));
      if (p.holes) p.holes.forEach(function (h) { sh.holes.push(new THREE.Path(h.map(function (q) { return new THREE.Vector2(q[0], q[1]); }))); });
      geo = new THREE.ExtrudeGeometry(sh, { depth: p.len, bevelEnabled: false, steps: 1 });
      var ax = p.axis || 'x'; geo.applyMatrix4(rotFor(ax));
      if (ax === 'x') geo.translate(-p.len / 2, 0, 0); else if (ax === 'y') geo.translate(0, p.len / 2, 0);
    } else if (p.s === 'lathe') {
      geo = new THREE.LatheGeometry(p.pts.map(function (q) { return new THREE.Vector2(q[0], q[1]); }), p.seg || 32);
      if (p.axis === 'x') geo.rotateZ(-Math.PI / 2); else if (p.axis !== 'y') geo.rotateX(Math.PI / 2);
    } else return null;
    return geo;
  }
  function placePart(mesh, p) {
    if (p.s === 'box') mesh.position.set(p.x, p.y, p.z + p.h / 2);
    else if (p.s === 'cyl' || p.s === 'cone') {
      if (p.axis === 'y') mesh.position.set(p.x, p.y, p.z);
      else if (p.axis === 'x') { mesh.rotation.z = Math.PI / 2; mesh.position.set(p.x, p.y, p.z); }
      else { mesh.rotation.x = Math.PI / 2; mesh.position.set(p.x, p.y, p.z + p.h / 2); }
    } else if (p.s === 'torus') { mesh.position.set(p.x, p.y, p.z); }
    else if (p.s === 'curve') { /* absolute points */ }
    else mesh.position.set(p.x, p.y, p.z);
  }
  function tubeMesh(a, b, r, mat) {
    var THREE = T(), dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    var m = new THREE.Mesh(unitCyl(), mat); m.scale.set(r, len, r);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    return m;
  }
  /* ---- an engineered lattice truss inside a box ----
     lat: { along:'x'|'z', section:'sq'|'tri', panel, chord, brace, chordShape:'sq'|'round',
            bracing:'z'|'x'|'k', tip (section scale at the far end, 1 = parallel) }
     Chords run the full length; a horizontal frame closes every panel; diagonals follow the
     bracing pattern. Square-hollow chords are box instances, round ones cylinders. */
  function lattice(p, mat) {
    var THREE = T(), lat = p.lat, along = lat.along || 'x', tri = lat.section === 'tri', panel = lat.panel || 2, cyls = [], boxes = [];
    var L = along === 'z' ? p.h : p.l, a = along === 'z' ? p.l : p.w, b = along === 'z' ? p.w : p.h;
    var n = Math.max(1, Math.round(L / panel)), step = L / n, i, k, tip = lat.tip != null ? lat.tip : 1, sq = lat.chordShape === 'sq';
    function sc(t) { return 1 + (tip - 1) * (t / L); }
    function pt(t, u, v) { var s = sc(t); u *= s; v *= s; return along === 'z' ? [u, v, t] : [t, u, v]; }
    var corners = tri ? [[-a / 2, -b / 2], [a / 2, -b / 2], [0, b / 2]] : [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
    var chordR = lat.chord || 0.08, braceR = lat.brace || 0.04, pat = lat.bracing || 'z';
    corners.forEach(function (c) { (sq ? boxes : cyls).push([pt(0, c[0], c[1]), pt(L, c[0], c[1]), chordR]); });
    for (i = 0; i <= n; i++) { var t = i * step; for (k = 0; k < corners.length; k++) { var c0 = corners[k], c1 = corners[(k + 1) % corners.length]; cyls.push([pt(t, c0[0], c0[1]), pt(t, c1[0], c1[1]), braceR]); } }
    for (i = 0; i < n; i++) {
      var t0 = i * step, t1 = t0 + step, flip = i % 2;
      for (k = 0; k < corners.length; k++) {
        var d0 = corners[k], d1 = corners[(k + 1) % corners.length];
        if (pat === 'x') { cyls.push([pt(t0, d0[0], d0[1]), pt(t1, d1[0], d1[1]), braceR]); cyls.push([pt(t0, d1[0], d1[1]), pt(t1, d0[0], d0[1]), braceR]); }
        else if (pat === 'k') { var mu = (d0[0] + d1[0]) / 2, mv = (d0[1] + d1[1]) / 2; cyls.push([pt(t0, d0[0], d0[1]), pt(t1, mu, mv), braceR]); cyls.push([pt(t0, d1[0], d1[1]), pt(t1, mu, mv), braceR]); }
        else cyls.push(flip ? [pt(t0, d0[0], d0[1]), pt(t1, d1[0], d1[1]), braceR] : [pt(t0, d1[0], d1[1]), pt(t1, d0[0], d0[1]), braceR]);
      }
    }
    var ox = along === 'z' ? p.x : p.x - p.l / 2, oy = p.y, oz = along === 'z' ? p.z : p.z + p.h / 2;
    var grp = new THREE.Group(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    function inst(list, geo) {
      if (!list.length) return;
      var im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(function (mb, j) {
        var A = mb[0], B = mb[1], dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        dir.set(dx / len, dy / len, dz / len); q.setFromUnitVectors(up, dir); s.set(mb[2] * (geo === _geo.box ? 2 : 1), len, mb[2] * (geo === _geo.box ? 2 : 1)); pos.set(ox + (A[0] + B[0]) / 2, oy + (A[1] + B[1]) / 2, oz + (A[2] + B[2]) / 2);
        M.compose(pos, q, s); im.setMatrixAt(j, M);
      });
      im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.userData = { lattice: true, members: list.length }; grp.add(im);
    }
    inst(cyls, unitCyl()); inst(boxes, unitBox());
    grp.userData = { lattice: true, members: cyls.length + boxes.length };
    return grp;
  }
  function partMesh(p, opts) {
    var THREE = T(), mat = material(p.m), mesh, geo;
    opts = opts || {};
    if (p.s === 'tube') mesh = tubeMesh(p.a, p.b, p.r, mat);
    else if (p.s === 'box' && p.lat) mesh = lattice(p, mat);
    else { geo = partGeometry(p); if (!geo) return null; mesh = new THREE.Mesh(geo, mat); placePart(mesh, p); }
    var shadows = mat.userData.castsShadow !== false && !p.noShadow;
    mesh.traverse ? mesh.traverse(function (o) { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = true; o.userData.beyond = !!p.beyond; } }) : null;
    var grp = new THREE.Group();
    if (p.pivot && (p.pitch || p.yaw || p.roll)) {
      grp.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
      mesh.position.sub(new THREE.Vector3(p.pivot[0], p.pivot[1], p.pivot[2]));
      grp.rotation.set((p.roll || 0) * Math.PI / 180, -(p.pitch || 0) * Math.PI / 180, (p.yaw || 0) * Math.PI / 180, 'ZYX');
    }
    grp.add(mesh);
    var wantEdge = opts.edges !== false && geo && !p.noEdge && !mat.userData.noEdges && (p.s === 'box' || p.s === 'profile' || (p.s === 'lathe' && p.edges) || (p.s === 'cyl' && p.edges));
    if (wantEdge) { var e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, p.s === 'profile' ? 24 : 32), edgeMat()); e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.userData = { edge: true }; grp.add(e); }
    return grp;
  }
  /* the exclusion ring an entry declares: the jib's working radius or the counterweight's swept circle */
  function ringOf(inst, ext, opts) {
    var THREE = T(); if (!ext || !ext.ws) return null;
    var r = ext.ws, n = 128, pts = [];
    for (var i = 0; i <= n; i++) { var a = i / n * Math.PI * 2; pts.push(new THREE.Vector3(ext.wsx + r * Math.cos(a), (ext.wsy || 0) + r * Math.sin(a), 0.06)); }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var ln = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: (opts && opts.ringColour) || INK, dashSize: Math.max(0.6, r * 0.05), gapSize: Math.max(0.4, r * 0.03), transparent: true, opacity: FADE.ring }));
    ln.computeLineDistances(); ln.userData = { ring: true, radius: r, kind: ext.ringKind };
    return ln;
  }
  /* a placed instance -> a Group at its site position, turned by rot; a zone -> a flat hatched plate */
  function blockGroup(inst, opts) {
    var THREE = T(), C = g.MCSITECAT; if (!THREE || !C || !inst) return null;
    var e = C.get(inst.id), grp = new THREE.Group();
    opts = opts || {};
    if (!e) return null;
    if (e.kind === 'zone') {
      var pts = inst._site && inst._site.pts; if (!pts || pts.length < 3) return null;
      var shape = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }));
      var pm = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(e.clash ? 'spoil' : 'zone'));
      pm.position.z = (opts.z != null ? opts.z : 0) + 0.03; pm.receiveShadow = true; grp.add(pm);
      var outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], (opts.z != null ? opts.z : 0) + 0.05); })), edgeMat()); grp.add(outline);
      if (e.clash && e.band > 0.1) { var ext = new THREE.ExtrudeGeometry(shape, { depth: e.band, bevelEnabled: false }); var solid = new THREE.Mesh(ext, material('spoil')); solid.position.z = opts.z != null ? opts.z : 0; solid.castShadow = solid.receiveShadow = true; grp.add(solid); }
      grp.userData = { site: inst, label: inst._meta && inst._meta.name };
      return grp;
    }
    var blk = C.blockOf(e.id, inst._params || (inst._site && inst._site.params)); if (!blk) return null;
    var n = inst._site && inst._site.count > 1 && e.linear ? inst._site.count : 1;
    for (var k = 0; k < n; k++) {
      var off = n > 1 ? -blk.L * (n - 1) / 2 + k * blk.L : 0;
      blk.parts.forEach(function (p) { var m = partMesh(p, opts); if (!m) return; m.position.x += off; grp.add(m); });
    }
    /* rings: true/undefined every declared ring, 'jib' only a crane's working radius, false none — a tail swing draws on selection or on a clash, not on every parked excavator */
    if (opts.rings !== false && inst._ext && (opts.rings !== 'jib' || inst._ext.ringKind === 'jib')) { var ring = ringOf(inst, inst._ext, opts); if (ring) grp.add(ring); }
    grp.position.set(inst.x || 0, inst.y || 0, opts.z != null ? opts.z : 0);
    grp.rotation.z = (inst.rot || 0) * Math.PI / 180;
    grp.userData = { site: inst, label: inst._meta && inst._meta.name, entry: e.id, parts: blk.parts.length };
    grp.traverse(function (o) { if (o.isMesh) o.userData.site = inst; });
    return grp;
  }
  /* the measured bounds of a built group, in its own frame: {all, solid} — `solid` skips
     parts marked beyond (a raised boom, a pad past the carrier), rings and edge lines */
  function measure(grp) {
    var THREE = T(), all = new THREE.Box3(), solid = new THREE.Box3(), tmp = new THREE.Box3();
    grp.updateMatrixWorld(true);
    grp.traverse(function (o) {
      if (!(o.isMesh || o.isInstancedMesh) || (o.userData && (o.userData.ring || o.userData.edge))) return;
      if (o.isInstancedMesh) { o.computeBoundingBox && o.computeBoundingBox(); if (!o.boundingBox) return; tmp.copy(o.boundingBox).applyMatrix4(o.matrixWorld); }
      else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); }
      all.union(tmp); if (!o.userData.beyond) solid.union(tmp);
    });
    function out(b) { return b.isEmpty() ? null : { x0: b.min.x, y0: b.min.y, z0: b.min.z, x1: b.max.x, y1: b.max.y, z1: b.max.z, L: b.max.x - b.min.x, W: b.max.y - b.min.y, H: b.max.z - b.min.z }; }
    return { all: out(all), solid: out(solid) };
  }
  /* render styles: 'realistic' (shaded, shadows, no edges), 'edges' (shaded with edges), 'review' (one flat grey, edges) */
  var _review = null;
  function applyStyle(root, style) {
    var THREE = T(); if (!root) return;
    if (!_review) { _review = new THREE.MeshStandardMaterial({ color: 0xc9c7c0, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }); }
    root.traverse(function (o) {
      if (o.userData && o.userData.edge) o.visible = style !== 'realistic';
      if ((o.isMesh || o.isInstancedMesh) && o.material) {
        if (style === 'review') { if (o.material.userData && o.material.userData.name) { o.userData._mat = o.material; o.material = _review; } }
        else if (o.userData._mat) { o.material = o.userData._mat; delete o.userData._mat; }
      }
    });
  }
  /* clash marks: each result's intersection box as a translucent solid with an edge and a numbered pin */
  function labelSprite(text, colour) {
    var THREE = T(), c = canvas(128), x = c.getContext('2d');
    x.fillStyle = '#' + ('000000' + (colour || 0xb8332a).toString(16)).slice(-6); x.beginPath(); x.arc(64, 64, 56, 0, 6.283); x.fill();
    x.fillStyle = '#ffffff'; x.font = 'bold 60px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(text), 64, 68);
    var t = new THREE.CanvasTexture(c); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.renderOrder = 10; return sp;
  }
  function clashMarks(results, opts) {
    var THREE = T(); if (!THREE) return null;
    opts = opts || {}; var colour = opts.colour != null ? opts.colour : 0xb8332a, grp = new THREE.Group(), n = 0;
    var fill = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: FADE.clashFill, depthWrite: false, side: THREE.DoubleSide }), line = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: FADE.clashLine });
    (results || []).forEach(function (r, i) {
      var b = r && r.box; if (!b) return;
      var w = Math.max(0.05, b.x1 - b.x0), d = Math.max(0.05, b.y1 - b.y0), h = Math.max(0.05, b.z1 - b.z0), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
      var geo = new THREE.BoxGeometry(w, d, h), m = new THREE.Mesh(geo, fill); m.position.set(cx, cy, cz); m.renderOrder = 5; grp.add(m);
      var e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), line); e.position.set(cx, cy, cz); grp.add(e);
      var top = b.z1 + Math.max(2, h * 0.6), pin = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cx, cy, b.z1), new THREE.Vector3(cx, cy, top)]), line); grp.add(pin);
      var sp = labelSprite(i + 1, colour); sp.position.set(cx, cy, top + 0.6); sp.scale.set(1.2, 1.2, 1); grp.add(sp);
      m.userData = { clash: r, index: i }; n++;
    });
    grp.userData = { clashes: n };
    return grp;
  }
  /* ---- the world the models stand in: sky, environment, sun, ground grid ---- */
  function skyDome(radius) {
    var THREE = T(), geo = new THREE.SphereGeometry(radius || 6000, 32, 16);
    var mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new THREE.Color(SKY.zenith) }, bottom: { value: new THREE.Color(SKY.horizon) }, sunDir: { value: new THREE.Vector3(0.42, -0.55, 0.72).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = clamp(d.z, 0.0, 1.0); float t = pow(h, 0.5); vec3 c = mix(bottom, top, t); float s = max(dot(d, sunDir), 0.0); c += vec3(1.0, 0.93, 0.8) * pow(s, 260.0) * 1.6 + vec3(0.9, 0.85, 0.75) * pow(s, 6.0) * 0.12; gl_FragColor = vec4(c, 1.0); }' });
    var m = new THREE.Mesh(geo, mat); m.userData = { sky: true }; m.frustumCulled = false; return m;
  }
  function environment(renderer) {
    var THREE = T(); if (!THREE || !renderer || !THREE.PMREMGenerator) return null;
    if (_env) return _env;
    var sc = new THREE.Scene(); sc.add(skyDome(50));
    var sun = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff2d0 })); sun.position.set(20, -25, 30); sc.add(sun);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: SKY.ground })); floor.position.z = -2; sc.add(floor);
    var pm = new THREE.PMREMGenerator(renderer); _env = pm.fromScene(sc, 0.04).texture; pm.dispose();
    return _env;
  }
  function lights(scene) {
    var THREE = T(), hemi = new THREE.HemisphereLight(new THREE.Color(SKY.horizon), new THREE.Color(SKY.ground), 0.5);
    hemi.position.set(0, 0, 1); scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff3dd, 2.4); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2;
    sun.position.set(60, -80, 120); scene.add(sun); scene.add(sun.target);
    var fill = new THREE.DirectionalLight(0xcfdcea, 0.35); fill.position.set(-80, 60, 40); scene.add(fill);
    return { hemi: hemi, sun: sun, fill: fill };
  }
  function aimSun(sun, dir, box) {
    var THREE = T(); if (!sun) return;
    var cx = (box[0] + box[3]) / 2, cy = (box[1] + box[4]) / 2, cz = (box[2] + box[5]) / 2, half = Math.max(12, Math.sqrt(Math.pow(box[3] - box[0], 2) + Math.pow(box[4] - box[1], 2) + Math.pow(box[5] - box[2], 2)) / 2 * 1.05);
    sun.target.position.set(cx, cy, cz); sun.target.updateMatrixWorld();
    sun.position.set(cx + dir[0] * half * 3, cy + dir[1] * half * 3, cz + dir[2] * half * 3);
    var c = sun.shadow.camera; c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = half * 0.5; c.far = half * 6; c.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
  }
  /* ground: a shadow catcher with a compacted-aggregate surface and an engineering grid, 1 m minor and 10 m major */
  function groundSurface() {
    var THREE = T(); if (_tex._ground) return _tex._ground;
    var n = 1024, c = canvas(n), x = c.getContext('2d'); noise(x, n, 178, 40, 61); blotch(x, n, 900, 0.8, 3, 0.1, 63); blotch(x, n, 300, 4, 14, 0.05, 65, 'rgba(255,255,255,0.05)');
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24); t.anisotropy = 8; if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; _tex._ground = t; return t;
  }
  function ground(size, opts) {
    var THREE = T(), grp = new THREE.Group(), S = size || 400, z = (opts && opts.z != null) ? opts.z : -0.02;
    var plane = new THREE.Mesh(new THREE.PlaneGeometry(S * 3, S * 3), new THREE.MeshStandardMaterial({ color: SKY.ground, map: groundSurface(), roughness: 1, metalness: 0 })); plane.position.z = z - 0.02; plane.receiveShadow = true; grp.add(plane);
    var minor = [], major = [], i, h = S / 2;
    for (i = -h; i <= h + 1e-6; i += 1) { var M = (Math.round(i) % 10 === 0) ? major : minor; M.push(i, -h, z, i, h, z, -h, i, z, h, i, z); }
    if (!(opts && opts.grid === false)) {
      grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(toV3(minor)), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: FADE.gridMinor })));
      grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(toV3(major)), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: FADE.gridMajor })));
    }
    grp.userData = { ground: true, size: S };
    return grp;
  }
  function toV3(a) { var THREE = T(), out = []; for (var i = 0; i < a.length; i += 3) out.push(new THREE.Vector3(a[i], a[i + 1], a[i + 2])); return out; }
  function fog(scene, size) { var THREE = T(); scene.fog = new THREE.Fog(SKY.horizon, (size || 400) * 1.2, (size || 400) * 4); return scene.fog; }
  function horizonColour() { var THREE = T(); return new THREE.Color(SKY.horizon); }
  /* a renderer set up the way every page here expects: shadows, ACES, sRGB */
  function makeRenderer(canvasEl, opts) {
    var THREE = T(), r = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false, preserveDrawingBuffer: !!(opts && opts.preserve) });
    r.setPixelRatio(Math.min(2, (opts && opts.dpr) || window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    if (THREE.SRGBColorSpace) r.outputColorSpace = THREE.SRGBColorSpace;
    return r;
  }

  /* ---- the terrain: one triangle strip mesh per snapshot, vertex-coloured by elevation, plus contour lines ---- */
  function rampColour(t) {
    var THREE = T(), i; t = Math.max(0, Math.min(1, t));
    for (i = 1; i < RAMP.length; i++) if (t <= RAMP[i][1]) { var a = new THREE.Color(RAMP[i - 1][0]), b = new THREE.Color(RAMP[i][0]); return a.lerp(b, (t - RAMP[i - 1][1]) / (RAMP[i][1] - RAMP[i - 1][1])); }
    return new THREE.Color(RAMP[RAMP.length - 1][0]);
  }
  function terrainMesh(snap, toSite, opts) {
    var THREE = T(); opts = opts || {};
    if (!THREE || !snap || !Array.isArray(snap.z)) return null;
    var w = snap.w, h = snap.h, cell = snap.cell, pos = [], col = [], idx = [], i, j, k = 0, map = new Int32Array(w * h).fill(-1);
    var lo = snap.zMin != null ? snap.zMin : Infinity, hi = snap.zMax != null ? snap.zMax : -Infinity;
    if (!isFinite(lo)) { snap.z.forEach(function (v) { if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); }
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
      var v = snap.z[j * w + i]; if (v == null || !isFinite(v)) continue;
      var E = snap.originE + i * cell, N = snap.originN - j * cell, s = toSite ? toSite(E, N) : { x: E, y: N };
      pos.push(s.x, s.y, v - (opts.zRef || 0)); var c = rampColour(hi > lo ? (v - lo) / (hi - lo) : 0.5); col.push(c.r, c.g, c.b); map[j * w + i] = k++;
    }
    for (j = 0; j + 1 < h; j++) for (i = 0; i + 1 < w; i++) {
      var a = map[j * w + i], b = map[j * w + i + 1], c2 = map[(j + 1) * w + i], d = map[(j + 1) * w + i + 1];
      if (a >= 0 && b >= 0 && c2 >= 0) idx.push(a, c2, b);
      if (b >= 0 && c2 >= 0 && d >= 0) idx.push(b, c2, d);
    }
    if (!idx.length) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    var mat = opts.texture ? new THREE.MeshStandardMaterial({ map: opts.texture, roughness: 1, metalness: 0, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    if (opts.texture) { var uv = []; for (j = 0; j < h; j++) for (i = 0; i < w; i++) { if (map[j * w + i] < 0) continue; uv.push(i / (w - 1), 1 - j / (h - 1)); } geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    var mesh = new THREE.Mesh(geo, mat); mesh.userData = { terrain: true, snap: snap }; mesh.receiveShadow = true; mesh.castShadow = true;
    var grp = new THREE.Group(); grp.add(mesh);
    if (opts.wire !== false) { var wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x3a3a34, transparent: true, opacity: FADE.wire })); wire.userData = { edge: true }; grp.add(wire); }
    grp.userData = { terrain: true, lo: lo, hi: hi, vertices: k };
    return grp;
  }
  function contourLines(existing, toSite, opts) {
    var THREE = T(), S = g.MCSURFACE; if (!THREE || !S || !existing || !existing.ok) return null;
    var c = S.contours(existing, { interval: (opts && opts.interval) || 1 }); if (!c || !c.ok) return null;
    var gj = S.toGeoJSON(c), pos = [];
    (gj.features || []).forEach(function (f) {
      var lvl = f.properties && f.properties.level != null ? f.properties.level : (f.properties && f.properties.z);
      var lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : []);
      lines.forEach(function (ln) { for (var i = 0; i + 1 < ln.length; i++) { var a = toSite ? toSite(ln[i][0], ln[i][1]) : { x: ln[i][0], y: ln[i][1] }, b = toSite ? toSite(ln[i + 1][0], ln[i + 1][1]) : { x: ln[i + 1][0], y: ln[i + 1][1] }; pos.push(a.x, a.y, (lvl || 0) - ((opts && opts.zRef) || 0) + 0.05, b.x, b.y, (lvl || 0) - ((opts && opts.zRef) || 0) + 0.05); } });
    });
    if (!pos.length) return null;
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x4a3f2a, transparent: true, opacity: FADE.contour })); ls.userData = { contours: true, levels: c.levels && c.levels.length };
    return ls;
  }
  function groundTexture(lat, tileUrl, opts) {
    var THREE = T(), G = g.MCGROUND; opts = opts || {};
    if (!THREE || !G) return Promise.resolve({ ok: false, reason: 'three.js or mc-ground.js is not loaded' });
    if (!tileUrl) return Promise.resolve({ ok: false, reason: 'no tile source' });
    var bb = G.bboxOf(lat), z = opts.zoom || G.zoomFor(opts.mPerPx || Math.max(0.6, lat.cell / 8), (bb.north + bb.south) / 2), ts = G.tiles(bb, z);
    if (!ts.ok) return Promise.resolve({ ok: false, reason: ts.reason });
    var xs = ts.tiles.map(function (t) { return t.x; }), ys = ts.tiles.map(function (t) { return t.y; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), nx = Math.max.apply(null, xs) - x0 + 1, ny = Math.max.apply(null, ys) - y0 + 1;
    var cv = document.createElement('canvas'); cv.width = nx * 256; cv.height = ny * 256; var ctx = cv.getContext('2d'); var failed = [];
    var loads = ts.tiles.map(function (t) {
      return new Promise(function (res) {
        var im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = function () { try { ctx.drawImage(im, (t.x - x0) * 256, (t.y - y0) * 256); } catch (_e) { failed.push(t.z + '/' + t.x + '/' + t.y); } res(); };
        im.onerror = function () { failed.push(t.z + '/' + t.x + '/' + t.y); res(); };
        im.src = tileUrl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y).replace('{s}', 'a');
      });
    });
    return Promise.all(loads).then(function () {
      if (failed.length === ts.tiles.length) return { ok: false, reason: 'no tile loaded (' + failed.length + ' failed): the tile server refused this origin or is unreachable' };
      var tb = G.tileBounds(x0, y0, z), tb2 = G.tileBounds(x0 + nx - 1, y0 + ny - 1, z);
      function my(latDeg) { var r = latDeg * Math.PI / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)); }
      var W = cv.width, H = cv.height, px0 = (bb.west - tb.w) / (tb2.e - tb.w) * W, px1 = (bb.east - tb.w) / (tb2.e - tb.w) * W;
      var py0 = (my(tb.n) - my(bb.north)) / (my(tb.n) - my(tb2.s)) * H, py1 = (my(tb.n) - my(bb.south)) / (my(tb.n) - my(tb2.s)) * H;
      var out = document.createElement('canvas'); out.width = Math.max(64, Math.round(px1 - px0)); out.height = Math.max(64, Math.round(py1 - py0));
      out.getContext('2d').drawImage(cv, px0, py0, px1 - px0, py1 - py0, 0, 0, out.width, out.height);
      var tex = new THREE.CanvasTexture(out); tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
      return { ok: true, texture: tex, tiles: ts.tiles.length, failed: failed, zoom: z, basis: 'web-mercator tiles cropped to the lattice; a north-up UTM grid is turned from true north by the convergence, so the raster sits within one cell of the terrain at this scale' };
    });
  }
  g.MCSITE3D = { VERSION: 3, RAMP: RAMP, SKY: SKY, INKS: INKS, FADE: FADE, STYLES: ['realistic', 'edges', 'review'],
    PART_SHAPES: ['box', 'cyl', 'cone', 'sphere', 'torus', 'tube', 'curve', 'profile', 'lathe'],
    material: material, texture: texture, surface: surface, partMesh: partMesh, lattice: lattice, blockGroup: blockGroup, ringOf: ringOf, measure: measure, applyStyle: applyStyle, clashMarks: clashMarks,
    skyDome: skyDome, environment: environment, lights: lights, aimSun: aimSun, ground: ground, fog: fog, horizonColour: horizonColour, makeRenderer: makeRenderer,
    terrainMesh: terrainMesh, contourLines: contourLines, groundTexture: groundTexture };
})(typeof window !== 'undefined' ? window : globalThis);
