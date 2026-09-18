/*
 * dxf.js — xuất DXF (mm) cho AutoCAD + SketchUp từ 1 phòng khảo sát.
 * TÁCH HẲN UI như geometry.js: toán/chuỗi thuần, test được ở node.
 * DXF R12 (AC1009) — dùng thực thể LINE/TEXT/CIRCLE cho tối đa tương thích
 * (SketchUp tạo được mặt từ chuỗi LINE khép kín; AutoCAD đọc thẳng).
 * Toạ độ: lật trục y (màn hình y xuống -> CAD y lên) để hình không bị soi gương.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DXF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LAYERS = [
    { name: 'MAT-BANG', color: 7 },
    { name: 'KICH-THUOC', color: 3 },
    { name: 'TEN', color: 5 },
    { name: 'THIET-BI', color: 1 },
    { name: 'MAT-DUNG', color: 4 }
  ];
  var KTEN = {
    outlet: 'O DIEN', switchx: 'CONG TAC', data: 'O MANG', tv: 'DAU TV', water: 'CAP NUOC',
    drain: 'THOAT NUOC', ac: 'MAY LANH', door: 'CUA', window: 'CUA SO', niche: 'HOC',
    panel: 'TU DIEN', camera: 'CAMERA', wlight: 'DEN TUONG', beam: 'DAM'
  };
  function letter(i) { return String.fromCharCode(65 + i); }
  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }

  // ---- viết thực thể (mảng dòng "code","value") ----
  function line(o, x1, y1, x2, y2, layer) {
    o.push('0', 'LINE', '8', layer, '10', x1.toFixed(2), '20', y1.toFixed(2), '30', '0',
      '11', x2.toFixed(2), '21', y2.toFixed(2), '31', '0');
  }
  function rect(o, x, y, w, h, layer) {
    line(o, x, y, x + w, y, layer); line(o, x + w, y, x + w, y + h, layer);
    line(o, x + w, y + h, x, y + h, layer); line(o, x, y + h, x, y, layer);
  }
  function text(o, x, y, h, str, layer) {
    o.push('0', 'TEXT', '8', layer, '10', x.toFixed(2), '20', y.toFixed(2), '30', '0',
      '40', h.toFixed(2), '1', String(str), '7', 'STANDARD');
  }
  function textC(o, x, y, h, str, layer) { // canh giữa (72=1, 73=2 middle)
    o.push('0', 'TEXT', '8', layer, '10', x.toFixed(2), '20', y.toFixed(2), '30', '0',
      '40', h.toFixed(2), '1', String(str), '7', 'STANDARD', '72', '1', '73', '2',
      '11', x.toFixed(2), '21', y.toFixed(2), '31', '0');
  }
  function circle(o, x, y, r, layer) {
    o.push('0', 'CIRCLE', '8', layer, '10', x.toFixed(2), '20', y.toFixed(2), '30', '0', '40', r.toFixed(2));
  }

  // Vị trí thiết bị trên MẶT BẰNG: điểm cách góc A của tường một đoạn fromA, dọc theo tường.
  function alongWall(A, B, fromA) {
    var dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    return { x: A.x + dx / L * fromA, y: A.y + dy / L * fromA };
  }

  // room -> chuỗi DXF. Cần Geometry (G) để dựng đỉnh + độ dài.
  function roomToDXF(room, G) {
    var edges = room.edges || [];
    if (!edges.length || G.missingCount(edges) > 0) return null; // chưa đủ số thì không xuất
    var raw = G.buildVertsLive(edges);              // mm, y xuống (màn hình)
    var verts = raw.map(function (p) { return { x: p.x, y: -p.y }; }); // lật y cho CAD
    var Hc = n(room.ceilingHeight) || 2700;

    var e = [];
    // --- MẶT BẰNG: cạnh + tên góc + kích thước ---
    for (var i = 0; i < edges.length; i++) {
      var a = verts[i], b = verts[i + 1];
      line(e, a.x, a.y, b.x, b.y, 'MAT-BANG');
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      textC(e, mid.x, mid.y, 90, String(edges[i].mm), 'KICH-THUOC');
    }
    for (var v = 0; v < edges.length; v++) text(e, verts[v].x + 60, verts[v].y + 60, 140, letter(v), 'TEN');

    // --- thiết bị trên tường: chấm vị trí trên mặt bằng ---
    (room.objects || []).forEach(function (o) {
      if (o.ceiling || o.wall == null || o.fromA == null) return;
      var A = verts[o.wall], B = verts[(o.wall + 1) % edges.length];
      var p = alongWall(A, B, n(o.fromA) + n(o.w) / 2); // lấy tâm vật
      circle(e, p.x, p.y, 55, 'THIET-BI');
      text(e, p.x + 80, p.y + 40, 70, KTEN[o.kind] || o.kind, 'THIET-BI');
    });

    // --- MẶT ĐỨNG từng tường: xếp dọc bên dưới mặt bằng ---
    var minX = Infinity, minY = Infinity;
    for (var k = 0; k < verts.length; k++) { if (verts[k].x < minX) minX = verts[k].x; if (verts[k].y < minY) minY = verts[k].y; }
    var floorY = minY - 2000; // dòng sàn của mặt đứng đầu tiên
    for (var w = 0; w < edges.length; w++) {
      var L = n(edges[w].mm), ex = minX, ey = floorY;
      rect(e, ex, ey, L, Hc, 'MAT-DUNG');                          // ô tường
      line(e, ex - 150, ey, ex + L + 150, ey, 'MAT-DUNG');         // sàn mặt đứng
      text(e, ex, ey + Hc + 120, 140, 'TUONG ' + letter(w) + '-' + letter((w + 1) % edges.length), 'TEN');
      textC(e, ex + L / 2, ey - 260, 110, 'dai ' + L, 'KICH-THUOC');
      text(e, ex - 900, ey + Hc / 2, 110, 'cao ' + Hc, 'KICH-THUOC');
      // nhãn góc hai đầu
      text(e, ex + 30, ey + 120, 120, letter(w), 'TEN');
      text(e, ex + L - 180, ey + 120, 120, letter((w + 1) % edges.length), 'TEN');

      objsOfWall(room, w).forEach(function (o) {
        if (o.kind === 'door') {
          rect(e, ex + n(o.fromA), ey, n(o.w), n(o.doorH), 'THIET-BI');
          textC(e, ex + n(o.fromA) + n(o.w) / 2, ey + n(o.doorH) + 90, 80, 'CUA R' + n(o.w) + ' C' + n(o.doorH), 'THIET-BI');
        } else if (o.kind === 'window' || o.kind === 'niche') {
          var lo = o.sill != null ? n(o.sill) : n(o.bottom), hi = o.head != null ? n(o.head) : n(o.top);
          rect(e, ex + n(o.fromA), ey + lo, n(o.w), hi - lo, 'THIET-BI');
          textC(e, ex + n(o.fromA) + n(o.w) / 2, ey + hi + 90, 80, (KTEN[o.kind] || '') + ' ' + lo + '-' + hi, 'THIET-BI');
        } else if (o.kind === 'beam') {
          var yb = ey + n(o.bottom);
          rect(e, ex, yb, L, ey + Hc - yb, 'THIET-BI');
          textC(e, ex + L / 2, yb + 40, 80, 'DAM day ' + n(o.bottom), 'THIET-BI');
        } else {
          var ow = n(o.w), ooh = n(o.oh);
          if (ow > 0 && ooh > 0) { // có kích thước vật -> ô đúng cỡ
            rect(e, ex + n(o.fromA), ey + n(o.h), ow, ooh, 'THIET-BI');
            textC(e, ex + n(o.fromA) + ow / 2, ey + n(o.h) + ooh + 90, 75, (KTEN[o.kind] || o.kind) + ' A' + n(o.fromA) + ' R' + ow + ' C' + ooh, 'THIET-BI');
          } else {
            var cx = ex + n(o.fromA), cy = ey + n(o.h);
            circle(e, cx, cy, 60, 'THIET-BI');
            textC(e, cx, cy + 170, 75, (KTEN[o.kind] || o.kind) + ' A' + n(o.fromA) + ' san' + n(o.h), 'THIET-BI');
          }
        }
      });
      floorY = ey - (Hc + 2500); // tường kế xuống dưới
    }

    return wrap(e);
  }
  function objsOfWall(room, w) { return (room.objects || []).filter(function (o) { return !o.ceiling && o.wall === w; }); }

  // bọc HEADER/TABLES/ENTITIES thành file DXF R12 hoàn chỉnh.
  function wrap(entities) {
    var h = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC'];
    var t = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length)];
    LAYERS.forEach(function (l) { t.push('0', 'LAYER', '2', l.name, '70', '0', '62', String(l.color), '6', 'CONTINUOUS'); });
    t.push('0', 'ENDTAB', '0', 'ENDSEC');
    var en = ['0', 'SECTION', '2', 'ENTITIES'].concat(entities, ['0', 'ENDSEC']);
    return h.concat(t, en, ['0', 'EOF']).join('\r\n') + '\r\n';
  }

  return { roomToDXF: roomToDXF, LAYERS: LAYERS, wrap: wrap };
});
