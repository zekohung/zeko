/*
 * 今日水印相机 (com.xhey.XCamera) 会员 + 去广告 + 开屏拦截
 * Shadowrocket http-response 重写脚本，自带 AES-128-CBC，无远端依赖。
 *
 * 抓包实测 (ProxyPin HAR, iOS 3.0.476)：
 *   - 密文格式 {"result":"<base64>"}，AES-128-CBC，PKCS#7，UTF-8
 *   - key = iv = "xhey-cc4275fd-43"（16 字节 ASCII）
 *   - 原生 App 的业务接口走裸 IP：https://120.79.224.219/next/app/vip/info
 *     （Host 头也是 IP），所以原模块 pattern 只写 today.xhey.top 永远不触发。
 *     本脚本放行任意 IPv4 字面量主机。
 *
 * 处理的接口：
 *   /next/app/vip/info                          个人会员/免广告/AI会员/去水印次数
 *   /next/app/user/right/info                   权益次数
 *   /next/app/user/space/info                   相册查看上限
 *   /next/promote/operation/appstart/adx/v3/rtb_api   -> 无填充(204)
 *   /next/promote/operation/appstart/adx/v3/rtb_sdk   -> 无填充(204)  ← 开屏广告主投放口
 *   /next/app/adx/client_bidding_v2              -> 竞价瀑布清空
 *   /next/app/adx/ad_pos                         -> 广告位清空
 *   /next/app/ad_plan/delivery/plans             -> 自营广告计划清空
 */
