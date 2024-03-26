(function() {
    'use strict';

    // 监听请求并获取 Authorization 值
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://app.jxgdw.com/api/advert/sign', true);
    xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
            // 解析响应内容
            var response = JSON.parse(xhr.responseText);
            if (response && response.result && response.result.items) {
                // 遍历 items 数组，获取每个请求的 Authorization 值
                response.result.items.forEach(function(item) {
                    // 这里假设 Authorization 值存储在 item 对象中，实际情况可能不同
                    // 需要根据实际的响应结构来调整
                    var authValue = item.Authorization; // 替换为实际的属性名
                    console.log('Authorization value:', authValue);
                    // 这里可以添加其他操作，例如保存到剪贴板或发送到其他设备
                });
            }
        }
    };
    xhr.send();
})();