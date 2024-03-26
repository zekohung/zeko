(function() {
    'use strict';

    // 定义请求拦截函数
    var requestInterceptor = function(request) {
        // 检查请求方法和URL是否匹配
        if (request.method === 'GET' && request.url.includes('/api/advert/sign')) {
            // 获取请求头
            var headers = request.headers;
            // 检查Authorization头是否存在
            if (headers && headers['Authorization']) {
                // 提取Authorization值
                var authValue = headers['Authorization'];
                console.log('Extracted Authorization value:', authValue);
                // 这里可以添加其他操作，例如保存到剪贴板或发送到其他设备
            }
        }
        // 继续请求过程
        return request;
    };

    // 注册请求拦截器
    $httpRequestInterceptors.push(requestInterceptor);
})();