var XCameraUnlock = (function () {
  'use strict';

  var KEY_TEXT = 'xhey-cc4275fd-43';
  var EXPIRES_SEC = 4102444799; /* 2099-12-31 23:59:59 UTC */
  var COUNT = 1000000;
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var sbox = [], inverseSbox = [], roundKeys;

  function gf(a, b) {
    var n = 0;
    while (b) {
      if (b & 1) n ^= a;
      a = ((a << 1) ^ ((a & 128) ? 283 : 0)) & 255;
      b >>>= 1;
    }
    return n;
  }
  function rotateByte(x, n) { return ((x << n) | (x >>> (8 - n))) & 255; }
  function initAes() {
    if (roundKeys) return;
    var i, x, n, p, rcon = 1, temp;
    for (i = 0; i < 256; i++) {
      x = i; p = i ? 1 : 0; n = 254;
      while (n && i) { if (n & 1) p = gf(p, x); x = gf(x, x); n >>>= 1; }
      x = p ^ rotateByte(p, 1) ^ rotateByte(p, 2) ^ rotateByte(p, 3) ^ rotateByte(p, 4) ^ 99;
      sbox[i] = x; inverseSbox[x] = i;
    }
    roundKeys = utf8Encode(KEY_TEXT);
    for (i = 16; i < 176; i += 4) {
      temp = roundKeys.slice(i - 4, i);
      if (i % 16 === 0) {
        temp = [sbox[temp[1]] ^ rcon, sbox[temp[2]], sbox[temp[3]], sbox[temp[0]]];
        rcon = gf(rcon, 2);
      }
      for (n = 0; n < 4; n++) roundKeys[i + n] = roundKeys[i - 16 + n] ^ temp[n];
    }
  }
  function addKey(state, round) {
    for (var i = 0; i < 16; i++) state[i] ^= roundKeys[round * 16 + i];
  }
  function substitute(state, inverse) {
    var table = inverse ? inverseSbox : sbox;
    for (var i = 0; i < 16; i++) state[i] = table[state[i]];
  }
  function shiftRows(state, inverse) {
    var copy = state.slice(), row, column, source;
    for (row = 0; row < 4; row++) for (column = 0; column < 4; column++) {
      source = (column + (inverse ? 4 - row : row)) % 4;
      state[4 * column + row] = copy[4 * source + row];
    }
  }
  function mixColumns(state, inverse) {
    var column, at, a, b, c, d;
    for (column = 0; column < 4; column++) {
      at = column * 4; a = state[at]; b = state[at + 1]; c = state[at + 2]; d = state[at + 3];
      if (inverse) {
        state[at] = gf(a, 14) ^ gf(b, 11) ^ gf(c, 13) ^ gf(d, 9);
        state[at + 1] = gf(a, 9) ^ gf(b, 14) ^ gf(c, 11) ^ gf(d, 13);
        state[at + 2] = gf(a, 13) ^ gf(b, 9) ^ gf(c, 14) ^ gf(d, 11);
        state[at + 3] = gf(a, 11) ^ gf(b, 13) ^ gf(c, 9) ^ gf(d, 14);
      } else {
        state[at] = gf(a, 2) ^ gf(b, 3) ^ c ^ d;
        state[at + 1] = a ^ gf(b, 2) ^ gf(c, 3) ^ d;
        state[at + 2] = a ^ b ^ gf(c, 2) ^ gf(d, 3);
        state[at + 3] = gf(a, 3) ^ b ^ c ^ gf(d, 2);
      }
    }
  }
  function block(input, inverse) {
    initAes();
    if (input.length !== 16) throw new Error('Invalid AES block length');
    var state = input.slice(), round;
    if (inverse) {
      addKey(state, 10);
      for (round = 9; round >= 1; round--) {
        shiftRows(state, true); substitute(state, true); addKey(state, round); mixColumns(state, true);
      }
      shiftRows(state, true); substitute(state, true); addKey(state, 0);
    } else {
      addKey(state, 0);
      for (round = 1; round < 10; round++) {
        substitute(state, false); shiftRows(state, false); mixColumns(state, false); addKey(state, round);
      }
      substitute(state, false); shiftRows(state, false); addKey(state, 10);
    }
    return state;
  }
  function utf8Encode(text) {
    var encoded = encodeURIComponent(text), bytes = [], i;
    for (i = 0; i < encoded.length; i++) {
      if (encoded.charAt(i) === '%') { bytes.push(parseInt(encoded.substr(i + 1, 2), 16)); i += 2; }
      else bytes.push(encoded.charCodeAt(i));
    }
    return bytes;
  }
  function utf8Decode(bytes) {
    var encoded = '', i;
    for (i = 0; i < bytes.length; i++) encoded += '%' + ('0' + bytes[i].toString(16)).slice(-2);
    return decodeURIComponent(encoded);
  }
  function base64Encode(bytes) {
    var output = '', i, a, b, c, n;
    for (i = 0; i < bytes.length; i += 3) {
      a = bytes[i]; b = bytes[i + 1]; c = bytes[i + 2]; n = (a << 16) | ((b || 0) << 8) | (c || 0);
      output += B64.charAt((n >>> 18) & 63) + B64.charAt((n >>> 12) & 63) +
        (i + 1 < bytes.length ? B64.charAt((n >>> 6) & 63) : '=') +
        (i + 2 < bytes.length ? B64.charAt(n & 63) : '=');
    }
    return output;
  }
  function base64Decode(text) {
    if (typeof text !== 'string' || !text.length || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new Error('Invalid Base64');
    }
    var output = [], i, n;
    for (i = 0; i < text.length; i += 4) {
      n = (B64.indexOf(text.charAt(i)) << 18) | (B64.indexOf(text.charAt(i + 1)) << 12) |
        ((text.charAt(i + 2) === '=' ? 0 : B64.indexOf(text.charAt(i + 2))) << 6) |
        (text.charAt(i + 3) === '=' ? 0 : B64.indexOf(text.charAt(i + 3)));
      output.push((n >>> 16) & 255);
      if (text.charAt(i + 2) !== '=') output.push((n >>> 8) & 255);
      if (text.charAt(i + 3) !== '=') output.push(n & 255);
    }
    return output;
  }
  function encrypt(bytes) {
    var padded = bytes.slice(), padding = 16 - bytes.length % 16;
    var previous = utf8Encode(KEY_TEXT), output = [], i, j, current;
    for (i = 0; i < padding; i++) padded.push(padding);
    for (i = 0; i < padded.length; i += 16) {
      current = padded.slice(i, i + 16);
      for (j = 0; j < 16; j++) current[j] ^= previous[j];
      previous = block(current, false);
      for (j = 0; j < 16; j++) output.push(previous[j]);
    }
    return output;
  }
  function decrypt(bytes) {
    if (!bytes.length || bytes.length % 16) throw new Error('Invalid AES ciphertext length');
    var previous = utf8Encode(KEY_TEXT), output = [], i, j, current, plain;
    for (i = 0; i < bytes.length; i += 16) {
      current = bytes.slice(i, i + 16); plain = block(current, true);
      for (j = 0; j < 16; j++) output.push(plain[j] ^ previous[j]);
      previous = current;
    }
    var padding = output[output.length - 1];
    if (padding < 1 || padding > 16) throw new Error('Invalid PKCS#7 padding');
    for (i = output.length - padding; i < output.length; i++) {
      if (output[i] !== padding) throw new Error('Invalid PKCS#7 padding');
    }
    return output.slice(0, output.length - padding);
  }
  function decodeResult(encoded) {
    var text = utf8Decode(decrypt(base64Decode(encoded))), object, innerBase64 = false;
    try { object = JSON.parse(text); }
    catch (error) { object = JSON.parse(utf8Decode(base64Decode(text))); innerBase64 = true; }
    return { object: object, innerBase64: innerBase64 };
  }
  function encodeResult(object, innerBase64) {
    var text = JSON.stringify(object);
    if (innerBase64) text = base64Encode(utf8Encode(text));
    return base64Encode(encrypt(utf8Encode(text)));
  }

  var HOST_RE = /^https?:\/\/(?:today\.xhey\.top|ad\.xhey\.top|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?\//i;

  function pathOf(url) {
    var match = /^https?:\/\/[^\/?#]+/i.exec(url);
    return (match ? url.slice(match[0].length) : url).split('#')[0].split('?')[0];
  }

  function routeOf(path) {
    if (/\/app\/vip\/info\/?$/i.test(path)) return 'vip';
    if (/\/app\/user\/right\/info\/?$/i.test(path)) return 'right';
    if (/\/app\/user\/space\/info\/?$/i.test(path)) return 'space';
    if (/\/promote\/operation\/appstart\/adx\/v[0-9]+\/rtb_(?:api|sdk)\/?$/i.test(path)) return 'nofill';
    if (/\/app\/adx\/client_bidding_v2\/?$/i.test(path)) return 'bidding';
    if (/\/app\/adx\/ad_pos\/?$/i.test(path)) return 'adpos';
    if (/\/app\/ad_plan\/delivery\/plans\/?$/i.test(path)) return 'plans';
    return '';
  }

  function expireValue(original) {
    return Number(original) >= 100000000000 ? EXPIRES_SEC * 1000 : EXPIRES_SEC;
  }

  function patchVip(object) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
    if (object.code !== undefined && object.code !== 200 && object.code !== 0) return false;
    var data = object.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (data.status !== undefined && data.status !== 0) return false;
    if (typeof data.isVip !== 'boolean' && typeof data.isAdFreeVip !== 'boolean') return false;
    if (typeof data.isVip === 'boolean') {
      data.isVip = true;
      if ('vipExpireTime' in data) data.vipExpireTime = expireValue(data.vipExpireTime);
    }
    if (typeof data.isAdFreeVip === 'boolean') {
      data.isAdFreeVip = true;
      if ('adFreeVipExpireTime' in data) data.adFreeVipExpireTime = expireValue(data.adFreeVipExpireTime);
    }
    if (typeof data.removeWatermarkCounts === 'number') data.removeWatermarkCounts = COUNT;
    if (typeof data.vipLevel === 'number' && data.vipLevel < 1) data.vipLevel = 1;
    if (typeof data.vipType === 'number' && data.vipType < 1) data.vipType = 1;
    if (data.aiVip && typeof data.aiVip === 'object' && typeof data.aiVip.isAiVip === 'boolean') {
      data.aiVip.isAiVip = true;
      if ('aiVipExpireTime' in data.aiVip) data.aiVip.aiVipExpireTime = expireValue(data.aiVip.aiVipExpireTime);
    }
    if (Array.isArray(data.vips)) data.vips.forEach(function (vip) {
      if (!vip || typeof vip !== 'object' || typeof vip.isVip !== 'boolean') return;
      vip.isVip = true;
      if ('expireTime' in vip) vip.expireTime = expireValue(vip.expireTime);
    });
    return true;
  }

  function patchRight(object) {
    var data = object && object.data;
    if (!data || typeof data !== 'object' || !Array.isArray(data.rightInfos)) return false;
    if (!data.rightInfos.length) {
      data.rightInfos.push({ rightType: 1, rightValue: COUNT });
      return true;
    }
    var changed = false;
    data.rightInfos.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      if (typeof item.rightValue === 'number' && item.rightValue < COUNT) {
        item.rightValue = COUNT;
        changed = true;
      }
    });
    return changed;
  }

  function patchSpace(object) {
    var data = object && object.data;
    if (!data || typeof data !== 'object') return false;
    var limit = data.viewLimit && data.viewLimit.historyPhotoViewLimit;
    if (limit && typeof limit.count === 'number' && limit.count < COUNT) {
      limit.count = COUNT;
      return true;
    }
    return false;
  }

  function patchBidding(object) {
    var data = object && object.data;
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.clientBiddingTagList)) return false;
    data.clientBiddingTagList = [];
    data.waterfallTotalTimeout = 0;
    return true;
  }

  function patchAdPos(object) {
    var data = object && object.data;
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.adPosList)) return false;
    /* 开屏位（iOS开屏 / iOS开屏异步-冷启动）由 adPosList 下发，清空即无位可投 */
    data.adPosList = [];
    if (Array.isArray(data.sdkInfoList)) data.sdkInfoList = [];
    if (Array.isArray(data.sdkInfoListV2)) data.sdkInfoListV2 = [];
    if (Array.isArray(data.exposureStrategyList)) data.exposureStrategyList = [];
    return true;
  }

  function patchPlans(object) {
    var data = object && object.data;
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.items)) return false;
    data.items = [];
    return true;
  }

  function noFillEnvelope() {
    return JSON.stringify({ result: encodeResult({ code: 204, msg: '', toast_msg: '', data: {} }, false) });
  }

  function processBody(url, body) {
    if (typeof url !== 'string' || !HOST_RE.test(url)) return { changed: false, reason: 'host not targeted' };
    var route = routeOf(pathOf(url));
    if (!route) return { changed: false, reason: 'path not targeted' };
    if (route === 'nofill') return { changed: true, body: noFillEnvelope(), tag: 'ad no-fill' };
    if (typeof body !== 'string' || !body) return { changed: false, reason: 'empty or binary body' };

    var envelope, decoded, object, patched;
    try { envelope = JSON.parse(body); } catch (error) { return { changed: false, reason: 'body is not JSON' }; }

    if (envelope && typeof envelope.result === 'string') {
      decoded = decodeResult(envelope.result);
      object = decoded.object;
    } else {
      object = envelope;
      decoded = null;
    }

    if (route === 'vip') patched = patchVip(object);
    else if (route === 'right') patched = patchRight(object);
    else if (route === 'space') patched = patchSpace(object);
    else if (route === 'bidding') patched = patchBidding(object);
    else if (route === 'adpos') patched = patchAdPos(object);
    else if (route === 'plans') patched = patchPlans(object);
    else patched = false;

    if (!patched) return { changed: false, reason: 'unexpected payload for ' + route };

    if (decoded) {
      envelope.result = encodeResult(object, decoded.innerBase64);
      return { changed: true, body: JSON.stringify(envelope), tag: route + ' / aes' };
    }
    return { changed: true, body: JSON.stringify(object), tag: route + ' / plain' };
  }

  function cleanHeaders(headers) {
    var output = {}, key;
    for (key in headers) if (Object.prototype.hasOwnProperty.call(headers, key)) {
      if (!/^(content-length|content-encoding|transfer-encoding|etag|content-md5|digest|content-digest)$/i.test(key)) {
        output[key] = headers[key];
      }
    }
    var contentTypeKey;
    for (key in output) if (/^content-type$/i.test(key)) contentTypeKey = key;
    output[contentTypeKey || 'Content-Type'] = 'application/json; charset=utf-8';
    return output;
  }

  return {
    processBody: processBody,
    cleanHeaders: cleanHeaders,
    decodeResult: decodeResult,
    encodeResult: encodeResult,
    encrypt: encrypt,
    decrypt: decrypt,
    pathOf: pathOf,
    routeOf: routeOf
  };
}());

(function () {
  'use strict';
  if (typeof $done !== 'function') return;
  var completion = {}, message = '';
  try {
    if (typeof $request === 'undefined' || typeof $response === 'undefined') throw new Error('needs http-response trigger');
    var code = Number($response.statusCode || $response.status || 200);
    if (!isFinite(code) || code < 200 || code >= 300) {
      message = 'pass-through: http ' + code;
    } else {
      var result = XCameraUnlock.processBody($request.url, $response.body);
      if (result.changed) {
        completion = { body: result.body, headers: XCameraUnlock.cleanHeaders($response.headers || {}) };
        message = 'rewritten: ' + result.tag;
      } else {
        message = 'pass-through: ' + result.reason;
      }
    }
  } catch (error) {
    message = 'pass-through: ' + (error && error.message ? error.message : error);
  }
  try { console.log('[XCamera unlock] ' + message); } catch (ignored) {}
  $done(completion);
}());
