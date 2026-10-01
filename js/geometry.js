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
      // est = độ dài TẠM (mm) của cạnh vừa chèn khi sửa hình — chưa đo nhưng không để nó phình theo tường đối diện
      var L = e.mm != null ? Number(e.mm) : (e.est != null ? Number(e.est) : (mAxis[e.axis] != null ? mAxis[e.axis] : (k != null ? e.len0 * k : e.len0)));
      var last = pts[pts.length - 1];
      pts.push(e.axis === 'H' ? { x: last.x + e.sign * L, y: last.y } : { x: last.x, y: last.y + e.sign * L });
    }
    return pts;
  }

  // ---------- SỬA HÌNH tại 1 cạnh, không phải vẽ lại cả phòng ----------
  // Mọi thao tác trả { edges, edgeMap, cornerMap }: edgeMap[cũ] = chỉ số mới (-1 = mất), cornerMap tương tự
  // (góc i = điểm đầu cạnh i). Nơi gọi dùng 2 bảng này để dời đồ vật / đường chéo / mốc theo cạnh mới.
  function copyEdge(e) { var o = {}; for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) o[k] = e[k]; return o; }
  function winding(edges) { // >0: đi theo chiều kim đồng hồ trên màn hình (y xuống)
    var v = buildVertsLive(edges), s = 0;
    for (var i = 0; i < edges.length; i++) s += v[i].x * v[i + 1].y - v[i + 1].x * v[i].y;
    return s >= 0 ? 1 : -1;
  }
  function edgeLenNow(edges, i) { var v = buildVertsLive(edges); return Math.hypot(v[i + 1].x - v[i].x, v[i + 1].y - v[i].y); }
  function fromList(old, list) { // list = [{from:[chỉ số cũ...], e: cạnh}] -> kết quả + 2 bảng dời
    var n = old.length, edgeMap = [], cornerMap = [], out = [];
    for (var i = 0; i < n; i++) { edgeMap[i] = -1; cornerMap[i] = -1; }
    list.forEach(function (it, j) {
      out.push(it.e);
      it.from.forEach(function (o) { edgeMap[o] = j; });
      if (it.from.length) cornerMap[it.from[0]] = j;
    });
    return { edges: out, edgeMap: edgeMap, cornerMap: cornerMap };
  }
  // Cạnh i là GỜ khi hai cạnh kề cùng trục và cùng chiều (bậc thang). Chỉ gờ mới xoá/đảo được mà hình vẫn kín.
  function isStep(edges, i) {
    var n = edges.length; if (n < 6) return false;
    var p = edges[(i - 1 + n) % n], q = edges[(i + 1) % n];
    return p.axis === q.axis && p.sign === q.sign && edges[i].axis !== p.axis;
  }
  // Chèn 1 gờ vào giữa cạnh i: cạnh i tách thành [nửa đầu, gờ vuông góc, nửa sau] — cả 3 CHƯA CÓ SỐ.
  // inward=true: gờ thụt VÀO trong phòng; false: lồi RA ngoài.
  function insertStep(edges, i, inward) {
    var e = edges[i], wind = winding(edges), Lnow = edgeLenNow(edges, i);
    // pháp tuyến vào trong của cạnh (u = hướng cạnh): wind>0 -> (-uy, ux)
    var ux = e.axis === 'H' ? e.sign : 0, uy = e.axis === 'V' ? e.sign : 0;
    var nx = wind > 0 ? -uy : uy, ny = wind > 0 ? ux : -ux;
    if (!inward) { nx = -nx; ny = -ny; }
    var jog = { axis: e.axis === 'H' ? 'V' : 'H', sign: e.axis === 'H' ? ny : nx, len0: (e.len0 || 1) * 0.1, mm: null, est: Math.max(50, Math.round(Lnow * 0.06)) };
    var a = copyEdge(e), b = { axis: e.axis, sign: e.sign, len0: (e.len0 || 1) / 2, mm: null, est: Math.round(Lnow / 2) };
    a.len0 = (e.len0 || 1) / 2; a.mm = null; a.est = Math.round(Lnow / 2); delete a.total;
    var list = [];
    for (var k = 0; k < edges.length; k++) {
      if (k === i) { list.push({ from: [k], e: a }); list.push({ from: [], e: jog }); list.push({ from: [], e: b }); }
      else list.push({ from: [k], e: copyEdge(edges[k]) });
    }
    return fromList(edges, list);
  }
  // Đảo gờ i (vào <-> ra). Số đo giữ nguyên.
  function flipStep(edges, i) {
    var out = edges.map(copyEdge); out[i].sign = -out[i].sign;
    var m = edges.map(function (_, k) { return k; });
    return { edges: out, edgeMap: m, cornerMap: m.slice() };
  }
  // Xoá gờ i: bỏ cạnh i, gộp 2 cạnh kề (thẳng hàng) thành 1; có đủ số hai bên thì cộng lại.
  function deleteStep(edges, i) {
    var n = edges.length, p = (i - 1 + n) % n, q = (i + 1) % n, P = edges[p], Q = edges[q];
    var m = copyEdge(P);
    m.mm = (P.mm != null && Q.mm != null) ? Number(P.mm) + Number(Q.mm) : null;
    m.len0 = (P.len0 || 0) + (Q.len0 || 0);
    var lp = P.mm != null ? Number(P.mm) : P.est, lq = Q.mm != null ? Number(Q.mm) : Q.est;
    if (m.mm == null && lp != null && lq != null) m.est = lp + lq; else delete m.est;
    delete m.total;
    m.photos = (P.photos || []).concat(Q.photos || []);
    m.note = [P.note, Q.note].filter(Boolean).join(' · ');
    var list = [];
    for (var k = 0; k < n; k++) {
      if (k === i || k === q) continue;
      list.push(k === p ? { from: [p, q], e: m } : { from: [k], e: copyEdge(edges[k]) });
    }
    return fromList(edges, list);
  }

  // ---------- VỊ TRÍ TRONG PHÒNG — dùng chung app + plugin SketchUp (chuyển từ index.html 28/09) ----------
  // polyArea2: diện tích có dấu -> chiều quay đa giác, để biết phía TRONG mỗi cạnh (đúng cả phòng lõm chữ L).
  // edgeLine / inwardN: đường song song cạnh e lùi vào TRONG d (d=0 = trên cạnh); phía trong theo chiều quay, KHÔNG theo trọng tâm.
  // solveAnchorMM: giải 1 điểm neo (2 số đo tới góc/tường) -> toạ độ mm cùng hệ buildVertsLive; null nếu thiếu số / không giao.
  // zoneShapeMM: hộp trần dựng từ SỐ ĐO — band = dải chạy hết tường idx rộng w vào trong; rect = góc hộp cách tường dọc v.d
  //   và tường ngang h.d, cỡ sx (phương ngang) × sy (phương dọc), mở về phía TRONG tính từ 2 tường đó.
  // zoneVertsMM: vùng đã lưu -> đỉnh mm (vùng tự vẽ: bắt đầu tại điểm neo rồi áp từng cạnh, mm nếu có không thì len0).
  // objPosA: khoảng cách GÓC ĐẦU tường -> mép vật phía góc đó; đo từ góc cuối (toB) thì = dài tường − toB − rộng vật.
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function polyArea2(verts, n) { var s = 0; for (var i = 0; i < n; i++) { var a = verts[i], b = verts[(i + 1) % n]; s += a.x * b.y - b.x * a.y; } return s; }
  function edgeLine(verts, n, e, d, sign) {
    var A = verts[e], B = verts[(e + 1) % n], ux = B.x - A.x, uy = B.y - A.y, L = Math.hypot(ux, uy) || 1;
    ux /= L; uy /= L;
    var nx = sign > 0 ? -uy : uy, ny = sign > 0 ? ux : -ux;
    return { p: { x: A.x + d * nx, y: A.y + d * ny }, dir: { x: ux, y: uy } };
  }
  function anchorConstr(verts, n, sign, m) {
    var d = num(m.d);
    if (m.ref === 'edge') return { kind: 'line', line: edgeLine(verts, n, m.idx, d, sign) };
    return { kind: 'circle', C: verts[m.idx], r: d };
  }
  function anchorCandidates(c1, c2) {
    if (c1.kind === 'circle' && c2.kind === 'circle') {
      return [triangulate(c1.C, c2.C, c1.r, c2.r, 1), triangulate(c1.C, c2.C, c1.r, c2.r, -1)].filter(Boolean);
    }
    if (c1.kind === 'line' && c2.kind === 'line') { var p = lineLineIntersect(c1.line.p, c1.line.dir, c2.line.p, c2.line.dir); return p ? [p] : []; }
    var ln = c1.kind === 'line' ? c1 : c2, cir = c1.kind === 'line' ? c2 : c1;
    return lineCircleIntersect(ln.line.p, ln.line.dir, cir.C, cir.r);
  }
  function solveAnchorMM(r, A) {
    if (!A || !A.m) return null;
    if (!A.m[0].set || !A.m[1].set) return null;
    if (num(A.m[0].d) == null || num(A.m[1].d) == null) return null;
    var n = r.edges.length;
    if (A.m[0].idx >= n || A.m[1].idx >= n) return null; // mốc trỏ vào góc/cạnh không còn (hình đã vẽ lại)
    var verts = buildVertsLive(r.edges), sign = polyArea2(verts, n);
    var cands = anchorCandidates(anchorConstr(verts, n, sign, A.m[0]), anchorConstr(verts, n, sign, A.m[1]));
    if (!cands.length) return null;
    // 2 nghiệm: mặc định lấy nghiệm TRONG phòng (side>=0); "Đổi phía" lấy nghiệm còn lại.
    cands.sort(function (p, q) {
      var ip = insidePolygon(p, verts, n) ? 0 : 1, iq = insidePolygon(q, verts, n) ? 0 : 1;
      return (ip - iq) || (p.x - q.x) || (p.y - q.y);
    });
    return A.side >= 0 ? cands[0] : (cands[1] || cands[0]);
  }
  function insideRoomMM(r, p) { return insidePolygon(p, buildVertsLive(r.edges), r.edges.length, 5); }
  function inwardN(verts, n, e, sign) {
    var A = verts[e], B = verts[(e + 1) % n], ux = B.x - A.x, uy = B.y - A.y, L = Math.hypot(ux, uy) || 1;
    ux /= L; uy /= L; return sign > 0 ? { x: -uy, y: ux } : { x: uy, y: -ux };
  }
  function zoneShapeMM(r, z) {
    var n = r.edges.length, v = buildVertsLive(r.edges), sign = polyArea2(v, n);
    if (z.band) {
      var i = Number(z.band.idx), w = num(z.band.w); if (!(i < n) || !(w > 0)) return null;
      var nb = inwardN(v, n, i, sign), A = v[i], B = v[i + 1];
      return [{ x: A.x, y: A.y }, { x: B.x, y: B.y }, { x: B.x + nb.x * w, y: B.y + nb.y * w }, { x: A.x + nb.x * w, y: A.y + nb.y * w }];
    }
    var R = z.rect, iv = Number(R.v.idx), ih = Number(R.h.idx), dv = num(R.v.d), dh = num(R.h.d), sx = num(R.sx), sy = num(R.sy);
    if (!(iv < n) || !(ih < n) || edgeAxis(r, iv) !== 'V' || edgeAxis(r, ih) !== 'H' || dv == null || dh == null || !(sx > 0) || !(sy > 0)) return null;
    var nv = inwardN(v, n, iv, sign), nh = inwardN(v, n, ih, sign);
    var c = { x: v[iv].x + nv.x * dv, y: v[ih].y + nh.y * dh };
    return [c, { x: c.x + nv.x * sx, y: c.y }, { x: c.x + nv.x * sx, y: c.y + nh.y * sy }, { x: c.x, y: c.y + nh.y * sy }];
  }
  function zoneVertsMM(r, z) {
    if (z.rect || z.band) return zoneShapeMM(r, z);
    if (!z.edges || !z.start) return null; // vùng cũ (lưu px)
    var start = (z.anchors && solveAnchorMM(r, z.anchors[0])) || z.start;
    var pts = [{ x: start.x, y: start.y }];
    z.edges.forEach(function (e) {
      var L = e.mm != null ? Number(e.mm) : e.len0, last = pts[pts.length - 1];
      pts.push(e.axis === 'H' ? { x: last.x + e.sign * L, y: last.y } : { x: last.x, y: last.y + e.sign * L });
    });
    return pts.slice(0, z.edges.length);
  }
  function edgeAxis(r, i) { return r.edges[i] ? r.edges[i].axis : null; }
  function objPosA(o, L) {
    if (o.fromA != null) return Number(o.fromA);
    if (o.toB != null && L != null) return Number(L) - Number(o.toB) - (num(o.w) || 0);
    return null;
  }

  // Khoa chốt 28/09: MỌI vị trí đo bằng khoảng cách tới 2 CẠNH (mặt tường), không từ góc.
  // Điểm p (mm, trong phòng) -> neo "cách tường dọc d1 + cách tường ngang d2" chỉ đúng CHỖ đó.
  // Chọn tường cùng trục mà p nằm ngay trước mặt (chiếu vuông góc rơi trên tường) và ở phía TRONG, gần nhất.
  // Dùng để đổi vị trí cũ đo theo góc sang đo theo cạnh mà không dời vật. Không giải lại khớp (±1mm) thì trả null.
  function wallAnchorFromPoint(r, p) {
    if (!p) return null;
    var n = r.edges.length, v = buildVertsLive(r.edges), sign = polyArea2(v, n);
    if (!insidePolygon(p, v, n, 5)) return null; // vị trí cũ đã nằm NGOÀI phòng = dữ liệu sai: không tự đổi, để app báo đo lại
    function pick(axis) {
      var best = null;
      for (var pass = 0; pass < 2 && !best; pass++) {
        for (var i = 0; i < n; i++) {
          if (r.edges[i].axis !== axis) continue;
          var a = v[i], b = v[i + 1], q = inwardN(v, n, i, sign);
          var d = (p.x - a.x) * q.x + (p.y - a.y) * q.y;     // khoảng cách vào TRONG tính từ mặt tường
          var lo = axis === 'V' ? Math.min(a.y, b.y) : Math.min(a.x, b.x), hi = axis === 'V' ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
          var t = axis === 'V' ? p.y : p.x;
          if (d < -0.5 || (pass === 0 && (t < lo - 0.5 || t > hi + 0.5))) continue;
          if (!best || d < best.d) best = { idx: i, d: d };
        }
      }
      return best;
    }
    var bv = pick('V'), bh = pick('H');
    if (!bv || !bh) return null;
    var A = { m: [{ ref: 'edge', idx: bv.idx, d: String(Math.round(Math.max(0, bv.d))), set: true },
                  { ref: 'edge', idx: bh.idx, d: String(Math.round(Math.max(0, bh.d))), set: true }], side: 1 };
    var q2 = solveAnchorMM(r, A);
    return q2 && Math.hypot(q2.x - p.x, q2.y - p.y) <= 1 ? A : null;
  }
  // Vùng tự vẽ: bao nhiêu cạnh CHƯA có số đo thật (đang lấy theo nét vẽ tay). Hộp chữ nhật / dải: 0.
  function zoneUnmeasured(z) { return z && !z.rect && !z.band && z.edges ? z.edges.filter(function (e) { return e.mm == null; }).length : 0; }

  // ---------- TIM hay MÉP (Khoa 30/09 sau buổi đo thật) ----------
  // Ngoài công trình lúc đo tới tim vật, lúc đo tới mép — tuỳ chỗ thước bám được. Số người đo giữ NGUYÊN ở
  // o.raw (đồ tường) / m.raw (mốc đồ trần, sàn); app quy ra SỐ CHUẨN để mọi chỗ khác (mặt đứng, 3D, DXF) dùng như cũ:
  //   đồ tường: fromA / toB = tới MÉP vật, h = sàn tới ĐÁY vật  -> đo tới tim thì TRỪ nửa rộng / nửa cao vật
  //   đồ trần, sàn: mốc d = tường tới TÂM vật                  -> đo tới mép thì CỘNG nửa cỡ theo phương đo
  //   (cách tường dọc = phương ngang hình -> nửa DÀI; cách tường ngang -> nửa RỘNG — khớp ô dài×rộng trên hình)
  // Chưa có cỡ vật thì nửa cỡ = 0: tim và mép trùng nhau (app nhắc thiếu cỡ). Không có cờ = số cũ, giữ nguyên.
  function half(v) { var n = num(v); return n > 0 ? n / 2 : 0; }
  function fix1(x) { return Math.round(x * 10) / 10; }
  function normPos(r, o) {
    var at = o.at || {}, raw = o.raw || {};
    if (at.x === 'tim') ['fromA', 'toB'].forEach(function (f) { var v = num(raw[f]); o[f] = v == null ? null : fix1(v - half(o.w)); });
    if (at.y === 'tim') { var hv = num(raw.h); o.h = hv == null ? null : fix1(hv - half(o.oh)); }
    if (r && o.anchor && o.anchor.m) o.anchor.m.forEach(function (m) {
      if (m.at !== 'mep') return;
      var v = num(m.raw);
      m.d = v == null ? '' : String(fix1(v + (edgeAxis(r, m.idx) === 'V' ? half(o.len) : half(o.w))));
    });
    return o;
  }

  // Đồ trần nằm LỌT trong viền 1 hộp trần (hộp hạ thấp hơn trần) thì gắn vào ĐÁY hộp, không phải trần chính
  // (Khoa 30/09: báo cháy nằm dưới hộp). Hộp lồng hộp: lấy hộp THẤP nhất chứa vật. force = 'tran': người đo ép
  // gắn trần chính (vật sát mép hộp app dễ hiểu nhầm). Hộp còn cạnh chưa đo / thiếu cao độ: bỏ qua như khi dựng 3D.
  function ceilMount(r, p, H, force) {
    if (!p || force === 'tran') return null;
    var best = null;
    (r.zones || []).forEach(function (z, ix) {
      var h = num(z.height); if (!(h > 0) || (H != null && h >= H) || zoneUnmeasured(z)) return;
      var pts = zoneVertsMM(r, z); if (!pts || pts.length < 3 || !insidePolygon(p, pts, pts.length, 2)) return;
      if (!best || h < best.h) best = { z: z, ix: ix, h: h };
    });
    return best;
  }

  // Đồ gắn trên MẶT ĐỨNG hộp trần (sprinkler vách hộp, Khoa 30/09). f = { z: id hộp, k: số cạnh hộp, wall: tường
  // phòng VUÔNG GÓC với cạnh đó, d: tường -> tim vật (đo dọc theo mặt hộp), h: sàn -> tim vật }.
  // Điểm = giao của cạnh hộp với đường lùi d từ tường; vật quay PHÁP TUYẾN RA NGOÀI hộp (về phía trần cao hơn).
  // Trả { p, u (hướng dọc cạnh), out, zone, ix, bot (cao đáy hộp), onEdge } hoặc null (thiếu số / tường song song cạnh).
  function facePoint(r, f) {
    if (!f) return null;
    var z = null, ix = -1;
    (r.zones || []).forEach(function (q, i) { if (q.id === f.z) { z = q; ix = i; } });
    if (!z) return null;
    var pts = zoneVertsMM(r, z), k = Number(f.k), d = num(f.d), wi = Number(f.wall), n = r.edges.length;
    if (!pts || pts.length < 3 || !(k >= 0 && k < pts.length) || d == null || !(wi >= 0 && wi < n)) return null;
    var nz = pts.length, A = pts[k], B = pts[(k + 1) % nz], L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 1) return null;
    var u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
    var v = buildVertsLive(r.edges), wl = edgeLine(v, n, wi, d, polyArea2(v, n));
    if (Math.abs(u.x * wl.dir.y - u.y * wl.dir.x) < 0.5) return null; // tường song song mặt hộp: không cắt
    var p = lineLineIntersect(A, u, wl.p, wl.dir); if (!p) return null;
    var t = (p.x - A.x) * u.x + (p.y - A.y) * u.y, inn = inwardN(pts, nz, k, polyArea2(pts, nz));
    return { p: p, u: u, out: { x: -inn.x, y: -inn.y }, zone: z, ix: ix, bot: num(z.height), onEdge: t >= -2 && t <= L + 2 };
  }
  // Vị trí mặt bằng (mm) của 1 đồ trần / sàn: mặt đứng hộp -> điểm trên cạnh hộp, còn lại -> neo 2 tường.
  function ceilObjPos(r, o) {
    if (o.face) { var fp = facePoint(r, o.face); return fp ? fp.p : null; }
    return o.anchor ? solveAnchorMM(r, o.anchor) : null;
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

  // Điểm p có nằm TRONG đa giác (n đỉnh đầu của verts) không. Nằm trên cạnh (cách ≤ tol) cũng tính là trong.
  function insidePolygon(p, verts, n, tol) {
    tol = tol == null ? 1 : tol;
    for (var e = 0; e < n; e++) if (perpDistance(p, verts[e], verts[(e + 1) % n]) <= tol) return true;
    var inside = false;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var a = verts[i], b = verts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
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
    insidePolygon: insidePolygon,
    simplifyRDP: simplifyRDP,
    fitTransformScreen: fitTransformScreen,
    polyArea2: polyArea2,
    edgeLine: edgeLine,
    anchorConstr: anchorConstr,
    anchorCandidates: anchorCandidates,
    solveAnchorMM: solveAnchorMM,
    insideRoomMM: insideRoomMM,
    inwardN: inwardN,
    zoneShapeMM: zoneShapeMM,
    zoneVertsMM: zoneVertsMM,
    edgeAxis: edgeAxis,
    objPosA: objPosA,
    wallAnchorFromPoint: wallAnchorFromPoint,
    zoneUnmeasured: zoneUnmeasured,
    normPos: normPos,
    ceilMount: ceilMount,
    facePoint: facePoint,
    ceilObjPos: ceilObjPos,
    isStep: isStep,
    insertStep: insertStep,
    flipStep: flipStep,
    deleteStep: deleteStep,
    winding: winding
  };
});
