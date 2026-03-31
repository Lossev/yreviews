const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function getYandexReviewsViaAPI(orgId) {
    console.log('Запуск браузера...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0');
    await page.setViewport({ width: 1920, height: 1080 });
    
    const url = `https://yandex.ru/maps/org/${orgId}/?mode=reviews`;
    console.log(`URL: ${url}\n`);
    
    let reviews = [];
    let csrfToken = null;
    let sessionId = null;
    
    page.on('response', async response => {
        const responseUrl = response.url();
        
        if (responseUrl.includes('/maps/api/search') && response.status() === 200) {
            try {
                const data = await response.json();
                
                if (data && data.data && data.data.features) {
                    const feature = data.data.features[0];
                    if (feature && feature.properties && feature.properties.CompanyMetaData) {
                        const metaData = feature.properties.CompanyMetaData;
                        
                        if (metaData.Reviews) {
                            console.log(`Найдено отзывов через API: ${metaData.Reviews.length}`);
                            reviews = metaData.Reviews.map((r, i) => ({
                                num: i + 1,
                                author: r.author,
                                rating: r.rating,
                                date: r.date,
                                text: r.text
                            }));
                        }
                    }
                }
            } catch (e) {
                // Игнорируем ошибки парсинга
            }
        }
    });
    
    console.log('Загрузка страницы...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 3000));
    
    if (reviews.length === 0) {
        console.log('API не вернул отзывы, пробуем извлечь из HTML...');
        
        reviews = await page.evaluate(() => {
            const reviewElements = document.querySelectorAll('.business-review-view');
            const extractedReviews = [];
            
            reviewElements.forEach((el, i) => {
                const authorEl = el.querySelector('[itemprop="author"] [itemprop="name"]');
                const author = authorEl ? authorEl.textContent.trim() : 
                               el.querySelector('.business-review-view__author')?.textContent.trim() || 'Аноним';
                
                let rating = 0;
                const ratingEl = el.querySelector('[itemprop="reviewRating"] [itemprop="ratingValue"]');
                if (ratingEl) {
                    rating = parseInt(ratingEl.textContent) || 0;
                } else {
                    const stars = el.querySelectorAll('.business-rating-icon-view__star._full, .business-rating-badge-view__star._full');
                    rating = stars ? stars.length : 0;
                }
                
                const dateEl = el.querySelector('[itemprop="datePublished"]');
                const date = dateEl ? dateEl.getAttribute('content') || dateEl.textContent.trim() : 
                             el.querySelector('.business-review-view__date')?.textContent.trim() || '';
                
                const textEl = el.querySelector('[itemprop="reviewBody"]');
                const text = textEl ? textEl.textContent.trim() : 
                             el.querySelector('.business-review-view__body-text')?.textContent.trim() || '';
                
                extractedReviews.push({ num: i + 1, author, rating, date, text });
            });
            
            return extractedReviews;
        });
        
        console.log(`Извлечено из HTML: ${reviews.length} отзывов`);
    }
    
    await browser.close();
    return reviews;
}

async function main() {
    const orgId = process.argv[2] || '58302385598';
    
    try {
        const reviews = await getYandexReviewsViaAPI(orgId);
        
        console.log(`\nВсего получено: ${reviews.length} отзывов`);
        
        const data = {
            lastUpdated: new Date().toISOString(),
            orgId: orgId,
            totalReviews: reviews.length,
            reviews: reviews
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
            console.log('\nПоследние 5 отзывов:');
            reviews.slice(-5).reverse().forEach(r => {
                console.log(`${r.author} | ${r.rating}⭐ | ${r.date}`);
            });
        }
        
    } catch (e) {
        console.error('Ошибка:', e.message);
        process.exit(1);
    }
}

main();
