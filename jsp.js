function GetAuthorizationHeaderValue() {
  // 检查请求URL是否以 https://app.jxgdw.com/ 开头
  if (!$request.url.startsWith('https://app.jxgdw.com/')) {
    $log(`${$name} 非 ${$name} 客户端URL请求，跳过脚本`);
    return;
  }

  // 解析请求头中的 authorization 值
  const headers = $request.headers;
  const authorizationHeader = headers['Authorization'];

  // 检查是否找到了 authorization 头
  if (!authorizationHeader) {
    $notice(`获取authorization失败，关键值缺失`);
    return;
  }

  // 获取 authorization 值
  const authValue = authorizationHeader.value;

  // 保存或更新 authorization 值
  if (authValue) {
    $setdata(authValue, 'authorization');
    $log(`${$name} 保存authorization成功`);
  } else {
    $notice(`保存authorization失败`);
  }
}

// 调用函数
GetAuthorizationHeaderValue();