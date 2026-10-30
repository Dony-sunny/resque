import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import type { Point } from '../core/geo';

/** glyph: a symbol drawn inside the pin so categories never rely on colour alone. */
export interface WebPin { id: string; point: Point; color: string; title: string; detail: string; square: boolean; glyph?: string }
export interface WebMapHandle { focus(id: string): void; recenter(): void }

/** Street map in the Google Maps style (Leaflet + OpenStreetMap tiles, teardrop pins, blue
 * "you are here" dot). Runs in a WebView, so it works in Expo Go without a Maps API key.
 * Tiles need internet; callers show a list fallback when onTileError fires. */
export const WebMap = forwardRef<WebMapHandle, {
  pins: WebPin[]; me: (Point & { accuracy: number | null }) | null; height: number; onSelect: (id: string) => void;
  selectedId?: string; interactive?: boolean; onTileError?: () => void; onPress?: () => void;
}>(function WebMap({ pins, me, height, onSelect, selectedId, interactive = true, onTileError, onPress }, ref) {
  const view = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({
    focus: id => view.current?.injectJavaScript(`window.focusPin(${JSON.stringify(id)}); true;`),
    recenter: () => view.current?.injectJavaScript('window.recenter(); true;'),
  }), []);
  // Rebuild the page only when the data changes; JSON is escaped for safe embedding in a script tag.
  const html = useMemo(() => page(JSON.stringify({ pins, me, selectedId: selectedId || null, interactive }).replace(/</g, '\\u003c')), [pins, me, interactive]);
  return <WebView ref={view} originWhitelist={['*']} source={{ html, baseUrl: 'https://resq-relay.local/' }} style={{ height, backgroundColor: '#E8EAED' }}
    javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} nestedScrollEnabled={interactive} scrollEnabled={interactive}
    onMessage={event => { try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.select) onSelect(data.select);
      if (data.tileError) onTileError?.();
      if (data.press) onPress?.();
    } catch { /* Ignore page noise. */ } }} />;
});

function page(data: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#m{margin:0;height:100%;background:#E8EAED;font-family:Roboto,Arial,sans-serif}
.pin svg{filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.me{width:18px;height:18px;border-radius:50%;background:#1A73E8;border:3px solid #fff;box-shadow:0 0 0 2px rgba(26,115,232,.25),0 1px 4px rgba(0,0,0,.4);box-sizing:border-box}
.halo{width:46px;height:46px;border-radius:50%;background:rgba(26,115,232,.22)}
.leaflet-popup-content-wrapper{border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.leaflet-popup-content{margin:10px 12px;font-size:13px;line-height:1.35}
.leaflet-popup-content b{font-size:14px;color:#202124}
.leaflet-popup-content span{color:#5F6368}
.leaflet-control-zoom{border:0!important;box-shadow:0 1px 4px rgba(0,0,0,.3)!important;border-radius:8px!important;overflow:hidden}
.leaflet-control-zoom a{width:44px!important;height:44px!important;line-height:44px!important;color:#5F6368!important;font-size:22px!important}
.err{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;color:#5F6368;font-size:14px}
</style></head><body><div id="m"></div><div class="err" id="err">Map tiles need internet.<br>The list below still works.</div><script>
var D=${data};
function post(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o))}
if(!window.L){document.getElementById('err').style.display='flex';post({tileError:true});}else{
var map=L.map('m',{zoomControl:false,attributionControl:true,dragging:D.interactive,touchZoom:D.interactive,scrollWheelZoom:false,doubleClickZoom:D.interactive,tap:D.interactive}).setView([10.0,76.3],11);
var failed=0,tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
tiles.on('tileerror',function(){failed++;if(failed===3)post({tileError:true})});
if(D.interactive)L.control.zoom({position:'bottomright'}).addTo(map);else map.on('click',function(){post({press:true})});
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function icon(p,big){var c=p.color,s=big?1.35:1,w=28*s,h=40*s;
var inner=p.glyph?'<circle cx="14" cy="13" r="8" fill="#fff"/><text x="14" y="17.5" font-size="12" font-weight="700" text-anchor="middle" fill="'+c+'">'+esc(p.glyph)+'</text>':p.square?'<rect x="9" y="8" width="10" height="10" rx="2" fill="#fff"/>':'<circle cx="14" cy="13" r="5" fill="#fff"/>';
return L.divIcon({className:'pin',iconSize:[w,h],iconAnchor:[w/2,h],popupAnchor:[0,-h+4],html:'<svg width="'+w+'" height="'+h+'" viewBox="0 0 28 40"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 40 14 40s14-15.7 14-26.1C28 6.2 21.7 0 14 0z" fill="'+c+'" stroke="'+(big?'#09182B':'none')+'" stroke-width="1.5"/>'+inner+'</svg>'})}
var marks={},pins={},pts=[],sel=null;
D.pins.forEach(function(p){pins[p.id]=p;var m=L.marker([p.point.latitude,p.point.longitude],{icon:icon(p,false),keyboard:true,title:p.title,alt:p.title}).addTo(map).bindPopup('<b>'+esc(p.title)+'</b><br><span>'+esc(p.detail)+'</span>');
m.on('click',function(){highlight(p.id);post({select:p.id})});marks[p.id]=m;pts.push([p.point.latitude,p.point.longitude]);});
function highlight(id){if(sel&&marks[sel])marks[sel].setIcon(icon(pins[sel],false)).setZIndexOffset(0);sel=id;if(marks[id])marks[id].setIcon(icon(pins[id],true)).setZIndexOffset(1000);}
var ll=null;
if(D.me){ll=[D.me.latitude,D.me.longitude];pts.push(ll);
if(D.me.accuracy)L.circle(ll,{radius:D.me.accuracy,color:'#1A73E8',weight:1,fillColor:'#1A73E8',fillOpacity:.12,interactive:false}).addTo(map);
L.marker(ll,{interactive:false,icon:L.divIcon({className:'',iconSize:[46,46],iconAnchor:[23,23],html:'<div class="halo"></div>'})}).addTo(map);
L.marker(ll,{icon:L.divIcon({className:'',iconSize:[18,18],iconAnchor:[9,9],html:'<div class="me"></div>'}),title:'You are here'}).addTo(map).bindPopup('<b>You are here</b>');}
function fit(){if(pts.length>1)map.fitBounds(pts,{padding:[36,36],maxZoom:15});else if(pts.length)map.setView(pts[0],14);}
fit();
window.recenter=function(){if(ll)map.setView(ll,14);else fit();};
window.focusPin=function(id){var m=marks[id];if(m){highlight(id);map.setView(m.getLatLng(),15);m.openPopup();}};
if(D.selectedId&&marks[D.selectedId])window.focusPin(D.selectedId);
}
</script></body></html>`;
}
