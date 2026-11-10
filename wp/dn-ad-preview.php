<?php
/**
 * Plugin Name: DN Ad Preview (mock creatives)
 * Description: เมื่อเปิดหน้าด้วย ?dn_mock=<token> ที่ลงลายเซ็นจาก DN Ad Preview จะแสดง creative ที่ระบุแทนการเรียกโฆษณาจาก GAM ใน slot นั้น
 * Version: 1.0.1
 *
 * ติดตั้ง: วางไฟล์นี้ใน wp-content/mu-plugins/ และเพิ่มใน wp-config.php
 *   define( 'DN_AD_PREVIEW_SECRET', '<ค่าเดียวกับ MOCK_SECRET ใน Vercel>' );
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

const DN_AD_PREVIEW_DIVS = array(
	'leaderboard' => 'div-ads-leaderboard',
	'sticky'      => 'div-ads-sticky',
	'postarticle' => 'div-ads-postarticle',
);

function dn_ad_preview_b64u_decode( $s ) {
	return base64_decode( strtr( $s, '-_', '+/' ) . str_repeat( '=', ( 4 - strlen( $s ) % 4 ) % 4 ) );
}

/** @return array|null [ div-id => item ] */
function dn_ad_preview_items() {
	static $cache = false;
	if ( false !== $cache ) { return $cache; }
	$cache = null;
	if ( empty( $_GET['dn_mock'] ) || ! defined( 'DN_AD_PREVIEW_SECRET' ) || '' === DN_AD_PREVIEW_SECRET ) { return null; }
	$token = (string) wp_unslash( $_GET['dn_mock'] );
	$parts = explode( '.', $token );
	if ( 2 !== count( $parts ) ) { return null; }
	$expect = rtrim( strtr( base64_encode( hash_hmac( 'sha256', $parts[0], DN_AD_PREVIEW_SECRET, true ) ), '+/', '-_' ), '=' );
	if ( ! hash_equals( $expect, $parts[1] ) ) { return null; }
	$p = json_decode( dn_ad_preview_b64u_decode( $parts[0] ), true );
	if ( ! is_array( $p ) || empty( $p['exp'] ) || $p['exp'] < time() || empty( $p['i'] ) || ! is_array( $p['i'] ) ) { return null; }
	$out = array();
	foreach ( $p['i'] as $it ) {
		$slot = isset( $it['s'] ) ? $it['s'] : '';
		if ( ! isset( DN_AD_PREVIEW_DIVS[ $slot ] ) ) { continue; }
		if ( empty( $it['u'] ) || 0 !== strpos( $it['u'], 'https://' ) ) { continue; }
		$out[ DN_AD_PREVIEW_DIVS[ $slot ] ] = array(
			't' => ( 'html5' === ( $it['t'] ?? '' ) ) ? 'html5' : 'img',
			'w' => (int) ( $it['w'] ?? 0 ),
			'h' => (int) ( $it['h'] ?? 0 ),
			'u' => esc_url_raw( $it['u'] ),
			'c' => esc_url_raw( $it['c'] ?? '' ),
		);
	}
	$cache = $out ? $out : null;
	return $cache;
}

// ไม่ให้ cache หน้า preview
add_action( 'send_headers', function () {
	if ( dn_ad_preview_items() ) { nocache_headers(); header( 'X-Robots-Tag: noindex' ); }
} );

// ต้องรันก่อนโค้ด GPT ของ dn-gam (priority 0)
add_action( 'wp_head', function () {
	$items = dn_ad_preview_items();
	if ( ! $items ) { return; }
	?>
<script id="dn-ad-preview">
(function(){
  var M = <?php echo wp_json_encode( $items ); ?>;
  window.dnAdPreview = M;
  window.googletag = window.googletag || { cmd: [] };
  function render(id){
    var el = document.getElementById(id), it = M[id];
    if (!el || !it || el.getAttribute('data-dn-mock')) return;
    el.setAttribute('data-dn-mock', '1');
    var html;
    if (it.t === 'html5') {
      var src = it.u + (it.u.indexOf('?') < 0 ? '?' : '&') + 'c=' + encodeURIComponent(it.c || '');
      html = '<iframe src="' + src + '" width="' + it.w + '" height="' + it.h + '" style="border:0;display:block;margin:0 auto;max-width:100%" scrolling="no"></iframe>';
    } else {
      html = '<img src="' + it.u + '" width="' + it.w + '" height="' + it.h + '" alt="" style="display:block;margin:0 auto;max-width:100%;height:auto">';
      if (it.c) html = '<a href="' + it.c + '" target="_blank" rel="noopener">' + html + '</a>';
    }
    var box = document.createElement('div');
    box.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%';
    box.innerHTML = html;
    el.appendChild(box);
  }
  googletag.cmd.push(function(){
    // slot ที่ mock: ไม่ลงทะเบียนกับ GPT เลย จึงไม่มี ad request / impression
    var origDefine = googletag.defineSlot;
    googletag.defineSlot = function(path, size, div){
      if (div && M[div]) {
        var stub = new Proxy({}, { get: function(t, k){
          if (k === 'getSlotElementId') return function(){ return div; };
          if (k === 'getAdUnitPath') return function(){ return path; };
          if (k === '__dnMock') return true;
          return function(){ return stub; };
        }});
        return stub;
      }
      return origDefine.apply(this, arguments);
    };
    var origDisplay = googletag.display;
    googletag.display = function(x){
      var id = typeof x === 'string' ? x : (x && x.getSlotElementId ? x.getSlotElementId() : x && x.id);
      if (M[id]) { render(id); return; }
      return origDisplay.apply(this, arguments);
    };
    var pa = googletag.pubads(), origRefresh = pa.refresh;
    pa.refresh = function(slots, opts){
      if (slots) { slots = slots.filter(function(s){ return !(s && s.__dnMock); }); if (!slots.length) return; }
      return origRefresh.call(this, slots, opts);
    };
  });
  // กันกรณี div ถูกสร้าง/ย้าย/ล้างทีหลัง (เช่น sticky บนมือถือ): ตรวจซ้ำจนกว่าจะเจอ
  function sweep(){
    for (var id in M) {
      var el = document.getElementById(id);
      if (el && el.getAttribute('data-dn-mock') && !el.querySelector('img,iframe')) el.removeAttribute('data-dn-mock');
      render(id);
    }
  }
  document.addEventListener('DOMContentLoaded', sweep);
  window.addEventListener('load', sweep);
  var n = 0, t = setInterval(function(){ sweep(); if (++n > 40) clearInterval(t); }, 500);
})();
</script>
	<?php
}, 0 );
