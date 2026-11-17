/*
 * CamScanner 高级特权解锁 / Shadowrocket 适配版
 * 上游来源: https://raw.githubusercontent.com/NobyDa/Script/master/Surge/JS/CamScanner.js
 * 上游逻辑: obj = {"data":{"psnl_vip_property":{"expiry":"2013017600"}}} 整体替换 body
 *
 * 本版改动:
 *   1. 命中路径放宽为 query_property 带查询串或不带，均匹配。
 *   2. 响应里已存在 data.psnl_vip_property 时只改 expiry，保留其它字段；不存在时按上游整体替换。
 *   3. 清理 content-length / content-encoding 等因改写而失效的响应头。
 *   4. 支持模块 $argument 覆盖 {"expiry":"..."}，默认沿用上游 2013017600。
 *   5. 非 2xx、空正文、非 JSON、非对象根、参数非法时原样放行，并在日志写明原因。
 *   6. 只用 $response / $done / $argument / console，无 Node 专有 API，JavaScriptCore 可跑。
 */
var CamScannerVip = (function () {
  'use strict';
  var DEFAULT_EXPIRY = '2013017600';
  var TARGET = /^https:\/\/(api|api-cs)\.intsig\.net\/purchase\/cs\/query_property(\?|$)/i;

  function cleanHeaders(headers) {
    var output = {}, key;
    for (key in headers) if (Object.prototype.hasOwnProperty.call(headers, key)) {
      if (!/^(content-length|content-encoding|transfer-encoding|etag|content-md5|digest|content-digest)$/i.test(key)) {
        output[key] = headers[key];
      }
    }
    var contentType;
    for (key in output) if (/^content-type$/i.test(key)) contentType = key;
    output[contentType || 'Content-Type'] = 'application/json; charset=utf-8';
    return output;
  }

  function readArgument() {
    var text = typeof $argument === 'string' ? $argument : '';
    if (!text) return {};
    var supplied = JSON.parse(text);
    return supplied && typeof supplied === 'object' && !Array.isArray(supplied) ? supplied : {};
  }

  function expiryValue(supplied) {
    if (supplied === undefined || supplied === null || supplied === '') return DEFAULT_EXPIRY;
    var text = String(supplied).trim();
    if (!/^\d{9,12}$/.test(text)) throw new Error('expiry 必须是 9-12 位 Unix 时间戳');
    return text;
  }

  function patch(body, expiry) {
    if (typeof body !== 'string' || !body) throw new Error('响应正文为空');
    var parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('响应根节点不是对象');
    var data = parsed.data;
    if (data && typeof data === 'object' && !Array.isArray(data) &&
        data.psnl_vip_property && typeof data.psnl_vip_property === 'object' && !Array.isArray(data.psnl_vip_property)) {
      data.psnl_vip_property.expiry = expiry;
      return { body: JSON.stringify(parsed), mode: 'patch' };
    }
    return { body: JSON.stringify({ data: { psnl_vip_property: { expiry: expiry } } }), mode: 'replace' };
  }

  function matches(url) {
    return typeof url === 'string' && TARGET.test(url);
  }

  return {
    processBody: patch,
    matches: matches,
    cleanHeaders: cleanHeaders,
    readArgument: readArgument,
    expiryValue: expiryValue,
    defaultExpiry: DEFAULT_EXPIRY
  };
}());

(function () {
  'use strict';
  if (typeof $done !== 'function') return;
  var completion = {}, message;
  try {
    if (typeof $request === 'undefined' || typeof $response === 'undefined') {
      throw new Error('需要 HTTP 响应触发');
    }
    var code = Number($response.statusCode || $response.status || 200);
    if (!isFinite(code) || code < 200 || code >= 300) {
      message = '原样放行：HTTP 状态非 2xx';
    } else if (!CamScannerVip.matches($request.url)) {
      message = '原样放行：URL 未命中';
    } else {
      var expiry = CamScannerVip.expiryValue(CamScannerVip.readArgument().expiry);
      var result = CamScannerVip.processBody($response.body, expiry);
      completion = { body: result.body, headers: CamScannerVip.cleanHeaders($response.headers || {}) };
      message = '已改写特权响应：expiry=' + expiry + '，模式=' + result.mode;
    }
  } catch (error) {
    completion = {};
    message = '原样放行：' + error.message;
  }
  try { console.log('[CamScanner VIP] ' + message); } catch (ignored) {}
  $done(completion);
}());
