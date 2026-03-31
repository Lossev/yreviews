const https = require('https');
const fs = require('fs');

let API_KEY = '6e7e1929-4ea9-4a5d-8c05-d601860389bd';
const API_KEY_PATTERN = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;

function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                'Accept': 'text/html,application/xhtml+xml',
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                'Accept': 'application/json',
                'Origin': 'https://2gis.ru',
                'Referer': 'https://2gis.ru/'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { reject(new Error(`Invalid JSON: ${data.substring(0, 100)}`)); }
            });
        }).on('error', reject);
    });
}

async function fetchNewApiKey() {
    console.log('Получаю новый API ключ...');
    
    const urls = [
        'https://2gis.ru/',
        'https://2gis.ru/spb',
    ];
    
    for (const url of urls) {
        try {
            const html = await fetchHTML(url);
            const matches = html.match(API_KEY_PATTERN);
            
            if (matches && matches.length > 0) {
                const newKey = matches[0];
                console.log(`Найден новый ключ: ${newKey}`);
                return newKey;
            }
        } catch (e) {
            console.log(`Ошибка загрузки ${url}: ${e.message}`);
        }
    }
    
    return null;
}

async function testApiKey(key, firmId) {
    const url = `https://public-api.reviews.2gis.com/3.0/branches/${firmId}/reviews?limit=1&key=${key}&locale=ru_RU`;
    try {
        const data = await fetchJSON(url);
        return data.meta !== undefined || data.reviews !== undefined;
    } catch {
        return false;
    }
}

async function get2GISReviews(firmId, retryCount = 0) {
    const allReviews = [];
    let offset = 0;
    const limit = 50;
    let totalCount = 0;
    
    const baseUrl = `https://public-api.reviews.2gis.com/3.0/branches/${firmId}/reviews`;
    const params = `is_advertiser=false&fields=meta.providers,meta.branch_rating,meta.branch_reviews_count,meta.total_count,reviews.hiding_reason,reviews.emojis,reviews.trust_factors&without_my_first_review=false&sort_by=date_created&key=${API_KEY}&locale=ru_RU`;
    
    console.log(`Загрузка отзывов для фирмы ${firmId}...\n`);
    
    do {
        const url = `${baseUrl}?limit=${limit}&offset=${offset}&${params}`;
        
        try {
            const data = await fetchJSON(url);
            
            if (data.error || data.code === 403 || data.code === 401) {
                throw new Error('API key invalid');
            }
            
            if (data.meta?.total_count) totalCount = data.meta.total_count;
            if (data.reviews?.length > 0) {
                allReviews.push(...data.reviews);
                console.log(`Получено: ${allReviews.length}/${totalCount}`);
                offset += limit;
            } else break;
            
            await new Promise(r => setTimeout(r, 300));
            
        } catch (e) {
            if (e.message.includes('API key') || e.message.includes('Invalid JSON')) {
                if (retryCount < 1) {
                    const newKey = await fetchNewApiKey();
                    
                    if (newKey && newKey !== API_KEY) {
                        const isValid = await testApiKey(newKey, firmId);
                        
                        if (isValid) {
                            API_KEY = newKey;
                            console.log(`Ключ обновлён, повторяю запрос...\n`);
                            return get2GISReviews(firmId, retryCount + 1);
                        }
                    }
                    
                    console.error('Не удалось получить рабочий ключ');
                    process.exit(1);
                } else {
                    console.error('Новый ключ тоже не работает');
                    process.exit(1);
                }
            }
            throw e;
        }
    } while (allReviews.length < totalCount);
    
    return { reviews: allReviews, total: totalCount };
}

function formatReviews(reviews) {
    return reviews.map((r, i) => ({
        num: i + 1,
        author: r.user?.name || 'Аноним',
        rating: r.rating,
        date: r.date_created?.split('T')[0] || '',
        text: r.text,
        likes: r.likes_count || 0,
        photos: r.media?.length || 0,
        isHidden: r.is_hidden,
        hidingReason: r.hiding_reason || null,
        answer: r.official_answer?.text || null
    }));
}

async function main() {
    const args = process.argv.slice(2);
    
    const firmId = args[0] || '70000001074435894';
    
    try {
        const { reviews, total } = await get2GISReviews(firmId);
        
        if (reviews.length === 0) {
            console.log('Отзывов не найдено');
            return;
        }
        
        const formatted = formatReviews(reviews);
        
        const filename = `reviews_${firmId}.json`;
        fs.writeFileSync(filename, JSON.stringify(formatted, null, 2), 'utf8');
        
        console.log(`\nСохранено ${reviews.length} отзывов в ${filename}`);
        
        console.log('\nПоследние 5 отзывов:');
        formatted.slice(-5).reverse().forEach(r => {
            console.log(`\n${r.author} | ${r.rating}⭐ | ${r.date}`);
            console.log(`  ${r.text?.substring(0, 100) || '(без текста)'}...`);
        });
        
    } catch (e) {
        console.error('Ошибка:', e.message);
        process.exit(1);
    }
}

main();
