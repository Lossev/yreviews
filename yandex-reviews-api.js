const https = require('https');
const fs = require('fs');

function request(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isPost = options.method === 'POST';
        const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
        
        const reqOptions = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                'Accept': options.accept || 'application/json, text/plain, */*',
                'Accept-Language': 'ru-RU,ru;q=0.9',
                ...(options.headers || {}),
                ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
            }
        };
        
        if (body && !options.headers?.['Content-Type']) {
            reqOptions.headers['Content-Type'] = 'application/json';
        }
        
        const req = https.request(reqOptions, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ 
                body: data, 
                status: res.statusCode, 
                headers: res.headers 
            }));
        });
        
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function tryYandexComApi(oid) {
    console.log('\n=== Yandex.com API ===');
    
    const endpoints = [
        `https://yandex.com/maps/api/business/getReviews?businessId=${oid}&pageSize=20`,
        `https://yandex.com/maps/org/${oid}/reviews/?format=json`,
    ];
    
    for (const url of endpoints) {
        console.log('Trying:', url);
        try {
            const res = await request(url);
            console.log('Status:', res.status);
            if (res.status === 200 && !res.body.includes('csrfToken')) {
                console.log('Response:', res.body.substring(0, 500));
            }
        } catch (e) {
            console.log('Error:', e.message);
        }
    }
}

async function tryMapsFrontApi(oid) {
    console.log('\n=== Maps Front API ===');
    
    const url = `https://maps.yandex.ru/services/front-maps/api/business?id=${oid}&fields=reviews`;
    console.log('Trying:', url);
    
    try {
        const res = await request(url);
        console.log('Status:', res.status);
        console.log('Response:', res.body.substring(0, 500));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

async function tryYandexReviewsWidget(oid) {
    console.log('\n=== Reviews Widget API ===');
    
    const url = `https://yandex.ru/maps/api/business/widget/reviews?businessId=${oid}&limit=20`;
    console.log('Trying:', url);
    
    try {
        const res = await request(url);
        console.log('Status:', res.status);
        console.log('Response:', res.body.substring(0, 500));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

async function tryStaticApi(oid) {
    console.log('\n=== Static API ===');
    
    const url = `https://static.maps.yandex.net/1.x/?lang=ru_RU&oid=${oid}&format=json`;
    console.log('Trying:', url);
    
    try {
        const res = await request(url);
        console.log('Status:', res.status);
        console.log('Response:', res.body.substring(0, 500));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

async function tryMcafeApi(oid) {
    console.log('\n=== McAfee SiteAdvisor (иногда кэширует) ===');
    return null;
}

async function tryWebArchive(oid) {
    console.log('\n=== Проверка альтернативных источников ===');
    return null;
}

async function tryGeocoding(oid) {
    console.log('\n=== Geocoding API ===');
    
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=YOUR_KEY&geocode=oid:${oid}&format=json`;
    console.log('(требует API ключа)');
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Использование:');
        console.log('  node yandex-reviews-api.js <ORG_ID>');
        process.exit(1);
    }
    
    const oid = args[0];
    
    console.log('ORG_ID:', oid);
    console.log('Поиск API для получения отзывов...\n');
    
    await tryYandexComApi(oid);
    await tryMapsFrontApi(oid);
    await tryYandexReviewsWidget(oid);
    await tryStaticApi(oid);
    await tryGeocoding(oid);
    
    console.log('\n\n=== РЕЗУЛЬТАТ ===');
    console.log('Все публичные API Яндекса требуют CSRF токен.');
    console.log('Без браузера можно получить только 3 отзыва из HTML.');
    console.log('\nВарианты:');
    console.log('1. VPS от 100₽/мес (Aeza, VDSina, Timeweb)');
    console.log('2. GitHub Actions (бесплатно) - по расписанию');
    console.log('3. Запуск локально + отправка на сервер');
}

main();
