/* =====================================================================
   KIOSK: nối màn hình quầy với Supabase
   - Máy quầy kích hoạt bằng link có mã  ?k=<mã>  lấy ở trang quản lý (mục Màn hình quầy). Mở một lần là máy nhớ;
     mã được xóa khỏi thanh địa chỉ ngay sau khi kích hoạt. Không nhúng mã trong mã nguồn.
   - Tạo link mới ở trang quản lý thì link cũ và các máy đang dùng link cũ ngừng hoạt động.
   - Menu lấy từ bản đã xuất bản (menu_versions), lưu sẵn trong máy để mất mạng vẫn chạy.
   - Menu mới chỉ được áp dụng khi màn hình đang chờ và giỏ trống.
   - Thanh toán: QR chuyển khoản (VietQR) tạo trên máy, tiền về báo qua webhook SePay -> đơn "paid".
   ===================================================================== */
(function () {
  var SB_URL = 'https://mzzkohjxjammpihakwbz.supabase.co';
  var SB_KEY = 'sb_publishable_1Or6VXIVbaTN7li0oDe5kA_-1aQJWuX'; /* khóa công khai, an toàn để nằm trong trình duyệt */
  var STORE = 'kiosk_state_v1', BEAT_MS = 60000, IDLE_CHECK_MS = 3000;

  var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  var K = window.KIOSK = { sb: sb, shopId: null, terminalId: null, version: 0, pendingVersion: 0 };

  /* ---------- lưu trong máy ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || 'null') } catch (e) { return null } }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)) } catch (e) {} }

  /* ---------- thông báo ---------- */
  var overlay = null, banner = null;
  function showMsg(title, text) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center;background:#fff8ee;color:#3b2a1a;font:500 22px "Be Vietnam Pro",system-ui,sans-serif';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<b style="font-size:30px"></b><span style="max-width:640px;opacity:.8;font-size:20px"></span>';
    overlay.firstChild.textContent = title;          /* textContent: chữ hiện y hệt, không chèn được mã */
    overlay.lastChild.textContent = text || '';
  }
  /* Thông báo lỗi cho khách: chỉ hiện câu do database của quán tự viết (tiếng Việt có dấu, VD "Món ... đang tạm hết").
     Lỗi kỹ thuật (tiếng Anh, tên bảng, mã lỗi...) chỉ ghi vào console để chủ quán/kỹ thuật xem, khách thấy câu chung. */
  function safeMsg(m, fallback) {
    m = String(m || '');
    if (m && /[À-ỹ]/.test(m) && m.length <= 200) return m;
    if (m) console.error('[kiosk]', m);
    return fallback;
  }
  function hideMsg() { if (overlay) { overlay.remove(); overlay = null } }
  function setBanner(text) {
    if (!text) { if (banner) { banner.remove(); banner = null } return }
    if (!banner) {
      banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;padding:6px 12px;text-align:center;background:#b3261e;color:#fff;font:500 14px "Be Vietnam Pro",system-ui,sans-serif';
      document.body.appendChild(banner);
    }
    banner.textContent = text;
  }

  /* ---------- đổi bản menu thành các biến mà app.js đang dùng ---------- */
  function build(snap) {
    var cats = (snap.categories || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order });
    var byCat = {};
    (snap.items || []).forEach(function (it) { (byCat[it.category_id] = byCat[it.category_id] || []).push(it) });
    var MENU = {}, DESC = {}, RATE = {}, SUGGEST = {}, IMG = {}, BARS = {}, LIMIT = {};
    var ORDER = ['dam', 'tra', 'ngot', 'ngay'];
    cats.forEach(function (c) {
      MENU[c.name] = (byCat[c.id] || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order }).map(function (it) {
        var v = (it.variants || []).filter(function (x) { return x.is_default })[0] || (it.variants || [])[0];
        var a = it.attributes || {};
        DESC[it.name] = it.description || '';
        if (Array.isArray(a.rate)) RATE[it.name] = a.rate;          /* dạng cũ: mảng theo nhóm */
        else if (a.rate) {                                           /* dạng mới: {dam:[mức,min,max], ...} */
          var bars = ORDER.filter(function (b) { return a.rate[b] });
          BARS[it.name] = bars;
          RATE[it.name] = bars.map(function (b) { return a.rate[b][0] });
          LIMIT[it.name] = bars.map(function (b) { return [a.rate[b][1], a.rate[b][2]] });
        }
        if (a.suggest) SUGGEST[it.name] = [a.suggest.sugar == null ? null : a.suggest.sugar, a.suggest.ice == null ? null : a.suggest.ice];
        if (it.image_path) IMG[it.name] = it.image_path.indexOf('/') >= 0  /* ảnh tải lên từ trang quản lý */
          ? SB_URL + '/storage/v1/object/public/menu-images/' + it.image_path : it.image_path;
        it._variant = v;
        return [it.name, v ? v.price / 1000 : 0]; /* app.js tính giá theo nghìn đồng */
      });
    });
    window.CAT_NAMES = cats.map(function (c) { return c.name });
    window.KMENU = MENU; window.KDESC = DESC; window.KRATE = RATE; window.KSUGGEST = SUGGEST; window.IMG_MAP = IMG;
    window.KBARS = BARS; window.KLIMIT = LIMIT;
    K.snapshot = snap; K.version = snap.version;
  }

  /* ---------- tải menu mới nhất ---------- */
  function fetchLatest() {
    return sb.from('menu_versions').select('version,snapshot').eq('shop_id', K.shopId)
      .order('version', { ascending: false }).limit(1).then(function (r) {
        if (r.error) throw r.error;
        return r.data && r.data[0] || null;
      });
  }

  /* ---------- khởi động ---------- */
  function startApp() {
    hideMsg();
    var s = document.createElement('script'); s.src = 'js/app.js'; document.body.appendChild(s);
    setInterval(beat, BEAT_MS); beat();
    setInterval(applyWhenIdle, IDLE_CHECK_MS);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  function boot() {
    var st = load() || {};
    var urlToken = new URLSearchParams(location.search).get('k');
    showMsg('Đang mở menu…', '');
    return sb.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      /* Chỉ kích hoạt khi mở bằng link có mã. Máy đã kích hoạt nhưng quên phiên (có mạng) thì cần mở lại link.
         Mất mạng: dùng bản đã lưu. */
      var token = urlToken;
      if (!token && st.shopId && !session && navigator.onLine) throw new Error('NOSESSION');
      if (token) {
        /* Mở bằng link thiết bị: đăng nhập ẩn danh (nếu chưa) rồi kích hoạt máy này */
        var p = session ? Promise.resolve() : sb.auth.signInAnonymously().then(function (x) { if (x.error) throw x.error });
        return p.then(function () { return sb.rpc('activate_kiosk', { p_token: token, p_device_name: null }) }).then(function (x) {
          if (x.error) throw x.error;
          st = { shopId: x.data.shop_id, terminalId: x.data.terminal_id };
          save(st);
          if (urlToken) history.replaceState(null, '', location.pathname); /* bỏ mã khỏi thanh địa chỉ */
        });
      }
      if (!st.shopId) throw new Error(navigator.onLine ? 'NOLINK' : 'NOMENU');
    }).then(function () {
      K.shopId = st.shopId; K.terminalId = st.terminalId; K.shop = st.shop || null;
      return fetchLatest().then(function (row) {
        if (row) { st.snap = row.snapshot; st.ver = row.version; save(st) }
      }, function () { /* mất mạng: dùng bản đã lưu */ }).then(loadShop);
    }).then(function () {
      st = load() || st;
      if (!st.snap) throw new Error('NOMENU');
      build(st.snap);
      startApp();
    }).catch(function (e) {
      var m = (e && e.message) || '';
      if (m === 'NOLINK') showMsg('Chưa kích hoạt màn hình', 'Hãy mở đường link màn hình quầy do chủ quán cung cấp.');
      else if (m === 'NOSESSION') showMsg('Cần mở lại link', 'Máy đã quên phiên đăng nhập. Hãy mở lại đường link màn hình quầy.');
      else if (m === 'NOMENU') showMsg('Chưa có menu', 'Quán chưa xuất bản menu, hoặc máy đang mất mạng lần đầu mở. Hãy kết nối mạng rồi tải lại.');
      else showMsg('Không mở được màn hình', safeMsg(m, 'Hãy kiểm tra mạng rồi tải lại trang. Nếu vẫn lỗi, báo chủ quán.'));
    });
  }

  /* ---------- thông tin quán: tài khoản nhận tiền, thời hạn chờ chuyển khoản ---------- */
  function loadShop() {
    return sb.from('shops').select('name,bank_bin,bank_account_no,bank_account_name,order_expiry_minutes')
      .eq('id', K.shopId).maybeSingle().then(function (r) {
        if (r.error || !r.data) return;
        K.shop = r.data;
        var st = load() || {}; st.shop = r.data; save(st);
      }, function () {});
  }

  /* =====================================================================
     THANH TOÁN CHUYỂN KHOẢN
     - Mã đơn DHxxxxxxxx và mã QR (chuẩn VietQR) tạo ngay trên máy, nên mất mạng vẫn hiện được QR.
     - Có mạng: tạo đơn trên Supabase, cứ vài giây xem đơn đã "paid" chưa (tiền về qua webhook SePay).
     - Mất mạng: đơn nằm trong hàng chờ trên máy, có mạng lại thì tự gửi lên; tiền về trước thì tự ghép.
     ===================================================================== */
  var OUTBOX = 'kiosk_outbox_v1', POLL_MS = 3000;
  var BANKS = { '970418': 'BIDV', '970436': 'Vietcombank', '970415': 'VietinBank', '970422': 'MB', '970416': 'ACB',
    '970407': 'Techcombank', '970432': 'VPBank', '970423': 'TPBank', '970403': 'Sacombank', '970426': 'MSB',
    '970448': 'OCB', '970452': 'KienlongBank', '970424': 'Shinhan Bank', '970405': 'Agribank' };
  function tlv(id, v) { v = String(v); return id + (v.length < 10 ? '0' : '') + v.length + v }
  function crc16(s) {           /* CRC-16/CCITT-FALSE, theo chuẩn EMVCo */
    var c = 0xFFFF;
    for (var i = 0; i < s.length; i++) {
      c ^= s.charCodeAt(i) << 8;
      for (var k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
    }
    return ('000' + c.toString(16).toUpperCase()).slice(-4);
  }
  /* Chuỗi VietQR: ngân hàng (mã BIN) + số tài khoản + số tiền + nội dung chuyển khoản */
  function vietqr(bin, acc, amount, note) {
    var s = tlv('00', '01') + tlv('01', '12') +
      tlv('38', tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', acc)) + tlv('02', 'QRIBFTTA')) +
      tlv('53', '704') + tlv('54', amount) + tlv('58', 'VN') + tlv('62', tlv('08', note)) + '6304';
    return s + crc16(s);
  }
  K.vietqr = vietqr; K.crc16 = crc16;
  /* Mã đơn: DH + 8 ký tự, bỏ các ký tự dễ đọc nhầm (0/O, 1/I) vì 4 ký tự cuối là mã nhận đồ */
  function newCode() {
    var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = new Uint8Array(8), s = 'DH';
    (window.crypto || window.msCrypto).getRandomValues(r);
    for (var i = 0; i < 8; i++) s += a[r[i] % a.length];
    return s;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var r = new Uint8Array(16); crypto.getRandomValues(r); r[6] = (r[6] & 15) | 64; r[8] = (r[8] & 63) | 128;
    var h = [].map.call(r, function (b) { return ('0' + b.toString(16)).slice(-2) }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function outbox() { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]') } catch (e) { return [] } }
  function setOutbox(a) { try { localStorage.setItem(OUTBOX, JSON.stringify(a)) } catch (e) {} }
  function isNet(e) { return !navigator.onLine || !e || (!e.code && /fetch|network|load failed|timeout/i.test(e.message || '')) }
  function friendly(m) {
    m = m || '';
    if (/tạm hết/i.test(m)) return m + '. Bạn quay lại giỏ hàng để bỏ món đó nhé.';
    if (/không đủ nguyên liệu/i.test(m)) return 'Quán vừa hết nguyên liệu cho một số món (' + m.replace(/^.*?:\s*/, '') + '). Bạn quay lại giỏ hàng để chọn món khác nhé.';
    if (/ngắt|thay chỗ/i.test(m)) return 'Màn hình này đã bị ngắt. Vui lòng thanh toán tại quầy.';
    if (/quá nhiều đơn/i.test(m)) return 'Máy đang bận, bạn đợi khoảng 1 phút rồi thanh toán lại, hoặc thanh toán tại quầy.';
    var s = safeMsg(m, '');
    return 'Chưa tạo được đơn' + (s ? ' (' + s + ')' : '') + '. Vui lòng thanh toán tại quầy.';
  }
  function itemByName(n) { return ((K.snapshot && K.snapshot.items) || []).filter(function (it) { return it.name === n })[0] }

  function emit(o) { if (o.onchange) try { o.onchange(o) } catch (e) { console.error(e) } }
  function setState(o, st, err) {
    if (o.state === 'cancelled' || (o.state === 'paid' && st !== 'paid')) return;
    o.state = st; if (err) o.error = err; emit(o);
  }
  function queue(o) {
    var a = outbox();
    if (!a.some(function (x) { return x.ref === o.ref })) {
      a.push({ ref: o.ref, code: o.code, items: o.items, version: o.version, created_at: o.createdAt, amount: o.amount });
      setOutbox(a);
    }
  }
  function unqueue(ref) { setOutbox(outbox().filter(function (x) { return x.ref !== ref })) }

  /* Bắt đầu thanh toán cho giỏ hàng của app.js: [{n: tên món, p: giá (nghìn), du: đường %, da: đá % | null, q: số ly}] */
  K.newOrder = function (cart) {
    var shop = K.shop || {}, o = { state: 'creating', code: newCode(), ref: uuid(), version: K.version, createdAt: new Date().toISOString() };
    o.pickup = o.code.slice(-4);
    if (!shop.bank_bin || !shop.bank_account_no) { o.state = 'error'; o.error = 'Quán chưa cài tài khoản nhận tiền. Vui lòng thanh toán tại quầy.'; return o }
    var miss = [];
    o.items = []; o.amount = 0;
    (cart || []).forEach(function (x) {
      var it = itemByName(x.n), v = it && it._variant;
      if (!v) { miss.push(x.n); return }
      o.items.push({ variant_id: v.id, quantity: x.q, note: 'Đường ' + x.du + '%' + (x.da == null ? '' : ', đá ' + x.da + '%') });
      o.amount += v.price * x.q;
    });
    if (miss.length) { o.state = 'error'; o.error = 'Món ' + miss.join(', ') + ' vừa đổi trong menu. Bạn quay lại giỏ hàng để chọn lại nhé.'; return o }
    if (!o.items.length || !(o.amount > 0)) { o.state = 'error'; o.error = 'Giỏ hàng trống.'; return o }
    o.bank = BANKS[shop.bank_bin] || 'Ngân hàng';
    o.accountNo = shop.bank_account_no; o.accountName = shop.bank_account_name || '';
    o.qrText = vietqr(shop.bank_bin, shop.bank_account_no, o.amount, o.code);
    o.qr = window.KQR ? window.KQR.svg(o.qrText) : '';
    o.expiresAt = Date.now() + (shop.order_expiry_minutes || 10) * 60000;
    setTimeout(function () { sendOrder(o) });
    return o;
  };
  function sendOrder(o) {
    if (o.state === 'cancelled') return;
    if (!navigator.onLine) { queue(o); setState(o, 'offline'); return }
    sb.rpc('create_order', { p_shop_id: K.shopId, p_menu_version: o.version, p_items: o.items, p_terminal_id: K.terminalId,
                             p_client_ref: o.ref, p_payment_code: o.code }).then(function (r) {
      if (r.error) {
        if (isNet(r.error)) { queue(o); setState(o, 'offline') }
        else setState(o, 'error', friendly(r.error.message));
        return;
      }
      o.id = r.data;
      if (o.state === 'cancelled') { cancelOnServer(o); return }
      setState(o, 'wait'); poll(o);
    }, function () { queue(o); setState(o, 'offline') });
  }
  function poll(o) {
    clearInterval(o.t);
    o.t = setInterval(function () {
      if (o.state !== 'wait') return clearInterval(o.t);
      sb.from('orders').select('status').eq('id', o.id).maybeSingle().then(function (r) {
        if (r.error || !r.data) { if (!o.netDown) { o.netDown = true; emit(o) } return }
        if (o.netDown) { o.netDown = false; emit(o) }
        if (r.data.status === 'paid') { clearInterval(o.t); setState(o, 'paid') }
      }, function () { if (!o.netDown) { o.netDown = true; emit(o) } });
    }, POLL_MS);
  }
  function cancelOnServer(o) {
    if (o.id) sb.rpc('cancel_order', { p_order_id: o.id, p_reason: 'Khách huỷ ở màn hình quầy' }).then(function () {}, function () {});
  }
  /* Khách bấm Quay lại / Huỷ: huỷ đơn chưa trả tiền (đơn đã trả thì hàm trên máy chủ từ chối, không mất tiền) */
  K.cancelOrder = function (o) {
    if (!o || o.state === 'paid' || o.state === 'cancelled') return;
    clearInterval(o.t);
    var was = o.state; o.state = 'cancelled';
    if (was === 'offline') unqueue(o.ref);
    else cancelOnServer(o);
  };
  /* Hết giờ chờ trên máy: thôi theo dõi. Đơn trên máy chủ tự chuyển "quá hạn"; tiền về trễ vẫn được ghép.
     Đơn đang nằm trong hàng chờ (mất mạng) vẫn giữ lại để gửi lên, phòng khi khách đã chuyển khoản. */
  K.expireOrder = function (o) {
    if (!o || o.state === 'paid' || o.state === 'cancelled' || o.state === 'error') return;
    clearInterval(o.t); setState(o, 'expired');
  };
  K.pendingOrders = function () { return outbox().length };
  K.flushOutbox = function () { flushOutbox() };

  /* Gửi các đơn tạo lúc mất mạng (mỗi lần có tín hiệu) */
  var flushing = false;
  function flushOutbox() {
    var a = outbox();
    if (flushing || !a.length || !navigator.onLine) return;
    flushing = true;
    (function next(i) {
      if (i >= a.length) { flushing = false; return }
      var x = a[i];
      sb.rpc('create_order', { p_shop_id: K.shopId, p_menu_version: x.version, p_items: x.items, p_terminal_id: K.terminalId,
                               p_client_ref: x.ref, p_payment_code: x.code, p_client_created_at: x.created_at }).then(function (r) {
        /* vẫn mất mạng, hoặc máy chủ báo gửi quá nhanh (PT429): giữ đơn, để lần sau */
        if (r.error && (isNet(r.error) || r.error.code === 'PT429')) { flushing = false; return }
        if (r.error) console.error('Không gửi được đơn ' + x.code + ': ' + r.error.message);
        unqueue(x.ref); next(i + 1);
      }, function () { flushing = false });
    })(0);
  }

  /* ---------- tín hiệu mỗi phút + kiểm tra menu mới ---------- */
  function beat() {
    if (!K.terminalId || !navigator.onLine) return;
    flushOutbox(); loadShop();
    sb.rpc('terminal_heartbeat', { p_terminal_id: K.terminalId, p_menu_version: K.version }).then(function (r) {
      if (r.error) {
        if (r.error.code === '42501') setBanner('Màn hình này đã bị ngắt hoặc máy khác đã thay chỗ. Hãy mở lại link do chủ quán cung cấp.');
        return;
      }
      setBanner('');
      return sb.from('menu_versions').select('version').eq('shop_id', K.shopId).order('version', { ascending: false }).limit(1).then(function (v) {
        var latest = v.data && v.data[0] && v.data[0].version;
        if (latest && latest > K.version && latest > K.pendingVersion) {
          return fetchLatest().then(function (row) {
            if (!row) return;
            var st = load() || {}; st.snap = row.snapshot; st.ver = row.version; save(st);
            K.pendingVersion = row.version;
          });
        }
      });
    }).catch(function () {});
  }

  /* Menu mới chỉ áp dụng khi không ai đang dùng: màn hình chờ, giỏ trống, không đang chạy hiệu ứng */
  function applyWhenIdle() {
    if (!K.pendingVersion) return;
    if (window.scene === 'wait' && !window.busy && window.cart && window.cart.length === 0) location.reload();
  }

  boot();
})();
