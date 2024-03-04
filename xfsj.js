/*************************************
[rewrite_local]

^https:\/\/toblog\.ctobsnssdk\.com\/service\/2\/log_settings url script-response-body  https://raw.githubusercontent.com/zekohung/zoo/main/xfsj.js

[mitm]
hostname = toblog.ctobsnssdk.com

*************************************/


var chxm1023 = JSON.parse($response.body);

chxm1023.result.bav_ab_config = "true";  //去广告

$done({body : JSON.stringify(chxm1023)});