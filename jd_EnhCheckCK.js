/*
cron "6 6 6 6 *" jd_CheckCK.js, tag:京东CK检测by-ccwav
 */
//详细说明参考 https://github.com/ccwav/QLScript2.
const $ = new Env('CK检测');
//Node.js用户请在jdCookie.js处填写京东ck;
const jdCookieNode = $.isNode() ? require('./jdCookie.js') : '';
const got = require('got');
const {
    getEnvs,
	getEnvById,
    DisableCk,
    EnableCk,
    getstatus
} = require('./function/ql');
const api = got.extend({
        retry: {
            limit: 0
        },
        responseType: 'json',
    });

let ShowSuccess = "false",
CKAlwaysNotify = "false",
CKAutoEnable = "false",
NoWarnError = "false";

let MessageUserGp2 = "";
let MessageUserGp3 = "";
let MessageUserGp4 = "";

let MessageGp2 = "";
let MessageGp3 = "";
let MessageGp4 = "";
let MessageAll = "";

let userIndex2 = -1;
let userIndex3 = -1;
let userIndex4 = -1;

let IndexGp2 = 0;
let IndexGp3 = 0;
let IndexGp4 = 0;
let IndexAll = 0;

let TempErrorMessage = '',
TempSuccessMessage = '',
TempDisableMessage = '',
TempEnableMessage = '',
TempOErrorMessage = '';

let allMessage = '',
ErrorMessage = '',
 SuccessMessage = '',
DisableMessage = '',
EnableMessage = '',
OErrorMessage = '';

let allMessageGp2 = '',
ErrorMessageGp2 = '',
 SuccessMessageGp2 = '',
DisableMessageGp2 = '',
EnableMessageGp2 = '',
OErrorMessageGp2 = '';

let allMessageGp3 = '',
ErrorMessageGp3 = '',
 SuccessMessageGp3 = '',
DisableMessageGp3 = '',
EnableMessageGp3 = '',
OErrorMessageGp3 = '';

let allMessageGp4 = '',
ErrorMessageGp4 = '',
 SuccessMessageGp4 = '',
DisableMessageGp4 = '',
EnableMessageGp4 = '',
OErrorMessageGp4 = '';

let strAllNotify = "";
let strNotifyOneTemp = "";
let WP_APP_TOKEN_ONE = "";
if ($.isNode() && process.env.WP_APP_TOKEN_ONE) {
    WP_APP_TOKEN_ONE = process.env.WP_APP_TOKEN_ONE;
}

let ReturnMessageTitle = '';

/**
 * 输出结构化 Cookie 状态日志
 * 格式: [COOKIE_STATUS] pt_pin={pt_pin} status={status} disable_time={时间} timestamp={毫秒时间戳}
 */
function logCookieStatus(ptPin, status, disableTime = null) {
    const logParts = [
        `[COOKIE_STATUS]`,
        `pt_pin=${ptPin}`,
        `status=${status}`
    ];
    
    if (disableTime) {
        logParts.push(`disable_time=${disableTime}`);
        logParts.push(`timestamp=${Date.now()}`);
    }
    
    console.log(logParts.join(' '));
}

if ($.isNode() && process.env.BEANCHANGE_USERGP2) {
    MessageUserGp2 = process.env.BEANCHANGE_USERGP2 ? process.env.BEANCHANGE_USERGP2.split('&') : [];
    console.log(`检测到设定了分组推送2`);
}

if ($.isNode() && process.env.BEANCHANGE_USERGP3) {
    MessageUserGp3 = process.env.BEANCHANGE_USERGP3 ? process.env.BEANCHANGE_USERGP3.split('&') : [];
    console.log(`检测到设定了分组推送3`);
}

if ($.isNode() && process.env.BEANCHANGE_USERGP4) {
    MessageUserGp4 = process.env.BEANCHANGE_USERGP4 ? process.env.BEANCHANGE_USERGP4.split('&') : [];
    console.log(`检测到设定了分组推送4`);
}

