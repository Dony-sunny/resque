import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import type { Point } from '../core/geo';

export interface WebPin { id: string; point: Point; color: string; title: string; detail: string; square: boolean }
export interface WebMapHandle { focus(id: string): void }

/** Street map in the Google Maps style (Leaflet + OpenStreetMap tiles, teardrop pins, blue
 * "you are here" dot). Runs in a WebView, so it works in Expo Go without a Maps API key.
 * Tiles need internet; MapScreen falls back to the offline drawing when the network is down. */
export const WebMap = forwardRef<WebMapHandle, { pins: WebPin[]; me: (Point & { accuracy: number | null }) | null; height: number; onSelect: (id: string) => void }>(
  function WebMap({ pins, me, height, onSelect }, ref) {
    const view = useRef<WebView>(null);
    useImperativeHandle(ref, () => ({ focus: id => view.current?.injectJavaScript(`window.focusPin(${JSON.stringify(id)}); true;`) }), []);
    // Rebuild the page only when the data changes; JSON is escaped for safe embedding in a script tag.
    const html = useMemo(() => page(JSON.stringify({ pins, me }).replace(/</g, '\\u003c')), [pins, me]);
    return <WebView ref={view} originWhitelist={['*']} source={{ html, baseUrl: 'https://resq-relay.local/' }} style={{ height, backgroundColor: '#E8EAED' }}
      javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} nestedScrollEnabled
      onMessage={event => { try { const data = JSON.parse(event.nativeEvent.data); if (data.select) onSelect(data.select); } catch { /* Ignore page noise. */ } }} />;
  });

function page(data: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#m{margin:0;height:100%;background:#E8EAED;font-family:Roboto,Arial,sans-serif}
.pin svg{filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.me{width:18px;height:18px;border-radius:50%;background:#1A73E8;border:3px solid #fff;box-shadow:0 0 0 2px rgba(26,115,232,.25),0 1px 4px rgba(0,0,0,.4);box-sizing:border-box}
.halo{width:46px;height:46px;border-radius:50%;background:rgba(26,115,232,.25);animation:p 2s infinite}
@keyframes p{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.4);opacity:0}}
.leaflet-popup-content-wrapper{border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.3)}
.leaflet-popup-content{margin:10px 12px;font-size:13px;line-height:1.35}
.leaflet-popup-content b{font-size:14px;color:#202124}
.leaflet-popup-content span{color:#5F6368}
.leaflet-control-zoom{border:0!important;box-shadow:0 1px 4px rgba(0,0,0,.3)!important;border-radius:8px!important;overflow:hidden}
.leaflet-control-zoom a{width:40px!important;height:40px!important;line-height:40px!important;color:#5F6368!important;font-size:22px!important}
.loc{background:#fff;width:40px;height:40px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;cursor:pointer}
.err{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;color:#5F6368;font-size:14px}
</style></head><body><div id="m"></div><div class="err" id="err">Map tiles need internet.<br>Use Offline view.</div><script>
var D=${data};
if(!window.L){document.getElementById('err').style.display='flex';}else{
var map=L.map('m',{zoomControl:false,attributionControl:true}).setView([10.0,76.3],11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
L.control.zoom({position:'bottomright'}).addTo(map);
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function icon(p){var c=p.color;var inner=p.square?'<rect x="9" y="8" width="10" height="10" rx="2" fill="#fff"/>':'<circle cx="14" cy="13" r="5" fill="#fff"/>';
return L.divIcon({className:'pin',iconSize:[28,40],iconAnchor:[14,40],popupAnchor:[0,-36],html:'<svg width="28" height="40" viewBox="0 0 28 40"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 40 14 40s14-15.7 14-26.1C28 6.2 21.7 0 14 0z" fill="'+c+'"/>'+inner+'</svg>'})}
var marks={},pts=[];
D.pins.forEach(function(p){var m=L.marker([p.point.latitude,p.point.longitude],{icon:icon(p)}).addTo(map).bindPopup('<b>'+esc(p.title)+'</b><br><span>'+esc(p.detail)+'</span>');
m.on('click',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({select:p.id}))});marks[p.id]=m;pts.push([p.point.latitude,p.point.longitude]);});
if(D.me){var ll=[D.me.latitude,D.me.longitude];pts.push(ll);
if(D.me.accuracy)L.circle(ll,{radius:D.me.accuracy,color:'#1A73E8',weight:1,fillColor:'#1A73E8',fillOpacity:.12}).addTo(map);
L.marker(ll,{interactive:false,icon:L.divIcon({className:'',iconSize:[46,46],iconAnchor:[23,23],html:'<div class="halo"></div>'})}).addTo(map);
L.marker(ll,{icon:L.divIcon({className:'',iconSize:[18,18],iconAnchor:[9,9],html:'<div class="me"></div>'})}).addTo(map).bindPopup('<b>You are here</b>');
var Loc=L.Control.extend({options:{position:'bottomright'},onAdd:function(){var d=L.DomUtil.create('div','loc');d.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="#1A73E8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#5F6368" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="none" stroke="#5F6368" stroke-width="2"/></svg>';
L.DomEvent.on(d,'click',function(e){L.DomEvent.stop(e);map.setView(ll,15)});return d}});map.addControl(new Loc());}
if(pts.length>1)map.fitBounds(pts,{padding:[40,40]});else if(pts.length)map.setView(pts[0],14);
window.focusPin=function(id){var m=marks[id];if(m){map.setView(m.getLatLng(),15);m.openPopup();}};
}
</script></body></html>`;
}
