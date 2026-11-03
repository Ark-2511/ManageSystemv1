/* ================= DỮ LIỆU ================= */
var IMG_DIR='assets/picture/';
/* Tên file ảnh: tên món không dấu, viết hoa chữ đầu mỗi từ, viết liền. VD: "Cà phê sỉu" -> CaPheSiu.png */
function imgName(n){
 return n.replace(/đ/g,'d').replace(/Đ/g,'D').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .split(/[^A-Za-z0-9]+/).filter(Boolean).map(function(w){return w.charAt(0).toUpperCase()+w.slice(1)}).join('')+'.png';
}
/* Lọc ký tự HTML trước khi chèn dữ liệu menu (lấy từ Supabase) vào trang: chữ hiện y hệt nhưng không chèn được mã */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
/* Chưa có ảnh thì ẩn ảnh, giữ khung trống (không hiện biểu tượng ảnh lỗi) */
function imgTag(n){var f=(window.IMG_MAP&&window.IMG_MAP[n])||imgName(n);return '<img src="'+esc(/^https?:/.test(f)?f:IMG_DIR+f)+'" alt="'+esc(n)+'" draggable="false">'}
/* Ảnh món lỗi thì ẩn đi (thay cho onerror trong HTML, vì chính sách bảo mật CSP chặn mã viết thẳng trong thẻ) */
document.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='IMG')t.style.visibility='hidden'},true);

/* Menu: [tên món, giá (nghìn đồng)] theo từng danh mục */
var MENU=window.KMENU||{}; /* từ Supabase (js/kiosk.js) */
/* Mô tả TẠM — sẽ thay bằng mô tả đúng của từng món */
var DESC=window.KDESC||{};
var DESC_TAM='Mô tả đang cập nhật';
/* Thanh đánh giá ở DrinkDetail: nhóm nào hiện thanh nào */
var RATE_BARS={
 'Signature':['dam','ngot','ngay'],'Cafe':['dam','ngot','ngay'],'Espresso':['dam','ngot','ngay'],'Cold Brew':['dam','ngot','ngay'],
 'Tea':['tra','ngot'],'Kombucha':['tra','ngot'],
 'Matcha - Cacao':['ngot','ngay']
};
/* Tên thanh và 5 chữ mức độ; thang 10: mỗi chữ dùng cho 2 mức (1-2, 3-4, 5-6, 7-8, 9-10) */
var RATE_INFO={
 dam:{t:'Độ đậm',w:['Rất nhẹ','Nhẹ','Vừa','Đậm','Rất đậm']},
 tra:{t:'Độ đậm trà',w:['Rất nhẹ','Nhẹ','Vừa','Đậm','Rất đậm']},
 ngot:{t:'Độ ngọt',w:['Rất ít','Ít','Vừa','Ngọt','Rất ngọt']},
 ngay:{t:'Độ ngậy',w:['Rất ít','Ít','Vừa','Nhiều','Rất nhiều']}
};
/* Mức của từng món, THANG 10 (1 -> 10), theo đúng thứ tự thanh của nhóm. BẢN NHÁP: chủ quán duyệt và sửa */
/* Gợi ý đường đá ở DrinkDetail: [đường %, đá %]. null = không hiện nhãn đó (VD món nóng không có đá). BẢN NHÁP: chủ quán duyệt và sửa */
var SUGGEST=window.KSUGGEST||{};
function rateBars(c){return RATE_BARS[c]||['dam','ngot','ngay']}
/* Thanh khẩu vị của từng món (chủ quán khai ở trang quản lý); món cũ thì theo nhóm */
function itemBars(n,c){return (window.KBARS&&window.KBARS[n])||rateBars(c)}
var RATE_MAX=10; /* thang điểm */
var RATE=window.KRATE||{};
/* Câu hỏi "Tìm ly dành cho bạn" (TẠM): q = câu hỏi, a = [đáp án, ghi chú nhỏ] */
var QUIZ=[
 {q:'Bạn thích vị nào hơn?',a:[['Chua thanh','Sáng, nhẹ, có chút trái cây'],['Đắng đậm','Mạnh, rõ vị cà phê'],['Ngọt dịu','Êm, ít đắng, dễ uống'],['Béo mượt','Nhiều sữa, mượt ở vị giác']]},
 {q:'Bạn cần gì lúc này?',a:[['Tỉnh táo','Muốn một thức uống giúp tỉnh táo'],['Thư giãn','Nhẹ nhàng, nhâm nhi'],['Nạp năng lượng','Một ly để bắt đầu ngày mới'],['Thử điều mới','Muốn khám phá hương vị khác']]},
 {q:'Bạn thích uống thế nào?',a:[['Nóng','Ấm áp, thơm dịu'],['Lạnh','Mát lạnh, sảng khoái'],['Đá xay','Mát lạnh, kết cấu sánh mịn'],['Sao cũng được','Để quán gợi ý cho bạn']]}
];
function desc(n){return DESC[n]||DESC_TAM}
function price(n){for(var c in MENU)for(var i=0;i<MENU[c].length;i++)if(MENU[c][i][0]===n)return MENU[c][i][1]+'K';return ''}

/* ================= HIỆU ỨNG: TIỆN ÍCH ================= */
var SPEED=0.2;
var RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function T(ms){return RM?1:ms*SPEED} /* SPEED: 1 = gốc, nhỏ hơn = nhanh hơn. Nhớ chỉnh .cats transition = 0.6s × SPEED */
function delay(ms){return new Promise(function(r){setTimeout(r,T(ms))})}
function mod(a,n){return ((a%n)+n)%n}
function tx(x){return 'translateX('+x+'px)'}

/* ================= MÀN HÌNH CHỜ: 3 MÓN GỢI Ý ================= */
var items=[
 {n:'Gạo Béo',tag:'Best seller'},
 {n:'Cốm Non Gạo Giòn',tag:'Signature'},
 {n:'Gạo Mây',tag:'Gợi ý hôm nay'}
];
var box=document.getElementById('cards');
items.forEach(function(it,k){var e=document.createElement('div');e.className='card';e.onclick=function(){onCard(k)};e.innerHTML='<div class="art">'+imgTag(it.n)+'</div><span class="tag">'+esc(it.tag)+'</span><div class="info"><h2>'+esc(it.n)+'</h2><span>'+esc(price(it.n))+'</span></div><small>'+esc(desc(it.n))+'</small>';box.appendChild(e);it.el=e});
var cur=1,rotTimer;
function place(){items.forEach(function(it,i){var o=((i-cur+4)%3)-1,a=Math.abs(o);it.el.style.transform='translateX(calc(-50% + '+(o*410)+'px)) scale('+(a?0.78:1.08)+')';it.el.style.opacity=a?0.9:1;it.el.style.zIndex=a?1:2})}
function startRot(){clearInterval(rotTimer);rotTimer=setInterval(function(){cur=(cur+1)%3;place()},4500)}
function stopRot(){clearInterval(rotTimer)}
place();startRot();

