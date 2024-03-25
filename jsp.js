function GetAuthorization(response) {
    // 从响应头或响应体中提取 Authorization
    if (response && response.headers) {
        const authHeader = response.headers['Authorization'] || response.headers['Authorization'];
        if (authHeader) {
            // 存储找到的 Authorization 值
            $prefs.setValueForKey(authHeader, 'app_jxgdw_auth');
            console.log('[Quantumult X]成功获取Authorization:', authHeader);
        } else {
            console.log('[Quantumult X]未找到Authorization');
        }
    }
}