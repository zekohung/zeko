// Quantumult X Script for fetching Authorization header value

// 定义一个函数来处理请求和获取Authorization值
function fetchAuthorization() {
  // 发送GET请求到指定的URL
  $task.fetch({
    url: 'https://app.jxgdw.com/api/advert/sign',
    method: 'get',
    headers: {
      // 这里可以添加必要的请求头，例如User-Agent等
      // 'User-Agent': 'Your User-Agent Here'
    },
    body: {},
    timeout: 30000, // 设置超时时间为30秒
    success: (result) => {
      // 请求成功，处理响应
      if (result.statusCode == 200) {
        // 检查响应头中是否存在Authorization字段
        if (result.headers.hasOwnProperty('Authorization')) {
          // 获取Authorization值
          const authHeader = result.headers['Authorization'];
          // 这里可以对Authorization值进行保存或处理
          $log(`获取到的Authorization值为: ${authHeader}`);
          // 例如，保存到剪贴板或全局变量
          // $clipboard.write(authHeader);
          // $prefs.set('authorization', authHeader);
        } else {
          $log(`响应头中未找到Authorization字段`);
        }
      } else {
        // 请求失败，打印错误信息
        $log(`请求失败，状态码: ${result.statusCode}`);
      }
    },
    failure: (error) => {
      // 请求失败，打印错误信息
      $log(`请求失败: ${error}`);
    }
  });
}

// 调用函数执行任务
fetchAuthorization();