/* ================= HÀNG DANH MỤC ================= */
var CAT_ICONS={};(function(a){a.forEach(function(c){CAT_ICONS[c[0]]=c[1]})})([['Signature','M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z'],['Cafe','M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 11h1.5a2.5 2.5 0 0 1 0 5H16 M8 3v3 M12 3v3'],['Espresso','M6 9h10v3a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z M16 10h1.5a1.8 1.8 0 0 1 0 3.6H16 M4 20h16'],['Cold Brew','M6 4h12l-1.5 16h-9z M7.2 9h9.6 M10 12h3v3h-3z'],['Kombucha','M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3z M8 13h8'],['Matcha - Cacao','M5 19c0-9 5-14 14-14 0 9-5 14-14 14z M5 19l8-8'],['Tea','M6 10h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z M16 11h2a2 2 0 0 1 0 4h-2 M9 7c0-2 3-2 3-4']]);
var CAT_ICON_DEF='M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 11h1.5a2.5 2.5 0 0 1 0 5H16';
var cats=(window.CAT_NAMES||[]).map(function(n){return [n,CAT_ICONS[n]||CAT_ICON_DEF]});
/* Ô (slot) giống bố cục flex cũ: nút 131px (128 + viền), cách nhau 24px, căn giữa khung 1280px */
var N=cats.length,BTN_W=131,SLOT_W=BTN_W+24,SLOT0=(1280-(N*BTN_W+(N-1)*24))/2,MID=Math.floor(N/2);
var ROW_TOP=540,ROW_DROP=24;
var BTN={x:640,y:ROW_TOP+ROW_DROP+BTN_W/2}; /* tâm nút ở giữa đáy trong ShowDrink */
function slotX(s){return SLOT0+s*SLOT_W}
var rot=0,catEls=[];
var cb=document.getElementById('cats');
cats.forEach(function(c,i){var w=document.createElement('div');w.className='cw';var b=document.createElement('div');b.className='cat';b.style.animationDelay=(i*.35)+'s';b.innerHTML='<svg viewBox="0 0 24 24"><path d="'+c[1]+'"/></svg>'+esc(c[0]).replace(' - ','<br>');b.onclick=function(){onCat(i)};w.appendChild(b);cb.appendChild(w);catEls.push(w)});
function layoutCats(){catEls.forEach(function(w,i){w.style.transform=tx(slotX(mod(i+rot,N)))})}
layoutCats();
function setSel(i){catEls.forEach(function(w,k){w.firstChild.classList.toggle('sel',k===i)})}
/* Xoay vòng hàng nút: cả hàng dịch cùng hướng, nút ra khỏi mép màn hình sẽ đi vào lại từ mép bên kia */
function rotateTo(target,dur){
 var d=mod(target-rot,N);if(d>MID)d-=N;
 if(!d){rot=target;return Promise.resolve()}
 var ps=[],OUT_R=1300,OUT_L=-BTN_W-20;
 catEls.forEach(function(w,i){
  var s0=mod(i+rot,N),v=s0+d,s1=mod(v,N),x0=slotX(s0),x1=slotX(s1),fr;
  if(v===s1)fr=[{transform:tx(x0)},{transform:tx(x1)}];
  else{var ex=d>0?OUT_R:OUT_L,en=d>0?OUT_L:OUT_R,a=Math.abs(ex-x0),b=Math.abs(x1-en),o=a/(a+b);
   fr=[{transform:tx(x0)},{transform:tx(ex),offset:o},{transform:tx(en),offset:o},{transform:tx(x1)}]}
  w.style.transform=tx(x1);
  ps.push(w.animate(fr,{duration:T(dur),easing:'cubic-bezier(.45,0,.25,1)'}).finished)});
 rot=target;return Promise.all(ps);
}

