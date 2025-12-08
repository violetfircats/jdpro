//name: Epic免费游戏领取提醒
//cron: 30 7 * * 5
// 每周五早上7:30执行，推送Epic本周免费游戏信息到钉钉群

const axios = require('axios');
const crypto = require('crypto');

// 从环境变量获取钉钉Webhook配置
const DINGTALK_WEBHOOK = process.env.DINGTALK_ALERT_GROUP_WEBHOOK;
const DINGTALK_SECRET = process.env.DINGTALK_ALERT_GROUP_WEBHOOK_SECRET;

if (!DINGTALK_WEBHOOK) {
    console.error('❌ 未找到DINGTALK_ALERT_GROUP_WEBHOOK环境变量');
    console.error('请在青龙面板的环境变量中配置:');
    console.error('  DINGTALK_ALERT_GROUP_WEBHOOK=你的钉钉webhook地址');
    console.error('  DINGTALK_ALERT_GROUP_WEBHOOK_SECRET=你的钉钉webhook密钥(可选)');
    process.exit(1);
}

/**
 * 生成钉钉webhook签名
 * @param {string} secret - 密钥
 * @returns {{timestamp: number, sign: string}} - 时间戳和签名
 */
function generateSignature(secret) {
    const timestamp = Date.now();
    const stringToSign = `${timestamp}\n${secret}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(stringToSign);
    const sign = encodeURIComponent(hmac.digest('base64'));
    return { timestamp, sign };
}

/**
 * 获取带签名的webhook URL
 * @returns {string} - 完整的webhook URL
 */
function getSignedWebhookUrl() {
    if (!DINGTALK_SECRET) {
        return DINGTALK_WEBHOOK;
    }
    const { timestamp, sign } = generateSignature(DINGTALK_SECRET);
    const separator = DINGTALK_WEBHOOK.includes('?') ? '&' : '?';
    return `${DINGTALK_WEBHOOK}${separator}timestamp=${timestamp}&sign=${sign}`;
}

// Epic API 地址列表（备用）
const EPIC_API_URLS = [
    'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions',
    'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions'
];

/**
 * 带重试的请求函数
 */
async function fetchWithRetry(urls, params, maxRetries = 2) {
    let lastError = null;
    
    for (const url of urls) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`   尝试请求: ${url.split('/').pop()} (第${attempt}次)`);
                const response = await axios.get(url, {
                    params,
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
                    }
                });
                return response;
            } catch (error) {
                lastError = error;
                console.log(`   ⚠️ 请求失败: ${error.message}`);
                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 1000)); // 等待1秒重试
                }
            }
        }
    }
    throw lastError;
}

async function getEpicFreeGames() {
    try {
        const params = {
            locale: 'zh-CN',
            country: 'CN',
            allowCountries: 'CN'
        };
        
        const response = await fetchWithRetry(EPIC_API_URLS, params);
        
        const elements = response.data?.data?.Catalog?.searchStore?.elements || [];
        const freeGames = [];
        const now = new Date();
        
        elements.forEach(game => {
            if (!game.promotions) return;
            
            // 检查促销信息
            const promotionalOffers = game.promotions.promotionalOffers || [];
            const upcomingOffers = game.promotions.upcomingPromotionalOffers || [];
            
            // 查找有效的免费促销
            let isFree = false;
            let endDate = null;
            
            // 检查当前促销
            for (const offerSet of promotionalOffers) {
                for (const offer of offerSet.promotionalOffers) {
                    if (offer.discountSetting.discountPercentage === 0) {
                        const startDate = new Date(offer.startDate);
                        const endDateObj = new Date(offer.endDate);
                        if (now >= startDate && now <= endDateObj) {
                            isFree = true;
                            endDate = endDateObj;
                            break;
                        }
                    }
                }
                if (isFree) break;
            }
            
            // 检查即将开始的促销
            if (!isFree) {
                for (const offerSet of upcomingOffers) {
                    for (const offer of offerSet.promotionalOffers) {
                        if (offer.discountSetting.discountPercentage === 0) {
                            const startDate = new Date(offer.startDate);
                            const endDateObj = new Date(offer.endDate);
                            // 如果即将在24小时内开始的免费游戏也显示
                            if (startDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
                                isFree = true;
                                endDate = endDateObj;
                                break;
                            }
                        }
                    }
                    if (isFree) break;
                }
            }
            
            // 添加到免费游戏列表
            if (isFree) {
                // 获取游戏图片 (优先使用宽图，其次缩略图)
                let imageUrl = '';
                const keyImages = game.keyImages || [];
                // 按优先级查找图片
                const imageTypes = ['OfferImageWide', 'DieselStoreFrontWide', 'Thumbnail', 'OfferImageTall'];
                for (const type of imageTypes) {
                    const img = keyImages.find(i => i.type === type);
                    if (img?.url) {
                        imageUrl = img.url;
                        break;
                    }
                }
                
                // 获取原价格信息
                let originalPrice = '';
                let currencyCode = '';
                try {
                    const priceInfo = game.price?.totalPrice;
                    if (priceInfo) {
                        // 原价（单位是分，需要除以100）
                        const originalPriceValue = priceInfo.originalPrice || 0;
                        currencyCode = priceInfo.currencyCode || 'CNY';
                        
                        if (originalPriceValue > 0) {
                            // 根据货币格式化价格
                            if (currencyCode === 'CNY') {
                                originalPrice = `¥${(originalPriceValue / 100).toFixed(2)}`;
                            } else if (currencyCode === 'USD') {
                                originalPrice = `$${(originalPriceValue / 100).toFixed(2)}`;
                            } else {
                                originalPrice = `${(originalPriceValue / 100).toFixed(2)} ${currencyCode}`;
                            }
                        }
                    }
                } catch (e) {
                    // 忽略价格解析错误
                }
                
                // 修复游戏链接问题 - 使用更可靠的链接格式
                let gameUrl = '';
                
                // 方法1: 尝试从catalogNs获取
                if (game.catalogNs?.mappings?.length > 0) {
                    gameUrl = `https://store.epicgames.com/zh-CN/p/${game.catalogNs.mappings[0].pageSlug}`;
                } 
                // 方法2: 尝试从自定义属性获取
                else if (game.customAttributes?.length > 0) {
                    const productSlugAttr = game.customAttributes.find(
                        attr => attr.key === 'com.epicgames.app.productSlug'
                    );
                    if (productSlugAttr) {
                        gameUrl = `https://store.epicgames.com/zh-CN/p/${productSlugAttr.value}`;
                    }
                }
                // 方法3: 回退到使用ID
                else {
                    gameUrl = `https://store.epicgames.com/p/${game.id}`;
                }
                
                // 格式化结束日期为北京时间
                const beijingOffset = 8 * 60 * 60 * 1000; // UTC+8
                const beijingDate = new Date(endDate.getTime() + beijingOffset);
                const endDateStr = 
                    `${beijingDate.getUTCFullYear()}-${(beijingDate.getUTCMonth() + 1).toString().padStart(2, '0')}-` +
                    `${beijingDate.getUTCDate().toString().padStart(2, '0')} ` +
                    `${beijingDate.getUTCHours().toString().padStart(2, '0')}:${beijingDate.getUTCMinutes().toString().padStart(2, '0')}`;
                
                freeGames.push({
                    title: game.title,
                    url: gameUrl,
                    image: imageUrl,
                    originalPrice: originalPrice,
                    endDate: endDateStr
                });
            }
        });
        
        return freeGames;
    } catch (error) {
        console.error('获取EPIC游戏数据失败:', error.message);
        if (error.code) {
            console.error('   错误代码:', error.code);
        }
        if (error.response) {
            console.error('   HTTP状态:', error.response.status);
            console.error('   响应数据:', JSON.stringify(error.response.data).substring(0, 200));
        }
        console.error('\n💡 可能的解决方案:');
        console.error('   1. 检查网络连接是否正常');
        console.error('   2. 尝试使用代理或VPN');
        console.error('   3. Epic API 可能暂时不可用，稍后重试');
        throw error;
    }
}

