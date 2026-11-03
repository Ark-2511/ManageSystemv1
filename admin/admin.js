/* =====================================================================
   TRANG QUẢN LÝ CỦA CHỦ QUÁN
   Giao diện kính (Glass): đăng nhập, khung điều hướng bên trái, Tổng quan, Kho.
   #home   : Tổng quan (doanh thu, đơn, chuyển khoản cần xem, màn hình quầy) — hàm admin_dashboard
   #troly  : Trợ lý AI (mới có giao diện, hỏi thì báo "chưa hoàn thiện")
   #menu   : bảng menu kiểu Excel theo thiết kế "Sửa menu" (tên, ảnh, giá, ghi chú, khẩu vị, đường đá, thành phần)
   #kho    : bảng kho nguyên liệu (nhập thêm, đếm thực tế, báo sắp hết)
   #chuyenkhoan : tra mã nhận đồ (tiền đã về chưa), xử lý khoản chuyển khoản cần xem lại
   Các mục chưa làm trên thanh bên chỉ hiện thông báo "đang làm".
   Mọi thao tác ghi đều qua hàm trong database (admin_save_menu, admin_save_stock),
   database tự kiểm tra quyền và dữ liệu.
   Xác thực 2 lớp (mã 6 số, TOTP): bật ở nút khiên cạnh tên tài khoản; đã bật thì sau mật khẩu phải nhập mã.
   ===================================================================== */