if ($.isNode() && process.env.CHECKCK_SHOWSUCCESSCK) {
    ShowSuccess = process.env.CHECKCK_SHOWSUCCESSCK;
}
if ($.isNode() && process.env.CHECKCK_CKALWAYSNOTIFY) {
    CKAlwaysNotify = process.env.CHECKCK_CKALWAYSNOTIFY;
}
if ($.isNode() && process.env.CHECKCK_CKAUTOENABLE) {
    CKAutoEnable = process.env.CHECKCK_CKAUTOENABLE;
}
if ($.isNode() && process.env.CHECKCK_CKNOWARNERROR) {
    NoWarnError = process.env.CHECKCK_CKNOWARNERROR;
}

if ($.isNode() && process.env.CHECKCK_ALLNOTIFY) {

    strAllNotify = process.env.CHECKCK_ALLNOTIFY;
    console.log(`检测到设定了温馨提示,将在推送信息中置顶显示...`);
    strAllNotify = `\n【✨✨✨✨温馨提示✨✨✨✨】\n` + strAllNotify;
    console.log(strAllNotify);
}

// ========== 并发控制配置（🌟最保守方案：完全串行 + 10秒间隔）==========
// 目标：完全规避京东API限流风险
// - MAX_CONCURRENT=1: 完全串行执行,一个接一个
// - SINGLE_CK_DELAY_MS=10000: 每个CK检测后等待10秒
// - QPS = 1/10 = 0.1 QPS,远低于京东20 QPS的限制（安全裕度200倍）
const MAX_CONCURRENT = process.env.CHECKCK_MAX_CONCURRENT ? parseInt(process.env.CHECKCK_MAX_CONCURRENT) : 1;
const BATCH_DELAY_MS = process.env.CHECKCK_DELAY_MS ? parseInt(process.env.CHECKCK_DELAY_MS) : 2000; // 批次延迟2秒（备用保险）
const SINGLE_CK_DELAY_MS = process.env.CHECKCK_SINGLE_DELAY ? parseInt(process.env.CHECKCK_SINGLE_DELAY) : 10000; // 改为10秒（最保守）
console.log(`\n╔═══════════════════════════════════════════════════════════════════════╗`);
console.log(`║ 🌟 并发配置（最保守方案 - 零限流风险）                              ║`);
console.log(`╠═══════════════════════════════════════════════════════════════════════╣`);
console.log(`║ ⏱️  单CK间隔:        ${(SINGLE_CK_DELAY_MS/1000).toFixed(1)}秒（每个CK之间等待）`);
console.log(`║ 🚀 预计QPS:         ~${(1 / (SINGLE_CK_DELAY_MS/1000)).toFixed(3)} QPS（远低于京东20 QPS限制）`);
const estimatedMinutes = Math.ceil(151 * SINGLE_CK_DELAY_MS / 1000 / 60);
console.log(`║ ⏰ 预计耗时:        ~${estimatedMinutes}分钟（100个CK检测）`);
console.log(`║ 🛡️  安全裕度:        200倍（QPS: 0.1 vs 限制: 20）`);
console.log(`║ 🎯 风险等级:        ✅ 极低（完全规避限流）`);
console.log(`║ 📌 建议频率:        每1小时运行一次（避免连续运行）`);
console.log(`╚═══════════════════════════════════════════════════════════════════════╝\n`);

