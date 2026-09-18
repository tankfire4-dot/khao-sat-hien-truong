/*
 * geometry.js — engine hình học cho app khảo sát (v0).
 * TÁCH HẲN UI: không đụng DOM, không state app. Chỉ toán thuần → test được ở node.
 * Chạy cả trên trình duyệt (gắn window.Geometry) lẫn node (module.exports) —
 * dùng script cổ điển, KHÔNG ES-module, để mở index.html bằng file:// không bị chặn CORS.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // node/test
  root.Geometry = api;                                                        // trình duyệt
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Hướng trực giao. Toạ độ TOÁN HỌC: y hướng LÊN (render sẽ lật lại cho màn hình).
  var DIRS = {
    R: { x: 1, y: 0, ten: 'Phải →' },
    L: { x: -1, y: 0, ten: 'Trái ←' },
    U: { x: 0, y: 1, ten: 'Lên ↑' },
    D: { x: 0, y: -1, ten: 'Xuống ↓' }
  };

  function dirVector(dir) {
    var v = DIRS[dir];
    if (!v) throw new Error('Hướng không hợp lệ: ' + dir);
    return { x: v.x, y: v.y };
  }

  // Dựng chuỗi điểm từ các cạnh. Bắt đầu tại gốc (0,0) = điểm A.
  // segments: [{ dir:'R'|'L'|'U'|'D', length: <mm> }, ...]
  function buildPoints(segments) {
    var points = [{ x: 0, y: 0 }];
    for (var i = 0; i < segments.length; i++) {
      var v = dirVector(segments[i].dir);
      var len = Number(segments[i].length) || 0;
      var last = points[points.length - 1];
      points.push({ x: last.x + v.x * len, y: last.y + v.y * len });
    }
    return points;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // Sai số khép hình = khoảng cách từ ĐIỂM CUỐI về ĐIỂM ĐẦU (mm).
  // Trả null nếu chưa đủ cạnh để nói tới chuyện khép (cần >= 3).
  function closureError(segments) {
    if (!segments || segments.length < 3) return null;
    var pts = buildPoints(segments);
    return distance(pts[pts.length - 1], pts[0]);
  }

  // Ngưỡng closure (v0 cứng; sau cho cấu hình). KHÔNG kết luận "đo sai" —
  // chỉ nói dữ liệu hiện tại khép tới đâu.
  function closureBand(mm) {
    if (mm == null) return { level: 'none', nhan: 'Chưa đủ cạnh', mau: '#9d9da3' };
    if (mm <= 5) return { level: 'good', nhan: 'Khép tốt', mau: '#2f855a' };
    if (mm <= 15) return { level: 'watch', nhan: 'Nên chú ý', mau: '#b08328' };
    if (mm <= 30) return { level: 'check', nhan: 'Nên kiểm tra', mau: '#c4703a' };
    return { level: 'bad', nhan: 'Chưa khép — nên đo lại', mau: '#bf5340' };
  }

  function totalLength(segments) {
    var s = 0;
    for (var i = 0; i < segments.length; i++) s += Number(segments[i].length) || 0;
    return s;
  }

  function boundingBox(points) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < points.length; i++) {
      if (points[i].x < minX) minX = points[i].x;
      if (points[i].y < minY) minY = points[i].y;
      if (points[i].x > maxX) maxX = points[i].x;
      if (points[i].y > maxY) maxY = points[i].y;
    }
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 0; }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  }

  // Biến đổi fit: đưa điểm (toạ độ toán, y lên) vào khung SVG (w×h, y xuống),
  // chừa lề pad. Trả hàm ánh xạ 1 điểm -> {x,y} pixel màn hình.
  function fitTransform(points, w, h, pad) {
    var bb = boundingBox(points);
    var availW = Math.max(1, w - 2 * pad);
    var availH = Math.max(1, h - 2 * pad);
    var scale = Math.min(bb.w > 0 ? availW / bb.w : Infinity, bb.h > 0 ? availH / bb.h : Infinity);
    if (!isFinite(scale) || scale <= 0) scale = 0.1; // 1 điểm hoặc đường thẳng suy biến
    var drawW = bb.w * scale, drawH = bb.h * scale;
    var offX = pad + (availW - drawW) / 2;
    var offY = pad + (availH - drawH) / 2;
    return function (p) {
      return {
        x: offX + (p.x - bb.minX) * scale,
        y: h - offY - (p.y - bb.minY) * scale // lật y cho màn hình
      };
    };
  }

  // ===== Mô hình "vẽ nguệch ngoạc → bẻ vuông → nhập số từng cạnh" =====
  // Phân loại 1 cạnh của bản vẽ tay thành NGANG hay DỌC (theo trục trội hơn).
  // Làm việc trong toạ độ MÀN HÌNH (y xuống) — sketch vẽ ngay trên SVG.
  function classifyEdge(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { axis: 'H', sign: dx >= 0 ? 1 : -1, len0: Math.abs(dx), mm: null };
    return { axis: 'V', sign: dy >= 0 ? 1 : -1, len0: Math.abs(dy), mm: null };
  }

  // Bẻ vuông: đa giác tay (pts, đã đóng) -> danh sách cạnh trực giao.
  // len0 = độ dài pixel của bản vẽ (giữ để hiện hình trước khi có số thật).
  function orthogonalize(pts) {
    var edges = [], n = pts.length;
    for (var i = 0; i < n; i++) edges.push(classifyEdge(pts[i], pts[(i + 1) % n]));
    return edges;
  }

  // Dựng đỉnh từ danh sách cạnh. useMeasured=true dùng số đo thật (mm);
  // ngược lại dùng len0 (hình bản vẽ). Toạ độ màn hình, KHÔNG lật y.
  function buildVerts(edges, useMeasured) {
    var pts = [{ x: 0, y: 0 }];
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var L = useMeasured ? (Number(e.mm) || 0) : (e.len0 || 0);
      var last = pts[pts.length - 1];
      pts.push(e.axis === 'H' ? { x: last.x + e.sign * L, y: last.y } : { x: last.x, y: last.y + e.sign * L });
    }
    return pts;
  }

  // Dọn cạnh sau khi bẻ vuông: gộp các cạnh LIỀN NHAU cùng trục + cùng chiều
  // (do nét tay rung tạo ra cạnh thừa gần thẳng hàng). Giữ nguyên góc thật và hốc.
  function cleanEdges(edges) {
    var out = edges.map(function (e) { return { axis: e.axis, sign: e.sign, len0: e.len0, mm: e.mm }; });
    var changed = true;
    while (changed && out.length > 3) {
      changed = false;
      for (var i = 0; i < out.length; i++) {
        var j = (i + 1) % out.length, a = out[i], b = out[j];
        if (a.axis === b.axis && a.sign === b.sign) {
          a.len0 += b.len0;
          a.mm = (a.mm == null && b.mm == null) ? null : (Number(a.mm || 0) + Number(b.mm || 0));
          out.splice(j, 1); changed = true; break;
        }
      }
    }
    return out;
  }

  // Tỉ lệ px→mm ước lượng từ các cạnh ĐÃ có số, để cạnh CHƯA có số hiện đúng cỡ tương đối.
  function estimateScale(edges) {
    var sum = 0, n = 0;
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      if (e.mm != null && e.len0 > 0) { sum += Number(e.mm) / e.len0; n++; }
    }
    return n ? sum / n : null;
  }

  // Dựng đỉnh SỐNG: cạnh có số dùng số thật; cạnh chưa có số đoán theo
  // TƯỜNG ĐỐI DIỆN cùng trục đã đo (phòng thường chữ nhật), không có thì theo tỉ lệ nét vẽ.
  // -> hình co giãn ngay mỗi lần gõ, không "nhảy" một phát lúc đủ số.
  function buildVertsLive(edges) {
    var k = estimateScale(edges);
    var byAxis = { H: [], V: [] };
    for (var i = 0; i < edges.length; i++) if (edges[i].mm != null) byAxis[edges[i].axis].push(Number(edges[i].mm));
    function avg(a) { if (!a.length) return null; for (var s = 0, j = 0; j < a.length; j++) s += a[j]; return s / a.length; }
    var mAxis = { H: avg(byAxis.H), V: avg(byAxis.V) };
    var pts = [{ x: 0, y: 0 }];
    for (var m = 0; m < edges.length; m++) {
      var e = edges[m];
      var L = e.mm != null ? Number(e.mm) : (mAxis[e.axis] != null ? mAxis[e.axis] : (k != null ? e.len0 * k : e.len0));
      var last = pts[pts.length - 1];
      pts.push(e.axis === 'H' ? { x: last.x + e.sign * L, y: last.y } : { x: last.x, y: last.y + e.sign * L });
    }
    return pts;
  }

  function allMeasured(edges) {
    return edges.length > 0 && edges.every(function (e) { return e.mm != null && Number(e.mm) > 0; });
  }
  function missingCount(edges) {
    return edges.filter(function (e) { return e.mm == null; }).length;
  }

  // Sai số khép cho đa giác chữ nhật: tổng ĐẠI SỐ cạnh ngang phải = 0 và dọc = 0.
  // Trả null nếu chưa nhập đủ số. Khác buildPoints (chuỗi cạnh) — đây là vòng đóng.
  function rectilinearResidual(edges) {
    if (!allMeasured(edges)) return null;
    var sh = 0, sv = 0;
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i], mm = Number(e.mm);
      if (e.axis === 'H') sh += e.sign * mm; else sv += e.sign * mm;
    }
    return Math.hypot(sh, sv);
  }

  // Dài 1 tường (cạnh i) theo số đo, mm. null nếu chưa có số.
  function wallLength(edges, i) {
    if (!edges || i < 0 || i >= edges.length) return null;
    return edges[i].mm == null ? null : Number(edges[i].mm);
  }

  // Khoảng cách giữa hai GÓC i, j (chỉ số đỉnh 0..n-1) tính từ hình đang dựng sống.
  // Dùng cho kiểm đường chéo (§17). null nếu chỉ số sai.
  function cornerDistance(edges, i, j) {
    if (!edges || i < 0 || j < 0 || i >= edges.length || j >= edges.length) return null;
    var v = buildVertsLive(edges);
    return distance(v[i], v[j]);
  }

  // Định vị 1 điểm bằng khoảng cách tới 2 điểm mốc P, Q (giao 2 vòng tròn).
  // rP, rQ = khoảng cách đo được từ điểm cần tìm tới P và Q. side = +1/-1 chọn 1 trong 2 nghiệm
  // (điểm ở hai phía đường PQ). Trả null nếu 2 vòng KHÔNG giao (số đo mâu thuẫn).
  function triangulate(P, Q, rP, rQ, side) {
    var dx = Q.x - P.x, dy = Q.y - P.y, d = Math.hypot(dx, dy);
    if (d === 0) return null;
    var a = (rP * rP - rQ * rQ + d * d) / (2 * d);
    var h2 = rP * rP - a * a;
    if (h2 < -1e-3) return null;
    var h = Math.sqrt(Math.max(0, h2));
    var mx = P.x + a * dx / d, my = P.y + a * dy / d;
    var ox = -dy / d * h, oy = dx / d * h;
    var s = side < 0 ? -1 : 1;
    return { x: mx + s * ox, y: my + s * oy };
  }

  // Giao 2 đường thẳng (điểm p + hướng d). null nếu song song.
  function lineLineIntersect(p1, d1, p2, d2) {
    var den = d1.x * (-d2.y) - (-d2.x) * d1.y;
    if (Math.abs(den) < 1e-9) return null;
    var bx = p2.x - p1.x, by = p2.y - p1.y;
    var t = (bx * (-d2.y) - (-d2.x) * by) / den;
    return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
  }
  // Giao đường thẳng (p, dir) với vòng tròn (tâm C, bán kính r). Trả 0/1/2 điểm.
  function lineCircleIntersect(p, dir, C, r) {
    var fx = p.x - C.x, fy = p.y - C.y;
    var a = dir.x * dir.x + dir.y * dir.y;
    var b = 2 * (fx * dir.x + fy * dir.y);
    var c = fx * fx + fy * fy - r * r;
    var disc = b * b - 4 * a * c;
    if (disc < -1e-6) return [];
    disc = Math.max(0, disc); var sq = Math.sqrt(disc);
    var t1 = (-b + sq) / (2 * a), out = [{ x: p.x + t1 * dir.x, y: p.y + t1 * dir.y }];
    if (sq > 1e-9) { var t2 = (-b - sq) / (2 * a); out.push({ x: p.x + t2 * dir.x, y: p.y + t2 * dir.y }); }
    return out;
  }

  // Khoảng cách từ điểm p tới ĐOẠN thẳng a-b (không phải đường thẳng vô hạn).
  function perpDistance(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // Đơn giản hoá nét vẽ tay (Ramer–Douglas–Peucker): rút hàng trăm điểm rê tay
  // xuống còn các GÓC chính. eps = ngưỡng lệch (đơn vị toạ độ vẽ).
  function simplifyRDP(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var end = pts.length - 1, dmax = 0, idx = 0;
    for (var i = 1; i < end; i++) {
      var d = perpDistance(pts[i], pts[0], pts[end]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps) {
      var l = simplifyRDP(pts.slice(0, idx + 1), eps);
      var r = simplifyRDP(pts.slice(idx), eps);
      return l.slice(0, -1).concat(r);
    }
    return [pts[0], pts[end]];
  }

  // Fit vào khung SVG nhưng KHÔNG lật y (điểm đã ở toạ độ màn hình).
  function fitTransformScreen(points, w, h, pad) {
    var bb = boundingBox(points);
    var availW = Math.max(1, w - 2 * pad), availH = Math.max(1, h - 2 * pad);
    var scale = Math.min(bb.w > 0 ? availW / bb.w : Infinity, bb.h > 0 ? availH / bb.h : Infinity);
    if (!isFinite(scale) || scale <= 0) scale = 0.1;
    var offX = pad + (availW - bb.w * scale) / 2, offY = pad + (availH - bb.h * scale) / 2;
    return function (p) { return { x: offX + (p.x - bb.minX) * scale, y: offY + (p.y - bb.minY) * scale }; };
  }

  return {
    DIRS: DIRS,
    dirVector: dirVector,
    buildPoints: buildPoints,
    distance: distance,
    closureError: closureError,
    closureBand: closureBand,
    totalLength: totalLength,
    boundingBox: boundingBox,
    fitTransform: fitTransform,
    classifyEdge: classifyEdge,
    orthogonalize: orthogonalize,
    cleanEdges: cleanEdges,
    estimateScale: estimateScale,
    buildVerts: buildVerts,
    buildVertsLive: buildVertsLive,
    allMeasured: allMeasured,
    missingCount: missingCount,
    rectilinearResidual: rectilinearResidual,
    wallLength: wallLength,
    cornerDistance: cornerDistance,
    triangulate: triangulate,
    lineLineIntersect: lineLineIntersect,
    lineCircleIntersect: lineCircleIntersect,
    perpDistance: perpDistance,
    simplifyRDP: simplifyRDP,
    fitTransformScreen: fitTransformScreen
  };
});