(function () {
  'use strict';
  /* Không cho trang khác nhúng trang quản lý vào khung (chống lừa bấm nút — clickjacking) */
  if (window.top !== window.self) {
    document.body.textContent = 'Trang quản lý không mở được bên trong trang khác. Hãy mở trực tiếp trên trình duyệt.';
    return;
  }
  var SB_URL = 'https://mzzkohjxjammpihakwbz.supabase.co';
  var SB_KEY = 'sb_publishable_1Or6VXIVbaTN7li0oDe5kA_-1aQJWuX';
  var BUCKET = 'menu-images';
  var LOCAL_IMG = '../assets/picture/';
  /* storageKey riêng: đăng nhập ở đây không ảnh hưởng màn hình quầy mở trên cùng trình duyệt */
  /* "Ghi nhớ trên máy này": bật = lưu phiên lâu dài, tắt = đóng trình duyệt là phải đăng nhập lại */
  function remember() { try { return localStorage.getItem('quanly-remember') !== '0' } catch (e) { return true } }
  function setRemember(on) { try { localStorage.setItem('quanly-remember', on ? '1' : '0') } catch (e) {} }
  var authStore = {
    getItem: function (k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k) } catch (e) { return null } },
    setItem: function (k, v) {
      try { if (remember()) { localStorage.setItem(k, v); sessionStorage.removeItem(k) } else { sessionStorage.setItem(k, v); localStorage.removeItem(k) } } catch (e) {}
    },
    removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k) } catch (e) {} }
  };
  var sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { storageKey: 'quanly-auth', storage: authStore, persistSession: true, autoRefreshToken: true }
  });

  var app = document.getElementById('app');
  var S = { user: null, shops: [], shop: null, dirty: false, lastHash: '', skipHash: false, menu: null, stock: null };
  var UNIT = { g: 'g', ml: 'ml', piece: 'cái' };
  var STEPS = [0, 30, 50, 70, 100];
  var BARS = [['d', 'Độ đậm'], ['n', 'Độ ngọt'], ['y', 'Độ ngậy']];

  /* ---------------- tiện ích ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function errMsg(e) { return (e && (e.message || e.error_description)) || String(e) }
  function rpc(name, args) {
    return sb.rpc(name, args).then(function (r) { if (r.error) throw r.error; return r.data });
  }
  var toastT;
  function toast(msg, bad) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'on' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = '' }, bad ? 7000 : 3500);
  }
  function money(n) { return n == null || n === '' ? '' : Number(n).toLocaleString('vi-VN') }
  function qty(n) { return n == null || n === '' ? '' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 3 }) }
  function digits(s) { return String(s == null ? '' : s).replace(/[^\d]/g, '') }
  /* Đọc số lượng: "1.000" = một nghìn, "1,5" hoặc "1.5" = một rưỡi */
  function parseQty(s) {
    s = String(s == null ? '' : s).trim().replace(/\s/g, '');
    if (s === '') return null;
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
    if (/^\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
    return NaN;
  }
  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function imgUrl(p) {
    if (!p) return '';
    return p.indexOf('/') >= 0 ? SB_URL + '/storage/v1/object/public/' + BUCKET + '/' + p : LOCAL_IMG + p;
  }
  function setDirty(on) {
    S.dirty = on;
    var st = document.getElementById('st');
    if (st) { st.textContent = on ? '● Có thay đổi chưa lưu' : 'Đã lưu hết'; st.className = 'st' + (on ? ' dirty' : '') }
    if (on && document.getElementById('mPill')) menuStatus('dirty');   /* bảng Menu: nhãn trạng thái */
  }
  var ICON = {
    menu: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5"/></svg>',
    manage: '<svg viewBox="0 0 24 24"><path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19h16 M7 16V9 M12 16V5 M17 16v-4"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1"/></svg>',
    off: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/></svg>',
    bill: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5 M16 4.5a3.5 3.5 0 0 1 0 7 M18 14.5c2 .6 3.2 2.5 3.5 5.5"/></svg>',
    screen: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8 M12 16v4"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 7v5l3 2"/></svg>'
  };

  /* ---------------- điều hướng ---------------- */
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = '' } });
  window.addEventListener('hashchange', function () {
    if (S.skipHash) { S.skipHash = false; return }
    if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Bỏ các thay đổi đó và rời trang?')) {
      S.skipHash = true; location.hash = S.lastHash; return;
    }
    setDirty(false); route();
  });
  function go(h) { if (location.hash === '#' + h) route(); else location.hash = h }
  function route() {
    dockOff();                            /* nút "Hỏi trợ lý" chỉ có ở Tổng quan */
    if (!S.user) return viewLogin();
    if (S.needMfa) return viewMfa();      /* đã bật xác thực 2 lớp: nhập mã 6 số trước */
    if (!S.shop) return viewNoShop();
    var h = location.hash.replace('#', '') || 'home';
    if (h === 'quanly') h = 'kho';
    if (!READY[h]) h = 'home';            /* mục chưa làm: về Tổng quan */
    S.lastHash = '#' + h;
    if (h !== 'home') stopLive();
    document.body.className = 'glass';
    ({ home: viewHome, troly: viewAI, menu: viewMenu, kho: viewStock, nhatky: viewLog, manhinh: viewTerm, chuyenkhoan: viewTransfers })[h]();
  }

  /* Thanh trên kiểu cũ (nền sáng): không còn trang nào dùng, giữ lại phòng khi cần */
  function topbar() {
    var sel = S.shops.length > 1
      ? '<select id="shopSel">' + S.shops.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === S.shop.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join('') + '</select>'
      : '<span class="shop">' + esc(S.shop ? S.shop.name : '') + '</span>';
    return '<header class="top"><a class="brand" href="#home">Quản lý quán</a>' + sel +
      '<span class="sp"></span><span class="who">' + esc(S.user.email || '') + '</span>' +
      '<button id="logout" type="button">Đăng xuất</button></header>';
  }
  function bindTop() {
    var lo = document.getElementById('logout');
    if (lo) lo.onclick = function () {
      if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Vẫn đăng xuất?')) return;
      logout();
    };
    var ss = document.getElementById('shopSel');
    if (ss) ss.onchange = function () {
      if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Vẫn đổi quán?')) { ss.value = S.shop.id; return }
      setDirty(false); S.counts = null; S.dash = null;
      S.shop = S.shops.filter(function (s) { return s.id === ss.value })[0];
      try { localStorage.setItem('quanly-shop', S.shop.id) } catch (e) {}
      route();
    };
  }


  /* =====================================================================
     GIAO DIỆN KÍNH (Glass): đăng nhập, khung điều hướng, Tổng quan
     ===================================================================== */
  var ACCENT = '#CC3B18';
  function soon(name) { toast('“' + name + '” đang được làm, sẽ có trong bản sau.') }
  var GI = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    cup: '<path d="M4 9h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M3 21h15"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    save: '<path d="M5 12l5 5 9-10"/>',
    trend: '<path d="M4 17l5-5 4 4 7-7"/><path d="M15 9h5v5"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 11l2 2 4-4"/>',
    wait: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    down: '<path d="M7 10l5 5 5-5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2.5 12C3.5 10.5 7 6 12 6s8.5 4.5 9.5 6c-1 1.5-4.5 6-9.5 6s-8.5-4.5-9.5-6z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c5 0 8.5 4.5 9.5 6a15 15 0 0 1-3.2 3.6M6.4 7.6A15 15 0 0 0 2.5 12c1 1.5 4.5 6 9.5 6a9 9 0 0 0 3.6-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    spin: '<path d="M12 3a9 9 0 1 0 9 9"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    phone: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    redo: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
    okc: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    spark: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    ext: '<path d="M14 4h6v6M20 4l-8 8M10 5H5v14h14v-5"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'
  };
  function ic(name, size, extra) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + GI[name] + '</svg>';
  }
  /* Nền đa giác tối + quầng sáng (dùng chung cho mọi trang kính) */
  function bgSvg(glowA, glowB) {
    var P = ['0,0 420,0 300,220 0,160|#14161B', '420,0 860,0 700,180 300,220|#0F1115', '860,0 1180,0 1040,260 700,180|#181B21',
      '1180,0 1440,0 1440,300 1040,260|#0D0E12', '0,160 300,220 220,520 0,480|#101216', '300,220 700,180 620,460 220,520|#1A1D23',
      '700,180 1040,260 980,540 620,460|#0E1014', '1040,260 1440,300 1440,600 980,540|#16191E', '0,480 220,520 160,820 0,780|#181B20',
      '220,520 620,460 560,760 160,820|#0D0F12', '620,460 980,540 900,820 560,760|#15181D', '980,540 1440,600 1440,900 900,820|#101317',
      '0,780 160,820 120,1000 0,1000|#0E1013', '160,820 560,760 520,1000 120,1000|#171A1F', '560,760 900,820 880,1000 520,1000|#0F1115',
      '900,820 1440,900 1440,1000 880,1000|#14171C'];
    return '<svg class="gx-bg" aria-hidden="true" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice"><defs>' +
      '<radialGradient id="gxA" cx="' + glowA[1] + '" cy="' + glowA[2] + '" r="0.45"><stop offset="0" stop-color="' + glowA[0] + '" stop-opacity="0.2"/><stop offset="1" stop-color="' + glowA[0] + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="gxB" cx="' + glowB[1] + '" cy="' + glowB[2] + '" r="0.5"><stop offset="0" stop-color="' + glowB[0] + '" stop-opacity="0.13"/><stop offset="1" stop-color="' + glowB[0] + '" stop-opacity="0"/></radialGradient></defs>' +
      '<g stroke="rgba(255,255,255,0.06)" stroke-width="1">' + P.map(function (p) { var a = p.split('|'); return '<polygon points="' + a[0] + '" fill="' + a[1] + '"/>' }).join('') + '</g>' +
      '<g stroke="rgba(255,255,255,0.13)" stroke-width="1" fill="none"><path d="M300 220 L620 460 L900 820"/><path d="M700 180 L1040 260 L1440 300"/><path d="M220 520 L160 820"/></g>' +
      '<rect width="1440" height="1000" fill="url(#gxA)"/><rect width="1440" height="1000" fill="url(#gxB)"/></svg>';
  }
  function short(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tỷ';
    if (n >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  }
  function pct(a, b) { return b > 0 ? Math.round((a - b) / b * 100) : null }
  function trendPill(p, suffix) {
    if (p == null) return '';
    var up = p >= 0;
    return '<span class="gx-pill ' + (up ? 'ok' : 'bad') + '">' + (up ? '▲ ' : '▼ ') + Math.abs(p) + '%' + '</span><span class="gx-muted">' + suffix + '</span>';
  }

  /* =====================================================================
     XÁC THỰC 2 LỚP (mã 6 số từ ứng dụng trên điện thoại, chuẩn TOTP — miễn phí)
     - Tài khoản đã bật: sau mật khẩu phải nhập mã, database mới mở quyền quản lý (phiên "aal2").
     - Bốn việc nguy hiểm (tạo link màn hình quầy, xác nhận thanh toán tay, hoàn tiền,
       đổi tài khoản nhận tiền) luôn cần đã bật và đã nhập mã — database tự chặn.
     - Bật / thêm thiết bị dự phòng / gỡ: nút khiên cạnh tên tài khoản.
     ===================================================================== */
  var MFA_ISSUER = 'Way Up';
  (function secCss() {
    var css = '.sec-dot{position:absolute;top:.45rem;right:.45rem;width:.5rem;height:.5rem;border-radius:50%;background:var(--g-warn);box-shadow:0 0 0 2px rgba(20,22,27,.9)}' +
      '.sec-dlg{max-width:32rem}' +
      '.sec-dlg .gx-dlg-i.ok{background:rgba(52,211,153,.12);color:var(--g-ok)}' +
      '.sec-dlg .gx-dlg-i.info{background:rgba(79,163,255,.12);color:var(--g-info)}' +
      '.sec-dlg ol{margin:0;padding-left:1.2rem;display:flex;flex-direction:column;gap:.85rem;font-size:.875rem;line-height:1.55;color:var(--g-text2)}' +
      '.sec-qr{display:flex;flex-wrap:wrap;align-items:center;gap:1rem;margin-top:.6rem}' +
      '.sec-qr img{width:11rem;height:11rem;padding:.6rem;border-radius:14px;background:#fff;box-sizing:border-box}' +
      '.sec-key{display:flex;flex-direction:column;gap:.4rem;min-width:0;flex:1 1 12rem;font-size:.8rem;color:var(--g-muted)}' +
      '.sec-key code{display:block;padding:.55rem .7rem;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid var(--g-line);color:var(--g-text);font-size:.85rem;letter-spacing:.06em;word-break:break-all;user-select:all}' +
      '.sec-key .gx-btn{align-self:flex-start;min-height:2.5rem;font-size:.8rem}' +
      '.sec-code{font-size:1.35rem !important;letter-spacing:.45em;font-variant-numeric:tabular-nums}' +
      '.sec-err{font-size:.82rem;color:var(--g-bad);min-height:1.2em;margin:.35rem 0 0}' +
      '.sec-dlg ul.sec-list{display:flex;flex-direction:column;gap:.5rem;margin:0;padding:0;list-style:none}' +
      '.gx-input input.sec-code{outline:none !important;box-shadow:none !important;border:0 !important}' +
      '.sec-list li{display:flex;align-items:center;gap:.75rem;padding:.6rem .75rem;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--g-line)}' +
      '.sec-list li > span{color:var(--g-muted2);display:flex}' +
      '.sec-list li div{flex:1;min-width:0;display:flex;flex-direction:column}' +
      '.sec-list b{font-size:.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sec-list small{font-size:.75rem;color:var(--g-muted2)}' +
      '.sec-list .gx-btn{min-height:2.5rem;font-size:.8rem;padding:0 .8rem}' +
      '.sec-tip{display:flex;gap:.6rem;align-items:flex-start;padding:.7rem .85rem;border-radius:12px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);font-size:.82rem;line-height:1.5;color:var(--g-text2)}' +
      '.sec-tip svg{flex:none;color:var(--g-warn);margin-top:.1rem}' +
      '.gx-input select{flex:1;min-width:0;min-height:2.75rem;background:transparent;border:0;outline:none;color:var(--g-text);font-size:.95rem}' +
      '.gx-input select option{color:#111}';
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  })();

  function mfaErr(e) {
    var m = errMsg(e);
    if (/invalid totp|verification failed|mfa_verification_failed|invalid code/i.test(m)) return 'Mã không đúng hoặc đã hết hạn. Xem mã mới trên điện thoại rồi nhập lại.';
    if (/too many|rate limit|429/i.test(m)) return 'Nhập sai quá nhiều lần. Đợi khoảng 1 phút rồi thử lại.';
    if (/challenge.*expired|expired/i.test(m)) return 'Phiên nhập mã đã hết hạn. Thử lại.';
    if (/aal2/i.test(m)) return 'Cần nhập mã 6 số trước khi làm việc này. Đăng xuất rồi đăng nhập lại.';
    if (/failed to fetch|network/i.test(m)) return 'Mất mạng. Kiểm tra kết nối rồi thử lại.';
    return m;
  }
  function needs2fa(e) { return /xác thực 2 lớp/i.test(errMsg(e)) }
  function totpFactors(all) {
    return (all || []).filter(function (f) { return f.factor_type === 'totp' && f.status === 'verified' });
  }
  /* Đọc mức xác thực của phiên hiện tại (không cần mạng: đọc từ phiên đã lưu) */
  function mfaLevel() {
    return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      if (r.error) throw r.error;
      S.aal = r.data.currentLevel;
      S.mfaOn = r.data.nextLevel === 'aal2';
      S.needMfa = S.mfaOn && r.data.currentLevel !== 'aal2';
    });
  }
  /* Sau khi có phiên đăng nhập: cần nhập mã thì dừng ở màn nhập mã, chưa tải danh sách quán */
  function afterAuth() {
    return mfaLevel().then(function () {
      if (S.needMfa) return;
      return loadShops().then(function () {
        if (S.shops.length) return;
        /* Không thấy quán nào: có thể tài khoản vừa bật xác thực 2 lớp ở máy khác mà phiên lưu trên máy này
           chưa biết. Làm mới phiên để lấy danh sách thiết bị xác thực mới nhất rồi kiểm tra lại. */
        return sb.auth.refreshSession().then(function (r) {
          if (r.error || !r.data || !r.data.session) return;
          S.user = r.data.session.user || S.user;
          return mfaLevel().then(function () { if (!S.needMfa) return loadShops() });
        });
      });
    });
  }
  function dmy(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  function digits6(i) { i.value = i.value.replace(/\D/g, '').slice(0, 6); return i.value }

  /* ---------------- màn nhập mã sau mật khẩu ---------------- */
  function viewMfa(state) {
    state = state || {};
    document.body.className = 'glass';
    var mail = (S.user && S.user.email) || '';
    var fs = totpFactors(S.user && S.user.factors);
    var fid = state.fid || (fs[0] && fs[0].id);
    app.innerHTML = '<div class="gx gx-login">' + bgSvg(['#4FA3FF', 0.5, 0.45], [ACCENT, 0.12, 0.1]) +
      '<div class="gx-brand-c"><img src="logo.webp" alt="Logo Way Up" class="gx-logo-lg"><div class="gx-brand-t"><b>Way Up</b><span>Trang quản lý</span></div></div>' +
      '<div class="gx-lframe"><div class="gx-lborder"><form class="gx-lform g" id="mf" novalidate>' +
        '<div class="gx-lhead"><h1>Nhập <span>mã 6 số</span></h1><p>Mở ứng dụng xác thực trên điện thoại và nhập mã đang hiện cho <b>' + MFA_ISSUER + '</b> · ' + esc(mail) + '.</p></div>' +
        (state.error ? '<div class="gx-alert" role="alert">' + ic('alert', 18) + '<span>' + esc(state.error) + '</span></div>' : '') +
        (fs.length > 1 ? '<div class="gx-field"><label for="mfDev">Thiết bị</label><div class="gx-input">' + ic('phone') +
          '<select id="mfDev">' + fs.map(function (f) {
            return '<option value="' + esc(f.id) + '"' + (f.id === fid ? ' selected' : '') + '>' + esc(f.friendly_name || 'Thiết bị') + '</option>';
          }).join('') + '</select></div></div>' : '') +
        '<div class="gx-field"><label for="mfCode">Mã xác thực</label><div class="gx-input' + (state.error ? ' err' : '') + '">' + ic('lock') +
          '<input id="mfCode" class="sec-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-describedby="mfHelp" required></div></div>' +
        '<button type="submit" class="gx-submit" id="mfB"><span>Xác nhận</span>' + ic('arrow', 18) + '</button>' +
        '<p class="gx-foot-p" id="mfHelp">Mất điện thoại? Chọn thiết bị dự phòng nếu đã thêm. Nếu không còn thiết bị nào, liên hệ Way Up để được gỡ xác thực 2 lớp sau khi xác minh chủ tài khoản.</p>' +
        '<button type="button" class="gx-link" id="mfOut" style="align-self:center">Đăng xuất, dùng tài khoản khác</button>' +
      '</form></div></div><p class="gx-copy">Kết nối được bảo mật · Way Up</p></div>';
    var inp = document.getElementById('mfCode'), f = document.getElementById('mf'), busy = false;
    inp.focus();
    inp.oninput = function () { if (digits6(inp).length === 6) submit() };
    f.onsubmit = function (e) { e.preventDefault(); submit() };
    document.getElementById('mfOut').onclick = logout;
    function submit() {
      if (busy) return;
      var code = digits6(inp), dev = document.getElementById('mfDev'), id = dev ? dev.value : fid;
      if (code.length !== 6) return viewMfa({ error: 'Nhập đủ 6 chữ số.', fid: id });
      if (!id) return viewMfa({ error: 'Không tìm thấy thiết bị xác thực của tài khoản. Đăng xuất rồi đăng nhập lại.' });
      busy = true;
      var b = document.getElementById('mfB');
      b.disabled = true; b.innerHTML = ic('spin', 18, ' class="gx-spin"') + '<span>Đang kiểm tra…</span>';
      sb.auth.mfa.challengeAndVerify({ factorId: id, code: code })
        .then(function (r) { if (r.error) throw r.error; return afterAuth() })
        .then(function () {
          if (S.needMfa) throw new Error('aal2');
          if (!location.hash) location.hash = 'home';
          route();
        })
        .catch(function (e) { viewMfa({ error: mfaErr(e), fid: id }) });
    }
  }

  /* ---------------- hộp thoại "Xác thực 2 lớp" (nút khiên) ---------------- */
  function openSecurity(intro) {
    var old = document.getElementById('secDlg'); if (old) old.remove();
    var back = document.createElement('div'), ret = document.activeElement, pending = null;
    back.className = 'gx-dlg-back'; back.id = 'secDlg';
    back.innerHTML = '<div class="gx-dlg g sec-dlg" role="dialog" aria-modal="true" aria-labelledby="secT"></div>';
    document.body.appendChild(back);
    var box = back.firstChild;
    function close() {
      document.removeEventListener('keydown', key);
      if (pending) sb.auth.mfa.unenroll({ factorId: pending }).catch(function () {});   /* bỏ thiết bị quét dở */
      back.remove();
      var sb2 = document.getElementById('secBtn'); if (sb2) { sb2.outerHTML = secBtn(); bindSecBtn() }
      var r = document.getElementById(ret && ret.id) || ret; if (r && r.focus) r.focus();
    }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (e.key === 'Tab') {   /* giữ phím Tab trong hộp thoại */
        var f = Array.prototype.slice.call(box.querySelectorAll('button:not([disabled]),input,select'));
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        e.preventDefault(); f[i < 0 ? 0 : (i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    document.addEventListener('keydown', key);
    back.onclick = function (e) { if (e.target === back) close() };
    function head(icon, cls, title) {
      return '<div class="gx-dlg-h"><span class="gx-dlg-i ' + cls + '">' + ic(icon, 20) + '</span><h2 id="secT">' + title + '</h2></div>';
    }
    function loading() { box.innerHTML = head('shield', 'info', 'Xác thực 2 lớp') + '<p>' + ic('spin', 16, ' class="gx-spin"') + ' Đang tải…</p>' }

    function list(err) {
      loading();
      sb.auth.mfa.listFactors().then(function (r) {
        if (r.error) throw r.error;
        var all = r.data.all || [], fs = totpFactors(all);
        S.mfaOn = fs.length > 0;
        /* thiết bị quét dở lần trước (chưa xác nhận) thì xóa đi cho gọn */
        all.filter(function (f) { return f.status !== 'verified' && f.id !== pending })
           .forEach(function (f) { sb.auth.mfa.unenroll({ factorId: f.id }).catch(function () {}) });
        drawList(fs, err);
      }).catch(function (e) { drawList(null, mfaErr(e)) });
    }
    function drawList(fs, err) {
      var on = fs && fs.length;
      box.innerHTML = head('shield', on ? 'ok' : 'info', 'Xác thực 2 lớp') +
        (intro ? '<div class="sec-tip">' + ic('lock', 16) + '<span>' + esc(intro) + '</span></div>' : '') +
        (err ? '<div class="gx-alert" role="alert">' + ic('alert', 18) + '<span>' + esc(err) + '</span></div>' : '') +
        (fs == null ? '' : on
          ? '<p><span class="gx-status ok"><i></i>Đang bật</span>&nbsp; Mỗi lần đăng nhập, sau mật khẩu trang sẽ hỏi mã 6 số trên điện thoại.</p>' +
            '<ul class="sec-list">' + fs.map(function (f) {
              return '<li><span>' + ic('phone', 20) + '</span><div><b>' + esc(f.friendly_name || 'Thiết bị') + '</b><small>Thêm ngày ' + dmy(f.created_at) + '</small></div>' +
                '<button type="button" class="gx-btn danger" data-rm="' + esc(f.id) + '">Gỡ</button></li>';
            }).join('') + '</ul>' +
            (fs.length < 2 ? '<div class="sec-tip">' + ic('warn', 16) + '<span>Nên thêm một <b>thiết bị dự phòng</b> (điện thoại thứ hai, máy tính bảng). Mất điện thoại duy nhất thì không đăng nhập được.</span></div>' : '')
          : '<p><span class="gx-status warn"><i></i>Chưa bật</span></p>' +
            '<ul><li>Sau mật khẩu, trang hỏi thêm <strong>mã 6 số</strong> từ ứng dụng trên điện thoại. Kẻ lấy được mật khẩu cũng không vào được.</li>' +
            '<li>Bắt buộc để: tạo link màn hình quầy, xác nhận thanh toán tay, hoàn tiền, đổi tài khoản nhận tiền.</li>' +
            '<li>Miễn phí. Dùng Google Authenticator, Microsoft Authenticator hoặc ứng dụng tương tự.</li></ul>') +
        '<div class="gx-dlg-a"><button type="button" class="gx-btn" id="secClose">Đóng</button>' +
          (fs == null ? '<button type="button" class="gx-btn pri" id="secRetry">Thử lại</button>'
            : '<button type="button" class="gx-btn pri" id="secAdd">' + ic('plus', 16) + (on ? 'Thêm thiết bị dự phòng' : 'Bật xác thực 2 lớp') + '</button>') + '</div>';
      document.getElementById('secClose').onclick = close;
      var rt = document.getElementById('secRetry'); if (rt) rt.onclick = function () { list() };
      var ad = document.getElementById('secAdd');
      if (ad) { ad.onclick = function () { enroll(fs) }; ad.focus() } else document.getElementById('secClose').focus();
      box.querySelectorAll('[data-rm]').forEach(function (b) {
        b.onclick = function () { askRemove(fs, b.getAttribute('data-rm')) };
      });
    }

    function askRemove(fs, id) {
      var f = fs.filter(function (x) { return x.id === id })[0], last = fs.length === 1;
      box.innerHTML = head('warn', '', 'Gỡ “' + esc(f.friendly_name || 'thiết bị') + '”?') +
        '<ul><li>Ứng dụng trên thiết bị này sẽ không dùng để đăng nhập được nữa. Nhớ xóa mục ' + MFA_ISSUER + ' trong ứng dụng.</li>' +
        (last ? '<li>Đây là thiết bị cuối cùng: xác thực 2 lớp sẽ <strong class="bad">tắt</strong>, và 4 việc nguy hiểm (link màn hình quầy, thanh toán tay, hoàn tiền, tài khoản nhận tiền) bị khóa cho tới khi bật lại.</li>' : '') +
        '</ul><p class="sec-err" id="secErr" role="alert"></p>' +
        '<div class="gx-dlg-a"><button type="button" class="gx-btn" id="secNo">Hủy</button><button type="button" class="gx-btn red" id="secYes">Gỡ thiết bị</button></div>';
      document.getElementById('secNo').onclick = function () { list() };
      document.getElementById('secNo').focus();
      document.getElementById('secYes').onclick = function () {
        var y = this; y.disabled = true; y.textContent = 'Đang gỡ…';
        sb.auth.mfa.unenroll({ factorId: id }).then(function (r) {
          if (r.error) throw r.error;
          return sb.auth.refreshSession();   /* cập nhật mức xác thực của phiên */
        }).then(function (r) {
          if (r && r.data && r.data.user) S.user = r.data.user;
          return mfaLevel();
        }).then(function () { toast('Đã gỡ thiết bị'); list() })
          .catch(function (e) { y.disabled = false; y.textContent = 'Thử lại'; document.getElementById('secErr').textContent = mfaErr(e) });
      };
    }

    function enroll(fs) {
      loading();
      var used = (fs || []).map(function (f) { return f.friendly_name }), n = used.length + 1, name;
      do { name = n === 1 ? 'Điện thoại' : 'Thiết bị dự phòng ' + (n - 1); n++ } while (used.indexOf(name) >= 0);
      sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: name, issuer: MFA_ISSUER }).then(function (r) {
        if (r.error) throw r.error;
        pending = r.data.id;
        var qr = r.data.totp.qr_code || '', secret = r.data.totp.secret || '';
        if (qr && qr.indexOf('data:') !== 0) qr = 'data:image/svg+xml;utf-8,' + encodeURIComponent(qr);
        var grouped = secret.replace(/(.{4})/g, '$1 ').trim();
        box.innerHTML = head('shield', 'info', (fs && fs.length) ? 'Thêm thiết bị dự phòng' : 'Bật xác thực 2 lớp') +
          '<ol><li>Cài <b>Google Authenticator</b> hoặc <b>Microsoft Authenticator</b> trên điện thoại (nếu chưa có).</li>' +
          '<li>Trong ứng dụng, bấm dấu <b>+</b> → <b>Quét mã QR</b>, rồi quét mã này:' +
            '<div class="sec-qr"><img alt="Mã QR để thêm tài khoản ' + MFA_ISSUER + ' vào ứng dụng xác thực" src="' + esc(qr) + '">' +
            '<div class="sec-key"><span>Không quét được? Chọn “Nhập khóa thiết lập” và gõ khóa:</span><code id="secKey">' + esc(grouped) + '</code>' +
            '<button type="button" class="gx-btn ghost" id="secCopy">' + ic('copy', 14) + '<span>Sao chép khóa</span></button></div></div></li>' +
          '<li><label for="secCode">Nhập mã 6 số ứng dụng hiện ra:</label>' +
            '<div class="gx-input" style="margin-top:.5rem">' + ic('lock') + '<input id="secCode" class="sec-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div>' +
            '<p class="sec-err" id="secErr" role="alert"></p></li></ol>' +
          '<div class="gx-dlg-a"><button type="button" class="gx-btn" id="secNo">Hủy</button><button type="button" class="gx-btn pri" id="secOk">Xác nhận</button></div>';
        var inp = document.getElementById('secCode'), ok = document.getElementById('secOk');
        inp.focus();
        inp.oninput = function () { if (digits6(inp).length === 6) ok.click() };
        inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); ok.click() } };
        document.getElementById('secNo').onclick = function () {
          var p = pending; pending = null;
          sb.auth.mfa.unenroll({ factorId: p }).catch(function () {}).then(function () { list() });
        };
        document.getElementById('secCopy').onclick = function () {
          var b = this;
          (navigator.clipboard ? navigator.clipboard.writeText(secret) : Promise.reject()).then(function () {
            b.querySelector('span').textContent = 'Đã sao chép';
            setTimeout(function () { if (b.isConnected) b.querySelector('span').textContent = 'Sao chép khóa' }, 1800);
          }, function () { prompt('Sao chép khóa này:', secret) });
        };
        ok.onclick = function () {
          var code = digits6(inp), er = document.getElementById('secErr');
          if (code.length !== 6) { er.textContent = 'Nhập đủ 6 chữ số.'; inp.focus(); return }
          ok.disabled = true; ok.textContent = 'Đang kiểm tra…'; er.textContent = '';
          sb.auth.mfa.challengeAndVerify({ factorId: pending, code: code }).then(function (r) {
            if (r.error) throw r.error;
            pending = null;
            return sb.auth.getSession();
          }).then(function (r) {
            if (r && r.data && r.data.session) S.user = r.data.session.user;
            return mfaLevel();
          }).then(function () { done(fs) }).catch(function (e) {
            ok.disabled = false; ok.textContent = 'Xác nhận'; er.textContent = mfaErr(e);
            inp.value = ''; inp.focus();
          });
        };
      }).catch(function (e) { drawList(fs, mfaErr(e)) });
    }

    function done(fs) {
      var first = !(fs && fs.length);
      box.innerHTML = head('okc', 'ok', first ? 'Đã bật xác thực 2 lớp' : 'Đã thêm thiết bị dự phòng') +
        '<p>' + (first ? 'Từ lần đăng nhập sau, sau mật khẩu trang sẽ hỏi mã 6 số trên điện thoại. Phiên này đã được xác thực, bạn làm tiếp được ngay.'
          : 'Khi đăng nhập, chọn thiết bị nào cũng được.') + '</p>' +
        (first ? '<div class="sec-tip">' + ic('warn', 16) + '<span>Nên thêm một <b>thiết bị dự phòng</b> ngay bây giờ, phòng khi mất hoặc đổi điện thoại.</span></div>' : '') +
        '<div class="gx-dlg-a">' + (first ? '<button type="button" class="gx-btn" id="secMore">Thêm thiết bị dự phòng</button>' : '') +
          '<button type="button" class="gx-btn pri" id="secDone">Xong</button></div>';
      toast(first ? 'Đã bật xác thực 2 lớp' : 'Đã thêm thiết bị dự phòng');
      var m = document.getElementById('secMore');
      if (m) m.onclick = function () { sb.auth.mfa.listFactors().then(function (r) { enroll(totpFactors(r.data && r.data.all)) }) };
      document.getElementById('secDone').onclick = close;
      document.getElementById('secDone').focus();
    }

    list();
  }
  function secBtn() {
    return '<button type="button" id="secBtn" class="gx-icon-btn" aria-label="Xác thực 2 lớp: ' + (S.mfaOn ? 'đang bật' : 'chưa bật') + '" title="Xác thực 2 lớp: ' +
      (S.mfaOn ? 'đang bật' : 'chưa bật') + '">' + ic('shield') + (S.mfaOn ? '' : '<i class="sec-dot" aria-hidden="true"></i>') + '</button>';
  }
  function bindSecBtn() { var b = document.getElementById('secBtn'); if (b) b.onclick = function () { openSecurity() } }

  /* ---------------- đăng nhập ---------------- */
  function viewLogin(state) {
    state = state || {};
    document.body.className = 'glass';
    app.innerHTML = '<div class="gx gx-login">' + bgSvg(['#4FA3FF', 0.5, 0.45], [ACCENT, 0.12, 0.1]) +
      '<div class="gx-brand-c"><img src="logo.webp" alt="Logo Way Up" class="gx-logo-lg"><div class="gx-brand-t"><b>Way Up</b><span>Trang quản lý</span></div></div>' +
      '<div class="gx-lframe"><div class="gx-lborder"><form class="gx-lform g" id="lf" novalidate>' +
        '<div class="gx-lhead"><h1>Chào mừng <span>trở lại</span></h1><p>Đăng nhập để quản lý menu, kho và đơn hàng của quán.</p></div>' +
        (state.error ? '<div class="gx-alert" role="alert">' + ic('alert', 18) + '<span>' + esc(state.error) + '</span></div>' : '') +
        '<div class="gx-field"><label for="em">Email</label><div class="gx-input' + (state.error ? ' err' : '') + '">' + ic('mail') +
          '<input id="em" type="email" autocomplete="email" placeholder="ten@quancuaban.vn" value="' + esc(state.email || '') + '" required></div></div>' +
        '<div class="gx-field"><label for="pw">Mật khẩu</label><div class="gx-input pw' + (state.error ? ' err' : '') + '">' + ic('lock') +
          '<input id="pw" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu" required>' +
          '<button type="button" id="pwT" class="gx-eye" aria-label="Hiện mật khẩu" aria-pressed="false">' + ic('eye') + '</button></div></div>' +
        '<div class="gx-lrow"><label class="gx-remember"><input type="checkbox" id="rem"' + (remember() ? ' checked' : '') + '> Ghi nhớ trên máy này</label>' +
          '<button type="button" class="gx-link" id="forgot">Quên mật khẩu?</button></div>' +
        '<button type="submit" class="gx-submit" id="lb"><span>Đăng nhập</span>' + ic('arrow', 18) + '</button>' +
        '<div class="gx-sep"><span></span>Màn hình quầy<span></span></div>' +
        '<div class="gx-note">' + '<span class="gx-note-i">' + ic('screen') + '</span><span>Màn hình quầy không cần đăng nhập. Mở link thiết bị mà chủ quán gửi trên máy đặt ở quầy.</span></div>' +
        '<p class="gx-foot-p">Chưa có tài khoản? Nhờ chủ quán mời bạn vào quán.</p>' +
      '</form></div></div><p class="gx-copy">Kết nối được bảo mật · Way Up</p></div>';
    var pw = document.getElementById('pw'), pt = document.getElementById('pwT');
    pt.onclick = function () {
      var show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
      pt.setAttribute('aria-pressed', show ? 'true' : 'false'); pt.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      pt.innerHTML = ic(show ? 'eyeOff' : 'eye');
    };
    document.getElementById('forgot').onclick = function () { soon('Quên mật khẩu') };
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var em = document.getElementById('em').value.trim(), b = document.getElementById('lb');
      if (!em || !pw.value) return viewLogin({ error: 'Điền email và mật khẩu.', email: em });
      setRemember(document.getElementById('rem').checked);
      b.disabled = true; b.innerHTML = ic('spin', 18, ' class="gx-spin"') + '<span>Đang đăng nhập…</span>';
      sb.auth.signInWithPassword({ email: em, password: pw.value })
        .then(function (r) { if (r.error) throw r.error; S.user = r.data.user; return afterAuth() })
        .then(function () { location.hash = 'home'; route() })
        .catch(function (e) {
          var m = errMsg(e);
          if (/invalid login credentials/i.test(m)) m = 'Email hoặc mật khẩu không đúng. Kiểm tra lại, hoặc bấm “Quên mật khẩu?”.';
          else if (/email not confirmed/i.test(m)) m = 'Email này chưa được xác nhận.';
          viewLogin({ error: m, email: em });
        });
    };
  }
  function loadShops() {
    return rpc('admin_my_shops').then(function (list) {
      S.shops = list || [];
      var saved = null; try { saved = localStorage.getItem('quanly-shop') } catch (e) {}
      S.shop = S.shops.filter(function (s) { return s.id === saved })[0] || S.shops[0] || null;
    });
  }
  function viewNoShop() {
    document.body.className = 'glass';
    app.innerHTML = '<div class="gx gx-login">' + bgSvg([ACCENT, 0.15, 0.08], ['#2F6FE0', 0.85, 0.9]) +
      '<div class="gx-card g" style="max-width:28rem;text-align:center"><p>Tài khoản này chưa là chủ quán hoặc quản lý của quán nào.</p>' +
      '<button class="gx-btn" id="logout2" type="button">' + ic('logout') + 'Đăng xuất</button></div></div>';
    document.getElementById('logout2').onclick = logout;
  }
  function logout() {
    if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Vẫn đăng xuất?')) return;
    setDirty(false); stopLive();
    sb.auth.signOut().then(function () { S.user = null; S.shop = null; S.needMfa = false; S.mfaOn = false; S.aal = null; location.hash = ''; route() });
  }

  /* ---------------- khung: thanh bên + tiêu đề ---------------- */
  var NAV = [
    ['QUẢN LÝ'],
    ['home', 'grid', 'Tổng quan'],
    ['troly', 'spark', 'Trợ lý AI', 'new'],
    ['orders', 'bill', 'Đơn hàng', 'open'],
    ['menu', 'cup', 'Menu'],
    ['kho', 'box', 'Kho', 'low'],
    ['nhaphang', 'import', 'Nhập hàng'],
    ['kiemke', 'check', 'Kiểm kê'],
    ['HỆ THỐNG'],
    ['chuyenkhoan', 'bank', 'Chuyển khoản', 'transfers'],
    ['manhinh', 'screen', 'Màn hình quầy'],
    ['nhanvien', 'users', 'Nhân viên'],
    ['nhatky', 'clock', 'Nhật ký thay đổi']
  ];
  var READY = { home: 1, troly: 1, menu: 1, kho: 1, nhatky: 1, manhinh: 1, chuyenkhoan: 1 };
  function badge(key) {
    if (key === 'new') return '<span class="gx-badge ai">Mới</span>';
    var c = S.counts || {}, v = c[key];
    if (!v) return '';
    var cls = key === 'open' ? 'acc' : key === 'low' ? 'warn' : 'bad';
    return '<span class="gx-badge ' + cls + '">' + v + (key === 'open' ? ' chờ' : '') + '</span>';
  }
  function shell(active, title, sub, actions, body, headLeft) {
    var role = S.shop.role === 'owner' ? 'Chủ quán' : 'Quản lý';
    var mail = (S.user && S.user.email) || '';
    var shopBox = S.shops.length > 1
      ? '<label class="gx-shop"><span class="gx-sr">Chọn quán</span><select id="shopSel">' + S.shops.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === S.shop.id ? ' selected' : '') + '>' + esc(s.name) + '</option>' }).join('') +
        '</select><small>' + role + '</small>' + ic('down', 16, ' class="gx-shop-i"') + '</label>'
      : '<div class="gx-shop"><b>' + esc(S.shop.name) + '</b><small>' + role + '</small></div>';
    var nav = NAV.map(function (n) {
      if (n.length === 1) return '<span class="gx-navh">' + n[0] + '</span>';
      var on = n[0] === active;
      return '<a href="#' + n[0] + '" class="gx-nav' + (on ? ' on' : '') + '"' + (on ? ' aria-current="page"' : '') + (READY[n[0]] ? '' : ' data-soon="' + n[2] + '"') + '>' +
        ic(n[1], 18, on || n[0] === 'troly' ? ' style="color:' + (n[0] === 'troly' ? '#22D3EE' : ACCENT) + '"' : '') + '<span class="gx-nav-t">' + n[2] + '</span>' + (n[3] ? badge(n[3]) : '') + '</a>';
    }).join('');
    return '<div class="gx">' + bgSvg([ACCENT, 0.15, 0.08], ['#2F6FE0', 0.85, 0.9]) +
      '<div class="gx-wrap"><aside class="gx-side g">' +
        '<div class="gx-brand"><img src="logo.webp" alt="Logo Way Up"><div><b>Way Up</b><span>Trang quản lý</span></div></div>' +
        shopBox +
        '<nav class="gx-navs" aria-label="Điều hướng chính">' + nav + '</nav>' +
        '<div class="gx-acc"><div class="gx-ava">' + esc((mail[0] || 'Q').toUpperCase()) + '</div>' +
          '<div class="gx-acc-t"><b title="' + esc(mail) + '">' + esc(mail) + '</b><small>' + role + '</small></div>' +
          secBtn() + '<button type="button" id="logout" class="gx-icon-btn" aria-label="Đăng xuất">' + ic('logout') + '</button></div>' +
      '</aside><main class="gx-main">' +
        '<header class="gx-head g">' + (headLeft || '<div class="gx-head-t"><h1>' + title + '</h1><span id="headSub">' + sub + '</span></div>') + actions + '</header>' +
        body + '</main></div></div>';
  }
  function bindShell() {
    document.getElementById('logout').onclick = logout;
    bindSecBtn();
    document.querySelectorAll('[data-soon]').forEach(function (a) {
      a.onclick = function (e) { e.preventDefault(); soon(a.getAttribute('data-soon')) };
    });
    var ss = document.getElementById('shopSel');
    if (ss) ss.onchange = function () {
      if (S.dirty && !confirm('Bảng có thay đổi chưa lưu. Vẫn đổi quán?')) { ss.value = S.shop.id; return }
      setDirty(false); S.counts = null; S.dash = null;
      S.shop = S.shops.filter(function (s) { return s.id === ss.value })[0];
      try { localStorage.setItem('quanly-shop', S.shop.id) } catch (e) {}
      route();
    };
  }
  function loadingShell(active, title) {
    document.body.className = 'glass';
    app.innerHTML = shell(active, title, 'Đang tải…', '', '<div class="gx-card g gx-empty">Đang tải dữ liệu…</div>');
    bindShell();
  }
  function errorShell(active, title, e) {
    app.innerHTML = shell(active, title, '', '', '<div class="gx-card g gx-empty">' + esc(errMsg(e)) + '</div>');
    bindShell();
  }

  /* ---------------- tổng quan ---------------- */
  var liveT = null;
  function stopLive() { clearInterval(liveT); liveT = null }
  var WD = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  function viewHome() {
    if (!S.dash) loadingShell('home', 'Tổng quan');
    return loadDash().then(renderHome).catch(function (e) { errorShell('home', 'Tổng quan', e) });
  }
  function loadDash() {
    return rpc('admin_dashboard', { p_shop_id: S.shop.id }).then(function (d) {
      S.dash = d; S.dashShop = S.shop.id;
      S.counts = { open: d.open_orders, low: d.stock.low, transfers: (d.transfers || []).length };
      return d;
    });
  }
  function renderHome() {
    var d = S.dash, now = new Date(d.now + 'Z'), dd = d.now.slice(0, 10).split('-');
    var sub = WD[now.getUTCDay()] + ', ' + dd[2] + '/' + dd[1] + '/' + dd[0] + ' · tự cập nhật mỗi phút';
    var actions =
      '<label class="gx-search"><span class="gx-sr">Tìm kiếm</span>' + ic('search', 16) + '<input type="search" id="q" placeholder="Tìm đơn theo mã nhận, món, nguyên liệu…"></label>' +
      '<button type="button" class="gx-icon-btn" id="bell" aria-label="Thông báo">' + ic('bell') + ((d.transfers || []).length ? '<span class="gx-dot"></span>' : '') + '</button>' +
      '<a class="gx-btn pri" href="#kho">' + ic('plus', 16) + 'Nhập hàng</a>';
    var t = d.today, avg = t.orders ? Math.round(t.revenue / t.orders) : 0;
    var kpi = '<section class="gx-kpis" aria-label="Chỉ số hôm nay">' +
      kpiCard('Doanh thu hôm nay', 'trend', 'blue', money(t.revenue) + ' đ',
        trendPill(pct(t.revenue, t.revenue_prev), 'so với hôm qua cùng giờ') || '<span class="gx-muted">Hôm qua cùng giờ: ' + money(t.revenue_prev) + ' đ</span>') +
      kpiCard('Đơn đã thanh toán', 'receipt', 'violet', String(t.orders),
        (t.orders_prev || t.orders ? '<span class="gx-pill ' + (t.orders >= t.orders_prev ? 'ok' : 'bad') + '">' + (t.orders >= t.orders_prev ? '▲ ' : '▼ ') + Math.abs(t.orders - t.orders_prev) + ' đơn</span>' : '') +
        '<span class="gx-muted">TB ' + money(avg) + ' đ / đơn</span>') +
      kpiCard('Đang chờ chuyển khoản', 'wait', 'blue', String(d.open_orders),
        '<span class="gx-pill info">Đang mở</span><span class="gx-muted">tự hết hạn sau ' + d.expiry_minutes + ' phút</span>') +
      kpiCard('Nguyên liệu sắp hết', 'warn', 'amber', String(d.stock.low),
        d.stock.negative ? '<span class="gx-pill bad">' + d.stock.negative + ' âm kho</span><span class="gx-muted">' + esc(d.stock.negative_names.join(', ')) + '</span>'
                         : '<span class="gx-muted">' + (d.stock.low ? 'Xem trong Kho' : 'Đủ hàng') + '</span>') +
      '</section>';
    var chartBox = '<div class="gx-card g gx-chart"><div class="gx-row-b"><div><h2>Doanh thu</h2><div class="gx-total"><span id="cTotal"></span><small id="cCmp"></small></div></div>' +
      '<div class="gx-tabs" role="tablist" aria-label="Khoảng thời gian">' +
      [['day', 'Hôm nay'], ['week', '7 ngày'], ['month', '30 ngày'], ['half', '6 tháng']].map(function (r) {
        return '<button type="button" role="tab" data-range="' + r[0] + '" aria-selected="' + (S.range === r[0]) + '">' + r[1] + '</button>' }).join('') +
      '</div></div><div class="gx-plot"><div class="gx-ylab" id="cY"></div><div class="gx-plot-r">' +
      '<svg role="img" aria-label="Biểu đồ doanh thu theo thời gian" viewBox="0 0 600 220" preserveAspectRatio="none"><path id="cGrid" stroke="rgba(255,255,255,0.07)" stroke-width="1" fill="none" vector-effect="non-scaling-stroke" stroke-dasharray="3 5"/>' +
      '<path id="cArea" fill="rgba(79,163,255,0.13)"/><path id="cLine" fill="none" stroke="#4FA3FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>' +
      '<div class="gx-xlab" id="cX"></div></div></div></div>';
    var donut = donutCard(d.categories || []);
    var orders = '<div class="gx-card g gx-orders"><div class="gx-row-b"><div><h2>Đơn gần đây</h2><span class="gx-muted">Từ các màn hình quầy, cập nhật khi tiền chuyển khoản về</span></div>' +
      '<div class="gx-chips">' + [['all', 'Tất cả'], ['paid', 'Đã trả'], ['open', 'Chờ CK'], ['expired', 'Quá hạn']].map(function (c) {
        return '<button type="button" class="gx-chip" data-of="' + c[0] + '" aria-pressed="' + ((S.ofilter || 'all') === c[0]) + '">' + c[1] + '</button>' }).join('') +
      '</div></div><div class="gx-tablewrap"><table class="gx-table"><thead><tr><th scope="col">Đơn</th><th scope="col">Món</th><th scope="col">Màn hình</th><th scope="col" class="r">Tổng</th><th scope="col">Trạng thái</th><th scope="col" class="r">Giờ</th></tr></thead><tbody id="oBody"></tbody></table></div></div>';
    var side = '<div class="gx-col">' + transfersCard(d.transfers || []) + terminalsCard(d) + '</div>';
    app.innerHTML = shell('home', 'Tổng quan', sub, actions,
      kpi + aiCard() + '<section class="gx-flex">' + chartBox + donut + '</section><section class="gx-flex gx-top">' + orders + side + '</section>');
    document.body.className = 'glass';
    bindShell();
    drawChart(); drawOrders();
    bindAiCard(); aiDock();
    document.querySelectorAll('[data-range]').forEach(function (b) { b.onclick = function () { S.range = b.getAttribute('data-range'); drawChart() } });
    document.querySelectorAll('[data-of]').forEach(function (b) { b.onclick = function () { S.ofilter = b.getAttribute('data-of'); drawOrders() } });
    document.getElementById('bell').onclick = function () { soon('Thông báo') };
    document.getElementById('q').onkeydown = function (e) { if (e.key === 'Enter') soon('Tìm kiếm') };
    document.querySelectorAll('[data-soon-btn]').forEach(function (b) { b.onclick = function () { soon(b.getAttribute('data-soon-btn')) } });
    var cp = document.getElementById('cpLink');
    if (cp) cp.onclick = function () {
      var link = new URL('../', location.href).href;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(function () { toast('Đã sao chép link màn hình quầy') }, function () { prompt('Sao chép link này:', link) });
    };
    stopLive();
    liveT = setInterval(function () {
      if (location.hash.replace('#', '') !== 'home' && location.hash !== '') return stopLive();
      if (document.querySelector('#q') && document.activeElement === document.querySelector('#q')) return;
      loadDash().then(renderHome).catch(function () {});
    }, 60000);
  }
  function kpiCard(label, icon, tone, value, foot) {
    return '<div class="gx-card g gx-kpi"><div class="gx-row-b"><span class="gx-muted2">' + label + '</span><span class="gx-ico ' + tone + '">' + ic(icon, 16) + '</span></div>' +
      '<span class="gx-kpi-v">' + value + '</span><div class="gx-kpi-f">' + foot + '</div></div>';
  }
  function niceTop(max) {
    if (max <= 0) return 4;
    var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    var nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * mag * 4;
  }
  function rangeData() {
    var d = S.dash, r = S.range || 'day';
    if (r === 'day') {
      var hs = d.hours.filter(function (x) { return x.h >= 7 && x.h <= 21 });
      return { labels: hs.map(function (x) { return x.h + 'h' }), vals: hs.map(function (x) { return x.v }), every: 2,
        total: d.today.revenue, cmp: pct(d.today.revenue, d.today.revenue_prev), cmpText: 'so với hôm qua cùng giờ' };
    }
    if (r === 'week' || r === 'month') {
      /* chỉ tính các ngày đã trọn (tới hôm qua); hôm nay xem ở tab "Hôm nay" */
      var done = d.days.slice(0, -1), n = r === 'week' ? 7 : 30, cur = done.slice(-n), prev = done.slice(-2 * n, -n);
      var sum = function (a) { return a.reduce(function (s, x) { return s + x.v }, 0) };
      return { labels: cur.map(function (x) {
          var p = x.d.split('-'); if (r === 'week') return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(x.d + 'T00:00:00Z').getUTCDay()];
          return (+p[2]) + '/' + (+p[1]); }), vals: cur.map(function (x) { return x.v }), every: r === 'month' ? 3 : 0,
        total: sum(cur), cmp: pct(sum(cur), sum(prev)), cmpText: r === 'week' ? 'so với 7 ngày trước đó (không tính hôm nay)' : 'so với 30 ngày trước đó (không tính hôm nay)' };
    }
    var ms = d.months, last = ms.length - 1, full = ms.slice(0, last), curM = full[full.length - 1], prevM = full[full.length - 2];
    /* 6 tháng đã trọn; tháng đang chạy chưa đủ ngày nên không vẽ để khỏi tụt cuối biểu đồ */
    return { labels: full.map(function (x) { return 'Th' + (+x.m.split('-')[1]) }), vals: full.map(function (x) { return x.v }), every: 0,
      total: full.reduce(function (s, x) { return s + x.v }, 0),
      cmp: curM && prevM ? pct(curM.v, prevM.v) : null, cmpText: curM ? 'tháng ' + (+curM.m.split('-')[1]) + ' so với tháng trước' : '' };
  }
  function drawChart() {
    var r = rangeData(), W = 600, base = 212, span = 200, vals = r.vals.length > 1 ? r.vals : [0, 0];
    var top = niceTop(Math.max.apply(null, vals)), n = vals.length;
    var pts = vals.map(function (v, i) { return [i * W / (n - 1), base - v / top * span] });
    var dd = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      dd += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + Math.min(base, p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + Math.min(base, p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    var grid = '', y = '';
    for (var k = 0; k <= 4; k++) {
      var yy = base - k / 4 * span; grid += 'M0 ' + yy + ' L' + W + ' ' + yy + ' ';
      y += '<span style="top:' + (yy / 220 * 100) + '%">' + (k ? short(top * k / 4) : '0') + '</span>';
    }
    document.getElementById('cLine').setAttribute('d', dd);
    document.getElementById('cArea').setAttribute('d', dd + ' L' + W + ' ' + base + ' L0 ' + base + ' Z');
    document.getElementById('cGrid').setAttribute('d', grid.trim());
    document.getElementById('cY').innerHTML = y;
    document.getElementById('cX').innerHTML = r.labels.map(function (l, i) { return '<span>' + ((r.every && i % r.every) ? '' : l) + '</span>' }).join('');
    document.getElementById('cTotal').textContent = money(r.total) + ' đ';
    var c = document.getElementById('cCmp');
    c.textContent = r.cmp == null ? r.cmpText : (r.cmp >= 0 ? '▲ ' : '▼ ') + Math.abs(r.cmp) + '% ' + r.cmpText;
    c.className = r.cmp == null ? 'gx-muted' : (r.cmp >= 0 ? 'up' : 'down');
    document.querySelectorAll('[data-range]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-range') === (S.range || 'day'))) });
  }
  function donutCard(cats) {
    var COL = ['#4FA3FF', '#34D399', '#FBBF24', '#FF7A52', '#8A9099'];
    var top = cats.slice(0, 4), rest = cats.slice(4).reduce(function (s, x) { return s + Number(x.v) }, 0);
    var list = top.map(function (x) { return { name: x.name, v: Number(x.v) } });
    if (rest > 0) list.push({ name: 'Khác', v: rest });
    var total = list.reduce(function (s, x) { return s + x.v }, 0) || 1, C = 2 * Math.PI * 54, off = 0;
    var arcs = list.map(function (x, i) {
      var len = x.v / total * C, gap = list.length > 1 ? 3 : 0;
      var s = '<circle cx="70" cy="70" r="54" fill="none" stroke="' + COL[i] + '" stroke-width="14" stroke-dasharray="' + Math.max(0, len - gap).toFixed(1) + ' ' + (C - Math.max(0, len - gap)).toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '"/>';
      off += len; return s;
    }).join('');
    var p = function (x) { return Math.round(x.v / total * 100) };
    var label = list.map(function (x) { return x.name + ' ' + p(x) + '%' }).join(', ');
    return '<div class="gx-card g gx-donut"><h2>Doanh thu theo nhóm món <small class="gx-muted">· 30 ngày</small></h2>' +
      (list.length ? '<div class="gx-donut-c"><svg role="img" aria-label="Tỷ lệ doanh thu: ' + esc(label) + '" viewBox="0 0 140 140"><circle cx="70" cy="70" r="54" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14"/>' + arcs + '</svg>' +
        '<div class="gx-donut-t"><b>' + p(list[0]) + '%</b><span>' + esc(list[0].name) + '</span></div></div>' +
        '<ul class="gx-legend">' + list.map(function (x, i) {
          return '<li><span class="sw" style="background:' + COL[i] + '"></span><span class="nm">' + esc(x.name) + '</span><span class="gx-muted2">' + money(x.v) + ' đ</span><b>' + p(x) + '%</b></li>' }).join('') + '</ul>'
        : '<p class="gx-muted">Chưa có đơn đã thanh toán trong 30 ngày.</p>') + '</div>';
  }
  var OST = { paid: ['Đã trả', 'ok'], open: ['Chờ chuyển khoản', 'info'], expired: ['Quá hạn', 'warn'], refunded: ['Đã hoàn tiền', 'bad'], cancelled: ['Đã huỷ', 'muted'] };
  function drawOrders() {
    var f = S.ofilter || 'all', today = S.dash.now.slice(0, 10);
    var rows = (S.dash.recent || []).filter(function (o) { return f === 'all' || o.status === f }).slice(0, 12);
    document.getElementById('oBody').innerHTML = rows.length ? rows.map(function (o) {
      var st = OST[o.status] || [o.status, 'muted'], day = o.at.slice(0, 10), p = day.split('-');
      return '<tr><td><div class="gx-ono"><span class="gx-no">#' + o.no + '</span><span><b>' + esc(o.pickup) + '</b><small>mã nhận</small></span></div></td>' +
        '<td class="gx-items">' + esc(o.items || '') + '</td><td class="gx-muted2">' + esc(o.terminal || '—') + '</td>' +
        '<td class="r"><b>' + money(o.total) + ' đ</b></td><td><span class="gx-status ' + st[1] + '"><i></i>' + st[0] + '</span></td>' +
        '<td class="r gx-muted2">' + (day === today ? '' : p[2] + '/' + p[1] + ' ') + o.at.slice(11) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="gx-muted" style="padding:1rem">Không có đơn nào.</td></tr>';
    document.querySelectorAll('[data-of]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-of') === f)) });
  }
  function transfersCard(list) {
    var body = list.length ? list.map(function (b, i) {
      var why, tone = 'warn';
      if (b.order_status === 'paid') why = 'Đơn đã thanh toán, có thể khách chuyển khoản 2 lần';
      else if (b.order_total != null && Number(b.amount) !== Number(b.order_total)) why = 'Chuyển ' + money(b.amount) + ' đ, tổng đơn ' + money(b.order_total) + ' đ';
      else if (!b.code) { why = 'Nội dung chuyển khoản không có mã đơn'; tone = 'bad' }
      else why = b.note || 'Chưa ghép được với đơn nào';
      return '<div class="gx-tr"><div class="gx-row-b"><b>' + money(b.amount) + ' đ</b><small class="gx-muted">' + b.at + ' · ' + esc(b.code || 'không có mã') + '</small></div>' +
        '<span class="gx-why ' + tone + '">' + esc(why) + '</span>' +
        (i === 0 ? '<div class="gx-tr-act"><a class="gx-btn" href="#chuyenkhoan">Xử lý</a></div>' : '') + '</div>';
    }).join('') : '<p class="gx-muted">Không có khoản nào cần xem.</p>';
    return '<div class="gx-card g"><div class="gx-row-b"><h2>Chuyển khoản cần xem</h2>' + (list.length ? '<span class="gx-pill bad">' + list.length + ' khoản</span>' : '') + '</div>' + body + '</div>';
  }
  function ago(s) { return s < 60 ? s + ' giây trước' : s < 3600 ? Math.floor(s / 60) + ' phút' : Math.floor(s / 3600) + ' giờ' }
  function terminalsCard(d) {
    var list = d.terminals || [];
    var body = list.length ? list.map(function (t) {
      var live = t.silent_sec < 120, old = t.version != null && t.version < d.menu_version;
      var txt = live ? 'Hoạt động · ' + ago(t.silent_sec) : 'Im lặng ' + ago(t.silent_sec) + (old ? ' · chưa nhận menu mới' : '');
      return '<div class="gx-term"><span class="gx-led ' + (live ? 'ok' : 'warn') + '"></span><div class="gx-term-t"><b>' + esc(t.name) + '</b><small>' + txt + '</small></div>' +
        '<span class="gx-pill ' + (old ? 'warn' : 'ok') + '">v' + (t.version == null ? '?' : t.version) + '</span></div>';
    }).join('') : '<p class="gx-muted">Chưa có màn hình quầy nào mở menu.</p>';
    return '<div class="gx-card g"><div class="gx-row-b"><h2>Màn hình quầy</h2><small class="gx-muted">Menu mới nhất: v' + d.menu_version + '</small></div>' + body +
      '<button type="button" class="gx-dash-btn" id="cpLink">' + ic('link', 16) + 'Sao chép link thiết bị</button></div>';
  }

  /* =====================================================================
     BẢNG MENU
     ===================================================================== */
  function itemFrom(it) {
    var a = it.attributes || {}, rate = (a.rate && !Array.isArray(a.rate)) ? a.rate : {}, s = a.suggest;
    var extra = {}; Object.keys(a).forEach(function (k) { if (k !== 'rate' && k !== 'suggest') extra[k] = a[k] });
    function trip(x) { return x ? [String(x[0]), String(x[1]), String(x[2])] : ['', '', ''] }
    return {
      id: it.id, name: it.name || '', description: it.description || '', image_path: it.image_path || '',
      price: it.price == null ? '' : String(it.price), is_active: it.is_active !== false,
      sk: rate.tra ? 'tra' : 'dam',
      r: { d: trip(rate.dam || rate.tra), n: trip(rate.ngot), y: trip(rate.ngay) },
      sugar: s && s.sugar != null ? String(s.sugar) : '',
      ice: s ? (s.ice != null ? String(s.ice) : 'none') : '',
      recipe: (it.recipe || []).map(function (x) { return { ingredient_id: x.ingredient_id, quantity: x.quantity } }),
      extra: extra
    };
  }
  function newItem(cat) {
    var sib = cat.items[0];
    return { id: null, name: '', description: '', image_path: '', price: '', is_active: true, sk: sib ? sib.sk : 'dam',
             r: { d: ['', '', ''], n: ['', '', ''], y: ['', '', ''] }, sugar: '50', ice: '50', recipe: [], extra: {} };
  }
  function loadMenuData(d) {
    S.menu = {
      version: d.menu_version, ingredients: d.ingredients || [],
      cats: (d.categories || []).map(function (c) {
        return { id: c.id, name: c.name, is_active: c.is_active !== false, items: (c.items || []).map(itemFrom) };
      })
    };
  }
  function ingById(id) { return S.menu.ingredients.filter(function (i) { return i.id === id })[0] }
  function recipeText(rec) {
    if (!rec.length) return '';
    return rec.map(function (x) {
      var g = ingById(x.ingredient_id);
      return (g ? g.name : '?') + ' ' + qty(x.quantity) + (g ? UNIT[g.unit] : '');
    }).join('; ');
  }

  function viewMenu() {
    S.mstate = 'saved';
    loadingShell('menu', 'Menu');
    rpc('admin_get_menu', { p_shop_id: S.shop.id }).then(function (d) { loadMenuData(d); renderMenu() })
      .catch(function (e) { errorShell('menu', 'Menu', e) });
  }

  /* Nhãn trạng thái lưu + bật/tắt nút theo trạng thái (theo thiết kế "Sửa menu") */
  var MST = {
    saved:  ['Đã lưu hết', 'ok'],
    dirty:  ['Có thay đổi chưa lưu', 'warn'],
    saving: ['Đang lưu…', 'info'],
    local:  ['Đã lưu · màn hình quầy chưa cập nhật', 'info']
  };
  function menuStatus(st) {
    S.mstate = st;
    var p = document.getElementById('mPill'); if (!p) return;
    p.className = 'mx-pill ' + MST[st][1]; p.innerHTML = '<i></i>' + MST[st][0];
    var noCh = st !== 'dirty';
    document.getElementById('reload').disabled = noCh;
    document.getElementById('saveOnly').disabled = noCh;
    document.getElementById('savePub').disabled = st === 'saved' || st === 'saving';
  }
  /* Thanh dưới ô khẩu vị: vùng Min–Max và chấm tròn ở Mức (thang 1–10) */
  function tbar(r) {
    var v = parseInt(r[0], 10);
    if (r[0] === '' || isNaN(v)) return '<div class="mx-tbar" aria-hidden="true"></div>';
    var lo = r[1] === '' ? v : parseInt(r[1], 10), hi = r[2] === '' ? v : parseInt(r[2], 10);
    var c = function (x) { return Math.max(1, Math.min(10, isNaN(x) ? v : x)) };
    lo = c(lo); hi = c(hi); v = c(v); if (hi < lo) { var t = lo; lo = hi; hi = t }
    return '<div class="mx-tbar" aria-hidden="true"><span style="left:' + ((lo - 1) / 9 * 100).toFixed(1) + '%;width:' + ((hi - lo) / 9 * 100).toFixed(1) +
      '%"></span><i style="left:' + ((v - 1) / 9 * 100).toFixed(1) + '%"></i></div>';
  }
  function recipeChips(rec) {
    return rec.map(function (x) {
      var g = ingById(x.ingredient_id);
      return '<span class="mx-chip">' + esc((g ? g.name : '?') + ' ' + qty(x.quantity) + (g ? (g.unit === 'piece' ? ' cái' : UNIT[g.unit]) : '')) + '</span>';
    }).join('');
  }
  function stepOpts(val, withNone) {
    return (val === '' ? '<option value="" selected>—</option>' : '') +
      (withNone ? '<option value="none"' + (val === 'none' ? ' selected' : '') + '>Không đá</option>' : '') +
      STEPS.map(function (s) { return '<option value="' + s + '"' + (String(s) === val ? ' selected' : '') + '>' + s + '%</option>' }).join('');
  }
  var MCOLS = 13; /* tổng số cột của bảng menu */
  var ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
  function renderMenu() {
    var scroll = document.querySelector('.mx-wrap'), sx = scroll ? scroll.scrollLeft : 0, sy = scroll ? scroll.scrollTop : 0;
    var head = '<div class="mx-headl"><a href="#home" class="gx-icon-btn" aria-label="Quay lại Tổng quan"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></a>' +
      '<h1>Menu</h1><span id="mPill" role="status" class="mx-pill ok"><i></i>Đã lưu hết</span></div>';
    var actions = '<div class="mx-acts"><span class="mx-ver">' + ic('screen', 16) + 'Màn hình quầy đang ở phiên bản <strong>' + (S.menu.version || 0) + '</strong></span>' +
      '<button class="gx-btn" id="reload" type="button">Bỏ thay đổi</button>' +
      '<button class="gx-btn" id="saveOnly" type="button">Chỉ lưu</button>' +
      '<button class="gx-btn pri" id="savePub" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/></svg>Lưu &amp; cập nhật màn hình quầy</button></div>';
    var kbd = function (k) { return '<kbd>' + k + '</kbd>' };
    var h = '<div class="mx-info g"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7DBBFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></svg>' +
      '<p>Khẩu vị chấm thang <strong>1–10</strong>. <strong>Mức</strong> là mức chuẩn của món, <strong>Min/Max</strong> là giới hạn khách được chỉnh. ' +
      'Để trống Mức nếu món không có thanh đó. Món trà thì cột Độ đậm hiện là “Độ đậm trà”. Nhấn ' + kbd('Enter') + ' hoặc ' + kbd('↑') + ' ' + kbd('↓') + ' để đi giữa các dòng.</p></div>' +
      '<section class="gx-card g mx-sec"><div class="gx-row-b">' +
      '<label class="gx-search sm"><span class="gx-sr">Tìm món</span>' + ic('search', 16) + '<input type="search" id="mQ" placeholder="Tìm món…" value="' + esc(S.mq || '') + '"></label>' +
      '<div class="mx-legend"><span><i></i>Khẩu vị</span><span class="gx-muted">Thanh dưới mỗi ô: vùng Min–Max, chấm tròn là Mức</span></div></div>' +
      '<div class="mx-wrap"><table class="mx-table" id="sheet"><thead>' +
      '<tr class="h1"><th scope="col" rowspan="2" class="s0">#</th><th scope="col" rowspan="2" class="s1">Tên món</th>' +
      '<th scope="col" rowspan="2" class="w-img">Ảnh</th><th scope="col" rowspan="2" class="w-price r">Giá (đ)</th><th scope="col" rowspan="2" class="w-note l">Ghi chú ngắn</th>' +
      '<th scope="colgroup" colspan="3" class="bl">Khẩu vị (1–10)</th><th scope="colgroup" colspan="2" class="bl">Gợi ý</th>' +
      '<th scope="col" rowspan="2" class="w-rec l bl">Thành phần (1 ly)</th><th scope="col" rowspan="2" class="w-chk">Hiện</th>' +
      '<th scope="col" rowspan="2" class="w-more"><span class="gx-sr">Thao tác</span></th></tr>' +
      '<tr class="h2">' + BARS.map(function (b, i) {
        return '<th scope="col" class="w-taste' + (i === 0 ? ' bl' : '') + '"><div class="mx-tname"><i></i>' + b[1] + '</div><div class="mx-tsub"><span>Mức</span><span>Min</span><span>Max</span></div></th>' }).join('') +
      '<th scope="col" class="w-sel bl">Đường</th><th scope="col" class="w-sel">Đá</th></tr></thead><tbody>';
    var stt = 0;
    S.menu.cats.forEach(function (c, ci) {
      h += '<tr class="cat" data-c="' + ci + '"><td colspan="' + MCOLS + '"><div class="mx-catbar">' +
        '<label><span class="gx-sr">Tên nhóm món</span><input type="text" class="ci mx-catname" data-cf="name" value="' + esc(c.name) + '" placeholder="Tên nhóm món"></label>' +
        '<label class="mx-show"><input type="checkbox" data-cf="is_active"' + (c.is_active ? ' checked' : '') + '>Hiện</label>' +
        '<button type="button" class="mx-ib" data-cact="up" aria-label="Đưa nhóm ' + esc(c.name) + ' lên"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>' +
        '<button type="button" class="mx-ib" data-cact="down" aria-label="Đưa nhóm ' + esc(c.name) + ' xuống"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg></button>' +
        '<span class="mx-count">' + c.items.length + ' món</span>' +
        '<button type="button" class="mx-del" data-cact="del"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>Xóa nhóm</button></div></td></tr>';
      c.items.forEach(function (it, ii) {
        stt++;
        h += '<tr class="row' + (it.is_active ? '' : ' off') + '" data-c="' + ci + '" data-i="' + ii + '">' +
          '<td class="s0">' + stt + '</td>' +
          '<td class="s1"><input type="text" class="ci b" data-f="name" value="' + esc(it.name) + '" placeholder="Tên món" aria-label="Tên món ' + stt + '"></td>' +
          '<td class="w-img"><button type="button" class="mx-img' + (it.image_path ? ' has' : '') + '" data-act="img" aria-label="Đổi ảnh ' + esc(it.name) + '">' +
            (it.image_path ? '<img src="' + esc(imgUrl(it.image_path)) + '" alt="">' : '+ Ảnh') + '</button></td>' +
          '<td><input type="text" class="ci b r" inputmode="numeric" data-f="price" value="' + esc(money(it.price)) + '" placeholder="0" aria-label="Giá ' + esc(it.name) + '"></td>' +
          '<td><input type="text" class="ci note" data-f="description" value="' + esc(it.description) + '" placeholder="VD: Cà phê đậm, béo thơm gạo rang" aria-label="Ghi chú ' + esc(it.name) + '"></td>' +
          BARS.map(function (b, bi) {
            return '<td class="mx-taste' + (bi === 1 ? ' alt' : '') + (bi === 0 ? ' bl' : '') + '" data-bar="' + b[0] + '"><div class="mx-trio">' + [0, 1, 2].map(function (k) {
              return '<input type="text" class="ci' + (k ? ' lim' : ' lv') + '" inputmode="numeric" maxlength="2" data-f="r.' + b[0] + '.' + k + '" value="' + esc(it.r[b[0]][k]) + '" aria-label="' +
                esc(it.name) + ' ' + (b[0] === 'd' && it.sk === 'tra' ? 'độ đậm trà' : b[1].toLowerCase()) + ' ' + ['mức', 'min', 'max'][k] + '"' +
                (b[0] === 'd' && k === 0 && it.sk === 'tra' ? ' title="Độ đậm trà"' : '') + '>';
            }).join('') + '</div>' + tbar(it.r[b[0]]) + '</td>';
          }).join('') +
          '<td class="bl"><div class="mx-sel"><select class="cs" data-f="sugar" aria-label="Gợi ý đường ' + esc(it.name) + '">' + stepOpts(it.sugar) + '</select>' + ARROW + '</div></td>' +
          '<td><div class="mx-sel"><select class="cs" data-f="ice" aria-label="Gợi ý đá ' + esc(it.name) + '">' + stepOpts(it.ice, true) + '</select>' + ARROW + '</div></td>' +
          '<td class="bl"><div class="mx-rec"><div class="mx-chips" title="' + esc(recipeText(it.recipe)) + '">' +
            (it.recipe.length ? recipeChips(it.recipe) : '<span class="gx-muted">Chưa có thành phần</span>') + '</div>' +
            '<button type="button" class="mx-ib sm" data-act="recipe" aria-label="Sửa thành phần ' + esc(it.name) + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button></div></td>' +
          '<td class="c"><input type="checkbox" class="gx-check" data-f="is_active"' + (it.is_active ? ' checked' : '') + ' aria-label="Hiện ' + esc(it.name) + ' trên màn hình quầy"></td>' +
          '<td class="c"><button type="button" class="mx-more" data-act="more" aria-label="Thao tác khác cho ' + esc(it.name) + '" aria-haspopup="menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></td></tr>';
      });
      h += '<tr class="add" data-c="' + ci + '"><td colspan="' + MCOLS + '"><div class="mx-addw"><button type="button" class="mx-add" data-cact="add">' + ic('plus', 15) + '<span>Thêm món vào “' + esc(c.name || 'nhóm này') + '”</span></button></div></td></tr>';
    });
    h += '</tbody></table></div>' +
      '<button class="gx-btn mx-addcat" id="addCat" type="button">' + ic('plus', 16) + 'Thêm nhóm món</button></section>' +
      '<input type="file" id="imgFile" accept="image/*" hidden>';
    app.innerHTML = shell('menu', 'Menu', '', actions, h, head);
    document.body.className = 'glass';
    bindShell();
    menuStatus(S.mstate || 'saved');
    var w = document.querySelector('.mx-wrap'); w.scrollLeft = sx; w.scrollTop = sy;
    filterMenu();
    bindMenu();
  }
  /* Tìm món: không phân biệt dấu, hoa thường */
  function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase() }
  function filterMenu() {
    var q = fold((S.mq || '').trim());
    document.querySelectorAll('#sheet tr.row').forEach(function (tr) {
      var it = S.menu.cats[+tr.getAttribute('data-c')].items[+tr.getAttribute('data-i')];
      tr.hidden = !!q && fold(it.name).indexOf(q) < 0;
    });
  }

  function itemAt(el) {
    var tr = el.closest('tr'); if (!tr) return null;
    var ci = +tr.getAttribute('data-c'), ii = tr.getAttribute('data-i');
    return { tr: tr, ci: ci, ii: ii == null ? null : +ii, cat: S.menu.cats[ci], it: ii == null ? null : S.menu.cats[ci].items[+ii] };
  }
  function clamp(v) { return Math.max(1, Math.min(10, v)) }

  /* Menu nhỏ của nút "⋯": Lên / Xuống / Xóa món */
  function openMore(btn, p) {
    closeMore();
    var m = document.createElement('div'); m.className = 'mx-pop'; m.setAttribute('role', 'menu'); m.id = 'mxPop';
    m.innerHTML = '<button type="button" role="menuitem" data-m="up">Đưa lên</button><button type="button" role="menuitem" data-m="down">Đưa xuống</button>' +
      '<button type="button" role="menuitem" data-m="del" class="bad">Xóa món</button>';
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + window.scrollY + 4) + 'px';
    m.style.left = Math.max(8, r.right + window.scrollX - m.offsetWidth) + 'px';
    m.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      closeMore(); menuAction(b.getAttribute('data-m'), p);
    };
    document.addEventListener('keydown', escMore);
    setTimeout(function () { document.addEventListener('click', outMore) });
    m.querySelector('button').focus();
  }
  function outMore(e) { if (!e.target.closest('#mxPop')) closeMore() }
  function escMore(e) { if (e.key === 'Escape') closeMore() }
  function closeMore() {
    var m = document.getElementById('mxPop'); if (m) m.remove();
    document.removeEventListener('click', outMore); document.removeEventListener('keydown', escMore);
  }
  function menuAction(act, p) {
    var L = S.menu.cats;
    if (act === 'up' || act === 'down') {
      var to = p.ii + (act === 'up' ? -1 : 1), items = p.cat.items;
      if (to >= 0 && to < items.length) { items.splice(to, 0, items.splice(p.ii, 1)[0]) }
      else if (act === 'up' && p.ci > 0) { L[p.ci - 1].items.push(items.splice(p.ii, 1)[0]) }       /* sang nhóm trên */
      else if (act === 'down' && p.ci < L.length - 1) { L[p.ci + 1].items.unshift(items.splice(p.ii, 1)[0]) } /* sang nhóm dưới */
      else return;
      setDirty(true); renderMenu();
    } else if (act === 'del') {
      if (p.it.id && !confirm('Xóa món “' + (p.it.name || 'chưa đặt tên') + '”? (Chỉ mất hẳn sau khi bấm Lưu)')) return;
      p.cat.items.splice(p.ii, 1); setDirty(true); renderMenu();
    }
  }

  function bindMenu() {
    var tb = document.querySelector('#sheet tbody');
    tb.addEventListener('input', function (e) {
      var t = e.target, p = itemAt(t); if (!p) return;
      var cf = t.getAttribute('data-cf'), f = t.getAttribute('data-f');
      if (cf === 'name') p.cat.name = t.value;
      else if (f === 'name' || f === 'description') p.it[f] = t.value;
      else if (f === 'price') p.it.price = digits(t.value);
      else if (f && f.indexOf('r.') === 0) {
        var a = f.split('.'), arr = p.it.r[a[1]], k = +a[2];
        t.value = digits(t.value).slice(0, 2); arr[k] = t.value;
        /* điền Mức mà Min/Max còn trống -> tự điền Mức ± 3 */
        if (k === 0 && t.value !== '' && arr[1] === '' && arr[2] === '') {
          var v = +t.value; arr[1] = String(clamp(v - 3)); arr[2] = String(clamp(v + 3));
          p.tr.querySelector('[data-f="r.' + a[1] + '.1"]').value = arr[1];
          p.tr.querySelector('[data-f="r.' + a[1] + '.2"]').value = arr[2];
        }
        var cell = t.closest('td'); cell.querySelector('.mx-tbar').outerHTML = tbar(arr);
      } else return;
      t.closest('td').classList.remove('bad');
      setDirty(true);
    });
    tb.addEventListener('change', function (e) {
      var t = e.target, p = itemAt(t); if (!p) return;
      var cf = t.getAttribute('data-cf'), f = t.getAttribute('data-f');
      if (cf === 'is_active') p.cat.is_active = t.checked;
      else if (f === 'is_active') { p.it.is_active = t.checked; p.tr.classList.toggle('off', !t.checked) }
      else if (f === 'sugar' || f === 'ice') p.it[f] = t.value;
      else if (cf === 'name') { var b = tb.querySelector('tr.add[data-c="' + p.ci + '"] .mx-add span'); if (b) b.textContent = 'Thêm món vào “' + (p.cat.name || 'nhóm này') + '”' }
      else return;
      setDirty(true);
    });
    tb.addEventListener('focusout', function (e) {
      var t = e.target; if (t.getAttribute('data-f') !== 'price') return;
      var p = itemAt(t); if (p) t.value = money(p.it.price);
    });
    tb.addEventListener('focusin', function (e) {
      var t = e.target; if (t.getAttribute('data-f') !== 'price') return;
      var p = itemAt(t); if (p) t.value = p.it.price;
    });
    /* Enter / mũi tên lên xuống: sang ô cùng cột ở dòng món kế tiếp (bỏ qua dòng đang bị ẩn khi tìm) */
    tb.addEventListener('keydown', function (e) {
      var t = e.target, f = t.getAttribute('data-f');
      if (!f || t.tagName === 'SELECT' || t.type === 'checkbox' || ['Enter', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      var rows = [].slice.call(tb.querySelectorAll('tr.row:not([hidden])')), i = rows.indexOf(t.closest('tr'));
      var j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length) return;
      e.preventDefault();
      var n = rows[j].querySelector('[data-f="' + f + '"]'); if (n) { n.focus(); if (n.select) n.select() }
    });
    tb.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var p = itemAt(b); if (!p) return;
      var act = b.getAttribute('data-act'), cact = b.getAttribute('data-cact'), L = S.menu.cats;
      if (act === 'more') { e.stopPropagation(); openMore(b, p) }
      else if (act === 'img') { pickImage(p.it, b) }
      else if (act === 'recipe') { openRecipe(p.it) }
      else if (cact === 'up' || cact === 'down') {
        var t2 = p.ci + (cact === 'up' ? -1 : 1); if (t2 < 0 || t2 >= L.length) return;
        L.splice(t2, 0, L.splice(p.ci, 1)[0]); setDirty(true); renderMenu();
      } else if (cact === 'del') {
        if (!confirm('Xóa nhóm “' + p.cat.name + '”' + (p.cat.items.length ? ' và ' + p.cat.items.length + ' món trong nhóm' : '') + '? (Chỉ mất hẳn sau khi bấm Lưu)')) return;
        L.splice(p.ci, 1); setDirty(true); renderMenu();
      } else if (cact === 'add') {
        S.mq = ''; p.cat.items.push(newItem(p.cat)); setDirty(true); renderMenu();
        var rows = document.querySelectorAll('tr.row[data-c="' + p.ci + '"]'), last = rows[rows.length - 1];
        if (last) last.querySelector('[data-f="name"]').focus();
      }
    });
    document.getElementById('mQ').oninput = function () { S.mq = this.value; filterMenu() };
    document.getElementById('addCat').onclick = function () {
      S.menu.cats.push({ id: null, name: '', is_active: true, items: [] }); setDirty(true); renderMenu();
      var ins = document.querySelectorAll('tr.cat input[data-cf="name"]'); ins[ins.length - 1].focus();
    };
    document.getElementById('reload').onclick = function () {
      if (S.dirty && !confirm('Bỏ mọi thay đổi chưa lưu?')) return;
      setDirty(false); viewMenu();
    };
    document.getElementById('saveOnly').onclick = function () { saveMenu(false) };
    document.getElementById('savePub').onclick = function () { saveMenu(true) };
  }

  /* Kiểm tra trước khi gửi: tô đỏ ô sai, cuộn tới ô đầu tiên */
  function validateMenu() {
    var first = null, msg = null, names = {};
    document.querySelectorAll('#sheet td.bad').forEach(function (td) { td.classList.remove('bad') });
    function bad(ci, ii, sel, m) {
      var tr = ii == null ? document.querySelector('tr.cat[data-c="' + ci + '"]') : document.querySelector('tr.row[data-c="' + ci + '"][data-i="' + ii + '"]');
      if (tr && tr.hidden) tr.hidden = false;   /* ô lỗi đang bị ẩn do ô tìm kiếm: hiện ra */
      var el = tr && tr.querySelector(sel); if (el) el.closest('td').classList.add('bad');
      if (!first) { first = el; msg = m }
    }
    var catNames = {};
    S.menu.cats.forEach(function (c, ci) {
      var cn = c.name.trim().toLowerCase();
      if (!cn) bad(ci, null, '[data-cf="name"]', 'Có nhóm món chưa có tên');
      else if (catNames[cn]) bad(ci, null, '[data-cf="name"]', 'Tên nhóm bị trùng: ' + c.name); else catNames[cn] = 1;
      c.items.forEach(function (it, ii) {
        var nm = it.name.trim(), key = nm.toLowerCase();
        if (!nm) bad(ci, ii, '[data-f="name"]', 'Có món chưa có tên (nhóm ' + c.name + ')');
        else if (names[key]) bad(ci, ii, '[data-f="name"]', 'Tên món bị trùng: ' + nm); else names[key] = 1;
        if (it.price === '') bad(ci, ii, '[data-f="price"]', 'Món “' + nm + '” chưa có giá');
        BARS.forEach(function (b) {
          var r = it.r[b[0]]; if (r[0] === '') return;
          var v = +r[0], lo = r[1] === '' ? NaN : +r[1], hi = r[2] === '' ? NaN : +r[2];
          [[v, 0], [lo, 1], [hi, 2]].forEach(function (x) {
            if (!(x[0] >= 1 && x[0] <= 10)) bad(ci, ii, '[data-f="r.' + b[0] + '.' + x[1] + '"]', 'Món “' + nm + '”: ' + b[1] + ' phải từ 1 đến 10');
          });
          if (lo > v || v > hi) bad(ci, ii, '[data-f="r.' + b[0] + '.0"]', 'Món “' + nm + '”: ' + b[1] + ' cần Min ≤ Mức ≤ Max');
        });
      });
    });
    if (first) { first.scrollIntoView({ block: 'center', inline: 'center' }); first.focus() }
    return msg;
  }
  function menuPayload() {
    return {
      categories: S.menu.cats.map(function (c) {
        return {
          id: c.id, name: c.name.trim(), is_active: c.is_active,
          items: c.items.map(function (it) {
            var a = JSON.parse(JSON.stringify(it.extra || {})), rate = {};
            BARS.forEach(function (b) {
              var r = it.r[b[0]]; if (r[0] === '') return;
              var key = b[0] === 'd' ? it.sk : (b[0] === 'n' ? 'ngot' : 'ngay');
              rate[key] = [+r[0], +r[1], +r[2]];
            });
            a.rate = rate;
            if (it.sugar !== '' || it.ice !== '') {
              a.suggest = {};
              if (it.sugar !== '') a.suggest.sugar = +it.sugar;
              if (it.ice !== '' && it.ice !== 'none') a.suggest.ice = +it.ice;
            }
            return { id: it.id, name: it.name.trim(), description: it.description.trim(), image_path: it.image_path || null,
                     price: it.price === '' ? null : +it.price, is_active: it.is_active, attributes: a, recipe: it.recipe };
          })
        };
      })
    };
  }
  function saveMenu(publish) {
    var m = validateMenu(); if (m) return toast(m, true);
    var before = S.mstate;
    menuStatus('saving');
    rpc('admin_save_menu', { p_shop_id: S.shop.id, p_data: menuPayload(), p_publish: publish })
      .then(function (d) {
        loadMenuData(d); setDirty(false); S.mstate = publish ? 'saved' : 'local'; renderMenu();
        toast(publish ? 'Đã lưu. Màn hình quầy sẽ đổi sang phiên bản ' + d.published_version + ' khi không có khách đang gọi món.'
                      : 'Đã lưu. Màn hình quầy chưa đổi cho tới khi bấm “Lưu & cập nhật màn hình quầy”.');
      })
      .catch(function (e) { menuStatus(before === 'local' && !S.dirty ? 'local' : 'dirty'); toast(errMsg(e), true) });
  }

  /* ---------------- ảnh món: nén thành WebP rồi tải lên ---------------- */
  function compress(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') return res(b);
          c.toBlob(function (b2) { b2 ? res(b2) : rej(new Error('Không xử lý được ảnh này')) }, 'image/jpeg', 0.85);
        }, 'image/webp', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('File này không phải ảnh')) };
      img.src = url;
    });
  }
  function pickImage(it, btn) {
    var inp = document.getElementById('imgFile');
    inp.value = '';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      btn.textContent = 'Đang tải…'; btn.disabled = true;
      compress(f).then(function (blob) {
        var path = S.shop.id + '/' + uid() + (blob.type === 'image/webp' ? '.webp' : '.jpg');
        return sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
          .then(function (r) { if (r.error) throw r.error; return path });
      }).then(function (path) {
        it.image_path = path; setDirty(true);
        btn.disabled = false; btn.classList.add('has'); btn.innerHTML = '<img src="' + esc(imgUrl(path)) + '" alt="">';
        toast('Đã tải ảnh lên. Nhớ bấm Lưu.');
      }).catch(function (e) {
        btn.disabled = false; btn.innerHTML = it.image_path ? '<img src="' + esc(imgUrl(it.image_path)) + '" alt="">' : '+ Ảnh';
        toast('Không tải được ảnh: ' + errMsg(e), true);
      });
    };
    inp.click();
  }

  /* ---------------- hộp thoại thành phần ---------------- */
  function openRecipe(it) {
    var rows = it.recipe.map(function (x) { return { ingredient_id: x.ingredient_id, q: qty(x.quantity) } });
    if (!rows.length) rows.push({ ingredient_id: '', q: '' });
    var m = document.createElement('div'); m.className = 'modal';
    document.body.appendChild(m);
    function opts(sel) {
      return '<option value="">— Chọn nguyên liệu —</option>' + S.menu.ingredients.map(function (g) {
        return '<option value="' + g.id + '"' + (g.id === sel ? ' selected' : '') + '>' + esc(g.name) + ' (' + UNIT[g.unit] + ')</option>';
      }).join('');
    }
    function draw() {
      m.innerHTML = '<div class="box g" role="dialog" aria-modal="true"><h3>Thành phần cho 1 ly “' + esc(it.name || 'món mới') + '”</h3>' +
        '<p class="muted" style="margin:0;font-size:13px">Mỗi ly bán ra sẽ tự trừ đúng các lượng này khỏi kho.</p>' +
        '<table><thead><tr><th>Nguyên liệu</th><th style="width:110px">Lượng</th><th></th><th></th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          var g = ingById(r.ingredient_id);
          return '<tr data-i="' + i + '"><td><select data-k="ingredient_id">' + opts(r.ingredient_id) + '</select></td>' +
            '<td><input data-k="q" inputmode="decimal" value="' + esc(r.q) + '" placeholder="VD: 20"></td>' +
            '<td class="u">' + (g ? UNIT[g.unit] : '') + '</td><td class="x"><button type="button" data-x="' + i + '" title="Bỏ dòng">✕</button></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div><button class="btn gx-btn" type="button" id="rAdd">+ Thêm dòng</button></div>' +
        '<div class="newing"><span>Chưa có trong danh sách? Tạo nguyên liệu mới:</span>' +
        '<input id="nName" placeholder="Tên, VD: Sữa đặc"><select id="nUnit"><option value="g">g</option><option value="ml">ml</option><option value="piece">cái</option></select>' +
        '<button class="btn gx-btn" type="button" id="nAdd">Tạo</button></div>' +
        '<div class="foot"><button class="btn gx-btn" type="button" id="rCancel">Hủy</button><button class="btn gx-btn pri" type="button" id="rOk">Xong</button></div></div>';
      m.querySelectorAll('[data-k]').forEach(function (el) {
        el.oninput = el.onchange = function () {
          var i = +el.closest('tr').getAttribute('data-i'); rows[i][el.getAttribute('data-k')] = el.value;
          if (el.tagName === 'SELECT') { var g = ingById(el.value); el.closest('tr').querySelector('.u').textContent = g ? UNIT[g.unit] : '' }
        };
      });
      m.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { rows.splice(+b.getAttribute('data-x'), 1); draw() } });
      m.querySelector('#rAdd').onclick = function () { rows.push({ ingredient_id: '', q: '' }); draw() };
      m.querySelector('#rCancel').onclick = close;
      m.querySelector('#nAdd').onclick = function () {
        var nm = m.querySelector('#nName').value.trim(), un = m.querySelector('#nUnit').value, b = this;
        if (!nm) return toast('Điền tên nguyên liệu', true);
        b.disabled = true;
        rpc('admin_save_stock', { p_shop_id: S.shop.id, p_rows: [{ name: nm, unit: un }] }).then(function (list) {
          S.menu.ingredients = list.filter(function (g) { return g.is_active }).map(function (g) { return { id: g.id, name: g.name, unit: g.unit } });
          var g = list.filter(function (x) { return x.name.toLowerCase() === nm.toLowerCase() })[0];
          var empty = rows.filter(function (r) { return !r.ingredient_id })[0];
          if (empty) empty.ingredient_id = g.id; else rows.push({ ingredient_id: g.id, q: '' });
          draw(); toast('Đã tạo nguyên liệu “' + g.name + '”');
        }).catch(function (e) { b.disabled = false; toast(errMsg(e), true) });
      };
      m.querySelector('#rOk').onclick = function () {
        var out = [], err = null;
        rows.forEach(function (r) {
          if (!r.ingredient_id && String(r.q).trim() === '') return;      /* dòng trống: bỏ qua */
          var q = parseQty(r.q);
          if (!r.ingredient_id) err = 'Có dòng chưa chọn nguyên liệu';
          else if (!(q > 0)) err = 'Lượng phải là số lớn hơn 0';
          else out.push({ ingredient_id: r.ingredient_id, quantity: q });
        });
        if (err) return toast(err, true);
        it.recipe = out; setDirty(true); close(); renderMenu();
      };
    }
    function close() { m.remove(); document.removeEventListener('keydown', esck) }
    function esck(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esck);
    draw();
  }


  /* =====================================================================
     BẢNG KHO NGUYÊN LIỆU (giao diện kính)
     ===================================================================== */
  function stockFrom(g) {
    return { id: g.id, name: g.name, unit: g.unit, cur: Number(g.current_stock), thr: g.low_stock_threshold == null ? '' : qty(g.low_stock_threshold),
             cost: Number(g.avg_unit_cost) || 0, is_active: g.is_active, used: g.used_in || [], add: '', addCost: '', cnt: '', dirty: false };
  }
  function viewStock() {
    loadingShell('kho', 'Kho nguyên liệu');
    var p = rpc('admin_get_stock', { p_shop_id: S.shop.id });
    var c = S.counts && S.dashShop === S.shop.id ? Promise.resolve() : loadDash().catch(function () {});
    Promise.all([p, c]).then(function (res) { S.stock = res[0].map(stockFrom); S.sfilter = 'all'; S.sq = ''; renderStock() })
      .catch(function (e) { errorShell('kho', 'Kho nguyên liệu', e) });
  }
  function stState(r) {
    var t = parseQty(r.thr);
    if (!r.is_active) return 'off';
    if (!r.id) return 'new';
    if (r.cur < 0) return 'neg';
    if (t != null && !isNaN(t) && r.cur <= t) return 'low';
    return 'ok';
  }
  var SST = { ok: ['Đủ', 'ok'], low: ['Sắp hết', 'warn'], neg: ['Âm kho', 'bad'], off: ['Ngừng dùng', 'muted'], new: ['Mới', 'info'] };
  function preview(r) {
    var c = parseQty(r.cnt), a = parseQty(r.add);
    if (c != null && !isNaN(c)) return c;
    if (a != null && !isNaN(a) && a > 0) return r.cur + a;
    return null;
  }
  function stockCell(r) {
    var s = stState(r), t = parseQty(r.thr), p = preview(r);
    var bar = s === 'neg' ? 3 : (t ? Math.max(3, Math.min(100, Math.round(r.cur / (t * 2.5) * 100))) : (r.cur > 0 ? 60 : 0));
    return '<span class="gx-stock ' + (s === 'neg' ? 'neg' : '') + '">' + (r.id ? qty(r.cur) : '0') + '</span>' +
      (p != null ? '<small class="gx-prev">→ ' + qty(p) + ' ' + UNIT[r.unit] + '</small>' : '') +
      '<span class="gx-bar"><i class="' + SST[s][1] + '" style="width:' + bar + '%"></i></span>';
  }
  function stockSummary() {
    var act = S.stock.filter(function (r) { return r.is_active && r.id });
    var low = act.filter(function (r) { return stState(r) === 'low' }).length, neg = act.filter(function (r) { return r.cur < 0 }).length;
    var val = act.reduce(function (s, r) { return s + Math.max(0, r.cur) * r.cost }, 0);
    return '<section class="gx-kpis small" aria-label="Tóm tắt kho">' +
      '<div class="gx-card g gx-kpi"><span class="gx-muted2">Nguyên liệu đang dùng</span><span class="gx-kpi-v sm">' + act.length + ' <small class="gx-muted">/ ' + S.stock.filter(function (r) { return r.id }).length + '</small></span></div>' +
      '<div class="gx-card g gx-kpi"><span class="gx-muted2">Sắp hết</span><span class="gx-kpi-v sm warn">' + low + '</span></div>' +
      '<div class="gx-card g gx-kpi"><span class="gx-muted2">Âm kho trên phần mềm</span><span class="gx-kpi-v sm bad">' + neg + '</span></div>' +
      '<div class="gx-card g gx-kpi"><span class="gx-muted2">Giá trị tồn (giá vốn BQ)</span><span class="gx-kpi-v sm">' + money(Math.round(val / 1000) * 1000) + ' đ</span></div></section>';
  }
  function renderStock() {
    var actions = '<button type="button" class="gx-btn" id="sAdd">' + ic('plus', 16) + 'Thêm nguyên liệu</button>' +
      '<button type="button" class="gx-btn pri" id="sSave">' + ic('save', 16) + 'Lưu thay đổi</button>';
    var sub = '<span id="st" class="st"></span> · Sửa trực tiếp như bảng tính. “Nhập thêm” tạo phiếu nhập, “Đếm thực tế” điều chỉnh tồn. Mỗi ly bán xong, kho tự trừ theo Thành phần ở bảng Menu.';
    var body = '<div id="sSum">' + stockSummary() + '</div>' +
      '<section class="gx-card g gx-sheet"><div class="gx-row-b"><div class="gx-chips" id="sChips"></div>' +
      '<label class="gx-search sm"><span class="gx-sr">Tìm nguyên liệu</span>' + ic('search', 16) + '<input type="search" id="sQ" placeholder="Tìm nguyên liệu…" value="' + esc(S.sq || '') + '"></label></div>' +
      '<div class="gx-tablewrap boxed"><table class="gx-table gx-stk" id="stk"><thead><tr>' +
      '<th scope="col">Nguyên liệu</th><th scope="col">Đơn vị</th><th scope="col" style="min-width:9rem">Tồn hiện tại</th>' +
      '<th scope="col" class="in">Nhập thêm</th><th scope="col" class="in">Tiền nhập (đ)</th><th scope="col" class="in">Đếm thực tế</th>' +
      '<th scope="col" class="r">Báo sắp hết</th><th scope="col" class="r">Giá vốn BQ</th><th scope="col">Dùng trong món</th><th scope="col" class="c">Đang dùng</th></tr></thead><tbody id="sBody"></tbody></table></div>' +
      '<div class="gx-savebar" id="sBar" hidden><span id="sBarT"></span><div><button type="button" class="gx-btn ghost" id="sReload">Hủy thay đổi</button>' +
      '<button type="button" class="gx-btn pri" id="sSave2">Lưu thay đổi</button></div></div></section>';
    app.innerHTML = shell('kho', 'Kho nguyên liệu', sub, actions, body);
    document.body.className = 'glass';
    bindShell(); setDirty(S.dirty);
    drawStockRows();
    var tb = document.getElementById('sBody');
    function rowOf(t) { var tr = t.closest('tr'); return tr && tr.hasAttribute('data-i') ? { tr: tr, r: S.stock[+tr.getAttribute('data-i')] } : null }
    tb.addEventListener('input', function (e) {
      var t = e.target, p = rowOf(t), f = t.getAttribute('data-f'); if (!p || !f) return;
      if (f === 'addCost') { t.value = money(digits(t.value)); p.r.addCost = digits(t.value) }
      else if (f !== 'is_active' && f !== 'unit') p.r[f] = t.value;
      t.closest('td').classList.remove('bad');
      p.tr.querySelector('[data-cur]').innerHTML = stockCell(p.r);
      p.r.dirty = true; setDirty(true); drawSaveBar();
    });
    tb.addEventListener('change', function (e) {
      var t = e.target, p = rowOf(t), f = t.getAttribute('data-f'); if (!p) return;
      if (f === 'is_active') { p.r.is_active = t.checked; p.tr.classList.toggle('off', !t.checked) }
      else if (f === 'unit') p.r.unit = t.value;
      else return;
      p.tr.querySelector('[data-cur]').innerHTML = stockCell(p.r);
      p.r.dirty = true; setDirty(true); drawSaveBar();
    });
    tb.addEventListener('keydown', function (e) {
      var t = e.target, f = t.getAttribute('data-f');
      if (!f || t.tagName === 'SELECT' || t.type === 'checkbox' || ['Enter', 'ArrowDown', 'ArrowUp'].indexOf(e.key) < 0) return;
      var rows = [].slice.call(tb.querySelectorAll('tr[data-i]')), i = rows.indexOf(t.closest('tr')), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length) return;
      e.preventDefault(); var n = rows[j].querySelector('[data-f="' + f + '"]'); if (n) { n.focus(); n.select && n.select() }
    });
    document.getElementById('sQ').oninput = function () { S.sq = this.value; drawStockRows() };
    document.getElementById('sAdd').onclick = function () {
      S.stock.unshift({ id: null, name: '', unit: 'g', cur: 0, thr: '', cost: 0, is_active: true, used: [], add: '', addCost: '', cnt: '', dirty: true });
      S.sfilter = 'all'; S.sq = ''; document.getElementById('sQ').value = '';
      setDirty(true); drawStockRows(); drawSaveBar();
      var n = tb.querySelector('tr[data-i="0"] [data-f="name"]'); if (n) n.focus();
    };
    document.getElementById('sReload').onclick = function () {
      if (S.dirty && !confirm('Bỏ mọi thay đổi chưa lưu?')) return;
      setDirty(false); viewStock();
    };
    document.getElementById('sSave').onclick = saveStock;
    document.getElementById('sSave2').onclick = saveStock;
    drawSaveBar();
  }
  function drawStockRows() {
    var f = S.sfilter || 'all', q = (S.sq || '').trim().toLowerCase();
    var counts = { all: S.stock.length, low: 0, neg: 0, off: 0 };
    S.stock.forEach(function (r) { var s = stState(r); if (counts[s] !== undefined) counts[s]++ });
    document.getElementById('sChips').innerHTML = [['all', 'Tất cả'], ['low', 'Sắp hết'], ['neg', 'Âm kho'], ['off', 'Ngừng dùng']].map(function (c) {
      return '<button type="button" class="gx-chip" data-sf="' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + c[1] + ' · ' + counts[c[0]] + '</button>' }).join('');
    document.querySelectorAll('[data-sf]').forEach(function (b) { b.onclick = function () { S.sfilter = b.getAttribute('data-sf'); drawStockRows() } });
    var html = S.stock.map(function (r, i) {
      var s = stState(r);
      if (f !== 'all' && s !== f && !(r.dirty && !r.id)) return '';
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.id) return '';
      var lockUnit = r.id && r.cur !== 0, st = SST[s];
      return '<tr data-i="' + i + '" class="' + (r.is_active ? '' : 'off') + (r.dirty ? ' changed' : '') + '">' +
        '<td><div class="gx-ing"><input type="text" class="gx-in name" data-f="name" value="' + esc(r.name) + '" placeholder="Tên nguyên liệu" aria-label="Tên nguyên liệu">' +
          '<span class="gx-status ' + st[1] + '"><i></i>' + st[0] + '</span></div></td>' +
        '<td>' + (lockUnit ? '<span class="gx-muted2">' + UNIT[r.unit] + '</span>'
          : '<select class="gx-in sel" data-f="unit" aria-label="Đơn vị">' + ['g', 'ml', 'piece'].map(function (u) { return '<option value="' + u + '"' + (u === r.unit ? ' selected' : '') + '>' + UNIT[u] + '</option>' }).join('') + '</select>') + '</td>' +
        '<td data-cur>' + stockCell(r) + '</td>' +
        '<td><input type="text" class="gx-in num' + (r.add ? ' hl' : '') + '" inputmode="decimal" data-f="add" value="' + esc(r.add) + '" placeholder="—" aria-label="Nhập thêm ' + esc(r.name) + '"></td>' +
        '<td><input type="text" class="gx-in num wide' + (r.addCost ? ' hl' : '') + '" inputmode="numeric" data-f="addCost" value="' + esc(money(r.addCost)) + '" placeholder="—" aria-label="Tiền nhập ' + esc(r.name) + '"></td>' +
        '<td><input type="text" class="gx-in num' + (r.cnt ? ' hl' : '') + '" inputmode="decimal" data-f="cnt" value="' + esc(r.cnt) + '" placeholder="—" aria-label="Đếm thực tế ' + esc(r.name) + '"></td>' +
        '<td class="r"><input type="text" class="gx-in num sm" inputmode="decimal" data-f="thr" value="' + esc(r.thr) + '" placeholder="—" aria-label="Báo sắp hết ' + esc(r.name) + '"></td>' +
        '<td class="r gx-muted2 nowrap">' + (r.cost ? money(Math.round(r.cost)) + ' đ/' + UNIT[r.unit] : '—') + '</td>' +
        '<td class="gx-used" title="' + esc(r.used.join(', ')) + '">' + (r.used.length ? esc(r.used.slice(0, 2).join(', ')) + (r.used.length > 2 ? ', +' + (r.used.length - 2) + ' món' : '') : '<span class="gx-muted">Chưa dùng trong món nào</span>') + '</td>' +
        '<td class="c"><input type="checkbox" class="gx-check" data-f="is_active"' + (r.is_active ? ' checked' : '') + ' aria-label="' + esc(r.name) + ' đang dùng"></td></tr>';
    }).join('');
    document.getElementById('sBody').innerHTML = html || '<tr><td colspan="10" class="gx-muted" style="padding:1rem;text-align:center">' +
      (S.stock.length ? 'Không có nguyên liệu nào khớp.' : 'Chưa có nguyên liệu nào. Bấm “Thêm nguyên liệu”.') + '</td></tr>';
  }
  function drawSaveBar() {
    var ch = S.stock.filter(function (r) { return r.dirty });
    var bar = document.getElementById('sBar'); if (!bar) return;
    bar.hidden = !ch.length;
    if (!ch.length) return;
    var parts = ch.slice(0, 3).map(function (r) {
      var a = parseQty(r.add), c = parseQty(r.cnt);
      if (!r.id) return 'thêm “' + (r.name || 'nguyên liệu mới') + '”';
      if (a > 0) return 'nhập thêm ' + qty(a) + ' ' + UNIT[r.unit] + ' ' + r.name;
      if (c != null && !isNaN(c)) return 'đếm lại ' + r.name;
      return 'sửa ' + r.name;
    });
    document.getElementById('sBarT').textContent = ch.length + ' dòng có thay đổi chưa lưu: ' + parts.join(', ') + (ch.length > 3 ? '…' : '') + '.';
  }
  function saveStock() {
    var rows = [], first = null, msg = null, names = {};
    document.querySelectorAll('#stk td.bad').forEach(function (td) { td.classList.remove('bad') });
    S.stock.forEach(function (r, i) {
      var tr = document.querySelector('#stk tr[data-i="' + i + '"]');
      function bad(f, m) {
        var el = tr && tr.querySelector('[data-f="' + f + '"]'); if (el) el.closest('td').classList.add('bad');
        if (!msg) { first = el; msg = m }
      }
      var nm = r.name.trim(), key = nm.toLowerCase();
      if (!nm) { if (!r.id && !r.add && !r.cnt) return; bad('name', 'Có nguyên liệu chưa có tên') }
      else if (names[key]) bad('name', 'Tên nguyên liệu bị trùng: ' + nm); else names[key] = 1;
      var thr = parseQty(r.thr), add = parseQty(r.add), cnt = parseQty(r.cnt);
      if (isNaN(thr) || thr < 0) bad('thr', 'Mức báo sắp hết phải là số');
      if (isNaN(add) || add < 0) bad('add', 'Nhập thêm phải là số dương');
      if (isNaN(cnt) || cnt < 0) bad('cnt', 'Đếm thực tế phải là số');
      if (!r.dirty) return;
      rows.push({ id: r.id, name: nm, unit: r.unit, low_stock_threshold: thr, is_active: r.is_active,
                  add_qty: add, add_cost: r.addCost === '' ? null : +r.addCost, counted: cnt });
    });
    if (msg) {
      if (!first) { S.sfilter = 'all'; S.sq = ''; drawStockRows() }
      if (first) first.focus();
      return toast(msg, true);
    }
    if (!rows.length) return toast('Không có gì thay đổi');
    document.querySelectorAll('#sSave,#sSave2').forEach(function (b) { b.disabled = true });
    rpc('admin_save_stock', { p_shop_id: S.shop.id, p_rows: rows }).then(function (list) {
      S.stock = list.map(stockFrom); setDirty(false);
      return loadDash().catch(function () {});
    }).then(function () { renderStock(); toast('Đã lưu kho') })
      .catch(function (e) { document.querySelectorAll('#sSave,#sSave2').forEach(function (b) { b.disabled = false }); toast(errMsg(e), true) });
  }

  /* =====================================================================
     TRỢ LÝ AI (theo thiết kế "Trợ lý AI" + thẻ trên Tổng quan)
     Mới có giao diện: bấm câu hỏi gợi ý hoặc gõ rồi Enter chỉ báo "chưa hoàn thiện".
     ===================================================================== */
  var AI_Q = ['Nguyên liệu nào cần nhập?', 'So sánh doanh thu tuần này với tuần trước', 'Tuần này món nào bán chạy nhất?',
              'Khách chuyển thiếu tiền thì xử lý sao?', 'Làm sao thêm máy quầy mới?'];
  function aiSoon() { toast('Trợ lý AI chưa hoàn thiện. Tính năng đang được làm, sẽ có trong bản sau.') }
  function aiLogo(cls) { return '<img src="logo.webp" alt="" class="' + cls + '">' }
  function aiComposer(id, ph) {
    return '<div class="ai-cmp"><label><span class="gx-sr">Câu hỏi cho trợ lý</span><input type="text" id="' + id + '" placeholder="' + ph + '" autocomplete="off"></label>' +
      '<button type="button" class="ai-send" data-ai-send="' + id + '" aria-label="Gửi câu hỏi" disabled>' + ic('arrow', 18) + '</button></div>';
  }
  /* Khung nhập: nút gửi chỉ bật khi đã gõ; Enter hoặc bấm gửi -> báo chưa hoàn thiện */
  function bindComposer(root) {
    root.querySelectorAll('.ai-cmp input').forEach(function (inp) {
      var btn = root.querySelector('[data-ai-send="' + inp.id + '"]');
      inp.oninput = function () { btn.disabled = !inp.value.trim(); if (inp.id === 'aiDockQ') S.aiDraft = inp.value };
      inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim()) aiSoon() } };
      btn.onclick = function () { if (inp.value.trim()) aiSoon() };
    });
  }
  /* Thẻ trên Tổng quan */
  function aiCard() {
    return '<section class="gx-card g ai-card" aria-label="Trợ lý AI"><div class="ai-who">' + aiLogo('ai-ava lg') +
      '<div><b>Trợ lý Way Up</b><span>Hỏi nhanh về quán</span></div></div>' +
      '<div class="ai-card-r"><button type="button" class="ai-fake" id="aiOpen">' + ic('spark', 16) + '<span>Hỏi trợ lý về doanh thu, món, kho…</span><i>' + ic('arrow', 16) + '</i></button>' +
      '<div class="ai-chips">' + AI_Q.slice(0, 3).map(function (q) { return '<button type="button" class="ai-chip" data-aiq>' + esc(q) + '</button>' }).join('') + '</div></div></section>';
  }
  function bindAiCard() {
    var o = document.getElementById('aiOpen'); if (o) o.onclick = function () { S.aiOpen = true; aiDock(true) };
    document.querySelectorAll('.ai-card [data-aiq]').forEach(function (b) { b.onclick = aiSoon });
  }
  /* Nút nổi "Hỏi trợ lý" + khung chat nhỏ ở góc phải dưới (nằm ngoài #app để không mất khi Tổng quan tự cập nhật) */
  function dockOff() { var d = document.getElementById('aiDock'); if (d) d.remove(); S.aiOpen = false; S.aiDraft = ''; document.removeEventListener('keydown', dockEsc) }
  function dockEsc(e) { if (e.key === 'Escape' && S.aiOpen) { S.aiOpen = false; aiDock(true); var f = document.getElementById('aiFab'); if (f) f.focus() } }
  function aiDock(redraw) {
    var d = document.getElementById('aiDock');
    if (d && !redraw) return;
    if (!d) { d = document.createElement('div'); d.id = 'aiDock'; document.body.appendChild(d) }
    if (!S.aiOpen) {
      d.innerHTML = '<button type="button" class="ai-fab g" id="aiFab">' + aiLogo('ai-ava') + 'Hỏi trợ lý</button>';
      document.getElementById('aiFab').onclick = function () { S.aiOpen = true; aiDock(true) };
      document.removeEventListener('keydown', dockEsc);
      return;
    }
    d.innerHTML = '<div class="ai-pop g" role="dialog" aria-label="Trợ lý Way Up">' +
      '<div class="ai-pop-h">' + aiLogo('ai-ava md') + '<div class="ai-who-t"><b>Trợ lý Way Up</b><span>Chỉ đọc dữ liệu quán, không tự sửa gì</span></div>' +
        '<a href="#troly" class="ai-ib" aria-label="Mở trang Trợ lý đầy đủ">' + ic('ext', 17) + '</a>' +
        '<button type="button" class="ai-ib" id="aiClose" aria-label="Đóng trợ lý">' + ic('x', 18) + '</button></div>' +
      '<div class="ai-pop-b" role="log" aria-live="polite"><div class="ai-msg">' + aiLogo('ai-ava sm') +
        '<p class="ai-bub">Chào bạn. Tôi trả lời được về doanh thu, món bán chạy, kho và cách dùng trang quản lý. Bạn muốn hỏi gì?</p></div></div>' +
      '<div class="ai-pop-f"><div class="ai-chips row">' + AI_Q.slice(0, 3).map(function (q) { return '<button type="button" class="ai-chip" data-aiq>' + esc(q) + '</button>' }).join('') + '</div>' +
        aiComposer('aiDockQ', 'Nhập câu hỏi…') + '<span class="ai-note">Trợ lý có thể nhầm. Kiểm tra lại số liệu quan trọng.</span></div></div>';
    d.querySelectorAll('[data-aiq]').forEach(function (b) { b.onclick = aiSoon });
    document.getElementById('aiClose').onclick = function () { S.aiOpen = false; aiDock(true); var f = document.getElementById('aiFab'); if (f) f.focus() };
    bindComposer(d);
    var q = document.getElementById('aiDockQ');
    if (S.aiDraft) { q.value = S.aiDraft; q.oninput() }
    q.focus();
    document.addEventListener('keydown', dockEsc);
  }
  /* Trang Trợ lý AI */
  function viewAI() {
    loadingShell('troly', 'Trợ lý AI');
    needCounts().then(renderAI);
  }
  function renderAI() {
    var used = 0, limit = 300;
    var actions = '<div class="ai-use"><span>Tháng này đã hỏi <strong>' + used + ' / ' + limit + '</strong> câu</span><i aria-hidden="true"><b style="width:' + Math.round(used / limit * 100) + '%"></b></i></div>';
    var body = '<div class="ai-wrap">' +
      '<section class="gx-card g ai-convs" aria-label="Các cuộc trò chuyện"><button type="button" class="gx-btn pri" id="aiNew">' + ic('plus', 16) + 'Cuộc trò chuyện mới</button>' +
        '<p class="ai-none">Chưa có cuộc trò chuyện nào.</p>' +
        '<p class="ai-foot">Cuộc trò chuyện chỉ bạn xem được. Tự xóa sau 90 ngày.</p></section>' +
      '<section class="gx-card g ai-chat" aria-label="Trò chuyện"><div class="ai-chat-h">' + aiLogo('ai-ava md') +
        '<div class="ai-who-t"><h2>Cuộc trò chuyện mới</h2><span><i class="ai-on"></i>Trợ lý Way Up · đọc dữ liệu quán ' + esc(S.shop.name) + '</span></div></div>' +
        '<div class="ai-log" role="log" aria-live="polite"><div class="ai-empty">' + aiLogo('ai-ava xl') +
          '<div><b>Hôm nay bạn muốn hỏi gì?</b><span>Trợ lý trả lời dựa trên đơn hàng, menu và kho của quán. Thử một câu bên dưới.</span></div>' +
          '<div class="ai-sug">' + AI_Q.slice(0, 4).map(function (q) { return '<button type="button" class="ai-sug-b" data-aiq>' + ic('spark', 16) + '<span>' + esc(q) + '</span></button>' }).join('') + '</div></div></div>' +
        aiComposer('aiQ', 'Hỏi về doanh thu, món, kho…') +
        '<p class="ai-note">Trợ lý có thể nhầm. Kiểm tra lại số liệu quan trọng trước khi quyết định.</p></section></div>';
    app.innerHTML = shell('troly', 'Trợ lý AI', 'Hỏi về doanh thu, món bán chạy, kho hay cách dùng trang quản lý. Trợ lý chỉ đọc dữ liệu của quán, không tự sửa gì.', actions, body);
    document.body.className = 'glass';
    bindShell();
    document.querySelectorAll('.ai-chat [data-aiq]').forEach(function (b) { b.onclick = aiSoon });
    document.getElementById('aiNew').onclick = aiSoon;
    bindComposer(app);
  }

  /* =====================================================================
     NHẬT KÝ THAY ĐỔI (theo thiết kế "Nhật ký thay đổi")
     Người sửa hiện bằng email tài khoản + chức vụ trong quán.
     ===================================================================== */
  var ROLE = { owner: 'Chủ quán', manager: 'Quản lý', cashier: 'Thu ngân', kiosk: 'Màn hình quầy' };
  function who(email, role) {
    if (!email) return 'Hệ thống';
    return email + ' · ' + (role ? (ROLE[role] || role) : 'Không còn trong quán');
  }
  function needCounts() { return S.counts && S.dashShop === S.shop.id ? Promise.resolve() : loadDash().catch(function () {}) }
  var LTY = { item: 'Món', price: 'Giá', recipe: 'Công thức', topping: 'Topping', member: 'Nhân viên' };
  var LDOT = { all: '#D5D8DD', price: '#FCD34D', item: '#93C5FD', recipe: '#67E8F9', topping: '#C4B5FD', member: '#6EE7B7' };
  var RATE_L = { dam: 'Độ đậm', tra: 'Độ đậm trà', ngot: 'Độ ngọt', ngay: 'Độ ngậy' };
  function dm(d) { var p = d.split('-'); return p[2] + '/' + p[1] }
  function dayDiff(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5) }
  function vnd(v) { return v == null ? '—' : money(v) + ' đ' }
  function trio(r) { return r ? r[0] + ' · ' + r[1] + '–' + r[2] : '—' }
  function pctv(v) { return v == null ? '—' : v + '%' }
  function iceTxt(v) { return v == null ? 'không đá' : v + '%' }
  function unitQ(v, u) { return v == null ? '—' : qty(v) + ' ' + (UNIT[u] || u || '') }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }
  function fk(D, k) { return D.filter(function (f) { return f.k === k })[0] }

  /* Một dòng tóm tắt cho mỗi thay đổi */
  function logSum(c) {
    var D = c.diff || [], f0 = D[0] || {}, parts;
    if (c.type === 'price') return c.act === 'INSERT' ? 'Đặt giá ' + vnd(f0.a) : 'Giá ' + vnd(f0.b) + ' → ' + vnd(f0.a);
    if (c.type === 'recipe') {
      parts = D.map(function (f) {
        if (f.b == null) return 'thêm ' + f.n + ' · ' + unitQ(f.a, f.u);
        if (f.a == null) return 'bỏ ' + f.n;
        return f.n + ' ' + unitQ(f.b, f.u) + ' → ' + unitQ(f.a, f.u);
      });
      return cap(parts.slice(0, 2).join(', ') + (parts.length > 2 ? ', +' + (parts.length - 2) + ' nguyên liệu' : ''));
    }
    if (c.type === 'member') {
      if (c.act === 'INSERT') return 'Thêm vào quán với vai trò ' + (ROLE[(fk(D, 'role') || {}).a] || '');
      if (c.act === 'DELETE') return 'Xóa khỏi quán';
      return cap(D.map(function (f) {
        return f.k === 'role' ? 'đổi vai trò ' + (ROLE[f.b] || '—') + ' → ' + (ROLE[f.a] || '—') : (f.a ? 'mở lại tài khoản' : 'khóa tài khoản');
      }).join(', '));
    }
    if (c.type === 'topping') {
      if (c.act === 'INSERT') { var tp = fk(D, 'price'); return 'Thêm topping' + (tp ? ', giá ' + vnd(tp.a) : '') }
      if (c.act === 'DELETE') return 'Xóa topping';
      return cap(D.map(function (f) {
        return f.k === 'price' ? 'giá ' + vnd(f.b) + ' → ' + vnd(f.a) : f.k === 'name' ? 'đổi tên từ “' + f.b + '”' : (f.a ? 'bán lại' : 'ngừng bán');
      }).join(', '));
    }
    if (c.act === 'INSERT') { var ct = fk(D, 'cat'); return 'Thêm món mới' + (ct && ct.a ? ' vào nhóm ' + ct.a : '') }
    if (c.act === 'DELETE') return 'Xóa khỏi menu';
    return cap(D.map(function (f) {
      var k = f.k;
      if (k === 'name') return 'đổi tên từ “' + f.b + '”';
      if (k === 'cat') return 'chuyển sang nhóm ' + (f.a || '—');
      if (k === 'desc') return 'sửa ghi chú';
      if (k === 'image') return 'đổi ảnh';
      if (RATE_L[k]) {
        var l = RATE_L[k].toLowerCase();
        if (!f.b) return 'thêm ' + l; if (!f.a) return 'bỏ ' + l;
        if (f.b[0] !== f.a[0]) return l + ' ' + f.b[0] + ' → ' + f.a[0];
        return l + ' ' + f.b[1] + '–' + f.b[2] + ' → ' + f.a[1] + '–' + f.a[2];
      }
      if (k === 'sugar') return 'gợi ý đường ' + pctv(f.b) + ' → ' + pctv(f.a);
      if (k === 'ice') return 'gợi ý đá ' + iceTxt(f.b) + ' → ' + iceTxt(f.a);
      if (k === 'active') return f.a ? 'hiện lại trên menu' : 'ẩn khỏi menu';
      return k;
    }).join(', '));
  }
  /* Bảng Trước / Sau ở khung chi tiết: [mục, trước, sau] */
  function logRows(c) {
    var D = c.diff || [];
    if (c.type === 'price') return D.map(function (f) { return ['Giá (size ' + (f.v || 'Mặc định') + ')', vnd(f.b), vnd(f.a)] });
    if (c.type === 'recipe') return D.map(function (f) { return [f.n, unitQ(f.b, f.u), unitQ(f.a, f.u)] });
    if (c.type === 'item' && c.act === 'DELETE') return [['Trên menu', 'Có', 'Đã xóa']];
    return D.filter(function (f) { return !(c.act === 'INSERT' && f.k === 'active' && f.a === true && c.type !== 'member') }).map(function (f) {
      var k = f.k;
      if (RATE_L[k]) return [RATE_L[k] + ' (Mức · Min–Max)', trio(f.b), trio(f.a)];
      if (k === 'sugar') return ['Gợi ý đường', pctv(f.b), pctv(f.a)];
      if (k === 'ice') return ['Gợi ý đá', f.b == null && c.act === 'INSERT' ? '—' : cap(iceTxt(f.b)), cap(iceTxt(f.a))];
      if (k === 'active') {
        var on = c.type === 'member' ? ['Đang hoạt động', 'Đã khóa'] : c.type === 'topping' ? ['Đang bán', 'Ngừng bán'] : ['Có', 'Không'];
        return [c.type === 'member' ? 'Trạng thái' : c.type === 'topping' ? 'Bán' : 'Hiện trên quầy',
                f.b == null ? '—' : on[f.b ? 0 : 1], f.a == null ? '—' : on[f.a ? 0 : 1]];
      }
      if (k === 'role') return ['Vai trò', ROLE[f.b] || '—', ROLE[f.a] || '—'];
      if (k === 'price') return ['Giá', vnd(f.b), vnd(f.a)];
      if (k === 'image') return ['Ảnh món', f.b ? 'Ảnh cũ' : 'Chưa có', f.a ? 'Ảnh mới' : 'Không có'];
      var L = { name: c.type === 'topping' ? 'Tên topping' : 'Tên món', cat: 'Nhóm', desc: 'Ghi chú' }[k] || k;
      return [L, f.b == null ? '—' : String(f.b), f.a == null ? '—' : String(f.a)];
    });
  }
  function logKind(g) {
    if (g.staff) return ['Nhân viên', 'muted'];
    if (g.version) return ['Lưu & cập nhật màn hình quầy · v' + g.version, 'ok'];
    if (g.later) return ['Chỉ lưu · lên quầy ở v' + g.later, 'info'];
    return ['Chỉ lưu · quầy chưa cập nhật', 'info'];
  }
  function logAva(g) {
    var bg = g.role === 'owner' ? ACCENT : g.role === 'manager' ? '#2F6FE0' : '#4B5563';
    var t = g.email ? g.email.charAt(0).toUpperCase() : 'HT';
    return '<span class="lg-ava" style="background:' + bg + '" aria-hidden="true">' + esc(t) + '</span>';
  }

  function viewLog() {
    loadingShell('nhatky', 'Nhật ký thay đổi');
    Promise.all([rpc('admin_get_audit', { p_shop_id: S.shop.id, p_days: 30 }), needCounts()]).then(function (r) {
      var d = r[0] || {};
      S.log = { now: d.now, groups: (d.groups || []).map(function (g, gi) {
        g.day = g.at.slice(0, 10); g.time = g.at.slice(11, 16); g.key = g.actor_id || 'sys'; g.who = who(g.email, g.role);
        (g.changes || []).forEach(function (c, ci) {
          c.id = gi + '-' + ci; c.g = g; c.sum = logSum(c);
          c.fold = fold(c.entity + ' ' + c.sum + ' ' + (g.email || '') + ' ' + (ROLE[g.role] || ''));
        });
        return g;
      }) };
      if (!S.lf || S.lf.shop !== S.shop.id) S.lf = { shop: S.shop.id, range: '7d', type: 'all', actor: 'all', q: '', sel: null, limit: 20, open: {} };
      renderLog();
    }).catch(function (e) { errorShell('nhatky', 'Nhật ký thay đổi', e) });
  }
  function logPass(g, c, anyType) {
    var f = S.lf, dd = dayDiff(S.log.now.slice(0, 10), g.day);
    if (f.range === 'today' && dd !== 0) return false;
    if (f.range === '7d' && dd > 6) return false;
    if (f.actor !== 'all' && g.key !== f.actor) return false;
    if (!anyType && f.type !== 'all' && c.type !== f.type) return false;
    if (f.q && c.fold.indexOf(fold(f.q.trim())) < 0) return false;
    return true;
  }
  function renderLog() {
    var f = S.lf, seen = {}, actors = [];
    S.log.groups.forEach(function (g) { if (!seen[g.key]) { seen[g.key] = 1; actors.push(g) } });
    if (f.actor !== 'all' && !seen[f.actor]) f.actor = 'all';
    var actions = '<label class="gx-search lg-q"><span class="gx-sr">Tìm trong nhật ký</span>' + ic('search', 16) +
      '<input type="search" id="lgQ" placeholder="Tìm theo tên món, nhân viên…" value="' + esc(f.q) + '"></label>';
    var bar = '<section class="lg-bar g" aria-label="Bộ lọc">' +
      '<div class="gx-tabs" role="tablist" aria-label="Khoảng thời gian" id="lgR"></div>' +
      '<div class="lg-chips" id="lgC"></div>' +
      '<label class="lg-actor">Người sửa<select id="lgA"><option value="all">Tất cả</option>' + actors.map(function (g) {
        return '<option value="' + esc(g.key) + '"' + (f.actor === g.key ? ' selected' : '') + '>' + esc(g.who) + '</option>' }).join('') +
      '</select>' + ic('down', 14) + '</label></section>';
    var body = bar + '<div class="lg-body"><section class="lg-main" aria-label="Danh sách thay đổi" id="lgL"></section>' +
      '<div class="lg-back" id="lgBk"></div>' +
      '<aside class="gx-card g lg-aside" id="lgS" aria-label="Chi tiết thay đổi"></aside></div>';
    app.innerHTML = shell('nhatky', 'Nhật ký thay đổi', 'Ai đã sửa gì, lúc nào. Chỉ chủ quán và quản lý xem được.', actions, body);
    document.body.className = 'glass';
    bindShell();
    drawLog();
    document.getElementById('lgQ').oninput = function () { f.q = this.value; f.limit = 20; drawLog() };
    document.getElementById('lgA').onchange = function () { f.actor = this.value; f.limit = 20; drawLog() };
    document.getElementById('lgR').onclick = function (e) {
      var b = e.target.closest('[data-r]'); if (!b) return; f.range = b.getAttribute('data-r'); f.limit = 20; drawLog();
    };
    document.getElementById('lgC').onclick = function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return; f.type = b.getAttribute('data-t'); f.limit = 20; drawLog();
    };
    document.getElementById('lgL').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-c')) { f.sel = b.getAttribute('data-c'); drawLogList(); drawLogSel(); if (isSheet()) openSheet(b.getAttribute('data-c')); return }
      if (b.hasAttribute('data-open')) { f.open[b.getAttribute('data-open')] = 1; drawLogList(); return }
      if (b.id === 'lgOld') {
        if (b.getAttribute('data-next')) f.range = b.getAttribute('data-next'); else f.limit += 20;
        drawLog();
      }
    };
    document.getElementById('lgBk').onclick = closeSheet;
  }
  function isSheet() { return window.matchMedia && window.matchMedia('(max-width: 859.98px)').matches }
  function openSheet() {
    var a = document.getElementById('lgS'); a.classList.add('open'); document.getElementById('lgBk').classList.add('open');
    var x = document.getElementById('lgX'); if (x) x.focus();
    document.addEventListener('keydown', escSheet);
  }
  function closeSheet() {
    var a = document.getElementById('lgS'); if (!a || !a.classList.contains('open')) return;
    a.classList.remove('open'); document.getElementById('lgBk').classList.remove('open');
    document.removeEventListener('keydown', escSheet);
    var r = document.querySelector('.lg-row[aria-pressed="true"]'); if (r) r.focus();
  }
  function escSheet(e) { if (e.key === 'Escape') closeSheet() }
  function drawLog() {
    var f = S.lf, counts = { all: 0, price: 0, item: 0, recipe: 0, topping: 0, member: 0 };
    S.log.groups.forEach(function (g) { g.changes.forEach(function (c) { if (logPass(g, c, true)) { counts.all++; counts[c.type]++ } }) });
    document.getElementById('lgR').innerHTML = [['today', 'Hôm nay'], ['7d', '7 ngày'], ['30d', '30 ngày']].map(function (r) {
      return '<button type="button" role="tab" data-r="' + r[0] + '" aria-selected="' + (f.range === r[0]) + '">' + r[1] + '</button>' }).join('');
    document.getElementById('lgC').innerHTML = [['all', 'Tất cả']].concat(['price', 'item', 'recipe', 'topping', 'member'].map(function (k) { return [k, LTY[k]] })).map(function (c) {
      return '<button type="button" class="lg-chip" data-t="' + c[0] + '" aria-pressed="' + (f.type === c[0]) + '"><i style="background:' + LDOT[c[0]] + '"></i>' + c[1] + '<small>' + counts[c[0]] + '</small></button>' }).join('');
    drawLogList(); drawLogSel();
  }
  function drawLogList() {
    var f = S.lf, today = S.log.now.slice(0, 10), days = [], cur = null, shown = 0, more = false, first = null, selOk = false;
    S.log.groups.forEach(function (g) {
      var ch = g.changes.filter(function (c) { return logPass(g, c) });
      if (!ch.length) return;
      if (shown >= f.limit) { more = true; return }
      shown++;
      if (!first) first = ch[0].id;
      ch.forEach(function (c) { if (c.id === f.sel) selOk = true });
      if (!cur || cur.day !== g.day) { cur = { day: g.day, n: 0, cards: [] }; days.push(cur) }
      cur.n += ch.length; cur.cards.push({ g: g, ch: ch });
    });
    if (!selOk) f.sel = first;
    var html = days.map(function (d) {
      var dd = dayDiff(today, d.day);
      var label = (dd === 0 ? 'Hôm nay' : dd === 1 ? 'Hôm qua' : WD[new Date(d.day + 'T00:00:00Z').getUTCDay()]) + ' · ' + dm(d.day);
      return '<div class="lg-day"><h2>' + label + '<span>' + d.n + ' thay đổi</span></h2>' + d.cards.map(function (x) {
        var g = x.g, k = logKind(g), key = g.at + '|' + g.key, lim = f.open[key] ? x.ch.length : 8;
        return '<article class="gx-card g lg-save"><div class="lg-head">' + logAva(g) +
          '<div class="lg-who"><b>' + esc(g.who) + '</b><small>' + g.time + ' · ' + g.n + ' thay đổi trong một lần lưu</small></div>' +
          '<span class="gx-pill ' + k[1] + '">' + esc(k[0]) + '</span></div>' +
          '<ul class="lg-list">' + x.ch.slice(0, lim).map(function (c) {
            return '<li><button type="button" class="lg-row" data-c="' + c.id + '" aria-pressed="' + (c.id === f.sel) + '">' +
              '<span class="lg-type t-' + c.type + '">' + LTY[c.type] + '</span><span class="lg-ent">' + esc(c.entity) + '</span>' +
              '<span class="lg-sum">' + esc(c.sum) + '</span>' + ic('chev', 16) + '</button></li>';
          }).join('') + '</ul>' +
          (x.ch.length > lim ? '<button type="button" class="lg-more" data-open="' + esc(key) + '">Xem thêm ' + (x.ch.length - lim) + ' thay đổi trong lần lưu này</button>' : '') +
          '</article>';
      }).join('') + '</div>';
    }).join('');
    if (!days.length) html = '<div class="gx-card g gx-empty lg-empty">' + (S.log.groups.length ? 'Không có thay đổi nào khớp bộ lọc.' : 'Chưa có thay đổi nào trong 30 ngày qua.') + '</div>';
    var next = f.range === 'today' ? ['7d', 'Xem 7 ngày'] : f.range === '7d' ? ['30d', 'Xem 30 ngày'] : null;
    if (more) html += '<button type="button" class="gx-btn lg-old" id="lgOld">Xem thay đổi cũ hơn</button>';
    else if (next) html += '<button type="button" class="gx-btn lg-old" id="lgOld" data-next="' + next[0] + '">Xem thay đổi cũ hơn · ' + next[1].toLowerCase() + '</button>';
    else if (days.length) html += '<p class="gx-muted lg-end">Nhật ký hiện 30 ngày gần nhất.</p>';
    document.getElementById('lgL').innerHTML = html;
  }
  function drawLogSel() {
    var f = S.lf, c = null, a = document.getElementById('lgS');
    S.log.groups.forEach(function (g) { g.changes.forEach(function (x) { if (x.id === f.sel) c = x }) });
    var close = '<button type="button" class="gx-icon-btn lg-x" id="lgX" aria-label="Đóng chi tiết">' + ic('x') + '</button>';
    var foot = '<p class="lg-foot">Nhật ký tự ghi khi sửa món, giá, công thức, topping và nhân viên. Chưa ghi: đổi tên hoặc ẩn nhóm món, tạo link màn hình quầy, đặt tên máy ở quầy. Biến động tồn kho xem ở trang Kho.</p>';
    if (!c) { a.innerHTML = close + '<p class="gx-muted2 lg-none">Chọn một thay đổi ở danh sách để xem chi tiết.</p>' + foot; bindX(); return }
    var g = c.g, rows = logRows(c), others = g.n - 1, k = logKind(g);
    var link = '';
    if (c.type === 'member') link = '<a href="#nhanvien" class="gx-btn lg-go" data-soon="Nhân viên">Mở trang Nhân viên' + ic('arrow', 16) + '</a>';
    else if ((c.type === 'item' || c.type === 'price' || c.type === 'recipe') && c.act !== 'DELETE' && c.item_id)
      link = '<a href="#menu" class="gx-btn lg-go" id="lgGo">Mở món này trong Menu' + ic('arrow', 16) + '</a>';
    a.innerHTML = close +
      '<div class="lg-sel"><span class="lg-type t-' + c.type + '">' + LTY[c.type] + '</span><h2>' + esc(c.entity) + '</h2><p>' + esc(c.sum) + '</p></div>' +
      (rows.length ? '<div class="lg-diff" role="table" aria-label="Trước và sau khi sửa"><div role="row"><span role="columnheader">Mục</span><span role="columnheader">Trước</span><span role="columnheader">Sau</span></div>' +
        rows.map(function (r) { return '<div role="row"><span class="k" role="cell">' + esc(r[0]) + '</span><span class="b" role="cell">' + esc(r[1]) + '</span><span class="a" role="cell">' + esc(r[2]) + '</span></div>' }).join('') + '</div>' : '') +
      '<dl class="gx-dl"><div><dt>Người sửa</dt><dd>' + esc(g.who) + '</dd></div><div><dt>Lúc</dt><dd>' + g.time + ', ' + dm(g.day) + '/' + g.day.slice(0, 4) + '</dd></div>' +
        '<div><dt>Lần lưu</dt><dd>' + esc(k[0]) + '</dd></div><div><dt>Cùng lần lưu</dt><dd>' + (others > 0 ? others + ' thay đổi khác' : 'Không có') + '</dd></div></dl>' +
      link + foot;
    bindX();
    var go = document.getElementById('lgGo');
    if (go) go.onclick = function () { S.mq = c.entity };
    var soonA = a.querySelector('[data-soon]');
    if (soonA) soonA.onclick = function (e) { e.preventDefault(); soon('Nhân viên') };
  }
  function bindX() { var x = document.getElementById('lgX'); if (x) x.onclick = closeSheet }

  /* =====================================================================
     MÀN HÌNH QUẦY (theo thiết kế "Màn hình quầy")
     ===================================================================== */
  function viewTerm() {
    loadingShell('manhinh', 'Màn hình quầy');
    loadTerm(needCounts()).then(function () {
      if (!S.tm || S.tm.shop !== S.shop.id) S.tm = { shop: S.shop.id, show: false, rotated: null };
      S.tm.edit = null; S.tm.copied = false;
      renderTerm();
      stopLive();
      liveT = setInterval(function () {
        if (location.hash !== '#manhinh') return stopLive();
        if (S.tm.edit || document.getElementById('tmDlg')) return;
        loadTerm().then(drawTermLive).catch(function () {});
      }, 60000);
    }).catch(function (e) { errorShell('manhinh', 'Màn hình quầy', e) });
  }
  function loadTerm(extra) {
    return Promise.all([rpc('admin_get_terminals', { p_shop_id: S.shop.id }), extra]).then(function (r) { S.term = r[0]; return r[0] });
  }
  function kioskBase() { return new URL('../', location.href).href }
  function kioskLink(tok, full) { return kioskBase() + '?k=' + (full ? tok : tok.slice(0, 6) + '••••••••••••' + tok.slice(-4)) }
  function agoLong(s) {
    if (s == null) return '—';
    return s < 60 ? s + ' giây trước' : s < 3600 ? Math.floor(s / 60) + ' phút trước' : s < 86400 ? Math.floor(s / 3600) + ' giờ trước' : Math.floor(s / 86400) + ' ngày trước';
  }
  function durTxt(s) { return s < 3600 ? Math.max(1, Math.floor(s / 60)) + ' phút' : s < 86400 ? Math.floor(s / 3600) + ' giờ' : Math.floor(s / 86400) + ' ngày' }
  function termHeadChips() {
    var t = S.term, n = t.active.length;
    return '<span class="mx-ver">Menu mới nhất <strong>v' + t.menu_version + '</strong></span>' +
      '<span class="mx-ver">Đang dùng <strong>' + n + (t.max_terminals ? ' / ' + t.max_terminals : '') + '</strong> máy' + (t.max_terminals ? ' theo gói' : '') + '</span>';
  }
  function renderTerm() {
    var t = S.term;
    var body = '<div id="tmBan"></div><section class="gx-flex">' +
      '<div class="gx-card g tm-link" id="tmLink"></div>' +
      '<div class="gx-card g tm-setup"><h2>Cài máy mới</h2><ol class="tm-steps">' +
        '<li><b>1</b><span>Sao chép link, gửi riêng sang máy đặt ở quầy.</span></li>' +
        '<li><b>2</b><span>Mở link bằng trình duyệt trên máy đó. Máy tự thành màn hình quầy và hiện ở danh sách bên dưới.</span></li>' +
        '<li><b>3</b><span>Đặt tên máy ở đây để dễ nhận ra, ví dụ “Quầy cửa chính”.</span></li></ol>' +
        '<p>Trình duyệt đang đăng nhập tài khoản nhân viên sẽ không mở được link. Đăng xuất trước rồi mở lại.</p></div></section>' +
      '<section class="gx-card g"><div class="gx-row-b"><h2>Máy đang kết nối</h2><span class="gx-muted">Mỗi máy gửi tín hiệu 1 phút một lần</span></div>' +
        '<div class="tm-grid" id="tmAct"></div></section>' +
      '<section class="gx-card g"><div class="gx-row-b"><h2>Máy đã ngắt</h2><span class="gx-muted">Máy bị ngắt phải mở lại link mới dùng tiếp được</span></div>' +
        '<div class="gx-tablewrap" id="tmHist"></div></section>';
    app.innerHTML = shell('manhinh', 'Màn hình quầy', 'Máy ở quầy mở link thiết bị là thành màn hình khách tự gọi món, không cần đăng nhập.',
      '<div class="mx-acts" id="tmChips">' + termHeadChips() + '</div>', body);
    document.body.className = 'glass';
    bindShell();
    drawTermBanner(); drawTermLink(); drawTermActive(); drawTermHist();
    var act = document.getElementById('tmAct');
    act.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-edit')) { S.tm.edit = b.getAttribute('data-edit'); drawTermActive(); var i = document.getElementById('tmName'); if (i) { i.focus(); i.select() } }
      else if (b.id === 'tmSave') saveTermName();
      else if (b.id === 'tmCancel') { var id = S.tm.edit; S.tm.edit = null; drawTermActive(); var eb = act.querySelector('[data-edit="' + id + '"]'); if (eb) eb.focus() }
    });
    act.addEventListener('keydown', function (e) {
      if (e.target.id !== 'tmName') return;
      if (e.key === 'Enter') { e.preventDefault(); saveTermName() }
      else if (e.key === 'Escape') { e.preventDefault(); document.getElementById('tmCancel').click() }
    });
  }
  function drawTermLive() {
    var c = document.getElementById('tmChips'); if (!c) return;
    c.innerHTML = termHeadChips(); drawTermActive(); drawTermHist();
  }
  function drawTermBanner() {
    var n = S.tm.rotated, el = document.getElementById('tmBan');
    if (n == null) { el.innerHTML = ''; return }
    el.innerHTML = '<div class="tm-ok g" role="status">' + ic('okc', 20) + '<span>Đã tạo link mới. ' +
      (n ? n + ' máy cũ đã bị ngắt — sao chép link mới rồi mở lại trên từng máy ở quầy.' : 'Sao chép link mới rồi mở trên từng máy ở quầy.') + '</span>' +
      '<button type="button" class="gx-btn ghost" id="tmBanX">Đã hiểu</button></div>';
    document.getElementById('tmBanX').onclick = function () { S.tm.rotated = null; drawTermBanner() };
  }
  function drawTermLink() {
    var L = S.term.link, el = document.getElementById('tmLink');
    if (!L) {
      el.innerHTML = '<div class="gx-row-b"><h2>Link thiết bị</h2><span class="gx-status muted"><i></i>Chưa có</span></div>' +
        '<p class="gx-muted2" style="margin:0;font-size:.875rem">Quán chưa có link thiết bị. Tạo link rồi mở trên máy đặt ở quầy.</p>' +
        '<div class="tm-acts"><button type="button" class="gx-btn pri" id="tmRot">' + ic('plus', 16) + 'Tạo link thiết bị</button></div>';
      document.getElementById('tmRot').onclick = askRotate;
      return;
    }
    var full = S.tm.show;
    el.innerHTML = '<div class="gx-row-b" style="align-items:flex-start"><div class="tm-lt"><h2>Link thiết bị</h2><span class="tm-meta">Tạo lúc ' + esc(L.created_at) +
        (L.email ? ' bởi ' + esc(who(L.email, L.role)) : '') + '</span></div><span class="gx-status ok"><i></i>Đang dùng được</span></div>' +
      '<div class="tm-url">' + ic('link', 18) + '<code id="tmUrl">' + esc(kioskLink(L.token, full)) + '</code>' +
        '<button type="button" class="tm-eye" id="tmEye" aria-label="' + (full ? 'Ẩn mã trong link' : 'Hiện đầy đủ link') + '" aria-pressed="' + full + '">' + ic(full ? 'eyeOff' : 'eye') + '</button></div>' +
      '<div class="tm-acts"><button type="button" class="gx-btn pri" id="tmCopy">' + ic('copy', 16) + '<span>' + (S.tm.copied ? 'Đã sao chép' : 'Sao chép link') + '</span></button>' +
        '<button type="button" class="gx-btn danger" id="tmRot">' + ic('redo', 16) + 'Tạo link mới</button></div>' +
      '<div class="tm-warn">' + ic('warn', 16) + '<span>Ai có link này cũng biến được máy của họ thành màn hình quầy của quán. Chỉ gửi riêng cho máy đặt ở quầy, đừng gửi vào nhóm chat chung. Nghi bị lộ thì bấm “Tạo link mới”.</span></div>';
    document.getElementById('tmEye').onclick = function () { S.tm.show = !S.tm.show; drawTermLink(); document.getElementById('tmEye').focus() };
    document.getElementById('tmRot').onclick = askRotate;
    document.getElementById('tmCopy').onclick = function () {
      var link = kioskLink(L.token, true);
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () {
        S.tm.copied = true; drawTermLink(); document.getElementById('tmCopy').focus();
        clearTimeout(S.tm.cT); S.tm.cT = setTimeout(function () { S.tm.copied = false; if (document.getElementById('tmCopy')) document.querySelector('#tmCopy span').textContent = 'Sao chép link' }, 1800);
      }, function () { prompt('Sao chép link này:', link) });
    };
  }
  function drawTermActive() {
    var t = S.term, el = document.getElementById('tmAct'); if (!el) return;
    var html = t.active.map(function (m) {
      var s = m.silent_sec, run = s < 120, lost = s >= 300, ed = S.tm.edit === m.id;
      var latest = m.version != null && m.version >= t.menu_version;
      var st = run ? ['Đang chạy', 'ok'] : lost ? ['Mất tín hiệu', 'warn'] : ['Im lặng', 'warn'];
      var top = ed
        ? '<label class="tm-edl"><span class="gx-sr">Tên máy</span><input type="text" id="tmName" class="tm-in" maxlength="40" value="' + esc(m.name) + '"></label>' +
          '<button type="button" class="gx-btn pri" id="tmSave">Lưu</button><button type="button" class="gx-btn ghost" id="tmCancel">Hủy</button>'
        : '<div class="tm-name"><h3 title="' + esc(m.name) + '">' + esc(m.name) + '</h3><span class="gx-status ' + st[1] + '"><i></i>' + st[0] + '</span></div>' +
          '<button type="button" class="tm-ed" data-edit="' + m.id + '" aria-label="Đổi tên ' + esc(m.name) + '">' + ic('pen', 16) + '</button>';
      return '<article class="tm-card' + (run ? '' : ' warn') + '"><div class="tm-top"><span class="tm-dev">' + ic('phone', 20) + '</span>' + top + '</div>' +
        '<dl class="gx-dl"><div><dt>Tín hiệu cuối</dt><dd class="' + (run ? '' : 'warn') + '">' + agoLong(s) + '</dd></div>' +
          '<div><dt>Phiên bản menu</dt><dd class="' + (m.version == null ? '' : latest ? 'ok' : 'warn') + '">' +
            (m.version == null ? 'Chưa báo' : 'v' + m.version + (latest ? ' · mới nhất' : ' · chưa nhận v' + t.menu_version)) + '</dd></div>' +
          '<div><dt>Đơn đã trả hôm nay</dt><dd>' + m.orders + '</dd></div><div><dt>Kết nối từ</dt><dd>' + esc(m.since) + '</dd></div></dl>' +
        (run ? '' : '<p class="tm-note">Không nhận tín hiệu ' + durTxt(s) + (latest ? '' : ' nên chưa nhận được menu mới') +
          '. Kiểm tra máy còn bật và có mạng. Máy im lặng quá 5 phút có thể bị máy mới thay chỗ khi quán đã dùng hết số máy của gói.</p>') +
        '</article>';
    }).join('');
    var free = t.max_terminals ? t.max_terminals - t.active.length : (t.active.length ? 0 : 1);
    if (free > 0) html += '<div class="tm-free"><span>' + ic('plus', 20) + '</span><b>' + (t.max_terminals ? 'Còn ' + free + ' chỗ trống' : 'Chưa có máy nào') + '</b>' +
      '<small>Mở link thiết bị trên máy mới, máy sẽ tự hiện ở đây.</small></div>';
    el.innerHTML = html || '<p class="gx-muted">Chưa có máy nào đang kết nối.</p>';
  }
  function drawTermHist() {
    var h = S.term.history, el = document.getElementById('tmHist'); if (!el) return;
    var R = { rotated: ['Tạo link mới', 'muted'], replaced: ['Máy khác thay chỗ', 'info'] };
    el.innerHTML = h.length ? '<table class="gx-table tm-hist"><thead><tr><th scope="col">Tên máy</th><th scope="col">Lý do</th><th scope="col">Ngắt lúc</th><th scope="col">Hoạt động từ</th></tr></thead><tbody>' +
      h.map(function (x) {
        var r = R[x.reason] || ['Đã tắt', 'muted'];
        return '<tr><td><b class="tm-hn">' + esc(x.name) + '</b></td><td><span class="gx-pill ' + r[1] + '">' + r[0] + '</span></td><td class="gx-muted2">' + esc(x.at || '—') + '</td><td class="gx-muted2">' + esc(x.since) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="gx-muted" style="margin:0">Chưa có máy nào bị ngắt.</p>';
  }
  function saveTermName() {
    var i = document.getElementById('tmName'), id = S.tm.edit, v = (i.value || '').trim();
    if (!v) { i.focus(); return toast('Tên máy không được để trống', true) }
    var btn = document.getElementById('tmSave'); btn.disabled = true;
    rpc('admin_rename_terminal', { p_shop_id: S.shop.id, p_terminal_id: id, p_name: v }).then(function () {
      S.term.active.forEach(function (m) { if (m.id === id) m.name = v });
      S.tm.edit = null; drawTermActive(); toast('Đã đổi tên máy');
      var eb = document.querySelector('#tmAct [data-edit="' + id + '"]'); if (eb) eb.focus();
    }).catch(function (e) { btn.disabled = false; toast(errMsg(e), true) });
  }
  function askRotate() {
    /* tạo link màn hình quầy cần phiên đã nhập mã 6 số (database cũng tự chặn) */
    if (S.aal !== 'aal2') return openSecurity('Tạo link màn hình quầy cần bật xác thực 2 lớp. Bật xong là làm tiếp được ngay, không cần đăng nhập lại.');
    var n = S.term.active.length, has = !!S.term.link, back = document.createElement('div'), ret = document.activeElement;
    back.className = 'gx-dlg-back'; back.id = 'tmDlg';
    back.innerHTML = '<div class="gx-dlg g" role="dialog" aria-modal="true" aria-labelledby="tmDlgT">' +
      '<div class="gx-dlg-h"><span class="gx-dlg-i">' + ic('warn', 20) + '</span><h2 id="tmDlgT">' + (has ? 'Tạo link mới?' : 'Tạo link thiết bị?') + '</h2></div>' +
      (has ? '<ul><li>Link cũ hết dùng được. ' + (n ? 'Cả <strong>' + n + ' máy</strong> đang chạy bị ngắt ngay và phải mở link mới.' : 'Máy nào mở link cũ sẽ không vào được nữa.') + '</li>' +
        '<li>Đơn đang lưu tạm trên máy do mất mạng sẽ <strong class="bad">không gửi lên được nữa</strong>. Nên làm lúc quán vắng và các máy đang có mạng.</li></ul>'
        : '<p>Link mới dùng để biến máy ở quầy thành màn hình khách tự gọi món.</p>') +
      '<div class="gx-dlg-a"><button type="button" class="gx-btn" id="tmNo">Hủy</button>' +
        '<button type="button" class="gx-btn red" id="tmYes">' + (has ? 'Tạo link mới' + (n ? ' và ngắt ' + n + ' máy' : '') : 'Tạo link') + '</button></div></div>';
    document.body.appendChild(back);
    function close() { document.removeEventListener('keydown', key); back.remove(); if (ret && ret.focus) ret.focus() }
    function key(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {   /* giữ phím Tab trong hộp thoại */
        var f = [document.getElementById('tmNo'), document.getElementById('tmYes')], i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    document.addEventListener('keydown', key);
    back.onclick = function (e) { if (e.target === back) close() };
    document.getElementById('tmNo').onclick = close;
    document.getElementById('tmNo').focus();
    document.getElementById('tmYes').onclick = function () {
      var y = this, before = S.term.active.map(function (m) { return m.id });
      y.disabled = true; y.textContent = 'Đang tạo…';
      rpc('rotate_kiosk_link', { p_shop_id: S.shop.id }).then(function () { return loadTerm() }).then(function (t) {
        var now = t.active.map(function (m) { return m.id });
        S.tm.rotated = before.filter(function (id) { return now.indexOf(id) < 0 }).length;
        S.tm.show = false; S.tm.copied = false; S.tm.edit = null;
        close(); drawTermBanner(); drawTermLink(); drawTermLive();
        toast(has ? 'Đã tạo link mới' : 'Đã tạo link thiết bị');
        var c = document.getElementById('tmCopy'); if (c) c.focus();
      }).catch(function (e) {
        if (needs2fa(e)) { close(); return openSecurity('Tạo link màn hình quầy cần bật xác thực 2 lớp. Bật xong là làm tiếp được ngay, không cần đăng nhập lại.') }
        y.disabled = false; y.textContent = 'Thử lại'; toast(errMsg(e), true);
      });
    };
  }

  /* =====================================================================
     CHUYỂN KHOẢN (#chuyenkhoan) — hàm admin_get_transfers
     - Tra mã nhận đồ: máy quầy mất mạng thì khách đọc 4 ký tự, nhân viên tra xem tiền đã về chưa rồi mới giao đồ.
     - Cần xem lại: chuyển sai số tiền, không có mã, trả 2 lần… → xác nhận đơn đã trả (cần mã 6 số) hoặc bỏ qua.
     ===================================================================== */
  (function txCss() {
    var css = '.tx-p{margin:.25rem 0 0;font-size:.875rem;line-height:1.55}' +
      '.tx-form{display:flex;gap:.6rem;margin-top:1rem;max-width:30rem}' +
      '.tx-form .gx-input{flex:1}' +
      '.tx-form input{text-transform:uppercase;letter-spacing:.2em;font-size:1.15rem !important;font-weight:600}' +
      '.tx-form .gx-btn{min-height:3rem;padding:0 1.4rem}' +
      '#txRes{display:flex;flex-direction:column;gap:.6rem;margin-top:1rem}' +
      '#txRes:empty{display:none}' +
      '.tx-for{margin:0;font-size:.84rem;color:var(--g-muted)}' +
      '.tx-v{display:flex;gap:.8rem;align-items:flex-start;padding:.9rem 1rem;border-radius:14px;border:1px solid}' +
      '.tx-v svg{flex:none;margin-top:.1rem}' +
      '.tx-v div{display:flex;flex-direction:column;gap:.2rem;min-width:0}' +
      '.tx-v b{font-size:1rem}' +
      '.tx-v span{font-size:.875rem;color:var(--g-text2)}' +
      '.tx-v small{font-size:.8rem;color:var(--g-muted);line-height:1.5}' +
      '.tx-v.ok{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.35)}.tx-v.ok > svg,.tx-v.ok b{color:var(--g-ok)}' +
      '.tx-v.warn{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.35)}.tx-v.warn > svg,.tx-v.warn b{color:var(--g-warn)}' +
      '.tx-v.bad{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.35)}.tx-v.bad > svg,.tx-v.bad b{color:var(--g-bad)}' +
      '.tx-rv{display:flex;flex-direction:column;gap:.6rem}' +
      '.tx-rv .gx-tr-act{display:flex;flex-wrap:wrap;gap:.5rem}' +
      '.tx-rv .gx-tr-act .gx-btn{flex:0 1 auto;min-height:2.5rem;font-size:.8rem}' +
      '.tx-wrap{overflow-x:auto;margin:0 -.25rem}' +
      '.tx-wrap table{min-width:34rem}' +
      '.tx-wrap td{white-space:nowrap}' +
      '.tx-dlg textarea{width:100%;min-height:5rem;box-sizing:border-box;padding:.7rem .8rem;border-radius:12px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);color:var(--g-text);font:inherit;font-size:.9rem;resize:vertical}' +
      '.tx-dlg label{font-size:.84rem;font-weight:600;color:var(--g-text2)}' +
      '@media (max-width:560px){.tx-form{flex-direction:column}.tx-form .gx-btn{width:100%}}';
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  })();
  var TXS = { matched: ['Đã ghép đơn', 'ok'], unmatched: ['Chờ đơn', 'info'], needs_review: ['Cần xem lại', 'warn'], ignored: ['Đã bỏ qua', 'muted'] };
  var OST = { open: 'đang chờ thanh toán', paid: 'đã thanh toán', expired: 'đã quá hạn', cancelled: 'đã hủy', refunded: 'đã hoàn tiền' };
  function txWhen(at) {   /* "2026-11-03 21:05" -> "21:05" hôm nay, "02/11 21:05" ngày khác */
    var today = S.tx && S.tx.now ? S.tx.now.slice(0, 10) : '';
    return (at.slice(0, 10) === today ? '' : at.slice(8, 10) + '/' + at.slice(5, 7) + ' ') + at.slice(11, 16);
  }
  function txWhy(b) {
    if (b.order_status === 'paid' && b.status !== 'matched') return 'Đơn #' + b.order_no + ' đã thanh toán trước đó, có thể khách chuyển khoản 2 lần';
    if (b.order_total != null && Number(b.amount) !== Number(b.order_total)) return 'Chuyển ' + money(b.amount) + ' đ, tổng đơn #' + b.order_no + ' là ' + money(b.order_total) + ' đ';
    if (!b.code) return 'Nội dung chuyển khoản không có mã đơn';
    if (b.status === 'unmatched') return 'Chưa có đơn nào mang mã này sau ' + b.age_min + ' phút (máy quầy có thể đang mất mạng)';
    return b.note || 'Chưa ghép được với đơn nào';
  }
  function viewTransfers() {
    loadingShell('chuyenkhoan', 'Chuyển khoản');
    Promise.all([rpc('admin_get_transfers', { p_shop_id: S.shop.id }), needCounts()]).then(function (r) {
      var keep = S.tx && S.tx.shop === S.shop.id;
      S.tx = { shop: S.shop.id, now: r[0].now, list: r[0].transfers || [], q: keep ? S.tx.q : '', res: keep ? S.tx.res : null };
      renderTransfers();
      stopLive();
      liveT = setInterval(function () {
        if (location.hash !== '#chuyenkhoan') return stopLive();
        if (document.getElementById('txDlg')) return;
        reloadTx();
      }, 60000);
    }).catch(function (e) { errorShell('chuyenkhoan', 'Chuyển khoản', e) });
  }
  function reloadTx() {
    return rpc('admin_get_transfers', { p_shop_id: S.shop.id }).then(function (d) {
      S.tx.now = d.now; S.tx.list = d.transfers || []; drawTxLists();
    }).catch(function () {});
  }
  function renderTransfers() {
    var body =
      '<section class="gx-card g"><h2>Tra mã nhận đồ</h2>' +
        '<p class="gx-muted2 tx-p">Khi máy quầy mất mạng, khách đọc cho nhân viên <b>mã nhận đồ 4 ký tự</b>. Tra ở đây để biết tiền đã về tài khoản của quán chưa, rồi mới giao đồ.</p>' +
        '<form id="txF" class="tx-form" novalidate><label class="gx-sr" for="txQ">Mã nhận đồ</label>' +
          '<div class="gx-input">' + ic('search') + '<input id="txQ" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="VD: 7K2Q" value="' + esc(S.tx.q) + '"></div>' +
          '<button type="submit" class="gx-btn pri" id="txGo">Tra</button></form>' +
        '<div id="txRes" aria-live="polite"></div></section>' +
      '<section class="gx-card g"><div class="gx-row-b"><h2>Cần xem lại</h2><span id="txRevN"></span></div><div id="txRev" class="tx-rv"></div></section>' +
      '<section class="gx-card g"><div class="gx-row-b"><h2>Chuyển khoản 3 ngày gần đây</h2><span class="gx-muted">Tự cập nhật mỗi phút</span></div><div id="txAll"></div></section>';
    app.innerHTML = shell('chuyenkhoan', 'Chuyển khoản', 'Tiền khách chuyển vào tài khoản của quán, SePay báo về tự động.', '', body);
    document.body.className = 'glass';
    bindShell();
    drawTxRes(); drawTxLists();
    var q = document.getElementById('txQ');
    q.oninput = function () { S.tx.q = q.value };
    document.getElementById('txF').onsubmit = function (e) { e.preventDefault(); lookupTx() };
    if (!S.tx.res) q.focus();
  }
  function lookupTx() {
    var q = document.getElementById('txQ'), b = document.getElementById('txGo');
    var v = (q.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^([A-Z0-9]{4}|DH[A-Z0-9]{8})$/.test(v)) {
      S.tx.res = { err: 'Nhập 4 ký tự của mã nhận đồ (VD: 7K2Q), hoặc cả mã DH… trong nội dung chuyển khoản.' };
      drawTxRes(); q.focus(); return;
    }
    b.disabled = true; b.textContent = 'Đang tra…';
    rpc('admin_get_transfers', { p_shop_id: S.shop.id, p_code: v }).then(function (d) {
      S.tx.now = d.now;
      S.tx.res = { code: v, orders: d.orders || [], transfers: d.transfers || [] };
    }).catch(function (e) { S.tx.res = { err: errMsg(e) } }).then(function () {
      drawTxRes(); b.disabled = false; b.textContent = 'Tra';
    });
  }
  /* Kết luận cho nhân viên: [mức, tiêu đề, dòng chính, ghi chú] */
  function txVerdicts(r) {
    var out = [], used = {};
    r.orders.forEach(function (o) {
      var t = r.transfers.filter(function (x) { return x.order_id === o.id });
      t.forEach(function (x) { used[x.id] = 1 });
      var rev = t.filter(function (x) { return x.status === 'needs_review' })[0];
      var wait = t.filter(function (x) { return x.status === 'unmatched' })[0];
      var head = 'Đơn #' + o.no + ' · ' + money(o.total) + ' đ · tạo lúc ' + txWhen(o.at) + (o.terminal ? ' · ' + o.terminal : '');
      if (o.status === 'paid') out.push(['ok', 'Đã nhận tiền — giao đồ được', head, o.items || '']);
      else if (rev) out.push(['warn', 'Tiền đã về nhưng cần xem lại', head, txWhy(rev) + '. Xử lý ở mục “Cần xem lại” bên dưới.']);
      else if (wait) out.push(['warn', 'Tiền đã về, chưa tự ghép được', head, 'Đã nhận ' + money(wait.amount) + ' đ lúc ' + txWhen(wait.at) + '. Xử lý ở mục “Cần xem lại”.']);
      else out.push(['bad', 'Chưa thấy tiền về — chưa giao đồ', head + ' · ' + (OST[o.status] || o.status),
        'Nhờ khách mở app ngân hàng xem giao dịch đã thành công chưa. Tiền thường báo về trong 1–2 phút, tra lại sau.']);
    });
    r.transfers.forEach(function (x) {
      if (used[x.id]) return;
      var head = money(x.amount) + ' đ · nhận lúc ' + txWhen(x.at) + ' · ' + (x.code || '');
      if (x.status === 'unmatched') out.push(['ok', 'Tiền đã về — giao đồ được', head,
        'Đơn chưa lên máy chủ vì máy quầy mất mạng, sẽ tự ghép khi máy có mạng lại. Đối chiếu số tiền với đơn của khách.']);
      else if (x.status === 'matched') out.push(['ok', 'Đã nhận tiền — giao đồ được', head, x.order_no ? 'Đơn #' + x.order_no : '']);
      else if (x.status === 'needs_review') out.push(['warn', 'Tiền đã về nhưng cần xem lại', head, txWhy(x)]);
      else out.push(['warn', 'Khoản tiền này đã được bỏ qua', head, x.note || '']);
    });
    return out;
  }
  function drawTxRes() {
    var r = S.tx.res, el = document.getElementById('txRes'); if (!el) return;
    if (!r) { el.innerHTML = ''; return }
    if (r.err) { el.innerHTML = '<div class="gx-alert" role="alert">' + ic('alert', 18) + '<span>' + esc(r.err) + '</span></div>'; return }
    var v = txVerdicts(r);
    if (!v.length) v = [['bad', 'Không thấy đơn hay khoản tiền nào', 'Không có mã này trong 3 ngày qua.',
      'Kiểm tra lại mã khách đọc. Nếu khách vừa chuyển, đợi 1–2 phút rồi tra lại.']];
    el.innerHTML = '<p class="tx-for">Kết quả cho mã <b>' + esc(r.code) + '</b></p>' + v.map(function (x) {
      return '<div class="tx-v ' + x[0] + '" role="status">' + ic(x[0] === 'ok' ? 'okc' : x[0] === 'bad' ? 'x' : 'warn', 22) +
        '<div><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span>' + (x[3] ? '<small>' + esc(x[3]) + '</small>' : '') + '</div></div>';
    }).join('');
  }
  function drawTxLists() {
    var list = S.tx.list, rv = document.getElementById('txRev'); if (!rv) return;
    var need = list.filter(function (b) { return b.status === 'needs_review' || (b.status === 'unmatched' && b.age_min >= 30) });
    document.getElementById('txRevN').innerHTML = need.length ? '<span class="gx-pill bad">' + need.length + ' khoản</span>' : '';
    rv.innerHTML = need.length ? need.map(function (b) {
      var canPay = b.order_id && (b.order_status === 'open' || b.order_status === 'expired');
      return '<div class="gx-tr"><div class="gx-row-b"><b>' + money(b.amount) + ' đ</b><small class="gx-muted">' + txWhen(b.at) + ' · ' + esc(b.code || 'không có mã') + '</small></div>' +
        '<span class="gx-why ' + (b.code ? 'warn' : 'bad') + '">' + esc(txWhy(b)) + '</span>' +
        (b.description ? '<small class="gx-muted">Nội dung: ' + esc(b.description) + '</small>' : '') +
        '<div class="gx-tr-act">' + (canPay ? '<button type="button" class="gx-btn" data-pay="' + esc(b.id) + '">' + ic('okc', 16) + 'Xác nhận đơn #' + b.order_no + ' đã trả</button>' : '') +
          '<button type="button" class="gx-btn ghost" data-ign="' + esc(b.id) + '">Bỏ qua</button></div></div>';
    }).join('') : '<p class="gx-muted" style="margin:0">Không có khoản nào cần xem.</p>';
    rv.onclick = function (e) {
      var p = e.target.closest('[data-pay]'), g = e.target.closest('[data-ign]');
      var id = p ? p.getAttribute('data-pay') : g ? g.getAttribute('data-ign') : null; if (!id) return;
      var b = S.tx.list.filter(function (x) { return x.id === id })[0]; if (!b) return;
      txDialog(p ? 'pay' : 'ignore', b, p || g);
    };
    var all = document.getElementById('txAll');
    all.innerHTML = list.length ? '<div class="tx-wrap"><table class="gx-table"><thead><tr><th scope="col">Lúc</th><th scope="col" class="r">Số tiền</th><th scope="col">Mã</th><th scope="col">Trạng thái</th><th scope="col">Đơn</th></tr></thead><tbody>' +
      list.map(function (b) {
        var s = TXS[b.status] || [b.status, 'muted'];
        return '<tr><td class="gx-muted2">' + txWhen(b.at) + '</td><td class="r"><b>' + money(b.amount) + ' đ</b></td><td>' + esc(b.code || '—') + '</td>' +
          '<td><span class="gx-status ' + s[1] + '"><i></i>' + s[0] + '</span></td><td class="gx-muted2">' + (b.order_no ? '#' + b.order_no + ' · ' + (OST[b.order_status] || '') : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="gx-muted" style="margin:0">Chưa có khoản chuyển khoản nào trong 3 ngày qua.</p>';
  }
  function txDialog(kind, b, ret) {
    if (kind === 'pay' && S.aal !== 'aal2')
      return openSecurity('Xác nhận thanh toán tay cần bật xác thực 2 lớp. Bật xong là làm tiếp được ngay, không cần đăng nhập lại.');
    var back = document.createElement('div');
    back.className = 'gx-dlg-back'; back.id = 'txDlg';
    var pay = kind === 'pay';
    back.innerHTML = '<div class="gx-dlg g tx-dlg" role="dialog" aria-modal="true" aria-labelledby="txDlgT">' +
      '<div class="gx-dlg-h"><span class="gx-dlg-i">' + ic(pay ? 'okc' : 'warn', 20) + '</span><h2 id="txDlgT">' +
        (pay ? 'Xác nhận đơn #' + b.order_no + ' đã trả?' : 'Bỏ qua khoản ' + money(b.amount) + ' đ?') + '</h2></div>' +
      '<ul><li>Khoản tiền: <strong>' + money(b.amount) + ' đ</strong> lúc ' + txWhen(b.at) + (b.code ? ' · ' + esc(b.code) : '') + '.</li>' +
        (pay ? '<li>Đơn #' + b.order_no + ' (' + money(b.order_total) + ' đ) sẽ chuyển sang <strong>đã thanh toán</strong> và trừ kho như đơn bình thường.</li>'
             : '<li>Khoản này không ghép vào đơn nào và không tính vào doanh thu. Dùng khi đã xử lý ngoài hệ thống (trả lại tiền cho khách, khoản không liên quan…).</li>') +
        '<li>Lý do được ghi vào nhật ký cùng tên tài khoản của bạn.</li></ul>' +
      '<label for="txWhy">Lý do</label><textarea id="txWhy" maxlength="300" placeholder="' + (pay ? 'VD: Khách chuyển thiếu 2.000 đ, đã thu thêm tiền mặt' : 'VD: Đã chuyển trả lại cho khách') + '"></textarea>' +
      '<p class="sec-err" id="txErr" role="alert"></p>' +
      '<div class="gx-dlg-a"><button type="button" class="gx-btn" id="txNo">Hủy</button><button type="button" class="gx-btn ' + (pay ? 'pri' : 'red') + '" id="txYes">' +
        (pay ? 'Xác nhận đã trả' : 'Bỏ qua khoản này') + '</button></div></div>';
    document.body.appendChild(back);
    var why = document.getElementById('txWhy'), yes = document.getElementById('txYes');
    function close() { document.removeEventListener('keydown', key); back.remove(); if (ret && ret.isConnected) ret.focus() }
    function key(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        var f = [why, document.getElementById('txNo'), yes], i = f.indexOf(document.activeElement);
        e.preventDefault(); f[i < 0 ? 0 : (i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    document.addEventListener('keydown', key);
    back.onclick = function (e) { if (e.target === back) close() };
    document.getElementById('txNo').onclick = close;
    why.focus();
    yes.onclick = function () {
      var note = why.value.trim(), er = document.getElementById('txErr');
      if (!note) { er.textContent = 'Ghi lý do trước khi xác nhận.'; why.focus(); return }
      yes.disabled = true; yes.textContent = 'Đang lưu…';
      (pay ? rpc('confirm_payment_manual', { p_order_id: b.order_id, p_note: note, p_bank_transaction_id: b.id })
           : rpc('resolve_bank_transaction', { p_tx_id: b.id, p_note: note })).then(function () {
        close(); S.dash = null; S.counts = null;
        toast(pay ? 'Đã xác nhận đơn #' + b.order_no + ' đã trả' : 'Đã bỏ qua khoản ' + money(b.amount) + ' đ');
        return reloadTx().then(function () { if (S.tx.res && S.tx.res.code) lookupAgain() });
      }).catch(function (e) {
        if (needs2fa(e)) { close(); return openSecurity('Xác nhận thanh toán tay cần bật xác thực 2 lớp. Bật xong là làm tiếp được ngay, không cần đăng nhập lại.') }
        yes.disabled = false; yes.textContent = 'Thử lại'; er.textContent = errMsg(e);
      });
    };
  }
  function lookupAgain() {
    var code = S.tx.res.code;
    return rpc('admin_get_transfers', { p_shop_id: S.shop.id, p_code: code }).then(function (d) {
      S.tx.res = { code: code, orders: d.orders || [], transfers: d.transfers || [] }; drawTxRes();
    }).catch(function () {});
  }

  /* ---------------- khởi động ---------------- */
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (!s || !s.user || s.user.is_anonymous) { S.user = null; return }
    S.user = s.user;
    return afterAuth();
  }).catch(function () { S.user = null; S.needMfa = false }).then(route);
})();
