function getAuthHeader() {
  // 检查请求的URL是否为我们关注的URL
  if ($request.url === 'https://app.jxgdw.com/api/advert/sign') {
    // 从请求头中获取Authorization值
    let authValue = $request.headers['Authorization'];
    
    // 检查authValue是否存在
    if (authValue) {
      // 日志打印Authorization值
      console.log(`Authorization值获取成功🎉, Authorization: ${authValue}`);
      // 也可以根据需要将值发送为通知，下面是示例语法
      // $.msg('Authorization值获取成功🎉', `${authValue}`);
    } else {
      console.log('Authorization值未找到');
    }
  }
}