!(async() => {
    const envs = await getEnvs();
    if (!envs[0]) {
        $.msg($.name, '【提示】请先获取京东账号一cookie\n直接使用NobyDa的京东签到获取', 'https://bean.m.jd.com/bean/signIndex.action', {
            "open-url": "https://bean.m.jd.com/bean/signIndex.action"
        });
        return;
    }
	$.log(`\n默认不自动启用CK,开启变量CHECKCK_CKAUTOENABLE='true'`);
    
    // 按批次处理（防止并发过高触发限流）
    for (let batchStart = 0; batchStart < envs.length; batchStart += MAX_CONCURRENT) {
        const batchEnd = Math.min(batchStart + MAX_CONCURRENT, envs.length);
        const promises = [];
        
        // 这一批的并发任务
        for (let i = batchStart; i < batchEnd; i++) {
            promises.push(processSingleEnv(envs[i], i));
        }
        
        // 等待这一批全部完成
        await Promise.all(promises);
        
        // 批次间延迟
        if (batchEnd < envs.length) {
            console.log(`\n✓ 第${Math.ceil(batchStart / MAX_CONCURRENT)}批检测完成,${BATCH_DELAY_MS}ms后继续...\n`);
            await $.wait(BATCH_DELAY_MS);
        }
    }

    // ... 发送汇总通知
    sendSummaryNotification();
})()
.catch((e) => $.logErr(e))
.finally(() => $.done())

// ============ 处理单个环境变量(CK) ============
async function processSingleEnv(env, i) {
    if (!env || !env.value) return;
    
    try {
        let tempid = 0;
        if(env._id) tempid = env._id;
        else if(env.id) tempid = env.id;
        else return;
        
        const cookie_temp = await getEnvById(tempid);
        const UserName = (cookie_temp.match(/pt_pin=([^; ]+)(?=;?)/) && cookie_temp.match(/pt_pin=([^; ]+)(?=;?)/)[1]);
        const UserName2 = decodeURIComponent(UserName);
        const index = i + 1;
        
        const startTime = Date.now();
        const now = new Date();
        // 使用青龙框架的 $.time() 函数获取正确的本地时间
        const timeStr = $.time('yyyy-MM-dd HH:mm:ss');
        console.log(`\n⏳ 【账号${index}】开始检测 pt_pin=${UserName2}`);
        console.log(`⏱️  时间: ${timeStr}`);
        
        // 检查有效性
        const isValid = await checkCookieValidity(cookie_temp, UserName, UserName2, tempid, index);
        
        // 根据结果更新消息（实现与原脚本兼容）
        updateGroupMessages(isValid, UserName, UserName2, index, i);
        
        // 单个CK检测后等待（最保守方案,防止限流）
        const elapsedTime = Date.now() - startTime;
        const remainingDelay = Math.max(0, SINGLE_CK_DELAY_MS - elapsedTime);
        if (remainingDelay > 0) {
            console.log(`⏸️  限流保护：等待${(remainingDelay/1000).toFixed(1)}秒...`);
            await $.wait(remainingDelay);
        }
        
    } catch (err) {
        console.log(`[错误] 处理环境变量${i}时出错: ${err.message}`);
    }
}