/**
 * 发送钉钉通知
 * @param {Array} games - 免费游戏列表
 */
async function sendDingtalkNotification(games) {
    if (games.length === 0) {
        console.log('本周没有免费游戏');
        return;
    }
    
    try {
        const title = `🎮 Epic本周免费游戏 (${games.length}款)`;
        
        // 构建Markdown内容
        let markdownContent = `## 🎮 Epic本周免费游戏\n\n`;
        markdownContent += `**共 ${games.length} 款游戏限时免费领取！**\n\n`;
        markdownContent += `---\n\n`;
        
        games.forEach((game, index) => {
            markdownContent += `### ${index + 1}. ${game.title}\n\n`;
            
            // 显示游戏图片（钉钉Markdown支持图片）
            if (game.image) {
                markdownContent += `![${game.title}](${game.image})\n\n`;
            }
            
            // 显示原价（如果有）
            if (game.originalPrice) {
                markdownContent += `💰 **原价**: ~~${game.originalPrice}~~ → **免费**\n\n`;
            }
            
            markdownContent += `⏳ **截止时间**: ${game.endDate}\n\n`;
            markdownContent += `🔗 **领取链接**: [点击领取](${game.url})\n\n`;
            if (index < games.length - 1) {
                markdownContent += `---\n\n`;
            }
        });
        
        markdownContent += `\n---\n\n`;
        markdownContent += `📌 **快捷入口**: [Epic免费游戏页面](https://store.epicgames.com/free-games)\n\n`;
        markdownContent += `💡 *别忘了每周领取，游戏领取后永久拥有！*`;
        
        // 构建钉钉消息体
        const message = {
            msgtype: 'markdown',
            markdown: {
                title: title,
                text: markdownContent
            }
        };
        
        // 获取带签名的webhook URL
        const webhookUrl = getSignedWebhookUrl();
        
        // 发送钉钉通知
        const response = await axios.post(webhookUrl, message, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        if (response.data && response.data.errcode === 0) {
            console.log(`✅ 成功推送 ${games.length} 款免费游戏通知到钉钉`);
            games.forEach((game, index) => {
                console.log(`   ${index + 1}. ${game.title}`);
            });
        } else {
            console.error('❌ 钉钉推送返回错误:', response.data);
        }
    } catch (error) {
        console.error('❌ 钉钉推送失败:', error.message);
        if (error.response) {
            console.error('钉钉响应数据:', error.response.data);
        }
    }
}

async function main() {
    try {
        console.log('='.repeat(50));
        console.log('🚀 Epic免费游戏领取提醒 - 钉钉推送版');
        console.log('='.repeat(50));
        console.log('');
        console.log('📡 开始获取Epic免费游戏信息...');
        
        const freeGames = await getEpicFreeGames();
        
        // 打印调试信息
        console.log(`\n🎮 找到 ${freeGames.length} 款免费游戏:`);
        console.log('-'.repeat(40));
        freeGames.forEach((game, index) => {
            console.log(`${index + 1}. ${game.title}`);
            if (game.originalPrice) {
                console.log(`   💰 原价: ${game.originalPrice} → 免费`);
            }
            console.log(`   ⏳ 截止: ${game.endDate}`);
            console.log(`   🔗 ${game.url}`);
            if (game.image) {
                console.log(`   🖼️ 图片: ${game.image.substring(0, 50)}...`);
            }
            console.log('');
        });
        
        console.log('-'.repeat(40));
        console.log('📤 正在推送到钉钉...');
        await sendDingtalkNotification(freeGames);
        
        console.log('');
        console.log('='.repeat(50));
        console.log('✅ 脚本执行完成');
        console.log('='.repeat(50));
    } catch (error) {
        console.error('❌ 脚本执行失败:', error.message);
        process.exit(1);
    }
}

main();
