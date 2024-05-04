const $ = new Env("云盘");
!(async () => {
    if (typeof $request !== "undefined") {
        getHeaders()
        $.done()
    }
})()
.catch((e) => $.logErr(e))
.finally(() => $.done())

function getHeaders() {
    if ($request.url.indexOf('noteServer/api/authTokenRefresh.do') > -1) {
        let headers = $request.headers;
        let appAuth = '';
        let appNumber = '';
        let noteToken = '';
        
        for (let key in headers) {
            if (key.toLowerCase() === 'app-auth') {
                appAuth = headers[key];
            } else if (key.toLowerCase() === 'app-number') {
                appNumber = headers[key];
            } else if (key.toLowerCase() === 'note-token') {
                noteToken = headers[key];
            }
        }
        
        if (appAuth && appNumber && noteToken) {
            let result = `${appAuth}#${appNumber}#${noteToken}`;
            $.log(`${$.name}获取成功🎉, 结果: ${result}`);
            $.msg($.name, `获取成功🎉`, `${result}`);
        } else {
            $.log(`${$.name}获取失败，缺少必要信息`);
        }
    }
}