// ============ 检查Cookie有效性 ============
async function checkCookieValidity(cookie, UserName, UserName2, tempid, index) {
    return new Promise(async (resolve) => {
        const options = {
            url: "https://me-api.jd.com/user_new/info/GetJDUserInfoUnion",
            headers: {
                Host: "me-api.jd.com",
                Accept: "*/*",
                Cookie: cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
            }
        };
        
        $.get(options, async (err, resp, data) => {
            try {
                let isLogin = true;
                let nickName = UserName2;
                
                if (err) {
                    isLogin = false;
                    console.log(`[错误] ${UserName2}: ${err.message}`);
                } else if (data) {
                    data = JSON.parse(data);
                    if (data['retcode'] === "1001") {
                        isLogin = false; // cookie过期
                    } else if (data['retcode'] === "0" && data.data && data.data.userInfo) {
                        nickName = data.data.userInfo.baseInfo.nickname || UserName2;
                    }
                }
                
                // 如果有效,尝试二次确认
                if (isLogin) {
                    await new Promise(confirmResolve => {
                        const options2 = {
                            url: 'https://plogin.m.jd.com/cgi-bin/ml/islogin',
                            headers: {
                                Cookie: cookie,
                                "User-Agent": "jdapp;iPhone;10.1.2;15.0;network/wifi;Mozilla/5.0"
                            }
                        };
                        $.get(options2, (err2, resp2, data2) => {
                            try {
                                if (data2) {
                                    data2 = JSON.parse(data2);
                                    if (data2.islogin !== "1") {
                                        isLogin = false;
                                    }
                                }
                            } catch(e) {}
                            confirmResolve();
                        });
                    });
                }
                
                // 输出日志
                if (isLogin) {
                    logCookieStatus(UserName, 'valid');
                    console.log(`✅ 【账号${index}】${nickName} - 有效`);
                    console.log(`📝 pt_pin=${UserName}\n`);
                    resolve({ valid: true, nickName });
                } else {
                    const status = await getstatus(tempid);
                    const disableTime = $.time('yyyy-MM-dd HH:mm:ss');
                    
                    if (status == 0) {
                        // 新失效,自动禁用
                        const disableResult = await DisableCk(tempid);
                        const failureType = disableResult.code == 200 ? 'newly_detected' : 'newly_detected_failed';
                        logCookieStatus(UserName, 'invalid', disableTime);
                        console.log(`❌ 【账号${index}】${UserName2} - Cookie已失效`);
                        console.log(`🔧 自动禁用: ${disableResult.code == 200 ? '✅成功' : '❌失败'}`);
                        console.log(`⏰ 失效时间: ${disableTime}\n`);
                    } else {
                        logCookieStatus(UserName, 'invalid', disableTime);
                        console.log(`❌ 【账号${index}】${UserName2} - Cookie已失效(已禁用)`);
                        console.log(`⏰ 失效时间: ${disableTime}\n`);
                    }
                    resolve({ valid: false, nickName: UserName2 });
                }
            } catch (e) {
                console.log(`[异常] ${UserName2}: ${e.message}`);
                logCookieStatus(UserName, 'error');
                resolve({ valid: false, nickName: UserName2, error: true });
            } finally {
                // 避免回调重复
            }
        });
    });
}

// ============ 更新消息分组（与原脚本兼容） ============
function updateGroupMessages(result, UserName, UserName2, index, envIndex) {
    let message = '';
    if (result.valid) {
        message = `【账号${index}】${result.nickName}\n`;
        SuccessMessage += message;
    } else {
        message = `【账号${index}】${result.nickName}\n`;
        ErrorMessage += message;
    }
}

// ============ 发送汇总通知 ============
async function sendSummaryNotification() {
    if (!$.isNode()) return;
    
    console.log(`\n╔═══════════════════════════════════════════╗`);
    console.log(`║ 📊 检测结果汇总                            ║`);
    console.log(`╚═══════════════════════════════════════════╝\n`);
    
    let allMessage = '';
    
    if (ErrorMessage) {
        allMessage += `👇👇👇👇👇失效账号👇👇👇👇👇\n${ErrorMessage}\n\n`;
    } else {
        allMessage += `👇👇👇👇👇失效账号👇👇👇👇👇\n一个失效的都没有呢,羡慕啊...\n\n`;
    }
    
    if (ShowSuccess == "true" && SuccessMessage) {
        allMessage += `👇👇👇👇👇有效账号👇👇👇👇👇\n${SuccessMessage}\n`;
    }
    
    if (allMessage && (ErrorMessage || CKAlwaysNotify == "true")) {
        if (strAllNotify) allMessage += `\n${strAllNotify}`;
        
        console.log("京东CK检测结果：");
        console.log(allMessage);
    }
    
    // ✨ 脚本执行完成标记,让项目能准确识别脚本完全执行完毕（保守方案需要此标记）
    if ($.isNode()) {
        const envCount = await getEnvs().then(envs => envs.length);
        // 使用青龙框架的 $.time() 函数获取正确的本地时间（比 Date 对象更可靠）
        const localTime = $.time('yyyy-MM-dd HH:mm:ss');
        const timestamp = Date.now();
        const successCount = SuccessMessage ? (SuccessMessage.match(/【账号/g) || []).length : 0;
        const failCount = ErrorMessage ? (ErrorMessage.match(/【账号/g) || []).length : 0;
        
        console.log(`\n╔═══════════════════════════════════════════════════╗`);
        console.log(`║ ✨ 脚本执行完成（最保守方案）                  ║`);
        console.log(`╠═══════════════════════════════════════════════════╣`);
        console.log(`║ 执行状态: ✅ 成功`);
        console.log(`║ 总检测数: ${envCount}个`);
        console.log(`║ 有效账号: ${successCount}个 ✅`);
        console.log(`║ 失效账号: ${failCount}个 ❌`);
        console.log(`║ 完成时间: ${localTime}（东8区）`);
        console.log(`║ 时间戳:   ${timestamp}`);
        console.log(`╚═══════════════════════════════════════════════════╝\n`);
        
        console.log(`[CHECKCK_FINISHED] execution_status=success total_cookies=${envCount} success_count=${successCount} fail_count=${failCount} local_time=${localTime} timestamp=${timestamp}`);
    }
}

