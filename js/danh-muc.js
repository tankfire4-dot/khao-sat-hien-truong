/* Danh mục loại đồ của app khảo sát — dùng chung app (index.html) + plugin SketchUp (dung3d.js).
   Tách khỏi index.html 28/09 để tên loại đồ chỉ sống MỘT chỗ.
   `dep` (30/09) = SÂU: vật nhô ra khỏi mặt tường bao nhiêu; riêng hốc là lõm VÀO tường. Luôn tuỳ chọn.
   `nho` (01/10) = loại vật cùng mẫu trong 1 công trình (ổ điện, ổ mạng, đèn...): tạo cái mới thì app điền sẵn CỠ
   theo cái cùng loại đo gần nhất. Cửa, hốc, dầm, cột, "Khác" mỗi cái một cỡ nên không có. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DanhMuc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KINDS = {
    outlet: { ten: 'Ổ điện', ic: '▣', f: ['fromA', 'w', 'oh', 'dep', 'h', 'toB'], nho: 1 },
    switchx: { ten: 'Công tắc', ic: '⊟', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    data: { ten: 'Ổ mạng', ic: '▦', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    tv: { ten: 'Đầu TV', ic: '▷', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    water: { ten: 'Cấp nước', ic: '◉', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    drain: { ten: 'Thoát nước', ic: '◍', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    ac: { ten: 'Máy lạnh', ic: '❄︎', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    door: { ten: 'Cửa', ic: '⊓', f: ['fromA', 'w', 'doorH'], floor: true },
    window: { ten: 'Cửa sổ', ic: '⊞', f: ['fromA', 'w', 'sill', 'head'] },
    niche: { ten: 'Hốc', ic: '▭', f: ['fromA', 'w', 'bottom', 'top', 'dep'] },
    panel: { ten: 'Tủ điện', ic: '▤', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    camera: { ten: 'Camera', ic: '◎', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    wlight: { ten: 'Đèn tường', ic: '☀︎', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    wsprink: { ten: 'Sprinkler', ic: '✻︎', f: ['fromA', 'w', 'oh', 'dep', 'h'], nho: 1 },
    beam: { ten: 'Dầm', ic: '▬', f: ['w', 'bottom'], ceil: true },
    wother: { ten: 'Khác', ic: '•', f: ['fromA', 'w', 'oh', 'dep', 'h'] }   // vật lạ: tên ghi ở ô Ghi chú
  };
  var CKINDS = {
    beam: { ten: 'Dầm', ic: '▬', hasBottom: true },
    clight: { ten: 'Đèn', ic: '☀︎', nho: 1 },
    cassette: { ten: 'Máy lạnh', ic: '❄︎', nho: 1 },
    vent: { ten: 'Miệng gió', ic: '≋', nho: 1 },
    sprinkler: { ten: 'Sprinkler', ic: '◉', nho: 1 },
    smoke: { ten: 'Báo cháy', ic: '◎', nho: 1 },
    fan: { ten: 'Quạt', ic: '✳︎', nho: 1 },
    curtain: { ten: 'Rèm âm', ic: '▤' },
    techbox: { ten: 'Hộp KT', ic: '▢' },
    powerpt: { ten: 'Chờ điện', ic: '↯', nho: 1 },
    cother: { ten: 'Khác', ic: '•' }
  };
  var FKINDS = {
    fdrain: { ten: 'Thoát sàn', ic: '◍', nho: 1 },
    fwater: { ten: 'Cấp nước', ic: '◉', nho: 1 },
    foutlet: { ten: 'Ổ điện sàn', ic: '▣', nho: 1 },
    column: { ten: 'Cột / trụ', ic: '▮' },
    shaft: { ten: 'Hộp gen', ic: '▢' },
    fstep: { ten: 'Bậc / cốt sàn', ic: '▭' },
    fother: { ten: 'Khác', ic: '•' }
  };
  return { KINDS: KINDS, CKINDS: CKINDS, FKINDS: FKINDS };
});
