```javascript
/**
 * Quantumult X Script
 * Capture and log the Authorization header from the request to https://app.jxgdw.com/api/advert/sign
 */

function captureAuthHeader(request) {
    // 获取请求头部
    var authHeader = request.headers['Authorization'];
    
    // 可以根据需要处理或记录Authorization值
    console.log("Captured Authorization:", authHeader);
    
    // 确保返回请求对象
    return request;
}

// Quantumult X需要这种格式注册脚本
$done(captureAuthHeader($request));
```