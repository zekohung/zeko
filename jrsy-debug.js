// jrsy-debug.js — 打印所有经过 Loon 的 xhey 请求 URL
var body = typeof $response !== 'undefined' && $response.body ? $response.body : '';
console.log('[JRSY-DEBUG] URL=' + $request.url);
console.log('[JRSY-DEBUG] body前80字符=' + String(body).substring(0, 80));
$done({});