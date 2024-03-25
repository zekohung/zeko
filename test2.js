```javascript
const url = "https://app.jxgdw.com/api/advert/sign";
const method = "GET"; // 根据实际请求方式调整
const headers = {}; // 如果需要的话，添加请求头

// 发起HTTP请求
const requestOptions = {
    url: url,
    method: method,
    headers: headers
};

// 请求回调函数
$task.fetch(requestOptions).then(response => {
    // 获取成功
    if (response.statusCode == 200) {
        // 尝试从响应头中获取Authorization值
        let authValue = response.headers["Authorization"];
        
        if (authValue) {
            // TODO: 根据需求处理Authorization值，比如保存起来或者显示通知
            console.log(`Authorization: ${authValue}`);
            $notify("Authorization获取成功", "", authValue); // 显示通知
        } else {
            // Authorization值不存在
            console.log("Authorization值未找到");
            $notify("Authorization获取失败", "", "未找到Authorization值");
        }
    } else {
        // 请求失败
        console.log("请求失败: " + response.statusCode);
        $notify("请求失败", "", `状态码: ${response.statusCode}`);
    }
}, reason => {
    // 请求出错
    console.log("请求出错: " + reason.error);
    $notify("请求出错", "", reason.error);
});
```