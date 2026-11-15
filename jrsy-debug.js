console.log('[JRSY-DEBUG] URL=' + $request.url);
var body = typeof $response !== 'undefined' && $response.body ? $response.body : '';
console.log('[JRSY-DEBUG] body=' + String(body).substring(0, 80));
$done({});
