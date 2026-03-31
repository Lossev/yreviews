const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    const url = 'https://yandex.ru/maps/org/sibir_tsentr/58302385598/reviews';
    const orgId = '58302385598';
    
    console.log('Запуск браузера...');
    console.log('URL:', url);
    
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080'
        ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Загрузка страницы...');
    let retries = 3;
    while (retries > 0) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
            break;
        } catch (e) {
            retries--;
            console.log(`Ошибка загрузки, попыток осталось: ${retries}`);
            if (retries === 0) throw e;
            await wait(3000);
        }
    }
    
    console.log('Ожидание загрузки отзывов (7 сек)...');
    await wait(7000);
    
    console.log('Выбор сортировки "По новизне"...');
    try {
        await page.click('.rating-ranking-view');
        await wait(500);
        await page.click('.rating-ranking-view__popup-line[aria-label="По новизне"]');
        console.log('Сортировка применена, ожидание загрузки (6 сек)...');
        await wait(6000);
    } catch (e) {
        console.log('Не удалось сменить сортировку, продолжаем как есть:', e.message);
    }
    
    let reviews = [];
    let previousCount = 0;
    let noChangeCount = 0;
    
    console.log('Начинаем скроллинг с помощью клавиатуры...');
    
    while (noChangeCount < 15) {
        await page.keyboard.press('End');
        await wait(500);
        
        await page.keyboard.press('PageDown');
        await wait(500);
        
        await page.keyboard.press('PageDown');
        await wait(500);
        
        await page.keyboard.down('Control');
        await page.keyboard.press('End');
        await page.keyboard.up('Control');
        await wait(1000);
        
        reviews = await page.evaluate(() => {
            const reviewElements = document.querySelectorAll('.business-review-view');
            const extracted = [];
            
            reviewElements.forEach(el => {
                const authorEl = el.querySelector('[itemprop="author"] [itemprop="name"]');
                const author = authorEl ? authorEl.textContent.trim() : 
                                 el.querySelector('.business-review-view__author')?.textContent.trim() || 'Аноним';
                
                let rating = 0;
                const ratingEl = el.querySelector('[itemprop="reviewRating"] [itemprop="ratingValue"]');
                if (ratingEl) {
                    rating = parseInt(ratingEl.getAttribute('content') || ratingEl.textContent) || 0;
                }
                if (!rating) {
                    const starsEl = el.querySelector('.business-rating-badge-view__stars[aria-label]');
                    if (starsEl) {
                        const match = starsEl.getAttribute('aria-label').match(/\d+/);
                        rating = match ? parseInt(match[0]) : 0;
                    }
                }
                if (!rating) {
                    const stars = el.querySelectorAll('.business-rating-badge-view__star._full');
                    rating = stars ? stars.length : 0;
                }
                
                const dateEl = el.querySelector('[itemprop="datePublished"]');
                const date = dateEl ? dateEl.getAttribute('content') || dateEl.textContent.trim() : 
                             el.querySelector('.business-review-view__date')?.textContent.trim() || '';
                
                const textEl = el.querySelector('[itemprop="reviewBody"]');
                const text = textEl ? textEl.textContent.trim() : 
                             el.querySelector('.business-review-view__body-text')?.textContent.trim() || '';
                
                extracted.push({ author, rating, date, text });
            });
            
            return extracted;
        });
        
        console.log(`Найдено отзывов: ${reviews.length}`);
        
        if (reviews.length === previousCount) {
            noChangeCount++;
            console.log(`Нет изменений (${noChangeCount}/15)`);
        } else {
            noChangeCount = 0;
            previousCount = reviews.length;
        }
    }
    
    await browser.close();
    
    console.log(`\nВсего получено: ${reviews.length} отзывов`);
    
    if (reviews.length === 0) {
        console.log('Отзывов не найдено');
        return;
    }
    
    const formatted = reviews.map((r, i) => ({
        num: i + 1,
        author: r.author,
        rating: r.rating,
        date: r.date,
        text: r.text
    }));
    
    const data = {
        lastUpdated: new Date().toISOString(),
        orgId: orgId,
        totalReviews: formatted.length,
        reviews: formatted
    };
    
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('Создана папка data/');
    }
    
    const filename = path.join(dataDir, 'reviews.json');
    fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
    
    console.log(`\nСохранено ${reviews.length} отзывов в data/reviews.json`);
    
    if (reviews.length > 0) {
        console.log('\nПоследние 3 отзыва:');
        reviews.slice(-3).forEach(r => {
            console.log(`${r.author} | ${r.rating}⭐`);
        });
    }
}

main().catch(e => {
    console.error('Ошибка:', e.message);
    process.exit(1);
});