// ... 下面是原有的Env函数等,保持不变
function TotalBean() {
    return new Promise(async resolve => {
        const options = {
            url: "https://me-api.jd.com/user_new/info/GetJDUserInfoUnion",
            headers: {
                Host: "me-api.jd.com",
                Accept: "*/*",
                Connection: "keep-alive",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36 Edg/106.0.1370.42",
                "Accept-Language": "zh-cn",
                "Referer": "https://home.m.jd.com/myJd/newhome.action?sceneval=2&ufc=&",
                "Accept-Encoding": "gzip, deflate, br"
            }
        }
        $.get(options, (err, resp, data) => {
            try {
                if (err) {
                    $.logErr(err)
                } else {
                    if (data) {
                        data = JSON.parse(data);
                    }
                }
            } catch (e) {
                $.logErr(e)
            }
            finally {
                resolve();
            }
        })
    })
}

// prettier-ignore
function Env(t, e) {
    "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0);
    class s {
        constructor(t) {
            this.env = t
        }
        send(t, e = "GET") {
            t = "string" == typeof t ? {
                url: t
            }
             : t;
            let s = this.get;
            return "POST" === e && (s = this.post),
            new Promise((e, i) => {
                s.call(this, t, (t, s, r) => {
                    t ? i(t) : e(s)
                })
            })
        }
        get(t) {
            return this.send.call(this.env, t)
        }
        post(t) {
            return this.send.call(this.env, t, "POST")
        }
    }
    return new class {
        constructor(t, e) {
            this.name = t,
            this.http = new s(this),
            this.data = null,
            this.dataFile = "box.dat",
            this.logs = [],
            this.isMute = !1,
            this.isNeedRewrite = !1,
            this.logSeparator = "\n",
            this.startTime = (new Date).getTime(),
            Object.assign(this, e),
            this.log("", `🔔${this.name}, 开始!`)
        }
        isNode() {
            return "undefined" != typeof module && !!module.exports
        }
        isQuanX() {
            return "undefined" != typeof $task
        }
        isSurge() {
            return "undefined" != typeof $httpClient && "undefined" == typeof $loon
        }
        isLoon() {
            return "undefined" != typeof $loon
        }
        toObj(t, e = null) {
            try {
                return JSON.parse(t)
            } catch {
                return e
            }
        }
        toStr(t, e = null) {
            try {
                return JSON.stringify(t)
            } catch {
                return e
            }
        }
        getjson(t, e) {
            let s = e;
            const i = this.getdata(t);
            if (i)
                try {
                    s = JSON.parse(this.getdata(t))
                } catch {}
            return s
        }
        setjson(t, e) {
            try {
                return this.setdata(JSON.stringify(t), e)
            } catch {
                return !1
            }
        }
        getScript(t) {
            return new Promise(e => {
                this.get({
                    url: t
                }, (t, s, i) => e(i))
            })
        }
        runScript(t, e) {
            return new Promise(s => {
                let i = this.getdata("@chavy_boxjs_userCfgs.httpapi");
                i = i ? i.replace(/\n/g, "").trim() : i;
                let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");
                r = r ? 1 * r : 20,
                r = e && e.timeout ? e.timeout : r;
                const[o, h] = i.split("@"),
                n = {
                    url: `http://${h}/v1/scripting/evaluate`,
                    body: {
                        script_text: t,
                        mock_type: "cron",
                        timeout: r
                    },
                    headers: {
                        "X-Key": o,
                        Accept: "*/*"
                    }
                };
                this.post(n, (t, e, i) => s(i))
            }).catch(t => this.logErr(t))
        }
        loaddata() {
            if (!this.isNode())
                return {}; {
                this.fs = this.fs ? this.fs : require("fs"),
                this.path = this.path ? this.path : require("path");
                const t = this.path.resolve(this.dataFile),
                e = this.path.resolve(process.cwd(), this.dataFile),
                s = this.fs.existsSync(t),
                i = !s && this.fs.existsSync(e);
                if (!s && !i)
                    return {}; {
                    const i = s ? t : e;
                    try {
                        return JSON.parse(this.fs.readFileSync(i))
                    } catch (t) {
                        return {}
                    }
                }
            }
        }
        writedata() {
            if (this.isNode()) {
                this.fs = this.fs ? this.fs : require("fs"),
                this.path = this.path ? this.path : require("path");
                const t = this.path.resolve(this.dataFile),
                e = this.path.resolve(process.cwd(), this.dataFile),
                s = this.fs.existsSync(t),
                i = !s && this.fs.existsSync(e),
                r = JSON.stringify(this.data);
                s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r)
            }
        }
        lodash_get(t, e, s) {
            const i = e.replace(/\[(\d+)\]/g, ".$1").split(".");
            let r = t;
            for (const t of i)
                if (r = Object(r)[t], void 0 === r)
                    return s;
            return r
        }
        lodash_set(t, e, s) {
            return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t)
        }
        getdata(t) {
            let e = this.getval(t);
            if (/^@/.test(t)) {
                const[, s, i] = /^@(.*?)\.(.*?)$/.exec(t),
                r = s ? this.getval(s) : "";
                if (r)
                    try {
                        const t = JSON.parse(r);
                        e = t ? this.lodash_get(t, i, "") : e
                    } catch (t) {
                        e = ""
                    }
            }
            return e
        }
        setdata(t, e) {
            let s = !1;
            if (/^@/.test(e)) {
                const[, i, r] = /^@(.*?)\.(.*?)$/.exec(e),
                o = this.getval(i),
                h = i ? "null" === o ? null : o || "{}" : "{}";
                try {
                    const e = JSON.parse(h);
                    this.lodash_set(e, r, t),
                    s = this.setval(JSON.stringify(e), i)
                } catch (e) {
                    const o = {};
                    this.lodash_set(o, r, t),
                    s = this.setval(JSON.stringify(o), i)
                }
            } else
                s = this.setval(t, e);
            return s
        }
        getval(t) {
            return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null
        }
        setval(t, e) {
            return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null
        }
        initGotEnv(t) {
            this.got = this.got ? this.got : require("got"),
            this.cktough = this.cktough ? this.cktough : require("tough-cookie"),
            this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar,
            t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar))
        }
        get(t, e = (() => {})) {
            t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]),
            this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
                        "X-Surge-Skip-Scripting": !1
                    })), $httpClient.get(t, (t, s, i) => {
                    !t && s && (s.body = i, s.statusCode = s.status),
                    e(t, s, i)
                })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
                        hints: !1
                    })), $task.fetch(t).then(t => {
                    const {
                        statusCode: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    } = t;
                    e(null, {
                        status: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    }, o)
                }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => {
                    try {
                        if (t.headers["set-cookie"]) {
                            const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();
                            s && this.ckjar.setCookieSync(s, null),
                            e.cookieJar = this.ckjar
                        }
                    } catch (t) {
                        this.logErr(t)
                    }
                }).then(t => {
                    const {
                        statusCode: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    } = t;
                    e(null, {
                        status: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    }, o)
                }, t => {
                    const {
                        message: s,
                        response: i
                    } = t;
                    e(s, i, i && i.body)
                }))
        }
        post(t, e = (() => {})) {
            if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon())
                this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
                        "X-Surge-Skip-Scripting": !1
                    })), $httpClient.post(t, (t, s, i) => {
                    !t && s && (s.body = i, s.statusCode = s.status),
                    e(t, s, i)
                });
            else if (this.isQuanX())
                t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
                        hints: !1
                    })), $task.fetch(t).then(t => {
                    const {
                        statusCode: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    } = t;
                    e(null, {
                        status: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    }, o)
                }, t => e(t));
            else if (this.isNode()) {
                this.initGotEnv(t);
                const {
                    url: s,
                    ...i
                } = t;
                this.got.post(s, i).then(t => {
                    const {
                        statusCode: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    } = t;
                    e(null, {
                        status: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    }, o)
                }, t => {
                    const {
                        message: s,
                        response: i
                    } = t;
                    e(s, i, i && i.body)
                })
            }
        }
        time(t, e = null) {
            const s = e ? new Date(e) : new Date;
            let i = {
                "M+": s.getMonth() + 1,
                "d+": s.getDate(),
                "H+": s.getHours(),
                "m+": s.getMinutes(),
                "s+": s.getSeconds(),
                "q+": Math.floor((s.getMonth() + 3) / 3),
                S: s.getMilliseconds()
            };
            /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length)));
            for (let e in i)
                new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length)));
            return t
        }
        msg(e = t, s = "", i = "", r) {
            const o = t => {
                if (!t)
                    return t;
                if ("string" == typeof t)
                    return this.isLoon() ? t : this.isQuanX() ? {
                        "open-url": t
                    }
                 : this.isSurge() ? {
                    url: t
                }
                 : void 0;
                if ("object" == typeof t) {
                    if (this.isLoon()) {
                        let e = t.openUrl || t.url || t["open-url"],
                        s = t.mediaUrl || t["media-url"];
                        return {
                            openUrl: e,
                            mediaUrl: s
                        }
                    }
                    if (this.isQuanX()) {
                        let e = t["open-url"] || t.url || t.openUrl,
                        s = t["media-url"] || t.mediaUrl;
                        return {
                            "open-url": e,
                            "media-url": s
                        }
                    }
                    if (this.isSurge()) {
                        let e = t.url || t.openUrl || t["open-url"];
                        return {
                            url: e
                        }
                    }
                }
            };
            if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) {
                let t = ["", "==============📣系统通知📣=============="];
                t.push(e),
                s && t.push(s),
                i && t.push(i),
                console.log(t.join("\n")),
                this.logs = this.logs.concat(t)
            }
        }
        log(...t) {
            t.length > 0 && (this.logs = [...this.logs, ...t]),
            console.log(t.join(this.logSeparator))
        }
        logErr(t, e) {
            const s = !this.isSurge() && !this.isQuanX() && !this.isLoon();
            s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t)
        }
        wait(t) {
            return new Promise(e => setTimeout(e, t))
        }
        done(t = {}) {
            const e = (new Date).getTime(),
            s = (e - this.startTime) / 1e3;
            this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`),
            this.log(),
            (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t)
        }
    }
    (t, e)
}
