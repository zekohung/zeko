function captureAuthHeader(request) {
    // 检查请求是否是我们想要拦截的类型
    if (request.method === 'GET' && request.url.indexOf('your-target-url') >= 0) {
        // 发起新的 POST 请求
        $httpClient.post('https://app.jxgdw.com/api/advert/sign', {
            body: {
                // 这里是你的 POST 请求体内容
            },
            headers: {
                // 如果需要，可以在这里设置额外的头部
            }
        }, function(error, response, data) {
            if (error) {
                console.error('Error:', error);
            } else {
                // 从响应中提取 Authorization 头部
                const authHeader = response.headers['Authorization'];
                console.log('Captured Authorization:', authHeader);
                
                // 如果你需要将 Authorization 头部添加到原始请求中
                if (authHeader) {
                    request.headers['Authorization'] = authHeader;
                }
                
                // 使用修改后的请求对象结束脚本执行
                $done({response: response, request: request});
            }
        });
    } else {
        // 如果不是我们想要拦截的请求，直接返回原始请求
        return request;
    }
}