/* ================= THẺ GỢI Ý: THU VÀO / BUNG RA TỪ NÚT ================= */
var CARD_W=380,CARD_CY=128+344/2;
function cardHidden(){return 'translateX('+(-CARD_W/2)+'px) translateY('+(BTN.y-CARD_CY)+'px) scale(.12)'}
/* skip: thẻ được chạm (đã biến thành khung chi tiết) -> ẩn ngay, không bay vào nút */
function collectCards(skip){
 return Promise.all(items.map(function(it,k){
  it.el.style.pointerEvents='none';if(it.a)it.a.cancel();
  it.a=it.el.animate([{transform:it.el.style.transform,opacity:it.el.style.opacity},{transform:cardHidden(),opacity:0}],k===skip?{duration:1,fill:'forwards'}:{duration:T(520),delay:T(k*110),easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'});
  return it.a.finished}));
}
function releaseCards(){
 return Promise.all(items.map(function(it,k){
  var old=it.a;
  it.a=it.el.animate([{transform:cardHidden(),opacity:0},{transform:it.el.style.transform,opacity:it.el.style.opacity}],{duration:T(600),delay:T(k*110),easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
  if(old)old.cancel();
  return it.a.finished.then(function(){it.el.style.pointerEvents=''})}));
}

/* ================= SHOWDRINK: CHIA BÀI CÁC MÓN ================= */
var drinksBox=document.getElementById('drinks'),dkEls=[];
var PLUS_SVG='<svg viewBox="0 0 24 24"><path d="M12 5v14 M5 12h14"/></svg>';
var CUP_SVG='<svg viewBox="0 0 24 24"><path d="M4 9h12v4a6 6 0 0 1-6 6h0a6 6 0 0 1-6-6z M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16 M10 2.5v4 M8 4.5h4"/></svg>';
var DK=250,DK_GAP=232,DK_HIGH=240,DK_LOW=380;
/* Vị trí so le cao/thấp như bản phác, căn giữa theo số món (3–5) */
/* SL_CX, SL_GAP, DK_SC: tâm hàng món, khoảng cách, tỉ lệ vòng tròn. Đổi khi giỏ hàng hiện (xem setGeom) */
var SL_CX=640,SL_GAP=DK_GAP,DK_SC=1;
function slotsFor(n){var r=[];for(var i=0;i<n;i++)r.push({x:SL_CX+(i-(n-1)/2)*SL_GAP,y:i%2?DK_LOW:DK_HIGH});return r}
/* Vị trí xuất phát khi chia bài: từ nút danh mục ở giữa đáy */
function fromTf(s,i){return 'translate('+(BTN.x-s.x)+'px,'+(BTN.y-s.y)+'px) scale(.2) rotate('+(i%2?14:-14)+'deg)'}
/* Tạo các vòng tròn món của một danh mục tại vị trí ShowDrink (chưa chạy hiệu ứng) */
function makeDrinks(cat){
 var list=MENU[cat],sl=slotsFor(list.length);drinksBox.innerHTML='';dkEls=[];
 list.forEach(function(m,i){
  var s=sl[i],e=document.createElement('div');e.className='dk';
  e.style.left=(s.x-DK/2)+'px';e.style.top=(s.y-DK/2)+'px';e._cx=s.x;e._cy=s.y;e._m=m;
  e.innerHTML='<div class="bob" style="animation-delay:-'+(i*.7)+'s"><div class="dc"><div class="ph">'+imgTag(m[0])+'</div><div class="nm"><h3>'+esc(m[0])+'</h3><span class="pr">'+esc(m[1])+'K</span></div><small>'+esc(desc(m[0]))+'</small></div><button class="ob ob-plus" type="button" aria-label="Gọi món '+esc(m[0])+'">'+PLUS_SVG+'</button></div>';
  e.querySelector('.dc').onclick=function(){onDrink(i)};
  e.querySelector('.ob-plus').onclick=function(){if(scene==='show')run(function(){return openOrder(m)})};
  drinksBox.appendChild(e);dkEls.push(e);
  e._from=fromTf(s,i);
 });
}
function dealDrinks(cat){
 makeDrinks(cat);
 return Promise.all(dkEls.map(function(e,i){
  return e.animate([{transform:e._from,opacity:0},{transform:'none',opacity:1}],{duration:T(560),delay:T(i*110),easing:'cubic-bezier(.2,.9,.25,1.08)',fill:'backwards'}).finished}));
}
function collectDrinks(){
 var n=dkEls.length;
 return Promise.all(dkEls.map(function(e,i){
  e.style.pointerEvents='none';
  return e.animate([{transform:e.style.transform||'none',opacity:1},{transform:e._from,opacity:0}],{duration:T(420),delay:T((n-1-i)*80),easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'}).finished}))
 .then(function(){drinksBox.innerHTML='';dkEls=[]});
}

/* ================= DRINKDETAIL ================= */
var PANEL={x:40,y:40,w:1020,h:500,r:30};          /* khung chi tiết */
var MINI=0.5,MINI_D=DK*MINI,COL_X=1150,COL_GAP=6;  /* cột món thu nhỏ bên phải */
var detailIdx=-1,panel=null;
function colY(k,n){return PANEL.y+PANEL.h/2+(k-(n-1)/2)*(MINI_D+COL_GAP)}
/* Thứ tự cột phải: các món còn lại theo đúng thứ tự menu */
function colOrder(cur){var r=[];dkEls.forEach(function(e,i){if(i!==cur)r.push(i)});return r}
function miniTf(e,k,n){return 'translate('+(COL_X-e._cx)+'px,'+(colY(k,n)-e._cy)+'px) scale('+MINI+')'}
function miniRect(k,n){return {x:COL_X-MINI_D/2,y:colY(k,n)-MINI_D/2,w:MINI_D,h:MINI_D,r:MINI_D/2}}
function circleRect(e){var d=DK*DK_SC;return {x:e._cx-d/2,y:e._cy-d/2,w:d,h:d,r:d/2}}
function rectCss(r){return {left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',borderRadius:r.r+'px'}}
/* Vị trí của một phần tử tính theo toạ độ khung 1280×720 */
function stageRect(el,radius){var s=stage.getBoundingClientRect(),k=s.width/1280,r=el.getBoundingClientRect();return {x:(r.left-s.left)/k,y:(r.top-s.top)/k,w:r.width/k,h:r.height/k,r:radius*(r.width/k)/el.offsetWidth}}
/* XEM THỬ bố cục mới ở DrinkDetail: giá cạnh tên món, mô tả ngắn ở dòng dưới.
   Chỉ áp dụng cho các món trong danh sách. Muốn bật cho mọi món thì đổi thành DETAIL_PREVIEW=true */
var DETAIL_PREVIEW=true;
function isPreview(n){return DETAIL_PREVIEW===true||DETAIL_PREVIEW.indexOf(n)>=0}
/* Tên quá dài: tách tên để giá nằm ở dòng 1 (VD "Trà Oolong Gạo 55K" / "đậm vị"), tránh 1 chữ lẻ ở dòng 2 */
function fitTitle(h,m){
 var pr='<span class="pr">'+esc(m[1])+'K</span>',lh=parseFloat(getComputedStyle(h).lineHeight);
 if(h.offsetHeight<=lh*1.5)return; /* vừa 1 dòng: giữ nguyên */
 var w=m[0].split(' '),best=0;
 for(var k=w.length-1;k>=1;k--){h.innerHTML=esc(w.slice(0,k).join(' '))+pr+'<br>'+esc(w.slice(k).join(' '));if(h.offsetHeight<=lh*2.5){best=k;break}}
 if(!best){h.innerHTML=esc(m[0])+pr;return}
 if(w.length-best===1&&best>=3)best--;
 h.innerHTML=esc(w.slice(0,best).join(' '))+pr+'<br>'+esc(w.slice(best).join(' '));
}
function rateHtml(n){
 var f=catOf(n),bars=f&&itemBars(n,cats[f.c][0]),v=RATE[n];if(!bars||!v)return '';
 return '<div class="dd-rate">'+bars.map(function(k,i){var lv=Math.max(1,Math.min(RATE_MAX,v[i]||1)),wi=Math.min(4,Math.ceil(lv/(RATE_MAX/5))-1);
  return '<div class="rt"><span class="rt-n">'+RATE_INFO[k].t+'</span><span class="rt-bar"><b class="rt-'+k+'" style="width:'+(lv/RATE_MAX*100)+'%"></b></span><span class="rt-v">'+RATE_INFO[k].w[wi]+'</span></div>'}).join('')+'</div>';
}
/* Phần "Gợi ý" đường đá, nằm dưới cùng cột chữ của DrinkDetail */
var SVG_SUGAR='<svg class="sg-ic" viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9"/></svg>';
var SVG_ICE='<svg class="sg-ic" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 9.5c.6-1.2 1.6-1.8 3-2"/></svg>';
var SVG_STAR='<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z"/></svg>';
function sugHtml(n){
 var v=SUGGEST[n];if(!v)return '';
 var c=(v[0]!=null?'<div class="sg-chip">'+SVG_SUGAR+'<span>Đường</span>'+esc(v[0])+'%</div>':'')+(v[1]!=null?'<div class="sg-chip">'+SVG_ICE+'<span>Đá</span>'+esc(v[1])+'%</div>':'');
 return c?'<div class="dd-sug"><div class="sg-cap">'+SVG_STAR+'Gợi ý</div><div class="sg-chips">'+c+'</div></div>':'';
}
function makePanel(m){
 var p=document.createElement('div');p.className='dd';
 p.innerHTML='<div class="dd-in"><div class="dd-txt">'+(isPreview(m[0])
  ?'<div class="dd-head"><h2>'+esc(m[0])+'<span class="pr">'+esc(m[1])+'K</span></h2></div><p class="dd-note">'+esc(desc(m[0]))+'</p>'
  :'<h2>'+esc(m[0])+'</h2><span class="pr">'+esc(m[1])+'K</span>')+rateHtml(m[0])+'<div class="dd-body"></div></div>'+sugHtml(m[0])+'<div class="dd-art">'+imgTag(m[0])+'</div><button class="dd-x" type="button" aria-label="Đóng"><svg viewBox="0 0 24 24"><path d="M6 6l12 12 M18 6L6 18"/></svg></button></div>';
 p.querySelector('.dd-in').insertAdjacentHTML('beforeend','<button class="ob ob-in" type="button">'+CUP_SVG+'Gọi món</button>');
 p.querySelector('.ob-in').onclick=function(){if(scene==='detail')run(function(){return openOrder(m)})};
 p._m=m;
 p.querySelector('.dd-x').onclick=function(){if(scene==='detail')run(closeDetail)};
 drinksBox.insertBefore(p,drinksBox.firstChild); /* nằm dưới các món thu nhỏ */
 if(isPreview(m[0]))fitTitle(p.querySelector('.dd-head h2'),m);
 return p;
}
/* Khung co giãn từ hình dạng/vị trí a sang b */
function morph(p,a,b,dur,dl){
 var f=rectCss(b);for(var k in f)p.style[k]=f[k];
 return p.animate([rectCss(a),rectCss(b)],{duration:T(dur),delay:T(dl||0),easing:'cubic-bezier(.3,.7,.2,1)',fill:'backwards'}).finished;
}
function fadeIn(p,dl){
 /* thanh đánh giá chạy từ 0 lên mức của món, lần lượt từng thanh */
 [].forEach.call(p.querySelectorAll('.dd-rate b'),function(b,i){b.animate([{width:'0%'},{width:b.style.width}],{duration:T(700),delay:T((dl||0)+200+i*120),easing:'cubic-bezier(.3,.7,.2,1)',fill:'backwards'})});
 return p.querySelector('.dd-in').animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:T(320),delay:T(dl||0),easing:'ease-out',fill:'both'}).finished}
function fadeOut(p){return p.querySelector('.dd-in').animate([{opacity:1},{opacity:0}],{duration:T(160),fill:'forwards'}).finished}
/* Các món khác: thu nhỏ, bay lên trên rồi xếp gọn vào cột phải */
function minimizeOthers(cur){
 var ord=colOrder(cur),n=ord.length;
 return Promise.all(ord.map(function(i,k){
  var e=dkEls[i],to=miniTf(e,k,n),up='translate(0px,'+(70-e._cy)+'px) scale('+MINI+')';
  e.classList.add('mini');e.style.transform=to;
  return e.animate([{transform:'none'},{transform:up,offset:.45},{transform:to}],{duration:T(700),delay:T(k*60),easing:'cubic-bezier(.4,0,.2,1)',fill:'backwards'}).finished}));
}
function restoreOthers(cur){
 var ord=colOrder(cur),n=ord.length;
 return Promise.all(ord.map(function(i,k){
  var e=dkEls[i],from=e.style.transform,up='translate(0px,'+(70-e._cy)+'px) scale('+MINI+')';
  e.style.transform='';
  var a=e.animate([{transform:from},{transform:up,offset:.55},{transform:'none'}],{duration:T(700),delay:T(k*60),easing:'cubic-bezier(.4,0,.2,1)',fill:'backwards'});
  return a.finished.then(function(){e.classList.remove('mini')})}));
}
function hideDk(e){e.style.opacity=0;e.style.pointerEvents='none'}
function showDk(e){e.style.opacity='';e.style.pointerEvents=''}
/* ShowDrink -> DrinkDetail */
function openDetail(i){
 scene='detail';detailIdx=i;stage.classList.add('detail');
 var e=dkEls[i];panel=makePanel(e._m);hideDk(e);
 return Promise.all([minimizeOthers(i),morph(panel,circleRect(e),PANEL,600,150).then(function(){return fadeIn(panel)})]);
}
/* DrinkDetail -> ShowDrink: đảo ngược */
function closeDetail(){
 var e=dkEls[detailIdx],p=panel;
 return fadeOut(p).then(function(){
  return Promise.all([restoreOthers(detailIdx),morph(p,PANEL,circleRect(e),560)]);
 }).then(function(){showDk(e);p.remove();panel=null;detailIdx=-1;scene='show';stage.classList.remove('detail')});
}
/* Đổi món từ cột phải: món đang xem thu về cột, món được chạm phóng to thành khung */
function swapDetail(j){
 var old=detailIdx,oe=dkEls[old],je=dkEls[j],op=panel,ordOld=colOrder(old),nOld=ordOld.length;
 var ord=colOrder(j),n=ord.length,from=miniRect(ordOld.indexOf(j),nOld);
 detailIdx=j;panel=makePanel(je._m);hideDk(je);
 je.style.transform='';je.classList.remove('mini'); /* về vị trí ShowDrink (đang ẩn) để lúc đóng thu về đúng chỗ */
 var moves=ord.map(function(i,k){
  var e=dkEls[i],to=miniTf(e,k,n);if(i===old)return null;
  var a=e.style.transform;e.style.transform=to;
  return e.animate([{transform:a},{transform:to}],{duration:T(500),easing:'cubic-bezier(.4,0,.2,1)'}).finished});
 var k0=ord.indexOf(old);
 var back=fadeOut(op).then(function(){return morph(op,PANEL,miniRect(k0,n),560)}).then(function(){
  oe.classList.add('mini');oe.style.transform=miniTf(oe,k0,n);showDk(oe);op.remove()});
 var grow=morph(panel,from,PANEL,600,100).then(function(){return fadeIn(panel)});
 return Promise.all(moves.filter(Boolean).concat([back,grow]));
}
/* Màn hình chờ -> DrinkDetail: chạm thẻ gợi ý */
/* Các món còn lại của danh mục bay từ nút giữa ra cột phải (dùng chung) */
function dealMinis(cur){
 var ord=colOrder(cur),n=ord.length;
 return Promise.all(ord.map(function(i,j){
  var e=dkEls[i],to=miniTf(e,j,n);e.classList.add('mini');e.style.transform=to;e.style.opacity='';
  return e.animate([{transform:e._from,opacity:0},{transform:to,opacity:1}],{duration:T(560),delay:T(j*110),easing:'cubic-bezier(.2,.9,.25,1.08)',fill:'backwards'}).finished}));
}
function catOf(n){for(var c=0;c<cats.length;c++){var l=MENU[cats[c][0]];for(var i=0;i<l.length;i++)if(l[i][0]===n)return {c:c,i:i}}return null}
function openFromWait(k){
 var it=items[k],f=catOf(it.n);if(!f)return Promise.resolve();
 scene='detail';curCat=f.c;detailIdx=f.i;stopRot();setSel(f.c);stage.classList.add('show','detail');
 setGeom(cart.length>0);syncCart();
 var cardRect=stageRect(it.el,30);
 makeDrinks(cats[f.c][0]);hideDk(dkEls[f.i]);
 dkEls.forEach(function(e,i){if(i!==f.i)e.style.opacity=0});
 panel=makePanel(MENU[cats[f.c][0]][f.i]);
 var grow=morph(panel,cardRect,PANEL,600).then(function(){return fadeIn(panel)});
 /* thẻ được chạm ẩn ngay vì khung chi tiết thay chỗ nó */
 if(it.a)it.a.cancel();it.el.style.pointerEvents='none';it.a=it.el.animate([{opacity:0},{opacity:0}],{duration:1,fill:'forwards'});
 var others=Promise.all([rotateTo(mod(MID-f.c,N),700),delay(600)]).then(function(){return collectCards(k)}).then(function(){return dealMinis(f.i)});
 return Promise.all([grow,others]);
}

/* ================= CHUYỂN CẢNH ================= */
var stage=document.getElementById('stage'),scene='wait',busy=false,curCat=-1;
function run(fn){if(busy)return;busy=true;fn().then(function(){busy=false},function(e){busy=false;console.error(e)})}
function onCat(i){
 if(scene==='wait')run(function(){return toShow(i)});
 else if(scene==='show'){if(i!==curCat)run(function(){return switchCat(i)})}
 /* Đang xem chi tiết: đóng về ShowDrink, nếu là danh mục khác thì chuyển tiếp sang danh mục đó */
 else if(scene==='detail')run(function(){return closeDetail().then(function(){if(i!==curCat)return switchCat(i)})});
 /* Đang ở Order: đóng Order (không thêm món) rồi đi tiếp như ở màn trước đó */
 else if(scene==='order')run(function(){return closeOrder().then(function(){
  if(scene==='detail')return closeDetail().then(function(){if(i!==curCat)return switchCat(i)});
  if(i!==curCat)return switchCat(i)})});
}
/* Chạm một món: ở ShowDrink -> mở chi tiết; ở DrinkDetail (cột phải) -> đổi sang món đó */
function onDrink(i){
 if(scene==='show')run(function(){return openDetail(i)});
 else if(scene==='detail'&&i!==detailIdx)run(function(){return swapDetail(i)});
}
/* Chạm thẻ gợi ý ở màn hình chờ -> DrinkDetail của món đó (vào đúng danh mục) */
function onCard(k){if(scene==='wait')run(function(){return openFromWait(k)})}
/* Màn hình chờ -> ShowDrink: đưa nút vào giữa đáy, thu thẻ gợi ý vào nút, chia bài các món */
function toShow(i){
 scene='show';curCat=i;stopRot();setSel(i);stage.classList.add('show');
 setGeom(cart.length>0);syncCart();
 return Promise.all([rotateTo(mod(MID-i,N),700),delay(600)]).then(function(){return collectCards()}).then(function(){return dealDrinks(cats[i][0])});
}
/* Đổi danh mục trong ShowDrink: thu món hiện tại, xoay nút mới vào giữa, chia bài món mới */
function switchCat(i){
 curCat=i;setSel(i);
 return collectDrinks().then(function(){return rotateTo(mod(MID-i,N),700)}).then(function(){return dealDrinks(cats[i][0])});
}
/* ShowDrink -> màn hình chờ: đảo ngược hiệu ứng */
function toWait(){
 scene='wait';syncCart();
 return collectDrinks().then(releaseCards).then(function(){
  stage.classList.remove('show');setSel(-1);
  return Promise.all([rotateTo(0,700),delay(600)])}).then(function(){curCat=-1;startRot()});
}
document.getElementById('back').onclick=function(){if(scene==='show')run(toWait)};

/* ================= TÌM LY DÀNH CHO BẠN ================= */
var finderBtn=document.getElementById('finder');
var QPANEL={x:40,y:40,w:1200,h:640,r:30};
var quizPanel=null,qCur=0,qAns=[],qBusy=false,qToastT;
var SVG_CHECK='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var SVG_L='<svg viewBox="0 0 24 24"><path d="M19 12H5 M11 6l-6 6 6 6"/></svg>',SVG_R='<svg viewBox="0 0 24 24"><path d="M5 12h14 M13 6l6 6-6 6"/></svg>';
function finderRect(){return stageRect(finderBtn,27)}
/* Câu xa nhất khách được chạm tới: mọi câu trước đó đã trả lời */
function qReach(){for(var i=0;i<QUIZ.length;i++)if(qAns[i]==null)return i;return QUIZ.length-1}
function makeQuiz(){
 var p=document.createElement('div');p.className='dd qz';
 p.innerHTML='<div class="dd-in"><div class="q-side"><h2>Tìm ly dành cho bạn</h2><p>'+QUIZ.length+' câu hỏi nhỏ dành cho bạn</p><div class="q-steps"></div></div>'+
  '<div class="q-main"><div class="q-body"></div><div class="q-nav"><button class="q-btn q-prev" type="button">'+SVG_L+'Câu trước</button><span class="q-hint">Hãy chọn một đáp án</span><button class="q-btn pri q-next" type="button"></button></div></div>'+
  '<button class="dd-x q-x" type="button" aria-label="Đóng"><svg viewBox="0 0 24 24"><path d="M6 6l12 12 M18 6L6 18"/></svg></button><div class="q-toast">Tính năng đang hoàn thiện</div></div>';
 p.querySelector('.q-x').onclick=function(){if(scene==='quiz')run(closeQuiz)};
 p.querySelector('.q-prev').onclick=function(){if(qCur>0)qGo(qCur-1)};
 p.querySelector('.q-next').onclick=qNext;
 stage.appendChild(p);quizPanel=p;renderSteps();renderBody();
 return p;
}
function renderSteps(){
 var box=quizPanel.querySelector('.q-steps'),reach=qReach();box.innerHTML='';
 QUIZ.forEach(function(q,i){
  var b=document.createElement('button');b.type='button';
  b.className='q-step'+(i===qCur?' cur':qAns[i]!=null?' done':'')+(i>reach?' lock':'');
  b.innerHTML='<span class="n">'+(qAns[i]!=null&&i!==qCur?SVG_CHECK:(i+1))+'</span><span><b>'+q.q+'</b>'+(qAns[i]!=null?'<small>'+q.a[qAns[i]][0]+'</small>':'')+'</span>';
  b.onclick=function(){if(i<=qReach()&&i!==qCur)qGo(i)};
  box.appendChild(b)});
}
function renderBody(){
 var q=QUIZ[qCur],body=quizPanel.querySelector('.q-body');
 body.innerHTML='<div class="q-count">Câu '+(qCur+1)+' / '+QUIZ.length+'</div><h3>'+q.q+'</h3><div class="q-grid"></div>';
 var g=body.querySelector('.q-grid');
 q.a.forEach(function(a,i){
  var b=document.createElement('button');b.type='button';b.className='q-ans'+(qAns[qCur]===i?' on':'');
  b.innerHTML='<b>'+a[0]+'</b><span>'+a[1]+'</span><i class="ck">'+SVG_CHECK+'</i>';
  b.onclick=function(){qPick(i)};g.appendChild(b)});
 quizPanel.querySelector('.q-prev').classList.toggle('hide',qCur===0);
 quizPanel.querySelector('.q-next').innerHTML=qCur<QUIZ.length-1?'Câu tiếp theo'+SVG_R:'Xem ly của bạn'+SVG_R;
 quizPanel.querySelector('.q-hint').classList.remove('on');
}
function qPick(i){
 qAns[qCur]=i;
 [].forEach.call(quizPanel.querySelectorAll('.q-ans'),function(b,k){b.classList.toggle('on',k===i)});
 quizPanel.querySelector('.q-hint').classList.remove('on');renderSteps();
}
function qNext(){
 if(qBusy)return;
 if(qAns[qCur]==null){quizPanel.querySelector('.q-hint').classList.add('on');
  quizPanel.querySelector('.q-grid').animate([{transform:'none'},{transform:'translateX(-8px)'},{transform:'translateX(8px)'},{transform:'none'}],{duration:T(320)});return}
 if(qCur<QUIZ.length-1)return qGo(qCur+1);
 /* Câu cuối: TẠM THỜI luôn gợi ý QUIZ_RESULT (chưa có quy tắc đáp án -> món) */
 if(scene==='quiz')run(function(){return quizToDetail(QUIZ_RESULT)});
}
var QUIZ_RESULT='Cốm Non Gạo Giòn';
/* Khung câu hỏi thu lại thành khung DrinkDetail của món được gợi ý; hàng danh mục hiện lại với đúng nhóm ở giữa */
function quizToDetail(name){
 var f=catOf(name),qp=quizPanel;if(!f)return Promise.resolve();
 return fadeOut(qp).then(function(){
  scene='detail';curCat=f.c;detailIdx=f.i;setSel(f.c);setGeom(cart.length>0);
  return rotateTo(mod(MID-f.c,N),1);
 }).then(function(){
  makeDrinks(cats[f.c][0]);hideDk(dkEls[f.i]);
  dkEls.forEach(function(e,i){if(i!==f.i)e.style.opacity=0});
  stage.classList.remove('quiz');stage.classList.add('show','detail');
  return morph(qp,QPANEL,PANEL,560);
 }).then(function(){
  panel=makePanel(MENU[cats[f.c][0]][f.i]);
  var r=rectCss(PANEL);for(var k in r)panel.style[k]=r[k];
  qp.remove();quizPanel=null;syncCart();
  return Promise.all([fadeIn(panel),delay(150).then(function(){return dealMinis(f.i)})]);
 });
}
/* Chuyển câu: nội dung trượt ngang theo hướng đi tới / lùi lại */
function qGo(i){
 if(qBusy||i===qCur)return;qBusy=true;
 var dir=i>qCur?1:-1,body=quizPanel.querySelector('.q-body');
 body.animate([{transform:'none',opacity:1},{transform:'translateX('+(-50*dir)+'px)',opacity:0}],{duration:T(220),easing:'ease-in',fill:'forwards'}).finished.then(function(){
  qCur=i;renderBody();renderSteps();
  return body.animate([{transform:'translateX('+(50*dir)+'px)',opacity:0},{transform:'none',opacity:1}],{duration:T(280),easing:'ease-out'}).finished;
 }).then(function(){body.getAnimations().forEach(function(a){a.cancel()});qBusy=false},function(){qBusy=false});
}
/* Mở: nút phóng thành khung câu hỏi; thẻ gợi ý (màn chờ) hoặc các món (ShowDrink) thu vào */
function openQuiz(){
 var from=scene;scene='quiz';qCur=0;qAns=QUIZ.map(function(){return null});syncCart();
 var a=finderRect();stopRot();setSel(-1);curCat=-1;
 stage.classList.add('quiz');stage.classList.remove('show');
 var p=makeQuiz(),hideOld=from==='show'?collectDrinks():collectCards();
 return Promise.all([hideOld,morph(p,a,QPANEL,600).then(function(){return fadeIn(p)})]).then(function(){return rotateTo(0,1)});
}
/* Đóng (X hoặc tự đóng): luôn về màn hình chờ */
function closeQuiz(){
 var p=quizPanel;
 return fadeOut(p).then(function(){return morph(p,QPANEL,finderRect(),520)}).then(function(){
  p.remove();quizPanel=null;scene='wait';stage.classList.remove('quiz');
  return releaseCards()}).then(function(){startRot()});
}
finderBtn.onclick=function(){if(scene==='wait'||scene==='show')run(openQuiz)};

/* ================= BỐ CỤC KHI GIỎ HÀNG HIỆN =================
   Giỏ hàng (280×500) nằm bên phải, cùng một chỗ ở ShowDrink / DrinkDetail / Order.
   Có giỏ: món ở ShowDrink thu nhỏ 80% và dồn sang trái, khung chi tiết hẹp lại, cột món nhỏ dời vào giữa. */
var LAY=false; /* bố cục hiện tại có chừa chỗ cho giỏ hàng không */
document.documentElement.style.setProperty('--t-lay',T(400)+'ms'); /* thời gian chuyển của CSS theo SPEED */
function setGeom(on){
 LAY=on;stage.classList.toggle('has-cart',on);
 PANEL.w=on?740:1020;COL_X=on?860:1150;SL_CX=on?490:640;SL_GAP=on?175:DK_GAP;DK_SC=on?0.8:1;
}
/* Đặt lại vị trí các vòng tròn món theo bố cục hiện tại (chưa chạy hiệu ứng) */
function placeDks(){
 var sl=slotsFor(dkEls.length);
 dkEls.forEach(function(e,i){var s=sl[i];e.style.left=(s.x-DK/2)+'px';e.style.top=(s.y-DK/2)+'px';e._cx=s.x;e._cy=s.y;e._from=fromTf(s,i)});
 if(detailIdx>=0){var ord=colOrder(detailIdx),n=ord.length;ord.forEach(function(i,k){dkEls[i].style.transform=miniTf(dkEls[i],k,n)})}
}
function ctr(e){var s=stage.getBoundingClientRect(),k=s.width/1280,r=e.getBoundingClientRect();return {x:(r.left+r.width/2-s.left)/k,y:(r.top+r.height/2-s.top)/k}}
/* Tên món tính lại chỗ xuống dòng khi khung đổi độ rộng */
function refitTitle(p){var h=p.querySelector('.dd-head h2'),m=p._m;if(!h||!m)return;h.innerHTML=esc(m[0])+'<span class="pr">'+esc(m[1])+'K</span>';fitTitle(h,m)}
/* Chuyển bố cục có/không có giỏ, các món và khung chi tiết trượt về đúng chỗ mới */
function relayout(on){
 if(LAY===on)return Promise.resolve();
 var c0=dkEls.map(ctr),p=panel,r0=p&&{x:PANEL.x,y:PANEL.y,w:PANEL.w,h:PANEL.h,r:PANEL.r};
 return (p?fadeOut(p):Promise.resolve()).then(function(){
  setGeom(on);placeDks();
  var all=dkEls.map(function(e,i){var c=ctr(e),t=e.style.transform||'';
   return e.animate([{transform:'translate('+(c0[i].x-c.x)+'px,'+(c0[i].y-c.y)+'px) '+t},{transform:t||'none'}],{duration:T(500),easing:'cubic-bezier(.4,0,.2,1)'}).finished});
  if(p){refitTitle(p);all.push(morph(p,r0,PANEL,500).then(function(){return fadeIn(p)}))}
  return Promise.all(all);
 });
}

/* ================= GIỎ HÀNG =================
   Mỗi dòng = các ly cùng tên + cùng mức đường + cùng mức đá. da = null: món không dùng đá. */
var cart=[],cartNew=-1;
var cartEl=document.createElement('div');cartEl.className='ct';stage.appendChild(cartEl);
var SVG_X='<svg viewBox="0 0 24 24"><path d="M6 6l12 12 M18 6L6 18"/></svg>';
var SVG_CART='<svg viewBox="0 0 24 24"><path d="M3 4h2.5l2.2 11h10.6l2-8H6.5 M9.5 20a1 1 0 1 0 0-.1z M17 20a1 1 0 1 0 0-.1z"/></svg>';
var SVG_CARD='<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10h18 M7 14.5h3"/></svg>';
function cartTotal(){return cart.reduce(function(a,x){return a+x.p*x.q},0)}
function cartCups(){return cart.reduce(function(a,x){return a+x.q},0)}
/* Giỏ luôn hiện ở Order; ở ShowDrink / DrinkDetail chỉ hiện khi có ít nhất 1 món */
function syncCart(){cartEl.classList.toggle('on',scene==='order'||((scene==='show'||scene==='detail')&&cart.length>0))}
function renderCart(){
 var items=cart.map(function(x,k){
  return '<div class="ct-it'+(k===cartNew?' new':'')+'"><div class="ct-n">'+esc(x.n)+'</div><div class="ct-p">'+esc(x.p*x.q)+'K</div>'+
   '<div class="ct-s"><i>Đường: '+x.du+'%</i>'+(x.da!=null?' <i>Đá: '+x.da+'%</i>':'')+'</div><div class="ct-q">× '+x.q+'</div>'+
   '<button class="ct-x" type="button" data-k="'+k+'" aria-label="Huỷ '+esc(x.n)+'">'+SVG_X+'</button></div>'}).join('');
 cartEl.innerHTML='<div class="ct-h"><h3>Giỏ hàng</h3><span>'+(cart.length?cartCups()+' ly':'')+'</span></div>'+
  (cart.length?'<div class="ct-list">'+items+'</div>':'<div class="ct-empty">'+SVG_CART+'Chưa có món nào.<br>Bấm Xác nhận để thêm món.</div>')+
  '<div class="ct-f"><div class="ct-t"><span>Tổng</span><b>'+esc(cartTotal())+'K</b></div><button class="ct-pay'+(cart.length?'':' dis')+'" type="button">'+SVG_CARD+'Thanh toán</button></div>';
 [].forEach.call(cartEl.querySelectorAll('.ct-x'),function(b){b.onclick=function(){rmItem(+b.getAttribute('data-k'))}});
 cartEl.querySelector('.ct-pay').onclick=function(){if(cart.length&&(scene==='show'||scene==='detail'||scene==='order'))run(openPay)};
 var l=cartEl.querySelector('.ct-list');
 if(l){var more=function(){l.classList.toggle('more',l.scrollTop+l.clientHeight<l.scrollHeight-2)};l.onscroll=more;
  var nw=l.querySelector('.ct-it.new');if(nw&&nw.offsetTop+nw.offsetHeight>l.clientHeight)l.scrollTop=nw.offsetTop+nw.offsetHeight-l.clientHeight+4;
  more()}
}
function addToCart(n,p,du,da,q){
 for(var k=0;k<cart.length;k++){var x=cart[k];if(x.n===n&&x.du===du&&x.da===da){x.q+=q;cartNew=k;renderCart();return}}
 cart.push({n:n,p:p,du:du,da:da,q:q});cartNew=cart.length-1;renderCart();
}
/* Nút x: huỷ cả dòng. Hết món ở ShowDrink/DrinkDetail -> tắt giỏ, các thành phần về chỗ cũ (ở Order giỏ vẫn hiện, để trống) */
function rmItem(k){
 if(busy||!cart[k])return;
 cart.splice(k,1);cartNew=cartNew===k?-1:(cartNew>k?cartNew-1:cartNew);renderCart();
 if(!cart.length&&(scene==='show'||scene==='detail'))run(function(){syncCart();return relayout(false)});
}
function clearCart(){cart=[];cartNew=-1;renderCart();syncCart()}
renderCart();

/* ================= ORDER ================= */
/* Giới hạn chỉnh khẩu vị: [thấp nhất, cao nhất] cho từng thanh, theo đúng thứ tự thanh của nhóm.
   Món không có ở đây: mức gốc ±3 (trong thang 1–10). VD: 'Cốm Non Gạo Giòn':[[2,8],[3,9]] */
var RATE_LIMIT=window.KLIMIT||{}; /* Min/Max chủ quán khai ở trang quản lý */
var ORDER_RANGE=3,ORDER_DEFAULT=100,QTY_MAX=20,WARN_MS=2000;
var STEPS=[0,30,50,70,100];
var orderEl=null,orderFrom='',os=null,warnT;
function stepIdx(v){var b=0;STEPS.forEach(function(s,i){if(Math.abs(s-v)<Math.abs(STEPS[b]-v))b=i});return b}
function clampN(v,a,b){return Math.max(a,Math.min(b,v))}
/* Gợi ý đường đá theo khẩu vị khách chọn (TẠM, chủ quán duyệt):
   - Độ ngọt tăng/giảm 2 bậc -> gợi ý đường tăng/giảm 1 mức.
   - Độ đậm / đậm trà / ngậy tăng 2 bậc -> gợi ý đá giảm 1 mức (đá làm loãng vị). */
function orderSuggest(){
 var b=SUGGEST[os.m[0]]||[50,50],dn=0,ds=0;
 os.keys.forEach(function(k,i){var d=os.lv[i]-os.base[i];if(k==='ngot')dn+=d;else ds+=d});
 var du=STEPS[clampN(stepIdx(b[0])+Math.round(dn/2),0,4)];
 var da=os.da==null?null:STEPS[clampN(stepIdx(b[1]==null?50:b[1])-Math.round(ds/2),0,4)];
 return [du,da];
}
function makeOrder(m){
 var n=m[0],f=catOf(n),keys=(f&&itemBars(n,cats[f.c][0]))||[],v=RATE[n]||[],sg=SUGGEST[n];
 var base=keys.map(function(k,i){return clampN(v[i]||5,1,RATE_MAX)});
 var lim=keys.map(function(k,i){var L=RATE_LIMIT[n]&&RATE_LIMIT[n][i];return L?[L[0],L[1]]:[Math.max(1,base[i]-ORDER_RANGE),Math.min(RATE_MAX,base[i]+ORDER_RANGE)]});
 os={m:m,keys:keys,base:base,lim:lim,lv:base.slice(),du:ORDER_DEFAULT,da:(sg&&sg[1]===null)?null:ORDER_DEFAULT,q:1};
 var bars=keys.map(function(k,i){var lo=(lim[i][0]-1)/RATE_MAX*100,hi=(RATE_MAX-lim[i][1])/RATE_MAX*100;
  return '<div class="om-rt"><span class="rt-n">'+RATE_INFO[k].t+'</span><div class="om-bar" data-i="'+i+'"><span class="rt-bar"><b class="rt-'+k+'"></b>'+
   (lo>0?'<i class="lim lo" style="width:calc('+lo+'% + 4px)"></i>':'')+(hi>0?'<i class="lim hi" style="width:calc('+hi+'% + 4px)"></i>':'')+'<i class="kn"></i></span></div><span class="rt-v"></span></div>'}).join('');
 var opts=function(t){return '<div class="om-opts" data-t="'+t+'">'+STEPS.map(function(s){return '<button class="om-opt" type="button" data-v="'+s+'">'+s+'%</button>'}).join('')+'</div>'};
 var o=document.createElement('div');o.className='om';
 o.innerHTML='<div class="om-l"><h2>'+esc(n)+'<span class="pr">'+esc(m[1])+'K</span></h2><p class="note">'+esc(desc(n))+'</p><div class="om-art">'+imgTag(n)+'</div></div>'+
  '<div class="om-r"><p class="om-cap">Điều chỉnh theo khẩu vị của bạn:</p>'+bars+'<div class="om-warn"></div><div class="om-sug"></div>'+
  '<div class="om-sec"><h4>'+SVG_SUGAR+'Đường</h4>'+opts('du')+'</div>'+
  '<div class="om-sec"><h4>'+SVG_ICE+'Đá</h4>'+(os.da==null?'<div class="om-none">Món này không dùng đá</div>':opts('da'))+'</div>'+
  '<div class="om-foot"><div class="om-q"><div class="qty"><button type="button" class="q-m" aria-label="Bớt 1 ly">−</button><span class="q-n"></span><button type="button" class="q-p" aria-label="Thêm 1 ly">+</button></div><div class="om-tot">Giá<b></b></div></div>'+
  '<button class="om-ok" type="button">'+SVG_CHECK+'Xác nhận</button></div></div>'+
  '<button class="dd-x" type="button" aria-label="Đóng">'+SVG_X+'</button>';
 stage.appendChild(o);orderEl=o;
 fitTitle(o.querySelector('.om-l h2'),m);
 /* Thanh đánh giá: chạm hoặc kéo để chọn mức; ngoài giới hạn -> dòng chữ đỏ 2 giây */
 [].forEach.call(o.querySelectorAll('.om-bar'),function(bar){
  var i=+bar.getAttribute('data-i'),down=false;
  function at(x){var r=bar.querySelector('.rt-bar').getBoundingClientRect(),lv=clampN(Math.ceil((x-r.left)/r.width*RATE_MAX),1,RATE_MAX);
   if(lv<lim[i][0]){lv=lim[i][0];warn(RATE_INFO[keys[i]].t+' không thể giảm thêm')}
   else if(lv>lim[i][1]){lv=lim[i][1];warn(RATE_INFO[keys[i]].t+' không thể tăng thêm')}
   if(lv!==os.lv[i]){os.lv[i]=lv;renderOrder()}}
  bar.onpointerdown=function(ev){down=true;try{bar.setPointerCapture(ev.pointerId)}catch(e){}at(ev.clientX)};
  bar.onpointermove=function(ev){if(down)at(ev.clientX)};
  bar.onpointerup=bar.onpointercancel=function(){down=false};
 });
 [].forEach.call(o.querySelectorAll('.om-opts'),function(g){var t=g.getAttribute('data-t');
  [].forEach.call(g.querySelectorAll('.om-opt'),function(b){b.onclick=function(){os[t]=+b.getAttribute('data-v');renderOrder()}})});
 o.querySelector('.q-m').onclick=function(){if(os.q>1){os.q--;renderOrder()}};
 o.querySelector('.q-p').onclick=function(){if(os.q<QTY_MAX){os.q++;renderOrder()}};
 o.querySelector('.om-ok').onclick=function(){if(scene==='order')run(confirmOrder)};
 o.querySelector('.dd-x').onclick=function(){if(scene==='order')run(closeOrder)};
 renderOrder();
 return o;
}
function warn(t){var w=orderEl&&orderEl.querySelector('.om-warn');if(!w)return;
 w.innerHTML='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5 M12 16.3v.2"/></svg>'+t;w.classList.add('on');
 clearTimeout(warnT);warnT=setTimeout(function(){w.classList.remove('on')},WARN_MS)}
function renderOrder(){
 var o=orderEl;if(!o)return;
 [].forEach.call(o.querySelectorAll('.om-rt'),function(r,i){var lv=os.lv[i],p=lv/RATE_MAX*100;
  r.querySelector('.rt-bar b').style.width=p+'%';r.querySelector('.kn').style.left=p+'%';
  r.querySelector('.rt-v').textContent=RATE_INFO[os.keys[i]].w[Math.min(4,Math.ceil(lv/(RATE_MAX/5))-1)]});
 var s=orderSuggest();
 o.querySelector('.om-sug').innerHTML='<span class="sg-cap">'+SVG_STAR+'Gợi ý</span><div class="sg-chip">'+SVG_SUGAR+'<span>Đường</span>'+s[0]+'%</div>'+(s[1]!=null?'<div class="sg-chip">'+SVG_ICE+'<span>Đá</span>'+s[1]+'%</div>':'');
 [].forEach.call(o.querySelectorAll('.om-opts'),function(g){var t=g.getAttribute('data-t'),sv=t==='du'?s[0]:s[1];
  [].forEach.call(g.querySelectorAll('.om-opt'),function(b){var v=+b.getAttribute('data-v');b.classList.toggle('on',v===os[t]);b.classList.toggle('sg',v===sv)})});
 o.querySelector('.q-n').textContent=os.q;
 o.querySelector('.om-tot b').textContent=(os.q*os.m[1])+'K';
}
/* Mở Order cho một món (nút + ở ShowDrink hoặc Gọi món ở DrinkDetail) */
function openOrder(m){
 if(scene!=='show'&&scene!=='detail')return Promise.resolve();
 orderFrom=scene;scene='order';stage.classList.add('order');
 var o=makeOrder(m);syncCart();
 return o.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:T(320),easing:'ease-out',fill:'backwards'}).finished;
}
/* X: quay lại đúng màn trước (giỏ trống thì các thành phần về chỗ cũ) */
function closeOrder(){
 var o=orderEl;clearTimeout(warnT);
 return o.animate([{opacity:1},{opacity:0}],{duration:T(200),fill:'forwards'}).finished.then(function(){
  o.remove();orderEl=null;os=null;scene=orderFrom;stage.classList.remove('order');syncCart();
  return relayout(cart.length>0)});
}
/* Xác nhận: thêm vào giỏ rồi về ShowDrink của danh mục chứa món đó */
function confirmOrder(){
 var o=orderEl,st=os,f=catOf(st.m[0]);clearTimeout(warnT);
 addToCart(st.m[0],st.m[1],st.du,st.da,st.q);
 return o.animate([{opacity:1},{opacity:0}],{duration:T(200),fill:'forwards'}).finished.then(function(){
  o.remove();orderEl=null;os=null;
  drinksBox.innerHTML='';dkEls=[];panel=null;detailIdx=-1;
  stage.classList.remove('detail');stage.classList.add('show');
  scene='show';curCat=f.c;setSel(f.c);setGeom(true);syncCart();
  return rotateTo(mod(MID-f.c,N),700);
 }).then(function(){stage.classList.remove('order');return dealDrinks(cats[f.c][0])});
}

/* ================= THANH TOÁN =================
   QR chuyển khoản (VietQR) do kiosk.js tạo ngay trên máy. Có mạng: màn hình tự báo khi tiền về.
   Mất mạng: khách chuyển khoản rồi đọc mã nhận đồ cho nhân viên; đơn tự gửi lên khi có mạng lại.
   Trạng thái payO.state: creating / wait / offline / sent / paid / expired / error */
var PAY_DONE_MS=15000,PAY_END_MS=30000;
var payEl=null,payT=null,payO=null,payFrom='',payEndAt=0;
var SVG_BACK='<svg viewBox="0 0 24 24"><path d="M19 12H5 M11 6l-6 6 6 6"/></svg>';
var SVG_OKC='<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
var SVG_WARN='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5 M12 16.3v.2"/></svg>';
var SVG_SPIN='<svg class="py-spin" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';
function vnd(n){return Number(n).toLocaleString('vi-VN')+' đ'}
function mmss(ms){var s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+('0'+s%60).slice(-2)}
function openPay(){
 payFrom=scene;scene='pay';clearTimeout(warnT);
 var K=window.KIOSK,o=document.createElement('div');o.className='ord pay';stage.appendChild(o);payEl=o;
 payO=K&&K.newOrder?K.newOrder(cart.slice()):{state:'error',error:'Màn hình chưa sẵn sàng. Vui lòng thanh toán tại quầy.'};
 payO.onchange=function(){if(payEl===o)drawPay()};
 payO.cups=cartCups();payEndAt=0;
 o.onclick=function(e){var b=e.target.closest('[data-a]');if(b)payAct(b.getAttribute('data-a'))};
 drawPay();
 clearInterval(payT);payT=setInterval(tickPay,250);
 return o.animate([{opacity:0},{opacity:1}],{duration:T(300),easing:'ease-out',fill:'backwards'}).finished;
}
/* Màn kết thúc: đã trả / đã báo chuyển khoản lúc mất mạng / hết giờ / lỗi */
function payEnd(icon,warn,title,lines,pick,btns,ms){
 if(!payEndAt)payEndAt=Date.now()+ms;
 return '<div class="py-done" role="status"><span class="py-ok'+(warn?' warn':'')+'">'+icon+'</span><h2>'+title+'</h2>'+
  (pick?'<p>Mã nhận đồ của bạn</p><div class="py-pick">'+pick+'</div>':'')+lines.map(function(l){return '<p>'+esc(l)+'</p>'}).join('')+
  '<div class="py-act">'+btns+'</div><p class="py-cd2">Tự quay về màn hình chờ sau <b></b> giây</p></div>';
}
function drawPay(){
 var o=payEl,p=payO,st=p.state;if(!o)return;
 var home='<button class="py-btn pri" type="button" data-a="end">Xong</button>';
 if(st==='paid'){o.innerHTML=payEnd(SVG_OKC,false,'Đã nhận tiền, cảm ơn bạn!',['Quầy sẽ gọi mã này khi đồ uống sẵn sàng.'],p.pickup,home,PAY_DONE_MS);tickPay();return}
 if(st==='sent'){o.innerHTML=payEnd(SVG_OKC,false,'Cảm ơn bạn!',['Máy đang mất mạng nên chưa tự xác nhận được.','Đọc mã này cho nhân viên ở quầy để được kiểm tra.'],p.pickup,home,PAY_END_MS);tickPay();return}
 if(st==='expired'){o.innerHTML=payEnd(SVG_WARN,true,'Hết thời gian thanh toán',['Nếu bạn đã chuyển khoản, đọc mã nhận đồ cho nhân viên ở quầy.'],p.pickup,'<button class="py-btn pri" type="button" data-a="end">Về màn hình chờ</button>',PAY_END_MS);tickPay();return}
 if(st==='error'){o.innerHTML=payEnd(SVG_WARN,true,'Chưa thanh toán được',[p.error||''],'',
   (cart.length?'<button class="py-btn" type="button" data-a="back">'+SVG_BACK+'Quay lại giỏ hàng</button>':'')+'<button class="py-btn pri" type="button" data-a="end">Về màn hình chờ</button>',PAY_END_MS);tickPay();return}
 var stt=st==='creating'?['',SVG_SPIN+'<span>Đang tạo đơn…</span>']
  :st==='offline'?['warn',SVG_WARN+'<span>Máy đang mất mạng nên chưa tự xác nhận được. Chuyển khoản xong, bấm “Tôi đã chuyển khoản”.</span>']
  :p.netDown?['warn',SVG_WARN+'<span>Mạng chập chờn. Nếu đã chuyển khoản, đọc mã nhận đồ <b>'+p.pickup+'</b> cho nhân viên.</span>']
  :['',SVG_SPIN+'<span>Đang chờ chuyển khoản…</span>'];
 o.innerHTML='<div class="py">'+
  '<div class="py-l"><div class="py-qr" role="img" aria-label="Mã QR chuyển khoản '+vnd(p.amount)+'">'+p.qr+'</div>'+
   '<div class="py-bank"><b>'+esc(p.bank)+'</b><span>'+esc(p.accountName)+'</span><small>Số tài khoản '+esc(p.accountNo)+'</small></div></div>'+
  '<div class="py-r"><h2>Thanh toán</h2>'+
   '<div class="py-sum"><span>Tổng cộng · '+p.cups+' ly</span><b>'+vnd(p.amount)+'</b></div>'+
   '<ol class="py-steps"><li>Mở app ngân hàng, chọn <b>Quét mã QR</b>.</li><li>Kiểm tra số tiền, <b>giữ nguyên nội dung</b> chuyển khoản.</li><li>Xác nhận chuyển. Màn hình tự báo khi nhận được tiền.</li></ol>'+
   '<div class="py-code"><span>Nội dung chuyển khoản</span><b>'+p.code+'</b></div>'+
   '<div class="py-st '+stt[0]+'" role="status">'+stt[1]+'</div>'+
   '<div class="py-act">'+(st==='offline'?'<button class="py-btn pri" type="button" data-a="sent">'+SVG_OKC+'Tôi đã chuyển khoản</button>':'')+
    '<button class="py-btn" type="button" data-a="back">'+SVG_BACK+'Quay lại giỏ hàng</button>'+
    '<button class="py-btn link" type="button" data-a="cancel">Huỷ đơn</button>'+
    '<span class="py-cd">Còn <b></b></span></div></div></div>';
 tickPay();
}
function tickPay(){
 var o=payEl,p=payO;if(!o||!p)return;
 var cd=o.querySelector('.py-cd b'),cd2=o.querySelector('.py-cd2 b');
 if(p.expiresAt&&(p.state==='creating'||p.state==='wait'||p.state==='offline')){
  var left=p.expiresAt-Date.now();if(cd)cd.textContent=mmss(left);
  if(left<=0){if(window.KIOSK&&KIOSK.expireOrder)KIOSK.expireOrder(p);else{p.state='expired';drawPay()}}
 }
 if(payEndAt){var s=Math.max(0,Math.ceil((payEndAt-Date.now())/1000));if(cd2)cd2.textContent=s;if(s<=0){payEndAt=0;run(endPay)}}
}
function payAct(a){
 var p=payO;if(!p)return;
 if(a==='back'){if(window.KIOSK&&KIOSK.cancelOrder)KIOSK.cancelOrder(p);run(closePay)}
 else if(a==='cancel'){if(window.KIOSK&&KIOSK.cancelOrder)KIOSK.cancelOrder(p);run(endPay)}
 else if(a==='sent'){p.state='sent';drawPay()}
 else if(a==='end'){run(endPay)}
}
/* Quay lại giỏ hàng: tắt màn thanh toán, giữ giỏ, về đúng màn trước đó */
function closePay(){
 var o=payEl;clearInterval(payT);payEndAt=0;
 return o.animate([{opacity:1},{opacity:0}],{duration:T(250),fill:'forwards'}).finished.then(function(){
  o.remove();payEl=null;payO=null;scene=payFrom;syncCart()});
}
/* Về màn hình chờ: dọn ShowDrink / DrinkDetail / Order phía sau, xoá giỏ */
function resetAll(){
 if(orderEl){orderEl.remove();orderEl=null;os=null}
 drinksBox.innerHTML='';dkEls=[];panel=null;detailIdx=-1;
 stage.classList.remove('show','detail','order','quiz');setSel(-1);curCat=-1;
 scene='wait';cart=[];cartNew=-1;renderCart();setGeom(false);syncCart();
 return rotateTo(0,1);
}
function endPay(){
 var o=payEl;clearInterval(payT);payEndAt=0;payO=null;
 return resetAll().then(function(){
  return Promise.all([o.animate([{opacity:1},{opacity:0}],{duration:T(400),fill:'forwards'}).finished.then(function(){o.remove();payEl=null}),releaseCards()]);
 }).then(function(){startRot()});
}

/* Không ai chạm 60 giây ở ShowDrink/DrinkDetail/Order/câu hỏi -> tự quay về màn hình chờ và xoá giỏ hàng.
   (Màn thanh toán có bộ đếm riêng; ở màn hình chờ mà giỏ còn món thì cũng xoá sau 60 giây.) */
var IDLE_MS=60000,lastTouch=Date.now();
['pointerdown','keydown'].forEach(function(t){addEventListener(t,function(){lastTouch=Date.now()},true)});
setInterval(function(){
 if(busy||scene==='pay'||Date.now()-lastTouch<=IDLE_MS)return;
 lastTouch=Date.now();
 if(scene==='wait'){if(cart.length)clearCart();return}
 run(function(){return (scene==='order'?closeOrder():Promise.resolve()).then(function(){return scene==='quiz'?closeQuiz():(scene==='detail'?closeDetail():Promise.resolve()).then(toWait)}).then(function(){clearCart();setGeom(false)})});
},1000);

/* ================= KHUNG & GIAO DIỆN SÁNG/TỐI ================= */
function fit(){var s=Math.min(innerWidth/1280,innerHeight/720);document.getElementById('stage').style.transform='scale('+s+')'}
addEventListener('resize',fit);fit();
function theme(t){document.documentElement.setAttribute('data-theme',t);bl.setAttribute('aria-pressed',t==='light');bd.setAttribute('aria-pressed',t==='dark')}
bl.onclick=function(){theme('light')};bd.onclick=function(){theme('dark')};
