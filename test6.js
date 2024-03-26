function getAuthHeader() {
    // 检查请求的 URL 是否是我们想要处理的
    if ($request.url === 'https://app.jxgdw.com/api/advert/sign') {
        let data = $response.body;
        let result = JSON.parse(data);
        
        // 假设 result 中包含了一个 token 字段，我们可以使用它
        if (result.code === 0 && result.message === "ok" && result.result && result.result.token) {
            let token = result.result.token;
            
            // 打印并记录 token 作为可能的 Authorization 值
            console.log('Captured token for Authorization:', token);
            $.log(`Token 获取成功🎉, Token: ${token}`);
            $.msg('Token 获取成功🎉', `${token}`);
        }
    }
}

// 调用函数
getAuthHeader();
